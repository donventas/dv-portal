const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../app/environment.js');

const origins = {
  production: 'https://app.donventas.mx',
  preview: 'https://feature-26.vercel.app',
  local: 'http://localhost:8000',
  unknown: 'https://portal.example.invalid'
};
const policy = { productionOrigins: [origins.production], previewHostSuffixes: ['.vercel.app'] };
function cfg(deploymentClass, mode, backendClass) {
  const backend = mode === 'DEMO' ? '' : backendClass + '-01';
  return {
    configVersion: 1, environmentId: deploymentClass + '-' + mode.toLowerCase(), mode,
    backendId: backend, backendClass: backendClass || 'none',
    backendUrl: backend ? 'https://' + backend + '.supabase.co' : '',
    publicClientKey: backend ? 'public-anon-test-value' : '',
    allowedOrigins: [origins[deploymentClass]], allowedBackendIds: backend ? [backend] : [],
    deploymentClass, configIssuedAt: '2026-01-01T00:00:00Z',
    features: {}, writePolicy: mode === 'DEMO' ? 'local-only' : 'rls'
  };
}
function resolve(originName, config, observedBackendId) {
  return E.resolveEnvironment({
    origin: origins[originName], originPolicy: policy, config,
    observedBackendId: observedBackendId === undefined ? config && config.backendId : observedBackendId,
    now: Date.parse('2026-07-26T12:00:00Z'), random: () => new Uint8Array(12).fill(7)
  });
}
function expectBlocked(result, code) {
  assert.equal(result.state, E.STATES.BLOCKED);
  if (code) assert.equal(result.error.code, code);
  assert.equal(E.canCreateClient(result), false);
}

