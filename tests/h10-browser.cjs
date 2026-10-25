'use strict';
// Existing Playwright + browser only; never installs. Every external request is aborted.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { chromium } = require(process.env.H10_PLAYWRIGHT_PATH || 'playwright');
const browserPath = process.env.H10_BROWSER_PATH;
assert.ok(browserPath && fs.existsSync(browserPath), 'Provide an existing browser executable');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless:true, executablePath:browserPath });
    for (const mode of ['BLOCKED','DEMO','SANDBOX','LIVE']) {
      const context = await browser.newContext({ viewport:{ width:320,height:740 } });
      const external = [], requests = [], errors = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        external.push(url.hostname); return route.abort();
      });
      await context.addInitScript(({ mode, origin }) => {
        if (mode === 'BLOCKED') return;
        const backend = mode !== 'DEMO';
        window.DV_PORTAL_RELEASE_CONFIG = { schemaVersion:'CONFIG_SCHEMA_V1',configVersion:'H10_TEST',environmentId:'H10_TEST',declaredMode:mode,
          backendId:backend ? 'SYNTHETIC_BACKEND' : '',backendClass:mode === 'LIVE' ? 'production' : backend ? 'sandbox' : 'none',allowlistVersion:'H10_TEST',
          issuedAt:'2026-01-01T00:00:00Z',expiresAt:'2031-01-01T00:00:00Z',buildCommit:'H10_TEST',publicClient:{endpoint:backend ? 'https://synthetic.invalid' : '',publicKey:backend ? 'synthetic' : ''} };
        window.DV_PORTAL_RELEASE_BINDING = { origins:[origin],backendIds:backend ? ['SYNTHETIC_BACKEND'] : [],observedBackendId:backend ? 'SYNTHETIC_BACKEND' : '',bindingCount:1,localHosts:['127.0.0.1'] };
        // LIVE is a resolver/controller simulation on loopback, with no production endpoint.
        if (mode === 'LIVE') window.DV_PORTAL_RELEASE_BINDING.productionOrigins = [origin];
        if (backend) window.supabase = { createClient:() => ({auth:{getUser:async () => ({data:{user:null}}),onAuthStateChange:() => ({})}}) };
      }, {mode,origin});
      const page = await context.newPage();
      page.on('request',r => requests.push(new URL(r.url()).pathname));
      page.on('pageerror',e => errors.push(e.message));
      // For LIVE only, simulate classification after the real resolver (which correctly forbids local LIVE).
      if (mode === 'LIVE') await context.route(origin + '/app/environment.js', route => route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'app/environment.js'),'utf8') + '\nDVEnv.state=()=>"LIVE"; DVEnv.isBackend=()=>true; DVEnv.resolution=()=>({state:"LIVE",originClass:"PRODUCTION",fingerprint:"H10_LIVE_SIMULATED",config:{features:{}}}); DVEnv.subscribe=fn=>{fn({state:"LIVE",fingerprint:"H10_LIVE_SIMULATED"});return ()=>{};};'}));
      await page.goto(origin);
      if (mode === 'BLOCKED') await page.waitForSelector('.env-blocked-screen, .env-prelaunch-screen');
      else await page.waitForSelector('#paneCli');
      const observations = await page.evaluate(() => ({ state:DVEnv.state(), rows:window.DV_SEED?.accounts?.length || 0,overflow:document.documentElement.scrollWidth > innerWidth }));
      assert.equal(observations.state,mode);
      assert.equal(requests.includes('/data/seed.js'),mode === 'DEMO');
      assert.equal(observations.rows > 0,mode === 'DEMO');
      assert.deepEqual(errors,[]);
      assert.equal(observations.overflow,false);
      for (const width of [390,768,1280]) { await page.setViewportSize({width,height:800}); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false); }
      if (mode === 'DEMO') {
        await page.evaluate(() => { DVStore.loginAs(DV_SEED.users.find(u => u.role === 'cliente')); DVPortal.boot(); });
        await page.waitForSelector('#app.on');
        await page.evaluate(() => DVPortal.logout());
        assert.equal(await page.locator('#viewHost').textContent(),'');
        assert.equal(await page.locator('#app.on').count(),0);
      } else if (mode !== 'BLOCKED') {
        assert.equal(await page.locator('#tabNew').isDisabled(),true);
        assert.equal(await page.locator('[onclick="DVAuth.startF0()" ]').isDisabled(),true);
        await page.evaluate(() => { DVSupa.signIn = async () => { throw new Error('synthetic denial'); }; });
        await page.locator('#cliEmail').fill('synthetic@demo.invalid');
        await page.locator('[onclick="DVAuth.sendLink()"]' ).click();
        assert.equal(await page.locator('#cli1').isVisible(),true);
        assert.equal(await page.locator('#cli2').isVisible(),false);
        await page.evaluate(() => DVEnv.revalidate());
        assert.equal(await page.evaluate(() => window.DV_SEED.accounts.length),0);
      }
      console.log(JSON.stringify({mode,simulatedLive:mode === 'LIVE',fixtureRequested:requests.includes('/data/seed.js'),rows:observations.rows,externalAborted:external,pageErrors:errors}));
      await context.close();
    }
  } finally { if (browser) await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode=1; });
