'use strict';
// Fixed local endpoints. Never accept a database host, DSN or URL from caller input.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(os.tmpdir(),'dv-portal-h12-drafts');
const podman=path.join(process.env.LOCALAPPDATA,'Programs/Podman/podman.exe');
function sql(input){
 try{return cp.execFileSync(podman,['--connection','dv-portal-h1','exec','-i','dv-h12-db','psql','-X','-qAt','-h','127.0.0.1','-U','supabase_admin','-d','portal_h10_disposable','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();}
 catch(e){throw Error('LOCAL_WORKFLOW_SQL: '+String(e.stderr||'').replace(/\r?\nCONTEXT:[\s\S]*/,'').slice(0,450));}
}
function literal(value){return "'"+String(value).replaceAll("'","''")+"'";}
function jwt(claims){const secret=JSON.parse(fs.readFileSync(path.join(dir,'private.json'))).jwtKey,b=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),s=b({alg:'HS256',typ:'JWT'})+'.'+b({iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...claims});return s+'.'+crypto.createHmac('sha256',secret).update(s).digest('base64url');}
async function api(kind,route,token,body,method='POST'){
 const base=kind==='auth'?'http://127.0.0.1:55461':'http://127.0.0.1:55462';
 const r=await fetch(base+route,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json().catch(()=>null)};
}
function worker(action,id=null,lease=null,result=null){
 const uuid=v=>v===null?'null':literal(v)+'::uuid';
 return JSON.parse(sql(`select auth_dv.review_worker(${literal(action)},${uuid(id)},${uuid(lease)},${result===null?'null':literal(JSON.stringify(result))+'::jsonb'});`));
}
module.exports={root,dir,sql,literal,jwt,api,worker};
