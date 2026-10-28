'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),L=require('./h12-workflow-local.cjs');
const out=path.resolve(L.root,'../evidence/h12-scope/final-files-20261026'),checks=[];
const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.data));return r.data;};
const rpc=(u,a,id=null,data={},key=null)=>L.api('rest','/rpc/portal_workflow_v1',u.token,{p_action:a,p_id:id,p_data:data,p_key:key});
const write=(u,a,id,data,key=crypto.randomUUID())=>rpc(u,a,id,data,key);
const file=(u,action,r,d,a,key,data={})=>L.api('rest','/rpc/portal_delivery_file_v1',u.token,{p_action:action,p_request:r,p_delivery:d,p_assignment:a,p_key:key,p_data:data});
const payload=(name='entrega.pdf',bytes=Buffer.from('%PDF-1.4\n% Synthetic local fixture\n%%EOF\n'))=>({name,mime:'application/pdf',base64:bytes.toString('base64')});
async function users(){const all=JSON.parse(fs.readFileSync(path.join(L.dir,'workflow-users.json')));for(const key of ['owner','publisher','collab','other','member','outsider']){assert.ok(all[key].email.endsWith('@synthetic.invalid'));all[key].token=ok(await L.api('auth','/token?grant_type=password',L.jwt({role:'anon'}),{email:all[key].email,password:all[key].credential})).access_token;}return all;}
async function fixture(u){
 const dates=JSON.parse(L.sql("select json_build_object('valid',current_date+2,'due',current_date+4,'delivery',current_date+7);"));
 const id=ok(await write(u.owner,'submit_improvement',null,{category:'explain',need:'Preparar un documento final para presentar el servicio.',contextKeys:[],version:0,consent:'improvement-v1'})).id;
 const revision=async()=>ok(await rpc(u.publisher,'read',id)).revision;
 ok(await write(u.publisher,'scope_propose',id,{revision:await revision(),outcome:'PDF de presentación y guía de uso.',exclusions:'Sin publicación externa.',requirements:'Nada adicional.',rounds:1,deliveryOn:dates.delivery,validUntil:dates.valid,capacityConfirmed:true}));
 ok(await write(u.owner,'scope_accept',id,{scopeVersion:1,consent:'scope-lab-v1'}));
 const aid=ok(await write(u.publisher,'work_assign',id,{revision:await revision(),scopeVersion:1,userId:u.collab.id,brief:'Preparar el PDF y revisar la exportación.',dueOn:dates.due,keys:['improvement_need']})).id;
 ok(await write(u.collab,'work_accept',id,{assignmentId:aid,scopeVersion:1,confirmed:true}));
 const did=ok(await write(u.collab,'delivery_submit',id,{assignmentId:aid,scopeVersion:1,body:'Documento para presentar los servicios.',usage:'Descarga el PDF y úsalo para acompañar la reunión.'})).id;
 return {id,aid,did,revision};
}
async function apply(){
 assert.equal(L.sql('select current_database();'),'portal_h10_disposable');
 const source=fs.readFileSync(path.join(L.root,'supabase/proposals/h12-workflow.sql'),'utf8'),before=fs.readFileSync(path.join(out,'before/supabase/proposals/h12-workflow.sql'),'utf8');
 const find=s=>[...s.matchAll(/create function[\s\S]*?\$\$;/g)].map(x=>x[0]).find(x=>x.startsWith('create function public.portal_workflow_v1('));
 const body=s=>s.slice(s.indexOf('as $$')+5,-3).replaceAll('\r\n','\n').trim(),current=L.sql("select prosrc from pg_proc where oid='public.portal_workflow_v1(text,uuid,uuid,jsonb)'::regprocedure;");
 assert.ok([find(before),find(source),...(fs.existsSync(path.join(out,'applied-workflow.sql'))?[find(fs.readFileSync(path.join(out,'applied-workflow.sql'),'utf8'))]:[])].some(x=>body(x)===current.replaceAll('\r\n','\n').trim()),'Unrecognized workflow');
 const proposal=fs.readFileSync(path.join(L.root,'supabase/proposals/h12-delivery-files.sql'),'utf8');
 const exists=L.sql("select to_regclass('public.portal_delivery_file') is not null;")==='t';
 if(exists){assert.ok(fs.existsSync(path.join(out,'applied-files.sql')),'No receipt for existing table');const previous=fs.readFileSync(path.join(out,'applied-files.sql'),'utf8');const fn=s=>s.slice(s.indexOf('create function'));const live=L.sql("select prosrc from pg_proc where oid='public.portal_delivery_file_v1(text,uuid,uuid,uuid,uuid,jsonb)'::regprocedure;");assert.ok([previous,proposal].some(s=>body(s.match(/create function[\s\S]*?\$\$;/)[0])===live.replaceAll('\r\n','\n').trim()));}
 const ddl=exists?proposal.slice(proposal.indexOf('create function')).replace('create function','create or replace function'):proposal;
 L.sql('begin;'+ddl+find(source).replace('create function','create or replace function')+"notify pgrst,'reload schema';commit;");
 fs.writeFileSync(path.join(out,'applied-files.sql'),proposal);fs.writeFileSync(path.join(out,'applied-workflow.sql'),source);
}
async function run(){
 assert.ok(process.argv.includes('--authorized-local-h12'));await apply();const u=await users(),f=await fixture(u),{id,aid,did}=f;
 const pass=s=>{checks.push(s);console.log('PASS '+s);},key=crypto.randomUUID(),data=payload();
 const draftHash=L.sql("select md5(coalesce(jsonb_agg(to_jsonb(d) order by account_id)::text,'[]')) from public.portal_brand_draft d;");
 assert.equal(L.sql("select relrowsecurity from pg_class where oid='public.portal_delivery_file'::regclass;"),'t');assert.equal(L.sql("select has_table_privilege('authenticated','public.portal_delivery_file','select,insert,update,delete');"),'f');assert.equal(L.sql("select has_function_privilege('anon','public.portal_delivery_file_v1(text,uuid,uuid,uuid,uuid,jsonb)','execute');"),'f');
 for(const actor of [u.owner,u.publisher,u.other,u.member,u.outsider])ok(await file(actor,'upload',id,did,aid,key,data),403);
 for(const bad of [{...data,name:'../../test.pdf'},{...data,name:'archivo.svg'},{...data,mime:'image/png'},{...data,base64:Buffer.from('<script>alert(1)</script>').toString('base64')},{...data,base64:'!!!!'},{...data,base64:'AA=='},{...data,base64:Buffer.alloc(4194305).toString('base64')}])ok(await file(u.collab,'upload',id,did,aid,crypto.randomUUID(),bad),400);
 pass('Private RLS table, no direct grants/anonymous RPC; only assigned author uploads; format/name/signature/size validation');
 const revisionBefore=await f.revision();const pair=await Promise.all([file(u.collab,'upload',id,did,aid,key,data),file(u.collab,'upload',id,did,aid,key,data)]);pair.forEach(x=>ok(x));assert.deepEqual(pair[0].data,pair[1].data);assert.equal(await f.revision(),revisionBefore+1);ok(await file(u.collab,'upload',id,did,aid,key,payload('otro.pdf')),409);
 for(const actor of [u.owner,u.other,u.member,u.outsider])ok(await file(actor,'download',id,did,aid,key),403);
 for(const actor of [u.publisher,u.collab])assert.equal(ok(await file(actor,'download',id,did,aid,key)).base64.replace(/\s/g,''),data.base64);
 assert.equal(ok(await rpc(u.owner,'read',id)).work.items.length,0);
 pass('Concurrent upload retries create one immutable file; private bytes/metadata invisible to client and unrelated accounts');
 const second=crypto.randomUUID(),third=crypto.randomUUID(),png={name:'vista.png',mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII='};
 ok(await file(u.collab,'upload',id,did,aid,second,png));ok(await file(u.collab,'upload',id,did,aid,third,payload('guia.pdf')));ok(await file(u.collab,'upload',id,did,aid,crypto.randomUUID(),data),400);
 const review={assignmentId:aid,deliveryId:did,revision:await f.revision(),decision:'publish',note:'Archivos y alcance revisados.',approved:true};
 ok(await write(u.publisher,'delivery_review',id,{...review,revision:revisionBefore}),409);ok(await write(u.publisher,'delivery_review',id,review),409);ok(await write(u.publisher,'delivery_review',id,{...review,fileIds:[key]}),409);
 ok(await write(u.collab,'delivery_review',id,{...review,fileIds:[key,second,third].sort()}),403);
 const result=ok(await write(u.publisher,'delivery_review',id,{...review,fileIds:[key,second,third].sort()}));assert.equal(result.state,'published');
 const read=ok(await rpc(u.owner,'read',id));assert.equal(read.work.items[0].files.length,3);assert.ok(!JSON.stringify(read).includes('base64'));
 assert.equal(ok(await file(u.owner,'download',id,did,null,key)).sha256,crypto.createHash('sha256').update(Buffer.from(data.base64,'base64')).digest('hex'));
 ok(await file(u.collab,'upload',id,did,aid,key,data),409);ok(await file(u.collab,'upload',id,did,aid,crypto.randomUUID(),data),409);
 pass('Three-file cap; stale/partial manifest cannot publish; reviewer publishes exact file set; client downloads identical bytes; published version frozen');
 const other=await fixture(u);ok(await file(u.owner,'download',other.id,other.did,null,key),403);ok(await file(u.publisher,'download',other.id,other.did,null,key),403);
 await users();const fresh=await users();assert.equal(ok(await file(fresh.owner,'download',id,did,null,key)).name,data.name);
 // Revocation is a real workflow operation on this synthetic assignment, not a permanent grant change.
 ok(await write(u.publisher,'revoke',id,{assignmentId:aid}));ok(await file(u.collab,'download',id,did,aid,key),403);assert.equal(ok(await file(u.owner,'download',id,did,null,key)).name,data.name);
 pass('Cross-request guessed IDs fail; fresh Auth recovers files; revoked collaborator loses download while client retains published history');
 const r=other,pk=crypto.randomUUID(),rv=await r.revision();
 const race=await Promise.all([file(u.collab,'upload',r.id,r.did,r.aid,pk,data),write(u.publisher,'delivery_review',r.id,{assignmentId:r.aid,deliveryId:r.did,revision:rv,decision:'publish',note:'Revisado sin adjuntos.',approved:true,fileIds:[]})]);
 assert.equal(race.filter(x=>x.status===200).length,1);assert.equal(race.filter(x=>x.status===409).length,1);
 pass('Upload vs publication serializes: no unseen file can enter a published version');
 for(const rid of [id,other.id]){assert.equal(L.sql(`select count(*) from public.portal_request_job where request_id=${L.literal(rid)};`),'0');assert.equal(L.sql(`select count(*) from public.portal_request_notice where request_id=${L.literal(rid)} and mail_state<>'suppressed';`),'0');}
 assert.equal(L.sql("select md5(coalesce(jsonb_agg(to_jsonb(d) order by account_id)::text,'[]')) from public.portal_brand_draft d;"),draftHash);
 pass('No AI jobs/mail; saved brand drafts unchanged; laboratory endpoints only');
 fs.writeFileSync(path.join(out,'provider-results.json'),JSON.stringify({status:'PASS',checks,requestId:id,deliveryId:did,fileId:key},null,2));
}
module.exports={users,fixture,rpc,write,file,payload,ok,out};
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
