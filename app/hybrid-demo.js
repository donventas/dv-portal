/* H1.1: synthetic, local-only workflow. No backend, provider calls or commercial effects. */
(function(root,factory){ const api=factory(); if(typeof module==='object') module.exports=api; if(root) root.DVHybridCore=api; })(typeof window==='undefined'?null:window,function(){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 const fail=code=>{throw new Error(code);};
 const text=(v,max=2000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('FIELD_REQUIRED');return v.trim();};
 const questions=[
  {id:'needs',title:'¿En qué momento está tu marca?',hint:'Puedes elegir varios. Esto ayuda a ordenar lo que trabajaremos primero.',options:[['launch','Lanzar algo nuevo','¿Qué vas a lanzar y qué falta por definir?'],['align','Alinear mi marca','¿Qué se siente distinto entre lo que eres y lo que comunicas?'],['connect','Conectar mejor','¿Con quién quieres conectar y qué necesitas que entienda?'],['integrate','Integrar mis canales','¿Qué canales o piezas necesitan funcionar juntos?'],['delegate','Delegar trabajo','¿Qué necesitas resolver con ayuda de un especialista?'],['evolve','Evolucionar','¿Qué ya funciona y qué quieres cambiar?'],['other','Otro momento','Cuéntanos tu situación.'],['unknown','Aún no lo tengo claro','¿Qué te gustaría aclarar primero?']]},
  {id:'offerTypes',title:'¿Qué ofreces?',hint:'Elige las opciones que describan tu oferta y añade lo que la hace específica.',options:[['product','Productos','¿Cuáles? ¿Qué características y condiciones debemos conocer?'],['service','Servicios','¿Qué incluye el servicio y qué queda fuera?'],['experience','Talleres o experiencias','¿Cómo se vive, para quién es y cómo se participa?'],['digital','Contenido o productos digitales','¿Qué recibe la persona y cómo accede?'],['other','Otra oferta','Describe tu oferta con tus palabras.'],['unknown','Por definir','¿Qué parte de la oferta falta definir?']]},
  {id:'audiences',title:'¿A quién quieres llegar?',hint:'Describe su situación y necesidad; no hace falta tener una investigación completa.',options:[['people','Personas','¿En qué situación están y qué necesitan resolver?'],['business','Empresas o equipos','¿Quién decide y qué problema necesita resolver?'],['community','Una comunidad','¿Qué los une y cómo se relacionan con tu marca?'],['current','Clientes actuales','¿Qué quieres que comprendan o hagan ahora?'],['other','Otro público','¿Quién es y qué necesita saber?'],['unknown','Por conocer','¿Qué sabes y qué te falta conocer?']]},
  {id:'channels',title:'¿Dónde debe funcionar?',hint:'Marca los canales relevantes. Puedes indicar URLs, formatos y lo que ya existe.',options:[['web','Sitio web','¿Ya existe? Añade la URL y lo que necesita cambiar.'],['social','Redes sociales','¿Cuáles? ¿Qué formatos o conversaciones importan?'],['direct','WhatsApp o correo','¿Cómo llegan las consultas y quién las atiende?'],['physical','Espacio físico','¿Dónde se verá y en qué condiciones?'],['other','Otro canal','Describe el canal y su uso.'],['unknown','Por decidir','¿Qué necesitas considerar para elegir?']]}
 ];
 const insightQuestions=[
  {id:'situation',group:'cliente',label:'¿Qué está pasando cuando tu cliente empieza a buscar ayuda?',hint:'Describe una situación concreta y el cambio que espera conseguir.'},
  {id:'language',group:'cliente',label:'¿Cómo lo dice con sus propias palabras?',hint:'Anota una frase real sin nombres ni datos personales, o indica que es una aproximación.'},
  {id:'feeling',group:'cliente',label:'¿Cómo espera sentirse después?',hint:'Por ejemplo: con claridad, confianza, tranquilidad o entusiasmo. Explica por qué.'},
  {id:'attention',group:'cliente',label:'¿Qué ejemplos o temas le interesan?',hint:'Recuerda preguntas, contenidos o conversaciones que hayan llamado su atención.'},
  {id:'friction',group:'cliente',label:'¿Qué le genera dudas o rechazo?',hint:'Objeciones, palabras que evitar y promesas que no deberíamos hacer.'},
  {id:'purpose',group:'marca',label:'¿Por qué existe tu marca y qué no quieres negociar?',hint:'Su razón de ser, valores y el cambio que quiere aportar.'},
  {id:'difference',group:'marca',label:'¿Qué diferencia debería notar el cliente?',hint:'Compara con su alternativa actual. Describe un beneficio concreto, no solo un adjetivo.'},
  {id:'proof',group:'marca',label:'¿Con qué puedes respaldar lo que prometes?',hint:'Casos, demostraciones, datos o reseñas con origen y permiso de uso. Si aún no existen, indícalo.'},
  {id:'success',group:'marca',label:'¿Qué señal te diría que vamos por buen camino?',hint:'Una acción observable del cliente y, si lo sabes, el plazo para revisarla. No hace falta prometer una cifra.'}
 ];
 function normalizeInsights(value){
  if(value===undefined)return {};
  if(!value||typeof value!=='object'||Array.isArray(value))fail('QUESTIONNAIRE_INVALID');
  const result={};for(const [id,row] of Object.entries(value)){
   if(!insightQuestions.some(q=>q.id===id)||!row||!['hypothesis','observed','pending'].includes(row.basis)||typeof row.text!=='string'||row.text.length>1500||typeof row.source!=='string'||row.source.length>300)fail('QUESTIONNAIRE_INVALID');
   if(row.text.trim())result[id]={text:row.text.trim(),basis:row.basis,source:row.source.trim()};
  }return result;
 }
 function normalizeAnswers(value){
  if(value===undefined)return {};
  if(!value||typeof value!=='object'||Array.isArray(value))fail('QUESTIONNAIRE_INVALID');
  const answers={};
  for(const [group,rows] of Object.entries(value)){
   const question=questions.find(q=>q.id===group);
   if(!question||!Array.isArray(rows)||rows.length>question.options.length)fail('QUESTIONNAIRE_INVALID');
   const seen=new Set();answers[group]=rows.map(row=>{
    if(!row||!question.options.some(o=>o[0]===row.id)||seen.has(row.id)||typeof row.context!=='string'||row.context.length>1500)fail('QUESTIONNAIRE_INVALID');
    seen.add(row.id);return {id:row.id,context:row.context.trim()};
   });
  }
  return answers;
 }
 function initial(){return {schema:1,workspaces:{a:{id:'a',label:'Estudio Aurora · ficticio',version:0,contexts:[],artifacts:[],feedback:[],request:null,proposals:[],deliveries:[],events:[],receipts:{}},b:{id:'b',label:'Taller Brisa · ficticio',version:0,contexts:[],artifacts:[],feedback:[],request:null,proposals:[],deliveries:[],events:[],receipts:{}}}};}
 function allowed(actor,workspace){return ['cliente','especialista','admin'].includes(actor)&&(workspace==='a'||actor==='admin'&&workspace==='b');}
 function execute(state,{actor,workspace,key,expected,kind,payload={}},now=new Date().toISOString()){
  if(!allowed(actor,workspace))fail('FORBIDDEN');
  const current=state.workspaces[workspace]; if(!current)fail('WORKSPACE_UNAVAILABLE');
  const receiptKey=actor+':'+text(key,100), intent=JSON.stringify({kind,payload,expected});
  if(current.receipts[receiptKey]){if(current.receipts[receiptKey].intent!==intent)fail('IDEMPOTENCY_CONFLICT');return clone(state);}
  if(current.version!==expected)fail('VERSION_CONFLICT');
  const next=clone(state),w=next.workspaces[workspace], owner=actor==='cliente',staff=actor==='especialista'||actor==='admin';
  const requireOwner=()=>{if(!owner)fail('OWNER_REQUIRED');};
  const requireStaff=()=>{if(!staff)fail('SPECIALIST_REQUIRED');};
  const latest=list=>list[list.length-1];
  if(kind==='context'){
   requireOwner(); if(w.request)fail('REQUEST_CONTEXT_FROZEN');
   const fields={}; for(const f of ['name','offer','audience','objective'])fields[f]=text(payload[f],500);
   for(const f of ['channels','tone','restrictions'])fields[f]=String(payload[f]||'').slice(0,2000);
   w.contexts.push({version:w.contexts.length+1,fields,answers:normalizeAnswers(payload.answers),insights:normalizeInsights(payload.insights),source:'Declaración manual · DEMO',at:now,canonicalSync:'pending_sync'});
  }else if(kind==='artifact'){
   requireOwner(); if(!w.contexts.length||w.request)fail('CONTEXT_OR_STATE_INVALID');
   const fields={};for(const f of ['headline','audience','problem','value','evidence','conditions','cta'])fields[f]=text(payload[f]);
   w.artifacts.push({version:w.artifacts.length+1,contextVersion:latest(w.contexts).version,fields,at:now,origin:'Edición manual · no IA'});
  }else if(kind==='feedback'){
   requireOwner();if(!w.artifacts.length||w.request)fail('ARTIFACT_REQUIRED');
   if(!['pieza','campaña','marca'].includes(payload.scope))fail('SCOPE_REQUIRED');
   if(payload.consent!==true)fail('CONSENT_REQUIRED');
   w.feedback.push({version:w.artifacts.length,scope:payload.scope,text:text(payload.text),at:now,consent:payload.consent===true});
  }else if(kind==='revert'){
   requireOwner();if(w.request)fail('REQUEST_CONTEXT_FROZEN');
   const prior=w.artifacts.find(a=>a.version===payload.version);if(!prior)fail('VERSION_UNAVAILABLE');
   w.artifacts.push({...clone(prior),version:w.artifacts.length+1,at:now,revertedFrom:prior.version});
  }else if(kind==='request'){
   requireOwner();if(!w.artifacts.length||w.request)fail('REQUEST_STATE_INVALID');
   if(!['oferta','blog','seo'].includes(payload.type))fail('TYPE_REQUIRED');
   const editorial={};if(payload.type!=='oferta')for(const f of ['intent','sources','author','reviewer','rights','url'])editorial[f]=text(payload[f],1000);
   w.request={id:'request-'+workspace,type:payload.type,brief:text(payload.brief),artifactVersion:latest(w.artifacts).version,contextVersion:latest(w.artifacts).contextVersion,editorial,status:'solicitado',assigned:'especialista',publicationAuthorized:false};
  }else if(kind==='proposal'){
   requireStaff();if(!w.request||!['solicitado','propuesta','contrapropuesta'].includes(w.request.status))fail('REQUEST_STATE_INVALID');
   if(!Number.isInteger(payload.rounds)||payload.rounds<1||payload.rounds>5)fail('ROUNDS_INVALID');
   w.proposals.push({version:w.proposals.length+1,text:text(payload.text),rounds:payload.rounds,at:now,actor});w.request.status='propuesta';
  }else if(kind==='counter'){
   requireOwner();if(w.request?.status!=='propuesta')fail('REQUEST_STATE_INVALID');
   w.feedback.push({proposalVersion:latest(w.proposals).version,text:text(payload.text),scope:'encargo',at:now,consent:true});w.request.status='contrapropuesta';
  }else if(kind==='acceptScope'){
   requireOwner();if(w.request?.status!=='propuesta'||payload.version!==latest(w.proposals).version)fail('PROPOSAL_VERSION_CONFLICT');
   w.request.acceptedProposal=payload.version;w.request.status='alcance aceptado';
  }else if(kind==='start'){
   requireStaff();if(w.request?.status!=='alcance aceptado')fail('REQUEST_STATE_INVALID');w.request.status='en trabajo';
  }else if(kind==='deliver'){
   requireStaff();if(w.request?.status!=='en trabajo')fail('REQUEST_STATE_INVALID');
   w.deliveries.push({version:w.deliveries.length+1,text:text(payload.text,8000),proposalVersion:w.request.acceptedProposal,at:now,rights:'Simulación: no transfiere derechos de activos reales'});w.request.status='en revisión';
  }else if(kind==='revise'){
   requireOwner();if(w.request?.status!=='en revisión'||payload.version!==latest(w.deliveries).version)fail('DELIVERY_VERSION_CONFLICT');
   const revisions=w.feedback.filter(f=>f.deliveryVersion).length;
   if(revisions>=w.proposals.find(p=>p.version===w.request.acceptedProposal).rounds)fail('NEW_SCOPE_REQUIRED');
   w.feedback.push({deliveryVersion:payload.version,text:text(payload.text),scope:'entrega',at:now,consent:true});w.request.status='en trabajo';
  }else if(kind==='acceptDelivery'){
   requireOwner();if(w.request?.status!=='en revisión'||payload.version!==latest(w.deliveries).version)fail('DELIVERY_VERSION_CONFLICT');
   w.request.status='entrega aprobada';w.request.acceptedDelivery=payload.version;
  }else if(kind==='cancel'){
   requireOwner();if(!w.request||['entrega aprobada','cancelado'].includes(w.request.status))fail('REQUEST_STATE_INVALID');
   w.request.status='cancelado';
  }else fail('UNKNOWN_COMMAND');
  if(payload.simulateFailure===true)fail('SIMULATED_FAILURE');
  w.version++;w.events.push({actor,kind,at:now,version:w.version,resourceVersion:payload.version||null});
  w.receipts[receiptKey]={intent,version:w.version};return next;
 }
 return {initial,execute,allowed,questions,insightQuestions};
});
