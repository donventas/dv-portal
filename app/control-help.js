/* Don Ventas control hints: hover + keyboard, never a required touch step. */
(function(){
 'use strict';
 const tip=document.createElement('div');tip.id='dv-control-help';tip.className='dv-control-help';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
 let active=null,previous=null,dismissed=null,leaveTimer=null;
 function cancelLeave(){clearTimeout(leaveTimer);leaveTimer=null;}
 function hide(){cancelLeave();if(active){if(previous)active.setAttribute('aria-describedby',previous);else active.removeAttribute('aria-describedby');}active=null;previous=null;tip.hidden=true;}
 function leave(){cancelLeave();leaveTimer=setTimeout(()=>{if(document.activeElement!==active)hide();},180);}
 function prepare(root){
  const nodes=[...(root.matches?.('[title]')?[root]:[]),...(root.querySelectorAll?.('button[title],a[title],select[title]')||[])];
  for(const el of nodes){if(el.title){el.dataset.dvTip=el.title;el.removeAttribute('title');}}
 }
 function show(el){
  cancelLeave();
  if(!el||el===dismissed||el.disabled||el.getAttribute('aria-expanded')==='true')return;
  if(active!==el){hide();active=el;previous=el.getAttribute('aria-describedby');el.setAttribute('aria-describedby',[previous,tip.id].filter(Boolean).join(' '));}
  tip.textContent=el.dataset.dvTip;tip.hidden=false;tip.style.left='0px';tip.style.top='0px';
  const r=el.getBoundingClientRect(),t=tip.getBoundingClientRect();
  if(r.bottom+t.height+16>innerHeight&&r.top-t.height-16<0){hide();return;}
  tip.style.left=Math.max(8,Math.min(r.right-t.width,innerWidth-t.width-8))+'px';
  tip.style.top=(r.bottom+t.height+10<innerHeight?r.bottom+8:Math.max(8,r.top-t.height-8))+'px';
 }
 const target=e=>e.target.closest?.('[data-dv-tip]');
 document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=target(e);if(el)show(el);});
 document.addEventListener('pointerout',e=>{const el=target(e);if(el&&!el.contains(e.relatedTarget)&&!tip.contains(e.relatedTarget)){if(dismissed===el)dismissed=null;if(active===el&&document.activeElement!==el)leave();}});
 tip.addEventListener('pointerenter',cancelLeave);
 tip.addEventListener('pointerleave',()=>{if(document.activeElement!==active)leave();});
 document.addEventListener('focusin',e=>{dismissed=null;show(target(e));});
 document.addEventListener('focusout',e=>{if(target(e)===active)hide();});
 document.addEventListener('pointerdown',()=>hide());
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){dismissed=active;hide();}});
 function reposition(){if(active&&active===document.activeElement){const r=active.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth)show(active);else hide();}else hide();}
 document.addEventListener('scroll',reposition,true);window.addEventListener('resize',reposition);
 prepare(document);
 new MutationObserver(records=>{for(const record of records)if(record.type==='attributes')prepare(record.target);else for(const node of record.addedNodes)if(node.nodeType===1)prepare(node);if(active&&(!active.isConnected||active.getAttribute('aria-expanded')==='true'))hide();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['title','aria-expanded']});
})();
