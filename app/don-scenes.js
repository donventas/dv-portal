/* Opt-in local static composition study. No workflow or persistence authority. */
(function(){
 'use strict';
 const enabled=['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('scenes')==='1';
 const scenes=[['wake','Tu marca','Despertar'],['coffee','Contexto','Café'],['mirror','Ficha de oferta','Prepararse'],['dress','Ajustes y ayuda','Vestirse'],['car','Bandeja DV','Listo para salir']];
 let selected=0,hidden=false,journeyStep=null;
 function mount(host){
  if(!enabled)return;
  const welcome=host.querySelector('.draft-welcome'),body=host.querySelector('#draft-body');if(!welcome||!body)return;
  const current=Number(welcome.dataset.step||1);if(current!==journeyStep){selected=current-1;journeyStep=current;}
  welcome.classList.add('don-scenes-study');
  let controls=host.querySelector('.don-scene-controls');
  if(!controls){
   controls=document.createElement('details');controls.className='don-scene-controls';
   controls.innerHTML='<summary>Prueba estática · <span data-scene-label></span></summary><p>Comparar escenas no cambia de etapa. Los pasos operativos siguen pendientes.</p><div role="group" aria-label="Escenas de prueba">'+scenes.map((s,i)=>'<button type="button" class="btn" data-scene-index="'+i+'">'+(i+1)+'. '+s[1]+'</button>').join('')+'</div><button type="button" class="btn" data-scene-hide>Ocultar escenas</button>';
   body.before(controls);
   controls.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-scene-index'))selected=Number(b.dataset.sceneIndex);if(b.hasAttribute('data-scene-hide'))hidden=!hidden;paint(host);});
  }
  if(!body.querySelector('.don-scene-heading')){
   const title=body.querySelector('#draft-title');if(!title)return;
   const hero=document.createElement('div');hero.className='don-scene-heading';
   const copy=document.createElement('div');copy.className='don-scene-copy';
   const prefix=title.previousElementSibling;
   body.insertBefore(hero,prefix?.classList.contains('hy-eyebrow')?prefix:title);
   if(prefix?.classList.contains('hy-eyebrow'))copy.append(prefix);copy.append(title);
   const art=document.createElement('div');art.className='don-scene-art';art.setAttribute('aria-hidden','true');
   hero.append(copy,art);
  }
  paint(host);
 }
 function paint(host){
  const [id,title]=scenes[selected],art=host.querySelector('.don-scene-art');if(!art)return;
  host.querySelector('[data-scene-label]').textContent=(selected+1)+'. '+title;
  host.querySelectorAll('[data-scene-index]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.sceneIndex)===selected)));
  const toggle=host.querySelector('[data-scene-hide]');toggle.textContent=hidden?'Mostrar escenas':'Ocultar escenas';toggle.setAttribute('aria-pressed',String(hidden));
  host.querySelector('.don-scene-heading').classList.toggle('don-scene-hidden',hidden);
  host.querySelector('.don-scene-heading').classList.toggle('don-scene-long',(host.querySelector('#draft-title')?.textContent.length||0)>55);
  art.hidden=hidden;art.dataset.scene=id;
  if(!hidden&&art.dataset.loaded!==id){
   const image=new Image();image.alt='';image.width=id==='car'?1536:512;image.height=id==='car'?1024:512;image.decoding='async';image.src='brand/el-don-scene-'+id+(id==='car'?'-v2.png':'-v1.png');
   // Missing images leave a stable blank decorative region; form stays usable.
   image.addEventListener('error',()=>{image.hidden=true;});art.replaceChildren(image);art.dataset.loaded=id;
  }
 }
 window.DVDonScenes={enabled,mount};
})();
