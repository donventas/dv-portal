'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),readline=require('node:readline'),crypto=require('node:crypto');
const L=require('./h12-workflow-local.cjs'),{simulate}=require('../../server/review-simulator.cjs'),{verifyCaptureOnly,captureOne}=require('../../server/review-mail-capture.cjs');
assert.ok(process.argv.includes('--authorized-local-h12'));
async function run(){
 const fixture=JSON.parse(fs.readFileSync(path.join(L.dir,'workflow-users.json'))),{owner}=fixture;
 owner.token=(await L.api('auth','/token?grant_type=password',L.jwt({role:'anon'}),{email:owner.email,password:owner.credential})).data.access_token;
 const req=await L.api('rest','/rpc/portal_workflow_v1',owner.token,{p_action:'submit',p_key:crypto.randomUUID(),p_data:{version:3,assets:[],consent:'review-v1'}});assert.equal(req.status,200);
 const child=cp.spawn(process.execPath,[path.join(L.root,'server/review-mcp.cjs'),'--authorized-local-h12'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const pending=new Map();let count=0;const errors=[];child.stderr.on('data',d=>errors.push(String(d)));
 const lines=readline.createInterface({input:child.stdout});lines.on('line',line=>{const m=JSON.parse(line);pending.get(m.id)?.(m);pending.delete(m.id);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++count,timer=setTimeout(()=>reject(Error('MCP_TIMEOUT')),15000);pending.set(id,m=>{clearTimeout(timer);resolve(m);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
 try{
  const init=await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'dv-synthetic-test',version:'1'}});assert.equal(init.result.protocolVersion,'2025-06-18');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  assert.equal((await call('tools/list')).result.tools.length,4);
  assert.ok((await call('tools/call',{name:'publish',arguments:{}})).error);
  const take=await call('tools/call',{name:'take_request',arguments:{}});assert.equal(take.result.isError,false);
  const job=JSON.parse(take.result.content[0].text);assert.equal(job.requestId,req.data.id);
  const completed=await call('tools/call',{name:'complete_review',arguments:{requestId:job.requestId,lease:job.lease,result:simulate(job)}});assert.equal(completed.result.isError,false);
  const late=L.worker('claim');assert.equal(late.job,null);
 }finally{child.stdin.end();await new Promise(r=>child.once('exit',r));}
 verifyCaptureOnly();
 const failed=await captureOne(async()=>{throw Error('Synthetic transport failure');});assert.equal(failed.uncertain,true);
 let captures=0;for(let i=0;i<100;i++){const item=await captureOne();if(item.mail===null)break;assert.notEqual(item.id,failed.id);if(item.captured)captures++;}
 assert.ok(captures>0);
 assert.equal(L.sql(`select mail_state from public.portal_request_notice where id=${failed.id};`),'uncertain');
 const messages=await (await fetch('http://127.0.0.1:55463/api/v1/search?query=tag:h12-workflow&limit=100')).json();assert.ok(messages.messages.length>0);
 assert.ok(messages.messages.every(m=>m.To.every(to=>to.Address.endsWith('@synthetic.invalid'))));
 const report={status:'PASS',date:new Date().toISOString(),mcp:'stdio initialized, tools discovered, leased request completed through simulator',email:{captured:captures,uncertainFailureNotRetried:true,syntheticRecipientsOnly:true},noRealModel:true,noProduction:true};
 fs.writeFileSync(path.join(L.root,'evidence/h12-workflow/worker-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
