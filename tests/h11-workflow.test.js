const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/hybrid-demo.js');
const ctx={name:'Synthetic',offer:'Taller',audience:'Principiantes',objective:'Explicar oferta'};
const art={headline:'Taller',audience:'Principiantes',problem:'Empezar',value:'Práctica',evidence:'Sin evidencia aportada',conditions:'Por acordar',cta:'Consultar'};
function flow(){let state=C.initial(),n=0;return {get state(){return state;},run(kind,payload={},actor='cliente',extra={}){state=C.execute(state,{actor,workspace:'a',key:'k'+(++n),expected:state.workspaces.a.version,kind,payload,...extra},'2026-10-25T00:00:00Z');return state.workspaces.a;}};}
function prepared(){const f=flow();f.run('context',ctx);f.run('artifact',art);f.run('request',{type:'oferta',brief:'Revisar ficha'});return f;}
test('versioned complete journey keeps acceptance separate from publication',()=>{const f=prepared();f.run('proposal',{text:'Una ficha',rounds:1},'especialista');f.run('counter',{text:'Aclarar condiciones'});f.run('proposal',{text:'Ficha y condiciones',rounds:1},'especialista');f.run('acceptScope',{version:2});f.run('start',{},'especialista');f.run('deliver',{text:'Primera entrega'},'especialista');f.run('revise',{text:'Ajustar CTA',version:1});f.run('deliver',{text:'CTA ajustado'},'especialista');const w=f.run('acceptDelivery',{version:2});assert.equal(w.request.status,'entrega aprobada');assert.equal(w.request.publicationAuthorized,false);assert.equal(w.request.artifactVersion,1);assert.equal(w.events.length,12);});
test('cross-workspace specialist and owner cannot mutate another tenant',()=>{for(const actor of ['cliente','especialista'])assert.throws(()=>C.execute(C.initial(),{actor,workspace:'b',key:'x',expected:0,kind:'context',payload:ctx}),/FORBIDDEN/);});
test('staff cannot substitute owner acceptance',()=>{const f=prepared();f.run('proposal',{text:'Scope',rounds:1},'especialista');assert.throws(()=>f.run('acceptScope',{version:1},'admin'),/OWNER_REQUIRED/);});
test('stale operation and simulated failure do not mutate input',()=>{const f=flow();const before=JSON.stringify(f.state);assert.throws(()=>f.run('context',{...ctx,simulateFailure:true}),/SIMULATED_FAILURE/);assert.equal(JSON.stringify(f.state),before);f.run('context',ctx);assert.throws(()=>f.run('artifact',art,'cliente',{expected:0}),/VERSION_CONFLICT/);assert.equal(f.state.workspaces.a.artifacts.length,0);});
test('same-key replay is idempotent and changed payload is rejected',()=>{const s=C.initial(),cmd={actor:'cliente',workspace:'a',key:'same',expected:0,kind:'context',payload:ctx};const a=C.execute(s,cmd);assert.deepEqual(C.execute(a,cmd),a);assert.throws(()=>C.execute(a,{...cmd,payload:{...ctx,name:'different'}}),/IDEMPOTENCY_CONFLICT/);});
test('revert creates a new version without rewriting history',()=>{const f=flow();f.run('context',ctx);f.run('artifact',art);f.run('artifact',{...art,headline:'Nueva'});const w=f.run('revert',{version:1});assert.equal(w.artifacts.length,3);assert.equal(w.artifacts[2].fields.headline,'Taller');assert.equal(w.artifacts[1].fields.headline,'Nueva');});
test('editorial request requires provenance and rights',()=>{const f=flow();f.run('context',ctx);f.run('artifact',art);assert.throws(()=>f.run('request',{type:'seo',brief:'Artículo'}),/FIELD_REQUIRED/);assert.equal(f.state.workspaces.a.request,null);});
test('context and artifact snapshots freeze when help is requested',()=>{const f=prepared();assert.throws(()=>f.run('context',ctx),/REQUEST_CONTEXT_FROZEN/);assert.throws(()=>f.run('artifact',art),/CONTEXT_OR_STATE_INVALID/);});
test('scope and delivery acceptance require exact versions',()=>{const f=prepared();f.run('proposal',{text:'Scope',rounds:1},'especialista');assert.throws(()=>f.run('acceptScope',{version:0}),/PROPOSAL_VERSION_CONFLICT/);f.run('acceptScope',{version:1});f.run('start',{},'especialista');f.run('deliver',{text:'Done'},'especialista');assert.throws(()=>f.run('acceptDelivery',{version:0}),/DELIVERY_VERSION_CONFLICT/);});
test('cancel preserves versions and prevents further fulfillment',()=>{const f=prepared();const w=f.run('cancel');assert.equal(w.artifacts.length,1);assert.equal(w.request.status,'cancelado');assert.throws(()=>f.run('proposal',{text:'Scope',rounds:1},'especialista'),/REQUEST_STATE_INVALID/);});
test('included revisions cannot be exceeded silently',()=>{const f=prepared();f.run('proposal',{text:'Scope',rounds:1},'especialista');f.run('acceptScope',{version:1});f.run('start',{},'especialista');f.run('deliver',{text:'v1'},'especialista');f.run('revise',{text:'fix',version:1});f.run('deliver',{text:'v2'},'especialista');assert.throws(()=>f.run('revise',{text:'another',version:2}),/NEW_SCOPE_REQUIRED/);});


test('manual questionnaire preserves multiple options and explicit evidence basis',()=>{
 const f=flow();const payload={...ctx,answers:{needs:[{id:'launch',context:' Nuevo taller '},{id:'connect',context:''}]},insights:{language:{text:' ¿Necesito experiencia? ',basis:'observed',source:'Sintético'}}};
 const w=f.run('context',payload);assert.equal(w.contexts[0].answers.needs.length,2);assert.equal(w.contexts[0].answers.needs[0].context,'Nuevo taller');assert.equal(w.contexts[0].insights.language.basis,'observed');
 payload.answers.needs[0].context='changed';assert.equal(w.contexts[0].answers.needs[0].context,'Nuevo taller');
 f.run('context',{...ctx,answers:{needs:[{id:'unknown',context:''}]}});assert.equal(w.contexts[0].answers.needs.length,2);
});
test('malformed or oversized questionnaire fails atomically',()=>{
 for(const extra of [{answers:{invalid:[]}},{answers:{needs:[{id:'forged',context:''}]}},{answers:{needs:[{id:'launch',context:'x'.repeat(1501)}]}},{answers:{needs:[{id:'launch',context:''},{id:'launch',context:''}]}},{insights:{proof:{text:'claim',basis:'verified',source:''}}}]){
  const f=flow();assert.throws(()=>f.run('context',{...ctx,...extra}),/QUESTIONNAIRE_INVALID/);assert.equal(f.state.workspaces.a.version,0);
 }
});
test('feedback requires explicit consent in the command',()=>{const f=flow();f.run('context',ctx);f.run('artifact',art);assert.throws(()=>f.run('feedback',{scope:'marca',text:'Cambiar todo'}),/CONSENT_REQUIRED/);assert.equal(f.state.workspaces.a.feedback.length,0);});
