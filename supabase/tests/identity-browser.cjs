'use strict';
// Real Portal Auth adapter, write guard, Store and SDK against loopback services.
// Only environment admission and the already-authorized sandbox confirmation are fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
assert.ok(process.argv.includes('--authorized-local-identity'),'Explicit local identity authorization required');
const root=path.resolve(__dirname,'../..'),dir=path.join(os.tmpdir(),'dv-portal-identity-20261025');
const user=JSON.parse(fs.readFileSync(path.join(dir,'browser-user.json'),'utf8'));
const origin='http://127.0.0.1:55454',AUTH='http://127.0.0.1:55451',REST='http://127.0.0.1:55452',MAIL='http://127.0.0.1:55453';
const sdk=path.join(os.tmpdir(),'dv-portal-h10-2795554/supabase-2.118.0.min.js');
assert.equal(crypto.createHash('sha384').update(fs.readFileSync(sdk)).digest('base64'),'UagCvVPT5XXA0Hx+nJYUAGBFseHT9zBgpJMSebsAxl9lciTwbT+39j5VfRjdP5Tp');
const routes=new Map([['/sdk.js',sdk],...['app/environment.js','app/atomic-mutations.js','app/write-guard.js','app/supabase.js','app/store.js','data/empty-state.js'].map(f=>['/'+f,path.join(root,f)])]);
const config=`window.DV_SUPA=${JSON.stringify({URL:origin,ANON:user.anon})};
const config={configVersion:'LOCAL-IDENTITY',environmentId:'LOCAL-IDENTITY',backendId:'LOCAL-IDENTITY',backendClass:'sandbox',writePolicy:'rls',features:{}};
window.DVEnv={STATES:{LIVE:'LIVE'},state:()=> 'SANDBOX',isDemo:()=>false,isBackend:()=>true,fingerprint:()=> 'LOCAL-IDENTITY',
 resolution:()=>({state:'SANDBOX',originClass:'LOCAL',fingerprint:'LOCAL-IDENTITY',config}),
 storage:DVEnvCore.scopedStorage(localStorage,'LOCAL-IDENTITY'),storageKey:k=>DVEnvCore.scopedStorage(localStorage,'LOCAL-IDENTITY').keyFor(k),
 validateSession:()=>({ok:true}),subscribe:()=>{}};
window.DVEnvironmentIndicator={handleGuardOutcome:(r,h)=>r.outcome==='CONFIRM_SANDBOX'?h.confirm():r};`;
const html='<!doctype html><title>Isolated Portal Auth integration</title><div id="app"></div><div id="viewHost"></div>'+
 '<script src="/sdk.js"></script><script src="/app/environment.js"></script><script>'+config+'</script>'+
 ['data/empty-state.js','app/atomic-mutations.js','app/write-guard.js','app/supabase.js','app/store.js'].map(f=>'<script src="/'+f+'"></script>').join('')+
 '<script>window.ready=DVSupa.client();</script>';
