/* Professional workspace composition. Existing forms, permissions and buffers stay in place. */
window.DVProfessionalSpace=(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const parts=[['presentation','Presentación y foto','Cómo te conocen'],['experience','Experiencia y preferencias','Lo que sabes y disfrutas'],['portfolio','Portafolio','Tus trabajos hablan por ti'],['private','Datos privados','Solo para ti'],['preview','Vista previa y autorización','Tú decides qué compartir']];
 function editor(root,state,remote,api,identity,alive,selected='presentation'){
  const editor=root.querySelector('[data-profile-editor]');
  const presentation=editor.querySelector('section'),portfolio=presentation.nextElementSibling,privateBox=editor.querySelector('[data-professional-private]')?.closest('details'),preview=editor.querySelector('[data-profile-preview]'),sharing=editor.querySelector('section:last-child'),actions=editor.querySelector('.profile-actions');
  const experience=[...presentation.querySelectorAll('details')].find(x=>x.querySelector('[data-professional-field="specialties"]'));
  const shell=document.createElement('div');shell.className='professional-editor-layout';
  shell.innerHTML='<nav class="profile-index" aria-label="Secciones de mi perfil">'+parts.map(([id,name,copy],i)=>'<button type="button" data-profile-pane="'+id+'"><span class="profile-index-number">0'+(i+1)+'</span><span><strong>'+name+'</strong><small>'+copy+'</small></span></button>').join('')+'</nav><div class="profile-panes"></div>';
  const panes=shell.querySelector('.profile-panes');
  for(const [id,,copy] of parts){const panel=document.createElement('div');panel.dataset.profilePanel=id;panel.className='profile-pane';panel.innerHTML='<p class="request-kicker">'+copy+'</p>';panes.append(panel);}
  const put=(id,node)=>{if(node)panes.querySelector('[data-profile-panel="'+id+'"]').append(node);};
  put('presentation',presentation);put('experience',experience);put('portfolio',portfolio);put('private',privateBox);put('preview',preview);put('preview',sharing);
  if(experience)experience.open=true;if(privateBox)privateBox.open=true;
  if(preview)preview.open=true;
  editor.prepend(shell);if(actions){actions.classList.add('profile-save-bar');shell.after(actions);}
  const hero=document.createElement('div');hero.className='professional-identity';
  hero.innerHTML='<div data-own-photo>'+(state.draft.photoId?DVProfessionalMedia.markup(state.draft.photoId,'Tu foto de perfil',identity,true):'<span class="profile-monogram" aria-hidden="true">'+esc((state.draft.name||'DV').slice(0,2).toUpperCase())+'</span>')+'</div><div><p class="request-kicker">TU LUGAR EN DON VENTAS</p><h2>'+esc(state.draft.name||'Dale una cara a tu experiencia')+'</h2><p>'+esc(state.draft.intro||'Presenta cómo puedes ayudar a las marcas. Puedes completarlo a tu ritmo.')+'</p><small>'+state.draft.projects.length+' de 6 trabajos · '+(remote.authorized?'Versión autorizada para revisión':'Borrador privado')+'</small></div>';
  editor.prepend(hero);DVProfessionalMedia.attach(hero,api,null,alive);
  function show(id,focus=false){if(!parts.some(p=>p[0]===id))id='presentation';root.dataset.activeProfilePane=id;for(const panel of panes.children)panel.hidden=panel.dataset.profilePanel!==id;for(const b of shell.querySelectorAll('[data-profile-pane]')){const active=b.dataset.profilePane===id;b.setAttribute('aria-current',active?'page':'false');}if(focus){const panel=panes.querySelector('[data-profile-panel="'+id+'"]');panel.tabIndex=-1;panel.focus();}}
  shell.querySelector('nav').onclick=e=>{const b=e.target.closest('[data-profile-pane]');if(!b)return;e.stopPropagation();show(b.dataset.profilePane,true);};show(selected);
 }
 async function dashboard(content,alive){
  if(window.DVStore?.session()?.actor!=='staff')return;
  content.classList.add('professional-workspace');
  const body=document.createElement('div');body.className='professional-work-list';while(content.firstChild)body.append(content.firstChild);
  const layout=document.createElement('div');layout.className='professional-dashboard';layout.innerHTML='<div class="professional-main"><header class="professional-welcome"><span class="request-kicker">PERSONAS QUE DAN FORMA A LAS MARCAS</span><h2>Tu talento.<br> Marcas en movimiento.</h2><p>Consulta lo que necesita atención, coordina cada encargo y comparte tu experiencia.</p></header><div data-availability-inbox></div></div><aside class="professional-aside" aria-label="Tu perfil y accesos"><p role="status">Recuperando tu presentación…</p></aside>';layout.querySelector('.professional-main').append(body);content.append(layout);
  if(/colaborador/i.test(DVStore.me()?.workspaceLabel||''))window.DVDonPilot?.mount(layout.querySelector('.professional-welcome'),'collab');
  // Requests and assignments are distinct work areas, using the same existing controls.
  const headers=[...body.querySelectorAll(':scope > h3')];for(const h of headers){const region=document.createElement('section');region.className='professional-work-region';h.before(region);let n=h;while(n){const next=n.nextSibling;if(n!==h&&(n.nodeName==='H3'||n.nodeName==='DETAILS'))break;region.append(n);n=next;}}
  try{const c=await DVWorkflowUI.connection(),own=await c.profiles('own');if(!alive()||!layout.isConnected)return;const p=own.draft;
   const aside=layout.querySelector('aside');aside.innerHTML='<div class="professional-mini-profile">'+(p.photoId?DVProfessionalMedia.markup(p.photoId,'Tu foto de perfil',c.identity,true):'<span class="profile-monogram" aria-hidden="true">'+esc((p.name||'DV').slice(0,2).toUpperCase())+'</span>')+'<p class="request-kicker">MI PERFIL PROFESIONAL</p><h3>'+esc(p.name||'Tu presentación')+'</h3><p>'+esc(p.intro||'Cuenta cómo ayudas a las marcas y qué te gusta crear.')+'</p><span class="professional-tag">'+(own.authorized?'Versión autorizada':'Solo tú puedes ver tu borrador')+'</span></div><button type="button" class="profile-access-toggle" aria-expanded="false" aria-controls="professional-shortcuts">Editar perfil y portafolio <span aria-hidden="true">＋</span></button><nav id="professional-shortcuts" aria-label="Accesos a mi perfil">'+parts.map(([id,name,copy])=>'<button type="button" class="profile-shortcut" data-profile-shortcut="'+id+'"><span><strong>'+name+'</strong><small>'+copy+'</small></span><span aria-hidden="true">↗</span></button>').join('')+'</nav><p class="professional-aside-note">Tu perfil se comparte por solicitud, después de tu autorización y la revisión de Don Ventas.</p>';
   aside.onclick=e=>{const toggle=e.target.closest('.profile-access-toggle');if(toggle){const open=aside.classList.toggle('profile-access-open');toggle.setAttribute('aria-expanded',String(open));e.stopPropagation();return;}const b=e.target.closest('[data-profile-shortcut]');if(!b)return;e.stopPropagation();DVProfessionalUI.initialSection=b.dataset.profileShortcut;DVPortal.go('professional');};DVProfessionalMedia.attach(aside,c.profiles,null,()=>alive()&&layout.isConnected);
   window.DVRecommendations?.inbox(layout.querySelector('[data-availability-inbox]'));
  }catch{if(alive()&&layout.isConnected)layout.querySelector('aside').innerHTML='<p>No pudimos cargar tu presentación.</p><button class="btn" type="button" onclick="DVPortal.go(\'professional\')">Abrir mi perfil</button>';}
 }
 return {editor,dashboard};
})();
