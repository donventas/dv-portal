const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../app/environment-indicator.js');
const E = require('../app/environment.js');
const G = require('../app/write-guard.js');

const app = name => fs.readFileSync(path.join(__dirname, '..', 'app', name), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = app('portal.css');
const indicatorSource = app('environment-indicator.js');
const environmentSource = app('environment.js');
const guardSource = app('write-guard.js');
const snapshot = (state, patch = {}) => ({ state, fingerprint: patch.fingerprint || null, diagnostic: patch.diagnostic || null });
const model = state => I.viewModel(snapshot(state));

test('01 UNRESOLVED is transient and non-operational', () => {
  assert.equal(model('UNRESOLVED').operational, false);
  assert.match(model('UNRESOLVED').label, /Inicializando/);
});
test('02 VALIDATING presents persistent validation copy', () => {
  assert.equal(model('VALIDATING').label, 'Validando entorno');
  assert.match(model('VALIDATING').detail, /verificando el origen/);
});
test('03 VALIDATING disables operational surfaces', () => {
  assert.match(indicatorSource, /setOperational\(false\)/);
  assert.equal(model('VALIDATING').operational, false);
});
test('04 DEMO presents the approved label and synthetic copy', () => {
  assert.equal(model('DEMO').label, 'Entorno DEMO');
  assert.match(model('DEMO').detail, /Datos sintéticos locales/);
});
test('05 DEMO mount exists before the auth surface', () => {
  assert.ok(index.indexOf('environmentStatusMount') < index.indexOf('id="auth"'));
});
test('06 DEMO mount is outside and survives the app shell', () => {
  assert.ok(index.indexOf('environmentStatusMount') < index.indexOf('id="app"'));
  assert.doesNotMatch(indicatorSource, /removeChild\(root\)/);
});
test('07 DEMO copy never implies production persistence', () => {
  assert.match(model('DEMO').detail, /No afecta clientes ni operaciones reales/);
  assert.doesNotMatch(model('DEMO').detail, /se guarda en producción|afecta cuentas reales/i);
});
test('08 SANDBOX presents isolated non-production copy', () => {
  assert.equal(model('SANDBOX').label, 'Entorno SANDBOX');
  assert.match(model('SANDBOX').detail, /aislado de pruebas/);
});
test('09 CONFIRM_SANDBOX has explicit confirmation UI', () => {
  const m = I.guardModel({ outcome: 'CONFIRM_SANDBOX', diagnostic: {} });
  assert.match(m.title, /SANDBOX/);
  assert.match(indicatorSource, /Confirmar en SANDBOX/);
});
test('10 SANDBOX confirmation triggers a new full guard evaluation', () => {
  assert.match(guardSource, /run\(action, resourceType, Object\.assign\(\{\}, options, \{ sandboxConfirmed: true \}\), executor\)/);
});
test('11 LIVE appears only for an explicit canonical LIVE snapshot', () => {
  assert.equal(model('LIVE').label, 'Entorno LIVE');
  assert.equal(I.viewModel({ state: 'anything' }).state, 'BLOCKED');
});
test('12 LIVE copy contains no demo or sandbox language', () => {
  assert.doesNotMatch(model('LIVE').label + model('LIVE').detail, /demo|sandbox|sintétic/i);
});
test('13 BLOCKED replaces normal navigation', () => {
  assert.match(indicatorSource, /env-blocked-state/);
  assert.match(css, /\.env-blocked-state #auth,.env-blocked-state #app/);
});
test('14 BLOCKED shows only a sanitized normalized code', () => {
  const m = I.viewModel(snapshot('BLOCKED', { diagnostic: { code: 'ENV_CONFIG_INVALID' } }));
  assert.equal(m.diagnostic.code, 'ENV_CONFIG_INVALID');
});
test('15 BLOCKED shows an opaque correlation ID', () => {
  const m = I.viewModel(snapshot('BLOCKED', { diagnostic: { correlationId: 'opaque-123' } }));
  assert.equal(m.diagnostic.correlationId, 'opaque-123');
  assert.match(indicatorSource, /envCorrelation/);
});
test('16 BLOCKED cannot create a backend client', () => {
  assert.equal(E.canCreateClient({ state: 'BLOCKED', fingerprint: null, error: {} }), false);
});
test('17 BLOCKED cannot load seed or application scripts', () => {
  assert.doesNotMatch(index, /<script src="data\/seed\.js"/);
  assert.match(indicatorSource, /if \(model\.operational && !loaded\)/);
});
test('18 retry calls canonical resolver revalidation', () => {
  assert.match(indicatorSource, /window\.DVEnv\.revalidate\(\)/);
});
test('19 retry contains no DEMO fallback', () => {
  const retryBlock = indicatorSource.slice(indicatorSource.indexOf("getElementById('envRetry')"), indicatorSource.indexOf("getElementById('envCopy')"));
  assert.doesNotMatch(retryBlock, /DEMO|isDemo|fallback/);
});
test('20 unknown host resolves BLOCKED', () => {
  const r = E.resolveEnvironment({ origin: 'https://unknown.invalid', config: null });
  assert.equal(r.state, 'BLOCKED');
  assert.equal(r.error.code, 'ENV_ORIGIN_UNKNOWN');
});
test('21 stale config resolves BLOCKED', () => {
  const c = { configVersion: 1, environmentId: 'x', mode: 'DEMO', backendId: '', backendClass: 'none', backendUrl: '', publicClientKey: '', allowedOrigins: ['http://localhost:8000'], allowedBackendIds: [], deploymentClass: 'local', configIssuedAt: '2026-01-01T00:00:00Z', configExpiresAt: '2026-01-02T00:00:00Z', features: {}, writePolicy: 'local-only' };
  const r = E.resolveEnvironment({ origin: 'http://localhost:8000', config: c, now: Date.parse('2026-07-27T00:00:00Z') });
  assert.equal(r.state, 'BLOCKED');
  assert.equal(r.error.code, 'ENV_CONFIG_STALE');
});
test('22 backend mismatch resolves BLOCKED', () => {
  const c = { configVersion: 1, environmentId: 'sbx', mode: 'SANDBOX', backendId: 'sbx-1', backendClass: 'sandbox', backendUrl: 'https://sbx.invalid', publicClientKey: 'public-test', allowedOrigins: ['http://localhost:8000'], allowedBackendIds: ['sbx-1'], deploymentClass: 'local', configIssuedAt: '2026-01-01T00:00:00Z', features: {}, writePolicy: 'rls' };
  const r = E.resolveEnvironment({ origin: 'http://localhost:8000', config: c, observedBackendId: 'other' });
  assert.equal(r.state, 'BLOCKED');
  assert.equal(r.error.code, 'ENV_BACKEND_MISMATCH');
});
test('23 REAUTH produces safe reauthentication guidance', () => {
  const m = I.guardModel({ outcome: 'REAUTH', diagnostic: {} });
  assert.match(m.title + m.detail, /autenticar/i);
});
test('24 network failure preserves the resolved mode', () => {
  assert.equal(E.retainModeAfterNetworkFailure({ state: 'SANDBOX', fingerprint: 'x' }).state, 'SANDBOX');
  assert.equal(E.retainModeAfterNetworkFailure({ state: 'LIVE', fingerprint: 'y' }).state, 'LIVE');
});
test('25 fingerprint remains part of every visual snapshot', () => {
  assert.equal(I.viewModel(snapshot('DEMO', { fingerprint: 'fp-next' })).fingerprint, 'fp-next');
  assert.match(indicatorSource, /lastFingerprint !== model\.fingerprint/);
});
test('26 indicator has no dismiss control or preference storage', () => {
  assert.doesNotMatch(indicatorSource, /dismiss|localStorage|sessionStorage/);
});
test('27 visual state always equals the resolver snapshot', () => {
  ['VALIDATING', 'DEMO', 'SANDBOX', 'LIVE', 'BLOCKED'].forEach(state => assert.equal(I.viewModel({ state }).state, state));
});
test('28 visible text is generated in markup, independent of CSS', () => {
  assert.match(indicatorSource, /<strong>' \+ esc\(model\.label\)/);
  assert.match(indicatorSource, /esc\(model\.detail\)/);
});
test('29 retry is a native keyboard-operable button', () => assert.match(indicatorSource, /<button type="button" id="envRetry"/));
test('30 correlation copy is a native keyboard-operable button', () => assert.match(indicatorSource, /<button type="button" id="envCopy"/));
test('31 reauth uses a native keyboard-operable button', () => assert.match(indicatorSource, /id="envGuardConfirm"/));
test('32 sandbox confirmation uses native keyboard controls', () => {
  assert.match(indicatorSource, /id="envGuardCancel"/);
  assert.match(indicatorSource, /id="envGuardConfirm"/);
});
test('33 focus moves deliberately into BLOCKED', () => assert.match(indicatorSource, /getElementById\('envBlockedTitle'\)\.focus\(\)/));
test('34 screen-reader status and live region are present', () => {
  assert.match(indicatorSource, /role="status"/);
  assert.match(indicatorSource, /aria-live="polite"/);
  assert.match(indicatorSource, /aria-atomic="true"/);
});
test('35 narrow viewport has explicit non-overlap layout rules', () => {
  assert.match(css, /@media\(max-width:340px\)/);
  assert.match(css, /--env-banner-h:108px/);
});
test('36 diagnostics expose no prohibited fields', () => {
  const error = E.safeError('ENV_CONFIG_INVALID', { backendId: 'opaque' });
  assert.equal(I.diagnosticIsSafe({ code: error.code, correlationId: error.correlationId }), true);
  assert.deepEqual(Object.keys(I.safeSnapshot({ state: 'BLOCKED', diagnostic: error }).diagnostic), ['code', 'correlationId']);
});
test('37 resolver interface is observable and revalidatable', () => {
  assert.match(environmentSource, /subscribe: function/);
  assert.match(environmentSource, /revalidate: revalidate/);
});
test('38 write guard outcomes remain unmodified by presentation', () => {
  ['DENY', 'DENY_AND_LOG', 'REAUTH', 'CONFIRM_SANDBOX'].forEach(outcome => assert.equal(I.guardModel({ outcome }).outcome, outcome));
  assert.deepEqual(Object.keys(G.OUTCOMES).sort(), ['ALLOW', 'CONFIRM_SANDBOX', 'DENY', 'DENY_AND_LOG', 'REAUTH']);
});
test('39 DEMO loads no Supabase CDN and no client before demand', () => {
  assert.doesNotMatch(index, /supabase-js@|cdn\.jsdelivr/);
  assert.match(app('supabase.js'), /if \(!BACKEND\(\)\) throw new Error\('ENV_CLIENT_UNAVAILABLE'\)/);
});
test('40 presentation tests use no network, production credentials or heavy DOM framework', () => {
  assert.doesNotMatch(__filename, /https?:\/\//);
  assert.doesNotMatch(index, /jsdom|playwright|cypress/i);
});
test('41 BLOCKED critical controls use a constrained responsive surface', () => {
  assert.match(css, /\.env-blocked-card\{[^}]*width:min\(100%,22rem\)[^}]*max-width:100%[^}]*min-width:0/);
});
test('42 BLOCKED correlation ID can wrap safely', () => {
  assert.match(css, /\.env-blocked-card dl div,.env-blocked-card dd,.env-blocked-card code\{[^}]*white-space:normal[^}]*overflow-wrap:anywhere/);
});
test('43 BLOCKED action group stacks at the scale-two layout breakpoint', () => {
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?\.env-actions\{[^}]*flex-direction:column[^}]*align-items:stretch/);
});
test('44 BLOCKED surface allows vertical access without horizontal overflow', () => {
  assert.match(css, /\.env-blocked-screen\{[^}]*overflow-x:hidden[^}]*overflow-y:auto/);
});
test('45 CONFIRM_SANDBOX surface stays width constrained', () => {
  assert.match(css, /\.env-guard-modal \.mbox\{[^}]*width:min\(100%,22rem\)[^}]*max-width:100%[^}]*min-width:0/);
});
test('46 CONFIRM_SANDBOX actions stack responsively', () => {
  assert.match(css, /\.env-guard-modal \.mrow\{[^}]*flex-direction:column[^}]*align-items:stretch/);
});
test('47 confirm and cancel remain native keyboard-reachable buttons', () => {
  assert.match(indicatorSource, /<button class="btn sm" id="envGuardCancel"/);
  assert.match(indicatorSource, /<button class="btn solid sm" id="envGuardConfirm"/);
});
test('48 critical environment text never uses ellipsis or clipping', () => {
  const responsive = css.slice(css.indexOf('@media(max-width:800px)'), css.indexOf('@media(max-width:640px)'));
  assert.doesNotMatch(responsive, /text-overflow:ellipsis|overflow:\s*(?:hidden|clip)/);
});
test('49 responsive environment surfaces define no fixed min-width', () => {
  const responsive = css.slice(css.indexOf('@media(max-width:800px)'), css.indexOf('@media(max-width:640px)'));
  assert.match(responsive, /min-width:0/);
  assert.doesNotMatch(responsive, /min-width:\s*[1-9]\d*(?:px|rem|em)/);
});
test('50 responsive reflow does not hide the persistent indicator', () => {
  const responsive = css.slice(css.indexOf('@media(max-width:800px)'), css.indexOf('@media(max-width:640px)'));
  assert.doesNotMatch(responsive, /\.env-indicator[^}]*display:none|visibility:hidden/);
});
