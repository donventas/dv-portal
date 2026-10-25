'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
assert.ok(process.argv.includes('--authorized-local-identity'));
const L=require('./invitation-lab.cjs'),{AUTH,REST,MAIL,origin,sql,api,ok,mailLink,signup,totp}=L;
const checks=[];function pass(s){checks.push(s);console.log('PASS '+s);}
const suffix=crypto.randomBytes(4).toString('hex');
const body=email=>({key:crypto.randomUUID(),email,reason:'Synthetic approved invitation rehearsal'});
const rpc=(name,token,params)=>api(REST,'/rpc/'+name,{token,method:'POST',body:params});
(async()=>{
 assert.equal(sql('select count(*) from auth.users'),'0','Fresh synthetic laboratory required');
 const key=L.keys(),service=key('service_role'),anon=key('anon');
 const admin=await signup('admin-'+suffix+'@synthetic.invalid');
 sql(`update public.app_user set role='admin',pending=false,name='Synthetic Administrator' where id='${admin.id}';`);
 const factor=ok(await api(AUTH,'/factors',{token:admin.session.access_token,method:'POST',body:{factor_type:'totp',friendly_name:'Synthetic Authenticator'}}),200,'enroll');
 const challenge=ok(await api(AUTH,'/factors/'+factor.id+'/challenge',{token:admin.session.access_token,method:'POST',body:{}}),200,'challenge');
 const mfa=ok(await api(AUTH,'/factors/'+factor.id+'/verify',{token:admin.session.access_token,method:'POST',body:{challenge_id:challenge.id,code:totp(factor.totp.secret)}}),200,'verify');
 const token=mfa.access_token,member=await signup('member-'+suffix+'@synthetic.invalid');
 let dispatches=0,loseAfterSend=false,loseReceipt=false;
 const server=await L.start({service,anon,transport:async(url,options)=>{
  if(url.includes('/invite?')){dispatches++;const r=await fetch(url,options);if(loseAfterSend){loseAfterSend=false;throw new Error('SYNTHETIC_LOST_PROVIDER_RESPONSE');}return r;}
  if(url.endsWith('/rpc/portal_invitation_complete_v1')&&loseReceipt){loseReceipt=false;throw new Error('SYNTHETIC_RECEIPT_OUTAGE');}
  return fetch(url,options);
 }});
 console.log('LOCAL_REVIEW_READY '+origin);
 const send=(b,t=token,headers={Origin:origin})=>api(origin,'/api/admin/invitations',{token:t,method:'POST',body:b,headers});
 const req=(b,t=token)=>rpc('portal_invitation_request_v1',t,{p_key:b.key,p_email:b.email,p_reason:b.reason});
 const claim=id=>rpc('portal_invitation_claim_v1',service,{p_id:id});
 let browser;
 try{
  const denied=body('denied-'+suffix+'@synthetic.invalid');
  ok(await send(denied,null),401,'anonymous denied');ok(await send(denied,member.session.access_token),403,'member denied');
  ok(await send(denied,admin.session.access_token),403,'aal1 denied');ok(await send(denied,token,{Origin:'https://untrusted.invalid'}),403,'foreign origin denied');
  ok(await send({...denied,email:'person@example.com'}),400,'external recipient denied');
  ok(await rpc('portal_invitation_claim_v1',token,{p_id:crypto.randomUUID()}),403,'client claim denied');
  ok(await api(REST,'/portal_invitation?select=*',{token}),403,'raw table denied');assert.equal(dispatches,0);
  pass('Anonymous/pending non-admin/aal1, foreign origin, external recipient and direct dispatch are denied before email');
  const duplicate=body('duplicate-'+suffix+'@synthetic.invalid');
  const pair=await Promise.all([send(duplicate),send(duplicate)]);pair.forEach(r=>ok(r,200,'concurrent request'));
  assert.equal(dispatches,1);const sentId=pair[0].data.id;assert.equal(pair[1].data.id,sentId);
  ok(await send(duplicate),200,'same intent replay');assert.equal(dispatches,1);
  ok(await send({...duplicate,key:crypto.randomUUID()}),409,'different key same recipient');
  ok(await send({...duplicate,reason:'Changed synthetic intention'}),409,'key conflict');
  await mailLink(duplicate.email);assert.equal(sql(`select pending from public.app_user where email='${duplicate.email}'`),'t');
  pass('Concurrent/replayed invitations dispatch once; duplicate recipient blocked; received mail grants no authority');
  const uncertain=body('uncertain-'+suffix+'@synthetic.invalid');loseAfterSend=true;
  assert.equal(ok(await send(uncertain),200,'lost provider response').state,'uncertain');const afterUnknown=dispatches;
  assert.equal(ok(await send(uncertain),200,'uncertain replay').state,'uncertain');assert.equal(dispatches,afterUnknown);
  await mailLink(uncertain.email);
  const receipt=body('receipt-'+suffix+'@synthetic.invalid');loseReceipt=true;
  assert.equal(ok(await send(receipt),202,'lost receipt').state,'uncertain');const afterReceipt=dispatches;
  assert.equal(ok(await send(receipt),200,'dispatching replay').state,'uncertain');assert.equal(dispatches,afterReceipt);
  sql(`update public.portal_invitation set claimed_at=now()-interval '2 minutes' where email='${receipt.email}';`);
  assert.equal(ok(await send(receipt),200,'lease expiry').state,'uncertain');assert.equal(dispatches,afterReceipt);
  pass('Lost provider response, lost receipt and expired lease never trigger automatic resend');
  const cancelled=body('cancelled-'+suffix+'@synthetic.invalid'),c=ok(await req(cancelled),200,'queue');
  ok(await rpc('portal_invitation_cancel_v1',token,{p_id:c.id}),200,'cancel queued');
  assert.equal(ok(await send(cancelled),200,'cancelled replay').state,'cancelled');assert.equal(dispatches,afterReceipt);
  ok(await rpc('portal_invitation_cancel_v1',token,{p_id:sentId}),409,'cannot cancel after send');
  const expired=body('expired-'+suffix+'@synthetic.invalid'),e=ok(await req(expired),200,'queue expiration');
  sql(`update public.portal_invitation set expires_at=now()-interval '1 minute' where id='${e.id}';`);
  assert.equal(ok(await claim(e.id),200,'expired approval').state,'failed');
  const pending=body('receipt-rules-'+suffix+'@synthetic.invalid'),p=ok(await req(pending),200,'queue receipt'),claimed=ok(await claim(p.id),200,'claim receipt');
  ok(await rpc('portal_invitation_complete_v1',token,{p_id:p.id,p_nonce:claimed.nonce,p_state:'failed',p_target:null}),403,'client completion denied');
  ok(await rpc('portal_invitation_complete_v1',service,{p_id:p.id,p_nonce:crypto.randomUUID(),p_state:'failed',p_target:null}),400,'wrong nonce');
  const completion={p_id:p.id,p_nonce:claimed.nonce,p_state:'failed',p_target:null};
  ok(await rpc('portal_invitation_complete_v1',service,completion),200,'complete');ok(await rpc('portal_invitation_complete_v1',service,completion),200,'same completion');
  ok(await rpc('portal_invitation_complete_v1',service,{...completion,p_state:'uncertain'}),409,'contradictory receipt');
  pass('Only queued work cancels; approval expires; completion is privileged, nonce-bound and idempotent');

  const account=crypto.randomUUID();sql(`insert into public.account(id,name,status) values('${account}','Synthetic invited account','activo');`);
  const {chromium}=require(path.join(L.root,'node_modules/playwright'));
  browser=await chromium.launch({headless:true,executablePath:process.env.H10_BROWSER_PATH});
  const context=await browser.newContext({viewport:{width:1280,height:900}});let external=0,privilegedInBrowser=0;
  async function isolate(ctx){await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(![origin,AUTH].includes(u.origin)){external++;return r.abort();}if(r.request().headers().authorization==='Bearer '+service)privilegedInBrowser++;return r.continue();});}
  await isolate(context);const page=await context.newPage();const pageErrors=[];page.on('pageerror',()=>pageErrors.push('BROWSER_SCRIPT_ERROR'));
  await page.goto(origin);await page.waitForFunction(()=>!!window.DVAuth);
  assert.equal(await page.evaluate(async u=>!(await (await DVSupa.client()).auth.signInWithPassword({email:u.email,password:u.credential})).error,admin),true);
  await page.reload();await page.locator('#app.on').waitFor();await page.getByRole('button',{name:'Equipo',exact:true}).click();
  await page.locator('#identityCode').fill(totp(factor.totp.secret));await page.getByRole('button',{name:'Verificar acceso',exact:true}).click();
  await page.locator('#inviteEmail').waitFor();
  const email='ui-'+suffix+'@synthetic.invalid';await page.locator('#inviteEmail').fill(email);await page.locator('#inviteReason').fill('Synthetic complete UI invitation');
  await page.getByRole('button',{name:'Enviar invitación',exact:true}).click();await page.locator('#envGuardConfirm').click();
  await page.locator('#identityNotice').filter({hasText:'Aceptada por el proveedor'}).waitFor();
  const target=sql(`select id from public.app_user where email='${email}'`);assert.match(target,/^[0-9a-f-]{36}$/);
  await page.locator('[data-user="'+target+'"]').click();await page.getByRole('button',{name:'Conceder acceso',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Conceder acceso',exact:true}).isDisabled(),true);
  const inviteeContext=await browser.newContext();await isolate(inviteeContext);const invitee=await inviteeContext.newPage();
  const invitationLink=await mailLink(email),accepted=await api(AUTH,invitationLink.pathname+invitationLink.search);
  assert.equal(accepted.status,303);const callback=new URL(accepted.location),inviteParams=new URLSearchParams(callback.hash.slice(1));
  const invitationBearer=inviteParams.get('access_token'),invitationSession=JSON.parse(Buffer.from(invitationBearer.split('.')[1],'base64url')).session_id;
  const inviteCredential=crypto.randomBytes(24).toString('base64url');
  ok(await api(AUTH,'/user',{token:invitationBearer,method:'PUT',body:{password:inviteCredential}}),200,'synthetic invited credential');
  const parallelSession=ok(await api(AUTH,'/token?grant_type=password',{method:'POST',body:{email,password:inviteCredential}}),200,'parallel invited session');
  await invitee.goto(callback.href);await invitee.locator('#acceptInvitation').click();
  await invitee.getByText('Correo verificado. Cuando el administrador conceda tu acceso, solicita un enlace nuevo para entrar.',{exact:true}).waitFor();
  assert.equal(new URL(invitee.url()).hash,'');assert.equal(await invitee.evaluate(async()=>(await (await DVSupa.client()).auth.getSession()).data.session),null);
  assert.equal(sql(`select pending from public.app_user where id='${target}'`),'t');
  assert.equal(sql(`select count(*) from auth.sessions where id='${invitationSession}'`),'0','invitation session closed');
  ok(await api(AUTH,'/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:parallelSession.refresh_token}}),200,'other session preserved');
  pass('Real Portal UI requires MFA, captures invitation locally, strips callback tokens and leaves verified invitee pending');
  await page.getByRole('button',{name:'Actualizar estados',exact:true}).click();
  await page.locator('.li').filter({has:page.locator('[data-user="'+target+'"]')}).getByText('Correo verificado · Sin acceso activo',{exact:true}).waitFor();
  await page.locator('[data-user="'+target+'"]').click();
  await page.locator('#accessRole').selectOption('owner');await page.locator('#accessAccount').selectOption(account);await page.locator('#accessReason').fill('Synthetic confirmed owner approval');
  await page.getByRole('button',{name:'Conceder acceso',exact:true}).click();await page.locator('#envGuardConfirm').click();
  await page.getByText('Acceso actualizado. La persona debe iniciar sesión nuevamente.',{exact:true}).waitFor();
  await invitee.goto(origin);await invitee.locator('#cliEmail').fill(email);await invitee.getByRole('button',{name:'Enviar enlace mágico →',exact:true}).click();await invitee.locator('#envGuardConfirm').click();
  await invitee.locator('#cli2').waitFor({state:'visible'});const loginLink=await mailLink(email);assert.equal(loginLink.searchParams.get('type'),'magiclink');await invitee.goto(loginLink.href);
  await invitee.locator('#app.on').waitFor();assert.equal(await invitee.evaluate(()=>DVStore.session().accountId),account);
  await page.locator('[data-user="'+target+'"]').click();await page.locator('#accessReason').fill('Synthetic revocation in UI');await page.getByRole('button',{name:'Revocar acceso',exact:true}).click();await page.locator('#envGuardConfirm').click();await page.getByText('Acceso revocado.',{exact:true}).waitFor();
  assert.equal(await invitee.evaluate(async()=>{const r=await (await DVSupa.client()).from('account').select('id');return r.data.length;}),0);
  await page.locator('[data-user="'+target+'"]').click();await page.locator('#accessReason').fill('Synthetic restoration in UI');await page.getByRole('button',{name:'Restaurar acceso',exact:true}).click();await page.locator('#envGuardConfirm').click();await page.getByText('Acceso actualizado. La persona debe iniciar sesión nuevamente.',{exact:true}).waitFor();
  assert.equal(await invitee.evaluate(async()=>{await (await DVSupa.client()).auth.refreshSession();return (await (await DVSupa.client()).from('account').select('id')).data.length;}),0);
  pass('UI grants only verified UUID; PKCE login reaches its account; UI revoke/restore cannot revive old refresh');
  const out=path.join(L.root,'evidence/invitations-20261025');fs.mkdirSync(out,{recursive:true});
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});await page.evaluate(()=>document.getElementById('main').scrollTop=0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'responsive root');assert.equal(await page.evaluate(()=>document.getElementById('main').scrollWidth<=document.getElementById('main').clientWidth),true,'responsive main');if(width!==320)await page.screenshot({path:path.join(out,'admin-'+width+'.png')});}
  assert.equal(external,0);assert.equal(privilegedInBrowser,0);assert.equal(pageErrors.length,0);
  pass('Full Portal shell and invitation controls fit 320/390/1280px; no external traffic or service credential in browser');
  await browser.close();browser=null;

  // Purely synthetic directory fixtures exercise real keyset pagination, never mail.
  sql(`insert into public.portal_invitation(actor_id,operation_key,actor_session,actor_version,email,reason,state)
   select '${admin.id}',gen_random_uuid(),gen_random_uuid(),0,'page-'||g||'@synthetic.invalid','Synthetic pagination fixture','cancelled' from generate_series(1,25) g;`);
  let cursor=null,ids=[];do{const rows=ok(await rpc('portal_identity_directory_v1',token,{p_kind:'invitations',p_after:cursor}),200,'directory').rows;ids.push(...rows.slice(0,20).map(x=>x.id));cursor=rows.length>20?rows[19].id:null;}while(cursor);
  assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,Number(sql('select count(*) from public.portal_invitation')));
  ok(await rpc('portal_identity_directory_v1',member.session.access_token,{p_kind:'users',p_after:null}),403,'nonadmin directory');
  const rows=ok(await rpc('portal_identity_directory_v1',token,{p_kind:'invitations',p_after:null}),200,'safe directory').rows;
  assert.ok(rows.every(r=>!('dispatch_nonce'in r)&&!('actor_session'in r)));
  ok(await req(body('rate-'+suffix+'@synthetic.invalid')),429,'rate limit');
  pass('Real directory keyset pages are complete without duplicates or dispatch secrets; quota rejects excess requests');
  // Claim must reject a revoked approval; completion must still record an effect.
  sql(`update public.portal_invitation set created_at=now()-interval '2 hours';`);
  const late=ok(await req(body('late-'+suffix+'@synthetic.invalid')),200,'late queue'),lateClaim=ok(await claim(late.id),200,'late claim');
  const revoked=ok(await req(body('revoked-'+suffix+'@synthetic.invalid')),200,'revocation queue');
  sql(`update public.app_user set pending=true where id='${admin.id}';`);
  assert.equal(ok(await claim(revoked.id),200,'revoked claim').state,'failed');
  ok(await rpc('portal_invitation_complete_v1',service,{p_id:late.id,p_nonce:lateClaim.nonce,p_state:'uncertain',p_target:null}),200,'historical receipt retained');
  ok(await send(duplicate),403,'revoked replay');
  pass('Revocation blocks queued dispatch and cached replay while preserving already-claimed effect receipts');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({date:new Date().toISOString(),scope:'Sanitized restored local DB; real Portal UI/Auth/REST/SMTP; explicit local capability admission only',checks,dispatches,externalEmails:0,productionConnections:0,externalBrowserRequests:external,privilegedBrowserRequests:privilegedInBrowser},null,2)+'\n');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error('INVITATION_TEST_FAILED: '+String(e.message).replace(/https?:\/\/\S+/g,'[URL redacted]').slice(0,500));process.exitCode=1;});
