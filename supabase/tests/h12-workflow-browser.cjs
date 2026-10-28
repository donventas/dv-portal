'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
 const {chromium,expect}=require('@playwright/test'),L=require('./h12-workflow-local.cjs'),{createServer,origin}=require('./h12-workflow-server.cjs');
assert.ok(process.argv.includes('--authorized-local-h12'));
async function run(){
 const users=JSON.parse(fs.readFileSync(path.join(L.dir,'workflow-users.json'))),server=createServer();await new Promise(r=>server.listen(55474,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),checks=[],errors=[];
 async function login(user,width=1280){const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin);await page.locator('[name=email]').fill(user.email);await page.locator('[name=password]').fill(user.credential);await page.locator('#login button').click();await page.locator('[data-refresh]').waitFor();return {page,context};}
 try{
  const c=await login(users.owner),page=c.page;
  await page.locator('[data-prepare]').click();await page.locator('[data-submit]').waitFor();
  await page.locator('[data-submit]').click();await page.getByText('Confirma la versión antes de enviar.',{exact:true}).waitFor();
  await page.locator('[data-consent]').check();await page.locator('[data-submit]').click();await page.locator('[data-message-send]').waitFor();
  await expect(page.locator('[data-retry]')).toBeHidden();
  await page.locator('[data-buffer]').fill('Mensaje exacto\nsegunda línea <script>');await page.locator('[data-message-send]').click();await page.getByText('Mensaje exacto\nsegunda línea <script>',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-buffer]').inputValue(),'');
  assert.equal(await page.locator('[data-manage]').count(),0);assert.equal(await page.locator('[data-publish]').count(),0);
  checks.push('Client confirms submission; persistent message renders as text, internal controls absent');
  // Preserve pending text through theme changes and navigation, without sending it.
  await page.locator('[data-buffer]').fill('Texto todavía no enviado');
  await page.locator('[data-dv-appearance-control]').selectOption('dark');assert.equal(await page.locator('[data-buffer]').inputValue(),'Texto todavía no enviado');
  await page.locator('[data-refresh]').click();await page.locator('[data-open]').first().waitFor();
  for(const mode of ['light','dark'])for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});await page.locator('[data-dv-appearance-control]').selectOption(mode);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(L.root,`evidence/h12-workflow/client-${mode}-${width}.png`),fullPage:true});
  }
  checks.push('Light/dark 1280/390 without horizontal overflow; theme preserves unsent text');
  await page.locator('#logout').click();await page.locator('#login').waitFor();assert.equal(await page.locator('#workflow').textContent(),'');await c.context.close();
  const team=await login(users.publisher);await team.page.locator(`[data-open="${users.requestId}"]`).click();await team.page.locator('[data-manage]').waitFor();
  await team.page.getByText(/Preparar devolución al cliente/).click();await team.page.locator('[data-buffer$=":return"]').fill('Devolución desde la UI de prueba');
  await team.page.locator('[data-publish]').click();await team.page.getByText('Revisa y aprueba la devolución antes de publicarla.',{exact:true}).waitFor();
  await team.page.locator('[data-approved]').check();await team.page.locator('[data-publish]').click();await team.page.getByText('Devolución desde la UI de prueba',{exact:true}).waitFor();
  await team.page.locator('[data-dv-appearance-control]').selectOption('dark');await team.page.screenshot({path:path.join(L.root,'evidence/h12-workflow/team-dark-1280.png'),fullPage:true});
  await team.page.setViewportSize({width:390,height:900});await team.page.locator('[data-dv-appearance-control]').selectOption('light');assert.ok(await team.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await team.page.screenshot({path:path.join(L.root,'evidence/h12-workflow/team-light-390.png'),fullPage:true});
  checks.push('Team reads internal analysis; UI publication requires explicit approval');await team.context.close();
  const col=await login(users.collab,390);await col.page.locator(`[data-assignment="${users.assignmentId}"][data-open]`).click();await col.page.locator('[data-message-send]').waitFor();assert.equal(await col.page.locator('[data-publish]').count(),0);assert.equal(await col.page.locator('[data-manage]').count(),0);
  await col.page.screenshot({path:path.join(L.root,'evidence/h12-workflow/collaborator-light-390.png'),fullPage:true});checks.push('Accepted collaborator accesses restricted assignment conversation');await col.context.close();
  const nativeContext=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'}),native=await nativeContext.newPage();
  await native.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:55464'?r.continue():r.abort());
  await native.goto('http://127.0.0.1:55464/?scenes=1&revision=workflow');await native.waitForFunction(()=>window.DVSupa&&window.DVPortal);
  assert.equal(await native.evaluate(async u=>{const c=await DVSupa.client(),r=await c.auth.signInWithPassword({email:u.email,password:u.credential});if(r.error)return false;await DVSupa.hydrate();DVStore.loginAs(DV_SEED.users[0]);DVPortal.boot();return true;},users.owner),true);
  await expect(native.locator('#draft-save')).toBeEnabled();const before=await native.evaluate(async()=>JSON.stringify(await DVDrafts.open()));
  await native.locator('.draft-journey').evaluate(e=>e.open=true);await native.locator('.draft-journey [data-journey-step="5"]').click();
  await native.locator(`[data-open="${users.requestId}"]`).click();await native.locator('[data-message-send]').waitFor();
  const message='Reintento nativo '+Date.now();await native.locator('[data-buffer]').fill(message);
  let lost=false;await native.route('**/rest/v1/rpc/portal_workflow_v1',async route=>{const body=route.request().postDataJSON();if(body.p_action==='message'&&!lost){lost=true;await route.fetch();return route.abort('failed');}return route.continue();});
  await native.locator('[data-message-send]').click();await expect(native.locator('[data-retry]')).toBeVisible();assert.equal(await native.locator('[data-buffer]').inputValue(),message);
  await native.locator('[data-retry]').click();await expect(native.locator('[data-retry]')).toBeHidden();await expect(native.getByText(message,{exact:true})).toHaveCount(1);
  assert.equal(await native.evaluate(async()=>JSON.stringify(await DVDrafts.open())),before);
  await native.evaluate(()=>DVAppearance.setPreference('light'));await native.screenshot({path:path.join(L.root,'evidence/h12-workflow/portal-native-light-390.png'),fullPage:true});
  await nativeContext.close();checks.push('Native step 5 uses central guard; lost response retries without duplicate and leaves saved draft unchanged');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(L.root,'evidence/h12-workflow/browser-results.json'),JSON.stringify({status:'PASS',date:new Date().toISOString(),checks,consoleErrors:errors},null,2));console.log(JSON.stringify({status:'PASS',checks}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
