'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process'),http=require('node:http');
assert.ok(process.argv.includes('--authorized-local-provider'),'Explicit local provider authorization required');
const AUTH='http://127.0.0.1:55441',REST='http://127.0.0.1:55442';
const root=path.resolve(__dirname,'../..'),tmp=path.join(os.tmpdir(),'dv-portal-h10-2795554');
function sql(query){return cp.execFileSync('podman',['--connection','dv-portal-h1','exec','-i','dv-portal-db','psql','-X','-At','-v','ON_ERROR_STOP=1','-U','portal_test_owner','-d','portal_h10_disposable'],{input:query,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();}
async function api(base,route,{token,method='GET',body}={}){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null)};}
const checks=[];function pass(label){checks.push(label);console.log('PASS '+label);}
(async()=>{
 assert.equal((await api(AUTH,'/health')).data.name,'GoTrue');
 assert.equal(sql('select current_database()'), 'portal_h10_disposable');
 assert.equal(sql('select count(*) from public.account'),'0','Fresh synthetic provider database required');
 const suffix=crypto.randomBytes(5).toString('hex'),password=crypto.randomBytes(24).toString('base64url');
 const emailA='owner-a-'+suffix+'@synthetic.invalid',emailB='owner-b-'+suffix+'@synthetic.invalid';
 const a=await api(AUTH,'/signup',{method:'POST',body:{email:emailA,password}}),b=await api(AUTH,'/signup',{method:'POST',body:{email:emailB,password}});
 assert.equal(a.status,200,'Synthetic signup A');assert.equal(b.status,200,'Synthetic signup B');
 const uidA=a.data.user.id,uidB=b.data.user.id;for(const id of [uidA,uidB])assert.match(id,/^[0-9a-f-]{36}$/);
 assert.equal((await api(AUTH,'/user',{token:a.data.access_token})).status,200);
 assert.equal(sql(`select pending from public.app_user where id='${uidA}'`),'t');
 pass('Actual GoTrue signup/user; new profile has no authority');
 const empty=await api(REST,'/account?select=id',{token:a.data.access_token});assert.equal(empty.status,200);assert.equal(empty.data.length,0);pass('Pending authenticated user sees zero accounts through PostgREST');
 // Explicit test-only provisioning of two synthetic owners; no email-based adoption.
 sql(`delete from public.app_user where id in ('${uidA}','${uidB}');`);
 const fixtures=fs.readFileSync(path.join(__dirname,'h10-fixtures.sql'),'utf8').replaceAll('20000000-0000-0000-0000-000000000001',uidA).replaceAll('20000000-0000-0000-0000-000000000002',uidB);
 sql(fixtures);
 const own=await api(REST,'/account?select=id',{token:a.data.access_token});assert.equal(own.data.length,1);assert.equal(own.data[0].id,'10000000-0000-0000-0000-000000000001');pass('Signed JWT maps to exactly one tenant');
 const forged=await api(REST,'/account?select=id',{token:a.data.access_token.slice(0,-8)+'invalidx'});assert.equal(forged.status,401);pass('Forged JWT rejected by real PostgREST');
 const escalation=await api(REST,'/app_user?id=eq.'+uidA,{token:a.data.access_token,method:'PATCH',body:{role:'admin'}});assert.equal(escalation.status,403);pass('Direct REST role escalation denied');
 const command={p_key:crypto.randomUUID(),p_kind:'approve',p_resource:'50000000-0000-0000-0000-000000000001',p_version:0,p_revision:'60000000-0000-0000-0000-000000000001',p_payload:{}};
 const cross=await api(REST,'/rpc/portal_command_v1',{token:b.data.access_token,method:'POST',body:command});assert.equal(cross.status,403);assert.equal(cross.data.message,'FORBIDDEN');
 const approved=await api(REST,'/rpc/portal_command_v1',{token:a.data.access_token,method:'POST',body:command});assert.equal(approved.status,200);assert.equal(approved.data.block.version,1);
 const replay=await api(REST,'/rpc/portal_command_v1',{token:a.data.access_token,method:'POST',body:command});assert.equal(replay.status,200);assert.deepEqual(replay.data,approved.data);pass('Real HTTP RPC: cross-tenant denied; own approval and replay canonical');
 const refresh=await api(AUTH,'/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:a.data.refresh_token}});assert.equal(refresh.status,200);assert.ok(refresh.data.access_token);pass('Actual refresh token rotation');
 sql(`update public.app_user set pending=true where id='${uidA}';`);
 assert.equal((await api(AUTH,'/user',{token:refresh.data.access_token})).status,200,'JWT remains authenticated');
 const revoked=await api(REST,'/account?select=id',{token:refresh.data.access_token});assert.equal(revoked.data.length,0);
 const deniedReplay=await api(REST,'/rpc/portal_command_v1',{token:refresh.data.access_token,method:'POST',body:command});assert.equal(deniedReplay.status,403);assert.equal(deniedReplay.data.message,'ACTOR_REVOKED');pass('Still-valid real JWT loses business authority immediately after revocation');
 const logout=await api(AUTH,'/logout',{token:refresh.data.access_token,method:'POST'});assert.equal(logout.status,204);
 const oldRefresh=await api(AUTH,'/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh.data.refresh_token}});assert.equal(oldRefresh.status,400);pass('Provider logout prevents refresh reuse');
 // Exercise the actual browser SDK in two pages; proxy only the two local services.
 const proxy=http.createServer(async(req,res)=>{
  try{
   if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Local SDK test</title>');return;}
   const auth=req.url.startsWith('/auth/v1/'),rest=req.url.startsWith('/rest/v1/');if(!auth&&!rest){res.writeHead(404).end();return;}
   const chunks=[];for await(const c of req)chunks.push(c);
   const target=(auth?AUTH:REST)+req.url.slice(auth?8:8),headers={...req.headers};delete headers.host;delete headers['content-length'];
   const r=await fetch(target,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
   res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'application/json'});res.end(Buffer.from(await r.arrayBuffer()));
  }catch(_){res.writeHead(502).end();}
 });
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));let browser;
 try{
  const {chromium}=require(path.join(root,'node_modules/playwright'));
  browser=await chromium.launch({headless:true,executablePath:process.env.H10_BROWSER_PATH});const context=await browser.newContext();
  const origin='http://127.0.0.1:'+proxy.address().port;
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const pages=await Promise.all([context.newPage(),context.newPage()]);
  for(const p of pages){await p.goto(origin);await p.addScriptTag({path:path.join(tmp,'supabase-2.118.0.min.js')});await p.evaluate(({origin})=>{window.sdk=supabase.createClient(origin,'synthetic-public-test',{auth:{storageKey:'h10-sdk-local'}});window.signedOut=false;sdk.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')window.signedOut=true;});},{origin});}
  const login=await pages[0].evaluate(async({email,password})=>{const r=await sdk.auth.signInWithPassword({email,password});return !r.error;},{email:emailB,password});assert.equal(login,true);
  await pages[1].waitForFunction(async()=>!!(await sdk.auth.getSession()).data.session);
  assert.equal(await pages[1].evaluate(async()=>!(await sdk.auth.getUser()).error),true);
  assert.equal(await pages[0].evaluate(async()=>!(await sdk.auth.signOut()).error),true);
  await pages[1].waitForFunction(()=>window.signedOut);
  assert.equal(await pages[1].evaluate(async()=>(await sdk.auth.getSession()).data.session),null);
  pass('Supabase 2.118 browser SDK: login/getUser and signout propagated across two real pages');
 }finally{if(browser)await browser.close();await new Promise(r=>proxy.close(r));}
 fs.writeFileSync(path.join(root,'evidence/h1-chain/provider-results.json'),JSON.stringify({date:new Date().toISOString(),services:{postgres:'17.11',auth:'2.197.0',postgrest:'14.18',sdk:'2.118.0'},scope:'local synthetic; actual GoTrue/JWT/PostgREST/SDK; no SMTP/OAuth/hosted configuration tested',checks},null,2)+'\n');
})().catch(e=>{console.error('LOCAL_PROVIDER_TEST_FAILED: '+String(e.message).slice(0,180));process.exitCode=1;});
