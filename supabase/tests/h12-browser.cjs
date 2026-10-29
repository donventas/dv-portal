'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const {createServer,origin}=require('./h12-server.cjs');
assert.ok(process.argv.includes('--authorized-local-h12'));
const root=path.resolve(__dirname,'../..'),users=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'dv-portal-h12-drafts/browser-users.json')));
const out=path.join(root,'evidence/h12-drafts'),checks=[];let external=0;
function pass(s){checks.push(s);console.log('PASS '+s);}
async function appearance(page,value,touch=false){
 const trigger=page.getByRole('button',{name:'Cambiar apariencia',exact:true});
 const item=page.getByRole('menuitemradio',{name:{light:'Claro',dark:'Oscuro',system:'Según tu dispositivo'}[value],exact:true});
 if(touch){await trigger.tap();await item.tap();}else{await trigger.click();await item.click();}
 await expect(page.locator('html')).toHaveAttribute('data-dv-preference',value);await expect(trigger).toHaveAttribute('aria-expanded','false');
}
async function block(page,id){await page.locator('header .draft-actions [data-stage="panel"]').click();await page.locator('[data-section="'+id+'"]').click();}
async function save(page){await page.locator('#draft-save').click();await expect(page.locator('#draft-status')).toContainText('Borrador guardado');}
async function enter(page,user){
 await page.goto(origin);await page.waitForFunction(()=>window.DVPortal&&window.DVDrafts);
 const result=await page.evaluate(async user=>{
  const c=await DVSupa.client(),r=await c.auth.signInWithPassword({email:user.email,password:user.credential});
  if(r.error)return false;await DVSupa.hydrate();DVStore.loginAs(DV_SEED.users[0]);DVPortal.boot();return true;
 },{email:user.email,credential:user.credential});assert.equal(result,true);
 await expect(page.locator('#draft-status')).toContainText(/recuperado|Todavía no hay/);
}
(async()=>{
 const server=createServer(users.anon);await new Promise((r,j)=>server.once('error',j).listen(55464,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.H10_BROWSER_PATH});
  async function context(options={}){const c=await browser.newContext(options);await c.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external++;return route.abort();});return c;}
  const ctx=await context(),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await enter(page,users.owner);
  await block(page,'negocio');await expect(page.locator('[data-selector="actor"]')).toHaveCount(0);
  await page.locator('[name="name"]').fill('Borrador del navegador');
  await page.locator('[name="q_offerTypes_product"]').check();await page.locator('[name="qnote_offerTypes_product"]').fill('Se conserva al desmarcar');await page.locator('[name="q_offerTypes_product"]').uncheck();
  await page.locator('[data-save-to="objetivo"]').click();await expect(page.locator('#draft-status')).toContainText('Borrador guardado');await expect(page.locator('#draft-title')).toHaveText('Tu objetivo');
  const text='  Contexto sintético H1.2\ncon segunda línea · '+Date.now()+'  ';
  await page.locator('[name="q_needs_launch"]').check();await page.locator('[name="qnote_needs_launch"]').fill(text);
  await expect(page.locator('#appearanceBar')).toHaveCount(0);await expect(page.locator('#topBar > #appearancePicker')).toHaveCount(1);
  const note=page.locator('[name="qnote_needs_launch"]'),noteNode=await note.elementHandle();
  for(const theme of ['light','dark'])for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await note.evaluate(el=>el.setSelectionRange(2,10));
   await page.locator('#main').evaluate(el=>{el.scrollTop=300;});const scroll=await page.locator('#main').evaluate(el=>el.scrollTop);assert.ok(scroll>0);
   await appearance(page,theme);assert.equal(await page.locator('#main').evaluate(el=>el.scrollTop),scroll);assert.equal(await noteNode.evaluate(el=>el.isConnected),true);
   assert.deepEqual(await note.evaluate(el=>[el.selectionStart,el.selectionEnd]),[2,10]);await expect(note).toHaveValue(text);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width!==320){await page.locator('#main').evaluate(el=>{el.scrollTop=0;});await page.screenshot({path:path.join(out,'form-'+theme+'-'+width+'.png')});}
  }
  await appearance(page,'system');for(const mode of ['dark','light']){await page.emulateMedia({colorScheme:mode});await expect(page.locator('html')).toHaveAttribute('data-dv-appearance',mode);await expect(note).toHaveValue(text);}await noteNode.dispose();
  await page.locator('[name="q_needs_launch"]').focus();await page.keyboard.press('Space');await expect(page.locator('[name="q_needs_launch"]')).not.toBeChecked();await page.keyboard.press('Space');
  pass('One block at a time; light/dark/system at 320/390/1280 preserve unsaved text, selection, DOM and scroll; keyboard/reduced-motion pass');
  const beforeSkip=await page.evaluate(async()=>(await DVDrafts.open()).version);await page.locator('#draft-skip').click();
  await expect(page.locator('#draft-title')).toHaveText('Tu marca, a tu ritmo.');await expect(page.locator('#draft-exit-offer')).toBeVisible();
  assert.equal(await page.evaluate(async()=>(await DVDrafts.open()).version),beforeSkip);
  await expect(page.locator('.draft-panel .draft-card').filter({hasText:'Tu objetivo'})).toContainText('Cambios sin guardar');
  await page.locator('#draft-dismiss-exit').click();await page.locator('[data-section="objetivo"]').click();await expect(page.locator('[name="qnote_needs_launch"]')).toHaveValue(text);
  await page.locator('#draft-body [data-save-to="panel"]').click();await expect(page.locator('#draft-status')).toContainText('Borrador guardado');await expect(page.locator('#draft-title')).toHaveText('Tu marca, a tu ritmo.');
  await expect(page.locator('.draft-panel .draft-card').filter({hasText:'Tu objetivo'})).toContainText('Con información guardada');
  for(const theme of ['light','dark'])for(const width of [390,1280]){await page.setViewportSize({width,height:900});await appearance(page,theme);await page.screenshot({path:path.join(out,'panel-'+theme+'-'+width+'.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  const second=await ctx.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(origin);await expect(second.locator('#draft-status')).toContainText('recuperado');await expect(second.locator('#draft-title')).toHaveText('Tu marca, a tu ritmo.');
  await block(second,'negocio');await expect(second.locator('[name="name"]')).toHaveValue('Borrador del navegador');await expect(second.locator('[name="q_offerTypes_product"]')).not.toBeChecked();await second.locator('[name="q_offerTypes_product"]').check();await expect(second.locator('[name="qnote_offerTypes_product"]')).toHaveValue('Se conserva al desmarcar');
  await block(second,'objetivo');await expect(second.locator('[name="qnote_needs_launch"]')).toHaveValue(text);
  pass('Omit does not save or block; panel preserves local input, save-and-exit restores exact partial responses and deselected notes in another tab');
  await block(page,'identidad');await page.locator('[name="brand_status"]').selectOption('none');await page.getByText('Colores y tipografías · opcional',{exact:true}).click();await page.locator('[data-color-for="brand_secondary"]').fill('#aabbcc');await expect(page.locator('[name="brand_secondary"]')).toHaveValue('#aabbcc');await page.locator('[name="brand_primary"]').fill('  #224466  ');await expect(page.locator('[data-color-for="brand_primary"]')).toHaveValue('#224466');
  await page.getByText('Logos y manual · opcional',{exact:true}).click();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYo0AAAAASUVORK5CYII=','base64');
  const assetPattern='**/rest/v1/rpc/portal_draft_asset_put_v1';let droppedAsset=false;
  await page.route(assetPattern,async route=>{if(droppedAsset)return route.continue();droppedAsset=true;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');});
  const assetsBefore=await page.evaluate(async()=>(await DVDrafts.open()).assets.length);
  await page.locator('[data-asset-slot="brand_logo"]').setInputFiles({name:'Synthetic logo.png',mimeType:'image/png',buffer:png});await expect(page.locator('#draft-status')).toContainText('No pudimos confirmar la subida');
  await page.locator('#draft-skip').click();await expect(page.locator('#draft-title')).toHaveText('Tu marca, a tu ritmo.');await page.locator('#draft-upload-retry').click();await expect(page.locator('#draft-status')).toContainText('Archivo subido');await page.unroute(assetPattern);
  assert.equal(await page.evaluate(async()=>(await DVDrafts.open()).assets.length),assetsBefore+1);
  await block(page,'identidad');await page.getByText('Logos y manual · opcional',{exact:true}).click();await page.locator('[data-asset-read="brand_logo"]').click();await expect(page.locator('[data-preview="brand_logo"] img')).toBeVisible();await expect.poll(()=>page.locator('[data-preview="brand_logo"] img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await page.locator('[data-asset-slot="brand_manual"]').setInputFiles({name:'Manual sintético.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nSynthetic inert download fixture\n%%EOF')});await expect(page.locator('#draft-status')).toContainText('Archivo subido');
  await page.locator('#draft-body [data-save-to="panel"]').click();await expect(page.locator('#draft-status')).toContainText('Borrador guardado');
  await page.reload();await expect(page.locator('#draft-status')).toContainText('recuperado');await block(page,'identidad');await expect(page.locator('[name="brand_status"]')).toHaveValue('none');await page.getByText('Colores y tipografías · opcional',{exact:true}).click();await expect(page.locator('[name="brand_primary"]')).toHaveValue('  #224466  ');await expect(page.locator('[data-color-for="brand_primary"]')).toHaveValue('#224466');
  await page.getByText('Logos y manual · opcional',{exact:true}).click();await expect(page.locator('[data-asset-read="brand_logo"]')).toBeVisible();
  for(const mode of ['light','dark']){await page.setViewportSize({width:390,height:900});await appearance(page,mode);await page.locator('[data-asset-read="brand_logo"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'kit-'+mode+'-390.png')});await page.locator('[name="brand_primary"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'colors-'+mode+'-390.png')});}await page.setViewportSize({width:1280,height:900});
  const download=page.waitForEvent('download');await page.locator('[data-asset-read="brand_manual"]').click();assert.match((await download).suggestedFilename(),/^manual-[0-9a-f-]+\.pdf$/);
  await page.locator('[data-asset-remove="brand_logo"]').click();await save(page);await page.reload();await expect(page.locator('#draft-status')).toContainText('recuperado');await block(page,'identidad');await page.getByText('Logos y manual · opcional',{exact:true}).click();await expect(page.locator('[data-asset-read="brand_logo"]')).toHaveCount(0);
  pass('Optional identity and private files survive reload; ambiguous upload retries exactly once; manual downloads and logo detach persists without changing saved revisions');
  await block(page,'negocio');await page.locator('[name="name"]').fill('Ganador de concurrencia');await save(page);
  await block(second,'negocio');await second.locator('[name="name"]').fill('Edición local en conflicto');await second.locator('#draft-save').click();await expect(second.locator('#draft-status')).toContainText('versión más reciente');await expect(second.locator('[name="name"]')).toHaveValue('Edición local en conflicto');
  await second.getByText('Versiones y recuperación',{exact:true}).click();await second.locator('#draft-load').click();await expect(second.locator('[name="name"]')).toHaveValue('Ganador de concurrencia');
  pass('Concurrent tabs report real database conflict and retain local input; explicit reload adopts server version');
  let dropped=false,committed,releaseResponse;const routePattern='**/rest/v1/rpc/portal_draft_save_v1';const committedResponse=new Promise(resolve=>{committed=resolve;}),responseGate=new Promise(resolve=>{releaseResponse=resolve;});
  await page.route(routePattern,async route=>{if(dropped)return route.continue();dropped=true;const response=await route.fetch();assert.equal(response.status(),200);committed();await responseGate;await route.abort('failed');});
  const before=await page.evaluate(async()=>(await DVDrafts.open()).version);await page.locator('[name="name"]').fill('Guardado con respuesta perdida');await page.locator('[data-save-to="objetivo"]').click();
  await Promise.race([committedResponse,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('LOCAL_COMMIT_TIMEOUT')),15000);timer.unref();})]);
  try{await expect(page.locator('#draft-save')).toBeDisabled();await appearance(page,'dark');await appearance(page,'light');await expect(page.locator('[name="name"]')).toHaveValue('Guardado con respuesta perdida');await page.locator('#draft-skip').click();await expect(page.locator('#draft-title')).toHaveText('Tu marca, a tu ritmo.');}finally{releaseResponse();}
  await expect(page.locator('#draft-status')).toContainText('No pudimos confirmar');await page.locator('#side [data-nav="draft"]').click();await expect(page.locator('#draft-status')).toContainText('No pudimos confirmar');await page.locator('#draft-save').click();await expect(page.locator('#draft-status')).toContainText('Borrador guardado');await expect(page.locator('#draft-title')).toHaveText('Tu marca, a tu ritmo.');assert.equal(await page.evaluate(async()=>(await DVDrafts.open()).version),before+1);await page.unroute(routePattern);
  await page.getByText('Versiones y recuperación',{exact:true}).click();await page.locator('#draft-history').click();await expect(page.locator('#draft-history-list p')).toHaveCount(20);await page.locator('#side [data-nav="draft"]').click();await expect(page.locator('#draft-history-list p')).toHaveCount(20);await page.locator('#draft-history').click();await expect.poll(()=>page.locator('#draft-history-list p').count()).toBeGreaterThan(20);
  pass('Skip during save remains on panel; lost response retries one unchanged intention and creates exactly one version; bounded history preserved');
  await page.evaluate(()=>DVSupa.signOut());await expect(second.locator('#draft-body')).toHaveCount(0);await expect(page.locator('#draft-body')).toHaveCount(0);
  const fresh=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),third=await fresh.newPage();third.on('pageerror',e=>errors.push(e.message));await enter(third,users.owner);await block(third,'negocio');await expect(third.locator('[name="name"]')).toHaveValue('Guardado con respuesta perdida');
  await block(third,'objetivo');await expect(third.locator('[name="qnote_needs_launch"]')).toHaveValue(text);
  for(const mode of ['dark','light','system']){await appearance(third,mode,true);await expect(third.locator('[name="qnote_needs_launch"]')).toHaveValue(text);}
  const authRoute='**/auth/v1/user';await third.locator('[name="objective"]').fill('Texto durante pérdida de red');await third.route(authRoute,route=>route.abort('failed'));
  await third.locator('#draft-save').click();await expect(third.locator('#draft-status')).toContainText('No pudimos confirmar');await expect(third.locator('[name="objective"]')).toHaveValue('Texto durante pérdida de red');await third.unroute(authRoute);await save(third);
  await third.route(authRoute,route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'bad_jwt',msg:'Synthetic rejected session'})}));
  await third.getByText('Versiones y recuperación',{exact:true}).click();await third.locator('#draft-load').click();await expect(third.locator('#draft-body')).toHaveCount(0);assert.equal(await third.evaluate(()=>DVStore.session()),null);await third.unroute(authRoute);await third.evaluate(async()=>(await DVSupa.client()).auth.signOut());
  await enter(third,users.other);await block(third,'negocio');await expect(third.locator('[name="name"]')).toHaveValue('');const emptyVersion=await third.evaluate(async()=>(await DVDrafts.open()).version);await third.locator('#draft-skip').tap();await expect(third.locator('#draft-title')).toHaveText('Tu marca, a tu ritmo.');assert.equal(await third.evaluate(async()=>(await DVDrafts.open()).version),emptyVersion);await expect(third.locator('.draft-panel .draft-card').filter({hasText:'Tu negocio'})).toContainText('Sin empezar');
  assert.equal(external,0);assert.deepEqual(errors,[]);
  pass('Fresh touch session restores saved answers; Auth transport failure preserves input, authoritative rejection/logout clears DOM; another account can skip an empty welcome without saving');
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({at:new Date().toISOString(),scope:'Actual Portal optional welcome and real local Auth/PostgREST',checks,externalRequests:external,pageErrors:errors},null,2)+'\n');
 }catch(error){console.error('H12_CASE_FAILED: '+error.message);throw error;}
 finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error('H12_BROWSER_FAILED: '+e.message);process.exitCode=1;});
