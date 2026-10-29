'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
const {sql}=require('../supabase/tests/h12-workflow-local.cjs');
function verifyCaptureOnly(){
 const podman=path.join(process.env.LOCALAPPDATA,'Programs/Podman/podman.exe');
 const item=JSON.parse(cp.execFileSync(podman,['--connection','dv-portal-h1','inspect','dv-h12-mail'],{encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}))[0];
 const settings=JSON.stringify([item.Config.Env,item.Config.Cmd,item.Config.Entrypoint]);
 assert.ok(!/MP_SMTP_(RELAY|FORWARD)|smtp-(relay|forward)/i.test(settings),'Mailpit relay/forward must be absent');
}
async function captureOne(transport=fetch){
 const item=JSON.parse(sql('select auth_dv.review_mail();'));
 if(item.mail===null||item.suppressed)return item;
 assert.match(item.to,/^[a-zA-Z0-9._+-]+@synthetic\.invalid$/);
 try{
  const r=await transport('http://127.0.0.1:55463/api/v1/send',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},body:JSON.stringify({From:{Email:'portal@synthetic.invalid',Name:'Don Ventas · laboratorio'},To:[{Email:item.to}],Subject:item.subject,Text:item.text,Tags:['h12-workflow'],Headers:{'X-DV-Notice':String(item.id)}})});
  if(!r.ok)throw Error('CAPTURE_UNCONFIRMED');
  sql('select auth_dv.review_mail('+Number(item.id)+');');return {captured:true,id:item.id};
 }catch{return {uncertain:true,id:item.id};}
}
module.exports={verifyCaptureOnly,captureOne};
if(require.main===module)(async()=>{assert.ok(process.argv.includes('--authorized-local-h12'));verifyCaptureOnly();let count=0;for(let i=0;i<100;i++){const r=await captureOne();if(r.mail===null)break;if(r.captured)count++;}console.log(JSON.stringify({captured:count,scope:'Mailpit synthetic only'}));})().catch(e=>{console.error(e.message);process.exitCode=1;});
