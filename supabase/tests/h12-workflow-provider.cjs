'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
assert.ok(process.argv.includes('--authorized-local-h12'));
const L=require('./h12-workflow-local.cjs'),{sql,api,jwt,worker}=L;
const checks=[],pass=s=>{checks.push(s);console.log('PASS '+s);};
const ok=(r,s=200)=>{assert.equal(r.status,s,JSON.stringify(r.data));return r.data;};
const rpc=(u,action,id=null,data={},key=null)=>api('rest','/rpc/portal_workflow_v1',u.token,{p_action:action,p_id:id,p_data:data,p_key:key});
const write=(u,action,id,data={},key=crypto.randomUUID())=>rpc(u,action,id,data,key);
async function fixture(account,role='cliente',member='owner'){
 const u={email:'workflow-'+crypto.randomUUID()+'@synthetic.invalid',credential:crypto.randomBytes(24).toString('base64url')};
 u.id=ok(await api('auth','/admin/users',jwt({role:'service_role'}),{email:u.email,password:u.credential,email_confirm:true})).id;
 sql(`update public.app_user set name='Prueba ${role}',role='${role}',member_role=${role==='cliente'?"'"+member+"'":'null'},account_id=${role==='cliente'?"'"+account+"'":'null'},pending=false where id='${u.id}';`);
 await login(u);return u;
}
async function login(u){u.token=ok(await api('auth','/token?grant_type=password',jwt({role:'anon'}),{email:u.email,password:u.credential})).access_token;}
async function run(){
 const before=sql("select coalesce(jsonb_agg(to_jsonb(d) order by account_id),'[]') from public.portal_brand_draft d;");
 // Additive proposals, apply once. Never reset/reseed existing lab or review account.
 if(sql("select to_regclass('public.portal_request') is null;")==='t'){
  sql(fs.readFileSync(path.join(L.root,'supabase/proposals/h12-workflow.sql'),'utf8'));
  sql(fs.readFileSync(path.join(L.root,'supabase/proposals/h12-worker.sql'),'utf8'));
  sql("notify pgrst,'reload schema';");await new Promise(r=>setTimeout(r,1200));
 }
 // Candidate function repairs only in this fixed laboratory; no data reset.
 sql("alter table public.portal_request_notice drop constraint portal_request_notice_mail_state_check;alter table public.portal_request_notice add constraint portal_request_notice_mail_state_check check(mail_state in ('queued','uncertain','captured','failed','suppressed'));");
 if(sql("select to_regclass('public.portal_collaborator_profile') is null;")==='t')sql('create table public.portal_collaborator_profile(user_id uuid primary key references public.app_user(id),subscribed boolean not null default false);alter table public.portal_collaborator_profile enable row level security;revoke all on public.portal_collaborator_profile from public,anon,authenticated;');
 for(const file of ['h12-workflow.sql','h12-worker.sql']){
  const source=fs.readFileSync(path.join(L.root,'supabase/proposals',file),'utf8');
  for(const match of source.matchAll(/create (?:or replace )?function[\s\S]*?\$\$;/g))sql(match[0].replace(/^create (?:or replace )?function/,'create or replace function'));
  for(const match of source.matchAll(/revoke all on function[\s\S]*?;/g))sql(match[0]);
 }
 sql('grant execute on function public.portal_workflow_v1(text,uuid,uuid,jsonb) to authenticated;');
 assert.equal(sql("select has_function_privilege('authenticated','auth_dv.review_worker(text,uuid,uuid,jsonb)','execute') or has_function_privilege('authenticated','auth_dv.review_mail(bigint)','execute');"),'f');
 const a=crypto.randomUUID(),b=crypto.randomUUID();
 sql(`insert into public.account(id,name,status) values('${a}','Workflow synthetic A','activo'),('${b}','Workflow synthetic B','activo');`);
 const owner=await fixture(a),other=await fixture(b),member=await fixture(a,'cliente','miembro'),reviewer=await fixture(b,'analista'),publisher=await fixture(b,'analista'),collab=await fixture(b,'analista'),outsider=await fixture(b,'analista');
 sql(`insert into public.portal_collaborator_profile values('${collab.id}',true),('${outsider.id}',true);`);
 sql(`insert into public.portal_review_grant(account_id,user_id,can_publish) values('${a}','${reviewer.id}',false),('${a}','${publisher.id}',true);insert into public.portal_worker_scope values('${a}',true);`);
 const document={schema:1,stage:'marca',fields:{name:'Marca de prueba',offer:'Oferta sintética',objective:'Probar solicitudes',q_needs_launch:true,qnote_needs_launch:'Contexto seleccionado',q_offerTypes_product:false,qnote_offerTypes_product:'Nota privada desmarcada'}};
 const draft=(u,version,doc)=>api('rest','/rpc/portal_draft_save_v1',u.token,{p_key:crypto.randomUUID(),p_expected:version,p_document:doc});
 ok(await draft(owner,0,document));
 const asset=crypto.randomUUID();ok(await api('rest','/rpc/portal_draft_asset_put_v1',owner.token,{p_key:asset,p_kind:'logo',p_name:'synthetic.png',p_mime:'image/png',p_base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYo0AAAAASUVORK5CYII='}));
 document.fields.brand_logo=asset;ok(await draft(owner,1,document));
 const payload={version:2,assets:[asset],consent:'review-v1'},key=crypto.randomUUID();
 ok(await write(owner,'submit',null,{...payload,consent:null}),400);ok(await write(member,'submit',null,payload),403);
 ok(await write(owner,'submit',null,{...payload,assets:[crypto.randomUUID()]}),400);
 const receipt=ok(await write(owner,'submit',null,payload,key)),id=receipt.id;
 assert.deepEqual(ok(await write(owner,'submit',null,payload,key)),receipt);
 ok(await write(owner,'submit',null,{...payload,assets:[]},key),409);
 await login(owner);const read=ok(await rpc(owner,'read',id));
 assert.equal(read.snapshot.qnote_needs_launch,'Contexto seleccionado');assert.equal(read.snapshot.qnote_offerTypes_product,undefined);
 assert.equal(read.snapshot.brand_logo,undefined);assert.deepEqual(read.assets,[asset]);
 ok(await rpc(reviewer,'asset',id,{assetId:asset}));ok(await rpc(other,'asset',id,{assetId:asset}),403);
 ok(await draft(owner,2,{...document,fields:{name:'Cambio posterior'}}));
 assert.equal(ok(await rpc(owner,'read',id)).snapshot.name,'Marca de prueba');
 pass('Submission consent, immutable exact saved version, chosen files, private deselected notes, retry receipt and session recovery');
 ok(await rpc(other,'read',id),403);ok(await rpc(outsider,'read',id),403);ok(await rpc(member,'read',id),403);
 assert.equal(ok(await rpc(other,'inbox')).requests.length,0);
 for(const table of ['portal_request','portal_request_message','portal_request_job','portal_request_notice','portal_review_grant','portal_request_assignment'])ok(await api('rest','/'+table,owner.token,undefined,'GET'),403);
 ok(await api('rest','/rpc/portal_workflow_v1',jwt({role:'anon'}),{p_action:'inbox'}),401);
 const manage={revision:1,state:'reviewing',responsible:reviewer.id};
 const race=await Promise.all([write(reviewer,'manage',id,manage),write(publisher,'manage',id,manage)]);assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);
 pass('Real Auth, server account grants, no direct-table access and one winner for concurrent state changes');
 const mk=crypto.randomUUID();const msg=ok(await write(reviewer,'message',id,{audience:'internal',body:'Hipótesis interna'},mk));
 assert.deepEqual(ok(await write(reviewer,'message',id,{audience:'internal',body:'Hipótesis interna'},mk)),msg);
 ok(await write(owner,'message',id,{audience:'internal',body:'Intento'}),403);
 ok(await write(owner,'message',id,{audience:'collaborator',body:'Sin permiso'}),403);
 assert.equal(ok(await rpc(owner,'read',id)).messages.length,0);
 ok(await write(owner,'message',id,{audience:'client',body:'Mi aclaración'}));
 assert.equal(ok(await rpc(reviewer,'read',id)).messages.length,2);
 assert.equal(ok(await rpc(owner,'read',id)).messages.length,1);
 let notices=ok(await rpc(reviewer,'notices')).notices;assert.ok(notices.length>=3);
 ok(await write(reviewer,'mark_read',id,{noticeId:notices[0].id}));
 assert.ok(ok(await rpc(reviewer,'notices')).notices[0].read_at);
 assert.equal(ok(await rpc(publisher,'notices')).notices[0].read_at,null);
 pass('Persistent conversation audiences, replay without duplicates, per-member notices and read state');
 let job=worker('claim');
 while(job.requestId&&job.requestId!==id){worker('complete',job.requestId,job.lease,require('../../server/review-simulator.cjs').simulate(job));job=worker('claim');}
 assert.equal(job.requestId,id);
 assert.equal(worker('claim').job,null);
 const stale=job.lease;sql(`update public.portal_request_job set lease_until=now()-interval '1 second' where request_id='${id}';`);job=worker('claim');
 assert.notEqual(job.lease,stale);assert.throws(()=>worker('read',id,stale),/LEASE_INVALID/);
 worker('fail',id,job.lease);assert.equal(ok(await rpc(owner,'read',id)).analysis,undefined);
 ok(await write(reviewer,'retry_analysis',id));job=worker('claim');
 const result={requestId:id,draftVersion:2,mode:'simulation',method:'dv-review-simulator-v1',summary:'Simulación sin IA',facts:[{field:'name',value:'Marca de prueba'}],hypotheses:[],missing:['Prioridad por confirmar'],recommendation:'Revisión del equipo',proposedReturn:'Gracias. Revisaremos el contexto contigo.'};
 assert.throws(()=>worker('complete',id,crypto.randomUUID(),result),/LEASE_INVALID/);
 assert.throws(()=>worker('complete',id,job.lease,{...result,facts:[{field:'name',value:'Inventado'}]}),/SOURCE_INVALID/);
 worker('complete',id,job.lease,result);worker('complete',id,job.lease,result);
 assert.equal(ok(await rpc(owner,'read',id)).messages.length,1);
 assert.equal(ok(await rpc(reviewer,'read',id)).analysis.result.draftVersion,2);
 const publish={revision:2,approved:true,body:'Devolución aprobada para la prueba'};
 ok(await write(reviewer,'publish',id,publish),403);ok(await write(publisher,'publish',id,{...publish,approved:false}),400);
 ok(await write(publisher,'publish',id,publish));
 assert.equal(ok(await rpc(owner,'read',id)).messages.filter(x=>x.kind==='approved_return').length,1);
 pass('Leased analysis, expired lease recovery, failure/retry, source validation, original version, internal-only result and human publication gate');
 const assigned=ok(await write(reviewer,'assign',id,{userId:collab.id,mode:'collaboration',keys:['offer']}));
 ok(await rpc(collab,'read',id,{assignmentId:assigned.id}),403);
 const acceptKey=crypto.randomUUID();ok(await write(collab,'accept',id,{assignmentId:assigned.id},acceptKey));
 ok(await write(collab,'accept',id,{assignmentId:assigned.id},acceptKey));
 const limited=ok(await rpc(collab,'read',id,{assignmentId:assigned.id}));
 assert.deepEqual(limited.snapshot,{offer:'Oferta sintética'});assert.equal(limited.analysis,undefined);assert.equal(limited.messages.length,0);
 ok(await write(collab,'message',id,{assignmentId:assigned.id,audience:'collaborator',body:'Encargo aceptado'}));
 ok(await write(collab,'message',id,{assignmentId:assigned.id,audience:'client',body:'Intento'}),403);
 ok(await rpc(collab,'asset',id,{assignmentId:assigned.id,assetId:asset}),403);
 ok(await write(reviewer,'revoke',id,{assignmentId:assigned.id}));
 ok(await rpc(collab,'read',id,{assignmentId:assigned.id}),403);
 assert.equal(ok(await rpc(collab,'notices')).notices.length,0);
 const ref=ok(await write(reviewer,'assign',id,{userId:collab.id,mode:'referral',keys:['name','objective']}));
 assert.ok(!ok(await rpc(collab,'inbox')).invitations.some(x=>x.id===ref.id));
 ok(await write(collab,'accept',id,{assignmentId:ref.id}),403);
 ok(await write(owner,'consent_referral',id,{assignmentId:ref.id,approved:true}));
 ok(await write(collab,'accept',id,{assignmentId:ref.id}));
 assert.equal(ok(await rpc(collab,'read',id,{assignmentId:ref.id})).snapshot.objective,'Probar solicitudes');
 ok(await write(owner,'revoke',id,{assignmentId:ref.id}));ok(await rpc(collab,'read',id,{assignmentId:ref.id}),403);
 pass('Assignment acceptance, selected context only, separate channel, no assets or analysis, revocation and exact referral consent');
 const rejected=ok(await write(reviewer,'assign',id,{userId:collab.id,mode:'collaboration',keys:['offer']}));
 ok(await write(collab,'reject',id,{assignmentId:rejected.id}));ok(await write(collab,'accept',id,{assignmentId:rejected.id}),409);
 const expired=ok(await write(reviewer,'assign',id,{userId:collab.id,mode:'collaboration',keys:['offer']}));
 sql(`update public.portal_request_assignment set expires_at=now()-interval '1 second' where id='${expired.id}';`);
 ok(await write(collab,'accept',id,{assignmentId:expired.id}),403);
 const reassigned=ok(await write(reviewer,'assign',id,{userId:collab.id,mode:'collaboration',keys:['offer'],replace:expired.id}));
 ok(await write(collab,'accept',id,{assignmentId:reassigned.id}));
 sql(`update public.portal_review_grant set active=false where account_id='${a}' and user_id='${reviewer.id}';`);
 ok(await rpc(reviewer,'read',id),403);assert.equal(ok(await rpc(reviewer,'notices')).notices.length,0);
 sql(`update public.app_user set pending=true where id='${owner.id}';`);ok(await rpc(owner,'inbox'),403);
 sql(`update public.app_user set pending=false where id='${owner.id}';`);
 pass('Rejected/expired invitations, reassignment, current grant revocation and actor revocation');
 // Compare all pre-existing drafts, not just their count.
 const after=sql(`select coalesce(jsonb_agg(to_jsonb(d) order by account_id),'[]') from public.portal_brand_draft d where account_id<>'${a}';`);
 assert.equal(after,before);pass('All pre-existing draft documents and versions preserved byte-for-byte');
 fs.writeFileSync(path.join(L.dir,'workflow-users.json'),JSON.stringify({owner,other,member,reviewer,publisher,collab,outsider,account:a,requestId:id,assignmentId:reassigned.id}));
 fs.mkdirSync(path.join(L.root,'evidence/h12-workflow'),{recursive:true});
 fs.writeFileSync(path.join(L.root,'evidence/h12-workflow/provider-results.json'),JSON.stringify({status:'PASS',date:new Date().toISOString(),checks,scope:'loopback synthetic only; no hosted release'},null,2));
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
