const {test,expect}=require('@playwright/test');
const path=require('node:path');
async function demo(page){
 await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:8002'?r.continue():r.fulfill({contentType:'text/css',body:''}));
 await page.addInitScript(()=>{
  window.DV_PORTAL_RELEASE_CONFIG={schemaVersion:'CONFIG_SCHEMA_V1',configVersion:'H11_BROWSER',environmentId:'H11_BROWSER',declaredMode:'DEMO',backendId:'',backendClass:'none',allowlistVersion:'LOCAL_TEST',issuedAt:'2026-01-01T00:00:00Z',expiresAt:'2031-01-01T00:00:00Z',buildCommit:'TEST',publicClient:{endpoint:'',publicKey:''}};
  window.DV_PORTAL_RELEASE_BINDING={origins:[location.origin],backendIds:[],observedBackendId:'',bindingCount:1,localHosts:['127.0.0.1']};
 });
 await page.goto('/');await page.waitForFunction(()=>window.DVPortal&&window.DVHybridDemo);
 await page.evaluate(()=>{DVStore.loginAs(DV_SEED.users.find(u=>u.role==='cliente'));DVPortal.boot();DVPortal.go('hybrid');});
}
const act=(page,name)=>page.locator('[data-action="'+name+'"]').click();
const tab=(page,name)=>page.locator('[data-tab="'+name+'"]').click();
test('current brand assets load across shell, member view and access',async({page})=>{
 await demo(page);await page.evaluate(()=>document.fonts.ready);
 await expect(page.locator('.brand-wordmark')).toHaveAttribute('src','brand/donventas-wordmark-b6-reverse.svg');
 expect(await page.locator('.brand-wordmark').evaluate(img=>img.complete&&img.naturalWidth>0&&Math.abs(img.width/img.height-210/130)<.04)).toBeTruthy();
 for(const font of ['Schibsted Grotesk','Space Mono'])expect(await page.evaluate(f=>[...document.fonts].some(x=>x.family.includes(f)&&x.status==='loaded'),font)).toBeTruthy();
 await page.evaluate(()=>DVPortal.go('miembros'));
 await expect(page.locator('[data-nav="miembros"] .icon-active')).toHaveAttribute('href','brand/don-ventas-icons-sprite.svg#dv-users-p');
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  if(process.env.H11_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.H11_CAPTURE_DIR,'members-'+width+'.png')});
 }
 await page.evaluate(()=>DVPortal.logout());await expect(page.locator('.acard .mk')).toHaveAttribute('src','brand/donventas-symbol-bs-reverse.svg');
 expect(await page.locator('.acard .mk').evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();
 if(process.env.H11_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.H11_CAPTURE_DIR,'access-1280.png')});
});
async function select(page,kind,value){const details=page.locator('.hy-simulation');if(!await details.evaluate(el=>el.open))await details.locator('summary').click();await page.locator('[data-selector="'+kind+'"]').selectOption(value);}
test('five surfaces complete a versioned journey and preserve failed draft',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await demo(page);
 await page.locator('[name="offer"]').fill('Taller sintético de prueba');await page.locator('#hy-fail').check();await act(page,'context');
 await expect(page.locator('#hy-message')).toContainText('Fallo simulado');await expect(page.locator('[name="offer"]')).toHaveValue('Taller sintético de prueba');
 await act(page,'context');await expect(page.locator('.hy-body')).toContainText('Versión 1');
 await tab(page,'ficha');await act(page,'artifact');await page.locator('[name="headline"]').fill('Una segunda versión');await act(page,'artifact');
 await expect(page.locator('.hy-compare')).toContainText('Ficha v2');
 await tab(page,'ayuda');await page.locator('[name="brief"]').fill('Necesito revisión de la ficha');
 await page.locator('[name="feedback"]').fill('Aclarar la oferta');await page.locator('[name="consent"]').check();await act(page,'feedback');
 await expect(page.locator('[name="brief"]')).toHaveValue('Necesito revisión de la ficha');await act(page,'request');
 await select(page,'actor','especialista');await page.locator('[name="proposal"]').fill('Revisar titular y condiciones');await act(page,'proposal');
 await select(page,'actor','cliente');await act(page,'acceptScope');
 await select(page,'actor','especialista');await act(page,'start');await page.locator('[name="delivery"]').fill('Entrega sintética final');await act(page,'deliver');
 await select(page,'actor','cliente');await act(page,'acceptDelivery');
 await expect(page.locator('.hy-status')).toHaveText('entrega aprobada');await expect(page.locator('.hy-body')).toContainText('Publicación: no autorizada');
 for(const width of [320,390,768,805,980,1280]){await page.setViewportSize({width,height:900});await page.evaluate(()=>document.getElementById('main').scrollTop=0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(await page.locator('#topBar').evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(68);if(process.env.H11_CAPTURE_DIR&&[390,1280].includes(width))await page.screenshot({path:path.join(process.env.H11_CAPTURE_DIR,'demo-'+width+'.png'),fullPage:true});}
 await select(page,'actor','admin');await select(page,'workspace','b');await expect(page.locator('.hy-body')).toContainText('Crea una solicitud');
 await select(page,'actor','especialista');await expect(page.locator('[data-selector="workspace"]')).toHaveValue('a');
 await page.reload();await page.waitForFunction(()=>window.DVPortal&&window.DVHybridDemo);await page.evaluate(()=>{DVPortal.boot();DVPortal.go('hybrid');});
 await tab(page,'bandeja');await expect(page.locator('.hy-status')).toHaveText('entrega aprobada');
 await page.evaluate(()=>DVPortal.logout());await expect(page.locator('#viewHost')).toBeEmpty();
 expect(errors).toEqual([]);
});
test('analyst name cannot execute HTML or break admin with null',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await demo(page);
 await page.evaluate(()=>{DV_SEED.users.filter(u=>u.role==='analista').forEach(u=>u.name='<svg/onload=window.__xss=1>');DVStore.loginAs(DV_SEED.users.find(u=>u.role==='admin'));DVPortal.boot();});
 for(const route of ['cuentas','cola','accesos']){await page.evaluate(v=>DVPortal.go(v),route);expect(await page.evaluate(()=>window.__xss)).toBeUndefined();expect(await page.locator('#viewHost svg[onload]').count()).toBe(0);}
 await page.evaluate(()=>{DV_SEED.users.filter(u=>u.role==='analista').forEach(u=>u.name=null);DVPortal.go('cuentas');});expect(errors).toEqual([]);
});