test('01 production + valid production config => LIVE', () => {
  assert.equal(resolve('production', cfg('production', 'LIVE', 'production')).state, E.STATES.LIVE);
});
test('02 production + missing config => BLOCKED', () => {
  expectBlocked(resolve('production', null), E.ERRORS.ENV_CONFIG_MISSING);
});
test('03 production + partial config => BLOCKED', () => {
  const c = cfg('production', 'LIVE', 'production'); delete c.publicClientKey;
  expectBlocked(resolve('production', c), E.ERRORS.ENV_CONFIG_PARTIAL);
});
test('04 production + invalid config => BLOCKED', () => {
  const c = cfg('production', 'LIVE', 'production'); c.configVersion = 'bad';
  expectBlocked(resolve('production', c), E.ERRORS.ENV_CONFIG_INVALID);
});
test('05 production + DEMO => BLOCKED', () => {
  expectBlocked(resolve('production', cfg('production', 'DEMO', 'none')), E.ERRORS.ENV_PROD_DEMO_FORBIDDEN);
});
test('06 production + sandbox backend => BLOCKED', () => {
  expectBlocked(resolve('production', cfg('production', 'SANDBOX', 'sandbox')), E.ERRORS.ENV_PROD_BACKEND_FORBIDDEN);
});
test('07 preview + explicit sandbox => SANDBOX', () => {
  assert.equal(resolve('preview', cfg('preview', 'SANDBOX', 'sandbox')).state, E.STATES.SANDBOX);
});
test('08 preview + explicit UI-only demo => DEMO', () => {
  assert.equal(resolve('preview', cfg('preview', 'DEMO', 'none')).state, E.STATES.DEMO);
});
test('09 preview + production backend => BLOCKED', () => {
  expectBlocked(resolve('preview', cfg('preview', 'LIVE', 'production')), E.ERRORS.ENV_PROD_BACKEND_FORBIDDEN);
});
test('10 localhost + demo => DEMO', () => {
  assert.equal(resolve('local', cfg('local', 'DEMO', 'none')).state, E.STATES.DEMO);
});
test('11 localhost + allowlisted sandbox => SANDBOX', () => {
  assert.equal(resolve('local', cfg('local', 'SANDBOX', 'sandbox')).state, E.STATES.SANDBOX);
});
test('12 localhost + production backend => BLOCKED', () => {
  expectBlocked(resolve('local', cfg('local', 'LIVE', 'production')), E.ERRORS.ENV_PROD_BACKEND_FORBIDDEN);
});
test('13 unknown host => BLOCKED', () => {
  expectBlocked(resolve('unknown', cfg('preview', 'DEMO', 'none')), E.ERRORS.ENV_ORIGIN_UNKNOWN);
});
test('14 backend identity mismatch => BLOCKED', () => {
  expectBlocked(resolve('preview', cfg('preview', 'SANDBOX', 'sandbox'), 'other-backend'), E.ERRORS.ENV_BACKEND_MISMATCH);
});
test('15 stale config => BLOCKED', () => {
  const c = cfg('preview', 'SANDBOX', 'sandbox'); c.configExpiresAt = '2026-01-02T00:00:00Z';
  expectBlocked(resolve('preview', c), E.ERRORS.ENV_CONFIG_STALE);
});
test('16 no client before successful validation', () => {
  let calls = 0; const controller = E.createClientController(() => { calls += 1; return {}; });
  controller.apply({ state: E.STATES.UNRESOLVED });
  controller.apply({ state: E.STATES.VALIDATING });
  controller.apply(resolve('production', null));
  assert.equal(calls, 0); assert.equal(controller.current(), null);
});
test('17 DEMO never initializes backend client', () => {
  let calls = 0; const controller = E.createClientController(() => { calls += 1; return {}; });
  controller.apply(resolve('local', cfg('local', 'DEMO', 'none')));
  assert.equal(calls, 0);
});
test('18 mode change invalidates client', () => {
  let destroyed = 0;
  const controller = E.createClientController(() => ({ destroy: () => { destroyed += 1; } }));
  controller.apply(resolve('preview', cfg('preview', 'SANDBOX', 'sandbox')));
  controller.apply(resolve('preview', cfg('preview', 'DEMO', 'none')));
  assert.equal(destroyed, 1); assert.equal(controller.current(), null);
});
test('19 backendId change invalidates session/cache namespace', () => {
  const storage = E.createMemoryStorage(); const one = cfg('preview', 'SANDBOX', 'sandbox');
  const fp1 = E.fingerprint(one); E.invalidatePreviousNamespace(storage, fp1);
  E.scopedStorage(storage, fp1).setItem('session', 'old');
  const two = { ...one, backendId: 'sandbox-02', allowedBackendIds: ['sandbox-02'] };
  const fp2 = E.fingerprint(two);
  assert.equal(E.invalidatePreviousNamespace(storage, fp2), true);
  assert.equal(E.scopedStorage(storage, fp1).getItem('session'), null);
});
test('20 configVersion change invalidates prior state', () => {
  const storage = E.createMemoryStorage(); const one = cfg('local', 'DEMO', 'none');
  E.invalidatePreviousNamespace(storage, E.fingerprint(one));
  E.scopedStorage(storage, E.fingerprint(one)).setItem('cache', 'old');
  const two = { ...one, configVersion: 2 };
  E.invalidatePreviousNamespace(storage, E.fingerprint(two));
  assert.equal(E.scopedStorage(storage, E.fingerprint(one)).getItem('cache'), null);
});
test('environmentId change invalidates prior state', () => {
  const storage = E.createMemoryStorage(); const one = cfg('local', 'DEMO', 'none');
  E.invalidatePreviousNamespace(storage, E.fingerprint(one));
  E.scopedStorage(storage, E.fingerprint(one)).setItem('authorship', 'compatible-only');
  const two = { ...one, environmentId: 'another-local-demo' };
  E.invalidatePreviousNamespace(storage, E.fingerprint(two));
  assert.equal(E.scopedStorage(storage, E.fingerprint(one)).getItem('authorship'), null);
});
test('21 cross-environment session => SESSION_ENV_MISMATCH', () => {
  const r = resolve('local', cfg('local', 'DEMO', 'none'));
  assert.equal(E.sessionMatches({ environmentFingerprint: 'other' }, r.fingerprint), false);
  assert.equal(E.ERRORS.SESSION_ENV_MISMATCH, 'SESSION_ENV_MISMATCH');
});
test('22 network failure never falls back to DEMO', () => {
  const r = resolve('preview', cfg('preview', 'SANDBOX', 'sandbox'));
  assert.equal(E.retainModeAfterNetworkFailure(r).state, E.STATES.SANDBOX);
});
test('23 URL without key => ENV_CONFIG_PARTIAL', () => {
  const c = cfg('preview', 'SANDBOX', 'sandbox'); c.publicClientKey = '';
  expectBlocked(resolve('preview', c), E.ERRORS.ENV_CONFIG_PARTIAL);
});
test('24 key without URL => ENV_CONFIG_PARTIAL', () => {
  const c = cfg('preview', 'SANDBOX', 'sandbox'); c.backendUrl = '';
  expectBlocked(resolve('preview', c), E.ERRORS.ENV_CONFIG_PARTIAL);
});
test('25 sandbox backend used as LIVE => BLOCKED', () => {
  expectBlocked(resolve('production', cfg('production', 'LIVE', 'sandbox')), E.ERRORS.ENV_BACKEND_MISMATCH);
});
test('sanitized diagnostics omit key and URL', () => {
  const c = cfg('preview', 'SANDBOX', 'sandbox'); const text = JSON.stringify(resolve('preview', c, 'wrong').error);
  assert.equal(text.includes(c.publicClientKey), false); assert.equal(text.includes(c.backendUrl), false);
});
test('privileged frontend fields are rejected', () => {
  const c = cfg('preview', 'SANDBOX', 'sandbox'); c['service_role'] = 'forbidden';
  expectBlocked(resolve('preview', c), E.ERRORS.ENV_CONFIG_INVALID);
});
