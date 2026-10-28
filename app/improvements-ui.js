/* Connected only to the authenticated, loopback H1.2 laboratory. */
window.DVImprovementsUI=(function(){
 'use strict';
 const M=window.DVServiceModel,esc=DVUtil.esc;
 let generation=0,homeRequested=false;
 function home(){homeRequested=true;}
 const enabled=()=>window.DVDrafts?.enabled()&&new URLSearchParams(location.search).get('experience')==='requests';
 const clean=fields=>Object.fromEntries(Object.entries(fields||{}).filter(([k,v])=>!k.startsWith('welcome_')&&!['brand_logo','brand_logo_light','brand_logo_dark','brand_manual'].includes(k)&&(!k.startsWith('qnote_')||fields['q_'+k.slice(6)]===true)&&v!==''&&v!==null));
 function leave(){generation++;}
 function reset(resumedSession=null){leave();try{Object.keys(sessionStorage).filter(k=>k.startsWith('dv-improvement-draft-v1:')).forEach(k=>{let old;try{old=JSON.parse(sessionStorage.getItem(k));}catch{}if(!resumedSession||resumedSession.endsWith(':unknown')||old?.authSession!==resumedSession||old?.environment!==DVEnv.fingerprint())sessionStorage.removeItem(k);});}catch{}}
 async function render(host){
  const serial=++generation;host.innerHTML='<div class="service"><p role="status">Cargando tu espacio…</p></div>';
  let api,draft,inbox;
  const alive=()=>serial===generation&&host.isConnected;
  try{api=await DVWorkflowUI.connection();[draft,inbox]=await Promise.all([DVDrafts.open(),api.rpc('inbox')]);if(!alive())return;}
  catch{if(alive())host.innerHTML='<div class="service"><h1>No pudimos cargar tu espacio</h1><p>Tus solicitudes siguen guardadas. Vuelve a Mi panel para intentar de nuevo.</p></div>';return;}
  const recent=inbox.requests.filter(r=>r.state!=='closed').slice(0,6);
  const candidates=await Promise.all(recent.map(async r=>{try{return {request:r,detail:await api.rpc('read',r.id)};}catch{return {request:r,detail:null};}}));if(!alive())return;
  const priority=({detail:r})=>{if(!r)return 3;if(r.scopes?.[0]?.status==='proposed'||r.work?.items?.some(d=>d.canRespond))return 0;return r.work?.items?.[0]?.response?.kind==='received'?2:1;};
  const summaries=candidates.sort((a,b)=>priority(a)-priority(b)).slice(0,3);
  const storage='dv-improvement-draft-v1:'+api.identity;let state={category:'explain',need:'',guide:{},keys:[],view:'home',pending:null,receipt:null},busy=false,notice='';
  try{const old=JSON.parse(sessionStorage.getItem(storage)||'null');if(old&&api.authSession&&!api.authSession.endsWith(':unknown')&&typeof old.need==='string'&&old.authSession===api.authSession&&old.environment===DVEnv.fingerprint())state={...state,...old};}catch{}
  const save=()=>{if(!alive())return;try{sessionStorage.setItem(storage,JSON.stringify(state));}catch{notice='No pudimos conservar el borrador en esta pestaña. Mantén esta vista abierta hasta confirmar el envío.';}};
  state.authSession=api.authSession;state.environment=DVEnv.fingerprint();
  if(homeRequested){homeRequested=false;state.view='home';if(!state.pending)state.receipt=null;save();}
  const context=clean(draft.document?.fields),category=id=>M.categories[id]||M.guidance[id];
  if(!category(state.category))state.category='explain';
  const button=(text,action,primary=false)=>'<button type="button" data-improvement-action="'+action+'"'+(primary?' class="primary"':'')+'>'+text+'</button>';
  const card=(id,reason='')=>'<button type="button" class="improvement-card" data-improvement-category="'+id+'"><span class="eyebrow">'+esc(reason||'EXPLORAR UNA MEJORA')+'</span><strong>'+esc(M.categories[id].name)+'</strong><span>'+esc(M.categories[id].problem)+'</span><span class="card-cta">Ver opciones ↗</span></button>';
  function open(id){DVWorkflowUI.select(id);DVPortal.go('workflow');}
  function draw(focus=false){
   if(!alive())return;const c=category(state.category);
   let content='';
   if(state.receipt){content='<section class="card"><h2>Tu solicitud ya está en la bandeja del equipo</h2><p>Folio <strong>'+esc(state.receipt.id.slice(0,8))+'</strong>. Puedes volver cuando quieras; tu solicitud y las respuestas permanecen en Mis solicitudes.</p><p>El equipo revisará tu necesidad antes de acordar trabajo, precio o fecha.</p>'+button('Abrir mi solicitud','receipt',true)+button('Explorar otra mejora','new')+'</section>';}
   else if(state.pending){content='<section class="card"><h2>Falta confirmar el resultado del envío</h2><p>Conservamos la misma solicitud para comprobarla sin duplicarla. No necesitas volver a escribirla.</p><p>'+esc(category(state.pending.data.category)?.name||'Mejora')+'</p><p>'+esc(state.pending.data.need)+'</p>'+button('Comprobar el mismo envío','retry',true)+'</section>';}
   else if(state.view==='detail'){
    content='<div class="actions">'+button('Ver todas las mejoras','catalog')+'</div><h2>'+esc(c.name)+'</h2><p>'+esc(c.problem)+'</p><div class="split"><section class="card"><label>'+esc(c.prompt)+'<textarea data-improvement-need maxlength="2000">'+esc(state.need)+'</textarea></label><p class="inlinecopy">'+esc(c.hint)+'</p>'+DVServiceJourney.guideForm(state.guide)+'<details><summary>Añadir contexto guardado · opcional</summary><p>Solo se compartirán las respuestas que selecciones. No se adjuntan archivos en este paso.</p>'+Object.entries(context).map(([k,v])=>'<label class="check"><input type="checkbox" data-context-key="'+esc(k)+'"'+(state.keys.includes(k)?' checked':'')+'>'+esc(DVWorkflowUI.label(k))+'<span class="inlinecopy"> · '+esc(DVWorkflowUI.display(k,v))+'</span></label>').join('')+(!Object.keys(context).length?'<p>Puedes enviar tu necesidad sin completar el formulario de marca.</p>':'')+'</details><label class="check"><input type="checkbox" data-improvement-consent>Autorizo al equipo Don Ventas a revisar esta necesidad y el contexto que seleccioné.</label>'+button('Enviar al equipo de prueba','submit',true)+'<p class="inlinecopy">Se guardará en el entorno aislado. No contrata un servicio ni reserva una fecha. No se enviarán correos ni se ejecutará IA.</p></section><aside class="card"><h3>Qué podríamos trabajar</h3><ul>'+c.examples.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><p>'+(c.examples.length?'Son ejemplos para acordar, no un paquete que incluya todo.':'El equipo te ayudará a elegir por dónde empezar.')+'</p><p>Solo necesitas explicar qué quieres resolver. Tu formulario puede quedar incompleto.</p></aside></div>';
   }else if(state.view==='catalog')content='<section class="improvements"><h2>¿Qué necesitas conseguir ahora?</h2><p>Explora las opciones y cuéntanos qué te serviría. Puedes traer materiales que ya tengas.</p><div class="grid">'+Object.keys(M.categories).map(id=>card(id)).join('')+'</div><div class="actions">'+Object.entries(M.guidance).map(([id,c])=>'<button data-improvement-category="'+id+'">'+esc(c.name)+'</button>').join('')+'</div></section>';
   else content='<section class="connected-current"><h2>Tus solicitudes, en un vistazo</h2><p>Abre una solicitud para ver su siguiente paso, consultar una entrega o escribir al equipo.</p>'+(summaries.length?'<div class="grid">'+summaries.map(({request:q,detail:r})=>{const o=r?DVWorkflowUI.overview(r):{title:'Solicitud guardada',next:'Abre la solicitud para consultar su estado actual.',action:'Abrir solicitud'};return '<button class="improvement-card current-request" data-improvement-open="'+q.id+'"><span class="eyebrow">'+esc(o.title)+'</span><strong>'+esc(M.categories[q.category]?.name||'Tu solicitud')+'</strong><span class="request-excerpt">'+esc((q.need||'').split('\n')[0])+'</span><span>'+esc(o.next)+'</span><span class="card-cta">'+esc(o.action)+' ↗</span></button>';}).join('')+'</div>':'<div class="card"><h3>Empecemos con lo que necesitas</h3><p>No hace falta completar toda tu marca. Cuéntanos una necesidad y el equipo te ayudará a concretarla.</p>'+button('Explorar una mejora','catalog',true)+'</div>')+'<div class="actions">'+button('Ver todas mis solicitudes','inbox')+'</div></section><details class="panel-context"><summary>Mi marca y contexto · puedes completarlos después</summary><section class="card"><h2>Tu marca, a tu ritmo</h2><p>'+esc(context.name||draft.account?.name||'Tu marca')+'</p><p>'+esc(context.offer||'Puedes pedir ayuda aunque todavía estés definiendo tu oferta.')+'</p>'+button('Completar mi contexto','brand')+'</section></details><section class="improvements"><h2>Cuando necesites dar otro paso</h2><p>Estas opciones son para explorar. No necesitas pedir otra mejora para continuar con tu trabajo actual.</p><div class="grid">'+M.suggestions({need:state.need||context.objective||''}).map(x=>card(x.id,x.reason)).join('')+'</div><div class="actions">'+button('Explorar todas las opciones','catalog')+'</div></section>';
   const title=state.receipt?'Tu idea ya tiene un siguiente paso.':state.pending?'Tu solicitud, sin perder el hilo.':state.view==='catalog'?'¿Qué sigue para tu marca?':state.view==='detail'?'Demos forma a lo que necesitas.':'Tu marca. Un equipo contigo.';const intro=state.view==='home'?'Revisa lo pendiente, conversa con tu equipo y encuentra lo que necesitas para avanzar.':state.view==='catalog'?'Elige el problema que quieres resolver. El alcance y la fecha los acordamos contigo.':'Cuéntanos a tu ritmo. Antes de empezar, acordaremos contigo qué recibirás y cuándo.';host.innerHTML='<div class="service connected-service"><header class="service-editorial-head"><p class="eyebrow">DON VENTAS / TU ESPACIO</p><h1 tabindex="-1">'+title+'</h1><p>'+intro+'</p></header><nav class="tabs" aria-label="Tu espacio"><button data-improvement-action="home">Mi panel</button><button data-improvement-action="inbox">Mis solicitudes</button></nav><p data-improvement-status role="status" aria-live="polite">'+esc(notice)+'</p>'+content+'</div>';
   if(state.view==='home'&&!state.receipt&&!state.pending)window.DVDonPilot?.mount(host.querySelector('.service-editorial-head'),'client');
   if(busy)host.querySelectorAll('button,input,textarea').forEach(e=>e.disabled=true);
   if(focus){host.querySelector('h1').focus({preventScroll:true});document.querySelector('#main').scrollTop=0;}
  }
  async function send(){
   busy=true;notice='Confirmando el envío…';draw();
   try{const p=state.pending,r=await api.rpc('submit_improvement',null,p.data,p.key);if(!alive())return;state.receipt={id:r.id};state.pending=null;state.need='';state.guide={};state.keys=[];notice='Envío confirmado. Tu folio identifica la solicitud guardada.';save();}
   catch(e){if(!alive())return;if(e.definite){state.pending=null;state.view='detail';notice=e.message==='WORKFLOW_TEAM_UNAVAILABLE'?'Aún no hay un equipo asignado a esta cuenta de prueba. Tu texto se conserva.':e.message==='WORKFLOW_VERSION_CONFLICT'?'Tu contexto guardado cambió. Vuelve a Mi panel y revisa la selección antes de enviar.':'No se pudo enviar. Revisa tu sesión, la necesidad y la autorización.';save();}else notice='No pudimos confirmar el resultado. Comprueba el mismo envío para evitar duplicados.';}
   finally{busy=false;if(alive())draw(true);}
  }
  host.oninput=host.onchange=e=>{if(!alive())return;if(DVServiceJourney.captureGuide(e,state.guide ||= {})){save();return;}if(e.target.hasAttribute('data-improvement-need'))state.need=e.target.value;if(e.target.dataset.contextKey){const k=e.target.dataset.contextKey;state.keys=e.target.checked?[...new Set([...state.keys,k])]:state.keys.filter(x=>x!==k);}save();};
  host.onclick=async e=>{if(!alive())return;const b=e.target.closest('button');if(!b||busy)return;
   if(b.dataset.improvementOpen){open(b.dataset.improvementOpen);return;}
   if(b.dataset.improvementCategory){state.category=b.dataset.improvementCategory;state.view='detail';save();draw(true);return;}
   const a=b.dataset.improvementAction;if(!a)return;
   if(a==='inbox'){DVPortal.go('workflow');return;}if(a==='brand'){DVPortal.go('draft');return;}if(a==='receipt'){open(state.receipt.id);return;}
   if(a==='home'){if(!state.pending)state.receipt=null;state.view='home';save();render(host);return;}
   if(a==='retry'){await send();return;}
   if(a==='submit'){
    if(!state.need.trim()||!host.querySelector('[data-improvement-consent]').checked){notice='Escribe qué necesitas y autoriza su revisión antes de enviar.';const el=host.querySelector('[data-improvement-status]');el.textContent=notice;el.tabIndex=-1;el.focus();return;}
    const need=M.describeNeed(state.need,state.guide);if(need.length>4000){notice='Resume un poco el contexto para enviar hasta 4000 caracteres.';draw();return;}state.pending={key:crypto.randomUUID(),data:{category:state.category,need,contextKeys:[...state.keys],version:draft.version||0,consent:'improvement-v1'}};save();await send();return;
   }
   if(a==='new'){state.receipt=null;state.view='catalog';}else state.view=a==='catalog'?'catalog':'home';save();draw(true);
  };
  draw();
 }
 return {enabled,render,reset,leave,home};
})();
