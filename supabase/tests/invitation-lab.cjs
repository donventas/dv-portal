'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),dir=path.join(os.tmpdir(),'dv-portal-identity-20261025');
const AUTH='http://127.0.0.1:55451',REST='http://127.0.0.1:55452',MAIL='http://127.0.0.1:55453',origin='http://127.0.0.1:55454';
function sql(query){return cp.execFileSync(path.join(process.env.LOCALAPPDATA,'Programs/Podman/podman.exe'),['--connection','dv-portal-h1','exec','-i','dv-identity-db','psql','-X','-qAt','-h','127.0.0.1','-U','supabase_admin','-d','portal_h10_disposable','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();}
function keys(){const key=JSON.parse(fs.readFileSync(path.join(dir,'private.json'),'utf8')).jwtKey;return role=>{const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),raw=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});return raw+'.'+crypto.createHmac('sha256',key).update(raw).digest('base64url');};}
async function api(base,route,{token,method='GET',body,headers={}}={}){const r=await fetch(base+route,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null),location:r.headers.get('location')};}
function ok(r,status,label){assert.equal(r.status,status,label+' '+(r.data?.message||r.data?.error||''));return r.data;}
async function mailLink(email){for(let n=0;n<30;n++){const list=ok(await api(MAIL,'/api/v1/messages'),200,'inbox');const item=list.messages.find(m=>m.To?.some(t=>t.Address===email));if(item){const msg=ok(await api(MAIL,'/api/v1/message/'+item.ID),200,'mail');const found=(msg.HTML||msg.Text||'').match(/http:\/\/127\.0\.0\.1:55451\/verify\?[^"\s<]+/);if(found)return new URL(found[0].replaceAll('&amp;','&'));}await new Promise(r=>setTimeout(r,200));}throw new Error('LOCAL_MAIL_MISSING');}
async function signup(email){const credential=crypto.randomBytes(24).toString('base64url');const u=ok(await api(AUTH,'/signup',{method:'POST',body:{email,password:credential}}),200,'signup'),link=await mailLink(email);const session=ok(await api(AUTH,'/verify',{method:'POST',body:{type:link.searchParams.get('type'),token_hash:link.searchParams.get('token')}}),200,'verify');return {id:u.id||u.user.id,email,credential,session};}
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/,'').toUpperCase())bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(x=>parseInt(x,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=crypto.createHmac('sha1',key).update(counter).digest(),o=h[h.length-1]&15;return ((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function start({service,anon,transport=fetch}) {
 const {createInvitationHandler}=require('../../server/invitations.cjs');
 const handler=createInvitationHandler({authUrl:AUTH,restUrl:REST,serviceKey:service,origin,transport});
 const sdk=fs.readFileSync(path.join(os.tmpdir(),'dv-portal-h10-2795554/supabase-2.118.0.min.js'));
 assert.equal(crypto.createHash('sha384').update(sdk).digest('base64'),'UagCvVPT5XXA0Hx+nJYUAGBFseHT9zBgpJMSebsAxl9lciTwbT+39j5VfRjdP5Tp');
 const config={schemaVersion:'CONFIG_SCHEMA_V1',configVersion:'INVITATION_LOCAL',environmentId:'INVITATION_LOCAL',declaredMode:'SANDBOX',backendId:'LOCAL_IDENTITY',backendClass:'sandbox',allowlistVersion:'LOCAL_ONLY',issuedAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),buildCommit:'LOCAL_REVIEW',publicClient:{endpoint:origin,publicKey:anon}};
 const binding={origins:[origin],backendIds:['LOCAL_IDENTITY'],observedBackendId:'LOCAL_IDENTITY',bindingCount:1,localHosts:['127.0.0.1']};
 const boot='<script>window.DV_PORTAL_RELEASE_CONFIG='+JSON.stringify(config)+';window.DV_PORTAL_RELEASE_BINDING='+JSON.stringify(binding)+';</script><script src="/local-sdk.js"></script>';
 const admission='<script>if(DVEnv.state()==="SANDBOX"&&location.hostname==="127.0.0.1")DVEnv.resolution().config.features=Object.freeze({identityInvitations:"isolated-v1"});</script>';
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
 const server=http.createServer(async(req,res)=>{try{
  if(req.headers.host!==new URL(origin).host){res.writeHead(403).end();return;}
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/admin/invitations')return handler(req,res);
  if(url.pathname==='/local-sdk.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(sdk);return;}
  if(url.pathname.startsWith('/auth/v1/')||url.pathname.startsWith('/rest/v1/')){
   const chunks=[];for await(const c of req)chunks.push(c);const headers={...req.headers};delete headers.host;delete headers['content-length'];
   const r=await fetch((url.pathname.startsWith('/auth/')?AUTH:REST)+req.url.slice(8),{method:req.method,headers,redirect:'manual',body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
   res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'application/json','Cache-Control':'no-store'}).end(Buffer.from(await r.arrayBuffer()));return;
  }
  const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)),file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!(/^(app|data|brand|dv-shared)\//.test(relative)||['index.html','favicon.svg','og-portal.png'].includes(relative))||!types[path.extname(file)]){res.writeHead(403).end();return;}
  let content=fs.readFileSync(file);
  if(relative==='index.html')content=content.toString().replace('<script src="app/release-config.js">',boot+'<script src="app/release-config.js">').replace('<script src="app/write-guard.js">',admission+'<script src="app/write-guard.js">');
  res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(content);
 }catch{res.writeHead(500).end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(55454,'127.0.0.1',resolve);});return server;
}
module.exports={root,dir,AUTH,REST,MAIL,origin,sql,keys,api,ok,mailLink,signup,totp,start};
