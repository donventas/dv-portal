/* Private raster previews. No public URLs or persistent browser image cache. */
window.DVProfessionalMedia=(function(){
 'use strict';
 const active=new Set();
 function dimensions(bytes,mime){
  const b=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let w,h;
  if(mime==='image/png'&&bytes.length>=33&&b.getUint32(0)===0x89504e47&&b.getUint32(4)===0x0d0a1a0a&&b.getUint32(12)===0x49484452){w=b.getUint32(16);h=b.getUint32(20);}
  else if(mime==='image/jpeg'&&bytes.length>=4&&b.getUint16(0)===0xffd8){let i=2;while(i<bytes.length-3){if(bytes[i]!==255)break;while(i<bytes.length&&bytes[i]===255)i++;const marker=bytes[i++];if([217,218].includes(marker))break;if(marker===1||(marker>=208&&marker<=215))continue;if(i+1>=bytes.length)break;const size=b.getUint16(i);if(size<2||i+size>bytes.length)break;if([192,193,194].includes(marker)&&size>=8){h=b.getUint16(i+3);w=b.getUint16(i+5);break;}i+=size;}}
  if(!w||!h||w>8192||h>8192||w*h>16777216)throw Error('PROFILE_IMAGE_INVALID');return {width:w,height:h};
 }
 async function raster(bytes,mime,max=1600){
  dimensions(bytes,mime);let bitmap;
  try{bitmap=await createImageBitmap(new Blob([bytes],{type:mime}));const ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,.88));if(!blob)throw Error('PROFILE_IMAGE_INVALID');return blob;}catch{throw Error('PROFILE_IMAGE_INVALID');}finally{bitmap?.close();}
 }
 async function prepare(file){if(!['image/png','image/jpeg'].includes(file.type))return file;if(file.size>4194304)throw Error('PROFILE_IMAGE_INVALID');const clean=await raster(new Uint8Array(await file.arrayBuffer()),file.type);return new File([clean],file.name,{type:file.type});}
 function markup(id,caption,user,portrait=false){const e=window.DVUtil.esc;return '<figure class="'+(portrait?'professional-photo':'portfolio-picture')+'"><button type="button" class="portfolio-thumbnail" data-private-image="'+e(id)+'" data-image-user="'+e(user)+'" data-image-caption="'+e(caption)+'" aria-label="Ampliar: '+e(caption)+'"><span>Preparando imagen…</span></button>'+(portrait?'':'<figcaption>'+e(caption)+'</figcaption>')+'</figure>';}
 function clear(root){for(const x of [...active])if(!root||x.root===root||root.contains(x.root))x.dispose();}
 function attach(root,api,request,alive){
  clear(root);if(!root?.isConnected)return;let stopped=false;const urls=new Set(),pending=new Set();let dialog,returnFocus;
  const valid=()=>!stopped&&root.isConnected&&alive();
  const item={root,dispose(){if(stopped)return;stopped=true;observer.disconnect();mutation.disconnect();dialog?.remove();for(const u of urls)URL.revokeObjectURL(u);urls.clear();active.delete(item);}};active.add(item);
  const mutation=new MutationObserver(()=>{if(!valid())item.dispose();});mutation.observe(document.body,{childList:true,subtree:true});
  async function picture(button){
   if(!valid()||!button.isConnected||pending.has(button))return;pending.add(button);
   try{const f=await api('preview',request,button.dataset.imageUser,button.dataset.privateImage);if(!valid()||!button.isConnected)return;
    const bytes=Uint8Array.from(atob(f.base64.replace(/\s/g,'')),c=>c.charCodeAt(0));if(bytes.length>4194304)throw Error('PROFILE_IMAGE_INVALID');dimensions(bytes,f.mime);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(!valid()||!button.isConnected)return;if(hash!==f.sha256)throw Error('PROFILE_IMAGE_INVALID');
    const clean=await raster(bytes,f.mime);if(!valid()||!button.isConnected)return;const url=URL.createObjectURL(clean);urls.add(url);const img=document.createElement('img');img.alt=button.dataset.imageCaption;img.src=url;img.decoding='async';button.replaceChildren(img);button.dataset.imageReady='true';
   }catch{if(valid()&&button.isConnected){button.textContent='Imagen no disponible · reintentar';button.dataset.imageReady='false';}}finally{pending.delete(button);}
  }
  async function expand(button){
   if(!valid())return;if(button.dataset.imageReady!=='true'){await picture(button);return;}
   // Fresh permission check for every expansion; do not reuse the thumbnail as authority.
   try{await api('preview',request,button.dataset.imageUser,button.dataset.privateImage);if(!valid()||!button.isConnected)return;
    dialog?.remove();dialog=document.createElement('dialog');dialog.className='portfolio-dialog';dialog.setAttribute('aria-label','Imagen del portafolio');const close=document.createElement('button');close.type='button';close.className='btn';close.textContent='Cerrar imagen';const img=button.querySelector('img').cloneNode();const caption=document.createElement('p');caption.textContent=button.dataset.imageCaption;dialog.append(close,img,caption);root.append(dialog);returnFocus=button;close.onclick=()=>dialog.close();dialog.onclose=()=>{dialog.remove();if(valid()&&returnFocus.isConnected)returnFocus.focus();};dialog.showModal();close.focus();
   }catch{if(valid()){button.replaceChildren(document.createTextNode('Imagen no disponible · actualizar perfiles'));button.dataset.imageReady='false';}}
  }
  const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);picture(e.target);}},{rootMargin:'100px'});
  for(const b of root.querySelectorAll('[data-private-image]')){b.onclick=e=>{e.preventDefault();e.stopPropagation();expand(b);};observer.observe(b);}
  return item.dispose;
 }
 return {prepare,markup,attach,clear,dimensions};
})();
