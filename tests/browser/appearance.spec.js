const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const evidence=process.env.H11_APPEARANCE_CAPTURE;
async function boot(page){
 await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:8002'?r.continue():r.abort());
 await page.addInitScript(()=>{
  window.DV_PORTAL_RELEASE_CONFIG={schemaVersion:'CONFIG_SCHEMA_V1',configVersion:'H11_APPEARANCE',environmentId:'H11_APPEARANCE',declaredMode:'DEMO',backendId:'',backendClass:'none',allowlistVersion:'LOCAL',issuedAt:'2026-01-01T00:00:00Z',expiresAt:'2031-01-01T00:00:00Z',buildCommit:'TEST',publicClient:{endpoint:'',publicKey:''}};
  window.DV_PORTAL_RELEASE_BINDING={origins:[location.origin],backendIds:[],observedBackendId:'',bindingCount:1,localHosts:['127.0.0.1']};
 });
 await page.goto('/');await page.waitForFunction(()=>window.DVPortal&&window.DVHybridDemo);
 await page.evaluate(()=>{DVStore.loginAs(DV_SEED.users.find(u=>u.role==='cliente'));DVPortal.boot();DVPortal.go('hybrid');});
}
async function theme(page,value){await page.getByLabel('Apariencia',{exact:true}).selectOption(value);}
async function capture(page,name){if(evidence){fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,name+'.png')});}}
async function fits(page,label){
 const failures=await page.evaluate(()=>{
  const bad=[];const main=document.getElementById('main');
  if(document.documentElement.scrollWidth>innerWidth+1)bad.push('document');
  if(main && main.scrollWidth>main.clientWidth+1){bad.push('main');for(const el of main.querySelectorAll('*')){const r=el.getBoundingClientRect();if(r.width&&r.right>innerWidth+1)bad.push(el.tagName+'.'+el.className);if(bad.length>8)break;}}
  for(const s of ['#appearanceBar','#topBar','.hy-body','.acard']){const e=document.querySelector(s);if(e&&e.getClientRects().length&&e.scrollWidth>e.clientWidth+1)bad.push(s);}
  return bad;
 });expect(failures,label).toEqual([]);
}
test('selected options expose readable context on desktop and mobile in both themes',async({page})=>{
 await boot(page);await page.locator('[name="q_needs_launch"]').check();
 await page.locator('[name="qnote_needs_launch"]').fill('Quiero presentar mi primer taller y explicar a quién ayuda. Ejemplo sintético.');
 for(const mode of ['light','dark']){
  await theme(page,mode);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   await page.locator('[name="qnote_needs_launch"]').scrollIntoViewIfNeeded();
   await expect(page.locator('[name="qnote_needs_launch"]')).toBeVisible();
   await fits(page,'selected '+mode+'/'+width);await capture(page,'form-'+mode+'-'+width);
  }
 }
});
test('appearance keeps edited context, resolves system changes and persists across reload/logout',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});await boot(page);
 await expect(page.locator('html')).toHaveAttribute('data-dv-appearance','light');
 await page.locator('[name="q_needs_launch"]').check();await page.locator('[name="qnote_needs_launch"]').fill('Mi contexto intacto');
 await page.locator('[name="offer"]').fill('Oferta escrita manualmente');
 const field=await page.locator('[name="offer"]').elementHandle();
 await theme(page,'dark');await expect(page.locator('html')).toHaveAttribute('data-dv-appearance','dark');
 expect(await field.evaluate(e=>e.isConnected)).toBeTruthy();
 await expect(page.locator('[name="qnote_needs_launch"]')).toHaveValue('Mi contexto intacto');
 await expect(page.locator('[name="offer"]')).toHaveValue('Oferta escrita manualmente');
 await theme(page,'system');await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-dv-appearance','dark');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-dv-appearance','light');
 await theme(page,'dark');await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-dv-appearance','dark');
 await page.reload();await expect(page.getByLabel('Apariencia',{exact:true})).toHaveValue('dark');
 await page.waitForFunction(()=>window.DVPortal);await page.evaluate(()=>DVPortal.logout());
 await expect(page.getByLabel('Apariencia',{exact:true})).toHaveValue('dark');
 await theme(page,'light');await expect(page.locator('.acard .mk')).toHaveAttribute('src','brand/donventas-symbol-bs.svg');
 await capture(page,'access-light');
 const sibling=await page.context().newPage();await sibling.goto('/');
 await sibling.getByLabel('Apariencia',{exact:true}).selectOption('dark');
 await expect(page.locator('html')).toHaveAttribute('data-dv-appearance','dark');
 await sibling.close();
});
test('all actor routes and journey surfaces reflow in both themes with exact assets',async({page})=>{
 test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
 const coverage=[];
 for(const mode of ['light','dark']){
  await theme(page,mode);
  for(const width of [320,390,640,768,890,980,1024,1280]){
   await page.setViewportSize({width,height:900});await fits(page,mode+'/'+width);
   const shape=await page.locator('#main').boundingBox();expect(shape.height).toBeGreaterThan(400);
   if([390,1280].includes(width))await capture(page,mode+'-'+width);
  }
  await expect(page.locator('.brand-wordmark')).toHaveAttribute('src','brand/donventas-wordmark-b6'+(mode==='dark'?'-reverse':'')+'.svg');
  for(const actor of ['cliente','miembro','analista','admin','freemium']){
   const routes=await page.evaluate(role=>{
    if(role==='freemium')DVStore.loginFree({name:'Persona sintética',email:'demo@synthetic.invalid'});
    else {DVStore.loginAs(DV_SEED.users.find(u=>u.role===(role==='miembro'?'cliente':role)));if(role==='miembro')DVStore.setRole('miembro');}
    DVPortal.boot();return (role==='freemium'?DVFree:['cliente','miembro'].includes(role)?DVClient:DVStaff).nav().filter(n=>n.route).map(n=>n.route);
   },actor);
   for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});
    for(const route of routes){await page.evaluate(v=>DVPortal.go(v),route);await fits(page,mode+'/'+actor+'/'+route+'/'+width);coverage.push({mode,actor,route,width});}
   }
  }
  await page.evaluate(()=>{DVStore.loginAs(DV_SEED.users.find(u=>u.role==='cliente'));DVPortal.boot();DVPortal.go('hybrid');});
  for(const stage of ['marca','contexto','ficha','ayuda','bandeja']){await page.locator('[data-tab="'+stage+'"]').click();await fits(page,mode+'/'+stage);}
  await page.locator('[data-tab="marca"]').click();
 }
 await theme(page,'light');await page.evaluate(()=>{DVStore.loginAs(DV_SEED.users.find(u=>u.role==='admin'));DVPortal.boot();DVPortal.go('prospectos');});await capture(page,'admin-light');
 expect(errors).toEqual([]);
 if(evidence)fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({date:new Date().toISOString(),coverage,errors,scope:'Local synthetic DEMO; no production'},null,2)+'\n');
});
test('mobile navigation, modal and equivalent zoom reflow remain reachable',async({page})=>{
 await boot(page);await page.setViewportSize({width:320,height:640});
 await page.getByRole('button',{name:'Menú',exact:true}).click();
 await expect(page.locator('#side')).toBeVisible();
 await page.locator('[data-nav="miembros"]').click();await expect(page.locator('#side')).toBeHidden();
 // 1280x900 at 200% browser zoom has a 640x450 CSS viewport. This is
 // equivalent reflow coverage, not a claim of operating native browser zoom.
 await page.setViewportSize({width:640,height:450});
 await page.evaluate(()=>DVPortal.go('hybrid'));
 await fits(page,'equivalent zoom reflow');
 await page.locator('[name="q_needs_launch"]').check();await expect(page.locator('[name="qnote_needs_launch"]')).toBeVisible();
 await page.evaluate(()=>DVUtil.toast('Preferencia conservada'));
 await expect(page.locator('#toast')).toBeVisible();
 await page.evaluate(()=>DVPortal.modal('comment'));
 await page.locator('#commentText').fill('Texto dentro del modal');
 for(const mode of ['light','dark']){
  await theme(page,mode);await expect(page.locator('#commentText')).toHaveValue('Texto dentro del modal');
  const box=await page.locator('#modalHost .mbox').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(640);
  await page.locator('#commentText').focus();await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
 }
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.locator('#modalHost')).toBeEmpty();
});
test('representative text and control contrast meets thresholds in light and dark',async({page})=>{
 await boot(page);
 for(const mode of ['light','dark']){
  await theme(page,mode);await page.getByLabel('Apariencia',{exact:true}).focus();await page.keyboard.press('Tab');
  expect(await page.evaluate(()=>document.activeElement!==document.body)).toBeTruthy();
  const checks=await page.evaluate(()=>{
   const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
   const lum=s=>rgb(s).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
   const ratio=(a,b)=>{a=lum(a);b=lum(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
   return ['#appearanceBar select','.hy-demo input[name="name"]','.hy-body .btn.solid','.hy-opening h1','.hy-opening h1 em','.hy-lead','.hy-editorial-note p','.hy-editorial-note em','.hy-editorial-note small','.hy-editorial-note .hy-eyebrow','.hy-edition','.hy-number','.hy-question>p','.hy-choice span','.hy-demo nav .btn.solid','.hy-demo nav .btn:not(.solid)'].map(selector=>{
    const el=document.querySelector(selector);if(!el)return {selector,missing:true};const s=getComputedStyle(el);
    let parent=el,background=s.backgroundColor;while(parent && (background==='rgba(0, 0, 0, 0)'||background==='transparent')){parent=parent.parentElement;if(parent)background=getComputedStyle(parent).backgroundColor;}
    return {selector,color:s.color,background,text:ratio(s.color,background),border:ratio(s.borderTopColor,background)};
   });
  });
  for(const c of checks){expect(c.missing,JSON.stringify(c)).toBeFalsy();expect(c.text,JSON.stringify(c)).toBeGreaterThanOrEqual(4.5);if(c.selector==='#appearanceBar select'||c.selector.includes('input['))expect(c.border,JSON.stringify(c)).toBeGreaterThanOrEqual(3);}
  const note=page.locator('.hy-editorial-note');
  const textFits=await note.evaluate(el=>{const small=el.querySelector('small'),r=document.createRange();r.selectNodeContents(small);const text=r.getBoundingClientRect(),box=el.getBoundingClientRect();return text.bottom<=box.bottom&&text.right<=box.right;});
  expect(textFits,'Editorial note text must fit its own surface').toBeTruthy();
  if(process.env.H11_EDITORIAL_DETAIL)await note.screenshot({path:path.join(process.env.H11_EDITORIAL_DETAIL,'note-'+mode+'.png')});
 }
});
test('without JavaScript appearance follows the device and selector remains disabled',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false,colorScheme:'dark'});
 const page=await context.newPage();await page.goto('/');
 await expect(page.getByLabel('Apariencia',{exact:true})).toBeDisabled();
 expect(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(14, 17, 23)');
 await page.emulateMedia({colorScheme:'light'});
 expect(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(238, 241, 246)');
 await context.close();
});

test('hover, keyboard and press distinguish preview from selection in both themes',async({page})=>{
 await boot(page);await page.setViewportSize({width:1280,height:900});
 const option=page.locator('.hy-option').first(),check=option.locator('input[type=checkbox]'),note=page.locator('[name="qnote_needs_launch"]');
 for(const mode of ['light','dark']){
  await theme(page,mode);await check.uncheck();
  await option.locator('.hy-choice').hover();
  expect(await option.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(await page.locator('.hy-body').evaluate(e=>getComputedStyle(e).backgroundColor));
  await expect(check).not.toBeChecked();await expect(note).toBeHidden();
  await check.focus();await page.keyboard.press('Space');
  await expect(check).toHaveAttribute('aria-expanded','true');await note.fill('Contexto que se conserva');
  await check.focus();await page.keyboard.press('Space');await expect(check).toHaveAttribute('aria-expanded','false');await expect(note).toBeHidden();
  await page.keyboard.press('Space');await expect(note).toHaveValue('Contexto que se conserva');
  if(process.env.H11_INTERACTION_CAPTURE){await note.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.H11_INTERACTION_CAPTURE,'interaction-'+mode+'.png')});}
  const button=page.locator('[data-action="context"]');await button.hover();
  const normal=await button.evaluate(e=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color}});
  await expect(button.locator('.dv-action-arrow')).toHaveCSS('transform','matrix(1, 0, 0, 1, 3, 0)');
  await page.mouse.down();await expect(button).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 1)');await page.mouse.move(0,0);await page.mouse.up();
  const inactive=page.locator('[data-tab="ficha"]');await inactive.hover();
  await expect(inactive).toHaveAttribute('aria-current','false');await expect(page.locator('[data-tab="marca"]')).toHaveAttribute('aria-current','step');
  expect(await inactive.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(await page.locator('[data-tab="marca"]').evaluate(e=>getComputedStyle(e).backgroundColor));
  await inactive.click();const disabled=page.locator('[data-action="artifact"]');await expect(disabled).toBeDisabled();
  const before=await disabled.evaluate(e=>getComputedStyle(e).backgroundColor);await disabled.hover();await expect(disabled).toHaveCSS('background-color',before);await expect(disabled).toHaveCSS('transform','none');
  const luminance=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  const a=luminance(normal.bg),b=luminance(normal.color);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05),'Hovered primary button contrast').toBeGreaterThanOrEqual(4.5);
  await page.locator('[data-tab="marca"]').click();
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('[data-action="context"]').hover();await expect(page.locator('.dv-action-arrow').first()).toHaveCSS('transform','none');
 await expect(page.locator('[data-action="context"]')).toHaveCSS('transform','none');
 await expect(option).toHaveCSS('transition-duration','0s');
 await check.uncheck();await check.check();await expect(note.locator('..').locator('..')).toHaveCSS('animation-name','none');
});

