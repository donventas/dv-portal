'use strict';
// Authorized additive rehearsal. All destinations are fixed by the local helper.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const L=require('./h12-workflow-local.cjs');
assert.ok(process.argv.includes('--authorized-local-h12'));
const out=path.resolve(L.root,'../evidence/h12-scope/scope-acceptance-20261026'),checks=[],ids=[];
const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.data));return r.data;};
const rpc=(u,action,id=null,data={},key=null)=>L.api('rest','/rpc/portal_workflow_v1',u.token,{p_action:action,p_id:id,p_data:data,p_key:key});
const write=(u,a,id,data,key=crypto.randomUUID())=>rpc(u,a,id,data,key);
const pass=s=>{checks.push(s);console.log('PASS '+s);};
async function login(u){assert.ok(u.email.endsWith('@synthetic.invalid'));u.token=ok(await L.api('auth','/token?grant_type=password',L.jwt({role:'anon'}),{email:u.email,password:u.credential})).access_token;}
async function run(){
 assert.equal(L.sql('select current_database();'),'portal_h10_disposable');
 const baseline=L.sql("select md5(coalesce(jsonb_agg(to_jsonb(d) order by account_id)::text,'[]')) from public.portal_brand_draft d;");
 const previous=fs.readFileSync(path.join(out,'before/supabase/proposals/h12-workflow.sql'),'utf8'),source=fs.readFileSync(path.join(L.root,'supabase/proposals/h12-workflow.sql'),'utf8');
 const fn=s=>[...s.matchAll(/create function[\s\S]*?\$\$;/g)].map(x=>x[0]).find(x=>x.startsWith('create function public.portal_workflow_v1('));
 const body=s=>s.slice(s.indexOf('as $$')+5,-3).replaceAll('\r\n','\n').trim();
 const current=L.sql("select prosrc from pg_proc where oid='public.portal_workflow_v1(text,uuid,uuid,jsonb)'::regprocedure;");
 assert.ok([previous,source].some(s=>body(fn(s))===current.replaceAll('\r\n','\n').trim()),'Unknown RPC body; stop before applying');
 const table=source.match(/create table public\.portal_request_scope \([\s\S]*?\n\);/)[0];
 const exists=L.sql("select to_regclass('public.portal_request_scope') is not null;")==='t';
 if(exists){assert.equal(L.sql("select count(*) from information_schema.columns where table_schema='public' and table_name='portal_request_scope';"),'9');assert.equal(L.sql("select relrowsecurity from pg_class where oid='public.portal_request_scope'::regclass;"),'t');}
 L.sql('begin;'+(!exists?table+"alter table public.portal_request_scope enable row level security;revoke all on public.portal_request_scope from public,anon,authenticated;":'')+fn(source).replace('create function','create or replace function')+"notify pgrst,'reload schema';commit;");
 pass('Additive fixed laboratory migration: one private RLS table and one reviewed RPC; original drafts preserved');
 const users=JSON.parse(fs.readFileSync(path.join(L.dir,'workflow-users.json')));for(const k of ['owner','publisher','other','member','outsider','collab'])await login(users[k]);
 const {owner,publisher,other,member,outsider,collab}=users;
 const dates=JSON.parse(L.sql("select json_build_object('valid',(clock_timestamp() at time zone 'America/Mexico_City')::date+3,'delivery',(clock_timestamp() at time zone 'America/Mexico_City')::date+7,'past',(clock_timestamp() at time zone 'America/Mexico_City')::date-1);") );
 const proposal={revision:1,outcome:'Una presentación de 8 láminas con diseño y archivo PDF.',exclusions:'No incluye impresión, fotografía ni desarrollo de sitio web.',requirements:'Logo autorizado y lista de servicios.',rounds:1,deliveryOn:dates.delivery,validUntil:dates.valid,capacityConfirmed:true};
 async function request(){const r=ok(await write(owner,'submit_improvement',null,{category:'sales',need:'Necesito presentar mis servicios en una reunión.',contextKeys:[],version:0,consent:'improvement-v1'}));ids.push(r.id);return r.id;}
 const id=await request(),key=crypto.randomUUID(),first=ok(await write(publisher,'scope_propose',id,proposal,key));assert.equal(first.scopeVersion,1);
 assert.deepEqual(ok(await write(publisher,'scope_propose',id,proposal,key)),first);ok(await write(publisher,'scope_propose',id,{...proposal,outcome:'Diferente'},key),409);
 for(const u of [owner,other,member,outsider,collab])ok(await write(u,'scope_propose',id,proposal),403);
 for(const u of [publisher,other,member,outsider,collab])ok(await write(u,'scope_accept',id,{scopeVersion:1,consent:'scope-lab-v1'}),403);
 for(const bad of [{...proposal,revision:2,capacityConfirmed:false},{...proposal,revision:2,validUntil:dates.delivery},{...proposal,revision:2,deliveryOn:'2026-02-31'},{...proposal,revision:2,validUntil:dates.past},{...proposal,revision:2,price:99},{...proposal,revision:2,rounds:6}])ok(await write(publisher,'scope_propose',id,bad),400);
 ok(await write(owner,'scope_accept',id,{scopeVersion:1,consent:'missing'}),400);
 ok(await write(publisher,'scope_propose',id,proposal),409);
 pass('Strict proposal/consent/date contracts and roles enforced; stale proposal revision and altered retries rejected');
 const acceptKey=crypto.randomUUID(),acceptData={scopeVersion:1,consent:'scope-lab-v1'};
 const accepted=await Promise.all([write(owner,'scope_accept',id,acceptData,acceptKey),write(owner,'scope_accept',id,acceptData,acceptKey)]);accepted.forEach(r=>ok(r));assert.deepEqual(accepted[0].data,accepted[1].data);
 assert.deepEqual(ok(await write(owner,'scope_accept',id,acceptData)),accepted[0].data);
 const v1=ok(await rpc(owner,'read',id)).scopes[0];assert.equal(v1.status,'accepted');assert.equal(v1.acceptedBy,owner.id);
 const revision=ok(await rpc(publisher,'read',id)).revision;
 const v2=ok(await write(publisher,'scope_propose',id,{...proposal,revision,outcome:'Una presentación de 10 láminas con diseño y archivo PDF.'}));assert.equal(v2.scopeVersion,2);
 ok(await write(owner,'scope_accept',id,acceptData),409);
 let history=ok(await rpc(owner,'read',id)).scopes;assert.equal(history[0].status,'proposed');assert.equal(history[0].acceptedAt,null);assert.equal(history[1].status,'superseded');assert.equal(history[1].acceptedAt,v1.acceptedAt);assert.deepEqual(history[1].definition,v1.definition);
 ok(await write(owner,'scope_accept',id,{scopeVersion:2,consent:'scope-lab-v1'}));
 await login(owner);await login(publisher);history=ok(await rpc(owner,'read',id)).scopes;assert.equal(history[0].status,'accepted');assert.deepEqual(ok(await rpc(publisher,'read',id)).scopes,history);
 pass('Concurrent acceptance is immutable and idempotent; revised scope requires fresh acceptance; new Auth sessions recover full history');
 // Revocation and expiry rehearsals are transactional and rolled back. No lasting permission change.
 function rollbackProbe(setup,u,action,data,k,code){
  L.sql(`begin;${setup}select set_config('request.jwt.claims',${L.literal(JSON.stringify({sub:u.id,role:'authenticated',session_id:JSON.parse(Buffer.from(u.token.split('.')[1],'base64url')).session_id}))},true);do $$ begin if (auth_dv.me()).id is distinct from ${L.literal(u.id)}::uuid then raise exception 'PROBE_SESSION_INVALID';end if;begin perform public.portal_workflow_v1(${L.literal(action)},${L.literal(id)}::uuid,${L.literal(k)}::uuid,${L.literal(JSON.stringify(data))}::jsonb);raise exception 'EXPECTED_REJECTION';exception when sqlstate '${code}' then null;end;end $$;rollback;`);
 }
 rollbackProbe(`update public.portal_review_grant set can_publish=false where account_id=${L.literal(users.account)} and user_id=${L.literal(publisher.id)};`,publisher,'scope_propose',proposal,key,'42501');
 rollbackProbe(`update public.portal_request_scope set accepted_by=null,accepted_at=null,valid_until=${L.literal(dates.past)}::date where request_id=${L.literal(id)} and version=2;`,owner,'scope_accept',{scopeVersion:2,consent:'scope-lab-v1'},crypto.randomUUID(),'22023');
 rollbackProbe(`update public.portal_request set state='closed' where id=${L.literal(id)};`,owner,'scope_accept',{scopeVersion:2,consent:'scope-lab-v1'},crypto.randomUUID(),'22023');
 pass('Revoked can_publish blocks receipt replay; expired or closed proposals cannot be accepted (rollback-only probes)');
 const raceId=await request();ok(await write(publisher,'scope_propose',raceId,proposal));
 const race=await Promise.all([write(owner,'scope_accept',raceId,{scopeVersion:1,consent:'scope-lab-v1'}),write(publisher,'scope_propose',raceId,{...proposal,revision:2,outcome:'Alcance revisado concurrente.'})]);
 assert.ok(race.some(x=>x.status===200));assert.ok(race.every(x=>[200,409].includes(x.status)));
 const raceRead=ok(await rpc(owner,'read',raceId));if(raceRead.scopes[0].version===2)assert.equal(raceRead.scopes[0].acceptedAt,null);else assert.equal(raceRead.scopes[0].status,'accepted');
 pass('Proposal/acceptance race serializes; no acceptance transfers to a new version');
 // Accepted collaborator sees only assignment subset, never scope/history/customer terms.
 const assignment=ok(await write(publisher,'assign',id,{userId:collab.id,mode:'collaboration',keys:['improvement_need']}));
 const assignmentId=assignment.id||assignment.assignmentId;assert.ok(assignmentId);ok(await write(collab,'accept',id,{assignmentId}));
 assert.equal(ok(await rpc(collab,'read',id,{assignmentId})).scopes,undefined);
 for(const u of [other,member,outsider])ok(await rpc(u,'read',id),403);
 assert.equal(L.sql("select has_table_privilege('authenticated','public.portal_request_scope','select,insert,update,delete');"),'f');
 const list=ids.map(L.literal).join(',');assert.equal(L.sql(`select count(*) from public.portal_request_job where request_id in (${list});`),'0');assert.equal(L.sql(`select count(*) from public.portal_request_notice where request_id in (${list}) and mail_state<>'suppressed';`),'0');
 assert.equal(L.sql("select md5(coalesce(jsonb_agg(to_jsonb(d) order by account_id)::text,'[]')) from public.portal_brand_draft d;"),baseline);
 pass('Collaborator cannot read scope/history, other accounts excluded, no direct table access, no AI jobs or queued mail');
 fs.writeFileSync(path.join(out,'provider-results.json'),JSON.stringify({status:'PASS',checks,requestIds:ids,baselineDraftHash:baseline,scope:'loopback disposable laboratory only'},null,2));
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
