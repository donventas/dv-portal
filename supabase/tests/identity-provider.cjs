'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
assert.ok(process.argv.includes('--authorized-local-identity'),'Explicit local identity authorization required');
const repo=path.resolve(__dirname,'../..'),dir=path.join(os.tmpdir(),'dv-portal-identity-20261025');
const podman=path.join(process.env.LOCALAPPDATA,'Programs/Podman/podman.exe');
const privateConfig=JSON.parse(fs.readFileSync(path.join(dir,'private.json'),'utf8'));
const AUTH='http://127.0.0.1:55451',REST='http://127.0.0.1:55452',MAIL='http://127.0.0.1:55453';
function sql(query){try{return cp.execFileSync(podman,['--connection','dv-portal-h1','exec','-i','dv-identity-db','psql','-X','-qAt','-h','127.0.0.1','-U','supabase_admin','-d','portal_h10_disposable','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();}catch(e){throw new Error('LOCAL_SQL_FAILED: '+String(e.stderr||'').slice(0,200));}}
function jwt(claims){const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const raw=encode({alg:'HS256',typ:'JWT'})+'.'+encode({iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...claims});return raw+'.'+crypto.createHmac('sha256',privateConfig.jwtKey).update(raw).digest('base64url');}
const service=jwt({role:'service_role'}),anon=jwt({role:'anon'});
async function api(base,route,{token,method='GET',body}={}){const r=await fetch(base+route,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null),location:r.headers.get('location')};}
function ok(r,status,label){assert.equal(r.status,status,label+' '+(r.data?.error_code||r.data?.code||r.data?.message||''));return r.data;}
const checks=[];function pass(s){checks.push(s);console.log('PASS '+s);}
async function mailLink(email){for(let i=0;i<30;i++){const list=ok(await api(MAIL,'/api/v1/messages'),200,'inbox');const item=list.messages.find(m=>m.To?.some(t=>t.Address.toLowerCase()===email.toLowerCase()));if(item){const msg=ok(await api(MAIL,'/api/v1/message/'+item.ID),200,'mail');const found=(msg.HTML||msg.Text||'').match(/http:\/\/127\.0\.0\.1:55451\/verify\?[^"\s<]+/);if(found)return new URL(found[0].replaceAll('&amp;','&'));}await new Promise(r=>setTimeout(r,200));}throw new Error('LOCAL_MAIL_NOT_RECEIVED');}
async function verify(link){return api(AUTH,'/verify',{method:'POST',body:{type:link.searchParams.get('type'),token_hash:link.searchParams.get('token')}});}
let seq=0;const suffix=crypto.randomBytes(4).toString('hex');
async function signup(){const email='identity-'+suffix+'-'+(++seq)+'@synthetic.invalid';const credential=crypto.randomBytes(24).toString('base64url');const r=ok(await api(AUTH,'/signup',{method:'POST',body:{email,password:credential,data:{role:'admin',account_id:crypto.randomUUID(),member_role:'owner'}}}),200,'signup');return {email,id:r.id||r.user?.id,link:await mailLink(email),credential};}
async function confirmed(){const u=await signup();u.session=ok(await verify(u.link),200,'confirm');return u;}
async function login(u){return ok(await api(AUTH,'/token?grant_type=password',{method:'POST',body:{email:u.email,password:u.credential}}),200,'fresh login');}
function request(target,action='provision',version=0,account=null,access=null){return {p_key:crypto.randomUUID(),p_action:action,p_target:target,p_version:version,p_account:account,p_access:access,p_reason:'Synthetic authorized identity test'};}
async function command(token,body){return api(REST,'/rpc/portal_identity_command_v1',{token,method:'POST',body});}
async function accounts(token){return ok(await api(REST,'/account?select=id',{token}),200,'account reads');}
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/,'').toUpperCase())bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(x=>parseInt(x,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=crypto.createHmac('sha1',key).update(counter).digest(),offset=h[h.length-1]&15;return ((h.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');}
(async()=>{
 assert.equal(sql('select count(*) from auth.users'),'0','Fresh synthetic lab required');
 const admin=await confirmed();
 // Sole bootstrap exception: a synthetic admin, never an API granting admin role.
 sql(`update public.app_user set role='admin',pending=false where id='${admin.id}';`);
 const accountA=crypto.randomUUID(),accountB=crypto.randomUUID();
 sql(`insert into public.account(id,name,status) values('${accountA}','Synthetic identity A','activo'),('${accountB}','Synthetic identity B','activo');`);
 const inviteEmail='invited-'+suffix+'@synthetic.invalid';
 const invited=ok(await api(AUTH,'/invite',{token:service,method:'POST',body:{email:inviteEmail,data:{role:'admin'}}}),200,'actual invite');
 const invitedId=invited.id||invited.user?.id;assert.match(invitedId,/^[0-9a-f-]{36}$/);
 const inviteLink=await mailLink(inviteEmail);
 assert.equal(sql(`select pending::text||'|'||role::text from public.app_user where id='${invitedId}'`),'true|cliente');
 const grant=request(invitedId,'provision',0,accountA,'owner');
 ok(await command(admin.session.access_token,grant),403,'admin without MFA denied');
 const factor=ok(await api(AUTH,'/factors',{token:admin.session.access_token,method:'POST',body:{factor_type:'totp',friendly_name:'Synthetic administrator'}}),200,'MFA enrollment');
 const challenge=ok(await api(AUTH,'/factors/'+factor.id+'/challenge',{token:admin.session.access_token,method:'POST',body:{}}),200,'MFA challenge');
 const mfa=ok(await api(AUTH,'/factors/'+factor.id+'/verify',{token:admin.session.access_token,method:'POST',body:{challenge_id:challenge.id,code:totp(factor.totp.secret)}}),200,'MFA verification');
 const adminToken=mfa.access_token;assert.ok(adminToken);
 ok(await command(adminToken,grant),403,'unconfirmed identity denied');
 pass('Actual local invitation and TOTP MFA; no authority before email confirmation');
 const invitedSession=ok(await verify(inviteLink),200,'invite acceptance');
 assert.equal((await accounts(invitedSession.access_token)).length,0);
 assert.notEqual((await verify(inviteLink)).status,200,'invite one time');
 ok(await command(invitedSession.access_token,request(invitedId,'provision',0,accountA,'owner')),403,'self promotion denied');
 const granted=ok(await command(adminToken,grant),200,'owner grant');assert.equal(granted.version,1);assert.equal(granted.requiresNewSignIn,true);
 assert.deepEqual(ok(await command(adminToken,grant),200,'grant replay'),granted);
 ok(await command(adminToken,{...grant,p_access:'miembro'}),409,'key reuse conflict');
 assert.equal((await accounts(invitedSession.access_token)).length,0,'pre-grant session stays closed');
 // Invitation user establishes a local test credential, then signs in anew.
 const invitedCredential=crypto.randomBytes(24).toString('base64url');
 ok(await api(AUTH,'/user',{token:invitedSession.access_token,method:'PUT',body:{password:invitedCredential}}),200,'set synthetic invited credential');
 const owner={id:invitedId,email:inviteEmail,credential:invitedCredential};owner.session=await login(owner);
 assert.deepEqual((await accounts(owner.session.access_token)).map(a=>a.id),[accountA]);
 pass('Explicit UUID provision, one-time invite, pending isolation, fresh sign-in and idempotent grant');
 ok(await command(owner.session.access_token,request(admin.id,'revoke',1)),403,'owner cannot administer');
 ok(await command(adminToken,request(admin.id,'revoke',1)),403,'administrator self-management denied');
 const other=await confirmed();
 ok(await command(adminToken,request(other.id,'provision',0,null,'admin')),400,'administrator creation denied');
 ok(await command(adminToken,request(other.id,'provision',0,accountB,'owner')),200,'second tenant owner');
 other.session=await login(other);
 assert.deepEqual((await accounts(other.session.access_token)).map(a=>a.id),[accountB]);
 ok(await api(REST,'/app_user?id=eq.'+owner.id,{token:owner.session.access_token,method:'PATCH',body:{role:'admin'}}),403,'REST authority mutation denied');
 ok(await api(REST,'/portal_identity_audit?select=*',{token:owner.session.access_token}),403,'audit raw reads denied');
 ok(await command(adminToken,request(owner.id,'provision',1,accountB,'owner')),403,'tenant reassignment denied');
 pass('Tenant isolation, no metadata adoption, no admin creation, direct privilege escalation blocked');
 const revoke=request(owner.id,'revoke',1);
 ok(await command(adminToken,revoke),200,'revoke');
 assert.equal((await accounts(owner.session.access_token)).length,0);
 const restore=request(owner.id,'restore',2);
 ok(await command(adminToken,{...restore,p_access:'owner',p_account:accountB}),400,'restore cannot change authority');
 ok(await command(adminToken,restore),200,'restore');
 assert.equal((await accounts(owner.session.access_token)).length,0,'old JWT cannot revive');
 const refreshed=ok(await api(AUTH,'/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:owner.session.refresh_token}}),200,'old session refresh');
 assert.equal((await accounts(refreshed.access_token)).length,0,'old refresh cannot revive authority');
 ok(await command(adminToken,grant),409,'stale grant replay denied');
 owner.session=await login(owner);assert.equal((await accounts(owner.session.access_token)).length,1);
 pass('Revoke and restore: old JWT and old refresh remain denied until a new sign-in');
 const competitorA=await confirmed(),competitorB=await confirmed(),accountC=crypto.randomUUID();
 sql(`insert into public.account(id,name,status) values('${accountC}','Synthetic race','activo');`);
 const race=await Promise.all([command(adminToken,request(competitorA.id,'provision',0,accountC,'owner')),command(adminToken,request(competitorB.id,'provision',0,accountC,'owner'))]);
 assert.equal(race.filter(r=>r.status===200).length,1);assert.equal(race.filter(r=>r.data?.message==='IDENTITY_OWNER_EXISTS').length,1);
 assert.equal(sql(`select count(*) from public.app_user where account_id='${accountC}' and member_role='owner' and not pending`),'1');
 pass('Concurrent owner provisioning admits exactly one owner');
 const winner=race[0].status===200?competitorA:competitorB, replacement=race[0].status===200?competitorB:competitorA;
 ok(await command(adminToken,request(winner.id,'revoke',1)),200,'revoke first owner');
 ok(await command(adminToken,request(replacement.id,'provision',0,accountC,'owner')),200,'replacement owner');
 assert.equal((await command(adminToken,request(winner.id,'restore',2))).data.message,'IDENTITY_OWNER_EXISTS');
 pass('Restoring an owner cannot displace the replacement owner');
 const members=[];for(let i=0;i<4;i++){const u=await confirmed();ok(await command(adminToken,request(u.id,'provision',0,accountA,'miembro')),200,'member provision');members.push(u);}
 const excess=await confirmed();assert.equal((await command(adminToken,request(excess.id,'provision',0,accountA,'miembro'))).data.message,'IDENTITY_SEAT_LIMIT');
 ok(await command(adminToken,request(members[0].id,'revoke',1)),200,'free active seat');
 ok(await command(adminToken,request(excess.id,'provision',0,accountA,'miembro')),200,'replacement seat');
 assert.equal((await command(adminToken,request(members[0].id,'restore',2))).data.message,'IDENTITY_SEAT_LIMIT');
 pass('Five active seats enforced on initial grants and restoration');
 const memberSession=await login(members[1]);
 ok(await command(memberSession.access_token,request(excess.id,'revoke',1)),403,'member cannot administer');
 const failed=await confirmed(),failureKey=crypto.randomUUID();
 sql(`create function public.synthetic_identity_abort() returns trigger language plpgsql as $$begin if new.operation_key='${failureKey}' then raise exception 'SYNTHETIC_IDENTITY_ABORT'; end if; return new; end$$; create trigger synthetic_identity_abort before insert on public.portal_identity_audit for each row execute function public.synthetic_identity_abort();`);
 const failedReq={...request(failed.id,'provision',0,null,'analista'),p_key:failureKey};
 ok(await command(adminToken,failedReq),400,'forced atomic failure');
 assert.equal(sql(`select pending::text||'|'||access_version::text||'|'||role::text from public.app_user where id='${failed.id}'`),'true|0|cliente');
 assert.equal(sql(`select count(*) from public.portal_identity_audit where operation_key='${failureKey}'`),'0');
 sql('drop trigger synthetic_identity_abort on public.portal_identity_audit; drop function public.synthetic_identity_abort();');
 ok(await command(adminToken,failedReq),200,'retry after rolled-back failure');
 pass('Provisioning and audit roll back atomically; same intention safely retries');
 const expired=await signup();sql(`update auth.users set confirmation_sent_at=now()-interval '20 minutes' where id='${expired.id}';`);
 assert.notEqual((await verify(expired.link)).status,200,'expired confirmation denied');
 const ownerClaims=JSON.parse(Buffer.from(owner.session.access_token.split('.')[1],'base64url'));
 // Outside PostgREST's 30-second clock-skew tolerance.
 ok(await api(REST,'/account?select=id',{token:jwt({...ownerClaims,exp:Math.floor(Date.now()/1000)-120})}),401,'expired signed JWT');
 ok(await api(REST,'/account?select=id',{token:owner.session.access_token.slice(0,-8)+'invalidx'}),401,'forged JWT');
 sql(`update auth.users set banned_until=now()+interval '1 hour' where id='${owner.id}';`);
 assert.equal((await accounts(owner.session.access_token)).length,0,'provider ban invalidates business reads');
 const deniedCommand=await api(REST,'/rpc/portal_command_v1',{token:owner.session.access_token,method:'POST',body:{p_key:crypto.randomUUID(),p_kind:'activate',p_resource:accountA,p_version:0,p_revision:null,p_payload:{}}});assert.equal(deniedCommand.data.message,'ACTOR_REVOKED');
 sql(`update auth.users set banned_until=null where id='${owner.id}';`);
 ok(await api(AUTH,'/logout',{token:owner.session.access_token,method:'POST'}),204,'actual logout');
 assert.equal((await accounts(owner.session.access_token)).length,0,'signed-out JWT denied by session lookup');
 assert.notEqual((await api(AUTH,'/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:owner.session.refresh_token}})).status,200,'signed-out refresh denied');
 pass('Expired links/JWT, tampered JWT, provider ban, logout and removed sessions fail closed');
 sql(`update auth.users set banned_until=now()+interval '1 hour' where id='${admin.id}';`);
 ok(await command(adminToken,failedReq),403,'banned administrator cannot replay');
 pass('Administrator provider state revalidated before cached replies');
 sql(`update auth.users set banned_until=null where id='${admin.id}'; update auth.sessions set aal='aal1' where user_id='${admin.id}';`);
 ok(await command(adminToken,failedReq),403,'downgraded session with old aal2 JWT denied');
 sql(`delete from auth.sessions where user_id='${admin.id}';`);
 ok(await command(adminToken,failedReq),403,'removed administrator session denied');
 pass('Old administrator aal2 JWT cannot bypass downgraded or removed Auth sessions');
 const sanitation=JSON.parse(fs.readFileSync(path.join(dir,'sanitation.json'),'utf8'));
 const evidence={date:new Date().toISOString(),scope:'Local restored schema sanitized before services; real GoTrue/PostgREST/SMTP/TOTP; synthetic identities only',services:{postgres:'17.6',auth:'2.197.0',postgrest:'14.18',mailpit:'1.32.0'},sanitation,checks,productionConnections:0,externalEmails:0};
 const out=path.join(repo,'evidence/identity-auth-20261025');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'provider-results.json'),JSON.stringify(evidence,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'browser-user.json'),JSON.stringify({email:other.email,credential:other.credential,anon}));
})().catch(e=>{console.error('IDENTITY_PROVIDER_TEST_FAILED: '+String(e.message).slice(0,350));process.exitCode=1;});
