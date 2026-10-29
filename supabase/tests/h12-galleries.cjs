'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),L=require('./h12-workflow-local.cjs'),F=require('./h12-files.cjs'),P=require('./h12-profiles.cjs');
const out=path.resolve(L.root,'../evidence/h12-scope/profile-galleries-20261026'),ok=F.ok,call=P.profile;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=','base64');
async function apply(){
 assert.equal(L.sql('select current_database();'),'portal_h10_disposable');
 const proposal=fs.readFileSync(path.join(L.root,'supabase/proposals/h12-professional-profiles.sql'),'utf8'),helper=fs.readFileSync(path.join(L.root,'supabase/proposals/h12-portfolio-images.sql'),'utf8');
 const before=fs.readFileSync(path.join(out,'before/supabase/proposals/h12-professional-profiles.sql'),'utf8');
 const fn=s=>s.match(/create function public\.portal_professional_v1[\s\S]*?end \$\$;/)[0],body=s=>s.slice(s.indexOf('as $$')+5,-3).replaceAll('\r\n','\n').trim();
 const current=L.sql("select prosrc from pg_proc where oid='public.portal_professional_v1(text,uuid,uuid,uuid,jsonb)'::regprocedure;");assert.ok([before,proposal].some(s=>body(fn(s))===current.replaceAll('\r\n','\n').trim()),'Unrecognized live profile function');
 const exists=L.sql("select to_regprocedure('auth_dv.portfolio_image_size(bytea,text)') is not null;")==='t';
 if(exists){const previous=fs.readFileSync(path.join(out,'applied-images.sql'),'utf8');assert.equal(previous,helper);}
 L.sql('begin;'+(exists?'':helper)+fn(proposal).replace('create function','create or replace function')+"notify pgrst,'reload schema';commit;");
 fs.writeFileSync(path.join(out,'applied-images.sql'),helper);fs.writeFileSync(path.join(out,'applied-profiles.sql'),proposal);
}
async function run(){
 assert.ok(process.argv.includes('--authorized-local-h12'));await apply();const u=await F.users(),f=await F.fixture(u),checks=[],pass=s=>{checks.push(s);console.log('PASS '+s);};
 const original=ok(await call(u.collab,'own')),existing=original.files.find(x=>x.name==='gallery-test.png'),id=existing?.id||crypto.randomUUID();
 ok(await call(u.collab,'upload',null,null,id,{name:'gallery-test.png',mime:'image/png',base64:png.toString('base64')}));
 const own=()=>call(u.collab,'own').then(ok),save=async draft=>call(u.collab,'save',null,null,null,{revision:(await own()).revision,draft,private:original.private});
 const draft={name:'Perfil de prueba con galería',intro:'Diseño editorial.',photoId:id,projects:[{title:'Proyecto sintético',contribution:'Diseño de las muestras',gallery:[{fileId:id,caption:'Vista de prueba'}]}]};
 ok(await save(draft));assert.equal((await own()).draft.photoId,id);
 for(const actor of [u.owner,u.publisher,u.other,u.outsider])ok(await call(actor,'preview',f.id,u.collab.id,id),403);
 const preview=ok(await call(u.collab,'preview',null,null,id));assert.equal(preview.mime,'image/png');assert.equal(preview.base64.replace(/\s/g,''),png.toString('base64'));
 pass('Private photo/gallery draft recovers; no preview for client, reviewer or unrelated accounts before authorization; own raster bytes/hash preserved');
 const pdf=original.files.find(x=>x.name.endsWith('.pdf'));assert.ok(pdf);ok(await save({...draft,photoId:pdf.id}),400);ok(await save({...draft,projects:[{...draft.projects[0],gallery:[{fileId:pdf.id,caption:'Not an image'}]}]}),400);
 ok(await save({...draft,photoId:crypto.randomUUID()}),403);ok(await save({...draft,projects:[{...draft.projects[0],gallery:[{fileId:crypto.randomUUID(),caption:'Foreign'}]}]}),403);
 ok(await save({...draft,projects:[{...draft.projects[0],gallery:Array(5).fill({fileId:id,caption:'Too many'})}]}),400);ok(await save({...draft,projects:[{...draft.projects[0],gallery:Array(2).fill({fileId:id,caption:'Duplicate'})}]}),400);ok(await save({...draft,projects:[{...draft.projects[0],gallery:[{fileId:id,caption:'x'.repeat(301)}]}]}),400);ok(await call(u.collab,'preview',null,null,pdf.id),400);
 for(const data of [Buffer.from(png),Buffer.from('not an image')]){if(data.length>24)data.writeUInt32BE(50000,16);assert.throws(()=>L.sql(`select auth_dv.portfolio_image_size(decode('${data.toString('hex')}','hex'),'image/png');`),/PROFILE_IMAGE_INVALID/);}
 pass('Server rejects PDF/foreign file as photo/gallery, duplicates, oversized gallery/caption and unsafe raster dimensions; no HTML/SVG inline preview');
 const authorize=async()=>{const p=await own();return ok(await call(u.collab,'authorize',null,null,null,{revision:p.revision,consent:'portfolio-rights-v1'}));};
 const share=async()=>{const p=ok(await call(u.publisher,'list',f.id)).items.find(x=>x.id===u.collab.id);return ok(await call(u.publisher,'share',f.id,u.collab.id,null,{version:p.version,reviewed:true}));};
 await authorize();ok(await call(u.publisher,'preview',f.id,u.collab.id,id));ok(await call(u.owner,'preview',f.id,u.collab.id,id),403);await share();ok(await call(u.owner,'preview',f.id,u.collab.id,id));
 const another=await F.fixture(u);ok(await call(u.owner,'preview',another.id,u.collab.id,id),403);ok(await call(u.outsider,'preview',f.id,u.collab.id,id),403);
 pass('Owner authorization permits team review; exact version shared per request permits client photo/gallery; guessed IDs and another request remain denied');
 ok(await save({...draft,photoId:'',projects:[{...draft.projects[0],gallery:[]}]}));ok(await call(u.owner,'preview',f.id,u.collab.id,id));await authorize();ok(await call(u.owner,'preview',f.id,u.collab.id,id),403);await share();ok(await call(u.owner,'preview',f.id,u.collab.id,id),403);
 ok(await save(draft));await authorize();await share();ok(await F.write(u.publisher,'revoke',f.id,{assignmentId:f.aid}));ok(await call(u.owner,'preview',f.id,u.collab.id,id),403);
 pass('Draft image removal leaves prior approved view intact; new authorized snapshot withdraws former images; fresh sharing cannot revive removed media; assignment revocation blocks preview');
 const fresh=await F.users();assert.deepEqual(ok(await call(fresh.collab,'own')).draft,draft);assert.equal(L.sql(`select count(*) from portal_request_job where request_id=${L.literal(f.id)};`),'0');assert.equal(L.sql(`select count(*) from portal_request_notice where request_id=${L.literal(f.id)} and mail_state<>'suppressed';`),'0');
 pass('Fresh account session recovers gallery; no AI or real mail');fs.writeFileSync(path.join(out,'provider-results.json'),JSON.stringify({status:'PASS',checks,requestId:f.id,fileId:id},null,2));
}
module.exports={apply,out,png};if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
