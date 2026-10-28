'use strict';
// Fixed loopback-only transport for the isolated provider; never a deployment server.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),origin='http://127.0.0.1:55464';
function createServer(anon,port=55464){
 assert.ok([55464,55475,55476,55477,55478].includes(port),'LOCAL_PORT_NOT_ALLOWED');
 const origin='http://127.0.0.1:'+port;
 const sdk=path.join(os.tmpdir(),'dv-portal-h10-2795554/supabase-2.118.0.min.js');
 assert.equal(crypto.createHash('sha384').update(fs.readFileSync(sdk)).digest('base64'),'UagCvVPT5XXA0Hx+nJYUAGBFseHT9zBgpJMSebsAxl9lciTwbT+39j5VfRjdP5Tp');
 const config={schemaVersion:'CONFIG_SCHEMA_V1',configVersion:'H12_ISOLATED_V1',environmentId:'H12_ISOLATED',declaredMode:'SANDBOX',backendId:'H12_LOCAL',backendClass:'sandbox',allowlistVersion:'LOCAL_ONLY',issuedAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),buildCommit:'LOCAL_UNCOMMITTED',publicClient:{endpoint:origin,publicKey:anon},h12Drafts:'isolated-v1'};
 const binding={origins:[origin],backendIds:['H12_LOCAL'],observedBackendId:'H12_LOCAL',bindingCount:1,localHosts:['127.0.0.1']};
 const boot='<script src="/local-sdk.js"></script><script>window.DV_PORTAL_RELEASE_CONFIG='+JSON.stringify(config)+';window.DV_PORTAL_RELEASE_BINDING='+JSON.stringify(binding)+';</script>';
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
 return http.createServer(async(req,res)=>{
  try{
   if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403).end();return;}
   const u=new URL(req.url,origin),auth=u.pathname.startsWith('/auth/v1/'),rest=u.pathname.startsWith('/rest/v1/');
   if(auth||rest){
    const limit=['/rest/v1/rpc/portal_draft_asset_put_v1','/rest/v1/rpc/portal_delivery_file_v1','/rest/v1/rpc/portal_professional_v1'].includes(u.pathname)?6000000:120000;
    const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>limit){res.writeHead(413).end();return;}chunks.push(c);}
    const headers={};for(const k of ['authorization','apikey','content-type','prefer','x-client-info'])if(req.headers[k])headers[k]=req.headers[k];
    const r=await fetch((auth?'http://127.0.0.1:55461':'http://127.0.0.1:55462')+req.url.slice(8),{method:req.method,headers,redirect:'manual',signal:AbortSignal.timeout(20000),body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
    res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'application/json','Cache-Control':'no-store'}).end(Buffer.from(await r.arrayBuffer()));return;
   }
   if(req.method!=='GET'){res.writeHead(405).end();return;}
   const relative=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1)),file=path.resolve(root,relative);
   const sdkRequest=relative==='local-sdk.js';
   if(!sdkRequest&&(!file.startsWith(root+path.sep)||!(/^(app|data|brand|dv-shared)\//.test(relative)||['index.html','favicon.svg','og-portal.png'].includes(relative))||!types[path.extname(file)])){res.writeHead(403).end();return;}
   let content=fs.readFileSync(sdkRequest?sdk:file);
   if(relative==='index.html')content=content.toString().replace('<script src="app/release-config.js">',boot+'<script src="app/release-config.js">');
   res.writeHead(200,{'Content-Type':sdkRequest?'text/javascript':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"}).end(content);
  }catch{res.writeHead(502).end();}
 });
}
module.exports={createServer,origin};
if(require.main===module){
 assert.ok(process.argv.includes('--authorized-local-h12'));
 const user=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'dv-portal-h12-drafts/browser-users.json')));
 const port=Number(process.argv.find(a=>a.startsWith('--port='))?.slice(7)||55464);
 createServer(user.anon,port).listen(port,'127.0.0.1',()=>console.log('H1.2 isolated portal: http://127.0.0.1:'+port));
}
