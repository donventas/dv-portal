'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),L=require('./h12-workflow-local.cjs'),F=require('./h12-files.cjs'),P=require('./h12-profiles.cjs');
const out=path.resolve(L.root,'../evidence/h12-scope/collaborator-recommendations-20261026'),ok=F.ok;
const rec=(u,action,request=null,id=null,data={})=>L.api('rest','/rpc/portal_recommendation_v1',u.token,{p_action:action,p_request:request,p_id:id,p_data:data});
async function apply(){
 assert.equal(L.sql('select current_database();'),'portal_h10_disposable');
 const ddl=fs.readFileSync(path.join(L.root,'supabase/proposals/h12-recommendations.sql'),'utf8');
 const fn=s=>s.match(/create function public\.portal_professional_v1[\s\S]*?end \$\$;/)[0],body=s=>s.slice(s.indexOf('as $$')+5,-3).replaceAll('\r\n','\n').trim();
 const before=fs.readFileSync(path.join(out,'before/supabase/proposals/h12-professional-profiles.sql'),'utf8'),after=fs.readFileSync(path.join(L.root,'supabase/proposals/h12-professional-profiles.sql'),'utf8');
 const live=L.sql("select prosrc from pg_proc where oid='public.portal_professional_v1(text,uuid,uuid,uuid,jsonb)'::regprocedure;");assert.ok([before,after].some(s=>body(fn(s))===live.replaceAll('\r\n','\n').trim()),'Unrecognized live profile RPC');
 const exists=L.sql("select to_regclass('public.portal_recommendation') is not null;")==='t';
 let amendment='';
 if(exists){const previous=fs.readFileSync(path.join(out,'applied-recommendations.sql'),'utf8');
  if(previous!==ddl){
   const oldFn=previous.match(/create function public\.portal_recommendation_v1[\s\S]*?end \$\$;/)[0];
   assert.equal(body(oldFn),L.sql("select prosrc from pg_proc where oid='public.portal_recommendation_v1(text,uuid,uuid,jsonb)'::regprocedure;").replaceAll('\r\n','\n').trim(),'Unrecognized recommendation RPC');
   fs.writeFileSync(path.join(out,'before/applied-recommendations-before-preference-fix.sql'),previous);
   amendment='alter table public.portal_recommendation_preference add column if not exists recommendation_revision integer;'+ddl.match(/create function public\.portal_recommendation_v1[\s\S]*?end \$\$;/)[0].replace('create function','create or replace function');
  }
 }
 L.sql('begin;'+(exists?amendment:ddl)+fn(after).replace('create function','create or replace function')+"notify pgrst,'reload schema';commit;");
 fs.writeFileSync(path.join(out,'applied-recommendations.sql'),ddl);fs.writeFileSync(path.join(out,'applied-profiles.sql'),after);
}
async function fixture(u){
 const dates=JSON.parse(L.sql("select json_build_object('valid',current_date+2,'due',current_date+4,'delivery',current_date+7);"));
 const id=ok(await F.write(u.owner,'submit_improvement',null,{category:'explain',need:'Presentación para conversar con nuevos clientes. Ensayo de recomendación.',contextKeys:[],version:0,consent:'improvement-v1'})).id;
 const r=ok(await F.rpc(u.publisher,'read',id));ok(await F.write(u.publisher,'scope_propose',id,{revision:r.revision,outcome:'Presentación y guía de uso.',exclusions:'Sin publicación externa.',requirements:'Nada adicional.',rounds:1,deliveryOn:dates.delivery,validUntil:dates.valid,capacityConfirmed:true}));
 ok(await F.write(u.owner,'scope_accept',id,{scopeVersion:1,consent:'scope-lab-v1'}));return {id,dates};
}
async function ask(u,f){const id=crypto.randomUUID(),data={scopeVersion:1,userId:u.collab.id,brief:'Diseñar una presentación de servicios; consulta sintética sin datos privados del cliente.',dueOn:f.dates.due,validUntil:f.dates.valid,approved:true};ok(await rec(u.publisher,'ask',f.id,id,data));return {id,data};}
async function ready(u,f,a){let own=ok(await P.profile(u.collab,'own'));if(!own.authorizedVersion){ok(await P.profile(u.collab,'authorize',null,null,null,{revision:own.revision,consent:'portfolio-rights-v1'}));own=ok(await P.profile(u.collab,'own'));}let n=ok(await rec(u.collab,'inbox')).items.find(x=>x.id===a.id);ok(await rec(u.collab,'reply',f.id,a.id,{revision:n.revision,response:'available',profileVersion:own.authorizedVersion,consent:'request-profile-v1'}));n=ok(await rec(u.publisher,'list',f.id)).items.find(x=>x.id===a.id);ok(await rec(u.publisher,'offer',f.id,a.id,{revision:n.revision,profileVersion:n.profileVersion,reviewed:true,reason:'Su experiencia editorial encaja con la presentación que necesitas.'}));return n;}
async function prefer(actor,rid,id,mode='candidate',extra={}){const list=ok(await rec(actor,'list',rid)),n=list.items.find(x=>x.id===id);return rec(actor,'prefer',rid,id,{revision:list.preference?.revision||0,scopeVersion:list.scopeVersion,recommendationRevision:n?.revision,mode,...extra});}
async function run(){assert.ok(process.argv.includes('--authorized-local-h12'));await apply();const u=await F.users(),checks=[],pass=s=>{checks.push(s);console.log('PASS '+s);};
 const f=await fixture(u),f2=await fixture(u);
 for(const t of ['portal_recommendation','portal_recommendation_preference']){assert.equal(L.sql(`select relrowsecurity from pg_class where oid='public.${t}'::regclass;`),'t');assert.equal(L.sql(`select has_table_privilege('authenticated','public.${t}','select,insert,update,delete');`),'f');}
 assert.equal(L.sql("select has_function_privilege('anon','public.portal_recommendation_v1(text,uuid,uuid,jsonb)','execute');"),'f');
 for(const x of [u.collab,u.outsider,u.member])ok(await rec(x,'list',f.id),403);
 const a=await ask(u,f);ok(await rec(u.publisher,'ask',f.id,a.id,a.data));ok(await rec(u.publisher,'ask',f.id,crypto.randomUUID(),a.data),409);ok(await rec(u.owner,'ask',f.id,crypto.randomUUID(),a.data),403);
 assert.equal(ok(await rec(u.owner,'list',f.id)).items.length,0);ok(await F.rpc(u.collab,'read',f.id),403);
 const inbox=ok(await rec(u.collab,'inbox'));assert.ok(inbox.items.some(x=>x.id===a.id));assert.ok(!JSON.stringify(inbox).includes('snapshot'));ok(await rec(u.outsider,'reply',f.id,a.id,{revision:1,response:'declined'}),403);
 pass('Private RLS tables/no anonymous RPC; scoped summary only; no request access before assignment; ask retries do not duplicate; unrelated identities denied');
 const own=ok(await P.profile(u.collab,'own')),photo=own.draft.photoId;assert.ok(photo&&own.authorizedVersion);
 ok(await P.profile(u.publisher,'preview',f.id,u.collab.id,photo),403);
 ok(await rec(u.collab,'reply',f.id,a.id,{revision:1,response:'available',profileVersion:own.authorizedVersion}),400);
 const replies=await Promise.all([1,2].map(()=>rec(u.collab,'reply',f.id,a.id,{revision:1,response:'available',profileVersion:own.authorizedVersion,consent:'request-profile-v1'})));assert.deepEqual(replies.map(x=>x.status).sort(),[200,409]);
 let team=ok(await rec(u.publisher,'list',f.id)),n=team.items[0];assert.equal(n.profile.name,own.authorized.name);assert.ok(!JSON.stringify(n).includes('private_data'));ok(await P.profile(u.publisher,'preview',f.id,u.collab.id,photo));ok(await P.profile(u.owner,'preview',f.id,u.collab.id,photo),403);
 ok(await rec(u.owner,'offer',f.id,a.id,{revision:n.revision}),403);ok(await rec(u.publisher,'offer',f.id,a.id,{revision:n.revision,profileVersion:n.profileVersion,reason:'Encaja.'}),400);
 ok(await rec(u.publisher,'offer',f.id,a.id,{revision:n.revision,profileVersion:n.profileVersion,reason:'Experiencia editorial para explicar el servicio.',reviewed:true}));
 let client=ok(await rec(u.owner,'list',f.id));assert.equal(client.items.length,1);ok(await P.profile(u.owner,'preview',f.id,u.collab.id,photo));ok(await P.profile(u.owner,'preview',f2.id,u.collab.id,photo),403);ok(await F.rpc(u.collab,'read',f.id),403);
 pass('Availability requires exact profile consent; concurrent stale reply rejected; reviewer sees authorized profile before client; explicit review exposes exact media only in this request');
 ok(await rec(u.publisher,'confirm',f.id,a.id,{revision:client.items[0].revision,requestRevision:client.requestRevision,confirmed:true}),409);
 ok(await rec(u.collab,'prefer',f.id,a.id,{revision:0,mode:'candidate'}),403);ok(await prefer(u.owner,f.id,a.id));assert.equal(L.sql(`select count(*) from public.portal_request_assignment where request_id=${L.literal(f.id)};`),'0');
 client=ok(await rec(u.owner,'list',f.id));team=ok(await rec(u.publisher,'list',f.id));
 const confirm={revision:team.items[0].revision,preferenceRevision:team.preference.revision,requestRevision:team.requestRevision,confirmed:true};
 ok(await rec(u.publisher,'confirm',f.id,a.id,{...confirm,preferenceRevision:0}),409);const assigned=ok(await rec(u.publisher,'confirm',f.id,a.id,confirm));assert.ok(assigned.assignmentId);
 const retry=await rec(u.publisher,'confirm',f.id,a.id,confirm);assert.equal(retry.status,409);assert.equal(L.sql(`select count(*) from public.portal_request_assignment where request_id=${L.literal(f.id)};`),'1');
 ok(await F.rpc(u.collab,'read',f.id),403);ok(await F.write(u.collab,'work_accept',f.id,{assignmentId:assigned.assignmentId,scopeVersion:1,confirmed:true}));ok(await F.rpc(u.collab,'read',f.id,{assignmentId:assigned.assignmentId}));
 pass('Client preference is not assignment; publisher confirms against live preference/request revision; retries cannot duplicate; collaborator must separately accept before request access');
 ok(await F.write(u.publisher,'revoke',f.id,{assignmentId:assigned.assignmentId}));assert.equal(ok(await rec(u.owner,'list',f.id)).items.length,0);ok(await P.profile(u.owner,'preview',f.id,u.collab.id,photo),403);
 const b=await ask(u,f2);ok(await rec(u.collab,'reply',f2.id,b.id,{revision:1,response:'alternate',alternativeOn:f2.dates.delivery,note:'Necesito más tiempo.'}));assert.equal(ok(await rec(u.owner,'list',f2.id)).items.length,0);ok(await rec(u.publisher,'offer',f2.id,b.id,{revision:2,profileVersion:own.authorizedVersion,reviewed:true,reason:'No confirmada'}),400);
 ok(await rec(u.publisher,'withdraw',f2.id,b.id,{revision:2}));const b2=await ask(u,f2);ok(await rec(u.collab,'reply',f2.id,b2.id,{revision:1,response:'declined'}));assert.equal(ok(await rec(u.owner,'list',f2.id)).items.length,0);
 const b3=await ask(u,f2);await ready(u,f2,b3);ok(await prefer(u.owner,f2.id,null,'team'));
 let curr=ok(await P.profile(u.collab,'own'));ok(await P.profile(u.collab,'authorize',null,null,null,{revision:curr.revision,consent:'portfolio-rights-v1'}));assert.equal(ok(await rec(u.owner,'list',f2.id)).items.length,0);ok(await P.profile(u.owner,'preview',f2.id,u.collab.id,photo),403);
 n=ok(await rec(u.publisher,'list',f2.id)).items.find(x=>x.id===b3.id);ok(await rec(u.publisher,'confirm',f2.id,b3.id,{revision:n.revision,confirmed:true}),409);
 pass('Revoked assignment blocks recommended media; alternative date and decline never imply availability; new profile version removes recommendation until fresh consent/review');
 // Test expiry in the disposable fixture only, preserve row/history.
 L.sql(`update public.portal_recommendation set valid_until=current_date-1 where id=${L.literal(b3.id)};`);assert.equal(ok(await rec(u.collab,'inbox')).items.find(x=>x.id===b3.id).live,false);
 const third=await fixture(u),c=await ask(u,third);await ready(u,third,c);let rr=ok(await F.rpc(u.publisher,'read',third.id));ok(await F.write(u.publisher,'scope_propose',third.id,{revision:rr.revision,outcome:'Otro alcance.',exclusions:'Sin publicación.',requirements:'Nada adicional.',rounds:1,deliveryOn:third.dates.delivery,validUntil:third.dates.valid,capacityConfirmed:true}));assert.equal(ok(await rec(u.owner,'list',third.id)).items.length,0);ok(await rec(u.publisher,'confirm',third.id,c.id,{revision:3,confirmed:true}),409);
 const fresh=await F.users();assert.ok(ok(await rec(fresh.collab,'inbox')).items.some(x=>x.id===c.id));
 for(const id of [f.id,f2.id,third.id]){assert.equal(L.sql(`select count(*) from public.portal_request_job where request_id=${L.literal(id)};`),'0');assert.equal(L.sql(`select count(*) from public.portal_request_notice where request_id=${L.literal(id)} and mail_state<>'suppressed';`),'0');}
 pass('Expiry and changed/unaccepted scope invalidate recommendations; fresh distinct Auth sessions recover state; no AI jobs or real mail');
 // Same person/version on a new scope must not make the old recommendation selectable.
 ok(await F.write(u.owner,'scope_accept',third.id,{scopeVersion:2,consent:'scope-lab-v1'}));
 ok(await rec(u.owner,'prefer',third.id,null,{revision:0,scopeVersion:1,mode:'team'}),409);
 const freshId=crypto.randomUUID();ok(await rec(u.publisher,'ask',third.id,freshId,{...c.data,scopeVersion:2}));await ready(u,third,{id:freshId});
 ok(await rec(u.owner,'prefer',third.id,c.id,{revision:0,mode:'candidate',scopeVersion:2,recommendationRevision:3}),403);
 ok(await prefer(u.owner,third.id,freshId));const seen=ok(await rec(u.owner,'list',third.id)),seenRow=seen.items.find(x=>x.id===freshId);
 curr=ok(await P.profile(u.collab,'own'));ok(await P.profile(u.collab,'authorize',null,null,null,{revision:curr.revision,consent:'portfolio-rights-v1'}));
 await ready(u,third,{id:freshId});team=ok(await rec(u.publisher,'list',third.id));n=team.items.find(x=>x.id===freshId);assert.equal(team.preference.valid,false);ok(await rec(u.owner,'prefer',third.id,freshId,{revision:seen.preference.revision,scopeVersion:seen.scopeVersion,recommendationRevision:seenRow.revision,mode:'candidate'}),409);
 ok(await rec(u.publisher,'confirm',third.id,freshId,{revision:n.revision,preferenceRevision:team.preference.revision,requestRevision:team.requestRevision,confirmed:true}),409);
 ok(await prefer(u.owner,third.id,freshId));team=ok(await rec(u.publisher,'list',third.id));assert.equal(team.preference.valid,true);
 ok(await rec(u.publisher,'confirm',third.id,freshId,{revision:n.revision,preferenceRevision:team.preference.revision,requestRevision:team.requestRevision,confirmed:true}));
 assert.equal(ok(await rec(u.owner,'list',third.id)).preference.fulfilled,true);
 const completed=ok(await rec(u.publisher,'list',third.id)).items.find(x=>x.id===freshId);
 ok(await F.write(u.publisher,'revoke',third.id,{assignmentId:completed.assignmentId}));
 const replacement=crypto.randomUUID();ok(await rec(u.publisher,'ask',third.id,replacement,{...c.data,scopeVersion:2}));await ready(u,third,{id:replacement});
 ok(await prefer(u.owner,third.id,null,'team'));team=ok(await rec(u.publisher,'list',third.id));assert.equal(team.preference.fulfilled,false);assert.equal(team.preference.valid,true);
 const replacementRow=team.items.find(x=>x.id===replacement);
 ok(await rec(u.publisher,'confirm',third.id,replacement,{revision:replacementRow.revision,preferenceRevision:team.preference.revision,requestRevision:team.requestRevision,confirmed:true}));
 assert.equal(ok(await rec(u.owner,'list',third.id)).preference.fulfilled,true);
 pass('Independent-review regressions (including delayed click, stale delegation and fulfilled state): old-scope recommendation rejected even with same person/version; re-offered profile needs a fresh client preference tied to recommendation revision');
 fs.writeFileSync(path.join(out,'provider-results.json'),JSON.stringify({status:'PASS',checks,requestIds:[f.id,f2.id,third.id]},null,2));
}
module.exports={out,rec,fixture,ask,ready,apply};if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
