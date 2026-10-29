'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),L=require('./h12-workflow-local.cjs'),F=require('./h12-files.cjs');
const out=path.resolve(L.root,'../evidence/h12-scope/professional-profiles-20261026'),ok=F.ok;
const profile=(u,action,request=null,user=null,key=null,data={})=>L.api('rest','/rpc/portal_professional_v1',u.token,{p_action:action,p_request:request,p_user:user,p_key:key,p_data:data});
async function apply(){
 assert.equal(L.sql('select current_database();'),'portal_h10_disposable');
 const file=path.join(L.root,'supabase/proposals/h12-professional-profiles.sql'),proposal=fs.readFileSync(file,'utf8'),receipt=path.join(out,'applied-profiles.sql');
 const exists=L.sql("select to_regclass('public.portal_professional_profile') is not null;")==='t';
 if(exists){assert.ok(fs.existsSync(receipt),'Existing profiles lack local receipt');assert.equal(proposal,fs.readFileSync(receipt,'utf8'),'Use explicit reviewed amendment, not an unguarded replacement');}
 else{L.sql('begin;'+proposal+"notify pgrst,'reload schema';commit;");fs.writeFileSync(receipt,proposal);}
}
async function run(){
 assert.ok(process.argv.includes('--authorized-local-h12'));await apply();const u=await F.users(),checks=[],pass=s=>{checks.push(s);console.log('PASS '+s);};
 const before=L.sql("select md5(coalesce(jsonb_agg(to_jsonb(d) order by account_id)::text,'[]')) from public.portal_brand_draft d;");
 const f=await F.fixture(u),f2=await F.fixture(u);
 for(const t of ['portal_professional_profile','portal_portfolio_file','portal_profile_share']){assert.equal(L.sql(`select relrowsecurity from pg_class where oid='public.${t}'::regclass;`),'t');assert.equal(L.sql(`select has_table_privilege('authenticated','public.${t}','select,insert,update,delete');`),'f');}
 assert.equal(L.sql("select has_function_privilege('anon','public.portal_professional_v1(text,uuid,uuid,uuid,jsonb)','execute');"),'f');
 for(const a of [u.owner,u.member])ok(await profile(a,'own'),403);
 ok(await profile(u.collab,'own',null,u.publisher.id),403);ok(await profile(u.owner,'list',f.id));ok(await profile(u.outsider,'list',f.id),403);ok(await profile(u.member,'list',f.id),403);
 pass('RLS, no table/anonymous grants; own editor restricted to active professionals; request access denies unrelated users and non-owner members');
 let own=ok(await profile(u.collab,'own'));const draft={name:'Lucía · perfil sintético',intro:'Ayudo a explicar servicios con diseño editorial.',specialties:'Presentaciones e identidad visual',skills:'Ilustración',passions:'Dar claridad a ideas complejas',brands:'Cultura y hospitalidad',projects:[]},priv={contact:'private-canary@example.invalid',availability:'private-canary-calendar',timezone:'America/Mexico_City'};
 const save=async(actor,d,pr={})=>{const p=ok(await profile(actor,'own'));return ok(await profile(actor,'save',null,null,null,{revision:p.revision,draft:d,private:pr}));};
 const concurrent=await Promise.all([1,2].map(()=>profile(u.collab,'save',null,null,null,{revision:own.revision,draft,private:priv})));assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);
 own=ok(await profile(u.collab,'own'));assert.deepEqual(own.private,priv);ok(await profile(u.collab,'save',null,null,null,{revision:own.revision,draft:{...draft,unexpected:'secret'},private:{}}),400);
 ok(await profile(u.collab,'save',null,null,null,{revision:own.revision,draft:{...draft,projects:[{title:'Private delivery theft',fileId:f.did}]},private:{}}),403);
 pass('Partial drafts recover; concurrent revisions reject stale writes; unknown fields and foreign/private-delivery references rejected');
 const old=own.files.find(x=>x.name==='muestra-perfil.pdf'),key=old?.id||crypto.randomUUID(),data=F.payload('muestra-perfil.pdf');
 const uploads=await Promise.all([1,2].map(()=>profile(u.collab,'upload',null,null,key,data)));uploads.forEach(x=>ok(x));assert.deepEqual(uploads[0].data,uploads[1].data);
 for(const bad of [{...data,name:'../sample.pdf'},{...data,mime:'image/png'},{...data,base64:'!!!!'},{...data,base64:Buffer.alloc(4194305).toString('base64')}])ok(await profile(u.collab,'upload',null,null,crypto.randomUUID(),bad),400);
 ok(await profile(u.owner,'download',f.id,u.collab.id,key),403);ok(await profile(u.publisher,'download',f.id,u.collab.id,key),403);
 draft.projects=[{title:'Presentación de servicios',problem:'Una oferta difícil de explicar',contribution:'Diseño y estructura del documento',result:'Una presentación para acompañar reuniones',fileId:key}];await save(u.collab,draft,priv);
 own=ok(await profile(u.collab,'own'));ok(await profile(u.collab,'authorize',null,null,null,{revision:own.revision}),400);ok(await profile(u.collab,'authorize',null,null,null,{revision:own.revision,consent:'portfolio-rights-v1'}));
 assert.equal(ok(await profile(u.owner,'list',f.id)).items.length,0);const list=ok(await profile(u.publisher,'list',f.id));const candidate=list.items.find(x=>x.id===u.collab.id);assert.ok(candidate);assert.ok(!JSON.stringify(list).includes('private-canary'));assert.deepEqual(ok(await profile(u.publisher,'download',f.id,u.collab.id,key)).base64.replace(/\s/g,''),data.base64);
 pass('Bounded immutable private uploads are idempotent; only owner-authorized snapshot/files become available to the request reviewer; private fields never leave own view');
 for(const a of [u.collab,u.owner,u.other])ok(await profile(a,'share',f.id,u.collab.id,null,{version:candidate.version,reviewed:true}),403);
 ok(await profile(u.publisher,'share',f.id,u.collab.id,null,{version:candidate.version}),409);ok(await profile(u.publisher,'share',f.id,u.collab.id,null,{version:candidate.version,reviewed:true}));
 const client=ok(await profile(u.owner,'list',f.id));assert.equal(client.items.length,1);assert.ok(!JSON.stringify(client).includes('private-canary'));assert.equal(ok(await profile(u.owner,'download',f.id,u.collab.id,key)).sha256,crypto.createHash('sha256').update(Buffer.from(data.base64,'base64')).digest('hex'));
 assert.equal(ok(await profile(u.owner,'list',f2.id)).items.length,0);ok(await profile(u.owner,'download',f2.id,u.collab.id,key),403);
 pass('Explicit publisher review/version enables client view and exact-byte download only for that request; collaborator cannot self-share');
 await save(u.collab,{...draft,intro:'Nueva presentación todavía privada'},priv);assert.equal(ok(await profile(u.owner,'list',f.id)).items[0].profile.intro,draft.intro);
 own=ok(await profile(u.collab,'own'));ok(await profile(u.collab,'authorize',null,null,null,{revision:own.revision,consent:'portfolio-rights-v1'}));assert.equal(ok(await profile(u.owner,'list',f.id)).items.length,0);ok(await profile(u.owner,'download',f.id,u.collab.id,key),403);ok(await profile(u.publisher,'share',f.id,u.collab.id,null,{version:candidate.version,reviewed:true}),409);
 const current=ok(await profile(u.publisher,'list',f.id)).items.find(x=>x.id===u.collab.id);ok(await profile(u.publisher,'share',f.id,u.collab.id,null,{version:current.version,reviewed:true}));
 own=ok(await profile(u.collab,'own'));ok(await profile(u.collab,'withdraw',null,null,null,{revision:own.revision}));assert.equal(ok(await profile(u.owner,'list',f.id)).items.length,0);ok(await profile(u.owner,'download',f.id,u.collab.id,key),403);
 pass('Draft changes never alter shared snapshot; newly authorized versions require fresh review; withdrawal immediately blocks future reads and downloads');
 own=ok(await profile(u.collab,'own'));ok(await profile(u.collab,'authorize',null,null,null,{revision:own.revision,consent:'portfolio-rights-v1'}));const again=ok(await profile(u.publisher,'list',f.id)).items.find(x=>x.id===u.collab.id);ok(await profile(u.publisher,'share',f.id,u.collab.id,null,{version:again.version,reviewed:true}));
 ok(await F.write(u.publisher,'revoke',f.id,{assignmentId:f.aid}));assert.equal(ok(await profile(u.owner,'list',f.id)).items.length,0);ok(await profile(u.owner,'download',f.id,u.collab.id,key),403);ok(await profile(u.publisher,'share',f.id,u.collab.id,null,{version:again.version,reviewed:true}),403);
 await save(u.publisher,{name:'Equipo · perfil sintético',intro:'Coordino el trabajo de marca contigo.',projects:[]},{contact:'private-team-canary'});own=ok(await profile(u.publisher,'own'));ok(await profile(u.publisher,'authorize',null,null,null,{revision:own.revision,consent:'portfolio-rights-v1'}));const team=ok(await profile(u.publisher,'list',f2.id)).items.find(x=>x.id===u.publisher.id);assert.ok(team);ok(await profile(u.publisher,'share',f2.id,u.publisher.id,null,{version:team.version,reviewed:true}));assert.equal(ok(await profile(u.owner,'list',f2.id)).items[0].role,'Responsable de Don Ventas');ok(await profile(u.publisher,'unshare',f2.id,u.publisher.id));assert.equal(ok(await profile(u.owner,'list',f2.id)).items.length,0);
 pass('Live assignment revocation removes visibility; team profile follows the same owner authorization and explicit per-request sharing; unshare revokes access');
 const fresh=await F.users();assert.equal(ok(await profile(fresh.collab,'own')).draft.name,draft.name);assert.equal(L.sql("select md5(coalesce(jsonb_agg(to_jsonb(d) order by account_id)::text,'[]')) from public.portal_brand_draft d;"),before);
 for(const id of [f.id,f2.id]){assert.equal(L.sql(`select count(*) from public.portal_request_job where request_id=${L.literal(id)};`),'0');assert.equal(L.sql(`select count(*) from public.portal_request_notice where request_id=${L.literal(id)} and mail_state<>'suppressed';`),'0');}
 pass('Fresh distinct Auth sessions recover profiles; brand drafts unchanged; no AI jobs or real mail');
 fs.writeFileSync(path.join(out,'provider-results.json'),JSON.stringify({status:'PASS',checks,requestId:f2.id,fileId:key},null,2));
}
module.exports={profile,out};if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
