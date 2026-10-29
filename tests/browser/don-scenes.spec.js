const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const ids=['wake','coffee','mirror','dress','car'];
async function activate(page){await page.waitForFunction(()=>window.DVDraftUI&&window.DVPortal&&window.DV_SEED);await page.evaluate(()=>{DVStore.loginAs(DV_SEED.users.find(u=>u.role==='cliente'));DVPortal.boot();DVPortal.go('draft');});await expect(page.locator('#draft-save')).toBeEnabled();}
async function boot(page,query='?scenes=1'){
 await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:8002'?r.continue():r.abort());
 await page.addInitScript(()=>{window.DV_PORTAL_RELEASE_CONFIG={schemaVersion:'CONFIG_SCHEMA_V1',configVersion:'H12_SCENE_UI_TEST',environmentId:'H12_SCENE_UI_TEST',declaredMode:'DEMO',backendId:'',backendClass:'none',allowlistVersion:'LOCAL',issuedAt:'2026-01-01T00:00:00Z',expiresAt:'2031-01-01T00:00:00Z',buildCommit:'TEST',publicClient:{endpoint:'',publicKey:''}};window.DV_PORTAL_RELEASE_BINDING={origins:[location.origin],backendIds:[],observedBackendId:'',bindingCount:1,localHosts:['127.0.0.1']};});
 await page.route('**/app/drafts.js',r=>r.fulfill({contentType:'text/javascript',body:`window.DVDrafts={enabled:()=>true,open:async()=>JSON.parse(localStorage.getItem('scene-test-draft')||'{"version":0,"assets":[]}'),save:async(key,version,document)=>{const r={version:version+1,document,assets:[]};localStorage.setItem('scene-test-draft',JSON.stringify(r));return r},history:async()=>({rows:[],next:null,snapshot:0})};`}));
 await page.goto('/'+query);await activate(page);
}
async function choose(page,index){await page.locator('.don-scene-controls').evaluate(e=>e.open=true);await page.locator('[data-scene-index="'+index+'"]').click();await expect(page.locator('.don-scene-art')).toHaveAttribute('data-scene',ids[index]);await expect.poll(()=>page.locator('.don-scene-art img').evaluate(i=>i.complete&&i.naturalWidth===(i.src.includes('car-v2')?1536:512))).toBe(true);await page.locator('.don-scene-controls summary').click();}

