const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');
// UI-only fixture. No live Auth/DB, review account or operational data is touched.
async function activate(page){
 await page.waitForFunction(()=>window.DVPortal&&window.DV_SEED&&window.DVDraftUI);
 await page.evaluate(()=>{DVStore.loginAs(DV_SEED.users.find(u=>u.role==='cliente'));DVPortal.boot();DVPortal.go('draft');});
 await expect(page.locator('#draft-save')).toBeEnabled();
}
async function boot(page){
 await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:8002'?r.continue():r.abort());
 await page.addInitScript(()=>{
  window.DV_PORTAL_RELEASE_CONFIG={schemaVersion:'CONFIG_SCHEMA_V1',configVersion:'H12_JOURNEY_UI_TEST',environmentId:'H12_JOURNEY_UI_TEST',declaredMode:'DEMO',backendId:'',backendClass:'none',allowlistVersion:'LOCAL',issuedAt:'2026-01-01T00:00:00Z',expiresAt:'2031-01-01T00:00:00Z',buildCommit:'TEST',publicClient:{endpoint:'',publicKey:''}};
  window.DV_PORTAL_RELEASE_BINDING={origins:[location.origin],backendIds:[],observedBackendId:'',bindingCount:1,localHosts:['127.0.0.1']};
 });
 await page.route('**/app/drafts.js',r=>r.fulfill({contentType:'text/javascript',body:`window.DVDrafts={enabled:()=>true,open:async()=>JSON.parse(localStorage.getItem('test-draft')||'{"version":0,"assets":[]}'),save:async(key,version,document)=>{const r={version:version+1,document,assets:[]};localStorage.setItem('test-draft',JSON.stringify(r));return r},history:async()=>({rows:[],next:null,snapshot:0})};`}));
 await page.goto('/');await activate(page);
}
test('all five steps open with an empty draft, keyboard focus and no writes',async({page})=>{
 await boot(page);
 for(const [number,title] of [[2,'Contexto'],[3,'Ficha de oferta'],[4,'Ajustes y ayuda'],[5,'Bandeja DV'],[1,'Tu negocio']]){
  const button=page.locator('.draft-journey [data-journey-step="'+number+'"]');
  await button.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#draft-title')).toHaveText(title);
  await expect(page.locator('#draft-title')).toBeFocused();
  await expect(button).toHaveAttribute('aria-current','step');
  await expect(page.locator('.draft-journey [aria-current=step]')).toHaveCount(1);
 }
 expect(await page.evaluate(()=>localStorage.getItem('test-draft'))).toBeNull();
 await expect(page.locator('[name=name]')).toHaveValue('');
});

test('exploring all steps preserves unsaved choices and hidden context; saving from another step recovers exact data',async({page})=>{
 await boot(page);
 await page.locator('[name=name]').fill('  Mi marca  ');
 await page.locator('[name=q_offerTypes_service]').check();
 await page.locator('[name=qnote_offerTypes_service]').fill('  Mi contexto\ncon espacios.  ');
 await page.locator('[name=q_offerTypes_service]').uncheck();
 for(const n of [2,3,4,5])await page.locator('.draft-journey [data-journey-step="'+n+'"]').click();
 expect(await page.evaluate(()=>localStorage.getItem('test-draft'))).toBeNull();
 await page.locator('#draft-save').click();
 await expect(page.locator('#draft-status')).toContainText('Borrador guardado');
 await expect(page.locator('#draft-title')).toHaveText('Bandeja DV');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('test-draft')));
 expect(saved.document.stage).toBe('marca');
 expect(saved.document.fields.name).toBe('  Mi marca  ');
 await page.reload();await activate(page);
 await expect(page.locator('[name=name]')).toHaveValue('  Mi marca  ');
 await expect(page.locator('[name=qnote_offerTypes_service]')).toHaveValue('  Mi contexto\ncon espacios.  ');
 await expect(page.locator('[name=q_offerTypes_service]')).not.toBeChecked();
});

