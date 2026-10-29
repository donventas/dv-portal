'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {root,jwt}=require('./h12-workflow-local.cjs'),origin='http://127.0.0.1:55474';
function createServer(){return http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!=='127.0.0.1:55474'||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403).end();return;}
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/auth/v1/')||url.pathname.startsWith('/rest/v1/')){
   const auth=url.pathname.startsWith('/auth/v1/');
   if(req.method!=='POST'||auth&&!['/auth/v1/token','/auth/v1/logout'].includes(url.pathname)||!auth&&!['/rest/v1/rpc/portal_workflow_v1','/rest/v1/rpc/portal_draft_open_v1'].includes(url.pathname)){res.writeHead(403).end();return;}
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>100000){res.writeHead(413).end();return;}chunks.push(chunk);}
   const reply=await fetch((auth?'http://127.0.0.1:55461':'http://127.0.0.1:55462')+req.url.slice(8),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:req.headers.authorization||'Bearer '+jwt({role:'anon'})},body:Buffer.concat(chunks)});
   res.writeHead(reply.status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(Buffer.from(await reply.arrayBuffer()));return;
  }
  const relative=url.pathname==='/'?'tests/workflow-harness.html':decodeURIComponent(url.pathname.slice(1));
  const allow=['app/hybrid-demo.js','tests/workflow-harness.html','tests/workflow-harness.js','app/workflow-ui.js','app/workflow.css','app/brand-tokens.css','brand/appearance/bootstrap.js','brand/appearance/controller.js','brand/appearance/appearance.css','brand/fonts/schibsted-grotesk-latin-normal.woff2','brand/fonts/space-mono-latin-400.woff2','brand/fonts/space-mono-latin-700.woff2','brand/donventas-wordmark-b6.svg','brand/donventas-wordmark-b6-reverse.svg'];
  if(req.method!=='GET'||!allow.includes(relative)){res.writeHead(404).end();return;}
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};
  res.writeHead(200,{'Content-Type':types[path.extname(relative)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"}).end(fs.readFileSync(path.join(root,relative)));
 }catch{res.writeHead(502).end();}
});}
module.exports={createServer,origin};
if(require.main===module){if(!process.argv.includes('--authorized-local-h12'))throw Error('LOCAL_AUTHORIZATION_REQUIRED');createServer().listen(55474,'127.0.0.1',()=>console.log('Workflow lab: '+origin));}