let otpRequests=0,pkceExchanges=0;const checks=[];function pass(s){checks.push(s);console.log('PASS '+s);}
const proxy=http.createServer(async(req,res)=>{
 try{
  const route=new URL(req.url,origin).pathname;
  if(route==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end(html);return;}
  if(routes.has(route)){res.writeHead(200,{'Content-Type':'text/javascript'}).end(fs.readFileSync(routes.get(route)));return;}
  const auth=route.startsWith('/auth/v1/'),rest=route.startsWith('/rest/v1/');
  if(!auth&&!rest){res.writeHead(404).end();return;}
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
  if(route==='/auth/v1/otp')otpRequests++;
  if(route==='/auth/v1/token'&&new URL(req.url,origin).searchParams.get('grant_type')==='pkce')pkceExchanges++;
  const headers={...req.headers};delete headers.host;delete headers['content-length'];
  const r=await fetch((auth?AUTH:REST)+req.url.slice(8),{method:req.method,headers,redirect:'manual',signal:AbortSignal.timeout(15000),body:['GET','HEAD'].includes(req.method)?undefined:body});
  res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'application/json','Cache-Control':'no-store'}).end(Buffer.from(await r.arrayBuffer()));
 }catch{res.writeHead(502).end();}
});
async function link(){
 for(let n=0;n<30;n++){
  const list=await (await fetch(MAIL+'/api/v1/messages')).json();
  for(const item of list.messages.filter(m=>m.To?.some(t=>t.Address===user.email))){
   const msg=await (await fetch(MAIL+'/api/v1/message/'+item.ID)).json();
   const found=(msg.HTML||msg.Text||'').match(/http:\/\/127\.0\.0\.1:55451\/verify\?[^"\s<]+/);
   if(found){const url=new URL(found[0].replaceAll('&amp;','&'));if(url.searchParams.get('type')==='magiclink')return url.href;}
  }
  await new Promise(r=>setTimeout(r,200));
 }
 throw new Error('LOCAL_MAGIC_LINK_NOT_RECEIVED');
}
async function enter(page){
 await page.waitForFunction(()=>!!window.DVSupa);
 await page.waitForFunction(async()=>!!await DVSupa.authUid(),{},{timeout:15000});
 return page.evaluate(async()=>{await DVSupa.hydrate();const uid=await DVSupa.authUid(),u=DV_SEED.users.find(x=>x.id===uid);if(!u||u.pending)throw new Error('NO_ACTIVE_PROFILE');DVStore.loginAs(u);return DVStore.accounts().length;});
}
(async()=>{
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(55454,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require(path.join(root,'node_modules/playwright'));
  browser=await chromium.launch({headless:true,executablePath:process.env.H10_BROWSER_PATH});const context=await browser.newContext();
  let blocked=0;
  await context.route('**/*',r=>{if([origin,AUTH].includes(new URL(r.request().url()).origin))return r.continue();blocked++;return r.abort();});
  const page=await context.newPage();await page.goto(origin+'/?code_hint=synthetic#synthetic');await page.evaluate(()=>ready);
  assert.equal(await page.evaluate(email=>DVSupa.signIn(email),user.email),true);
  assert.equal(otpRequests,1);
  const magic=await link();
  const redirect=await fetch(magic,{redirect:'manual'});assert.equal(redirect.status,303);
  const callback=new URL(redirect.headers.get('location'));assert.equal(callback.origin,origin);assert.ok(callback.searchParams.get('code'));
  // A different browser has no verifier: a copied PKCE link cannot open a session.
  const outsider=await browser.newContext();await outsider.route('**/*',r=>[origin,AUTH].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
  const wrong=await outsider.newPage();
  // Use the actual valid callback, not an invalid synthetic authorization code.
  await wrong.goto(callback.href);await wrong.evaluate(()=>ready);
  assert.equal(await wrong.evaluate(()=>DVSupa.authUid()),null);await outsider.close();
  await page.goto(callback.href);assert.equal(await enter(page),1);
  assert.ok(pkceExchanges>=1,'actual verifier exchange required');
  assert.equal(new URL(page.url()).search,'');assert.equal(new URL(page.url()).hash,'');
  pass('Portal adapter requests a real PKCE magic link; callback exchange hydrates only its tenant');
  pass('Callback without a verifier cannot authenticate; completed callback retains no code or fragment');
  const second=await context.newPage();await second.goto(origin);assert.equal(await enter(second),1);
  assert.equal(await page.evaluate(async()=>!(await (await DVSupa.client()).auth.refreshSession()).error),true);
  assert.equal(await enter(page),1);
  pass('Real SDK session and token refresh work with the Portal Store in two browser pages');
  assert.equal(await page.evaluate(()=>DVSupa.signOut()),true);
  await second.waitForFunction(()=>DVStore.session()===null);
  for(const p of [page,second]){
   assert.equal(await p.evaluate(()=>DVSupa.authUid()),null);
   assert.equal(await p.evaluate(()=>DV_SEED.accounts.length),0);
  }
  pass('Provider sign-out clears Auth, business data and Store in both pages');
  const before=(await (await fetch(MAIL+'/api/v1/messages')).json()).total;
  assert.equal(await page.evaluate(async()=>{try{await DVSupa.signIn('never-provisioned@synthetic.invalid');return false;}catch{return true;}}),true);
  assert.equal((await (await fetch(MAIL+'/api/v1/messages')).json()).total,before);
  pass('Unknown email cannot create a user or dispatch a sign-in email through the Portal');
  assert.equal(blocked,0,'No external browser requests');
  fs.writeFileSync(path.join(root,'evidence/identity-auth-20261025/browser-results.json'),JSON.stringify({date:new Date().toISOString(),scope:'Real adapter/guard/Store/SDK; local environment and sandbox confirmation fixtures; no full UI or hosted OAuth claim',sdk:'2.118.0',checks,otpRequests,pkceExchanges,externalRequests:blocked},null,2)+'\n');
 }finally{if(browser)await browser.close();await new Promise(r=>proxy.close(r));}
})().catch(e=>{console.error('IDENTITY_BROWSER_TEST_FAILED: '+String(e.message).replace(/https?:\/\/\S+/g,'[local URL redacted]').slice(0,300));process.exitCode=1;});
