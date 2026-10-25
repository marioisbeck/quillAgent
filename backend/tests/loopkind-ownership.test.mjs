import test from 'node:test';
import assert from 'node:assert/strict';
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
// Keep the RPC stdout JSON-only even if a dependency emits startup diagnostics.
console.log=(...args)=>console.error(...args);
const {app,requireApiKey}=await import(process.env.QUILL_TEST_BACKEND_MODULE);
function call({method,path,body={},params={},query={},key='fixture'}) {
 const req={body,params,query,header(name){return name.toLowerCase()==='x-quill-api-key'?key:undefined}};
 const out={statusCode:200};const res={status(c){out.statusCode=c;return this},json(v){out.body=v;return this}};
 let allowed=false;requireApiKey(req,res,()=>{allowed=true});if(!allowed)return out;
 const route=app.router.stack.find(l=>l.route?.path===path&&l.route.methods[method.toLowerCase()]);
 assert.ok(route,`Missing real handler ${method} ${path}`);
 route.route.stack[0].handle(req,res,e=>{if(e)throw e});return out;
}
const c=(method,path,body={},id)=>call({method,path,body,params:{id}});
function create(kind='gateway_parity',action='gateway_fixture',connector='gateway'){
 const card=c('post','/api/approvals',{action,payload:{connector,summary:'fixture',details:{kind,bridgeApprovalId:'local',resumeToken:'fixture-token',executionStatus:'pending'}}}).body;
 assert.equal(c('put','/api/approvals/:id',{status:'approved'},card.id).statusCode,200);return card;
}
function get(id){return c('get','/api/approvals/:id',{},id).body}
function guard(card,token=randomUUID().replaceAll('-','')){const d=card.payload.details;return {version:1,owner:'gateway_parity',token,identity:{connector:card.payload.connector,action:card.action,kind:d.kind??null,bridgeApprovalId:d.bridgeApprovalId,resumeToken:d.resumeToken}}}
function patch(id,status,g){return c('patch','/api/approvals/:id/execution',{executionStatus:status,...(g?{executionGuard:g}:{})},id)}
if(process.env.QUILL_OWNERSHIP_RPC==='1') {
 for await(const line of readline.createInterface({input:process.stdin})){
  try{process.stdout.write(JSON.stringify(call(JSON.parse(line)))+'\n')}catch(e){process.stdout.write(JSON.stringify({rpcError:String(e)})+'\n')}
 }
} else {
 test('stale pending owner fails atomic claim without changing execution/audit',()=>{
  const card=create(),g=guard(card);assert.equal(c('put','/api/approvals/:id',{status:'approved',manualEdit:{details:{kind:'server_codex'}}},card.id).statusCode,200);
  const before=c('get','/api/approvals/:id/audit',{},card.id).body;
  assert.equal(patch(card.id,'running',g).statusCode,409);assert.equal(get(card.id).payload.details.executionStatus,'pending');
  assert.deepEqual(c('get','/api/approvals/:id/audit',{},card.id).body,before);
 });
 test('server action, kind and connector cannot be claimed by forged gateway identity',()=>{
  for(const card of [create('server_codex'),create('gateway_parity','server_route_codex'),create('gateway_parity','fixture','mail')])assert.equal(patch(card.id,'running',guard(card)).statusCode,409);
 });
 test('claim locks ownership, local identity and execution metadata but allows harmless edits and decisions',()=>{
  const card=create(),g=guard(card);assert.equal(patch(card.id,'running',g).statusCode,200);
  for(const manualEdit of [{connector:'mail'},{details:{kind:'server_codex'}},{details:{bridgeApprovalId:'other'}},{details:{resumeToken:'other'}},{details:{executionStatus:'pending'}},{details:{executionClaim:null}}]){
   assert.equal(c('put','/api/approvals/:id',{status:'approved',manualEdit},card.id).statusCode,409);
  }
  assert.equal(c('put','/api/approvals/:id',{status:'rejected',manualEdit:{summary:'harmless',details:{note:'review'}}},card.id).statusCode,200);
  assert.equal(get(card.id).status,'rejected');assert.equal(get(card.id).payload.summary,'harmless');
 });
 test('claim/report token conflicts cannot overwrite owner, and same-token claim retry is idempotent',()=>{
  const card=create(),g=guard(card);assert.equal(patch(card.id,'running',g).statusCode,200);
  const audit=c('get','/api/approvals/:id/audit',{},card.id).body;
  assert.equal(patch(card.id,'running',g).statusCode,200);assert.deepEqual(c('get','/api/approvals/:id/audit',{},card.id).body,audit);
  assert.equal(patch(card.id,'running',guard(card)).statusCode,409);
  assert.equal(patch(card.id,'failed').statusCode,409);assert.equal(patch(card.id,'completed',guard(card)).statusCode,409);
  assert.equal(patch(card.id,'completed',g).statusCode,200);assert.equal(patch(card.id,'completed',g).statusCode,200);assert.equal(patch(card.id,'failed',g).statusCode,409);
  assert.equal(get(card.id).payload.details.executionStatus,'completed');
 });
 test('claim cannot be forged via create/manualEdit; unclaimed legacy callers retain reports',()=>{
  const forged=c('post','/api/approvals',{action:'fixture',payload:{connector:'gateway',summary:'fixture',details:{executionClaim:{token:'forged'}}}});assert.equal(forged.statusCode,400);
  const card=create();assert.equal(c('put','/api/approvals/:id',{status:'approved',manualEdit:{details:{executionClaim:{token:'forged'}}}},card.id).statusCode,409);
  for(const connector of ['calendar','mail','laptop','gateway']){const old=create('fixture','fixture',connector);assert.equal(patch(old.id,'running').statusCode,200);assert.equal(patch(old.id,'completed').statusCode,200)}
 });
 test('malformed guard values fail closed without execution mutations',()=>{
  const card=create();for(const g of [null,{}, {...guard(card),identity:null},{...guard(card),owner:'server'},{...guard(card),token:'bad'}])assert.equal(c('patch','/api/approvals/:id/execution',{executionStatus:'running',executionGuard:g},card.id).statusCode,409);
  assert.equal(get(card.id).payload.details.executionStatus,'pending');
 });
 test('guard path requires real API authentication and non-approved cannot claim',()=>{
  const card=create();assert.equal(call({method:'patch',path:'/api/approvals/:id/execution',params:{id:card.id},body:{executionStatus:'running',executionGuard:guard(card)},key:''}).statusCode,401);
  c('put','/api/approvals/:id',{status:'pending'},card.id);assert.equal(patch(card.id,'running',guard(card)).statusCode,409);
 });
}
