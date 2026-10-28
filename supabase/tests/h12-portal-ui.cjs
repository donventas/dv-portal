'use strict';
// Real local Auth + existing synthetic accounts. No save/send/publish/assign calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test'),L=require('./h12-workflow-local.cjs');
assert.ok(process.argv.includes('--authorized-local-h12'));
const evidence=path.resolve(L.root,'../evidence/h12-scope/portal-ui-20261026');fs.mkdirSync(evidence,{recursive:true});
async function run(){
 const users=JSON.parse(fs.readFileSync(path.join(L.dir,'workflow-users.json'))),origin='http://127.0.0.1:55464',checks=[],errors=[];
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 for(const role of ['owner','publisher','collab']){
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(role+': '+e.message));
  page.on('console',m=>{if(m.text().includes('LOCAL_REVIEW_'))console.log(m.text());});
  page.on('response',async r=>{if(r.url().includes('/auth/v1/')&&r.status()>=400){const d=await r.json().catch(()=>({}));console.log(JSON.stringify({authStatus:r.status(),code:d.error_code||d.code,message:d.msg||d.message||d.error_description}));}});
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/?scenes=1');await page.locator('#labEmail').fill(users[role].email);await page.locator('#labPassword').fill(users[role].credential);await page.getByRole('button',{name:'Entrar al portal',exact:true}).click();
  await expect(page.locator('#app')).toHaveClass(/on/).catch(async e=>{console.log(JSON.stringify({role,status:await page.locator('#labStatus').textContent(),errors,hydrate:await page.evaluate(async()=>{try{await DVSupa.hydrate();return 'OK';}catch(e){return e.message;}})}));throw e;});
  const saved=role==='owner'?await page.evaluate(async()=>JSON.stringify(await DVDrafts.open())):null;
  if(role==='owner'){
   await expect(page.locator('#draft-save')).toBeEnabled();await expect(page.locator('.draft-step-hint')).toHaveCount(5);
   await page.locator('.draft-journey [data-journey-step="5"]').click();
  }else{await expect(page.locator('[data-native-workflow]')).toBeVisible();assert.equal(await page.locator('#draft-save').count(),0);}
  await page.locator(`[data-open="${users.requestId}"]`).click();await page.locator('[data-message-send]').waitFor();
  await page.getByText('Contexto compartido',{exact:true}).click();
  if(role==='publisher'){await expect(page.locator('[data-manage]')).toBeVisible();await page.getByText('Análisis interno · Listo para revisar',{exact:true}).click();await page.getByText('Preparar devolución al cliente',{exact:true}).click();await expect(page.locator('[data-approved]')).not.toBeChecked();}
  else{assert.equal(await page.locator('[data-manage]').count(),0);assert.equal(await page.locator('[data-publish]').count(),0);}
  const visible=await page.locator('[data-content]').innerText();assert.ok(!/qnote_|q_needs_|q_offerTypes_|\bcomplete\b|\bcollaboration\b|\brevoked\b/.test(visible));
  if(role==='collab'){assert.ok(visible.includes('Oferta sintética'));assert.ok(!visible.includes('Hipótesis interna'));assert.ok(!visible.includes('Marca de prueba'));}
  await page.locator('[data-buffer]').first().fill('Texto sin enviar · '+role);
  for(const mode of ['light','dark']){
   await page.getByRole('button',{name:'Cambiar apariencia',exact:true}).click();await page.getByRole('menuitemradio',{name:mode==='light'?'Claro':'Oscuro',exact:true}).click();
   for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth+1),role+' '+mode+' '+width+' overflow');
    assert.equal(await page.locator('[data-buffer]').first().inputValue(),'Texto sin enviar · '+role);
    if([390,1280].includes(width)){
     await page.locator('#main').evaluate(el=>el.scrollTop=0);
     await page.screenshot({path:path.join(evidence,role+'-'+mode+'-'+width+'.png')});
    }
   }
  }
  const icon=page.getByRole('button',{name:'Notificaciones',exact:true});await icon.hover();await expect(page.locator('#dv-control-help')).toBeVisible();await expect(icon).not.toHaveAttribute('title');
  await page.mouse.move(0,0);await icon.focus();await expect(page.locator('#dv-control-help')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#dv-control-help')).toBeHidden();
  await icon.click();await expect(page.locator('#notiPop')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#notiPop')).not.toBeVisible();
  await page.getByRole('button',{name:'Volver a la bandeja',exact:true}).click();await page.locator(`[data-open="${users.requestId}"]`).click();
  await expect(page.locator('[data-buffer]').first()).toHaveValue('Texto sin enviar · '+role);
  if(role==='owner')assert.equal(await page.evaluate(async()=>JSON.stringify(await DVDrafts.open())),saved);
  // Empty composer before logout so no intentionally unsent context is discarded.
  await page.locator('[data-buffer]').first().fill('');await page.getByRole('button',{name:'Salir',exact:true}).click();await page.locator('#labEmail').waitFor();assert.equal(await page.locator('[data-content]').count(),0);
  checks.push(role+': native authenticated shell, role scope, Spanish copy, two themes/4 widths, draft/message preservation, tooltip focus/Escape and logout');await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({status:'PASS',date:new Date().toISOString(),checks,errors,noOperationalWrites:true},null,2));console.log(JSON.stringify({status:'PASS',checks}));
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
