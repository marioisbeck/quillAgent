import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const {app,requireApiKey} = await import(process.env.QUILL_TEST_BACKEND_MODULE);
function wire(x){if(Array.isArray(x))return '['+x.map(wire).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+wire(x[k])).join(',')+'}';return JSON.stringify(x)}
function call(method,path,body={},params={},query={}){const l=app.router.stack.find(l=>l.route?.path===path&&l.route.methods[method]);assert.ok(l,`missing ${method} ${path}`);const out={statusCode:200};l.route.stack[0].handle({body,params,query,header(){return 'fixture'}},{status(c){out.statusCode=c;return this},json(v){out.body=v;return this}},e=>{if(e)throw e});return out}
function create(name,lifecycle=true){const ctx={version:1,origin:{channel:'telegram',accountId:'fixture',chatId:'-10012',topicId:'47'},task:'Laptop command',connector:'laptop',bridgeApprovalId:name,expiresAt:'2099-01-01T00:00:00Z'};ctx.signature=createHmac('sha256','fixture').update(wire(ctx)).digest('hex');return call('post','/api/approvals',{action:'laptop_shell',payload:{connector:'laptop',summary:'fixture',details:{bridgeApprovalId:name,executionStatus:'pending',...(lifecycle?{lifecycle:ctx}:{})}}}).body}
function decide(id,status='approved'){return call('put','/api/approvals/:id',{status},{id})}
function execution(id,status,result={ok:true}){return call('patch','/api/approvals/:id/execution',{executionStatus:status,executionResult:result},{id})}
function retained(){return call('get','/api/lifecycle/approvals',{}, {},{limit:'500'}).body.approvals}
function settle(c,phase){return call('post','/api/approvals/:id/feedback',{generation:c.feedbackGeneration,contextSignature:c.payload.details.lifecycle.signature,phase,messageId:'123'},{id:c.id})}
for(const bulk of [false,true])for(const state of ['running','completed'])test(`${bulk?'bulk':'single'} cleanup hides but retains ${state}, late terminal and settlement durable`,()=>{
 const c=create(`${bulk}-${state}`);decide(c.id);execution(c.id,state);
 assert.equal(call('delete',bulk?'/api/approvals':'/api/approvals/:id',{}, {id:c.id}).statusCode,200);
 assert.ok(!call('get','/api/approvals').body.some(a=>a.id===c.id));
 assert.equal(execution(c.id,'completed').statusCode,200);
 assert.ok(retained().some(a=>a.id===c.id));assert.ok(call('get','/api/approvals/:id/audit',{}, {id:c.id}).body.length>0);
 const current=retained().find(a=>a.id===c.id);assert.equal(settle(current,'completed').statusCode,409);
 assert.equal(settle(current,'approved').statusCode,200);assert.equal(settle(current,'approved').statusCode,200);
 assert.ok(retained().some(a=>a.id===c.id));assert.equal(settle(current,'completed').statusCode,200);
 assert.equal(settle(current,'completed').statusCode,200);
 assert.equal(call('get','/api/approvals/:id',{}, {id:c.id}).statusCode,404);
});
test('pending guard, legacy physical removal and bounded retained pages',()=>{
 const p=create('pending');assert.equal(call('delete','/api/approvals/:id',{}, {id:p.id}).statusCode,409);
 const legacy=create('legacy',false);decide(legacy.id);call('delete','/api/approvals/:id',{}, {id:legacy.id});assert.equal(call('get','/api/approvals/:id',{}, {id:legacy.id}).statusCode,404);
 create('another-pending');const r=call('get','/api/lifecycle/approvals',{}, {},{limit:'1'});assert.equal(r.body.approvals.length,1);assert.ok(r.body.nextCursor);assert.equal(call('get','/api/lifecycle/approvals',{}, {},{limit:'501'}).statusCode,400);
});
test('unknown, dispatch, reversal and mismatched generation/route cannot settle',()=>{
 for(const state of ['running','completed']){
 const c=create('hold-'+state);decide(c.id);execution(c.id,state,{state:'dispatched',job_id:'owned'});call('delete','/api/approvals/:id',{}, {id:c.id});
 let r=retained().find(a=>a.id===c.id);assert.equal(settle(r,'completed').statusCode,409);
 assert.equal(settle({...r,feedbackGeneration:'wrong'},'approved').statusCode,409);
 assert.equal(settle({...r,payload:{details:{lifecycle:{signature:'wrong'}}}},'approved').statusCode,409);
 execution(c.id,'completed',{passed:false});r=retained().find(a=>a.id===c.id);assert.equal(settle(r,'completed').statusCode,409);
 decide(c.id,'rejected');r=retained().find(a=>a.id===c.id);assert.equal(settle(r,'rejected').statusCode,409);
 assert.ok(retained().some(a=>a.id===c.id));
 }
});
test('manual editing lifecycle cannot replace enrolled frozen identity',()=>{
 const c=create('frozen');assert.equal(call('put','/api/approvals/:id',{status:'approved',manualEdit:{details:{lifecycle:{version:1,signature:'wrong'}}}},{id:c.id}).statusCode,409);
});
test('feedback and retained path share mandatory API middleware',()=>{
 let next=false,code=200;requireApiKey({header(){return undefined}},{status(c){code=c;return this},json(){return this}},()=>{next=true});assert.equal(code,401);assert.equal(next,false);
 assert.ok(app.router.stack.some(l=>l.handle===requireApiKey));
});

