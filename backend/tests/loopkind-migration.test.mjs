import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {createHmac} from 'node:crypto';
const ctx={version:1,bridgeApprovalId:'old-local',connector:'laptop',origin:{channel:'telegram',accountId:'fixture',chatId:'-10012',topicId:'47'},expiresAt:'2099-01-01T00:00:00Z'};
function wire(x){if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+wire(x[k])).join(',')+'}';return JSON.stringify(x)}
ctx.signature=createHmac('sha256','fixture').update(wire(ctx)).digest('hex');
const before=new Database('quill.db');before.exec(`CREATE TABLE approvals(id TEXT PRIMARY KEY,action TEXT NOT NULL,payload TEXT NOT NULL,status TEXT DEFAULT 'pending',created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP); CREATE TABLE audit_log(id TEXT PRIMARY KEY,approval_id TEXT,action TEXT NOT NULL,details TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
for(const state of ['running','completed'])before.prepare('INSERT INTO approvals(id,action,payload,status) VALUES (?,?,?,?)').run(state,'laptop_shell',JSON.stringify({connector:'laptop',summary:'old',details:{bridgeApprovalId:'old-local',lifecycle:ctx,executionStatus:state,executionResult:{ok:true}}}),'approved');
before.prepare('INSERT INTO audit_log(id,approval_id,action,details) VALUES (?,?,?,?)').run('audit','running','old','preserve exact bytes');before.close();
const {app}=await import(process.env.QUILL_TEST_BACKEND_MODULE);
function call(method,path,body={},params={},query={}){const l=app.router.stack.find(l=>l.route?.path===path&&l.route.methods[method]);const out={statusCode:200};l.route.stack[0].handle({body,params,query},{status(c){out.statusCode=c;return this},json(v){out.body=v;return this}});return out}
for(const bulk of [false,true])test(`v1 additive migration retains existing signed ${bulk?'bulk':'single'} cleanup and audit`,()=>{
 const id=bulk?'completed':'running';call('delete',bulk?'/api/approvals':'/api/approvals/:id',{}, {id});
 const r=call('get','/api/lifecycle/approvals',{}, {},{limit:'20'}).body;
 assert.ok(r.approvals.some(a=>a.id===id));assert.equal(call('get','/api/approvals/:id/audit',{}, {id:'running'}).body[0].details,'preserve exact bytes');
 const check=new Database('quill.db');assert.equal(check.prepare('SELECT version FROM quill_schema_migrations').get().version,1);check.close();
});
