const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../app/draft-contract.js'),R=require('../app/release-config.js');
test('partial draft preserves whitespace, empty values, deselected notes and stage',()=>{
 const d={schema:1,stage:'contexto',fields:{name:'  \n',q_needs_launch:false,qnote_needs_launch:' conservar\n',ib_proof:'pending'}};
 const copy=C.validate(d);assert.deepEqual(copy,d);copy.fields.name='changed';assert.equal(d.fields.name,'  \n');
});
test('draft schema rejects undeclared authority, prototype names, types and oversized values',()=>{
 for(const d of [{schema:1,stage:'marca',fields:{account_id:'other'}},{schema:1,stage:'bandeja',fields:{}},{schema:1,stage:'marca',fields:{q_needs_launch:1}},{schema:1,stage:'marca',fields:{name:'x'.repeat(501)}},{schema:1,stage:'marca',fields:{ib_proof:'verified'}},JSON.parse('{"schema":1,"stage":"marca","fields":{"__proto__":{}}}'),{schema:1,stage:'marca',fields:{name:'\u0000'}}])assert.throws(()=>C.validate(d),/DRAFT_INVALID/);
});
test('H12 capability is never admitted for production or preview bindings',()=>{
 for(const mode of ['DEMO','LIVE','SANDBOX'])for(const originClass of ['production','preview','local']){
  const c=R.toEnvironmentConfig({declaredMode:mode,h12Drafts:'isolated-v1',publicClient:{}},{originClass});
  assert.equal(c.features.h12Drafts==='isolated-v1',mode==='SANDBOX'&&originClass==='local');
 }
});
test('draft client additionally rejects hosted endpoints and nonloopback pages',()=>{
 const source=fs.readFileSync(require.resolve('../app/drafts.js'),'utf8');
 for(const [state,originClass,hostname,endpoint,flag,want] of [
  ['SANDBOX','LOCAL','127.0.0.1','http://127.0.0.1:55464','isolated-v1',true],
  ['LIVE','LOCAL','127.0.0.1','http://127.0.0.1:55464','isolated-v1',false],
  ['SANDBOX','LOCAL','127.0.0.1','https://hosted.example','isolated-v1',false],
  ['SANDBOX','PREVIEW','preview.example','https://preview.example','isolated-v1',false],
  ['SANDBOX','LOCAL','127.0.0.1','http://127.0.0.1:55464',undefined,false]]){
  const box={URL,location:{hostname,origin:'http://127.0.0.1:55464'},DVEnv:{resolution:()=>({state,originClass,config:{backendUrl:endpoint,features:{h12Drafts:flag}}})}};box.window=box;vm.runInNewContext(source,box);assert.equal(box.DVDrafts.enabled(),want);
 }
});
test('SQL enforces the same draft field rules as the client',()=>{
 const sql=fs.readFileSync(require.resolve('../supabase/proposals/h12-drafts.sql'),'utf8');
 assert.deepEqual(JSON.parse(sql.match(/rules constant jsonb := '(.*)'::jsonb/)[1]),C.fields);
});

test('welcome can be saved empty, skipped to panel and resumed in any optional block',()=>{
 for(const stage of ['marca','identidad','panel','contexto'])assert.deepEqual(C.validate({schema:1,stage,fields:{}}),{schema:1,stage,fields:{}});
 for(const section of C.sections){
  const d={schema:1,stage:'marca',fields:{welcome_section:section.id}};
  assert.deepEqual(C.validate(d),d);
 }
 const d={schema:1,stage:'panel',fields:{welcome_section:'clientes',name:'  Mi marca\n',brand_status:'none',brand_primary:'un azul por definir',q_needs_launch:false,qnote_needs_launch:'  contexto pendiente\n'}};
 assert.deepEqual(C.validate(d),d);
});
test('panel reports saved content and local changes without equating partial responses to completion',()=>{
 assert.equal(C.sectionState('negocio',{},{}),'Sin empezar');
 assert.equal(C.sectionState('negocio',{name:'Marca'},{}),'Cambios sin guardar');
 assert.equal(C.sectionState('negocio',{name:'Marca'},{name:'Marca'}),'Con información guardada');
 assert.equal(C.sectionState('negocio',{name:''},{name:'Marca'}),'Cambios sin guardar');
 assert.equal(C.sectionState('objetivo',{q_needs_launch:false,qnote_needs_launch:'nota'},{q_needs_launch:false,qnote_needs_launch:'nota'}),'Con información guardada');
 assert.equal(C.sectionState('identidad',{brand_status:'none'},{brand_status:'none'}),'Con información guardada');
 assert.equal(C.sectionState('clientes',{welcome_section:'clientes'},{}),'Sin empezar');
});

test('redundant SIGNED_IN preserves caches; a new session or identity clears them',async()=>{
 let callback,cleared=0;
 const box={URL,atob:v=>Buffer.from(v,'base64').toString(),document:{getElementById:()=>null},
  DVEnv:{STATES:{},state:()=> 'SANDBOX',isBackend:()=>true,resolution:()=>({config:{},fingerprint:'test'}),storageKey:k=>k},
  DVStore:{logout:()=>cleared++},supabase:{createClient:()=>({auth:{onAuthStateChange:cb=>callback=cb}})}};
 box.window=box;vm.runInNewContext(fs.readFileSync(require.resolve('../app/supabase.js'),'utf8'),box);await box.DVSupa.client();
 const session=(id,sid)=>({user:{id},access_token:'header.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.signature'});
 callback('INITIAL_SESSION',session('a','one'));callback('SIGNED_IN',session('a','one'));assert.equal(cleared,0);
 callback('SIGNED_IN',session('a','two'));assert.equal(cleared,1);
 callback('SIGNED_IN',session('b','two'));assert.equal(cleared,2);
 callback('SIGNED_OUT');assert.equal(cleared,3);
});

test('authoritative Auth rejection purges identity but transport failure preserves input',async()=>{
 for(const [response,clears] of [[{error:{status:401}},1],[{error:{status:403}},1],[{error:{status:400,name:'AuthSessionMissingError'}},1],[{error:{status:400,code:'session_not_found'}},1],[{data:{user:null}},1],[{data:{user:{id:'other'}}},1],[{error:{status:0}},0],[{error:{status:503}},0]]){
  let purged=0;
  const box={URL,AbortSignal,document:{getElementById:()=>null},location:{hostname:'127.0.0.1',origin:'http://127.0.0.1:55464'},
   DVEnv:{fingerprint:()=> 'test',resolution:()=>({state:'SANDBOX',originClass:'LOCAL',config:{backendUrl:'http://127.0.0.1:55464',features:{h12Drafts:'isolated-v1'}}})},
   DVStore:{session:()=>({userId:'owner',accountId:'a',generation:1})},
   DVSupa:{invalidateIdentity:()=>purged++,client:async()=>({auth:{getUser:async()=>response}})}};
  box.window=box;vm.runInNewContext(fs.readFileSync(require.resolve('../app/drafts.js'),'utf8'),box);
  await assert.rejects(box.DVDrafts.open());assert.equal(purged,clears);
 }
});