test('touch options and navigation work without sticky hover in light and dark',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();await boot(page);
 for(const mode of ['light','dark']){
  await theme(page,mode);expect(await page.evaluate(()=>matchMedia('(hover: none)').matches)).toBeTruthy();
  const menu=page.getByRole('button',{name:'Menú',exact:true});await menu.tap();await expect(menu).toHaveCSS('transform','none');await expect(menu).toHaveCSS('box-shadow','none');await menu.tap();
  // Preserve this real .btn node for one tap: otherwise the stage handler replaces
  // it, which would fail to exercise sticky :hover on a persistent control.
  const persistent=page.locator('[data-tab="marca"]');
  await persistent.evaluate(e=>e.addEventListener('click',event=>event.stopPropagation(),{once:true}));
  await persistent.tap();await expect(persistent).toHaveCSS('transform','none');await expect(persistent).toHaveCSS('box-shadow','none');
  const check=page.locator('[name="q_needs_launch"]');await check.uncheck();await check.tap();
  await expect(check).toBeChecked();await expect(check).toHaveAttribute('aria-expanded','true');
  await page.locator('[name="qnote_needs_launch"]').fill('Contexto desde móvil');
  if(process.env.H11_INTERACTION_CAPTURE)await page.screenshot({path:path.join(process.env.H11_INTERACTION_CAPTURE,'touch-'+mode+'.png')});
  await page.locator('[data-tab="contexto"]').tap();await expect(page.locator('[data-tab="contexto"]')).toHaveAttribute('aria-current','step');
  await page.locator('[data-tab="marca"]').tap();await expect(page.locator('[name="qnote_needs_launch"]')).toHaveValue('Contexto desde móvil');
  await fits(page,'touch '+mode);
 }
 await context.close();
});
test('blocked/prelaunch retains selector and no backend; storage denial degrades safely',async({page})=>{
 const external=[];await page.route('**/*',r=>{if(new URL(r.request().url()).origin!=='http://127.0.0.1:8002'){external.push(r.request().url());return r.abort();}return r.continue();});
 await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Unavailable');}});});
 await page.emulateMedia({colorScheme:'light'});await page.goto('/');await theme(page,'dark');
 await expect(page.locator('html')).toHaveAttribute('data-dv-appearance','dark');await expect(page.locator('.prelaunch-brand img')).toHaveAttribute('src','brand/donventas-wordmark-b6-reverse.svg');
 await theme(page,'light');await expect(page.locator('.prelaunch-brand img')).toHaveAttribute('src','brand/donventas-wordmark-b6.svg');
 expect(external).toEqual([]);expect(await page.evaluate(()=>DVEnv.state())).toBe('BLOCKED');
});