test('free navigation follows each scene in both modes on touch and desktop without overflow',async({browser})=>{
 test.setTimeout(90000);
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
 const page=await context.newPage();await boot(page);
 for(const mode of ['light','dark'])for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:900});
  await page.getByRole('button',{name:'Cambiar apariencia',exact:true}).click();await page.getByRole('menuitemradio',{name:mode==='light'?'Claro':'Oscuro',exact:true}).click();
  await page.mouse.move(2,2);
  for(let n=2;n<=5;n++){
   await page.locator('.draft-journey').evaluate(e=>e.open=true);
   await page.locator('.draft-journey [data-journey-step="'+n+'"]').tap();
   await expect(page.locator('.don-scene-art')).toHaveAttribute('data-scene',ids[n-1]);
   await expect(page.locator('#draft-body')).toContainText(n===5?'borrador privado':'pendiente');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth)).toBe(true);
   const collision=await page.locator('.don-scene-heading').evaluate(e=>{const a=e.querySelector('.don-scene-art').getBoundingClientRect(),t=e.querySelector('#draft-title').getBoundingClientRect();return a.left<t.right&&a.right>t.left&&a.top<t.bottom&&a.bottom>t.top;});expect(collision).toBe(false);
   if(process.env.H12_NAV_CAPTURE){fs.mkdirSync(process.env.H12_NAV_CAPTURE,{recursive:true});await page.screenshot({path:path.join(process.env.H12_NAV_CAPTURE,`step-${n}-${mode}-${width}.png`)});}
  }
 }
 expect(await page.evaluate(()=>localStorage.getItem('scene-test-draft'))).toBeNull();
 await context.close();
});
test('five static scenes share support and body position in both modes at mobile, tablet and desktop widths',async({page})=>{
 test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
 const measures=[];
 for(const mode of ['light','dark'])for(const width of [320,390,900,1280]){
  await page.setViewportSize({width,height:1000});await page.getByRole('button',{name:'Cambiar apariencia',exact:true}).click();await page.getByRole('menuitemradio',{name:mode==='light'?'Claro':'Oscuro',exact:true}).click();
  await page.mouse.move(2,2);await page.locator('.draft-journey').evaluate(e=>e.open=false);
  let baseline;
  for(let index=0;index<5;index++){
   await choose(page,index);await page.evaluate(()=>document.querySelector('#main').scrollTo(0,0));
   const m=await page.locator('.don-scene-heading').evaluate(e=>{const r=e.getBoundingClientRect(),a=e.querySelector('.don-scene-art').getBoundingClientRect(),t=e.querySelector('#draft-title').getBoundingClientRect(),f=document.querySelector('[name=name]').getBoundingClientRect();return {height:r.height,artHeight:a.height,fieldY:f.top,overflow:document.documentElement.scrollWidth>innerWidth||document.querySelector('#main').scrollWidth>document.querySelector('#main').clientWidth,collision:a.left<t.right&&a.right>t.left&&a.top<t.bottom&&a.bottom>t.top,events:getComputedStyle(e.querySelector('.don-scene-art')).pointerEvents};});
   expect(m.overflow).toBe(false);expect(m.collision).toBe(false);expect(m.events).toBe('none');if(baseline===undefined)baseline=m.fieldY;expect(m.fieldY).toBe(baseline);expect(m.artHeight).toBeLessThanOrEqual(184);
   measures.push({mode,width,scene:ids[index],...m});
   await expect(page.locator('.draft-journey button')).toHaveCount(5);await expect(page.locator('.don-actor')).toHaveCount(0);
   if(process.env.H12_SCENES_CAPTURE){fs.mkdirSync(process.env.H12_SCENES_CAPTURE,{recursive:true});await page.screenshot({path:path.join(process.env.H12_SCENES_CAPTURE,`${ids[index]}-${mode}-${width}.png`)});}
  }
 }
 if(process.env.H12_SCENES_CAPTURE)fs.writeFileSync(path.join(process.env.H12_SCENES_CAPTURE,'geometry.json'),JSON.stringify(measures,null,2));expect(errors).toEqual([]);
});
test('scene changes, hide, keyboard and reload preserve exact saved text, checkbox context and focus',async({page})=>{
 await boot(page);await page.locator('[name=name]').fill('  Marca con respuestas previas  ');await page.locator('[name=q_offerTypes_service]').check();await page.locator('[name=qnote_offerTypes_service]').fill('  Texto con contexto\ny espacios.  ');await page.locator('[name=q_offerTypes_service]').uncheck();
 await page.locator('.don-scene-controls summary').click();await page.locator('[data-scene-index="4"]').focus();await page.keyboard.press('Enter');await expect(page.locator('[data-scene-index="4"]')).toBeFocused();
 await expect(page.locator('[name=name]')).toHaveValue('  Marca con respuestas previas  ');await expect(page.locator('[name=qnote_offerTypes_service]')).toHaveValue('  Texto con contexto\ny espacios.  ');
 await page.locator('[data-scene-hide]').click();await expect(page.locator('.don-scene-art')).toBeHidden();await expect(page.locator('#draft-title')).toBeVisible();await page.locator('[data-scene-hide]').click();await expect(page.locator('.don-scene-art')).toBeVisible();
 await page.locator('#draft-save').click();await expect(page.locator('#draft-status')).toContainText('Borrador guardado');await page.reload();await activate(page);await expect(page.locator('[name=name]')).toHaveValue('  Marca con respuestas previas  ');await expect(page.locator('[name=qnote_offerTypes_service]')).toHaveValue('  Texto con contexto\ny espacios.  ');await expect(page.locator('[name=q_offerTypes_service]')).not.toBeChecked();
 await page.locator('header .draft-actions [data-stage=panel]').click();await page.locator('.draft-card[data-section=negocio]').click();await expect(page.locator('[name=name]')).toHaveValue('  Marca con respuestas previas  ');
});
test('touch, reduced motion, long title and missing image retain controls and usable form',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});const page=await context.newPage();await boot(page);await page.locator('.don-scene-controls summary').tap();await page.locator('[data-scene-index="2"]').tap();await expect(page.locator('.don-scene-art')).toHaveAttribute('data-scene','mirror');await page.locator('.don-scene-controls summary').tap();
 await page.locator('#draft-title').evaluate(e=>{e.textContent='Una marca con un nombre extraordinariamente largo que necesita conservar toda su información';DVDonScenes.mount(document.querySelector('.draft-welcome').parentElement);});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth)).toBe(true);
 expect(await page.locator('.don-scene-art img').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 await page.route('**/brand/el-don-scene-car-v2.png',r=>r.abort());await page.locator('.don-scene-controls summary').tap();await page.locator('[data-scene-index="4"]').tap();await expect(page.locator('.don-scene-art img')).toBeHidden();await page.locator('[name=name]').fill('Sigue funcionando');await page.locator('#draft-save').tap();await expect(page.locator('#draft-status')).toContainText('Borrador guardado');await context.close();
});
test('study is opt-in and does not load scene images on normal portal route',async({page})=>{const resources=[];page.on('request',r=>resources.push(r.url()));await boot(page,'');await expect(page.locator('.don-scene-controls')).toHaveCount(0);expect(resources.some(r=>r.includes('brand/el-don-scene-'))).toBe(false);});
test('panel and long headings retain card access without overlapping text or scene',async({page})=>{
 await boot(page);await page.locator('header .draft-actions [data-stage=panel]').click();
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:1000});await page.mouse.move(2,2);await page.locator('.draft-journey').evaluate(e=>e.open=false);
  await choose(page,4);await page.evaluate(()=>document.querySelector('#main').scrollTo(0,0));
  const overlap=await page.locator('.don-scene-art').evaluate(e=>{const a=e.getBoundingClientRect();return [...document.querySelectorAll('.draft-card-title,.draft-card-cta,.don-scene-copy')].some(t=>{const r=t.getBoundingClientRect();return a.left<r.right&&a.right>r.left&&a.top<r.bottom&&a.bottom>r.top;});});expect(overlap).toBe(false);
  if(process.env.H12_SCENES_CAPTURE)await page.screenshot({path:path.join(process.env.H12_SCENES_CAPTURE,`panel-${width}.png`)});
  await page.locator('#draft-title').evaluate(e=>{e.textContent='Tu marca con un nombre largo y toda la información que quieres conservar';DVDonScenes.mount(document.querySelector('.draft-welcome').parentElement);});
  if(width<560)expect(await page.locator('#draft-title').evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThan(200);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth)).toBe(true);
  if(process.env.H12_SCENES_CAPTURE)await page.screenshot({path:path.join(process.env.H12_SCENES_CAPTURE,`long-title-${width}.png`)});
  await page.locator('.draft-card[data-section=negocio]').click();await expect(page.locator('[name=name]')).toBeEnabled();await page.locator('header .draft-actions [data-stage=panel]').click();
 }
});
