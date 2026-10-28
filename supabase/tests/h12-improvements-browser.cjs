'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test'),L=require('./h12-workflow-local.cjs');
assert.ok(process.argv.includes('--authorized-local-h12'));
const origin='http://127.0.0.1:55464',out=path.resolve(L.root,'../evidence/h12-scope/connected-improvements-20261026');
const act=(p,x)=>p.locator('[data-improvement-action="'+x+'"]').first();
async function run(){
 const users=JSON.parse(fs.readFileSync(path.join(L.dir,'workflow-users.json'))),checks=[],errors=[],ids=[];
 const browser=await chromium.launch({executablePath:process.env.H12_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows']});
 async function session(who){const context=await browser.newContext({viewport:{width:1280,height:950},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.text().includes('LOCAL_REVIEW')||m.text().includes('IMPROVEMENT_RESET'))console.log('CONSOLE '+m.text().slice(0,300));});await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());console.log('OPEN '+who);await page.goto(origin+'/?experience=requests');await page.locator('#labEmail').fill(users[who].email);await page.locator('#labPassword').fill(users[who].credential);await page.getByRole('button',{name:'Entrar al portal',exact:true}).click();await expect(page.locator('#app')).toHaveClass(/on/);console.log('SIGNED IN '+who);return {context,page};}
 async function choose(p,category='web'){await p.bringToFront();await act(p,'catalog').click();await expect(p.locator('.improvement-card')).toHaveCount(6);await p.locator('[data-improvement-category="'+category+'"]').click();await expect(p.locator('[data-improvement-need]')).toBeVisible();}
 try{
  const client=await session('owner'),team=await session('publisher'),p=client.page,t=team.page;
  await expect(p.locator('[data-role]')).toHaveCount(0);console.log('CHOOSE');await choose(p);console.log('DETAIL');await p.locator('[data-improvement-need]').fill('Necesito una página para explicar los servicios de mi marca.');
  console.log('RELOAD DRAFT');await p.reload();console.log('RELOADED');await p.locator('#app.on').waitFor({timeout:30000});await expect(p.locator('[data-improvement-need]')).toHaveValue('Necesito una página para explicar los servicios de mi marca.');
  await act(p,'submit').click();await expect(p.locator('[data-improvement-status]')).toContainText('autoriza');await p.locator('[data-improvement-consent]').check();
  console.log('READY TO SEND');let lost=true,key;
  await p.route('**/rpc/portal_workflow_v1',async r=>{const body=r.request().postDataJSON();if(body.p_action==='submit_improvement'&&lost){lost=false;key=body.p_key;console.log('SIMULATE LOST RESPONSE');await r.fetch();console.log('SERVER COMMITTED');await r.abort('failed');}else await r.continue();});
  await act(p,'submit').click();console.log('SENT');await expect(p.locator('[data-improvement-status]')).toContainText('No pudimos confirmar',{timeout:20000});await expect(act(p,'retry')).toBeEnabled();console.log('RELOAD PENDING');await p.reload();console.log('PENDING RELOADED');await expect(act(p,'retry')).toBeVisible();console.log('RETRY');await act(p,'retry').click();console.log('RETRY CLICKED');await expect(act(p,'receipt')).toBeVisible();
  const id=JSON.parse(L.sql(`select result from public.portal_request_receipt where key=${L.literal(key)} and actor_id=${L.literal(users.owner.id)};`)).id;ids.push(id);
  await act(p,'receipt').click();await expect(p.locator('[data-message-send]')).toBeVisible();await expect(p.locator('[data-content]')).toContainText('Necesito una página');
  assert.equal(L.sql(`select count(*) from public.portal_request where id=${L.literal(id)};`),'1');
  console.log('CHECKPOINT');checks.push('Native client Auth, optional consent/context, unsent recovery and lost-response retry produce one persisted request');
  await t.bringToFront();await t.locator('[data-refresh]').click();await t.locator('[data-open="'+id+'"]').click();await expect(t.locator('[data-content]')).toContainText('Mejorar mi presencia en internet');
  await t.locator('[data-buffer]').first().fill('Hola, recibimos tu necesidad. ¿Ya tienes un sitio o empezamos desde cero?');await t.locator('[data-message-send]').click();await expect(t.locator('[data-message]')).toContainText('Hola, recibimos tu necesidad.');
  await t.locator('[data-audience]').selectOption('internal');await t.locator('[data-buffer]').first().fill('Nota interna: evaluar capacidad antes de ofrecer fecha.');await t.locator('[data-message-send]').click();
  await p.bringToFront();await p.reload();await act(p,'receipt').click();await expect(p.locator('[data-message]')).toContainText('Hola, recibimos tu necesidad.');await expect(p.locator('[data-content]')).not.toContainText('Nota interna:');
  await client.context.close();const recovered=await session('owner'),q=recovered.page;await act(q,'inbox').click();await q.locator('[data-open="'+id+'"]').click();await expect(q.locator('[data-message]')).toContainText('Hola, recibimos tu necesidad.');
  console.log('CHECKPOINT');checks.push('Distinct customer/team Auth accounts send and receive; a fresh browser session recovers request and reply without internal notes');
  for(const [who,page] of [['client',q],['team',t]])for(const mode of ['light','dark']){
   await page.bringToFront();await page.getByRole('button',{name:'Cambiar apariencia',exact:true}).click();await page.getByRole('menuitemradio',{name:mode==='light'?'Claro':'Oscuro',exact:true}).click();
   for(const width of [390,1280]){await page.setViewportSize({width,height:950});await page.keyboard.press('Escape');await page.mouse.move(0,0);assert.ok(await page.evaluate(()=>document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth&&document.documentElement.scrollWidth<=innerWidth));await page.locator('#main').evaluate(x=>x.scrollTop=0);await page.screenshot({path:path.join(out,who+'-'+mode+'-'+width+'.png')});}
  }
  const outsider=await session('other');await act(outsider.page,'inbox').click();await expect(outsider.page.locator('[data-open="'+id+'"]')).toHaveCount(0);await outsider.context.close();
  console.log('CHECKPOINT');checks.push('Other customer inbox excludes request; client/team responsive at 390/1280 in both appearances');
  // A server-confirmed write with a delayed response must not overwrite a new route.
  const late=await session('owner'),z=late.page;await choose(z,'identity');await z.locator('[data-improvement-need]').fill('Necesidad de prueba con respuesta demorada.');await z.locator('[data-improvement-consent]').check();
  let release,received;const gate=new Promise(r=>release=r),ready=new Promise(r=>received=r);
  await z.route('**/rpc/portal_workflow_v1',async r=>{if(r.request().postDataJSON().p_action==='submit_improvement'){const response=await r.fetch();ids.push((await response.json()).id);received();await gate;await r.fulfill({response});}else await r.continue();});
  await act(z,'submit').click();await ready;await z.locator('#side [data-nav=workflow]').click();await expect(z.locator('[data-refresh]')).toBeVisible();release();await z.waitForLoadState('networkidle');await expect(z.locator('[data-refresh]')).toBeVisible();await expect(act(z,'receipt')).toHaveCount(0);
  await z.locator('#side [data-nav=improvements]').click();await expect(act(z,'retry')).toBeVisible();await act(z,'retry').click();await expect(act(z,'receipt')).toBeVisible();
  console.log('CHECKPOINT');checks.push('Late send response cannot overwrite another route; original receipt recovered on return');
  // Authoritative auth rejection clears sensitive UI and the pending draft.
  await act(z,'new').click();await z.locator('[data-improvement-category=content]').click();await z.locator('[data-improvement-need]').fill('Texto privado que debe retirarse al perder la sesión.');
  await z.route('**/auth/v1/user',r=>r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'bad_jwt',message:'Invalid JWT'})}));
  await act(z,'inbox').click();await expect(z.locator('#app')).not.toHaveClass(/on/);assert.equal(await z.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('dv-improvement-draft-v1:')).length),0);await expect(z.locator('body')).not.toContainText('Texto privado que debe retirarse');
  console.log('CHECKPOINT');checks.push('Authoritative getUser 401 clears identity, sensitive view and local improvement buffers');
  await late.context.close();await recovered.context.close();await team.context.close();
  // A cross-tab sign-out while a write is in flight invalidates its mount and buffer.
  const rev=await session('owner'),v=rev.page;await choose(v,'sales');await v.locator('[data-improvement-need]').fill('Borrador privado antes de cerrar sesión.');await v.locator('[data-improvement-consent]').check();
  let unlock,committed;const hold=new Promise(r=>unlock=r),persisted=new Promise(r=>committed=r);
  await v.route('**/rpc/portal_workflow_v1',async r=>{if(r.request().postDataJSON().p_action==='submit_improvement'){const response=await r.fetch();ids.push((await response.json()).id);committed();await hold;await r.fulfill({response}).catch(()=>{});}else await r.continue();});
  await act(v,'submit').click();await persisted;
  const sibling=await rev.context.newPage();await sibling.goto(origin+'/?experience=requests');await expect(sibling.locator('#app')).toHaveClass(/on/);await sibling.getByRole('button',{name:'Salir',exact:true}).click();
  await expect(v.locator('#app')).not.toHaveClass(/on/);unlock();await v.waitForLoadState('networkidle');
  assert.equal(await v.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('dv-improvement-draft-v1:')).length),0);await expect(v.locator('body')).not.toContainText('Borrador privado antes');
  await v.reload();await v.locator('#labEmail').fill(users.publisher.email);await v.locator('#labPassword').fill(users.publisher.credential);await v.getByRole('button',{name:'Entrar al portal',exact:true}).click();await expect(v.locator('#app')).toHaveClass(/on/);await v.locator('[data-open="'+id+'"]').click();await v.locator('[data-buffer]').first().fill('Texto de equipo sin enviar.');
  assert.equal(await v.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('dv-improvement-draft-v1:')).length),0);
  checks.push('Cross-tab sign-out during committed/delayed write clears buffer; late response and subsequent team typing cannot restore it');await rev.context.close();
  const denied=await session('owner'),d=denied.page;await choose(d,'spaces');await d.locator('[data-improvement-need]').fill('Necesidad de prueba antes de revocar acceso.');
  await d.route('**/rpc/portal_workflow_v1',r=>r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'WORKFLOW_FORBIDDEN'})}));await act(d,'inbox').click();await expect(d.locator('#app')).not.toHaveClass(/on/);
  assert.equal(await d.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('dv-improvement-draft-v1:')).length),0);checks.push('Authoritative RPC 42501 clears identity and local buffers');await denied.context.close();
  assert.deepEqual(errors,[]);const list=ids.map(L.literal).join(',');assert.equal(L.sql(`select count(*) from public.portal_request_job where request_id in (${list});`),'0');assert.equal(L.sql(`select count(*) from public.portal_request_notice where request_id in (${list}) and mail_state<>'suppressed';`),'0');
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({status:'PASS',checks,requestIds:ids,errors},null,2));console.log(JSON.stringify({status:'PASS',checks},null,2));
 }catch(e){let i=0;for(const c of browser.contexts())for(const p of c.pages()){if(true){await p.bringToFront();await p.screenshot({path:path.join(out,'debug-'+(++i)+'.png'),timeout:5000}).catch(()=>{});console.log(JSON.stringify({visible:(await p.locator('body').innerText()).slice(0,3000),errors}));}}throw e;}finally{await browser.close();}
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
