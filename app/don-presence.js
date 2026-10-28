/* Local El Don pilot: two reviewed raster poses; one bounded wrist gesture.
   Decorative only. No form, account, network or save authority. */
(function(root){
 'use strict';
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 function frame(source,width,height,progress){
  const out=new Uint8ClampedArray(source),p=Math.max(0,Math.min(1,progress));
  if(p===0||p===1)return out;
  const a=5*Math.PI/180*Math.sin(Math.PI*p)**2*Math.sin(4*Math.PI*p),sx=width/1024,sy=height/1536;
  for(let y=Math.floor(440*sy);y<Math.ceil(800*sy);y++)for(let x=Math.floor(28*sx);x<Math.ceil(322*sx);x++){
   const nx=x/sx,ny=y/sy;
   // Keep the head, shoulder and body fixed. Only the raised hand/wrist is affected.
   const w=smooth((nx-28)/55)*smooth((322-nx)/65)*smooth((ny-440)/65)*smooth((800-ny)/95)*smooth((240+Math.max(0,ny-630)*.55-nx)/25);
   if(!w)continue;
   const angle=-a*w,dx=nx-195,dy=ny-710,u=(195+dx*Math.cos(angle)-dy*Math.sin(angle))*sx,v=(710+dx*Math.sin(angle)+dy*Math.cos(angle))*sy;
   const ix=Math.max(0,Math.min(width-2,Math.floor(u))),iy=Math.max(0,Math.min(height-2,Math.floor(v))),fx=u-ix,fy=v-iy;
   const i=(y*width+x)*4,j=(iy*width+ix)*4,k=j+width*4;
   for(let c=0;c<4;c++)out[i+c]=(source[j+c]*(1-fx)+source[j+4+c]*fx)*(1-fy)+(source[k+c]*(1-fx)+source[k+4+c]*fx)*fy;
  }
  return out;
 }
 if(typeof module==='object'&&module.exports){module.exports={frame};return;}
 const key='dv.portal.el-don.hidden.v1',motion=matchMedia('(prefers-reduced-motion: reduce)');
 let host=null,controller=null,observer=null,timer=0,raf=0,epoch=0,pose=null,view=null,greeted=false,lastSeat=0,hidden=false,source=null;
 try{hidden=localStorage.getItem(key)==='true';}catch{}
 function buttons(){if(!host)return;const b=host.querySelector('#don-toggle');if(b){b.textContent=hidden?'Mostrar a El Don':'Ocultar a El Don';b.setAttribute('aria-pressed',String(hidden));}host.querySelectorAll('[data-don-play]').forEach(b=>b.disabled=hidden);}
 function stop(){epoch++;clearTimeout(timer);cancelAnimationFrame(raf);timer=raf=0;observer?.disconnect();observer=null;host?.querySelectorAll('.don-actor').forEach(e=>e.remove());pose=null;}
 function destroy(){stop();controller?.abort();controller=null;host=null;view=null;greeted=false;}
 function editing(){return !!host?.querySelector('input:focus,textarea:focus,select:focus');}
 function available(){return host?.isConnected&&!hidden&&!document.hidden&&!editing();}
 function watch(actor,onVisible){
  observer=new IntersectionObserver(entries=>{if(!actor.isConnected)return;const visible=entries[0].isIntersecting;if(visible){observer.disconnect();observer=null;onVisible();}},{threshold:.6});observer.observe(actor);
 }
 function watchExit(actor){observer=new IntersectionObserver(entries=>{if(actor.isConnected&&!entries[0].isIntersecting)stop();},{threshold:0});observer.observe(actor);}
 async function show(kind){
  stop();if(!available())return;
  const target=host.querySelector(kind==='seat'?'.draft-panel':'.don-welcome-slot');if(!target)return;
  const token=epoch,actor=document.createElement('span');actor.className='don-actor don-'+kind;actor.setAttribute('aria-hidden','true');actor.dataset.motion=motion.matches?'static':'waiting';
  const img=new Image();img.alt='';img.width=256;img.height=384;img.decoding='async';img.src='brand/el-don-'+(kind==='seat'?'seated':'greeting')+'-v1.png';
  try{await img.decode();}catch{return;}
  if(token!==epoch||!available()||!target.isConnected)return;
  actor.append(img);target.append(actor);pose=kind;
  // No entrance from off-screen. The actor belongs to this surface's border.
  if(kind==='seat'){
   actor.dataset.motion='static';lastSeat=Date.now();
   watch(actor,()=>{watchExit(actor);if(!motion.matches)timer=setTimeout(stop,9000);});return;
  }
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=384;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return;
  ctx.drawImage(img,0,0,256,384);source=ctx.getImageData(0,0,256,384).data;actor.replaceChildren(canvas);
  if(motion.matches){actor.dataset.motion='static';watch(actor,()=>watchExit(actor));return;}
  watch(actor,()=>{
   if(!available())return stop();watchExit(actor);const started=performance.now();let last=0;actor.dataset.motion='greeting';
   const tick=now=>{
    if(token!==epoch||!actor.isConnected||!available())return stop();
    const elapsed=now-started,p=Math.min(1,elapsed/2400);
    if(now-last>=33||p===1){ctx.putImageData(new ImageData(frame(source,256,384,p),256,384),0,0);actor.dataset.frame=String(Math.round(p*100));last=now;}
    if(p<1)raf=requestAnimationFrame(tick);
    else {actor.dataset.motion='static';timer=setTimeout(()=>{stop();if(view==='panel'&&available())show('seat');},600);}
   };raf=requestAnimationFrame(tick);
  });
 }
 function mount(nextHost,nextView,ready){
  if(root.DVDonScenes?.enabled){destroy();return;}
  if(host!==nextHost){destroy();host=nextHost;controller=new AbortController();const opts={signal:controller.signal};
   host.addEventListener('focusin',e=>{if(e.target.matches('input,textarea,select'))stop();},opts);
   host.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.id==='don-toggle'){hidden=!hidden;try{localStorage.setItem(key,String(hidden));}catch{}stop();buttons();if(!hidden)show(view==='panel'?'seat':'wave');}
    if(b.dataset.donPlay&&!b.disabled)show(b.dataset.donPlay==='seat'&&view==='panel'?'seat':'wave');
   },opts);
   document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();},opts);
   motion.addEventListener('change',()=>{const old=pose;stop();if(old&&available())show(old);},opts);
  }
  buttons();const changed=view!==nextView;view=nextView;
  // Re-rendered data never restart a gesture or bring an actor back while writing.
  if(!ready||hidden)return;
  if(!greeted){greeted=true;show('wave');return;}
  if(changed){stop();if(view==='panel'&&(Date.now()-lastSeat>45000||motion.matches))show('seat');}
  else if(pose==='seat'&&!host.querySelector('.don-seat'))stop();
 }
 root.DVDonPresence={mount,destroy};
})(typeof window==='undefined'?{}:window);
/* H1.2 isolated experience. Decorative only; never changes request state. */
(function(){
 'use strict';
 if(typeof window==='undefined'||typeof location==='undefined')return;
 const allowed=['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('experience')==='requests';
 const key='dv.portal.el-don.hidden.v1';let hidden=false;try{hidden=localStorage.getItem(key)==='true';}catch{}
 const scenes={client:'brand/el-don-pilot-client-v1.png',collab:'brand/el-don-pilot-collab-v1.png',delivery:'brand/el-don-pilot-delivery-v1.png'};
 function mount(target,scene){
  if(!allowed||!window.DVDrafts?.enabled()||!target||!scenes[scene]||target.querySelector('[data-don-pilot]'))return;
  try{hidden=localStorage.getItem(key)==='true';}catch{}
  const holder=document.createElement('div');holder.className='don-pilot';holder.dataset.donPilot=scene;
  const img=document.createElement('img');img.src=scenes[scene];img.alt='';img.setAttribute('aria-hidden','true');img.decoding='async';
  holder.append(img);if(scene==='delivery')target.prepend(holder);else target.append(holder);
  const menu=document.getElementById('appearanceMenu');
  if(menu&&!menu.querySelector('[data-don-pilot-preference]')){
   const button=document.createElement('button');button.type='button';button.dataset.donPilotPreference='';button.setAttribute('role','menuitem');
   button.addEventListener('click',()=>{hidden=!hidden;try{localStorage.setItem(key,String(hidden));}catch{}sync();});menu.append(button);
  }
  sync();
 }
 function sync(){
  document.querySelectorAll('[data-don-pilot]').forEach(el=>{el.hidden=hidden;});
  const button=document.querySelector('[data-don-pilot-preference]');if(button)button.textContent=hidden?'Mostrar a El Don':'Ocultar a El Don';
 }
 window.DVDonPilot={mount};
})();
