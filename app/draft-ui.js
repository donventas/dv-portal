window.DVDraftUI=(function(){
 'use strict';
 const C=window.DVDraftContract,Q=window.DVHybridCore,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const slots={brand_logo:'Logo principal',brand_logo_light:'Logo para fondos claros',brand_logo_dark:'Logo para fondos oscuros',brand_manual:'Manual de marca'};
 const steps=['Tu marca','Contexto','Ficha de oferta','Ajustes y ayuda','Bandeja DV'];
 const stepHints=['Cuéntanos de tu negocio y agrega tu identidad visual, a tu ritmo.','Consulta tus respuestas y añade lo que ayude a entender tu situación.','Mira cómo se resume tu oferta con lo que ya compartiste.','Encuentra ayuda y vuelve a los bloques que quieras ajustar.','Envía una solicitud cuando estés listo y sigue la conversación.'];
 // Exploration is local UI state, never a completion flag or a persisted draft stage.
 let step=1;
 let host=null,doc=C.empty(),saved={},assets=[],version=0,loaded=false,busy=false,uncertain=null,uploadIntent=null,generation=0,dirty=false,view='marca',section='negocio',historyNext=0,historySnapshot=null,exitOffer=false,navigation=0;
 function field(name,label,max,large=false){const v=doc.fields[name]??'';return '<label>'+esc(label)+(large?'<textarea':'<input')+' name="'+name+'" maxlength="'+max+'"'+(large?'>'+esc(v)+'</textarea>':' value="'+esc(v)+'">')+'</label>';}
 function question(id){const q=Q.questions.find(q=>q.id===id);return '<fieldset class="hy-question"><legend>'+esc(q.title)+'</legend><p>'+esc(q.hint)+'</p><div class="hy-options">'+q.options.map(([id,label,prompt])=>{
  const name='q_'+q.id+'_'+id,note='qnote_'+q.id+'_'+id,on=doc.fields[name]===true;
  return '<div class="hy-option" data-selected="'+on+'"><label class="hy-choice"><input type="checkbox" name="'+name+'" data-context="'+note+'" aria-controls="'+note+'" aria-expanded="'+on+'"'+(on?' checked':'')+'><span>'+esc(label)+'</span></label><div id="'+note+'"'+(on?'':' hidden')+'>'+field(note,prompt+' · opcional',1500,true)+'</div></div>';
 }).join('')+'</div></fieldset>';}
 function insight(q){return '<details><summary>'+esc(q.label)+'</summary>'+field('it_'+q.id,q.label,1500,true)+'<p class="hy-optional">'+esc(q.hint)+'</p><div class="hy-fields"><label>¿En qué se basa?<select name="ib_'+q.id+'">'+[['hypothesis','Mi interpretación · por validar'],['observed','Lo he observado'],['pending','Todavía no lo sé']].map(([k,l])=>'<option value="'+k+'"'+((doc.fields['ib_'+q.id]||'hypothesis')===k?' selected':'')+'>'+l+'</option>').join('')+'</select></label>'+field('is_'+q.id,'Origen o referencia · opcional',300)+'</div></details>';}
 function colorField(k,l){const raw=(doc.fields[k]||'').trim(),value=/^#[0-9a-f]{6}$/i.test(raw)?raw:'#000000';return '<div>'+field(k,l+' · HEX o descripción',100)+'<label>Elegir '+l.toLowerCase()+'<input type="color" data-color-for="'+k+'" value="'+value+'"></label></div>'; }
 function kit(){return '<p>Usa lo que ya tienes. Puedes dejar todo vacío y volver después.</p><label>¿Cómo está tu identidad visual?<select name="brand_status">'+[['','Prefiero responder después'],['ready','Tengo identidad visual'],['organize','Tengo materiales, pero necesito ordenarlos'],['none','Todavía no tengo identidad visual']].map(([k,l])=>'<option value="'+k+'"'+((doc.fields.brand_status||'')===k?' selected':'')+'>'+l+'</option>').join('')+'</select></label><details><summary>Logos y manual · opcional</summary><p>Logos PNG o JPG, hasta 1 MB cada uno. Manual PDF, hasta 4 MB. Los archivos son privados; subirlos no envía una solicitud.</p>'+Object.entries(slots).map(([k,l])=>{
  const a=assets.find(a=>a.id===doc.fields[k]);return '<section class="draft-asset"><h3>'+l+'</h3>'+(a?'<p>'+esc(a.name)+' · '+Math.ceil(a.size/1024)+' KB</p><button class="btn" data-asset-read="'+k+'">'+(k==='brand_manual'?'Descargar PDF':'Ver logo')+'</button><button class="btn" data-asset-remove="'+k+'">Quitar del borrador</button>':'<p>Sin archivo · opcional</p>')+'<label>'+(a?'Reemplazar':'Elegir archivo')+'<input type="file" data-asset-slot="'+k+'" accept="'+(k==='brand_manual'?'.pdf,application/pdf':'.png,.jpg,.jpeg,image/png,image/jpeg')+'"></label><div data-preview="'+k+'"></div></section>';
 }).join('')+'<p>Quitar o reemplazar no cambia los archivos de versiones ya guardadas.</p></details><details><summary>Colores y tipografías · opcional</summary><p>Indica un HEX o describe el color si no conoces el código. El selector solo agrega un color cuando lo cambias.</p><div class="hy-fields">'+[['brand_primary','Color principal'],['brand_secondary','Color secundario'],['brand_background','Color de fondo']].map(([k,l])=>colorField(k,l)).join('')+field('brand_fonts','Tipografías o referencias',500)+'</div></details><details><summary>Añadir contexto a la identidad</summary>'+field('brand_context','Qué quieres conservar, cambiar o evitar',2000,true)+'</details>';}
 function form(){
  if(section==='negocio')return field('name','Nombre comercial · opcional',500)+question('offerTypes')+field('offer','Tu oferta en una frase · opcional',500);
  if(section==='objetivo')return question('needs')+field('objective','Qué quieres lograr primero · opcional',500);
  if(section==='clientes')return question('audiences')+field('audience','Tu público principal · opcional',500);
  if(section==='identidad')return kit();
  return '<p>Todo este contexto es opcional. No necesitas usar IA ni inventar respuestas. Evita datos personales o conversaciones privadas.</p><details><summary>Canales y puntos de contacto</summary>'+question('channels')+field('channels','Canales o URLs adicionales',2000)+'</details><details><summary>Tono y límites</summary>'+field('tone','Cómo quieres sonar',2000)+field('restrictions','Límites y condiciones',2000,true)+'</details>'+Q.insightQuestions.map(insight).join('');
 }
 function journey(){return '<details class="draft-journey"'+(window.matchMedia('(min-width:900px)').matches?' open':'')+'><summary><span data-journey-label></span> <span class="draft-map-label">Ver mapa</span></summary><nav aria-label="Los cinco pasos del recorrido"><ol>'+steps.map((title,i)=>'<li><button type="button" data-journey-step="'+(i+1)+'"><span class="draft-step-number">0'+(i+1)+'</span><strong>'+title+'</strong><span class="draft-step-hint">'+stepHints[i]+'</span><small>'+(i===0?'Borrador · opcional':'Explorar')+'</small></button></li>').join('')+'</ol></nav><p>Puedes explorar los cinco pasos sin completar el primero. Cambiar de paso conserva tus respuestas en esta sesión; guárdalas para recuperarlas al volver.</p></details>';}
 function explore(){
  const head='<p class="hy-eyebrow">Paso '+step+' de 5 · Exploración libre</p><h2 id="draft-title" tabindex="-1">'+steps[step-1]+'</h2>';
  let content='';
  if(step===2)content='<p>Consulta lo que ya nos contaste, aunque esté incompleto. Este borrador incluye también las notas de opciones desmarcadas; no son respuestas confirmadas.</p>'+responses()+'<p class="hy-note">La revisión y confirmación del contexto están pendientes de habilitar. Esta vista no confirma ni envía información.</p><button class="btn" data-section="profundizar">Añadir contexto · opcional</button>';
  if(step===3){const keys=['name','offer','audience','objective'];content='<p>Una primera vista de tu oferta con tus propias respuestas. No necesitas completar los campos para seguir explorando.</p><dl>'+keys.map(k=>'<dt>'+esc(label(k))+'</dt><dd>'+esc(doc.fields[k]||'Por definir · opcional')+'</dd>').join('')+'</dl><p class="hy-note">La ficha final, su confirmación y sus versiones siguen pendientes. Esta vista no genera ni aprueba una oferta.</p><button class="btn" data-section="negocio">Editar mi oferta · opcional</button>';}
  if(step===4)content='<p>Puedes ajustar tus respuestas ahora o regresar después. Tus bloques siguen disponibles en Mi panel.</p><details><summary>¿Tengo que responder todo?</summary><p>No. Puedes dejar preguntas en blanco, explorar los pasos y completar tu información a tu ritmo.</p></details><details><summary>¿Cómo retomo lo que ya respondí?</summary><p>Usa «Guardar respuestas». Al volver a iniciar sesión, recuperarás la versión guardada. Cambiar de paso conserva también los cambios que aún no guardas durante esta sesión.</p></details><details><summary>¿Dónde agrego mi logo y colores?</summary><p>En Tu identidad visual, dentro de Tu marca. Es opcional y puedes completarlo después.</p><button class="btn" data-section="identidad">Abrir identidad visual</button></details><p class="hy-note">Las solicitudes de ajustes, las rondas de revisión y la ayuda de un especialista están pendientes de habilitar.</p><button class="btn" data-stage="panel">Revisar mis bloques</button>';
  if(step===5)content='<p>Guardar conserva tu borrador privado. Para pedir una revisión, confirma la versión guardada y los archivos que quieres compartir.</p><div data-workflow-mount></div><button class="btn" data-stage="contexto">Revisar mis respuestas</button>';
  return head+content+'<div class="draft-actions"><button class="btn" data-journey-step="'+(step-1)+'">Paso anterior</button>'+(step<5?'<button class="btn solid" data-journey-step="'+(step+1)+'">Siguiente paso</button>':'<button class="btn" data-stage="panel">Volver a mi panel</button>')+'</div>';
 }
 function panel(){return '<p class="hy-eyebrow">Paso 1 · Tu marca</p><h2 id="draft-title" tabindex="-1">Tu marca, a tu ritmo.</h2><p>Puedes empezar por cualquier bloque y volver cuando quieras. No necesitas completarlos para usar el portal.</p><div class="draft-panel">'+C.sections.map(s=>{const state=loaded?C.sectionState(s.id,doc.fields,saved):'Por recuperar',action=state==='Sin empezar'?'Empezar':'Retomar';return '<button type="button" class="draft-card" data-section="'+s.id+'" aria-labelledby="card-title-'+s.id+' card-action-'+s.id+'" aria-describedby="card-state-'+s.id+' card-hint-'+s.id+'"><span class="hy-eyebrow" id="card-state-'+s.id+'">'+esc(state)+'</span><span class="draft-card-title" id="card-title-'+s.id+'">'+s.title+'</span><span class="draft-card-hint" id="card-hint-'+s.id+'">'+s.hint+'</span><span class="draft-card-cta" id="card-action-'+s.id+'">'+action+'<span aria-hidden="true">↗</span></span></button>';}).join('')+'</div><p class="hy-note">Tu borrador es privado. Cuando quieras pedir una revisión, abre Bandeja DV y confirma qué versión y archivos quieres compartir.</p>';}
 function label(k){
  const basic={name:'Marca',offer:'Oferta',audience:'Público',objective:'Objetivo',channels:'Canales',tone:'Tono',restrictions:'Límites',brand_status:'Estado de identidad',brand_primary:'Color principal',brand_secondary:'Color secundario',brand_background:'Color de fondo',brand_fonts:'Tipografías',brand_context:'Contexto visual',...slots};if(basic[k])return basic[k];
  for(const q of Q.questions)for(const [id,l] of q.options)if(k==='q_'+q.id+'_'+id||k==='qnote_'+q.id+'_'+id)return q.title+' · '+l;
  for(const q of Q.insightQuestions)if(k.endsWith('_'+q.id))return q.label+(k.startsWith('is_')?' · Referencia':k.startsWith('ib_')?' · Base':'');return k;
 }
 function responses(){const entries=Object.entries(doc.fields).filter(([k,v])=>!k.startsWith('welcome_')&&v!==''&&v!==false);return entries.length?'<dl>'+entries.map(([k,v])=>'<dt>'+esc(label(k))+'</dt><dd>'+esc(slots[k]?(assets.find(a=>a.id===v)?.name||'Archivo privado'):typeof v==='boolean'?'Seleccionado':v)+'</dd>').join('')+'</dl>':'<p>Aún no hay respuestas. Puedes seguir explorando y completarlas después.</p>';}
 function summary(){return '<h2 id="draft-title" tabindex="-1">Tus respuestas</h2><p>Esto es tu borrador, incluido el contexto de opciones desmarcadas. Guardar no envía una solicitud ni confirma tus respuestas.</p>'+responses();}
 function status(text){const node=host?.querySelector('#draft-status');if(node)node.textContent=text;}
 function lock(){
  if(!host?.querySelector('.draft-welcome'))return;const pending=!!uncertain||!!uploadIntent;
  host.querySelectorAll('input,textarea,select,[data-asset-remove],[data-asset-read]').forEach(e=>e.disabled=!loaded||busy||pending);
  host.querySelector('#draft-save').disabled=!loaded||busy||!!uploadIntent;
  host.querySelector('#draft-load').disabled=busy||pending;
  host.querySelector('#draft-history').disabled=!loaded||busy||pending||historyNext===null;
  host.querySelectorAll('[data-save-to]').forEach(e=>e.disabled=!loaded||busy||pending);
  host.querySelector('#draft-upload-retry').hidden=!uploadIntent;host.querySelector('#draft-upload-retry').disabled=busy;
  host.querySelector('#draft-save').textContent=uncertain?'Reintentar guardado':'Guardar respuestas';
 }
 function renderBody(focus=false){
  if(!host?.querySelector('.draft-welcome'))return;host.querySelector('.draft-welcome').dataset.view=step>1?'journey':view;host.querySelector('.draft-welcome').dataset.step=step;host.querySelector('.draft-welcome').dataset.block=section;const s=C.sections.find(s=>s.id===section),n=C.sections.indexOf(s);
  host.querySelector('[data-journey-label]').textContent='Tu recorrido · Paso '+step+' de 5: '+steps[step-1];
  host.querySelectorAll('.draft-journey [data-journey-step]').forEach(b=>{if(Number(b.dataset.journeyStep)===step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  host.querySelector('#draft-body').innerHTML=step>1?explore():view==='panel'?panel():view==='contexto'?summary():
   '<p class="hy-eyebrow">Paso 1 · Tu marca / '+(n<4?'Bloque '+(n+1)+' de 4 · ':'')+'Opcional</p><h2 id="draft-title" tabindex="-1">'+s.title+'</h2>'+form()+
   '<div class="draft-actions">'+(n>0&&n<4?'<button class="btn" data-section="'+C.sections[n-1].id+'">Atrás</button>':'')+(n<3?'<button class="btn solid" data-save-to="'+C.sections[n+1].id+'">Guardar y continuar</button><button class="btn" data-section="'+C.sections[n+1].id+'">Continuar sin guardar</button>':'')+'<button class="btn" data-save-to="panel">Guardar y salir</button></div>';
  host.querySelector('#draft-exit-offer').hidden=step>1||!exitOffer||view!=='panel';
  host.querySelector('#draft-skip').hidden=step>1||view==='panel';
  host.querySelectorAll('header .draft-actions [data-stage]').forEach(b=>b.setAttribute('aria-current',step===1&&b.dataset.stage===view?'page':'false'));
  lock();window.DVDonPresence?.mount(host,step>1?'journey':view,loaded);window.DVDonScenes?.mount(host);if(step===5)window.DVWorkflowUI?.mountPortal(host.querySelector('[data-workflow-mount]')).catch(()=>{});if(focus){host.querySelector('#draft-title')?.focus({preventScroll:true});document.getElementById('main')?.scrollTo(0,0);}
 }
 function exploreStep(target){
  if(!Number.isInteger(target)||target<1||target>5)return;navigation++;step=target;
  if(window.matchMedia('(max-width:899px)').matches)host.querySelector('.draft-journey').open=false;
  renderBody(true);
  const main=document.getElementById('main'),body=host.querySelector('#draft-body');
  if(main&&body)main.scrollTo(0,main.scrollTop+body.getBoundingClientRect().top-main.getBoundingClientRect().top-12);
 }
 function navigate(target){
  navigation++;step=1;
  if(['panel','contexto'].includes(target))view=target;else {section=target;view='marca';}
  renderBody(true);
 }
 function resetTransient(){window.DVDonPresence?.destroy();generation++;doc=C.empty();saved={};assets=[];version=0;loaded=false;busy=false;uncertain=null;uploadIntent=null;dirty=false;view='marca';step=1;section='negocio';exitOffer=false;historyNext=0;historySnapshot=null;navigation++;if(host){host.innerHTML='';host.oninput=null;host.onchange=null;host.onclick=null;}host=null;}
 async function load(){
  if(busy||uncertain||uploadIntent)return;busy=true;lock();const gen=generation,nav=navigation;status('Recuperando borrador…');
  try{const r=await DVDrafts.open();if(gen!==generation||!host)return;doc=r.document?C.validate(r.document):C.empty();saved=JSON.parse(JSON.stringify(doc.fields));assets=r.assets||[];version=r.version;loaded=true;dirty=false;exitOffer=false;historyNext=0;historySnapshot=null;const historyList=host.querySelector('#draft-history-list');if(historyList)historyList.innerHTML='';if(nav===navigation){section=doc.fields.welcome_section||'negocio';view=doc.stage==='identidad'?'marca':doc.stage;if(doc.stage==='identidad')section='identidad';}renderBody();status(version?'Borrador recuperado · versión '+version:'Todavía no hay un borrador guardado. Puedes empezar o saltar la bienvenida.');}
  catch(e){if(gen===generation)status('No se pudo recuperar el borrador. Tus cambios locales se conservan si la sesión sigue activa. Reintenta cargar.');}
  finally{if(gen===generation){busy=false;lock();}}
 }
 async function save(destination=null){
  if(busy||!loaded||uploadIntent)return;const gen=generation;
  if(!uncertain){const value=C.validate(doc);value.stage=destination==='panel'?'panel':view;value.fields.welcome_section=destination&&destination!=='panel'?destination:section;uncertain={key:crypto.randomUUID(),version,document:value,destination,navigation};}
  busy=true;lock();status('Guardando borrador…');
  try{const r=await DVDrafts.save(uncertain.key,uncertain.version,uncertain.document);if(gen!==generation||!host)return;const target=uncertain.navigation===navigation?uncertain.destination:null;doc=uncertain.document;saved=JSON.parse(JSON.stringify(doc.fields));version=r.version;uncertain=null;dirty=false;exitOffer=false;if(target)navigate(target);else renderBody();status('Borrador guardado · versión '+version+'. Puedes retomarlo en otra sesión.');}
  catch(e){
   if(gen!==generation||!host)return;
   if(['DRAFT_CONFLICT','DRAFT_KEY_CONFLICT'].includes(e.message)){uncertain=null;status('Hay una versión más reciente. No sobrescribimos tus cambios. Conserva el texto que necesites y usa «Descartar cambios locales y cargar guardado» para revisar la versión del servidor.');}
   else if(e.message==='DRAFT_INVALID'){uncertain=null;status('Revisa la longitud y el contenido de los campos. No se guardó el cambio.');}
   else status('No pudimos confirmar el guardado. Conservamos el texto y el mismo intento: pulsa «Reintentar guardado» para comprobarlo sin duplicar versiones.');
  }finally{if(gen===generation){busy=false;lock();}}
 }
 async function upload(file,slot){
  if(busy||uncertain||!loaded)return;const gen=generation;
  if(!uploadIntent){
   if(!file||!slots[slot])return;const manual=slot==='brand_manual';
   if(file.size===0||file.size>(manual?4194304:1048576)||file.name.length>120||!(manual?['application/pdf']:['image/png','image/jpeg']).includes(file.type)){status('Revisa el archivo: logos PNG/JPG hasta 1 MB; manual PDF hasta 4 MB y nombre de hasta 120 caracteres.');return;}
   busy=true;lock();status('Preparando archivo privado…');
   try{const data=new Uint8Array(await file.arrayBuffer());if(gen!==generation||!host)return;let raw='';for(let i=0;i<data.length;i+=8192)raw+=String.fromCharCode(...data.subarray(i,i+8192));uploadIntent={slot,args:{p_key:crypto.randomUUID(),p_kind:manual?'manual':'logo',p_name:file.name,p_mime:file.type,p_base64:btoa(raw)}};}
   catch{if(gen===generation){busy=false;lock();status('No se pudo leer el archivo. Tus respuestas se conservan.');}return;}
  }
  busy=true;lock();status('Subiendo archivo privado…');
  try{const a=await DVDrafts.upload(uploadIntent.args);if(gen!==generation||!host)return;assets=assets.filter(x=>x.id!==a.id).concat(a);doc.fields[uploadIntent.slot]=a.id;uploadIntent=null;dirty=true;renderBody();status('Archivo subido. Guarda tus respuestas para asociarlo al borrador.');}
  catch(e){if(gen!==generation||!host)return;if(['ASSET_INVALID','ASSET_LIMIT','ASSET_KEY_CONFLICT'].includes(e.message)){uploadIntent=null;status(e.message==='ASSET_LIMIT'?'Se alcanzó el límite del laboratorio: 32 archivos o 16 MB por cuenta. Tus respuestas se conservan.':'No se admitió el archivo. Revisa el formato y el tamaño.');}else status('No pudimos confirmar la subida. Reintenta el mismo archivo sin duplicarlo.');}
  finally{if(gen===generation){busy=false;lock();}}
 }
 async function readAsset(slot){
  if(busy||uncertain||uploadIntent)return;const gen=generation,id=doc.fields[slot];busy=true;lock();status('Recuperando archivo privado…');
  try{const r=await DVDrafts.asset(id);if(gen!==generation||!host)return;const a=r.asset;if(a.id!==id)throw Error('ASSET_INVALID');
   if(slot==='brand_manual'&&a.mime==='application/pdf'){const bytes=Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),link=document.createElement('a');link.href=url;link.download='manual-'+a.id+'.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
   else if(['image/png','image/jpeg'].includes(a.mime)){const container=host.querySelector('[data-preview="'+slot+'"]');if(container){const img=document.createElement('img');img.alt=slots[slot];img.src='data:'+a.mime+';base64,'+a.base64;container.replaceChildren(img);}}
   status(slot==='brand_manual'?'Descarga del manual preparada.':'Logo recuperado.');
  }catch{if(gen===generation)status('No se pudo recuperar el archivo. Reintenta con la sesión activa.');}
  finally{if(gen===generation){busy=false;lock();}}
 }
 async function history(){
  if(busy||uncertain||uploadIntent||historyNext===null)return;const gen=generation;busy=true;lock();
  try{const r=await DVDrafts.history(historyNext,historySnapshot);if(gen!==generation||!host)return;historySnapshot=r.snapshot;historyNext=r.next;host.querySelector('#draft-history-list')?.insertAdjacentHTML('beforeend',r.rows.map(v=>'<p>Versión '+v.version+' · '+esc(v.created_at)+'</p>').join('')||'<p>Sin versiones guardadas.</p>');}
  catch{if(gen===generation)status('No se pudo cargar el historial. Puedes reintentar.');}
  finally{if(gen===generation){busy=false;lock();}}
 }
 function render(target){
  if(!DVDrafts.enabled())throw Error('DRAFT_UNAVAILABLE');
  if(host===target&&target.querySelector('.draft-welcome'))return;
  host=target;
  host.innerHTML='<section class="hy-demo draft-welcome"><header><div class="hy-edition"><span>Cuaderno de marca / Don Ventas</span><span>Entorno aislado</span></div><p class="hy-eyebrow">TU MARCA, EN MOVIMIENTO</p><h1>Empecemos con lo que <em>ya tienes.</em></h1><p>Cuéntanos lo que tengas a mano. Puedes saltar esta bienvenida y volver después.</p><div class="draft-toolbar"><div class="draft-actions"><button class="btn" data-stage="panel">Mi panel</button><button class="btn" data-stage="contexto">Ver respuestas</button><button class="btn" id="draft-skip">Omitir por ahora</button></div><div class="don-welcome-slot" aria-hidden="true"></div></div></header>'+journey()+'<p id="draft-status" role="status" aria-live="polite"></p><aside id="draft-exit-offer" hidden><p>Conservamos tus cambios en esta sesión. Para recuperarlos después de cerrar o recargar, guárdalos.</p><button class="btn" data-save-to="panel">Guardar y salir</button><button class="btn" id="draft-dismiss-exit">Seguir sin guardar</button></aside><div id="draft-body" class="hy-body"></div><footer><button class="btn solid" id="draft-save">Guardar respuestas</button><button class="btn" id="draft-upload-retry" hidden>Reintentar subida</button><p>Guardar no envía una solicitud. Solo las respuestas guardadas se recuperan en otra sesión. Las notas de opciones desmarcadas también se conservan.</p><details><summary>Versiones y recuperación</summary><button class="btn" id="draft-load">Descartar cambios locales y cargar guardado</button><button class="btn" id="draft-history">Cargar más historial</button><div id="draft-history-list"></div></details><details class="don-settings"><summary>El Don en el portal</summary><p>Apariciones breves sobre los contenedores. Puedes ocultarlo; si prefieres movimiento reducido, lo verás quieto.</p><button class="btn" id="don-toggle" aria-pressed="false">Ocultar a El Don</button><button class="btn" data-don-play="wave">Ver saludo</button><button class="btn" data-don-play="seat">Ver aparición</button></details></footer></section>';
  host.oninput=host.onchange=e=>{
   if(e.target.type==='file'){if(e.type==='change')upload(e.target.files[0],e.target.dataset.assetSlot);return;}
   if(busy||uncertain||uploadIntent||!loaded)return;
   if(e.target.dataset.colorFor){const k=e.target.dataset.colorFor;doc.fields[k]=e.target.value;host.querySelector('[name="'+k+'"]').value=e.target.value;dirty=true;status('Cambios sin guardar.');return;}
   if(!e.target.name)return;doc.fields[e.target.name]=e.target.type==='checkbox'?e.target.checked:e.target.value;dirty=true;status('Cambios sin guardar.');
   const picker=host.querySelector('[data-color-for="'+e.target.name+'"]');if(picker&&/^#[0-9a-f]{6}$/i.test(e.target.value.trim()))picker.value=e.target.value.trim();
   if(e.target.dataset.context){e.target.setAttribute('aria-expanded',String(e.target.checked));host.querySelector('#'+e.target.dataset.context).hidden=!e.target.checked;e.target.closest('.hy-option').dataset.selected=String(e.target.checked);}
  };
  host.onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.dataset.journeyStep)exploreStep(Number(b.dataset.journeyStep));
   else if(b.dataset.section)navigate(b.dataset.section);
   else if(b.dataset.stage)navigate(b.dataset.stage);
   else if(b.dataset.saveTo)save(b.dataset.saveTo);
   else if(b.dataset.assetRead)readAsset(b.dataset.assetRead);
   else if(b.dataset.assetRemove){doc.fields[b.dataset.assetRemove]='';dirty=true;renderBody();status('Archivo retirado del borrador local. Guarda para confirmar el cambio.');}
   else if(b.id==='draft-skip'){exitOffer=dirty||!!uncertain||!!uploadIntent;navigate('panel');}
   else if(b.id==='draft-dismiss-exit'){exitOffer=false;renderBody();}
   else if(b.id==='draft-save')save();else if(b.id==='draft-upload-retry')upload();else if(b.id==='draft-load')load();else if(b.id==='draft-history')history();
  };
  renderBody();if(!loaded)load();else status(dirty?'Cambios sin guardar.':'Borrador · versión '+version);
 }
 window.addEventListener('beforeunload',e=>{if(dirty||uncertain||uploadIntent){e.preventDefault();e.returnValue='';}});
 return {render,resetTransient,showPanel:()=>navigate('panel')};
})();
