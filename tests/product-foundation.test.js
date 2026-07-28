'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RC = require('../app/release-config.js');
const Env = require('../app/environment.js');

const NOW = Date.parse('2030-01-01T00:00:00Z');
function config(patch = {}) {
  return Object.assign({
    schemaVersion: 'CONFIG_SCHEMA_V1',
    configVersion: 'CONFIG_RELEASE_TEST',
    environmentId: 'ENV_TEST',
    declaredMode: 'DEMO',
    backendId: '',
    backendClass: 'none',
    allowlistVersion: 'ALLOWLIST_TEST',
    issuedAt: '2029-01-01T00:00:00Z',
    expiresAt: '2031-01-01T00:00:00Z',
    buildCommit: 'PRODUCT_BUILD_TEST',
    publicClient: { endpoint: '', publicKey: '' }
  }, patch);
}
function context(patch = {}) {
  return Object.assign({
    now: NOW, originAllowed: true, backendAllowed: true,
    observedBackendId: '', bindingCount: 1
  }, patch);
}

test('config VALID', () => assert.equal(RC.validate(config(), context()).code, 'VALID'));
test('config MISSING', () => assert.equal(RC.validate(null, context()).code, 'MISSING'));
test('config PARTIAL', () => {
  const value = config(); delete value.configVersion;
  assert.equal(RC.validate(value, context()).code, 'PARTIAL');
});
test('config MALFORMED', () => assert.equal(RC.validate([], context()).code, 'MALFORMED'));
test('config STALE', () => assert.equal(
  RC.validate(config({ expiresAt: '2029-01-01T00:00:00Z' }), context()).code, 'STALE'));
test('config BACKEND_MISMATCH', () => {
  const value = config({
    declaredMode: 'SANDBOX', backendId: 'BACKEND_SANDBOX_V1',
    backendClass: 'sandbox', publicClient: { endpoint: 'PUBLIC_ENDPOINT', publicKey: 'PUBLIC_KEY' }
  });
  assert.equal(RC.validate(value, context({ backendAllowed: false })).code, 'BACKEND_MISMATCH');
});
test('config ORIGIN_MISMATCH', () => assert.equal(
  RC.validate(config(), context({ originAllowed: false })).code, 'ORIGIN_MISMATCH'));
test('config VERSION_UNSUPPORTED', () => assert.equal(
  RC.validate(config({ schemaVersion: 'CONFIG_SCHEMA_V0' }), context()).code, 'VERSION_UNSUPPORTED'));
test('config AMBIGUOUS', () => assert.equal(
  RC.validate(config(), context({ bindingCount: 2 })).code, 'AMBIGUOUS'));
test('fingerprint contains all five governed inputs', () => assert.equal(
  RC.fingerprint(config()), 'CONFIG_SCHEMA_V1.CONFIG_RELEASE_TEST.ENV_TEST.local.DEMO'));

const compatible = { environmentFingerprint: 'fp-current', expiresAt: '2031-01-01T00:00:00Z' };
[
  ['no session', null, false],
  ['compatible session', compatible, true],
  ['legacy unscoped session', { userId: 'u1' }, false],
  ['another backend', { environmentFingerprint: 'fp-backend' }, false],
  ['another environment', { environmentFingerprint: 'fp-environment' }, false],
  ['stale fingerprint', { environmentFingerprint: 'fp-stale' }, false],
  ['expired session', { environmentFingerprint: 'fp-expired', expired: true }, false],
  ['malformed session', 'invalid', false],
  ['unsupported config', { environmentFingerprint: 'fp-v0' }, false],
  ['logout', null, false],
  ['failed migration', { environmentFingerprint: 'fp-migration-failed' }, false],
  ['environment transition', { environmentFingerprint: 'fp-transition' }, false],
  ['preview to production', { environmentFingerprint: 'fp-preview' }, false],
  ['production to preview', { environmentFingerprint: 'fp-production' }, false],
  ['SANDBOX to LIVE', { environmentFingerprint: 'fp-sandbox' }, false]
].forEach(([name, session, expected]) => {
  test('session policy: ' + name, () => {
    const actual = !!session && !session.expired && Env.sessionMatches(session, 'fp-current');
    assert.equal(actual, expected);
  });
});

test('adapter has no embedded active backend configuration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'supabase.js'), 'utf8');
  assert.doesNotMatch(source, /window\.DV_SUPA\s*=\s*\{\s*URL:/);
  assert.doesNotMatch(source, /eyJ[a-zA-Z0-9_-]{20,}/);
  assert.match(source, /if \(!BACKEND\(\)\) throw/);
});
test('adapter returns guarded promises and uses fingerprint client lifecycle', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'supabase.js'), 'utf8');
  assert.match(source, /Promise\.reject\(new Error\('WRITE_DIRECT_BYPASS_BLOCKED'\)\)/);
  assert.match(source, /_clientFingerprint === resolution\.fingerprint/);
  assert.match(source, /return guarded\(/);
});
test('boot order is config then resolver then guard then coordinator then adapter', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const order = [
    'app/release-config.js', 'app/environment.js', 'app/write-guard.js',
    'app/atomic-mutations.js', 'app/supabase.js', 'app/environment-indicator.js'
  ].map(value => html.indexOf(value));
  assert.ok(order.every(value => value >= 0));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b));
});
test('production boot has no direct seed script or active config template', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<script src="data\/seed\.js"/);
  assert.doesNotMatch(html, /release-config\.example\.js/);
});
