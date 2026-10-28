'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const L=require('./h12-workflow-local.cjs');assert.ok(process.argv.includes('--authorized-local-h12'));
const out=path.resolve(L.root,'../evidence/h12-scope/client-reception-20261026'),checks=[],ids=[];
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
 for(const name of ['auth_dv.review_can_submit','public.portal_workflow_v1']){
  const previous=find(before,name),next=find(after,name),applied=fs.existsSync(path.join(out,'applied-lab.sql'))?find(fs.readFileSync(path.join(out,'applied-lab.sql'),'utf8'),name):null;
  const current=L.sql(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=${L.literal(name.split('.')[0])} and p.proname=${L.literal(name.split('.')[1])};`);
  assert.ok(!current&&!previous||[previous,next,applied].filter(Boolean).some(x=>body(x)===current.replaceAll('\r\n','\n').trim()),'Unknown function '+name);changes.push(next.replace('create function','create or replace function'));
 }
 const exists=L.sql("select to_regclass('public.portal_delivery_response') is not null;")==='t';
 const schema=exists?'':after.match(/-- Client reception:[\s\S]*?\n\);/)[0]+"alter table public.portal_delivery_response enable row level security;revoke all on public.portal_delivery_response from public,anon,authenticated;";
 L.sql('begin;'+schema+changes.join('\n')+"revoke all on function auth_dv.review_can_submit(uuid,uuid) from public,anon,authenticated;notify pgrst,'reload schema';commit;");fs.writeFileSync(path.join(out,'applied-lab.sql'),after);
 assert.equal(L.sql("select relrowsecurity from pg_class where oid='public.portal_delivery_response'::regclass;"),'t');
 pass('Additive reception table and guarded RPC/helper in fixed disposable lab; RLS/no direct grants');
 const users=JSON.parse(fs.readFileSync(path.join(L.dir,'workflow-users.json')));for(const k of ['owner','publisher','collab','other','member','outsider'])await login(users[k]);
 const {owner,publisher,collab,other,member,outsider}=users,rev=async id=>ok(await rpc(publisher,'read',id)).revision;
 const dates=JSON.parse(L.sql("select json_build_object('valid',(clock_timestamp() at time zone 'America/Mexico_City')::date+2,'due',(clock_timestamp() at time zone 'America/Mexico_City')::date+4,'delivery',(clock_timestamp() at time zone 'America/Mexico_City')::date+7);"));
 const scope={revision:1,outcome:'Descripción en texto y guía de uso.',exclusions:'Sin archivos o publicación externa.',requirements:'Nada adicional.',rounds:1,deliveryOn:dates.delivery,validUntil:dates.valid,capacityConfirmed:true};
 async function fixture(rounds=1){const r=ok(await write(owner,'submit_improvement',null,{category:'explain',need:'Explicar mis servicios con claridad.',contextKeys:[],version:0,consent:'improvement-v1'}));ids.push(r.id);await write(publisher,'scope_propose',r.id,{...scope,rounds}).then(ok);await write(owner,'scope_accept',r.id,{scopeVersion:1,consent:'scope-lab-v1'}).then(ok);const a=ok(await write(publisher,'work_assign',r.id,{revision:await rev(r.id),scopeVersion:1,userId:collab.id,brief:'Preparar descripción breve.',dueOn:dates.due,keys:['improvement_need']}));ok(await write(collab,'work_accept',r.id,{assignmentId:a.id,scopeVersion:1,confirmed:true}));const d=ok(await write(collab,'delivery_submit',r.id,{assignmentId:a.id,scopeVersion:1,body:'Contenido publicado inicial.',usage:'Usar en el perfil.'}));ok(await write(publisher,'delivery_review',r.id,{assignmentId:a.id,deliveryId:d.id,revision:await rev(r.id),decision:'publish',note:'Revisado contra alcance.',approved:true}));return {id:r.id,aid:a.id,did:d.id};}
 const {id,aid,did}=await fixture();const feedback={deliveryId:did,revision:await rev(id),kind:'changes',focus:['clarity','use'],note:'CLIENTE PRIVADO: quiero un ejemplo para el primer contacto con hoteles.',confirmed:true},key=crypto.randomUUID();
 for(const u of [publisher,collab,other,member,outsider])ok(await write(u,'delivery_respond',id,feedback),403);
 ok(await write(owner,'delivery_respond',id,{...feedback,confirmed:false}),400);ok(await write(owner,'delivery_respond',id,{...feedback,note:' '}),400);
 const concurrent=await Promise.all([write(owner,'delivery_respond',id,feedback,key),write(owner,'delivery_respond',id,feedback,key)]);concurrent.forEach(r=>ok(r));assert.deepEqual(concurrent[0].data,concurrent[1].data);
 assert.equal(L.sql(`select count(*) from public.portal_delivery_response where delivery_id=${L.literal(did)};`),'1');assert.equal(ok(await rpc(publisher,'read',id)).work.roundsRemaining,1);
 let own=ok(await rpc(collab,'read',id,{assignmentId:aid}));assert.equal(own.work.canSubmit,false);assert.equal(own.work.items[0].response,null);assert.ok(!JSON.stringify(own).includes('CLIENTE PRIVADO'));
 pass('Only owner responds to exact latest publication; confirmation/detail required; concurrent retry creates one pending decision, consumes no round, hides private client note');
 const review={deliveryId:did,revision:await rev(id),decision:'accepted',note:'Añade un ejemplo de primer contacto para hoteles. Conserva la descripción principal.',approved:true},reviewKey=crypto.randomUUID();
 for(const u of [owner,collab,other])ok(await write(u,'response_review',id,review),403);
 ok(await write(publisher,'response_review',id,{...review,approved:false}),400);ok(await write(publisher,'response_review',id,review,reviewKey));ok(await write(publisher,'response_review',id,review,reviewKey));
 assert.equal(ok(await rpc(owner,'read',id)).work.roundsRemaining,0);own=ok(await rpc(collab,'read',id,{assignmentId:aid}));assert.equal(own.work.canSubmit,true);assert.equal(own.work.items[0].revisionInstruction,review.note);assert.ok(!JSON.stringify(own).includes('CLIENTE PRIVADO'));
 const original=L.sql(`select body||usage from public.portal_request_delivery where id=${L.literal(did)};`),second=ok(await write(collab,'delivery_submit',id,{assignmentId:aid,scopeVersion:1,body:'Contenido corregido para el primer contacto con hoteles.',usage:'Usar al abrir la reunión.'}));
 ok(await write(collab,'delivery_submit',id,{assignmentId:aid,scopeVersion:1,body:'Duplicado',usage:'Otro'}),400);
 assert.equal(ok(await rpc(owner,'read',id)).work.items.length,1);
 ok(await write(publisher,'delivery_review',id,{assignmentId:aid,deliveryId:second.id,revision:await rev(id),decision:'publish',note:'Segunda revisión de calidad.',approved:true}));assert.equal(ok(await rpc(collab,'read',id,{assignmentId:aid})).work.canSubmit,false);assert.equal(L.sql(`select body||usage from public.portal_request_delivery where id=${L.literal(did)};`),original);
 ok(await write(owner,'delivery_respond',id,feedback,key),409);ok(await write(publisher,'response_review',id,review,reviewKey),409);
 pass('Team accepts one included round; only authorized instruction reaches collaborator; revised content requires new review; old publication stays immutable and stale decisions/replays fail');
 const reception={deliveryId:second.id,revision:await rev(id),kind:'received',note:'',focus:[],confirmed:true},receiveKey=crypto.randomUUID();ok(await write(owner,'delivery_respond',id,reception,receiveKey));ok(await write(owner,'delivery_respond',id,reception,receiveKey));ok(await write(owner,'delivery_respond',id,{...reception,revision:await rev(id),kind:'changes',note:'Otro ajuste'}),409);
 for(const u of [owner,publisher,collab])await login(u);
 const customer=ok(await rpc(owner,'read',id));assert.equal(customer.work.items.find(x=>x.id===second.id).response.kind,'received');assert.equal(customer.work.items.length,2);assert.equal(ok(await rpc(publisher,'read',id)).work.items[0].response.kind,'received');assert.equal(ok(await rpc(collab,'read',id,{assignmentId:aid})).work.items[0].response,null);
 pass('Reception is version-specific and immutable; three fresh Auth sessions recover authorized history without exposing private decisions to collaborator');
 const exhausted=await fixture(0),tooMuch={...feedback,deliveryId:exhausted.did,revision:await rev(exhausted.id)};ok(await write(owner,'delivery_respond',exhausted.id,tooMuch));const more={...review,deliveryId:exhausted.did,revision:await rev(exhausted.id)};ok(await write(publisher,'response_review',exhausted.id,more),400);ok(await write(publisher,'response_review',exhausted.id,{...more,decision:'scope_needed',note:'Este cambio necesita un nuevo alcance. Te propondremos opciones.'}));assert.equal(ok(await rpc(collab,'read',exhausted.id,{assignmentId:exhausted.aid})).work.canSubmit,false);
 pass('Exhausted rounds still allow customer to ask; team must propose new scope, cannot authorize extra work or charge');
 const race=await fixture(),raceRevision=await rev(race.id),raceResult=await Promise.all([write(owner,'delivery_respond',race.id,{...feedback,deliveryId:race.did,revision:raceRevision}),write(owner,'delivery_respond',race.id,{...reception,deliveryId:race.did,revision:raceRevision})]);assert.equal(raceResult.filter(x=>x.status===200).length,1);assert.equal(raceResult.filter(x=>x.status===409).length,1);
 // Accepted owner intent must not carry over to a replacement scope, even when replayed.
 ok(await write(publisher,'scope_propose',id,{...scope,revision:await rev(id),outcome:'Un resultado distinto.'}));ok(await write(owner,'delivery_respond',id,reception,receiveKey),409);assert.equal(ok(await rpc(owner,'read',id)).work.items.length,2);
 pass('Concurrent reception/adjustment has one winner; scope replacement blocks old reply/replay but preserves published history');
 const list=ids.map(L.literal).join(',');assert.equal(L.sql(`select count(*) from public.portal_request_job where request_id in (${list});`),'0');assert.equal(L.sql(`select count(*) from public.portal_request_notice where request_id in (${list}) and mail_state<>'suppressed';`),'0');assert.equal(L.sql("select has_table_privilege('authenticated','public.portal_delivery_response','select,insert,update,delete');"),'f');assert.equal(L.sql("select has_function_privilege('authenticated','auth_dv.review_can_submit(uuid,uuid)','execute');"),'f');assert.equal(L.sql("select md5(coalesce(jsonb_agg(to_jsonb(d) order by account_id)::text,'[]')) from public.portal_brand_draft d;"),baseline);
 pass('No direct table/helper access; no jobs, mail or changes to saved brand drafts');
 fs.writeFileSync(path.join(out,'provider-results.json'),JSON.stringify({status:'PASS',checks,requestIds:ids,baselineDraftHash:baseline},null,2));
}
run().catch(e=>{console.error(e.stack?.replace(/Bearer\s+\S+/g,'[redacted]')||e.message);process.exitCode=1;});
