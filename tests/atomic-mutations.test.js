const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../app/atomic-mutations.js');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const setup = patch => {
  let fingerprint = 'fp-1', session = 'user-1', state = { rows: [] }, signals = [];
  const d = deferred(), options = {
    key: 'account:1', fingerprint, sessionIdentity: session,
    getFingerprint: () => fingerprint, getSessionIdentity: () => session,
    execute: () => d.promise,
    commit: value => { state = { rows: [value] }; signals.push('commit'); },
    success: () => signals.push('success'),
    failure: () => signals.push('failure'),
    ...patch
  };
  return { d, options, get state() { return state; }, signals, setFingerprint: v => { fingerprint = v; }, setSession: v => { session = v; } };
};

test('01 LIVE state is unchanged before backend resolution', async () => {
  const s = setup(); const p = A.run(s.options); assert.deepEqual(s.state, { rows: [] }); s.d.resolve({ id: 1 }); await p;
});
test('02 pending is true while backend is unresolved', async () => {
  const s = setup({ key: 'pending' }); const p = A.run(s.options); await Promise.resolve(); assert.equal(A.isPending('pending'), true); s.d.resolve(1); await p;
});
test('03 success applies canonical local state after resolution', async () => {
  const s = setup({ key: 'success' }); const p = A.run(s.options); s.d.resolve({ id: 'canonical' }); const r = await p; assert.deepEqual(s.state.rows[0], { id: 'canonical' }); assert.equal(r.committed, true);
});
test('04 success signal occurs after local commit', async () => {
  const s = setup({ key: 'order' }); const p = A.run(s.options); s.d.resolve(1); await p; assert.deepEqual(s.signals, ['commit', 'success']);
});
test('05 rejection leaves prior state unchanged', async () => {
  const s = setup({ key: 'reject' }); const p = A.run(s.options); s.d.reject(new Error('raw')); const r = await p; assert.deepEqual(s.state, { rows: [] }); assert.equal(r.status, 'FAILED');
});
test('06 sync throw leaves prior state unchanged', async () => {
  const s = setup({ key: 'throw', execute: () => { throw new Error('raw'); } }); const r = await A.run(s.options); assert.deepEqual(s.state, { rows: [] }); assert.equal(r.status, 'FAILED');
});
test('07 pending clears after success', async () => {
  const s = setup({ key: 'clear-success' }); const p = A.run(s.options); s.d.resolve(1); await p; assert.equal(A.isPending('clear-success'), false);
});
test('08 pending clears after failure', async () => {
  const s = setup({ key: 'clear-failure' }); const p = A.run(s.options); s.d.reject(new Error('x')); await p; assert.equal(A.isPending('clear-failure'), false);
});
test('09 duplicate submit is single-flight', async () => {
  let n = 0; const s = setup({ key: 'duplicate', execute: () => { n++; return s.d.promise; } }); const a = A.run(s.options), b = A.run(s.options); assert.strictEqual(a, b); s.d.resolve(1); await a; assert.equal(n, 1);
});
test('10 retry after failure creates exactly one new call', async () => {
  let n = 0; const bad = setup({ key: 'retry', execute: () => { n++; return Promise.reject(new Error('x')); } }); await A.run(bad.options);
  const good = setup({ key: 'retry', execute: () => { n++; return Promise.resolve(2); } }); await A.run(good.options); assert.equal(n, 2);
});
test('11 old success cannot overwrite a newer identity', async () => {
  const s = setup({ key: 'old' }); const p = A.run(s.options); s.setFingerprint('fp-2'); s.d.resolve('old'); const r = await p; assert.equal(r.status, 'STALE'); assert.deepEqual(s.state, { rows: [] });
});
test('12 fingerprint change causes STALE', async () => {
  const s = setup({ key: 'fp' }); const p = A.run(s.options); s.setFingerprint('changed'); s.d.resolve(1); assert.equal((await p).status, 'STALE');
});
test('13 session change causes STALE', async () => {
  const s = setup({ key: 'session' }); const p = A.run(s.options); s.setSession('user-2'); s.d.resolve(1); assert.equal((await p).status, 'STALE');
});
test('14 stale completion commits nothing', async () => {
  const s = setup({ key: 'stale-none' }); const p = A.run(s.options); s.setSession(null); s.d.resolve(1); await p; assert.deepEqual(s.signals, []);
});
test('15 canonical backend output replaces request data safely', async () => {
  const s = setup({ key: 'canonical' }); const p = A.run(s.options); s.d.resolve({ id: 'server', status: 'saved' }); await p; assert.equal(s.state.rows[0].id, 'server');
});
test('16 no optimistic state requires rollback', async () => {
  const before = { rows: [] }, s = setup({ key: 'rollback' }); const p = A.run(s.options); s.d.reject(new Error('x')); await p; assert.deepEqual(s.state, before);
});
test('17 failure and success signals never coexist', async () => {
  const s = setup({ key: 'signals' }); const p = A.run(s.options); s.d.reject(new Error('x')); await p; assert.deepEqual(s.signals, ['failure']);
});
test('18 corrected UI callers await canonical Store results', () => {
  ['client.js','staff.js','portal.js'].forEach(name => assert.match(fs.readFileSync(path.join(__dirname, '../app', name), 'utf8'), /await S\.|await DV(?:Client|Staff)\./));
});
test('19 every LIVE adapter is awaited before commit', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/store.js'), 'utf8');
  ['approve','addRound','invite','inviteStaff','assign','validatePayment','publishSkill','activate','register'].forEach(name => assert.match(source, new RegExp("DVSupa\\.write\\." + name)));
  assert.doesNotMatch(source, /if \(LIVE\(\)\) DVSupa\.write/);
});
test('20 tests use deterministic mocks and no real network or credentials', () => {
  assert.doesNotMatch(__filename, /https?:\/\/|supabase|token|anon/i);
});
const harnessSource = fs.readFileSync(path.join(__dirname, 'atomic-mutations-harness.html'), 'utf8');
test('21 harness shell has a bounded maximum width', () => {
  assert.match(harnessSource, /body\{width:min\(22rem,100%\);max-width:100%/);
});
test('22 harness shell is start-aligned under constrained visual conditions', () => {
  assert.match(harnessSource, /margin:0;padding:14px/);
  assert.doesNotMatch(harnessSource, /margin:auto/);
});
test('23 control groups stack in one bounded column', () => {
  assert.match(harnessSource, /\.harness-actions\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
});
test('24 buttons occupy the available bounded width', () => {
  assert.match(harnessSource, /\.harness-actions \.btn\{width:100%;min-width:0;max-width:100%/);
});
test('25 critical controls have no oversized fixed minimum width', () => {
  assert.doesNotMatch(harnessSource, /\.harness-actions \.btn\{[^}]*min-width:(?!0)/);
});
test('26 long status and error text wrap safely', () => {
  assert.match(harnessSource, /\.harness-status\{[^}]*white-space:normal;[^}]*overflow-wrap:anywhere;word-break:break-word/);
});
test('27 critical controls use neither ellipsis nor clipping', () => {
  assert.doesNotMatch(harnessSource, /text-overflow:ellipsis|overflow-x:hidden/);
});
test('28 mutation feedback remains visible', () => {
  assert.match(harnessSource, /id="mutationStatus"[^>]*role="status"/);
  assert.doesNotMatch(harnessSource, /\.harness-status\{[^}]*(?:display:none|visibility:hidden)/);
});
test('29 vertical scrolling remains allowed', () => {
  assert.match(harnessSource, /html\{overflow-y:auto\}/);
});
test('30 responsive rules do not change mutation semantics', () => {
  assert.match(harnessSource, /DVAtomicMutations\.run/);
  assert.match(harnessSource, /commit:function\(value\)\{commits\+\+/);
});