for (const bulk of [false,true]) for (const state of ['running','completed']) test(`legacy ${bulk?'bulk':'single'} ${state} keeps physical-delete behavior`,()=>{
 const c=create('legacy-'+bulk+'-'+state,false);decide(c.id);execution(c.id,state);
 call('delete',bulk?'/api/approvals':'/api/approvals/:id',{}, {id:c.id});
 assert.equal(call('get','/api/approvals/:id',{}, {id:c.id}).statusCode,404);
});
test('hidden approved pending records remain available to bounded executor consumer',()=>{
 const c=create('hidden-pending');decide(c.id);call('delete','/api/approvals/:id',{}, {id:c.id});
 const query={status:'approved',connector:'laptop',executionStatus:'pending',limit:'100'};
 assert.ok(call('get','/api/lifecycle/execution',{}, {},query).body.some(a=>a.id===c.id));
 assert.equal(call('get','/api/lifecycle/execution').statusCode,400);
});
for (const bulk of [false,true]) for (const unknown of [false,true]) test(`real observer ${bulk?'bulk':'single'} hidden terminal ${unknown?'unknown held':'confirmed settlement'}`,()=>{
 const c=create('observer-'+bulk+'-'+unknown);decide(c.id);execution(c.id,'completed');call('delete',bulk?'/api/approvals':'/api/approvals/:id',{}, {id:c.id});
 const snapshot=retained().find(a=>a.id===c.id);
 const program=`import sys,json,tempfile
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from quill_core.lifecycle import Outbox
from quill_lifecycle_watch import run_once
card=json.load(sys.stdin);receipts=[];sends=[]
class Backend:
 def request(self,path,method='GET',payload=None):
  if method=='POST':receipts.append((path,payload));return {'success':True}
  return [] if path=='/approvals' else {'approvals':[card],'nextCursor':None}
def send(route,body):
 sends.append((route,body))
 if sys.argv[2]=='true':raise TimeoutError('unknown')
 return {'ok':True,'result':{'message_id':len(sends),'chat':{'id':route['chatId']},'message_thread_id':route['topicId']}}
with tempfile.TemporaryDirectory() as tmp:
 box=Outbox(Path(tmp)/'outbox','fixture');run_once(Backend(),box,send);box=Outbox(box.path,'fixture');run_once(Backend(),box,send)
 print(json.dumps({'receipts':receipts,'sends':sends,'held':box.held()}))`;
 const py=spawnSync('python3',['-c',program,process.env.QUILL_TEST_SERVER_SCRIPTS,String(unknown)],{input:JSON.stringify(snapshot),encoding:'utf8'});
 assert.equal(py.status,0,py.stderr);const data=JSON.parse(py.stdout);
 if(unknown){assert.equal(data.receipts.length,0);assert.equal(data.sends.length,1);assert.ok(data.held.length)}
 else {assert.equal(data.sends.length,2);for(const [path,body] of data.receipts)assert.equal(call('post','/api/approvals/:id/feedback',body,{id:c.id}).statusCode,200)}
 assert.equal(retained().some(a=>a.id===c.id),unknown);
});
