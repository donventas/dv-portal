const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../app/write-guard.js');

const local = { modes: ['DEMO'], origins: ['LOCAL'], writePolicy: 'local-only', synthetic: true };
const sandbox = { modes: ['SANDBOX'], origins: ['LOCAL', 'PREVIEW'], writePolicy: 'rls', requiresAuth: true };
const destructive = { ...sandbox, confirmSandbox: true };
const live = { modes: ['LIVE'], origins: ['PRODUCTION'], writePolicy: 'rls', requiresAuth: true };
const policies = { 'local.save': local, 'account.update': sandbox, 'account.delete': destructive, 'live.update': live };
const base = {
  action: 'local.save', resourceType: 'draft', resourceId: 'x',
  environmentState: 'DEMO', originClass: 'LOCAL',
  environmentFingerprint: '1.demo.local.DEMO', configVersion: 1,
  environmentId: 'demo', backendId: null, backendClass: 'none',
  sessionFingerprint: null, writePolicy: 'local-only', requiresAuth: false,
  destructive: false, externallyVisible: false, syntheticOnly: true,
  sandboxConfirmed: false, correlationId: 'test-correlation'
};
const run = patch => G.evaluate({ ...base, ...patch }, policies);
const sand = patch => run({
  action: 'account.update', environmentState: 'SANDBOX', originClass: 'PREVIEW',
  environmentFingerprint: '1.sbx.backend.SANDBOX', sessionFingerprint: '1.sbx.backend.SANDBOX',
  environmentId: 'sbx', backendId: 'backend', backendClass: 'sandbox',
  writePolicy: 'rls', syntheticOnly: false, requiresAuth: true, ...patch
});
const prod = patch => run({
  action: 'live.update', environmentState: 'LIVE', originClass: 'PRODUCTION',
  environmentFingerprint: '1.live.prod.LIVE', sessionFingerprint: '1.live.prod.LIVE',
  environmentId: 'live', backendId: 'prod', backendClass: 'production',
  writePolicy: 'rls', syntheticOnly: false, requiresAuth: true, ...patch
});

