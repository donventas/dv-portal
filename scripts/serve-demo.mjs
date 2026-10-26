// Explicit local DEMO launcher. Never writes release config or calls a provider.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.DV_DEMO_PORT||8011);
const origin='http://127.0.0.1:'+port;
const config={schemaVersion:'CONFIG_SCHEMA_V1',configVersion:'H11_LOCAL',environmentId:'H11_LOCAL_DEMO',declaredMode:'DEMO',backendId:'',backendClass:'none',allowlistVersion:'LOCAL_ONLY',issuedAt:'2026-01-01T00:00:00Z',expiresAt:'2027-01-01T00:00:00Z',buildCommit:'LOCAL_REVIEW',publicClient:{endpoint:'',publicKey:''}};
const binding={origins:[origin],backendIds:[],observedBackendId:'',bindingCount:1,localHosts:['127.0.0.1']};
const boot='<script>window.DV_PORTAL_RELEASE_CONFIG='+JSON.stringify(config)+';window.DV_PORTAL_RELEASE_BINDING='+JSON.stringify(binding)+';</script>';
const start=`<script>let attempts=0;const timer=setInterval(()=>{if(++attempts>300)clearInterval(timer);if(window.DVPortal&&window.DVHybridDemo&&window.DVStore){clearInterval(timer);DVStore.loginAs(DV_SEED.users.find(u=>u.role==='cliente'));DVPortal.boot();DVPortal.go('hybrid');}},30);</script>`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
http.createServer((req,res)=>{
 try{
  if(req.headers.host!==new URL(origin).host){res.writeHead(403).end();return;}
  const url=new URL(req.url,origin),raw=decodeURIComponent(url.pathname);
  const relative=raw==='/'?'index.html':raw.slice(1),target=path.resolve(root,relative);
  if(!target.startsWith(root+path.sep)||!(/^(app|data|brand|dv-shared)\//.test(relative)||['index.html','favicon.svg','og-portal.png'].includes(relative))||!types[path.extname(target)]){res.writeHead(403).end();return;}
  let content=fs.readFileSync(target);
  if(relative==='index.html')content=content.toString().replace('<script src="app/release-config.js">',boot+'<script src="app/release-config.js">').replace('</body>',start+'</body>');
  res.writeHead(200,{'Content-Type':types[path.extname(target)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"});res.end(content);
 }catch(_){res.writeHead(404).end();}
}).listen(port,'127.0.0.1',()=>console.log('Local synthetic DEMO: '+origin));
