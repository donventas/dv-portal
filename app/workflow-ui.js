/* Isolated operational slice. All authority and audience filtering live in RPC. */
window.DVWorkflowUI=(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const states={outdated:'El alcance cambió · espera una nueva invitación',received:'Recibida',reviewing:'En revisión',answered:'Con devolución',closed:'Cerrada',invited:'Por responder',accepted:'En colaboración',rejected:'Declinado',revoked:'Acceso retirado',expired:'Invitación vencida',pending:'Por revisar',running:'En preparación',complete:'Listo para revisar',failed:'Necesita reintento'};
 const labels={improvement_category:'Mejora que te interesa',improvement_need:'Qué necesitas resolver',name:'Marca',offer:'Oferta',audience:'Público',objective:'Objetivo',channels:'Canales',tone:'Tono de voz',restrictions:'Límites y condiciones',brand_status:'Estado de tu identidad visual',brand_primary:'Color principal',brand_secondary:'Color secundario',brand_background:'Color de fondo',brand_fonts:'Tipografías',brand_context:'Contexto visual',resumen:'Resumen',recomendacion:'Siguiente paso sugerido',faltantes:'Lo que falta aclarar'};
 function label(k){
  if(labels[k])return labels[k];
  for(const q of window.DVHybridCore?.questions||[])for(const [id,l] of q.options)if(k==='q_'+q.id+'_'+id||k==='qnote_'+q.id+'_'+id)return q.title+' · '+l+(k.startsWith('qnote_')?' · Tu contexto':'');
  for(const q of window.DVHybridCore?.insightQuestions||[])if(k.endsWith('_'+q.id))return q.label+(k.startsWith('is_')?' · Referencia':k.startsWith('ib_')?' · Cómo lo sabes':'');
  return 'Información adicional';
 }
 function display(k,v){if(k==='improvement_category')return (window.DVServiceModel?.categories[v]||window.DVServiceModel?.guidance[v])?.name||'Mejora';const values={brand_status:{ready:'Tengo identidad visual',organize:'Quiero ordenar mis materiales',none:'Todavía no tengo identidad visual'}};return values[k]?.[v]||(k.startsWith('ib_')?{hypothesis:'Mi interpretación · por validar',observed:'Lo he observado',pending:'Todavía no lo sé'}[v]:null)||(typeof v==='boolean'?(v?'Seleccionado':'No seleccionado'):v);}
 const modeLabel=v=>v==='referral'?'Referencia externa':'Colaboración con Don Ventas';
 const date=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'Fecha por confirmar':d.toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'});};
 const caches=new Map();let epoch=0;
 // Presentation only. Server permissions and transitions remain authoritative.
 function overview(r){
  const scope=r.scopes?.[0],w=r.work,items=(w?.items||[]).filter(d=>d.scopeVersion===w?.scopeVersion),current=items[0];
  let o={title:'Estamos revisando tu solicitud',next:'El equipo revisará tu necesidad. Puedes añadir una aclaración en la conversación.',action:'Escribir al equipo',target:'conversation'};
  if(r.staff)o={title:'Solicitud por atender',next:'Revisa el contexto y responde al cliente antes de acordar el trabajo.',action:'Revisar alcance',target:'scope'};
  if(scope?.status==='proposed')o=r.client?{title:'Tienes una propuesta para revisar',next:'Consulta qué recibirás, la fecha y las condiciones antes de aceptar.',action:'Revisar propuesta',target:'scope'}:{title:'Esperando la decisión del cliente',next:'La propuesta está compartida. Puedes resolver dudas en la conversación.',action:'Ver propuesta',target:'scope'};
  else if(scope&&scope.status!=='accepted')o={title:'Necesitamos actualizar el alcance',next:'La propuesta anterior ya no permite comenzar. Revisa con Don Ventas el siguiente paso.',action:r.staff?'Preparar nueva propuesta':'Consultar al equipo',target:r.staff?'scope':'conversation'};
  else if(w?.ready){
   o={title:'Alcance confirmado',next:'Don Ventas coordinará el trabajo acordado. Si necesitas aclarar algo, escríbelo aquí.',action:'Ver alcance acordado',target:'scope'};
   if(r.staff)o={title:'Coordinar el trabajo',next:'Consulta el encargo y los avances antes de publicar una entrega.',action:'Ver trabajo y entrega',target:'work'};
   if(w.assignment)o={title:w.canSubmit?'Prepara tu siguiente avance':'Tu avance está con Don Ventas',next:w.canSubmit?'Revisa el encargo y prepara una versión para el equipo.':'Consulta la revisión y mantén la conversación con el equipo.',action:'Abrir mi encargo',target:'work'};
   if(items.some(d=>d.canReview))o={title:'Hay un avance para revisar',next:'Revisa contenido y archivos contra el alcance. Publicar los hará visibles para el cliente.',action:'Revisar avance',target:'work'};
   if(current?.state==='published'&&!(w.assignment&&w.canSubmit))o=r.client?{title:'Tu entrega está disponible',next:'Revisa el resultado, descarga los archivos y cuéntanos si te sirve o necesitas ajustes.',action:'Revisar entrega',target:'work'}:{title:'Entrega compartida con el cliente',next:'La versión revisada ya está disponible para el cliente. Conserva aquí los archivos y la conversación.',action:'Consultar entrega',target:'work'};
   if(current?.response){const f=current.response;
    if(f.kind==='received')o={title:'Recepción confirmada',next:'La entrega y sus archivos siguen disponibles. Puedes volver a consultarlos cuando los necesites.',action:'Consultar entrega',target:'work'};
    else if(f.decision==='accepted')o={title:'Ajustes autorizados',next:'El equipo coordina una nueva versión dentro del alcance. La entrega anterior sigue disponible.',action:'Ver ajustes y entrega',target:'work'};
    else if(f.decision==='scope_needed')o={title:'El ajuste necesita otro alcance',next:'Revisa la explicación del equipo y aclara lo que necesitas antes de acordar otro trabajo.',action:'Ver respuesta del equipo',target:'work'};
    else o={title:r.client?'El equipo revisará tus ajustes':'Hay ajustes del cliente por revisar',next:r.client?'Tu petición está guardada. El equipo confirmará qué puede atender dentro del alcance.':'Revisa la petición, las rondas y la capacidad antes de autorizar trabajo.',action:'Ver solicitud de ajustes',target:'work'};
   }
  }
  if(!w)o={title:r.state==='answered'?'Hay una respuesta del equipo':r.staff?'Solicitud por atender':'Estamos revisando tu solicitud',next:'Consulta la conversación y continúa desde lo que ya compartiste.',action:'Ver conversación',target:'conversation'};
  if(r.state==='closed')o={title:'Solicitud cerrada',next:'Conservas la conversación, los acuerdos y las entregas publicadas.',action:'Consultar historial',target:w?'work':'conversation'};
  return {...o,coordinator:r.team?.find(p=>p.id===r.responsible)?.name||'Equipo Don Ventas',deliveryOn:scope?.status==='accepted'&&r.state!=='closed'?scope.deliveryOn:null};
 }
 function reset(){epoch++;caches.clear();}
 function mount(host,api,identity){
  const startEpoch=epoch,state=caches.get(identity)||{pending:null,buffers:{},id:null,assignment:null};caches.set(identity,state);
  state.composers ||= {};
  let busy=false,selected=null,alive=()=>host.isConnected&&startEpoch===epoch;
  host.classList.add('workflow');
  host.innerHTML='<p class="hy-note">Prueba operativa aislada · sin correos reales. Las mejoras se atienden directamente por el equipo, sin IA.</p><p role="status" aria-live="polite" data-status></p><div data-content></div><button class="btn" data-retry hidden>Reintentar la misma operación</button><button class="btn" data-file-retry hidden>Reintentar la subida del mismo archivo</button>';
  const content=host.querySelector('[data-content]'),status=s=>{if(alive())host.querySelector('[data-status]').textContent=s;};
  const button=(label,attrs='')=>'<button type="button" class="btn" '+attrs+'>'+label+'</button>';
  const text=(name,label,max=4000)=>'<label>'+label+'<textarea data-buffer="'+name+'" maxlength="'+max+'">'+esc(state.buffers[name]||'')+'</textarea></label>';
  const fields=obj=>'<dl>'+Object.entries(obj||{}).map(([k,v])=>'<dt>'+esc(label(k))+'</dt><dd>'+esc(display(k,v))+'</dd>').join('')+'</dl>';
  function scopePanel(r){
   if(!Array.isArray(r.scopes))return '';
   const list=r.scopes,latest=list[0],prefix=r.id+':scope:';
   const day=v=>v?new Date(v+'T12:00:00Z').toLocaleDateString('es-MX',{dateStyle:'long',timeZone:'UTC'}):'Por confirmar';
   const stateLabel={proposed:r.staff?'Esperando aceptación del cliente':'Esperando tu aceptación',accepted:'Aceptada en la prueba',expired:'Venció · necesitamos actualizarla',superseded:'Sustituida por una nueva propuesta',closed:'Solicitud cerrada'};
   const detail=q=>'<dl><dt>Qué recibirás</dt><dd>'+esc(q.definition.outcome)+'</dd><dt>Qué queda fuera</dt><dd>'+esc(q.definition.exclusions)+'</dd><dt>Qué necesitamos para hacerlo</dt><dd>'+esc(q.definition.requirements)+'</dd><dt>Rondas de ajustes incluidas</dt><dd>'+esc(q.definition.rounds)+'</dd><dt>Fecha prevista de entrega</dt><dd>'+esc(day(q.deliveryOn))+'</dd><dt>Puedes aceptar hasta</dt><dd>'+esc(day(q.validUntil))+' · fecha de Ciudad de México</dd></dl>'+(q.acceptedAt?'<p>Aceptación registrada el '+esc(date(q.acceptedAt))+'.</p>':'');
   const field=(key,label,type='text',fallback='')=>{const val=state.buffers[prefix+key]??latest?.definition?.[key]??latest?.[key]??fallback;return '<label>'+label+(type==='textarea'?'<textarea data-buffer="'+prefix+key+'" maxlength="'+(key==='outcome'?4000:2000)+'">'+esc(val)+'</textarea>':'<input type="'+type+'" data-buffer="'+prefix+key+'" value="'+esc(val)+'"'+(type==='number'?' min="0" max="5" step="1"':'')+'>')+'</label>';};
   return '<section data-scope-panel><h3>Alcance y fecha</h3><p>Primero acordamos qué necesitas y cuándo podremos entregarlo. Esta aceptación es una prueba: no contrata, cobra ni inicia trabajo.</p>'+
    (latest?'<article data-scope-current><h4>Propuesta '+latest.version+' · '+esc(stateLabel[latest.status])+'</h4>'+detail(latest)+(r.client&&latest.status==='proposed'?'<label><input type="checkbox" data-scope-consent> Revisé lo incluido, lo que queda fuera y la fecha. Acepto esta versión en la prueba.</label>'+button('Aceptar alcance y fecha · prueba','data-scope-accept'):'')+(latest.status==='accepted'?'<p>'+(r.staff?'El cliente aceptó esta versión.':'El equipo ya puede ver tu aceptación.')+' El trabajo y la entrega se coordinarán en el siguiente paso.</p>':'')+'</article>':'<p>Todavía no hay una propuesta. El equipo revisará tu necesidad y confirmará capacidad antes de compartir alcance y fecha.</p>')+
    '<p>Si algo no encaja, escríbelo en la conversación. No necesitas aceptar para pedir un ajuste.</p>'+button('Actualizar propuesta','data-scope-refresh')+
    (r.staff&&r.canPublish&&r.state!=='closed'?'<details data-scope-editor><summary>'+ (latest?'Preparar una nueva versión':'Preparar propuesta de alcance y fecha')+'</summary><p>Describe un resultado concreto y confirma que podemos atenderlo. Compartir una nueva versión sustituye la anterior y requiere otra aceptación del cliente.</p>'+field('outcome','Qué recibirá el cliente','textarea')+field('exclusions','Qué queda fuera','textarea')+field('requirements','Qué necesitamos del cliente · escribe «Nada adicional» si aplica','textarea')+field('rounds','Rondas de ajustes incluidas','number','1')+'<div class="workflow-grid">'+field('deliveryOn','Fecha prevista de entrega','date')+field('validUntil','Fecha límite para aceptar','date')+'</div><p>La fecha límite debe ser anterior a la entrega. Ambas fechas se interpretan en Ciudad de México.</p><label><input type="checkbox" data-scope-capacity> Revisé la capacidad del equipo y los requisitos para proponer esta fecha.</label>'+button('Compartir propuesta de prueba','data-scope-propose')+'</details>':'')+
    (list.length>1?'<details data-scope-history><summary>Propuestas anteriores · '+(list.length-1)+'</summary>'+list.slice(1).map(q=>'<article><h4>Propuesta '+q.version+' · '+esc(stateLabel[q.status])+'</h4>'+detail(q)+'</article>').join('')+'</details>':'')+'</section>';
  }
  function responsePanel(r,d){
   const f=d.response,topics={clarity:'Que se entienda mejor',tone:'El tono o estilo',accuracy:'Un dato o contenido',use:'Cómo utilizarlo',other:'Algo más'},prefix=d.id+':response:';
   let html=f?'<section data-response-status="'+d.id+'"><h5>'+ (f.kind==='received'?'Recepción confirmada':f.decision==='accepted'?'El equipo atenderá los ajustes':f.decision==='scope_needed'?'Necesitamos acordar otro alcance':'Ajustes enviados · el equipo los revisará')+'</h5><p>'+esc(date(f.createdAt))+'</p>'+(f.kind==='changes'?'<p>'+esc(f.detail.focus.map(k=>topics[k]).join(' · '))+'</p><p>'+esc(f.detail.note)+'</p>':'')+(f.teamNote?'<p><strong>Respuesta del equipo</strong></p><p>'+esc(f.teamNote)+'</p>':'')+'</section>':'';
   if(d.revisionInstruction)html+='<section data-revision-instruction><h5>Ajuste autorizado por Don Ventas</h5><p>'+esc(d.revisionInstruction)+'</p><p>Prepara una nueva versión. El equipo volverá a revisarla antes de publicarla.</p></section>';
   if(d.canRespond)html+='<section data-client-response="'+d.id+'"><h5>¿Te sirve para lo que acordamos?</h5><p>Esta decisión quedará ligada a la versión '+d.version+'. Puedes confirmar que te sirve o pedir ajustes. La entrega seguirá disponible.</p><label><input type="checkbox" data-received-confirm="'+d.id+'"> Revisé esta versión y me sirve para el uso acordado.</label>'+button('La recibí y me sirve','data-response-kind="received" data-delivery="'+d.id+'"')+'<details data-response-form="'+d.id+'"><summary>Necesito ajustes</summary><p>Señala lo que quieres mejorar. El equipo revisará si está incluido antes de comenzar; no se cobra ni se cambia el alcance automáticamente.</p><fieldset class="response-options"><legend>¿Qué parte necesita atención? · opcional</legend>'+Object.entries(topics).map(([k,l])=>'<label><input type="checkbox" data-response-focus="'+k+'" data-buffer="'+prefix+k+'"'+(state.buffers[prefix+k]?' checked':'')+'> '+l+'</label>').join('')+'</fieldset>'+text(prefix+'note','¿Qué cambiarías y qué resultado esperas?')+'<p class="inlinecopy">Puedes citar una frase, explicar dónde la usarás o dar un ejemplo. No necesitas saber de diseño.</p><label><input type="checkbox" data-response-confirm="'+d.id+'"> Quiero enviar estos ajustes sobre esta versión al equipo.</label>'+button('Enviar ajustes al equipo','data-response-kind="changes" data-delivery="'+d.id+'"')+'</details></section>';
   if(d.canReviewResponse)html+='<details data-response-review="'+d.id+'"><summary>Revisar los ajustes del cliente</summary><p>Rondas disponibles en este alcance: '+r.work.roundsRemaining+'. Aceptar consume una ronda y habilita un nuevo avance del encargo vigente. Si cambia el trabajo acordado o falta capacidad, propone otro alcance.</p>'+text(prefix+'team','Explicación para el cliente e instrucciones para el colaborador')+'<p>El cliente verá esta respuesta. Si aceptas los ajustes, también se compartirá con el colaborador; las notas privadas del cliente no se copian.</p><label><input type="checkbox" data-response-approved="'+d.id+'"> Revisé el alcance, las rondas y la capacidad para atenderlo.</label>'+button('Atender dentro del alcance','data-response-decision="accepted" data-delivery="'+d.id+'"')+button('Necesitamos otro alcance','data-response-decision="scope_needed" data-delivery="'+d.id+'"')+'</details>';
   return html;
  }
  function filePanel(d){
   const files=d.files||[];
   return '<section class="delivery-files" data-delivery-files="'+d.id+'"><h5>Archivos de esta versión</h5><p>'+(d.state==='published'?'Revisados por Don Ventas. Descarga los materiales de esta entrega.':'Solo tú y el equipo autorizado pueden ver estos archivos hasta que se publique la entrega.')+'</p>'+files.map(f=>'<div class="delivery-file"><strong>'+esc(f.name)+'</strong><small>'+Math.ceil(f.size/1024)+' KB · '+esc(f.mime==='application/pdf'?'PDF':f.mime==='image/png'?'PNG':'JPG')+'</small>'+button('Descargar '+esc(f.name),'data-file-download="'+f.id+'" data-delivery="'+d.id+'"')+'</div>').join('')+(!files.length?'<p>Todavía no hay archivos adjuntos.</p>':'')+(d.canUpload&&files.length<3?'<label>Elegir un archivo final<input type="file" data-file-input="'+d.id+'" accept=".pdf,.png,.jpg,.jpeg"></label><p class="inlinecopy">PDF, PNG o JPG · hasta 4 MB por archivo y 3 por versión. Usa un nombre sencillo, sin acentos. Añade tus archivos antes de avisar al equipo. Después de la revisión no se reemplazan: una corrección tendrá otra versión.</p>'+button('Subir para revisión','data-file-upload="'+d.id+'"'):'')+'</section>';
  }
  function workPanel(r){
   const w=r.work;if(!w)return '';
   const day=v=>v?new Date(v+'T12:00:00Z').toLocaleDateString('es-MX',{dateStyle:'long',timeZone:'UTC'}):'Por confirmar';
   const active=(r.assignments||[]).filter(a=>a.scope_version===w.scopeVersion&&['invited','accepted'].includes(a.state)&&new Date(a.expires_at)>new Date());
   const feedback=d=>(d.reviewNote?'<p><strong>Observaciones del equipo</strong></p><p>'+esc(d.reviewNote)+'</p>':'')+responsePanel(r,d);
   const items=w.items.map(d=>'<article data-delivery-id="'+d.id+'"><h4>'+({submitted:'Avance para revisión',changes:'El equipo pidió ajustes',published:'Entrega revisada disponible'}[d.state])+' · versión '+d.version+'</h4><p>Alcance '+d.scopeVersion+' · '+esc(date(d.submittedAt))+'</p><h5>Contenido</h5><p>'+esc(d.body)+'</p><h5>Cómo utilizarlo</h5><p>'+esc(d.usage)+'</p>'+(d.reviewedAt?'<small>Revisado el '+esc(date(d.reviewedAt))+'</small>':'')+filePanel(d)+feedback(d)+
    (d.canReview?'<details data-delivery-review="'+d.id+'"><summary>Revisar esta versión</summary><p>Contrasta el avance con el alcance aceptado. Las observaciones son para el colaborador; el cliente solo verá el contenido publicado y su explicación de uso.</p>'+text(d.id+':review','Observaciones para el colaborador')+'<label><input type="checkbox" data-review-approved="'+d.id+'"> Revisé el contenido y todos sus archivos contra el alcance '+d.scopeVersion+'.</label>'+button('Pedir ajustes al colaborador','data-delivery-review-action="changes" data-delivery="'+d.id+'" data-assignment="'+d.assignmentId+'"')+button('Aprobar y publicar al cliente','data-delivery-review-action="publish" data-delivery="'+d.id+'" data-assignment="'+d.assignmentId+'"')+'</details>':'')+'</article>').join('');
   return '<section data-work-panel><h3>'+(r.client?'Tu entrega':'Trabajo y entrega')+'</h3><p>'+(r.client?'Aquí encontrarás el resultado cuando el equipo lo haya revisado y publicado.':'El avance se revisa dentro de Don Ventas antes de compartirlo con el cliente.')+'</p><p class="inlinecopy">Entrega con explicación de uso y archivos privados. Ensayo sin pagos ni contratación.</p>'+(!w.ready?'<p>El alcance vigente aún no está aceptado o la solicitud está cerrada. Los avances anteriores no habilitan una entrega nueva.</p>':'')+
    (r.staff?'<p>Trabajamos sobre el alcance '+esc(w.scopeVersion||'por aceptar')+'. Cada invitación conserva su versión.</p>'+((r.assignments||[]).filter(a=>a.scope_version).map(a=>'<article><h4>Encargo '+a.id.slice(0,8)+' · alcance '+a.scope_version+'</h4><p>'+esc(a.brief)+'</p><p>Avance previsto: '+esc(day(a.due_on))+' · '+esc(states[a.state])+((a.scope_version!==w.scopeVersion||!w.ready)?' · Alcance no vigente':'')+'</p>'+(a.state!=='revoked'?button('Retirar acceso al encargo','data-revoke="'+a.id+'"'):'')+'</article>').join(''))+
     (w.ready&&!active.length?'<details data-work-assign-form><summary>Invitar a un colaborador</summary><p>Comparte solo el encargo y el contexto necesario. El colaborador confirmará si puede atenderlo en la fecha propuesta.</p><label>Colaborador suscrito<select data-work-user>'+r.collaborators.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join('')+'</select></label>'+text(r.id+':work:brief','Qué necesitamos que prepare')+'<label>Fecha para enviar el avance<input type="date" data-work-due value="'+esc(state.buffers[r.id+':work:due']||'')+'" data-buffer="'+r.id+':work:due"></label><p>Debe ser igual o anterior a la entrega acordada con el cliente. El acceso al encargo vence siete días después de esa entrega, al terminar el día en Ciudad de México.</p><fieldset><legend>Contexto que compartirás · opcional</legend>'+Object.keys(r.snapshot).map(k=>'<label><input type="checkbox" data-work-key="'+esc(k)+'"> '+esc(label(k))+'</label>').join('')+'</fieldset>'+button('Enviar invitación de prueba','data-work-assign')+'</details>':''):'')+
    (w.assignment?'<article data-work-brief><h4>Tu encargo · alcance '+w.assignment.scopeVersion+'</h4><p>'+esc(w.assignment.brief)+'</p><p>Envía tu avance para el '+esc(day(w.assignment.dueOn))+'. El equipo hará la revisión antes de publicarlo.</p><small>Acceso hasta '+esc(date(w.assignment.expiresAt))+'</small></article>':'')+
    (items||'<p>'+(r.client?'Todavía no hay una entrega publicada.':'Todavía no hay avances para revisar.')+'</p>')+
    (w.canSubmit?'<details data-delivery-compose><summary>Preparar un avance para el equipo</summary><p>Envía el contenido y cómo usarlo. Cada envío queda guardado como una versión; el cliente no lo verá hasta que Don Ventas lo apruebe.</p>'+text(r.id+':delivery:body','Contenido de la entrega',12000)+text(r.id+':delivery:usage','Cómo usarlo y qué decisiones tomaste')+button('Enviar avance a revisión','data-delivery-submit')+'</details>':'')+button('Actualizar trabajo y entrega','data-work-refresh')+'</section>';
  }
  function clearResponseDraft(id){for(const k of Object.keys(state.buffers))if(k.startsWith(id+':response:'))delete state.buffers[k];}
  function clearScopeDraft(){for(const k of Object.keys(state.buffers))if(k.startsWith(state.id+':scope:'))delete state.buffers[k];}
  async function work(fn){
   if(busy)return;busy=true;lock();status('Consultando…');
   try{await fn();}catch(e){const scopeErrors={FILE_INVALID:'Usa un PDF, PNG o JPG de hasta 4 MB con un nombre sencillo de hasta 120 caracteres, sin acentos.',FILE_TYPE:'El contenido no coincide con el formato del archivo. Revisa la exportación.',FILE_FROZEN:'Esta versión ya fue revisada. Actualiza para consultar el resultado; los archivos no se reemplazaron.',FILE_QUOTA:'Llegaste al límite de archivos de esta versión o del ensayo. Consulta al equipo.',FILE_REVIEW_REQUIRED:'Los archivos cambiaron. Actualiza y vuelve a revisar el conjunto antes de publicar.',FILE_KEY_CONFLICT:'No pudimos reutilizar ese intento. Actualiza antes de volver a subir.',WORKFLOW_RESPONSE_INVALID:'Confirma la versión y describe el ajuste que necesitas.',WORKFLOW_RESPONSE_REVIEW_REQUIRED:'Explica la decisión y confirma la revisión del alcance.',WORKFLOW_ROUNDS_EXHAUSTED:'Las rondas acordadas ya se utilizaron. Propón un nuevo alcance; no se inició otro ajuste.',WORKFLOW_BOUND_ACTION_REQUIRED:'Actualiza la solicitud para usar el encargo vinculado al alcance aceptado.',WORKFLOW_SCOPE_REQUIRED:'El alcance cambió o aún no está aceptado. Actualiza antes de continuar.',WORKFLOW_ASSIGNMENT_STALE:'Este encargo ya no está vigente. Pide al equipo una nueva invitación.',WORKFLOW_WORK_INVALID:'Revisa el encargo, la fecha y el contexto seleccionado.',WORKFLOW_WORK_DATES:'Revisa la fecha del avance: no puede haber pasado ni ser posterior a la entrega al cliente.',WORKFLOW_ACTIVE_ASSIGNMENT:'Ya hay un encargo vigente. Retira el acceso anterior antes de invitar a otra persona.',WORKFLOW_WORK_CONFIRM_REQUIRED:'Revisa y confirma el encargo y su versión.',WORKFLOW_DELIVERY_INVALID:'Completa el contenido y su explicación de uso.',WORKFLOW_DELIVERY_WAIT:'Este avance está en revisión o ya fue publicado. Actualiza para consultar la respuesta.',WORKFLOW_REVIEW_REQUIRED:'Escribe tus observaciones y confirma que revisaste esta versión.',WORKFLOW_SCOPE_INVALID:'Revisa el alcance, las exclusiones, los requisitos y las rondas (0 a 5). Confirma también la capacidad.',WORKFLOW_SCOPE_DATES:'Revisa las fechas: el límite para aceptar no puede haber pasado y debe ser anterior a la entrega.',WORKFLOW_SCOPE_CONFIRM_REQUIRED:'Revisa la propuesta y marca tu aceptación antes de confirmar.',WORKFLOW_SCOPE_EXPIRED:'La propuesta venció. Pide una actualización al equipo; no se registró tu aceptación.',WORKFLOW_SCOPE_CLOSED:'La solicitud está cerrada. No se puede proponer ni aceptar un alcance.'};status(scopeErrors[e.message]||(e.message==='WORKFLOW_VERSION_CONFLICT'?'La versión cambió. Actualiza y vuelve a revisar antes de confirmar.':e.message==='WORKFLOW_FORBIDDEN'?'Tu sesión o permiso no permite esta acción.':state.filePending?'No pudimos confirmar la subida. Reintenta el mismo archivo; no se duplicará.':state.pending?'No pudimos confirmar el resultado. Reintenta la misma operación; tus textos se conservan.':'No se pudo completar. Puedes volver a intentar.'));}
   finally{busy=false;lock();}
  }
  function lock(){if(!alive())return;host.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=busy||!!state.pending||!!state.filePending);const retry=host.querySelector('[data-retry]');retry.hidden=!state.pending;retry.disabled=busy;const fileRetry=host.querySelector('[data-file-retry]');fileRetry.hidden=!state.filePending;fileRetry.disabled=busy;}
  async function write(action,id,data){
   if(!state.pending)state.pending={action,id,data:structuredClone(data),key:crypto.randomUUID()};
   const intent=state.pending;
   try{const r=await api.rpc(intent.action,intent.id,intent.data,intent.key);if(!alive())return null;state.pending=null;status('Operación confirmada.');return r;}
   catch(e){if(e.definite)state.pending=null;throw e;}
  }
  function filterRequests(){
   const query=(state.requestSearch||'').trim().toLocaleLowerCase('es'),filter=state.requestFilter||'all';let visible=0;
   for(const row of content.querySelectorAll('[data-request-row]')){const match=(!query||row.textContent.toLocaleLowerCase('es').includes(query))&&(filter==='all'||(filter==='active'?['received','reviewing'].includes(row.dataset.requestState):row.dataset.requestState===filter));row.hidden=!match;if(match)visible++;}
   content.querySelectorAll('[data-request-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.requestFilter===filter)));
   const count=content.querySelector('[data-request-count]');if(count)count.textContent=visible+' de '+content.querySelectorAll('[data-request-row]').length+' solicitudes en esta página';
   const empty=content.querySelector('[data-request-empty]');if(empty)empty.hidden=visible>0;
  }
  function clientInbox(r,n){
   const active=r.requests.filter(q=>q.state!=='closed').length,answered=r.requests.filter(q=>q.state==='answered').length;
   content.innerHTML='<div class="request-journal"><header class="request-journal-head"><div><p class="request-kicker">MIS SOLICITUDES / DON VENTAS</p><h2>Tus ideas.<br><em>En marcha.</em></h2><p>Un lugar para conversar, acordar y ver lo que estamos construyendo contigo.</p></div><aside><span class="journal-count">'+String(active).padStart(2,'0')+'</span><strong>solicitudes abiertas</strong><p>'+answered+' con respuesta del equipo</p><small>Resumen de esta página</small></aside></header><div class="journal-toolbar"><div class="journal-filters" role="group" aria-label="Filtrar solicitudes">'+[['all','Todas'],['active','En curso'],['answered','Con respuesta'],['closed','Cerradas']].map(([key,label])=>button(label,'data-request-filter="'+key+'" aria-pressed="false"')).join('')+'</div><label class="journal-search">Buscar en esta página<input type="search" data-request-search value="'+esc(state.requestSearch||'')+'" placeholder="Una necesidad, categoría o folio"></label></div><div class="journal-list-heading"><h3>Tu trabajo con Don Ventas</h3><p data-request-count role="status" aria-live="polite"></p>'+button('Actualizar','data-refresh')+'</div><div class="journal-list">'+r.requests.map((q,i)=>'<article class="request-row" data-request-row data-request-state="'+esc(q.state)+'"><div class="request-row-index" aria-hidden="true">'+String(i+1).padStart(2,'0')+'</div><div class="request-row-copy"><p class="request-row-category">'+esc(q.category?display('improvement_category',q.category):'Solicitud de revisión')+'</p><h4>'+esc(q.need||'Revisar el contexto de mi marca')+'</h4><p class="request-row-meta">Folio '+esc(q.id.slice(0,8))+'</p></div><div class="request-row-action"><span class="request-status-tag">'+esc(states[q.state])+'</span><p>'+esc(q.state==='answered'?'Consulta lo que preparó el equipo.':q.state==='closed'?'Vuelve a los acuerdos y resultados.':'Sigue la conversación y el avance.')+'</p>'+button(q.state==='answered'?'Ver respuesta ↗':q.state==='closed'?'Consultar historial ↗':'Abrir solicitud ↗','data-open="'+q.id+'"')+'</div></article>').join('')+'</div><div class="journal-empty" data-request-empty hidden><h3>No hay solicitudes con este filtro.</h3><p>Prueba otra palabra o vuelve a Todas. Las solicitudes guardadas siguen en su lugar.</p>'+button('Ver todas en esta página','data-request-clear')+'</div><footer class="journal-footer"><p>Conversaciones, personas y entregas permanecen dentro de cada solicitud.</p>'+(r.requests.length===50?button('Más solicitudes','data-inbox-after="'+r.requests.map(x=>x.id).sort().at(-1)+'"'):'')+'</footer><details id="workflow-notices"><summary>Mis avisos · '+n.notices.filter(x=>!x.read_at).length+' sin leer en esta página</summary>'+notices(n.notices)+'</details></div>';filterRequests();
  }
  async function inbox(after=null){
   const r=await api.rpc('inbox',after),n=await api.rpc('notices');if(!alive())return;
   state.id=null;state.assignment=null;selected=null;
   if(window.DVImprovementsUI?.enabled()&&DVStore.session().actor==='cliente'){clientInbox(r,n);status('Bandeja actualizada.');return;}
   content.innerHTML='<div class="draft-actions">'+button('Actualizar bandeja','data-refresh')+(api.draft?button('Revisar y enviar borrador','data-prepare'):'')+'</div><h3>Solicitudes para revisar</h3><p>Abre una solicitud para consultar lo compartido y continuar la conversación. Abrirla no cambia su estado.</p><div class="workflow-grid">'+
    (r.requests.map(q=>'<article class="workflow-card"><h4>'+esc(q.category?display('improvement_category',q.category):'Solicitud de revisión')+'</h4><p>Folio '+esc(q.id.slice(0,8))+' · '+esc(states[q.state])+'</p><p class="workflow-card-copy">'+esc(q.need||'Consulta el contexto enviado, los mensajes y la respuesta del equipo.')+'</p>'+button('Abrir solicitud','data-open="'+q.id+'"')+'</article>').join('')||'<p>Aún no hay solicitudes para tu cuenta.</p>')+
    '</div>'+(r.requests.length===50?button('Más solicitudes','data-inbox-after="'+r.requests.map(x=>x.id).sort().at(-1)+'"'):'')+
    '<h3>Mis encargos</h3><p>Aquí encuentras las invitaciones y colaboraciones asignadas a tu cuenta. Cada encargo comparte solo el contexto necesario.</p><div class="workflow-grid">'+(r.invitations.map(x=>'<article class="workflow-card"><h4>Encargo '+esc(x.id.slice(0,8))+'</h4><p>'+esc(states[x.state])+' · '+(x.mode==='referral'?'Referencia autorizada':'Colaboración con DV')+'</p><p class="workflow-card-copy">'+(x.state==='invited'?'Al aceptar podrás consultar el contexto autorizado y conversar con Don Ventas. Puedes declinar si no puedes atenderlo.':x.state==='accepted'?'Consulta lo que se te ha compartido y responde al equipo dentro de este encargo.':'Esta invitación ya no permite acceder al encargo.')+'</p>'+(x.scopeVersion&&x.brief?'<p><strong>Encargo · alcance '+x.scopeVersion+'</strong></p><p>'+esc(x.brief)+'</p><p>Avance para '+esc(x.dueOn)+' · Ciudad de México.</p><p>Confirma que puedes atender este encargo y fecha en la prueba. No es una contratación ni un pago.</p>':'')+'<small>Disponible hasta '+esc(date(x.expiresAt))+'</small>'+(x.state==='accepted'?button('Abrir encargo','data-open="'+x.requestId+'" data-assignment="'+x.id+'"'):x.state==='invited'?button(x.scopeVersion?'Aceptar encargo y fecha · prueba':'Aceptar','data-work-version="'+(x.scopeVersion||'')+'" data-decision="accept" data-id="'+x.requestId+'" data-assignment="'+x.id+'"')+button('No puedo atenderlo','data-work-version="'+(x.scopeVersion||'')+'" data-decision="reject" data-id="'+x.requestId+'" data-assignment="'+x.id+'"'):'')+'</article>').join('')||'<p>No hay encargos pendientes.</p>')+
    '</div><details id="workflow-notices"><summary>Mis avisos · '+n.notices.filter(x=>!x.read_at).length+' sin leer en esta página</summary>'+notices(n.notices)+'</details>';
   window.DVProfessionalSpace?.dashboard(content,alive);status('Bandeja actualizada.');
  }
  function notices(rows){return rows.map(n=>'<p>'+esc(n.title)+' · '+(n.read_at?'Leído':button('Marcar leído','data-notice="'+n.id+'" data-id="'+n.request_id+'"'))+'</p>').join('')+(rows.length===50?button('Más avisos','data-notices-after="'+rows.at(-1).id+'"'):'')||'<p>Por ahora no tienes avisos nuevos. Aquí aparecerán las novedades de tus solicitudes y encargos.</p>';}
  async function prepare(){
   const d=await api.draft();if(!alive())return;
   if(!d.version){status('Primero guarda las respuestas que quieras enviar. No necesitas completar todo.');return;}
   const snapshot=structuredClone(d.document.fields);for(const k of Object.keys(snapshot))if(k.startsWith('welcome_')||k.startsWith('qnote_')&&snapshot['q_'+k.slice(6)]!==true||['brand_logo','brand_logo_light','brand_logo_dark','brand_manual'].includes(k))delete snapshot[k];
   const ids=['brand_logo','brand_logo_light','brand_logo_dark','brand_manual'].map(k=>d.document.fields[k]);
   content.innerHTML='<h3>Revisa lo que vas a compartir · versión '+d.version+'</h3><p>Enviarás la versión guardada que aparece abajo. Los cambios sin guardar y las notas de opciones desmarcadas no se incluyen.</p><details open><summary>Respuestas que compartes</summary>'+fields(snapshot)+'</details><fieldset><legend>Archivos que quieres compartir · opcional</legend>'+d.assets.filter(a=>ids.includes(a.id)).map(a=>'<label><input type="checkbox" data-share="'+a.id+'"> '+esc(a.name)+'</label>').join('')+'</fieldset><label><input type="checkbox" data-consent> Confirmo esta versión y autorizo al equipo Don Ventas a revisar estas respuestas y los archivos seleccionados. Compartir con un especialista externo requerirá mi autorización específica.</label>'+button('Confirmar envío para revisión','data-submit="'+d.version+'"')+button('Volver sin enviar','data-refresh');status('Revisa la información antes de enviarla.');
  }
  function requestOverview(r){
   const o=overview(r),title=r.snapshot?.improvement_category?display('improvement_category',r.snapshot.improvement_category):'Tu solicitud';
   const lead=r.snapshot?.improvement_need||'El contexto, las personas y los resultados de tu marca, juntos.';
   return '<section class="request-overview" data-request-overview><div class="request-heading"><p class="request-kicker">TU SOLICITUD / '+esc(r.id.slice(0,8))+'</p><h2>'+esc(title)+'</h2><p class="request-brief">'+esc(lead)+'</p><div class="request-facts"><p>Coordina<strong>'+esc(o.coordinator)+'</strong></p>'+(o.deliveryOn?'<p>Entrega acordada<strong>'+esc(new Date(o.deliveryOn+'T12:00:00Z').toLocaleDateString('es-MX',{dateStyle:'long',timeZone:'UTC'}))+'</strong></p>':'')+'</div></div><aside class="request-next"><p class="request-kicker">EL SIGUIENTE PASO</p><p class="request-state">'+esc(o.title)+'</p><p>'+esc(o.next)+'</p>'+button(esc(o.action),'data-primary data-request-jump="'+o.target+'"')+'</aside><nav class="request-access" aria-label="Dentro de esta solicitud">'+button('<span>01</span> Conversación<small>Escribe al equipo</small>','data-request-jump="conversation"')+(r.work?button('<span>02</span> Alcance y fecha<small>Lo que acordamos</small>','data-request-jump="scope"')+button('<span>03</span> '+(r.client?'Entregas y ajustes':'Avances y entregas')+'<small>Consulta el resultado</small>','data-request-jump="work"'):'')+((r.client||r.staff)?button('<span>04</span> Personas y perfiles<small>Conoce quién te acompaña</small>','data-request-jump="people"'):'')+'</nav></section>';
  }
  function organize(r){
   if(!r.work)return;
   const wrap=(selector,key,title)=>{const node=content.querySelector(selector);if(!node)return;const details=document.createElement('details');details.dataset.requestSection=key;details.className='request-section';const summary=document.createElement('summary');summary.textContent=title;details.append(summary);node.before(details);details.append(node);details.open=!!state.disclosures?.[r.id]?.[key];};
   wrap('[data-scope-panel]','scope','Alcance y acuerdos');wrap('[data-work-panel]','work',r.client?'Entregas y ajustes':'Encargo, avances y revisión');wrap('[data-coordination]','coordination','Coordinación del equipo');
   const context=content.querySelector('[data-request-context]');if(context){context.classList.add('request-section');content.append(context);}
   const conversation=content.querySelector('[data-conversation]');if(conversation){content.querySelector('[data-request-overview]').after(conversation);const messages=[...conversation.querySelectorAll('[data-message]')],older=messages.slice(0,-3);if(older.length){const history=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Otros mensajes de esta página · '+older.length;history.append(summary);older[0].before(history);older.forEach(node=>history.append(node));}}
   const work=content.querySelector('[data-work-panel]'),old=work?[...work.querySelectorAll(':scope > [data-delivery-id]')].slice(1):[];
   if(old.length){const history=document.createElement('details');history.dataset.olderDeliveries='';const summary=document.createElement('summary');summary.textContent='Versiones anteriores · '+old.length;history.append(summary);old[0].before(history);old.forEach(node=>history.append(node));}
   content.querySelectorAll('[data-request-section]').forEach(d=>d.addEventListener('toggle',()=>{state.disclosures||={};state.disclosures[r.id]||={};state.disclosures[r.id][d.dataset.requestSection]=d.open;}));
  }
  async function read(id,assignment=null,after=null){
   const r=await api.rpc('read',id,{...(assignment?{assignmentId:assignment}:{}),...(after?{after}:{})});if(!alive())return;
   state.id=id;state.assignment=assignment;selected=r;
   const key=id+':'+(assignment||'client');
   const composer=state.composers[key]||{audience:'client',assignment:''};
   const selectedOption=(value,current)=>value===current?' selected':'';
   content.innerHTML=button('Volver a mis solicitudes','data-refresh')+requestOverview(r)+'<details data-request-context><summary>Contexto compartido</summary>'+fields(r.snapshot)+(r.assets||[]).map((a,i)=>button('Descargar archivo '+(i+1),'data-asset="'+a+'"')).join('')+'</details>'+
    scopePanel(r)+workPanel(r)+(r.staff?'<section data-coordination><h4>Organiza la atención</h4><p>Elige quién dará seguimiento y en qué momento está la solicitud. Guardar esta gestión no publica una devolución al cliente.</p><label>Responsable<select data-responsible>'+r.team.map(u=>'<option value="'+u.id+'"'+(u.id===r.responsible?' selected':'')+'>'+esc(u.name)+' · '+u.id.slice(0,6)+'</option>').join('')+'</select></label><label>Estado<select data-state>'+['received','reviewing',...(r.state==='answered'?['answered']:[]),'closed'].map(s=>'<option value="'+s+'"'+(s===r.state?' selected':'')+'>'+states[s]+'</option>').join('')+'</select></label>'+button('Guardar gestión','data-manage')+(r.snapshot?.improvement_category?'<p>Esta mejora se revisa por el equipo. No utiliza análisis automático.</p>':'<details><summary>Análisis interno · '+esc(states[r.analysis?.state||'pending']||'Por revisar')+'</summary><p>Simulación sin modelo real. No se publica automáticamente.</p>'+fields(r.analysis?.result?{resumen:r.analysis.result.summary,recomendacion:r.analysis.result.recommendation,faltantes:r.analysis.result.missing.map(k=>labels[k]||label(k)!=='Información adicional'?label(k):k).join(', ')}:{})+(r.analysis?.result?'<details><summary>En qué se basa esta revisión</summary><p>Estas referencias ayudan al equipo a contrastar la propuesta con lo que el cliente compartió.</p>'+fields(Object.fromEntries((r.analysis.result.facts||[]).map(f=>[f.field||f.key,f.value])))+'<p>Las sugerencias son un apoyo de prueba: el equipo debe revisarlas antes de responder.</p></details>':'')+(r.analysis?.state==='failed'?button('Reintentar análisis','data-analysis-retry'):'')+'</details>')+'</section>':'')+
    '<section data-conversation><h3>Conversemos aquí</h3><p>Escribe una aclaración o el siguiente paso. Revisa con quién se compartirá antes de enviar.</p>'+r.messages.map(m=>'<article data-message><strong>'+esc({client:'Cliente y Don Ventas',internal:'Solo equipo DV',collaborator:'Encargo y Don Ventas'}[m.audience])+(m.kind==='approved_return'?' · Devolución aprobada':'')+'</strong><small>'+esc(date(m.created_at))+'</small><p>'+esc(m.body)+'</p></article>').join('')+(r.messages.length===50?button('Más mensajes','data-messages-after="'+r.messages.map(x=>x.id).sort().at(-1)+'"'):'')+
    (r.staff?'<label>¿Quién verá este mensaje?<select data-audience><option value="client"'+selectedOption('client',composer.audience)+'>Cliente y Don Ventas</option><option value="internal"'+selectedOption('internal',composer.audience)+'>Solo equipo DV</option>'+((r.assignments||[]).some(a=>a.state==='accepted')?'<option value="collaborator"'+selectedOption('collaborator',composer.audience)+'>Colaborador del encargo seleccionado</option>':'')+'</select></label><label>Encargo del colaborador<select data-message-assignment><option value="">Seleccionar</option>'+(r.assignments||[]).filter(a=>a.state==='accepted').map(a=>'<option value="'+a.id+'"'+selectedOption(a.id,composer.assignment)+'>'+a.id.slice(0,8)+'</option>').join('')+'</select></label>':'<p>'+(assignment?'Colaborador y Don Ventas':'Cliente y Don Ventas')+'</p>')+
    text(key,'Tu mensaje')+button('Enviar mensaje','data-message-send')+'</section>'+
    (r.canPublish&&!r.work?'<details><summary>Preparar devolución al cliente</summary><p>Revisa el contenido y confirma su publicación. No se copia el análisis interno automáticamente.</p>'+text(id+':return','Devolución',8000)+'<label><input type="checkbox" data-approved> Revisé y apruebo esta devolución para el cliente.</label>'+button('Publicar devolución aprobada','data-publish')+'</details>':'')+
    (r.staff&&!r.work?'<details><summary>Solicitar apoyo a un colaborador</summary><p>Elige a la persona y comparte solo lo que necesita para este trabajo. La referencia externa requiere autorización específica del cliente antes de invitar.</p><label>Colaborador suscrito<select data-collaborator>'+r.collaborators.map(u=>'<option value="'+u.id+'">'+esc(u.name)+' · '+u.id.slice(0,6)+'</option>').join('')+'</select></label><label>Modalidad<select data-mode><option value="collaboration">Colaboración bajo Don Ventas</option><option value="referral">Referencia externa · requiere autorización del cliente</option></select></label><fieldset><legend>Selecciona el contexto mínimo</legend>'+Object.keys(r.snapshot).map(k=>'<label><input type="checkbox" data-scope="'+esc(k)+'"> '+esc(label(k))+'</label>').join('')+'</fieldset><label>Reemplazar encargo · opcional<select data-replace><option value="">Crear nuevo</option>'+r.assignments.filter(a=>['invited','accepted'].includes(a.state)).map(a=>'<option value="'+a.id+'">'+a.id.slice(0,8)+'</option>').join('')+'</select></label>'+button('Preparar invitación','data-assign')+r.assignments.map(a=>'<p>'+esc(a.id.slice(0,8))+' · '+esc(states[a.state]||'Por revisar')+' · '+esc(modeLabel(a.mode))+(a.state!=='revoked'?button('Retirar acceso','data-revoke="'+a.id+'"'):'')+'</p>').join('')+'</details>':'')+
    (r.referrals||[]).map(a=>'<details><summary>Referencia a '+esc(a.recipient)+' · '+esc(states[a.state])+'</summary><p>Compartirás únicamente la información que aparece aquí con '+esc(a.recipient)+'. Podrá consultarla cuando autorices esta referencia y acepte la invitación.</p>'+fields(a.scope)+(a.state==='invited'&&!a.consented?button('Autorizar este contexto y destinatario','data-consent-referral="'+a.id+'"'):'')+(a.state!=='revoked'?button('Retirar autorización','data-revoke="'+a.id+'"'):'')+'</details>').join('');
   if(r.staff){const audience=host.querySelector('[data-audience]'),target=host.querySelector('[data-message-assignment]');if(composer.audience==='collaborator'&&![...audience.options].some(o=>o.value==='collaborator'))audience.add(new Option('Colaboración no disponible · elige destinatario','',true,true));if(composer.assignment&&![...target.options].some(o=>o.value===composer.assignment))target.value='';}
   organize(r);
   if(r.client){const published=(r.work?.items||[]).find(d=>d.state==='published');if(published)window.DVDonPilot?.mount(content.querySelector('[data-delivery-id="'+published.id+'"]'),'delivery');}
   if((r.staff||r.client)&&window.DVProfessionalUI){const people=document.createElement('div');people.dataset.requestPeople='';content.querySelector('[data-conversation]').after(people);DVProfessionalUI.mountRequest(people,r.id);const recommendations=document.createElement('div');recommendations.dataset.requestRecommendations='';people.before(recommendations);window.DVRecommendations?.request(recommendations,r);}
   status('Solicitud recuperada.');
  }
  host.oninput=host.onchange=e=>{if(!alive())return;e.stopPropagation();if(e.target.hasAttribute('data-request-search')){state.requestSearch=e.target.value;filterRequests();return;}if(e.target.dataset.buffer)state.buffers[e.target.dataset.buffer]=e.target.type==='checkbox'?e.target.checked:e.target.value;if(e.target.matches('[data-audience],[data-message-assignment]')){const key=state.id+':'+(state.assignment||'client');state.composers[key]={audience:host.querySelector('[data-audience]').value,assignment:host.querySelector('[data-message-assignment]').value};}};
  host.onclick=e=>{if(!alive())return;e.stopPropagation();const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.hasAttribute('data-request-filter')){state.requestFilter=b.dataset.requestFilter;filterRequests();return;}if(b.hasAttribute('data-request-clear')){state.requestFilter='all';state.requestSearch='';content.querySelector('[data-request-search]').value='';filterRequests();content.querySelector('[data-request-search]').focus();return;}
   if(b.dataset.requestJump){const key=b.dataset.requestJump,section=host.querySelector('[data-request-section="'+key+'"]');if(section){section.open=true;section.querySelector('summary').focus();section.scrollIntoView({block:'start'});}else if(key==='people'){const nodes=[host.querySelector('[data-request-recommendations]'),host.querySelector('[data-request-people]')].filter(Boolean);for(const node of nodes){const details=node.querySelector('details');if(details)details.open=true;}const first=nodes[0];first?.querySelector('summary')?.focus();first?.scrollIntoView({block:'start'});}else if(key==='conversation'){const field=host.querySelector('[data-conversation] textarea');field?.focus();}return;}
   work(async()=>{
    const get=s=>host.querySelector(s),value=s=>get(s)?.value;
    if(b.hasAttribute('data-file-upload')||b.hasAttribute('data-file-retry')){
     let intent=state.filePending;
     if(!intent){
      const did=b.dataset.fileUpload,file=get('[data-file-input="'+did+'"]').files[0];
      if(!file){status('Elige el archivo que quieres compartir para revisión.');return;}
      if(!/^[a-zA-Z0-9][a-zA-Z0-9 _().-]*\.(pdf|png|jpg|jpeg)$/.test(file.name)||file.name.length>120||!file.size||file.size>4194304){throw Error('FILE_INVALID');}
      const bytes=new Uint8Array(await file.arrayBuffer());if(!alive())return;let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      intent={requestId:state.id,assignmentId:state.assignment,deliveryId:did,key:crypto.randomUUID(),data:{name:file.name,mime:({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'})[file.name.split('.').pop()],base64:btoa(binary)}};state.filePending=intent;
     }
     try{await api.files('upload',intent.requestId,intent.deliveryId,intent.assignmentId,intent.key,intent.data);if(!alive())return;state.filePending=null;await read(intent.requestId,intent.assignmentId);status('Archivo guardado de forma privada. El equipo debe revisar esta versión antes de publicarla.');}
     catch(e){if(e.definite)state.filePending=null;throw e;}return;
    }
    if(b.dataset.fileDownload){
     const f=await api.files('download',state.id,b.dataset.delivery,state.assignment,b.dataset.fileDownload,{});if(!alive())return;
     const bytes=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0)),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
     if(hash!==f.sha256)throw Error('FILE_INVALID');if(!alive())return;
     const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),link=document.createElement('a');link.href=url;link.download=f.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Descarga preparada. Conserva esta versión junto con su explicación de uso.');return;
    }
    if(b.hasAttribute('data-retry')){const {action,data}=state.pending;await write();if(action==='scope_propose')clearScopeDraft();if(action==='message')delete state.buffers[state.id+':'+(state.assignment||'client')];if(action==='work_assign'){delete state.buffers[state.id+':work:brief'];delete state.buffers[state.id+':work:due'];}if(action==='delivery_submit'){delete state.buffers[state.id+':delivery:body'];delete state.buffers[state.id+':delivery:usage'];}if(action==='delivery_review')delete state.buffers[data.deliveryId+':review'];if(['delivery_respond','response_review'].includes(action))clearResponseDraft(data.deliveryId);return state.id?read(state.id,state.assignment):inbox();}
    if(b.dataset.responseKind){
     const id=b.dataset.delivery,kind=b.dataset.responseKind,note=kind==='changes'?(state.buffers[id+':response:note']||''):'';
     if(!get('['+(kind==='received'?'data-received-confirm':'data-response-confirm')+'="'+id+'"]').checked||kind==='changes'&&!note.trim()){status('Revisa esta versión, añade qué cambiarías si pides ajustes y confirma tu decisión.');return;}
     const focus=kind==='changes'?[...get('[data-response-form="'+id+'"]').querySelectorAll('[data-response-focus]:checked')].map(x=>x.dataset.responseFocus):[];
     await write('delivery_respond',state.id,{deliveryId:id,revision:selected.revision,kind,note,focus,confirmed:true});clearResponseDraft(id);await read(state.id,state.assignment);status(kind==='received'?'Recepción confirmada. Tu entrega sigue disponible.':'Ajustes guardados. El equipo revisará si caben en el alcance.');return;
    }
    if(b.dataset.responseDecision){
     const id=b.dataset.delivery,note=state.buffers[id+':response:team']||'';
     if(!note.trim()||!get('[data-response-approved="'+id+'"]').checked){status('Explica la decisión y confirma la revisión del alcance y la capacidad.');return;}
     await write('response_review',state.id,{deliveryId:id,revision:selected.revision,decision:b.dataset.responseDecision,note,approved:true});clearResponseDraft(id);await read(state.id,state.assignment);status('Decisión guardada y disponible para el cliente.');return;
    }
    if(b.hasAttribute('data-work-refresh'))return read(state.id,state.assignment);
    if(b.hasAttribute('data-work-assign')){
     const brief=state.buffers[state.id+':work:brief']||'',dueOn=value('[data-work-due]');
     if(!brief.trim()||!dueOn||!value('[data-work-user]')){status('Elige a un colaborador y completa su encargo y la fecha del avance.');return;}
     const r=await write('work_assign',state.id,{revision:selected.revision,scopeVersion:selected.work.scopeVersion,userId:value('[data-work-user]'),brief,dueOn,keys:[...host.querySelectorAll('[data-work-key]:checked')].map(e=>e.dataset.workKey)});
     if(r){delete state.buffers[state.id+':work:brief'];delete state.buffers[state.id+':work:due'];await read(state.id,state.assignment);status('Invitación guardada. El colaborador debe confirmar el encargo y la fecha.');}return;
    }
    if(b.hasAttribute('data-delivery-submit')){
     const body=state.buffers[state.id+':delivery:body']||'',usage=state.buffers[state.id+':delivery:usage']||'';
     if(!body.trim()||!usage.trim()){status('Completa el contenido y su explicación de uso antes de enviar.');return;}
     const r=await write('delivery_submit',state.id,{assignmentId:state.assignment,scopeVersion:selected.work.assignment.scopeVersion,body,usage});
     if(r){delete state.buffers[state.id+':delivery:body'];delete state.buffers[state.id+':delivery:usage'];await read(state.id,state.assignment);status('Avance guardado para revisión de Don Ventas. El cliente todavía no lo ve.');}return;
    }
    if(b.dataset.deliveryReviewAction){
     const id=b.dataset.delivery,note=state.buffers[id+':review']||'';
     if(!note.trim()||!get('[data-review-approved="'+id+'"]').checked){status('Escribe tus observaciones y confirma que revisaste esta versión contra el alcance.');return;}
     const r=await write('delivery_review',state.id,{assignmentId:b.dataset.assignment,deliveryId:id,revision:selected.revision,decision:b.dataset.deliveryReviewAction,note,approved:true,fileIds:(selected.work.items.find(d=>d.id===id)?.files||[]).map(f=>f.id).sort()});
     if(r){delete state.buffers[id+':review'];await read(state.id,state.assignment);status(r.state==='published'?'Entrega revisada publicada en la cuenta del cliente.':'Observaciones enviadas al colaborador. La siguiente entrega será otra versión.');}return;
    }
    if(b.hasAttribute('data-scope-refresh'))return read(state.id,state.assignment);
    if(b.hasAttribute('data-scope-propose')){
     if(!get('[data-scope-capacity]').checked){status('Confirma la capacidad del equipo antes de compartir la fecha.');return;}
     const valueFor=k=>value('[data-buffer="'+state.id+':scope:'+k+'"]');
     const data={revision:selected.revision,outcome:valueFor('outcome'),exclusions:valueFor('exclusions'),requirements:valueFor('requirements'),rounds:Number(valueFor('rounds')),deliveryOn:valueFor('deliveryOn'),validUntil:valueFor('validUntil'),capacityConfirmed:true};
     if(!data.outcome.trim()||!data.exclusions.trim()||!data.requirements.trim()||!data.deliveryOn||!data.validUntil){status('Completa qué entregaremos, qué queda fuera, los requisitos y las dos fechas.');return;}
     const result=await write('scope_propose',state.id,data);if(result){clearScopeDraft();await read(state.id,state.assignment);status('Propuesta compartida. El cliente debe revisar y aceptar esta versión.');}return;
    }
    if(b.hasAttribute('data-scope-accept')){
     if(!get('[data-scope-consent]').checked){status('Revisa el alcance y la fecha y marca tu aceptación para continuar.');return;}
     const result=await write('scope_accept',state.id,{scopeVersion:selected.scopes[0].version,consent:'scope-lab-v1'});if(result){await read(state.id,state.assignment);status('Tu aceptación quedó registrada para la propuesta '+result.scopeVersion+'. '+(selected.scopes[0].version!==result.scopeVersion?'Hay una nueva propuesta que aún necesita tu revisión. ':'')+'No se realizó ningún cobro.');}return;
    }
    if(b.hasAttribute('data-refresh'))return inbox();if(b.dataset.inboxAfter)return inbox(b.dataset.inboxAfter);
    if(b.dataset.noticesAfter){const n=await api.rpc('notices',null,{after:Number(b.dataset.noticesAfter)});b.parentElement.innerHTML='<summary>Mis avisos · siguiente página</summary>'+notices(n.notices);return;}
    if(b.hasAttribute('data-prepare'))return prepare();
    if(b.dataset.open)return read(b.dataset.open,b.dataset.assignment||null);
    if(b.dataset.submit){if(!get('[data-consent]').checked){status('Confirma la versión antes de enviar.');return;}const r=await write('submit',null,{version:Number(b.dataset.submit),assets:[...host.querySelectorAll('[data-share]:checked')].map(e=>e.dataset.share),consent:'review-v1'});if(r)return read(r.id);}
    else if(b.dataset.notice){await write('mark_read',b.dataset.id,{noticeId:Number(b.dataset.notice)});return inbox();}
    else if(b.dataset.decision){await write(b.dataset.workVersion?'work_'+b.dataset.decision:b.dataset.decision,b.dataset.id,{assignmentId:b.dataset.assignment,...(b.dataset.workVersion?{scopeVersion:Number(b.dataset.workVersion),confirmed:true}:{})});return inbox();}
    else if(b.dataset.messagesAfter)return read(state.id,state.assignment,b.dataset.messagesAfter);
    else if(b.dataset.asset){const r=await api.rpc('asset',state.id,{assetId:b.dataset.asset});if(!alive())return;const bytes=Uint8Array.from(atob(r.asset.base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),link=document.createElement('a');link.href=url;link.download=r.asset.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
    else if(b.hasAttribute('data-message-send')){const key=state.id+':'+(state.assignment||'client'),body=state.buffers[key]||'';if(!body.trim()){status('Escribe el mensaje antes de enviarlo.');return;}if(selected.staff&&(!value('[data-audience]')||value('[data-audience]')==='collaborator'&&!value('[data-message-assignment]'))){status('Elige un destinatario y un encargo vigente antes de enviar. Tu texto se conserva.');return;}await write('message',state.id,{body,audience:selected.staff?value('[data-audience]'):state.assignment?'collaborator':'client',...(state.assignment||value('[data-message-assignment]')?{assignmentId:state.assignment||value('[data-message-assignment]')}:{})});delete state.buffers[key];}
    else if(b.hasAttribute('data-manage'))await write('manage',state.id,{revision:selected.revision,state:value('[data-state]'),responsible:value('[data-responsible]')});
    else if(b.hasAttribute('data-publish')){if(!get('[data-approved]').checked){status('Revisa y aprueba la devolución antes de publicarla.');return;}await write('publish',state.id,{revision:selected.revision,approved:true,body:state.buffers[state.id+':return']||''});delete state.buffers[state.id+':return'];}
    else if(b.hasAttribute('data-analysis-retry'))await write('retry_analysis',state.id);
    else if(b.hasAttribute('data-assign'))await write('assign',state.id,{userId:value('[data-collaborator]'),mode:value('[data-mode]'),keys:[...host.querySelectorAll('[data-scope]:checked')].map(e=>e.dataset.scope),...(value('[data-replace]')?{replace:value('[data-replace]')}:{})});
    else if(b.dataset.revoke)await write('revoke',state.id,{assignmentId:b.dataset.revoke});
    else if(b.dataset.consentReferral)await write('consent_referral',state.id,{assignmentId:b.dataset.consentReferral,approved:true});
    if(state.id)await read(state.id,state.assignment);
   });
  };
  work(()=>state.id?read(state.id,state.assignment):inbox());
 }
 // UI routing uses the authenticated own profile and server-filtered inbox.
 // It never assigns grants, impersonates a role or opens the client draft for staff.
 async function bootstrap(){
  if(!DVDrafts.enabled())throw Error('WORKFLOW_FORBIDDEN');
  const c=await DVSupa.client(),before=DVEnv.fingerprint(),u=await c.auth.getUser();
  if(u.error||!u.data.user)throw Error('AUTH_REVALIDATION_REQUIRED');
  const own=await c.from('app_user').select('id,name,email,role,member_role,account_id,pending').eq('id',u.data.user.id).limit(2);
  const actor=Array.isArray(own.data)&&own.data.length===1?own.data[0]:null;
  if(own.error||!actor||actor.pending||actor.id!==u.data.user.id){console.warn('[portal] LOCAL_REVIEW_PROFILE',own.error?.code||(!actor?'MISSING':actor.pending?'PENDING':'IDENTITY_MISMATCH'));throw Error('AUTH_REVALIDATION_REQUIRED');}
  if(actor.role==='cliente')return DVDrafts.bootstrap();
  if(!['analista','admin'].includes(actor.role))throw Error('WORKFLOW_FORBIDDEN');
  const inbox=await c.rpc('portal_workflow_v1',{p_action:'inbox'});
  if(inbox.error||inbox.data?.contract!=='portal-workflow-v1'||inbox.data.actor?.id!==actor.id)throw Error('WORKFLOW_FORBIDDEN');
  const current=await c.auth.getUser();
  if(current.error||current.data.user?.id!==actor.id||before!==DVEnv.fingerprint())throw Error('IDENTITY_STALE');
  actor.workspaceLabel=inbox.data.requests.some(q=>q.staff)?'Equipo Don Ventas':inbox.data.invitations.length?'Colaborador':'Mi espacio de trabajo';
  const seed=window.DV_SEED;Object.keys(seed).forEach(k=>{if(Array.isArray(seed[k])&&k!=='CAPAS')seed[k]=[];});
  seed.users=[actor];return seed;
 }
 function render(host){
  const name=DVStore.me()?.workspaceLabel||'Mi espacio de trabajo';
  host.innerHTML='<div class="workflow-page"><p class="hy-eyebrow">DON VENTAS / '+esc(name)+'</p><h1>El siguiente paso, en un mismo lugar.</h1><p class="workflow-lead">Consulta lo que necesita atención, revisa el contexto y mantén la conversación junto a cada solicitud.</p><div data-native-workflow></div></div>';
  mountPortal(host.querySelector('[data-native-workflow]')).catch(()=>{const el=host.querySelector('[data-native-workflow]');if(el)el.textContent='No pudimos confirmar tu acceso. Vuelve a iniciar sesión para continuar.';});
 }
 function invalidate(){DVSupa.invalidateIdentity();const auth=document.getElementById('auth');if(auth&&window.DVAuth){auth.style.display='';DVAuth.render();}throw Error('AUTH_REVALIDATION_REQUIRED');}
 function verifiedUser(result){
  if(result.error){if([401,403].includes(result.error.status)||['AuthSessionMissingError'].includes(result.error.name)||result.error.code==='session_not_found')invalidate();throw Error('WORKFLOW_UNCONFIRMED');}
  if(!result.data?.user)invalidate();return result.data.user.id;
 }
 async function connection(){
  if(!window.DVDrafts?.enabled())throw Error('WORKFLOW_FORBIDDEN');
  const c=await DVSupa.client(),identity=verifiedUser(await c.auth.getUser()),fingerprint=DVEnv.fingerprint();
  const rpc=async(action,id=null,data={},key=null)=>{
   if(!DVDrafts.enabled()||fingerprint!==DVEnv.fingerprint())invalidate();
   if(verifiedUser(await c.auth.getUser())!==identity)invalidate();
   const execute=()=>c.rpc('portal_workflow_v1',{p_action:action,p_id:id,p_data:data,p_key:key}).abortSignal(AbortSignal.timeout(15000));
   const r=key?await DVWriteGuard.run('workflow.command','review-request',{requiresAuth:true},execute):await execute();
   if(verifiedUser(await c.auth.getUser())!==identity||fingerprint!==DVEnv.fingerprint())invalidate();
   if(!r||r.authorized===false)invalidate();
   if(r.error){if(['42501','PGRST301'].includes(r.error.code))invalidate();const e=Error(r.error.message);e.definite=['22023','PT409'].includes(r.error.code);throw e;}
   if(r.data?.contract!=='portal-workflow-v1')throw Error('WORKFLOW_UNCONFIRMED');return r.data;
  };
  const files=async(action,request,delivery,assignment,key,data)=>{
   if(!DVDrafts.enabled()||fingerprint!==DVEnv.fingerprint()||verifiedUser(await c.auth.getUser())!==identity)invalidate();
   const execute=()=>c.rpc('portal_delivery_file_v1',{p_action:action,p_request:request,p_delivery:delivery,p_assignment:assignment,p_key:key,p_data:data}).abortSignal(AbortSignal.timeout(30000));
   const r=action==='upload'?await DVWriteGuard.run('workflow.command','review-request',{requiresAuth:true},execute):await execute();
   if(verifiedUser(await c.auth.getUser())!==identity||fingerprint!==DVEnv.fingerprint())invalidate();
   if(!r||r.authorized===false)invalidate();
   if(r.error){if(['42501','PGRST301'].includes(r.error.code))invalidate();const e=Error(r.error.message);e.definite=['22023','PT409'].includes(r.error.code);throw e;}
   if(r.data?.contract!=='portal-delivery-file-v1')throw Error('WORKFLOW_UNCONFIRMED');return r.data;
  };
  // UI buffer binding only; getUser and the RPC remain the authority. Never store a token.
  const session=await c.auth.getSession();let sid='unknown';try{sid=JSON.parse(atob(session.data.session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id||'unknown';}catch{}
  const profiles=async(action,request=null,user=null,key=null,data={})=>{
   if(!DVDrafts.enabled()||fingerprint!==DVEnv.fingerprint()||verifiedUser(await c.auth.getUser())!==identity)invalidate();
   const execute=()=>c.rpc('portal_professional_v1',{p_action:action,p_request:request,p_user:user,p_key:key,p_data:data}).abortSignal(AbortSignal.timeout(30000));
   const r=['own','list','download','preview'].includes(action)?await execute():await DVWriteGuard.run('workflow.command','review-request',{requiresAuth:true},execute);
   if(verifiedUser(await c.auth.getUser())!==identity||fingerprint!==DVEnv.fingerprint())invalidate();
   if(!r||r.authorized===false)invalidate();
   if(r.error){if(r.error.code==='PGRST301')invalidate();throw Error(r.error.message);}
   if(r.data?.contract!=='portal-professional-v1')throw Error('WORKFLOW_UNCONFIRMED');return r.data;
  };
  const recommendations=async(action,request=null,id=null,data={})=>{
   if(!DVDrafts.enabled()||fingerprint!==DVEnv.fingerprint()||verifiedUser(await c.auth.getUser())!==identity)invalidate();
   const execute=()=>c.rpc('portal_recommendation_v1',{p_action:action,p_request:request,p_id:id,p_data:data}).abortSignal(AbortSignal.timeout(30000));
   const r=['inbox','list'].includes(action)?await execute():await DVWriteGuard.run('workflow.command','review-request',{requiresAuth:true},execute);
   if(verifiedUser(await c.auth.getUser())!==identity||fingerprint!==DVEnv.fingerprint())invalidate();
   if(!r||r.authorized===false)invalidate();if(r.error)throw Error(r.error.message);
   if(r.data?.contract!=='portal-recommendation-v1')throw Error('WORKFLOW_UNCONFIRMED');return r.data;
  };
  return {rpc,files,profiles,recommendations,identity,authSession:identity+':'+sid};
 }
 async function mountPortal(host){
  const {rpc,files,identity}=await connection();
  if(host.isConnected)mount(host,{rpc,files,...(DVStore.isOwner()?{draft:()=>DVDrafts.open()}:{})},identity);
 }
 window.addEventListener('beforeunload',e=>{if([...caches.values()].some(s=>s.pending||s.filePending||Object.values(s.buffers).some(Boolean))){e.preventDefault();e.returnValue='';}});
 function select(id){const identity=DVStore.me()?.id;if(identity){const state=caches.get(identity)||{pending:null,buffers:{}};state.id=id;state.assignment=null;caches.set(identity,state);}}
 return {mount,mountPortal,bootstrap,render,reset,connection,select,label,display,overview};
})();