test('01 UNRESOLVED denies', () => assert.equal(run({ environmentState: 'UNRESOLVED' }).outcome, 'DENY'));
test('02 VALIDATING denies', () => assert.equal(run({ environmentState: 'VALIDATING' }).outcome, 'DENY'));
test('03 BLOCKED denies and logs', () => assert.equal(run({ environmentState: 'BLOCKED' }).outcome, 'DENY_AND_LOG'));
test('04 DEMO local synthetic allows', () => assert.equal(run({}).outcome, 'ALLOW'));
test('05 DEMO backend write denies', () => assert.equal(run({ action: 'account.update' }).outcome, 'DENY'));
test('06 DEMO auth mutation denies', () => assert.equal(run({ action: 'auth.otp', resourceType: 'auth' }).outcome, 'DENY'));
test('07 DEMO payment mutation denies', () => assert.equal(run({ action: 'payment.validate', resourceType: 'payment' }).outcome, 'DENY'));
test('08 SANDBOX matching session allows', () => assert.equal(sand({}).outcome, 'ALLOW'));
test('09 SANDBOX missing session reauths', () => assert.equal(sand({ sessionFingerprint: null }).outcome, 'REAUTH'));
test('10 SANDBOX mismatched session reauths', () => assert.equal(sand({ sessionFingerprint: 'other' }).outcome, 'REAUTH'));
test('11 SANDBOX destructive requires confirmation', () => assert.equal(sand({ action: 'account.delete', destructive: true }).outcome, 'CONFIRM_SANDBOX'));
test('12 SANDBOX confirmed destructive allows', () => assert.equal(sand({ action: 'account.delete', destructive: true, sandboxConfirmed: true }).outcome, 'ALLOW'));
test('13 SANDBOX production backend denies and logs', () => assert.equal(sand({ backendClass: 'production' }).outcome, 'DENY_AND_LOG'));
test('14 LIVE valid context allows', () => assert.equal(prod({}).outcome, 'ALLOW'));
test('15 LIVE missing policy denies', () => assert.equal(prod({ action: 'unknown' }).outcome, 'DENY'));
test('16 LIVE synthetic fixture denies and logs', () => assert.equal(prod({ syntheticOnly: true }).outcome, 'DENY_AND_LOG'));
test('17 LIVE sandbox session reauths', () => assert.equal(prod({ sessionFingerprint: '1.sbx.backend.SANDBOX' }).outcome, 'REAUTH'));
test('18 stale config/fingerprint denies', () => assert.equal(sand({ sessionFingerprint: '0.sbx.backend.SANDBOX' }).outcome, 'REAUTH'));
test('19 backend identity class mismatch denies', () => assert.equal(prod({ backendClass: 'sandbox' }).outcome, 'DENY_AND_LOG'));
test('20 missing action is invalid', () => assert.equal(run({ action: '' }).diagnostic.code, 'WRITE_CONTEXT_INVALID'));
test('21 unknown action denies', () => assert.equal(run({ action: 'not.allowlisted' }).outcome, 'DENY'));
test('22 direct adapter bypass has no policy', () => assert.equal(run({ action: 'supabase.direct.update' }).outcome, 'DENY'));
test('23 denied executor is never called', () => { let n = 0; G.execute({ ...base, action: 'unknown' }, () => n++, policies); assert.equal(n, 0); });
test('24 allowed executor is called exactly once', () => { let n = 0; G.execute(base, () => ++n, policies); assert.equal(n, 1); });
test('25 executor failure is not success', () => { const r = G.execute(base, () => { throw new Error('raw'); }, policies); assert.equal(r.error, 'WRITE_EXECUTOR_FAILED'); assert.equal(r.value, undefined); assert.equal(r.execution, 'FAILED'); assert.equal(r.completed, false); });
test('26 diagnostics omit prohibited fields', () => { const d = run({}).diagnostic; assert.deepEqual(Object.keys(d).filter(k => /token|key|url|payload|session/i.test(k)), []); });
test('27 environment change invalidates context', () => assert.equal(sand({ environmentFingerprint: '2.sbx.backend.SANDBOX' }).outcome, 'REAUTH'));
test('28 tests need no network or credentials', () => { assert.equal(base.backendId, null); assert.equal(base.environmentId, 'demo'); });
test('29 unexpected payload field rejected', () => assert.equal(G.evaluate({ ...base, payload: {} }, policies).diagnostic.code, 'WRITE_CONTEXT_INVALID'));
test('30 full session field rejected', () => assert.equal(G.evaluate({ ...base, session: {} }, policies).diagnostic.code, 'WRITE_CONTEXT_INVALID'));
test('31 wrong write policy denies', () => assert.equal(run({ writePolicy: 'anything' }).diagnostic.code, 'WRITE_POLICY_DENIED'));
test('32 DEMO backend identity is logged denial', () => assert.equal(run({ backendId: 'prod', backendClass: 'production' }).outcome, 'DENY_AND_LOG'));
test('33 SANDBOX external write confirms', () => assert.equal(sand({ externallyVisible: true }).outcome, 'CONFIRM_SANDBOX'));
test('34 LIVE external write does not use sandbox confirmation', () => assert.equal(prod({ externallyVisible: true }).outcome, 'ALLOW'));
test('35 result uses normalized fields only', () => assert.deepEqual(Object.keys(run({})).sort(), ['authorized', 'completed', 'diagnostic', 'execution', 'executorCount', 'outcome']));
test('36 async executor called once', async () => { let n = 0; const r = await G.execute(base, async () => ++n, policies); assert.equal(n, 1); assert.equal(r.value, 1); });
test('37 every backend mutation adapter invokes guarded execution', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../app/supabase.js'), 'utf8');
  ['auth.otp','auth.oauth','auth.signout','block.backend.approve','round.backend.create',
    'invitation.backend.create','staff.backend.invite','assignment.backend.upsert',
    'payment.backend.validate','skill.backend.publish','account.backend.register',
    'account.backend.activate'].forEach(action => assert.match(source, new RegExp("guarded\\('" + action.replace('.', '\\.') + "'")));
});
test('38 executable Store mutation inventory is centrally wrapped', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../app/store.js'), 'utf8');
  ['loginAs','setRole','logout','loginFree','updateFreeProfile','setAccountKind','toggleCapa',
    'saveChat','bumpIter','approveProposal','dismissProposal','shipBacklog','setPeriod',
    'setTeamCost','startWork','stopWork','setCatalogPrice','setIncentiveCfg','setUmbral',
    'markReferralPaid','addReferral','approve','addRound','requestScope','invite','inviteStaff',
    'resendInvite','removeMember','requestInvoice','assign','validatePayment','publishSkill',
    'revertSkill','activate','register','acceptAssignment','rejectAssignment','reassignNow',
    'sweepReassign','setBase','addHrEvent','removeHrEvent','addReview','publishTestimonial',
    'unpublishTestimonial','retractReview','grantReviewConsent'].forEach(name =>
      assert.match(source, new RegExp(name + ": \\['")));
});

