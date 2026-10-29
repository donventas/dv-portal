'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
assert.ok(process.argv.includes('--authorized-local-h12'));
const root=path.resolve(__dirname,'../..'),dir=path.join(os.tmpdir(),'dv-portal-h12-drafts'),podman=path.join(process.env.LOCALAPPDATA,'Programs/Podman/podman.exe');
const secret=JSON.parse(fs.readFileSync(path.join(dir,'private.json'))).jwtKey;
function sql(input){try{return cp.execFileSync(podman,['--connection','dv-portal-h1','exec','-i','dv-h12-db','psql','-X','-qAt','-h','127.0.0.1','-U','supabase_admin','-d','portal_h10_disposable','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();}catch{throw Error('H12_LOCAL_SQL_FAILED');}}
function jwt(c){const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),s=b({alg:'HS256',typ:'JWT'})+'.'+b({iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...c});return s+'.'+crypto.createHmac('sha256',secret).update(s).digest('base64url');}
const service=jwt({role:'service_role'}),anon=jwt({role:'anon'}),AUTH='http://127.0.0.1:55461',REST='http://127.0.0.1:55462';
async function api(base,route,token,body,method='POST'){const r=await fetch(base+route,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};}
function ok(r,status){assert.equal(r.status,status,'Unexpected HTTP status: '+(r.data?.message||r.data?.code||''));return r.data;}
const rpc=(user,name,args={})=>api(REST,'/rpc/portal_draft_'+name+'_v1',user.session.access_token,args);
async function login(user){user.session=ok(await api(AUTH,'/token?grant_type=password',anon,{email:user.email,password:user.credential}),200);return user;}
async function fixture(account,role='owner'){
 const user={email:'draft-'+crypto.randomUUID()+'@synthetic.invalid',credential:crypto.randomBytes(24).toString('base64url')};
 const created=ok(await api(AUTH,'/admin/users',service,{email:user.email,password:user.credential,email_confirm:true}),200);user.id=created.id;
 assert.match(user.id,/^[0-9a-f-]{36}$/);assert.match(account,/^[0-9a-f-]{36}$/);
 // Synthetic bootstrap fixture only; no grant API or production provisioning here.
 sql(`update public.app_user set role='cliente',member_role='${role}',account_id='${account}',pending=false where id='${user.id}';`);
 return login(user);
}
const checks=[];function pass(s){checks.push(s);console.log('PASS '+s);}
(async()=>{
 assert.equal(sql('select count(*) from public.portal_brand_draft'),'0');
 const a=crypto.randomUUID(),b=crypto.randomUUID();sql(`insert into public.account(id,name,status) values('${a}','Synthetic draft A','activo'),('${b}','Synthetic draft B','activo');`);
 const owner=await fixture(a),other=await fixture(b),member=await fixture(a,'miembro');
 const document={schema:1,stage:'marca',fields:{name:'  Marca sintética\n',q_needs_launch:true,qnote_needs_launch:'Contexto exacto\nsegunda línea',q_offerTypes_product:false,qnote_offerTypes_product:'Nota desmarcada',it_proof:'Por validar',ib_proof:'pending'}};
 const request={p_key:crypto.randomUUID(),p_expected:0,p_document:document};
 assert.equal(ok(await rpc(owner,'open'),200).version,0);ok(await rpc(member,'open'),403);
 ok(await api(REST,'/rpc/portal_draft_open_v1',anon,{}),401);
 const saved=ok(await rpc(owner,'save',request),200);assert.equal(saved.version,1);
 assert.deepEqual(ok(await rpc(owner,'save',request),200),saved);
 ok(await rpc(owner,'save',{...request,p_document:{...document,stage:'contexto'}}),409);
 ok(await rpc(member,'save',request),403);assert.equal(ok(await rpc(other,'open'),200).version,0);
 ok(await api(REST,'/portal_brand_draft',owner.session.access_token,undefined,'GET'),403);
 ok(await api(REST,'/portal_brand_draft_revision',owner.session.access_token,undefined,'GET'),403);
 ok(await api(REST,'/portal_brand_draft',owner.session.access_token,{account_id:a,version:8,document}),403);
 pass('Owner-only RPC, tenant-derived identity, no direct table access, idempotent receipt and changed-key conflict');
 for(const bad of [{...document,accountId:b},{...document,fields:{role:'admin'}},{...document,fields:{name:'x'.repeat(501)}},{...document,fields:{q_needs_launch:'true'}},{...document,stage:'bandeja'}])ok(await rpc(owner,'save',{p_key:crypto.randomUUID(),p_expected:1,p_document:bad}),400);
 assert.equal(ok(await rpc(owner,'open'),200).version,1);
 await login(owner);assert.deepEqual(ok(await rpc(owner,'open'),200).document,document);
 pass('Exact partial text and deselected notes survive a new real Auth session; invalid payloads fail atomically');
 const commands=[0,1].map(i=>({p_key:crypto.randomUUID(),p_expected:1,p_document:{...document,fields:{name:'Concurrent '+i}}}));
 const concurrent=await Promise.all(commands.map(c=>rpc(owner,'save',c)));assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);
 assert.equal(ok(await rpc(owner,'open'),200).version,2);pass('Concurrent same-version writes have exactly one winner');
 for(let n=2;n<23;n++)ok(await rpc(owner,'save',{p_key:crypto.randomUUID(),p_expected:n,p_document:document}),200);
 const first=ok(await rpc(owner,'history',{p_after:0,p_snapshot:null}),200);assert.equal(first.rows.length,20);assert.equal(first.snapshot,23);
 ok(await rpc(owner,'save',{p_key:crypto.randomUUID(),p_expected:23,p_document:document}),200);
 const last=ok(await rpc(owner,'history',{p_after:first.next,p_snapshot:first.snapshot}),200);assert.deepEqual(last.rows.map(r=>r.version),[21,22,23]);assert.equal(last.next,null);
 assert.equal(ok(await rpc(other,'history'),200).rows.length,0);ok(await rpc(owner,'history',{p_after:0,p_snapshot:999}),400);
 pass('History keyset pagination remains bounded and complete while a newer version is written');
 sql(`update public.app_user set pending=true where id='${owner.id}';`);ok(await rpc(owner,'open'),403);ok(await rpc(owner,'save',request),403);
 sql(`update public.app_user set pending=false,access_valid_after=clock_timestamp() where id='${owner.id}';`);ok(await rpc(owner,'open'),403);await login(owner);ok(await rpc(owner,'open'),200);
 pass('Revocation blocks reads and replay; restore requires a new Auth session');
 const claims=JSON.parse(Buffer.from(owner.session.access_token.split('.')[1],'base64url'));
 ok(await api(REST,'/rpc/portal_draft_open_v1',jwt({...claims,exp:Math.floor(Date.now()/1000)-120}),{}),401);
 ok(await api(REST,'/rpc/portal_draft_open_v1',owner.session.access_token.slice(0,-8)+'invalidx',{}),401);
 ok(await api(AUTH,'/logout',owner.session.access_token,undefined),204);ok(await rpc(owner,'open'),403);await login(owner);
 pass('Expired/tampered JWT and signed-out real sessions are rejected');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYo0AAAAASUVORK5CYII=','base64');
 const assetRequest={p_key:crypto.randomUUID(),p_kind:'logo',p_name:'Synthetic logo.png',p_mime:'image/png',p_base64:png.toString('base64')};
 const assetSaved=ok(await rpc(owner,'asset_put',assetRequest),200);
 assert.deepEqual(ok(await rpc(owner,'asset_put',assetRequest),200),assetSaved);
 ok(await rpc(owner,'asset_put',{...assetRequest,p_name:'Changed.png'}),409);
 ok(await rpc(other,'asset_get',{p_id:assetRequest.p_key}),400);
 ok(await rpc(other,'asset_put',assetRequest),409);
 ok(await api(REST,'/rpc/portal_draft_asset_get_v1',anon,{p_id:assetRequest.p_key}),401);
 ok(await rpc(member,'asset_get',{p_id:assetRequest.p_key}),403);
 ok(await rpc(member,'asset_put',{...assetRequest,p_key:crypto.randomUUID()}),403);
 ok(await api(REST,'/portal_brand_asset',owner.session.access_token,undefined,'GET'),403);
 assert.equal(Buffer.from(ok(await rpc(owner,'asset_get',{p_id:assetRequest.p_key}),200).asset.base64,'base64').compare(png),0);
 for(const patch of [{p_mime:'image/svg+xml'},{p_kind:'manual'},{p_base64:Buffer.from('<html>bad</html>').toString('base64')},{p_base64:Buffer.alloc(1048577).toString('base64')},{p_name:'bad\nname.png'}])ok(await rpc(owner,'asset_put',{...assetRequest,p_key:crypto.randomUUID(),...patch}),400);
 let cv=ok(await rpc(other,'open'),200).version;
 ok(await rpc(other,'save',{p_key:crypto.randomUUID(),p_expected:cv,p_document:{schema:1,stage:'panel',fields:{brand_logo:assetRequest.p_key}}}),400);
 cv=ok(await rpc(owner,'open'),200).version;
 ok(await rpc(owner,'save',{p_key:crypto.randomUUID(),p_expected:cv,p_document:{schema:1,stage:'panel',fields:{brand_manual:assetRequest.p_key}}}),400);
 const kitDoc={schema:1,stage:'panel',fields:{welcome_section:'identidad',brand_logo:assetRequest.p_key,brand_status:'ready',brand_primary:'  #224466  ',brand_context:' contexto exacto\n'}};
 ok(await rpc(owner,'save',{p_key:crypto.randomUUID(),p_expected:cv,p_document:kitDoc}),200);
 await login(owner);assert.deepEqual(ok(await rpc(owner,'open'),200).document,kitDoc);
 sql(`update public.app_user set pending=true where id='${owner.id}';`);ok(await rpc(owner,'asset_get',{p_id:assetRequest.p_key}),403);ok(await rpc(owner,'asset_put',assetRequest),403);sql(`update public.app_user set pending=false where id='${owner.id}';`);
 pass('Optional kit persists exact text and immutable private attachment; replay, tenant/role/type/signature/size and revoked-session checks pass');
 const quotaAccount=crypto.randomUUID();sql(`insert into public.account(id,name,status) values('${quotaAccount}','Synthetic quota','activo');`);const quota=await fixture(quotaAccount);
 for(let n=0;n<31;n++)ok(await rpc(quota,'asset_put',{...assetRequest,p_key:crypto.randomUUID()}),200);
 const lastUploads=await Promise.all([0,1].map(()=>rpc(quota,'asset_put',{...assetRequest,p_key:crypto.randomUUID()})));
 assert.deepEqual(lastUploads.map(x=>x.status).sort(),[200,400]);
 ok(await rpc(quota,'asset_put',{...assetRequest,p_key:crypto.randomUUID()}),400);
 const bytesAccount=crypto.randomUUID();sql(`insert into public.account(id,name,status) values('${bytesAccount}','Synthetic byte quota','activo');`);const bytesOwner=await fixture(bytesAccount);
 const largePdf=Buffer.alloc(4194304,32);largePdf.write('%PDF-1.4\n');largePdf.write('%%EOF',largePdf.length-5);
 for(let n=0;n<4;n++)ok(await rpc(bytesOwner,'asset_put',{p_key:crypto.randomUUID(),p_kind:'manual',p_name:'Synthetic.pdf',p_mime:'application/pdf',p_base64:largePdf.toString('base64')}),200);
 ok(await rpc(bytesOwner,'asset_put',{...assetRequest,p_key:crypto.randomUUID()}),400);
 cv=ok(await rpc(other,'open'),200).version;const empty={schema:1,stage:'panel',fields:{}};
 ok(await rpc(other,'save',{p_key:crypto.randomUUID(),p_expected:cv,p_document:empty}),200);assert.deepEqual(ok(await rpc(other,'open'),200).document,empty);
 pass('Asset count quota serialized under concurrent uploads; 16 MB quota enforced; empty welcome saves without required answers');
 // Restore payload used by the browser scenario without resetting version history.
 const current=ok(await rpc(owner,'open'),200);ok(await rpc(owner,'save',{p_key:crypto.randomUUID(),p_expected:current.version,p_document:document}),200);
 fs.writeFileSync(path.join(dir,'browser-users.json'),JSON.stringify({anon,owner,other,member}));
 fs.mkdirSync(path.join(root,'evidence/h12-drafts'),{recursive:true});
 fs.writeFileSync(path.join(root,'evidence/h12-drafts/provider-results.json'),JSON.stringify({at:new Date().toISOString(),scope:'Isolated real GoTrue/PostgREST, sanitized restored schema, synthetic accounts only',checks,productionConnections:0,externalEmails:0},null,2)+'\n');
})().catch(e=>{console.error('H12_PROVIDER_FAILED: '+e.message);process.exitCode=1;});
