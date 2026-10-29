'use strict';
// Explicit, additive rehearsal against the fixed disposable laboratory only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.ok(process.argv.includes('--authorized-local-h12'));
const L=require('./h12-workflow-local.cjs'),out=path.resolve(L.root,'../evidence/h12-scope/connected-improvements-20261026');
const checks=[],pass=x=>{checks.push(x);console.log('PASS '+x);};
const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.data));return r.data;};
const rpc=(u,action,id=null,data={},key=null)=>L.api('rest','/rpc/portal_workflow_v1',u.token,{p_action:action,p_id:id,p_data:data,p_key:key});
const write=(u,action,id,data,key=crypto.randomUUID())=>rpc(u,action,id,data,key);
async function login(u){assert.ok(u.email.endsWith('@synthetic.invalid'));u.token=ok(await L.api('auth','/token?grant_type=password',L.jwt({role:'anon'}),{email:u.email,password:u.credential})).access_token;}
async function run(){
 assert.equal(L.sql('select current_database();'),'portal_h10_disposable');
 const baseline=L.sql("select md5(coalesce(jsonb_agg(to_jsonb(d) order by account_id)::text,'[]')) from public.portal_brand_draft d;");
 const before=fs.readFileSync(path.join(out,'before/supabase/proposals/h12-workflow.sql'),'utf8'),after=fs.readFileSync(path.join(L.root,'supabase/proposals/h12-workflow.sql'),'utf8');
 const replacements=[];
 for(const name of ['auth_dv.review_notify','public.portal_workflow_v1']){
  const find=source=>[...source.matchAll(/create function[\s\S]*?\$\$;/g)].map(m=>m[0]).find(x=>x.startsWith('create function '+name+'('));
  const a=find(before),b=find(after);assert.ok(a&&b);
  const normalize=x=>x.replaceAll('\r\n','\n').trim(),body=x=>x.slice(x.indexOf('as $$')+5,-3);
  const current=L.sql(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=${L.literal(name.split('.')[0])} and p.proname=${L.literal(name.split('.')[1])};`);
  assert.ok([body(a),body(b)].some(x=>normalize(x)===normalize(current)),'Unexpected laboratory function: '+name);
  replacements.push(b.replace('create function','create or replace function'));
 }
 L.sql('begin;'+replacements.join('\n')+"\nnotify pgrst,'reload schema';commit;");
 pass('Fixed disposable DB; only two reviewed functions replaced, no reset/reseed or grants');
 const users=JSON.parse(fs.readFileSync(path.join(L.dir,'workflow-users.json')));for(const k of ['owner','publisher','other','member','outsider','collab'])await login(users[k]);
 const {owner,publisher,other,member,outsider,collab}=users,ids=[];
 const payload={category:'explain',need:'Necesidad sintética de mejora.',contextKeys:[],version:0,consent:'improvement-v1'};
 for(const category of ['explain','identity','sales','content','web','spaces']){
  const key=crypto.randomUUID(),data={...payload,category};const receipt=ok(await write(owner,'submit_improvement',null,data,key));ids.push(receipt.id);
  assert.deepEqual(ok(await write(owner,'submit_improvement',null,data,key)),receipt);
  ok(await write(owner,'submit_improvement',null,{...data,need:'Otro contenido'},key),409);
  const read=ok(await rpc(owner,'read',receipt.id));assert.equal(read.snapshot.improvement_category,category);assert.equal(read.draftVersion,0);assert.deepEqual(read.assets,[]);
 }
 pass('Six categories persist with empty context; exact retry returns one folio, changed payload conflicts');
 const id=ids[0];
 for(const u of [other,member,outsider,collab])ok(await rpc(u,'read',id),403);
 for(const u of [member,publisher])ok(await write(u,'submit_improvement',null,payload),403);
 ok(await write(owner,'submit_improvement',null,{...payload,category:'forged'}),400);
 ok(await write(owner,'submit_improvement',null,{...payload,need:' '}),400);
 ok(await write(owner,'submit_improvement',null,{...payload,consent:null}),400);
 ok(await write(owner,'submit_improvement',null,{...payload,account_id:other.id}),400);
 const draft=ok(await L.api('rest','/rpc/portal_draft_open_v1',owner.token,{})),keys=Object.keys(draft.document.fields).filter(k=>['name','offer','objective'].includes(k));
 ok(await write(owner,'submit_improvement',null,{...payload,contextKeys:['brand_logo'],version:draft.version}),400);
 assert.ok(keys.length);ok(await write(owner,'submit_improvement',null,{...payload,contextKeys:[keys[0]],version:draft.version+1}),409);
 const withContext=ok(await write(owner,'submit_improvement',null,{...payload,contextKeys:[keys[0]],version:draft.version}));ids.push(withContext.id);
 assert.equal(ok(await rpc(publisher,'read',withContext.id)).snapshot[keys[0]],draft.document.fields[keys[0]]);
 pass('Permission isolation, consent, payload limits and exact selected saved context enforced on server');
 const teamInbox=ok(await rpc(publisher,'inbox'));assert.ok(teamInbox.requests.some(x=>x.id===id&&x.category==='explain'));
 const k=crypto.randomUUID(),response={audience:'client',body:'Respuesta sintética del equipo: revisaremos tu necesidad contigo.'};
 await Promise.all([write(publisher,'message',id,response,k),write(publisher,'message',id,response,k)]).then(xs=>xs.forEach(x=>ok(x)));
 ok(await write(publisher,'message',id,{audience:'internal',body:'Nota interna de prueba: no visible al cliente.'}));
 await login(owner);await login(publisher);
 const restored=ok(await rpc(owner,'read',id));assert.equal(restored.messages.filter(x=>x.body===response.body).length,1);assert.ok(restored.messages.every(x=>x.audience==='client'));
 assert.ok(ok(await rpc(owner,'notices')).notices.some(x=>x.request_id===id));
 assert.ok(!ok(await rpc(other,'inbox')).requests.some(x=>ids.includes(x.id)));
 pass('Distinct Auth accounts: inbox, reply, concurrent retries, notices and recovery after new login; internal note hidden');
 const list=ids.map(L.literal).join(',');
 assert.equal(L.sql(`select count(*) from public.portal_request_job where request_id in (${list});`),'0');
 assert.equal(L.sql(`select count(*) from public.portal_request_notice where request_id in (${list}) and mail_state<>'suppressed';`),'0');
 assert.equal(L.sql("select md5(coalesce(jsonb_agg(to_jsonb(d) order by account_id)::text,'[]')) from public.portal_brand_draft d;"),baseline);
 assert.equal(L.sql("select has_function_privilege('authenticated','auth_dv.review_notify(uuid,text,text,text,uuid)','execute');"),'f');
 pass('No analysis jobs or queued emails; all original form drafts unchanged and private helper remains inaccessible');
 const report={status:'PASS',checks,requestIds:ids,baselineDraftHash:baseline,scope:'Fixed local laboratory; no production, providers, mail relay or AI'};
 fs.writeFileSync(path.join(out,'provider-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length}));
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