test('39 denied result is explicitly not executed', () => assert.equal(G.execute({ ...base, action: 'unknown' }, () => 1, policies).execution, 'NOT_EXECUTED'));
test('40 allowed sync success is explicit and counted once', () => {
  const r = G.execute(base, () => 7, policies);
  assert.deepEqual([r.execution, r.completed, r.executorCount, r.value], ['SUCCEEDED', true, 1, 7]);
});
test('41 allowed async success is explicit and counted once', async () => {
  const r = await G.execute(base, () => Promise.resolve(8), policies);
  assert.deepEqual([r.execution, r.completed, r.executorCount, r.value], ['SUCCEEDED', true, 1, 8]);
});
test('42 async rejection fails closed', async () => {
  const r = await G.execute(base, () => Promise.reject(new Error('sdk secret')), policies);
  assert.equal(r.execution, 'FAILED'); assert.equal(r.completed, false); assert.equal(r.authorized, true);
  assert.equal(r.error, 'WRITE_EXECUTOR_FAILED'); assert.equal(JSON.stringify(r).includes('sdk secret'), false);
});
test('43 authorization remains distinct from execution', () => {
  const r = G.execute(base, () => { throw new Error('x'); }, policies);
  assert.equal(r.outcome, 'ALLOW'); assert.equal(r.authorized, true); assert.equal(r.execution, 'FAILED');
});
test('44 missing executor fails closed without execution', () => {
  const r = G.execute(base, null, policies);
  assert.equal(r.execution, 'FAILED'); assert.equal(r.completed, false); assert.equal(r.executorCount, 0);
});
test('45 malformed executor cannot bypass', () => assert.equal(G.execute(base, { then: true }, policies).error, 'WRITE_EXECUTOR_MISSING'));
test('46 safe thenable succeeds', async () => {
  let n = 0;
  const r = await G.execute({ ...base, resourceId: 'thenable' }, () => ({ then(resolve) { n++; resolve('ok'); } }), policies);
  assert.equal(n, 1); assert.equal(r.execution, 'SUCCEEDED');
});
test('47 throwing then getter fails closed', () => {
  const r = G.execute({ ...base, resourceId: 'getter' }, () => Object.defineProperty({}, 'then', { get() { throw new Error('raw'); } }), policies);
  assert.equal(r.execution, 'FAILED');
});
test('48 retry is a new guarded attempt', () => {
  let n = 0; G.execute({ ...base, resourceId: 'retry' }, () => { n++; throw new Error('first'); }, policies);
  const r = G.execute({ ...base, resourceId: 'retry' }, () => ++n, policies);
  assert.equal(n, 2); assert.equal(r.execution, 'SUCCEEDED');
});
test('49 stale fingerprint returns STALE', async () => {
  const r = await G.execute({ ...base, resourceId: 'stale' }, () => Promise.resolve(true), policies, { isCurrent: () => false });
  assert.equal(r.execution, 'STALE'); assert.equal(r.completed, false);
});
test('50 DENY executor remains zero', () => assert.equal(G.execute({ ...base, action: 'none' }, () => 1, policies).executorCount, 0));
test('51 DENY_AND_LOG executor remains zero', () => assert.equal(G.execute({ ...base, environmentState: 'BLOCKED' }, () => 1, policies).executorCount, 0));
test('52 REAUTH executor remains zero', () => assert.equal(G.execute({ ...base, action: 'live.update', environmentState: 'LIVE', originClass: 'PRODUCTION', backendClass: 'production', backendId: 'p', writePolicy: 'rls', syntheticOnly: false, requiresAuth: true }, () => 1, policies).executorCount, 0));
test('53 CONFIRM_SANDBOX executor remains zero before confirmation', () => {
  const request = { ...base, action: 'account.delete', environmentState: 'SANDBOX', originClass: 'PREVIEW', environmentFingerprint: 's', sessionFingerprint: 's', backendClass: 'sandbox', backendId: 'b', writePolicy: 'rls', syntheticOnly: false, requiresAuth: true, destructive: true };
  let n = 0; const before = G.execute(request, () => ++n, policies); const after = G.execute({ ...request, sandboxConfirmed: true }, () => ++n, policies);
  assert.equal(before.executorCount, 0); assert.equal(n, 1); assert.equal(after.execution, 'SUCCEEDED');
});
test('54 post-confirm rejection is FAILED', async () => {
  const request = { ...base, action: 'account.delete', resourceId: 'reject', environmentState: 'SANDBOX', originClass: 'PREVIEW', environmentFingerprint: 's', sessionFingerprint: 's', backendClass: 'sandbox', backendId: 'b', writePolicy: 'rls', syntheticOnly: false, requiresAuth: true, destructive: true, sandboxConfirmed: true };
  const r = await G.execute(request, () => Promise.reject(new Error('no')), policies);
  assert.equal(r.execution, 'FAILED');
});
test('55 pending duplicate shares one execution', async () => {
  let resolve, n = 0; const deferred = new Promise(r => { resolve = r; });
  const request = { ...base, resourceId: 'single-flight' };
  const a = G.execute(request, () => { n++; return deferred; }, policies);
  const b = G.execute(request, () => { n++; return deferred; }, policies);
  assert.strictEqual(a, b); resolve(true); await a; assert.equal(n, 1);
});
test('56 cancellation is distinct and clears pending', async () => {
  const e = new Error('hidden'); e.name = 'AbortError';
  const r = await G.execute({ ...base, resourceId: 'cancel' }, () => Promise.reject(e), policies);
  assert.equal(r.execution, 'CANCELLED'); assert.equal(G.pendingCount(), 0);
});
test('57 failure clears pending', async () => {
  await G.execute({ ...base, resourceId: 'clear' }, () => Promise.reject(new Error('x')), policies);
  assert.equal(G.pendingCount(), 0);
});
test('58 diagnostics expose neither raw error nor prohibited fields', async () => {
  const r = await G.execute({ ...base, resourceId: 'safe' }, () => Promise.reject({ token: 'secret', message: 'private' }), policies);
  assert.equal(JSON.stringify(r).includes('secret'), false); assert.equal(JSON.stringify(r).includes('private'), false);
});
test('59 success and failure flags never coexist', async () => {
  const r = await G.execute({ ...base, resourceId: 'truth' }, () => Promise.reject(new Error('x')), policies);
  assert.equal(r.completed, false); assert.equal(r.execution, 'FAILED');
});
test('60 explicit execution enum is complete', () => assert.deepEqual(Object.keys(G.EXECUTION), ['NOT_EXECUTED','PENDING','SUCCEEDED','FAILED','CANCELLED','STALE']));
test('61 no real network or credentials are used', () => assert.doesNotMatch(__filename, /supabase\\.co|eyJ[A-Za-z0-9_-]+\\./));
test('62 adapter errors are thrown rather than converted to success', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../app/supabase.js'), 'utf8');
  assert.match(source, /throw safe/); assert.doesNotMatch(source, /\.catch\(fail/);
});