test('five steps remain distinct from optional blocks; whole cards support keyboard and preserve saved responses',async({page})=>{
 await boot(page);
 await expect(page.locator('.draft-journey li')).toHaveCount(5);
 await expect(page.locator('.draft-journey [aria-current=step]')).toContainText('Tu marca');
 await expect(page.locator('.draft-journey button')).toHaveCount(5);
 await page.locator('[name=name]').fill('  Marca de prueba  ');
 await page.locator('[name=q_offerTypes_service]').check();
 const note=page.locator('[name=qnote_offerTypes_service]');
 await note.fill('  Contexto\nque debe permanecer.  ');
 await page.locator('[name=q_offerTypes_service]').uncheck();
 await page.locator('header .draft-actions [data-stage=panel]').click();
 await expect(page.locator('.draft-card[data-section=negocio]')).toContainText('Cambios sin guardar');
 const objective=page.locator('.draft-card[data-section=objetivo]');
 await objective.focus();await page.keyboard.press('Enter');
 await expect(page.locator('#draft-title')).toHaveText('Tu objetivo');
 await page.locator('[name=objective]').fill('Mi siguiente objetivo');
 await page.locator('header .draft-actions [data-stage=panel]').click();
 const business=page.locator('.draft-card[data-section=negocio]');
 await business.focus();await page.keyboard.press('Space');
 await expect(page.locator('[name=name]')).toHaveValue('  Marca de prueba  ');
 await expect(note).toHaveValue('  Contexto\nque debe permanecer.  ');
 await expect(page.locator('.draft-guide')).toHaveCount(0);
 await expect(page.locator('[name=name]')).toHaveValue('  Marca de prueba  ');
 await page.locator('#draft-body [data-save-to=panel]').click();
 await expect(page.locator('#draft-status')).toContainText('Borrador guardado');
 await page.reload();await activate(page);
 await expect(page.locator('.draft-card[data-section=negocio]')).toContainText('Con información guardada');
 await page.locator('.draft-card[data-section=negocio]').click({position:{x:8,y:8}});
 await expect(page.locator('[name=name]')).toHaveValue('  Marca de prueba  ');
 await expect(note).toHaveValue('  Contexto\nque debe permanecer.  ');
 await page.locator('header .draft-actions [data-stage=panel]').click();
 await page.locator('.draft-card[data-section=objetivo]').click();
 await expect(page.locator('[name=objective]')).toHaveValue('Mi siguiente objetivo');
});
test('cards share tracks in both appearances, fit mobile, and reduce motion without losing focus',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page);await page.locator('header .draft-actions [data-stage=panel]').click();
 for(const mode of ['light','dark'])for(const width of [320,390,900,1280]){
  await page.setViewportSize({width,height:1000});
  await page.getByRole('button',{name:'Cambiar apariencia',exact:true}).click();
  await page.getByRole('menuitemradio',{name:mode==='light'?'Claro':'Oscuro',exact:true}).click();
  await page.mouse.move(3,3);
  await page.locator('.draft-journey').evaluate((e,open)=>e.open=open,width>=900);
  const cards=page.locator('.draft-card');await expect(cards).toHaveCount(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth)).toBe(true);
  const geometry=await cards.evaluateAll(cs=>cs.map(c=>({top:c.getBoundingClientRect().top,cta:c.querySelector('.draft-card-cta').getBoundingClientRect().top,nested:c.querySelectorAll('button,a,input').length})));
  expect(geometry.every(g=>g.nested===0)).toBe(true);
  if(width>=900){expect(geometry[0].top).toBe(geometry[1].top);expect(geometry[0].cta).toBe(geometry[1].cta);expect(geometry[2].cta).toBe(geometry[3].cta);}
  expect(await page.locator('.don-actor').count()).toBeLessThanOrEqual(1);
  if(process.env.H12_JOURNEY_CAPTURE&&[390,1280].includes(width)){
   fs.mkdirSync(process.env.H12_JOURNEY_CAPTURE,{recursive:true});
   await page.screenshot({path:path.join(process.env.H12_JOURNEY_CAPTURE,`shell-${mode}-${width}.png`)});
   await cards.first().scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(process.env.H12_JOURNEY_CAPTURE,`cards-${mode}-${width}.png`)});
   await page.evaluate(()=>document.querySelector('#main').scrollTo(0,0));
  }
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.keyboard.press('Tab');await page.locator('.draft-card').first().focus();
 const focus=await page.locator('.draft-card').first().evaluate(e=>({outline:getComputedStyle(e).outlineStyle,transition:getComputedStyle(e).transitionDuration}));
 expect(focus.outline).toBe('solid');expect(focus.transition).toBe('0s');
 expect(errors).toEqual([]);
});
test('touch opens an entire card and decorative presence preserves context',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const page=await context.newPage();await boot(page);
 await page.locator('header .draft-actions [data-stage=panel]').tap();
 await page.locator('.draft-card[data-section=clientes]').tap();
 await expect(page.locator('#draft-title')).toHaveText('Tus clientes');
 await page.locator('[name=audience]').fill('Clientes que quieren aprender');
 await expect(page.locator('.don-actor')).toHaveCount(0);
 await expect(page.locator('[name=audience]')).toHaveValue('Clientes que quieren aprender');
 await page.locator('.draft-journey summary').tap();
 await expect(page.locator('.draft-journey li')).toHaveCount(5);
 await expect(page.locator('.draft-journey button').last()).toContainText('Bandeja DV');
 await context.close();
});
test('El Don greets briefly, cannot intercept clicks, and stops immediately while typing',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page);
 await expect(page.locator('.don-wave')).toHaveAttribute('data-motion','greeting');
 await expect.poll(()=>page.locator('.don-wave').getAttribute('data-frame')).not.toBe('0');
 if(process.env.H12_DON_CAPTURE){fs.mkdirSync(process.env.H12_DON_CAPTURE,{recursive:true});await page.screenshot({path:path.join(process.env.H12_DON_CAPTURE,'greeting-live.png')});}
 expect(await page.locator('.don-wave').evaluate(e=>getComputedStyle(e).pointerEvents)).toBe('none');
 await expect(page.locator('.don-wave')).toHaveAttribute('aria-hidden','true');
 await page.locator('[name=name]').fill('Mi texto sigue aquí');
 await expect(page.locator('.don-actor')).toHaveCount(0);
 await expect(page.locator('[name=name]')).toHaveValue('Mi texto sigue aquí');
 await page.locator('header .draft-actions [data-stage=panel]').click();
 await page.locator('.draft-card[data-section=objetivo]').scrollIntoViewIfNeeded();
 await expect(page.locator('.don-seat')).toBeVisible();
 const passThrough=await page.locator('.don-seat').evaluate(e=>{const r=e.getBoundingClientRect();return !document.elementFromPoint(r.x+r.width/2,r.y+r.height-10)?.closest('.don-actor');});
 expect(passThrough).toBe(true);
 await page.locator('.draft-card[data-section=negocio]').click();
 await expect(page.locator('[name=name]')).toHaveValue('Mi texto sigue aquí');
 await expect(page.locator('.don-actor')).toHaveCount(0);
 expect(errors).toEqual([]);
});
test('greeting ends, offscreen actor stops, and visibility signal cancels decoration without touching input',async({page})=>{
 await boot(page);
 await expect(page.locator('.don-wave')).toBeAttached();
 await expect(page.locator('.don-wave')).toHaveCount(0,{timeout:5000});
 await page.locator('header .draft-actions [data-stage=panel]').click();
 await page.evaluate(()=>{const main=document.querySelector('#main'),panel=document.querySelector('.draft-panel');main.scrollTo(0,main.scrollTop+panel.getBoundingClientRect().top-main.getBoundingClientRect().top-150);});
 await expect(page.locator('.don-seat')).toBeAttached();
 await page.locator('footer').scrollIntoViewIfNeeded();
 await expect(page.locator('.don-actor')).toHaveCount(0);
 await page.locator('.don-settings summary').click();
 await page.locator('[data-don-play=wave]').click();
 await page.locator('header').scrollIntoViewIfNeeded();
 await expect(page.locator('.don-wave')).toBeAttached();
 // Controlled hidden-page event; real IntersectionObserver scroll tested above.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.locator('.don-actor')).toHaveCount(0);
 await expect(page.locator('.draft-card')).toHaveCount(5);
});
test('reduced motion stays static, hiding persists on reload, and logout removes the actor',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await boot(page);
 await expect(page.locator('.don-wave')).toHaveAttribute('data-motion','static');
 await page.locator('header .draft-actions [data-stage=panel]').click();
 await expect(page.locator('.don-seat')).toHaveAttribute('data-motion','static');
 await page.locator('.don-settings summary').click();
 await page.locator('#don-toggle').click();
 await expect(page.locator('.don-actor')).toHaveCount(0);
 await page.reload();await activate(page);
 await expect(page.locator('.don-actor')).toHaveCount(0);
 await page.locator('.don-settings summary').click();await page.locator('#don-toggle').click();
 await page.locator('header').scrollIntoViewIfNeeded();
 await expect(page.locator('.don-wave')).toHaveAttribute('data-motion','static');
 await page.evaluate(()=>DVDraftUI.resetTransient());
 await expect(page.locator('.don-actor')).toHaveCount(0);
});
test('seated pose and greeting fit actual containers in both appearances and mobile',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await boot(page);
 await page.locator('header .draft-actions [data-stage=panel]').click();
 for(const mode of ['light','dark'])for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:1000});
  await page.getByRole('button',{name:'Cambiar apariencia',exact:true}).click();
  await page.getByRole('menuitemradio',{name:mode==='light'?'Claro':'Oscuro',exact:true}).click();
  await page.locator('.don-settings summary').evaluate(e=>e.parentElement.open=true);
  await page.locator('[data-don-play=seat]').click();
  await page.evaluate(()=>{const main=document.querySelector('#main'),panel=document.querySelector('.draft-panel');main.scrollTo(0,main.scrollTop+panel.getBoundingClientRect().top-main.getBoundingClientRect().top-150);});
  await expect(page.locator('.don-seat img')).toBeVisible();
  expect(await page.locator('.don-seat img').evaluate(i=>i.complete&&i.naturalWidth===256)).toBe(true);
  const collision=await page.locator('.don-seat').evaluate(e=>{
   const r=e.getBoundingClientRect(),overlaps=s=>[...document.querySelectorAll(s)].some(t=>{const range=document.createRange();range.selectNodeContents(t);return [...range.getClientRects()].some(b=>b.width&&b.height&&r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top);});
   return {overflow:document.documentElement.scrollWidth>innerWidth||document.querySelector('#main').scrollWidth>document.querySelector('#main').clientWidth,text:overlaps('.draft-card-title,.draft-card-cta')};
  });
  if(collision.text&&process.env.H12_DON_CAPTURE)await page.screenshot({path:path.join(process.env.H12_DON_CAPTURE,`collision-${mode}-${width}.png`)});
  expect(collision,mode+'/'+width).toEqual({overflow:false,text:false});
  if(process.env.H12_DON_CAPTURE){
   fs.mkdirSync(process.env.H12_DON_CAPTURE,{recursive:true});
   await page.screenshot({path:path.join(process.env.H12_DON_CAPTURE,`seated-${mode}-${width}.png`)});
  }
 }
});
