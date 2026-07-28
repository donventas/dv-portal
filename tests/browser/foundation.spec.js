const { test, expect } = require('@playwright/test');

const demoConfig = {
  schemaVersion: 'CONFIG_SCHEMA_V1',
  configVersion: 'CONFIG_RELEASE_BROWSER',
  environmentId: 'ENV_BROWSER_DEMO',
  declaredMode: 'DEMO',
  backendId: '',
  backendClass: 'none',
  allowlistVersion: 'ALLOWLIST_BROWSER',
  issuedAt: '2026-01-01T00:00:00Z',
  expiresAt: '2031-01-01T00:00:00Z',
  buildCommit: 'PRODUCT_BROWSER_BUILD',
  publicClient: { endpoint: '', publicKey: '' }
};
function isForbiddenNetwork(url) {
  return !url.startsWith('http://127.0.0.1:8002') &&
    /supabase|\/auth\/|stripe|payment|telemetry|analytics|segment\.io/i.test(url);
}
async function safePage(browser, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(config => {
    window.DV_PORTAL_RELEASE_CONFIG = config;
    window.DV_PORTAL_RELEASE_BINDING = {
      origins: [location.origin],
      backendIds: [],
      observedBackendId: '',
      bindingCount: 1,
      localHosts: ['127.0.0.1', 'localhost']
    };
  }, demoConfig);
  const page = await context.newPage();
  const consoleProblems = [];
  const forbidden = [];
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(message.text());
  });
  page.on('request', request => {
    const url = request.url();
    if (isForbiddenNetwork(url)) forbidden.push(url);
  });
  await page.goto('/');
  await page.waitForFunction(() => window.DVEnv && DVEnv.state() === 'DEMO');
  return { context, page, consoleProblems, forbidden };
}

test('desktop DEMO is synthetic, keyboard reachable and network silent', async ({ browser }) => {
  const state = await safePage(browser, { width: 1280, height: 800 });
  await expect(state.page.locator('#environmentStatusMount')).toContainText(/DEMO/i);
  await state.page.keyboard.press('Tab');
  expect(await state.page.evaluate(() => document.activeElement !== document.body)).toBeTruthy();
  expect(state.forbidden).toEqual([]);
  expect(state.consoleProblems).toEqual([]);
  await state.context.close();
});

test('320px and scale-two critical surfaces do not overflow', async ({ browser }) => {
  const state = await safePage(browser, { width: 320, height: 640 });
  expect(await state.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const session = await state.context.newCDPSession(state.page);
  await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  expect(await state.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(state.consoleProblems).toEqual([]);
  expect(state.forbidden).toEqual([]);
  await state.context.close();
});

test('missing configuration is BLOCKED with no backend or app navigation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  const forbidden = [];
  page.on('request', request => {
    if (isForbiddenNetwork(request.url())) forbidden.push(request.url());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.DVEnv && DVEnv.state() === 'BLOCKED');
  await expect(page.locator('#environmentBlockedMount')).toContainText('bloqueado');
  expect(await page.locator('#side').isVisible()).toBeFalsy();
  expect(forbidden).toEqual([]);
  await context.close();
});

test('pending, failure and retry preserve atomic local state', async ({ page }) => {
  await page.goto('/tests/atomic-mutations-harness.html');
  await page.locator('#startSuccess').click();
  await expect(page.locator('#mutationStatus')).toContainText(/Pendiente/i);
  await expect(page.locator('#localState')).toHaveText('previo');
  await page.locator('#resolveSuccess').click();
  await expect(page.locator('#localState')).toHaveText('confirmado');
  await expect(page.locator('#commitCount')).toHaveText('1');
  await page.locator('#resetHarness').click();
  await page.locator('#asyncFailure').click();
  await expect(page.locator('#mutationStatus')).toContainText(/No se guard/i);
  await expect(page.locator('#commitCount')).toHaveText('0');
  await page.locator('#startSuccess').click();
  await page.locator('#resolveSuccess').click();
  await expect(page.locator('#commitCount')).toHaveText('1');
});

test('SANDBOX confirmation is 0 before confirmation and 1 after it', async ({ page }) => {
  await page.goto('/tests/environment-indicator-harness.html?state=SANDBOX&guard=CONFIRM_SANDBOX');
  expect(await page.evaluate(() => window.__harnessExecuted)).toBe(0);
  await page.locator('#envGuardConfirm').click();
  expect(await page.evaluate(() => window.__harnessExecuted)).toBe(1);
});