test('guided selections preserve prose and only confirm active answers',async({page})=>{
 if(process.env.H11_CAPTURE_DIR)test.setTimeout(90000); // Ten viewport samples plus local PNG export.
 await demo(page);
 const choice=page.locator('[name="q_needs_launch"]'),note=page.locator('[name="qnote_needs_launch"]');
 await choice.focus();await page.keyboard.press('Space');await expect(note).toBeVisible();
 await note.fill('Lanzar un taller para personas que nunca han modelado.');
 await page.locator('[name="q_offerTypes_other"]').check();await page.locator('[name="qnote_offerTypes_other"]').fill('<img src=x onerror=window.__formXss=1>');
 await page.locator('[name="q_needs_connect"]').check();await page.locator('[name="qnote_needs_connect"]').fill('Contexto temporal que no se confirmará.');
 await page.locator('[name="q_needs_connect"]').uncheck();
 await choice.uncheck();await expect(note).toBeHidden();await choice.check();await expect(note).toHaveValue('Lanzar un taller para personas que nunca han modelado.');
 await page.getByText('Lo que sabes de tus clientes',{exact:true}).click();
 await page.locator('[name="it_language"]').fill('«¿Necesito experiencia?» — ejemplo sintético');
 await page.locator('[name="ib_language"]').selectOption('observed');await page.locator('[name="is_language"]').fill('Conversación ficticia, octubre');
 await tab(page,'contexto');await tab(page,'marca');await expect(note).toHaveValue('Lanzar un taller para personas que nunca han modelado.');
 await page.locator('#hy-fail').check();await act(page,'context');await expect(note).toHaveValue('Lanzar un taller para personas que nunca han modelado.');
 await act(page,'context');await expect(page.locator('.hy-body')).toContainText('Lanzar un taller');await expect(page.locator('.hy-body')).not.toContainText('Contexto temporal');
 await expect(page.locator('.hy-body')).toContainText('Lo he observado · declaración del cliente');
 await expect(page.locator('.hy-body')).toContainText('Conversación ficticia, octubre');
 await expect(page.locator('.hy-body')).toContainText('<img src=x onerror=window.__formXss=1>');expect(await page.evaluate(()=>window.__formXss)).toBeUndefined();
 await tab(page,'marca');await page.locator('[name="q_needs_connect"]').check();await expect(page.locator('[name="qnote_needs_connect"]')).toHaveValue('Contexto temporal que no se confirmará.');
 for(const width of [320,390,640,768,805,890,980,981,1024,1280]){
  await page.setViewportSize({width,height:900});await page.evaluate(()=>document.getElementById('main').scrollTop=0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  expect(await page.locator('.hy-body').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(Math.min(width-50,600));
  if(width<=980)await expect(page.locator('#side')).toBeHidden();else await expect(page.locator('#side')).toBeVisible();
  expect(await page.locator('.top .ctx').evaluate(el=>el.getBoundingClientRect().bottom<=document.getElementById('topBar').getBoundingClientRect().bottom)).toBeTruthy();
  if(width===390){await page.locator('#mobileNavToggle').click();await expect(page.locator('#side')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#side')).toBeHidden();}
  if(process.env.H11_CAPTURE_DIR&&[390,1280].includes(width))await page.screenshot({path:path.join(process.env.H11_CAPTURE_DIR,'form-'+width+'.png'),fullPage:true});
  if(width===890){
   const labels=page.locator('.hy-question').nth(1).locator('.hy-choice');
   expect(await labels.evaluateAll(els=>Math.max(...els.map(x=>x.getBoundingClientRect().height))-Math.min(...els.map(x=>x.getBoundingClientRect().height)))).toBeLessThan(1);
   // Security payload already verified above; use legible synthetic copy for review captures.
   await page.locator('[name="qnote_offerTypes_other"]').fill('Talleres de cerámica para principiantes. Grupos pequeños y materiales incluidos.');
   await page.locator('.hy-question').nth(1).scrollIntoViewIfNeeded();
   if(process.env.H11_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.H11_CAPTURE_DIR,'responsive-890.png')});
  }
 }
 expect(await page.evaluate(()=>document.fonts.check('17px "Schibsted Grotesk"'))).toBeTruthy();
 await page.locator('[name="q_needs_launch"]').scrollIntoViewIfNeeded();
 if(process.env.H11_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.H11_CAPTURE_DIR,'form-options.png')});
});
