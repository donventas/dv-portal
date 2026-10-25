(function(){
 'use strict';
 let host,actor='cliente',workspace='a',tab='marca',drafts={},expected=0,intention=null,message='';
 const key='hybrid-demo-v1', C=window.DVHybridCore;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const latest=a=>a[a.length-1];
 function guard(){if(!window.DVEnv?.isDemo())throw Error('DEMO_ONLY');}
 function load(){guard();try{const s=JSON.parse(DVEnv.storage.getItem(key));if(s?.schema===1&&s.workspaces?.a&&s.workspaces?.b)return s;}catch(_){}return C.initial();}
 function draft(){return drafts[actor+':'+workspace+':'+tab] ||= {};}
 function field(name,label,value='',large=false){const v=draft()[name]??value;return '<label>'+esc(label)+(large?'<textarea':'<input')+' name="'+name+'" maxlength="8000"'+(large?'>'+esc(v)+'</textarea>':' value="'+esc(v)+'">')+'</label>';}
 function button(action,label,disabled=false){return '<button class="btn solid" data-action="'+action+'"'+(disabled?' disabled':'')+'>'+esc(label)+'</button>';}
 function items(rows,render){return rows.length?rows.map(render).join(''):'<p class="hy-muted">Todavía no hay registros.</p>';}
 function questionnaire(ctx){return C.questions.map((q,i)=>'<fieldset class="hy-question"><legend><span class="hy-number">0'+(i+1)+'</span>'+esc(q.title)+'</legend><p>'+esc(q.hint)+'</p><div class="hy-options">'+q.options.map(([id,label,prompt])=>{
  const name='q_'+q.id+'_'+id,note='qnote_'+q.id+'_'+id,saved=ctx?.answers?.[q.id]?.find(r=>r.id===id),checked=draft()[name]??!!saved;
  return '<div class="hy-option" data-selected="'+checked+'"><label class="hy-choice"><input type="checkbox" name="'+name+'" data-context="'+note+'"'+(checked?' checked':'')+'><span>'+esc(label)+'</span></label><div id="'+note+'"'+(checked?'':' hidden')+'><label>'+esc(prompt)+' <span class="hy-optional">Contexto opcional</span><textarea name="'+note+'" maxlength="1500" placeholder="Tu experiencia, ejemplos o lo que aún falta definir…">'+esc(draft()[note]??saved?.context??'')+'</textarea></label></div></div>';
 }).join('')+'</div></fieldset>').join('');}
 function answerReview(ctx){return C.questions.map(q=>{const rows=ctx.answers?.[q.id]||[];return rows.length?'<section class="hy-answer"><h3>'+esc(q.title)+'</h3>'+rows.map(r=>'<h4>'+esc(q.options.find(o=>o[0]===r.id)?.[1]||r.id)+'</h4><p>'+esc(r.context||'Sin contexto adicional · por profundizar')+'</p>').join('')+'</section>':'';}).join('');}
 const bases={hypothesis:'Mi interpretación · por validar',observed:'Lo he observado · declaración del cliente',pending:'Todavía no lo sé'};
 function deeperContext(ctx){return '<section class="hy-deeper"><h3>Si quieres profundizar.</h3><p>Es opcional. Aporta solo lo que sabes; no necesitas inventar respuestas ni usar IA. Evita datos personales o conversaciones privadas.</p>'+[['cliente','Lo que sabes de tus clientes'],['marca','Lo que hace distinta a tu marca']].map(([group,label])=>'<details><summary>'+label+'</summary>'+C.insightQuestions.filter(q=>q.group===group).map(q=>{
  const row=ctx?.insights?.[q.id],basis=draft()['ib_'+q.id]??row?.basis??'hypothesis';
  return '<div class="hy-insight"><label>'+esc(q.label)+'<span class="hy-optional">'+esc(q.hint)+'</span><textarea name="it_'+q.id+'" maxlength="1500">'+esc(draft()['it_'+q.id]??row?.text??'')+'</textarea></label><div class="hy-fields"><label>¿En qué se basa?<select name="ib_'+q.id+'">'+Object.entries(bases).map(([id,label])=>'<option value="'+id+'"'+(basis===id?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label><label>Origen o referencia · opcional<input name="is_'+q.id+'" maxlength="300" value="'+esc(draft()['is_'+q.id]??row?.source??'')+'" placeholder="Ej.: observación en tienda, octubre"></label></div></div>';
 }).join('')+'</details>').join('')+'</section>';}
 function insightReview(ctx){return C.insightQuestions.filter(q=>ctx.insights?.[q.id]).map(q=>{const row=ctx.insights[q.id];return '<section class="hy-answer"><h3>'+esc(q.label)+'</h3><p>'+esc(row.text)+'</p><p class="hy-muted">'+esc(bases[row.basis])+(row.source?' · Origen: '+esc(row.source):' · Sin referencia aportada')+'</p></section>';}).join('');}
 const errors={FORBIDDEN:'Este actor no tiene acceso a este espacio.',FIELD_REQUIRED:'Completa los campos indicados; conserva aquí tu borrador.',VERSION_CONFLICT:'Hay una versión más reciente. Revisa los cambios antes de volver a confirmar.',SIMULATED_FAILURE:'Fallo simulado. No se guardó ningún cambio. Puedes reintentar.',OWNER_REQUIRED:'La aceptación corresponde al cliente.',SPECIALIST_REQUIRED:'Esta acción corresponde al especialista.',NEW_SCOPE_REQUIRED:'Se agotaron las rondas incluidas. Hace falta acordar un nuevo alcance.',CONTEXT_OR_STATE_INVALID:'Confirma el contexto antes de guardar la ficha.',REQUEST_CONTEXT_FROZEN:'El encargo conserva sus versiones originales.',PROPOSAL_VERSION_CONFLICT:'La propuesta cambió; revisa su versión actual.',DELIVERY_VERSION_CONFLICT:'La entrega cambió; revisa su versión actual.'};
 function render(target){
  guard();host=target;const s=load(),w=s.workspaces[workspace],ctx=latest(w.contexts),art=latest(w.artifacts),req=w.request,proposal=latest(w.proposals),delivery=latest(w.deliveries);expected=w.version;
  const isOwner=actor==='cliente',staff=!isOwner;
  const tabs=[['marca','1 · Tu marca'],['contexto','2 · Contexto'],['ficha','3 · Ficha de oferta'],['ayuda','4 · Ajustes y ayuda'],['bandeja','5 · Bandeja DV']];
  let body='';
  if(tab==='marca')body='<div class="hy-section-intro"><p class="hy-eyebrow">TU PUNTO DE PARTIDA</p><h2>Cuéntanos lo que hace única a tu marca.</h2><p>Elige todas las opciones que apliquen y profundiza con tus palabras. También puedes dejar una decisión pendiente.</p></div><p class="hy-note">Ejemplo ficticio precargado. Puedes editarlo. Tus respuestas y la ficha se redactan manualmente, sin IA.</p>'+field('name','Nombre comercial · obligatorio',ctx?.fields.name||'Estudio Aurora')+questionnaire(ctx)+'<section class="hy-summary"><h3>Lo esencial, en tus palabras.</h3><p>Estas respuestas serán la base de tu ficha. Revisa el ejemplo y ajústalo a lo que quieres expresar.</p><div class="hy-fields">'+field('offer','Tu oferta en una frase · obligatorio',ctx?.fields.offer||'Talleres de cerámica')+field('audience','Tu público principal · obligatorio',ctx?.fields.audience||'Personas que quieren aprender desde cero')+field('objective','Qué quieres lograr primero · obligatorio',ctx?.fields.objective||'Explicar el primer taller')+field('channels','Canales o URLs adicionales · opcional',ctx?.fields.channels)+field('tone','Cómo quieres sonar · opcional',ctx?.fields.tone||'Claro y cercano')+field('restrictions','Límites y condiciones · opcional',ctx?.fields.restrictions||'Sin prometer resultados garantizados',true)+'</div></section><p class="hy-muted">Al confirmar, solo se guardan las opciones marcadas y su contexto. El texto de una opción desmarcada sigue disponible en este borrador hasta cerrar sesión o recargar.</p>'+button('context','Confirmar y revisar mi contexto',!isOwner||!!req);
  if(tab==='contexto')body='<h2>El contexto que compartimos</h2>'+(!ctx?'<p>Confirma primero tu marca.</p>':'<p>Versión '+ctx.version+' · '+esc(ctx.source)+'</p>'+answerReview(ctx)+'<dl>'+Object.entries(ctx.fields).map(([k,v])=>'<dt>'+esc(({name:'Marca',offer:'Oferta',audience:'Público',objective:'Objetivo',channels:'Canales adicionales',tone:'Tono',restrictions:'Límites y condiciones'})[k]||k)+'</dt><dd>'+esc(v||'No aportado')+'</dd>').join('')+'</dl><p>Esta versión sirve de referencia. Una edición posterior no reescribe entregables anteriores.</p><details><summary>Versión y sincronización</summary><p>'+esc(ctx.at)+' · sincronización con el sistema de marca pendiente de revisión manual.</p></details>')+'<h3>Historial</h3>'+items(w.contexts,v=>'<p>Contexto v'+v.version+' · '+esc(v.at)+'</p>');
  if(tab==='ficha'){
   body='<h2>Una oferta que se entiende</h2><p>Edición manual. La DEMO no genera textos con IA ni inventa pruebas.</p><div class="hy-fields">'+field('headline','Titular',art?.fields.headline||ctx?.fields.offer)+field('audience','Destinatario',art?.fields.audience||ctx?.fields.audience)+field('problem','Problema que atiende',art?.fields.problem||'Por confirmar con el cliente')+field('value','Valor de la oferta',art?.fields.value||ctx?.fields.offer)+field('evidence','Evidencia disponible',art?.fields.evidence||'Sin evidencia aportada')+field('conditions','Condiciones',art?.fields.conditions||'Por acordar')+field('cta','Siguiente paso / CTA',art?.fields.cta||'Solicitar información')+'</div>'+button('artifact','Guardar nueva versión',!isOwner||!ctx||!!req);
   body+='<h3>Comparar versiones</h3><div class="hy-compare">'+items(w.artifacts.slice(-2),v=>'<article><h4>Ficha v'+v.version+' · contexto v'+v.contextVersion+'</h4>'+Object.entries(v.fields).map(([k,val])=>'<p><b>'+esc(k)+'</b><br>'+esc(val)+'</p>').join('')+'</article>')+'</div>';
   if(w.artifacts.length>1)body+=button('revert','Restaurar versión anterior como nueva',!isOwner||!!req);
   body+=button('export','Exportar expediente DEMO',!art);
  }
  if(tab==='ayuda'){
   body='<h2>Ajusta la pieza o pide ayuda</h2><p>La solicitud conserva la ficha y el contexto exactos. Los ajustes no se aplican a toda la marca automáticamente.</p>'+field('feedback','¿Qué cambiarías?','',true)+'<label>Alcance del feedback<select name="scope"><option value="pieza">Esta pieza</option><option value="campaña">Campaña · requiere revisión</option><option value="marca">Marca · requiere revisión</option></select></label><label class="hy-check"><input type="checkbox" name="consent"> Confirmo registrar este feedback con ese alcance</label>'+button('feedback','Registrar feedback',!isOwner||!art||!!req)+'<hr><label>Tipo de ayuda<select name="type"><option value="oferta">Ficha de oferta</option><option value="blog">Artículo de blog</option><option value="seo">Contenido SEO</option></select></label>'+field('brief','¿Qué necesitas del especialista?','',true)+'<details><summary>Contexto editorial · obligatorio para blog y SEO</summary><div class="hy-fields">'+field('intent','Intención o consulta objetivo')+field('sources','Fuentes')+field('author','Autor')+field('reviewer','Revisor')+field('rights','Derechos de los recursos visuales')+field('url','URL prevista')+'</div></details>'+button('request','Crear solicitud DEMO',!isOwner||!art||!!req);
   body+='<h3>Feedback registrado</h3>'+items(w.feedback,f=>'<p><b>'+esc(f.scope)+'</b> · '+esc(f.text)+'</p>');
  }
  if(tab==='bandeja'){
   body='<h2>Un encargo, la misma información</h2>';
   if(!req)body+='<p>Crea una solicitud desde Ajustes y ayuda.</p>';
   else{
    body+='<p class="hy-status">'+esc(req.status)+'</p><p>Especialista asignado · contexto v'+req.contextVersion+' · ficha v'+req.artifactVersion+'</p><p>'+esc(req.brief)+'</p><p>Tipo: '+esc(req.type)+' · CTA: '+esc(w.artifacts.find(a=>a.version===req.artifactVersion)?.fields.cta)+'</p>'+(req.type!=='oferta'?'<dl>'+Object.entries(req.editorial).map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>':'');
    body+='<h3>Propuestas</h3>'+items(w.proposals,p=>'<article><b>Propuesta v'+p.version+'</b><p>'+esc(p.text)+'</p><small>'+p.rounds+' rondas de ajustes incluidas · '+esc(p.at)+'</small></article>');
    if(['solicitado','propuesta','contrapropuesta'].includes(req.status))body+=field('proposal','Alcance propuesto','',true)+field('rounds','Rondas incluidas','2')+button('proposal','Enviar nueva propuesta DEMO',!staff);
    if(req.status==='propuesta')body+=field('counter','Contrapropuesta del cliente','',true)+button('counter','Pedir cambio de alcance',!isOwner)+button('acceptScope','Aceptar propuesta v'+proposal.version,!isOwner);
    if(req.status==='alcance aceptado')body+=button('start','Iniciar trabajo',!staff);
    if(req.status==='en trabajo')body+=field('delivery','Entrega de revisión · texto sintético','',true)+button('deliver','Guardar entrega para revisión',!staff);
    body+='<h3>Entregas</h3>'+items(w.deliveries,d=>'<article><b>Entrega v'+d.version+' · propuesta v'+d.proposalVersion+'</b><p>'+esc(d.text)+'</p><small>'+esc(d.rights)+'</small></article>');
    if(req.status==='en revisión')body+=field('revision','Ajustes a esta entrega','',true)+button('revise','Solicitar revisión',!isOwner)+button('acceptDelivery','Aprobar entrega v'+delivery.version,!isOwner);
    if(!['entrega aprobada','cancelado'].includes(req.status))body+=button('cancel','Cancelar encargo DEMO',!isOwner);
    body+='<p>Publicación: no autorizada. Aceptar una entrega no publica, cobra ni envía correos.</p>';
   }
   body+='<h3>Trazabilidad</h3>'+items(w.events,e=>'<p><code>v'+e.version+'</code> · '+esc(e.actor)+' · '+esc(e.kind)+' · '+esc(e.at)+'</p>');
  }
  if(tab==='marca')body=body.replace('<section class="hy-summary">',deeperContext(ctx)+'<section class="hy-summary">');
  if(tab==='contexto'&&ctx)body=body.replace('<h3>Historial</h3>',insightReview(ctx)+'<h3>Historial</h3>');
  host.innerHTML='<section class="hy-demo"><header><div class="hy-edition"><span>Cuaderno de marca / Don Ventas</span><span>Escuchar → Ordenar → Trabajar</span></div><div class="hy-opening"><div><p class="hy-eyebrow">TU MARCA, EN MOVIMIENTO</p><h1>Un buen trabajo empieza por <em>entenderte.</em></h1><p class="hy-lead">Dale contexto a tu marca. Construye una oferta clara y trabaja con Don Ventas cuando lo necesites.</p></div><aside class="hy-editorial-note dv-ink-field" aria-label="Una pregunta para empezar"><span class="hy-eyebrow">ANTES DE LA PIEZA</span><p>¿Qué debería entender alguien <em>que no te conoce?</em></p><small>Tu experiencia es el punto de partida.</small></aside></div><details class="hy-simulation"><summary>Controles de la DEMO · '+esc(actor)+'</summary><div class="hy-controls"><label>Actor simulado<select data-selector="actor">'+['cliente','especialista','admin'].map(a=>'<option'+(actor===a?' selected':'')+'>'+a+'</option>').join('')+'</select></label><label>Espacio<select data-selector="workspace">'+Object.values(s.workspaces).map(x=>'<option value="'+x.id+'"'+(workspace===x.id?' selected':'')+(!C.allowed(actor,x.id)?' disabled':'')+'>'+esc(x.label)+'</option>').join('')+'</select></label></div><p>Dos espacios ficticios. Sin operaciones reales.</p></details></header><nav aria-label="Etapas del recorrido">'+tabs.map(([id,label])=>'<button class="btn'+(tab===id?' solid':'')+'" data-tab="'+id+'" aria-current="'+(tab===id?'step':'false')+'">'+label+'</button>').join('')+'</nav><p id="hy-message" role="status" tabindex="-1">'+esc(message)+'</p><div class="hy-body">'+body+'</div><footer><label class="hy-check"><input type="checkbox" id="hy-fail"> Simular fallo del próximo guardado</label><p>Los borradores se conservan ante errores y cambios de etapa durante esta sesión. Cerrar sesión borra los datos locales. Recargar descarta los borradores sin confirmar.</p></footer></section>';
  for(const [k,v] of Object.entries(draft())){const el=host.querySelector('[name="'+k+'"]');if(el){if(el.type==='checkbox')el.checked=!!v;else el.value=v;}}
  host.oninput=e=>{if(e.target.name)draft()[e.target.name]=e.target.type==='checkbox'?e.target.checked:e.target.value;if(e.target.dataset.context){host.querySelector('#'+e.target.dataset.context).hidden=!e.target.checked;e.target.closest('.hy-option').dataset.selected=String(e.target.checked);}};
  host.onchange=e=>{const kind=e.target.dataset.selector;if(kind){actor=kind==='actor'?e.target.value:actor;workspace=kind==='workspace'?e.target.value:workspace;if(!C.allowed(actor,workspace))workspace='a';intention=null;message='';render(host);}};
  host.onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.tab){tab=b.dataset.tab;message='';render(host);return;}if(b.dataset.action)act(b.dataset.action);};
 }
 function act(kind){
  guard();const w=load().workspaces[workspace],data={};host.querySelectorAll('[name]').forEach(el=>data[el.name]=el.type==='checkbox'?el.checked:el.value);
  let payload=data;
  if(kind==='context'){
   payload={};for(const f of ['name','offer','audience','objective','channels','tone','restrictions'])payload[f]=data[f];
   payload.answers={};for(const q of C.questions)payload.answers[q.id]=q.options.filter(([id])=>data['q_'+q.id+'_'+id]).map(([id])=>({id,context:data['qnote_'+q.id+'_'+id]||''}));
   payload.insights={};for(const q of C.insightQuestions)if(data['it_'+q.id]?.trim())payload.insights[q.id]={text:data['it_'+q.id],basis:data['ib_'+q.id],source:data['is_'+q.id]||''};
  }
  if(kind==='feedback'){if(!data.consent){message='Confirma el alcance antes de registrar el feedback.';render(host);return;}payload={text:data.feedback,scope:data.scope,consent:true};}
  if(kind==='proposal')payload={text:data.proposal,rounds:Number(data.rounds)};
  if(kind==='counter')payload={text:data.counter};
  if(kind==='deliver')payload={text:data.delivery};
  if(kind==='revise')payload={text:data.revision,version:latest(w.deliveries)?.version};
  if(kind==='acceptDelivery')payload={version:latest(w.deliveries)?.version};
  if(kind==='acceptScope')payload={version:latest(w.proposals)?.version};
  if(kind==='revert')payload={version:w.artifacts[w.artifacts.length-2]?.version};
  if(kind==='export'){
   const safe={...w};delete safe.receipts;const url=URL.createObjectURL(new Blob([JSON.stringify(safe,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='donventas-demo-'+workspace+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  const signature=JSON.stringify({kind,payload,expected,actor,workspace});if(intention?.signature!==signature)intention={signature,key:crypto.randomUUID()};
  try{
   if(host.querySelector('#hy-fail')?.checked)throw Error('SIMULATED_FAILURE');
   const next=C.execute(load(),{actor,workspace,key:intention.key,expected,kind,payload});
   DVEnv.storage.setItem(key,JSON.stringify(next));intention=null;
   const consumed={feedback:['feedback','scope','consent'],request:['type','brief','intent','sources','author','reviewer','rights','url'],proposal:['proposal','rounds'],counter:['counter'],deliver:['delivery'],revise:['revision']}[kind]||Object.keys(payload);
   consumed.forEach(k=>delete draft()[k]);message='Guardado en DEMO local.';
   if(kind==='context')tab='contexto';if(kind==='request')tab='bandeja';render(host);host.querySelector('#hy-message').focus();
  }catch(e){message=errors[e.message]||'No se guardó el cambio. Revisa el estado y los campos.';render(host);host.querySelector('#hy-message').focus();}
 }
 window.DVHybridDemo={render,resetTransient(){drafts={};intention=null;actor='cliente';workspace='a';tab='marca';host=null;message='';}};
})();
