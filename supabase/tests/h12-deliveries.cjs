'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const L=require('./h12-workflow-local.cjs');assert.ok(process.argv.includes('--authorized-local-h12'));
const out=path.resolve(L.root,'../evidence/h12-scope/collaboration-delivery-20261026'),checks=[],ids=[];
const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.data));return r.data;};
const rpc=(u,a,id=null,data={},key=null)=>L.api('rest','/rpc/portal_workflow_v1',u.token,{p_action:a,p_id:id,p_data:data,p_key:key});
const write=(u,a,id,data,key=crypto.randomUUID())=>rpc(u,a,id,data,key),pass=s=>{checks.push(s);console.log('PASS '+s);};
async function login(u){assert.ok(u.email.endsWith('@synthetic.invalid'));u.token=ok(await L.api('auth','/token?grant_type=password',L.jwt({role:'anon'}),{email:u.email,password:u.credential})).access_token;}
async function run(){
 assert.equal(L.sql('select current_database();'),'portal_h10_disposable');
 const baseline=L.sql("select md5(coalesce(jsonb_agg(to_jsonb(d) order by account_id)::text,'[]')) from public.portal_brand_draft d;");
 const before=fs.readFileSync(path.join(out,'before/supabase/proposals/h12-workflow.sql'),'utf8'),after=fs.readFileSync(path.join(L.root,'supabase/proposals/h12-workflow.sql'),'utf8');
 const find=(s,name)=>[...s.matchAll(/create function[\s\S]*?\$\$;/g)].map(x=>x[0]).find(x=>x.startsWith('create function '+name+'('));
 const body=s=>s.slice(s.indexOf('as $$')+5,-3).replaceAll('\r\n','\n').trim();let changes=[];
 for(const name of ['auth_dv.review_scope_current','auth_dv.review_assignment','auth_dv.review_notice_visible','public.portal_workflow_v1']){
  const previous=find(before,name),next=find(after,name);assert.ok(next);
  const current=L.sql(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=${L.literal(name.split('.')[0])} and p.proname=${L.literal(name.split('.')[1])};`);
  const applied=fs.existsSync(path.join(out,'applied-lab.sql'))?find(fs.readFileSync(path.join(out,'applied-lab.sql'),'utf8'),name):null;
  assert.ok(!current&&!previous||[previous,next,applied].filter(Boolean).some(x=>body(x)===current.replaceAll('\r\n','\n').trim()),'Unknown function '+name);
  changes.push(next.replace('create function','create or replace function'));
 }
 const exists=L.sql("select to_regclass('public.portal_request_delivery') is not null;")==='t';
 let schema='';if(!exists){assert.equal(L.sql("select count(*) from information_schema.columns where table_name='portal_request_assignment' and column_name in ('scope_version','brief','due_on');"),'0');schema=after.match(/-- Additive collaboration\/delivery slice[\s\S]*?\n\);/)[0]+"alter table public.portal_request_delivery enable row level security;revoke all on public.portal_request_delivery from public,anon,authenticated;";}
 else {assert.equal(L.sql("select count(*) from information_schema.columns where table_name='portal_request_delivery';"),'13');assert.equal(L.sql("select relrowsecurity from pg_class where oid='public.portal_request_delivery'::regclass;"),'t');}
 L.sql('begin;'+schema+changes.join('\n')+"revoke all on function auth_dv.review_scope_current(uuid,integer) from public,anon,authenticated;notify pgrst,'reload schema';commit;");
 fs.writeFileSync(path.join(out,'applied-lab.sql'),after);
 pass('Additive fixed lab schema/RPC migration; private delivery table and scoped helper, no reset or new user grants');
 const users=JSON.parse(fs.readFileSync(path.join(L.dir,'workflow-users.json')));for(const k of ['owner','publisher','collab','other','member','outsider'])await login(users[k]);
 const {owner,publisher,collab,other,member,outsider}=users;
 const dates=JSON.parse(L.sql("select json_build_object('valid',(clock_timestamp() at time zone 'America/Mexico_City')::date+2,'due',(clock_timestamp() at time zone 'America/Mexico_City')::date+4,'delivery',(clock_timestamp() at time zone 'America/Mexico_City')::date+7);"));
 const scope={revision:1,outcome:'Una descripción comercial en texto con explicación de uso.',exclusions:'Sin deck, imágenes, archivos ni publicación externa.',requirements:'Nada adicional.',rounds:1,deliveryOn:dates.delivery,validUntil:dates.valid,capacityConfirmed:true};
 async function request(){const r=ok(await write(owner,'submit_improvement',null,{category:'explain',need:'Quiero explicar mi negocio de forma clara.',contextKeys:[],version:0,consent:'improvement-v1'}));ids.push(r.id);return r.id;}
 async function rev(id){return ok(await rpc(publisher,'read',id)).revision;}
 const id=await request();ok(await write(publisher,'work_assign',id,{}),400);ok(await write(publisher,'scope_propose',id,scope));ok(await write(owner,'scope_accept',id,{scopeVersion:1,consent:'scope-lab-v1'}));
 const assignData={revision:await rev(id),scopeVersion:1,userId:collab.id,brief:'Redacta una descripción de 80 a 120 palabras y explica cómo usarla.',dueOn:dates.due,keys:['improvement_need']},assignKey=crypto.randomUUID();
 ok(await write(owner,'work_assign',id,assignData),403);ok(await write(publisher,'assign',id,{userId:collab.id,mode:'collaboration',keys:['improvement_need']}),400);ok(await write(publisher,'publish',id,{revision:await rev(id),approved:true,body:'Bypass'}),400);
 const assignment=ok(await write(publisher,'work_assign',id,assignData,assignKey));assert.deepEqual(ok(await write(publisher,'work_assign',id,assignData,assignKey)),assignment);const aid=assignment.id;
 ok(await write(collab,'accept',id,{assignmentId:aid}),400);ok(await write(collab,'work_accept',id,{assignmentId:aid,scopeVersion:1,confirmed:false}),400);
 const invitation=ok(await rpc(collab,'inbox')).invitations.find(x=>x.id===aid);assert.equal(invitation.brief,assignData.brief);assert.equal(invitation.scopeVersion,1);
 ok(await write(collab,'work_accept',id,{assignmentId:aid,scopeVersion:1,confirmed:true}));
 const assigned=ok(await rpc(collab,'read',id,{assignmentId:aid}));assert.equal(assigned.scopes,undefined);assert.deepEqual(Object.keys(assigned.snapshot),['improvement_need']);assert.equal(assigned.work.assignment.scopeVersion,1);
 pass('Only accepted current scope can be assigned; explicit collaborator acceptance; minimal brief; legacy assignment/publication/accept paths blocked');
 const payload={assignmentId:aid,scopeVersion:1,body:'BORRADOR PRIVADO: Ayudamos a negocios a explicar lo que ofrecen.',usage:'Usar como introducción comercial.'},submitKey=crypto.randomUUID();
 for(const u of [owner,other,member,outsider])ok(await write(u,'delivery_submit',id,payload),403);
 const submitted=await Promise.all([write(collab,'delivery_submit',id,payload,submitKey),write(collab,'delivery_submit',id,payload,submitKey)]);submitted.forEach(x=>ok(x));assert.deepEqual(submitted[0].data,submitted[1].data);const first=submitted[0].data;
 assert.equal(first.version,1);ok(await write(collab,'delivery_submit',id,payload),400);let client=ok(await rpc(owner,'read',id));assert.deepEqual(client.work.items,[]);assert.ok(!JSON.stringify(client).includes('BORRADOR PRIVADO'));
 const review1={assignmentId:aid,deliveryId:first.id,revision:await rev(id),decision:'changes',note:'NOTA INTERNA: concreta el público y elimina generalidades.',approved:true};
 ok(await write(collab,'delivery_review',id,review1),403);ok(await write(publisher,'delivery_review',id,{...review1,approved:false}),400);ok(await write(publisher,'delivery_review',id,review1));
 assert.equal(ok(await rpc(collab,'read',id,{assignmentId:aid})).work.items[0].reviewNote,review1.note);assert.ok(!JSON.stringify(ok(await rpc(owner,'read',id))).includes('NOTA INTERNA'));
 pass('Concurrent advance submission creates one immutable version; client cannot see drafts/feedback; collaborator cannot publish');
 const second=ok(await write(collab,'delivery_submit',id,{...payload,body:'Ayudamos a pequeños negocios de servicios a explicar su oferta con claridad y materiales coherentes.',usage:'Úsalo como introducción en tu perfil y al presentar tus servicios.'}));assert.equal(second.version,2);
 ok(await write(publisher,'delivery_review',id,{...review1,revision:await rev(id)}),409);
 const publishData={...review1,deliveryId:second.id,revision:await rev(id),decision:'publish',note:'NOTA INTERNA: revisé claridad, alcance y uso.'},publishKey=crypto.randomUUID();
 const publication=ok(await write(publisher,'delivery_review',id,publishData,publishKey));assert.equal(publication.state,'published');assert.deepEqual(ok(await write(publisher,'delivery_review',id,publishData,publishKey)),publication);
 client=ok(await rpc(owner,'read',id));assert.equal(client.work.items.length,1);assert.equal(client.work.items[0].version,2);assert.equal(client.work.items[0].scopeVersion,1);assert.equal(client.work.items[0].reviewNote,null);assert.ok(!JSON.stringify(client).includes('NOTA INTERNA'));
 for(const u of [owner,publisher,collab])await login(u);assert.equal(ok(await rpc(owner,'read',id)).work.items[0].id,second.id);assert.equal(ok(await rpc(collab,'read',id,{assignmentId:aid})).work.items.length,2);
 pass('Correction creates version 2; exact reviewed version published once; three new Auth sessions recover only their authorized data');
 function probe(setup,u,a,data,key,code){const claims={sub:u.id,role:'authenticated',session_id:JSON.parse(Buffer.from(u.token.split('.')[1],'base64url')).session_id};L.sql(`begin;${setup}select set_config('request.jwt.claims',${L.literal(JSON.stringify(claims))},true);do $$ begin if (auth_dv.me()).id is distinct from ${L.literal(u.id)}::uuid then raise exception 'PROBE_SESSION_INVALID';end if;begin perform public.portal_workflow_v1(${L.literal(a)},${L.literal(id)}::uuid,${L.literal(key)}::uuid,${L.literal(JSON.stringify(data))}::jsonb);raise exception 'EXPECTED_REJECTION';exception when sqlstate '${code}' then null;end;end $$;rollback;`);}
 probe(`update public.portal_request_assignment set state='revoked' where id=${L.literal(aid)};`,collab,'delivery_submit',payload,submitKey,'42501');
 probe(`update public.portal_request_assignment set expires_at=now()-interval '1 minute' where id=${L.literal(aid)};`,publisher,'delivery_review',publishData,publishKey,'22023');
 probe(`update public.portal_request_assignment set expires_at=now()-interval '1 minute' where id=${L.literal(aid)};`,collab,'read',{assignmentId:aid},crypto.randomUUID(),'42501');
 probe(`update public.portal_request_assignment set expires_at=now()-interval '1 minute' where id=${L.literal(aid)};`,collab,'delivery_submit',payload,submitKey,'42501');
 const claims={sub:collab.id,role:'authenticated',session_id:JSON.parse(Buffer.from(collab.token.split('.')[1],'base64url')).session_id};
 const expired=JSON.parse(L.sql(`begin;update public.portal_request_assignment set expires_at=now()-interval '1 minute' where id=${L.literal(aid)};select set_config('request.jwt.claims',${L.literal(JSON.stringify(claims))},true);select public.portal_workflow_v1('inbox');rollback;`).split('\n').at(-1)).invitations.find(x=>x.id===aid);
 assert.equal(expired.state,'expired');assert.equal(expired.brief,null);
 probe(`update public.portal_review_grant set can_publish=false where account_id=${L.literal(users.account)} and user_id=${L.literal(publisher.id)};`,publisher,'delivery_review',publishData,publishKey,'42501');
 pass('Revocation, expiry and removed publish permission block receipt replay (valid Auth, rollback-only probes)');
 // Scope replacement revokes effective work authority without deleting the published history.
 ok(await write(publisher,'scope_propose',id,{...scope,revision:await rev(id),outcome:'Nueva descripción con otro enfoque.'}));ok(await rpc(collab,'read',id,{assignmentId:aid}),403);ok(await write(collab,'delivery_submit',id,payload,submitKey),403);
 assert.equal(ok(await rpc(owner,'read',id)).work.items[0].id,second.id);const outdated=ok(await rpc(collab,'inbox')).invitations.find(x=>x.id===aid);assert.equal(outdated.state,'outdated');assert.equal(outdated.brief,null);
 ok(await write(owner,'scope_accept',id,{scopeVersion:2,consent:'scope-lab-v1'}));ok(await write(publisher,'work_assign',id,assignData,assignKey),409);
 pass('New scope blocks old assignment/advance replay, removes its brief from inbox, and preserves published customer history');
 async function prepare(){const rid=await request();ok(await write(publisher,'scope_propose',rid,scope));ok(await write(owner,'scope_accept',rid,{scopeVersion:1,consent:'scope-lab-v1'}));return rid;}
 async function invite(rid){return ok(await write(publisher,'work_assign',rid,{...assignData,revision:await rev(rid)})).id;}
 const raceId=await prepare(),declined=await invite(raceId);
 ok(await write(collab,'work_reject',raceId,{assignmentId:declined,scopeVersion:1,confirmed:true}));ok(await rpc(collab,'read',raceId,{assignmentId:declined}),403);
 const withdrawn=await invite(raceId);ok(await write(publisher,'revoke',raceId,{assignmentId:withdrawn}));ok(await write(collab,'work_accept',raceId,{assignmentId:withdrawn,scopeVersion:1,confirmed:true}),403);
 const raceAid=await invite(raceId);ok(await write(collab,'work_accept',raceId,{assignmentId:raceAid,scopeVersion:1,confirmed:true}));
 pass('Decline and withdrawal both allow a new explicit invitation; superseded recipients cannot open or accept old work');
 const raceDelivery=ok(await write(collab,'delivery_submit',raceId,{...payload,assignmentId:raceAid})),revision=await rev(raceId);
 const concurrent=await Promise.all([write(publisher,'delivery_review',raceId,{...publishData,assignmentId:raceAid,deliveryId:raceDelivery.id,revision}),write(publisher,'scope_propose',raceId,{...scope,revision,outcome:'Alcance revisado durante la revisión.'})]);
 assert.equal(concurrent.filter(x=>x.status===200).length,1);assert.ok(concurrent.every(x=>[200,400,409].includes(x.status)),JSON.stringify(concurrent));
 assert.equal(L.sql(`select state from public.portal_request_delivery where id=${L.literal(raceDelivery.id)};`),concurrent[0].status===200?'published':'submitted');
 const revokeId=await prepare(),revokeAid=await invite(revokeId);ok(await write(collab,'work_accept',revokeId,{assignmentId:revokeAid,scopeVersion:1,confirmed:true}));const revokeDelivery=ok(await write(collab,'delivery_submit',revokeId,{...payload,assignmentId:revokeAid}));
 const revokeRevision=await rev(revokeId),revokeRace=await Promise.all([write(publisher,'revoke',revokeId,{assignmentId:revokeAid}),write(publisher,'delivery_review',revokeId,{...publishData,assignmentId:revokeAid,deliveryId:revokeDelivery.id,revision:revokeRevision})]);
 ok(revokeRace[0]);assert.ok([200,400,403,409].includes(revokeRace[1].status));ok(await rpc(collab,'read',revokeId,{assignmentId:revokeAid}),403);
 assert.equal(L.sql(`select state from public.portal_request_delivery where id=${L.literal(revokeDelivery.id)};`),revokeRace[1].status===200?'published':'submitted');
 pass('Concurrent scope change/publication has one winning revision; withdrawal/publication serializes and leaves no collaborator access');
 for(const u of [other,member,outsider])ok(await rpc(u,'read',id),403);
 assert.equal(L.sql("select has_table_privilege('authenticated','public.portal_request_delivery','select,insert,update,delete');"),'f');assert.equal(L.sql("select has_function_privilege('authenticated','auth_dv.review_scope_current(uuid,integer)','execute');"),'f');
 const list=ids.map(L.literal).join(',');assert.equal(L.sql(`select count(*) from public.portal_request_job where request_id in (${list});`),'0');assert.equal(L.sql(`select count(*) from public.portal_request_notice where request_id in (${list}) and mail_state<>'suppressed';`),'0');assert.equal(L.sql("select md5(coalesce(jsonb_agg(to_jsonb(d) order by account_id)::text,'[]')) from public.portal_brand_draft d;"),baseline);
 pass('Cross-account isolation, no direct table/helper access, no AI jobs/queued mail; all existing brand drafts preserved');
 fs.writeFileSync(path.join(out,'provider-results.json'),JSON.stringify({status:'PASS',checks,requestIds:ids,assignmentId:aid,deliveryId:second.id,baselineDraftHash:baseline,scope:'Fixed loopback disposable laboratory only'},null,2));
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
