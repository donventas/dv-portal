const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const Env = require('../app/environment.js');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function harness({ mode = 'LIVE', enabled = true, rpc } = {}) {
  const calls = [], notices = [], routes = [], subscriptions = [];
  let authCallback, actor = { id: 'synthetic-owner-a', account_id: 'synthetic-a', name: 'Synthetic owner', role: 'cliente', member_role: 'owner', pending: false };
  const config = { configVersion: 'TEST', environmentId: 'TEST', backendId: mode === 'DEMO' ? '' : 'TEST', backendClass: mode === 'DEMO' ? 'none' : mode === 'LIVE' ? 'production' : 'sandbox', writePolicy: mode === 'DEMO' ? 'local-only' : 'rls', features: { h10Commands: enabled ? 'verified-v1' : false } };
  const storage = Env.createMemoryStorage();
  const box = { console, Map, Promise, setTimeout, clearTimeout, crypto: { randomUUID }, localStorage: storage,
    document: { getElementById: () => null },
    DVUtil: { toast: s => notices.push(s) },
    DVPortal: { go: s => routes.push(s) },
    DVEnv: { STATES: { LIVE: 'LIVE' }, state: () => mode, isDemo: () => mode === 'DEMO', isBackend: () => ['LIVE','SANDBOX'].includes(mode),
      fingerprint: () => 'TEST', resolution: () => ({ state: mode, originClass: mode === 'LIVE' ? 'PRODUCTION' : 'LOCAL', fingerprint: 'TEST', config }),
      storage: Env.scopedStorage(storage, 'TEST'), storageKey: k => k, validateSession: () => ({ ok: true }), subscribe: fn => subscriptions.push(fn) },
    supabase: { createClient: () => ({ auth: { getUser: async () => ({ data: { user: actor ? { id: actor.id } : null } }), signOut: async () => ({error:null}), onAuthStateChange: fn => { authCallback = fn; } },
      from: table => ({ select: () => ({ eq: () => ({ single: async () => ({ data: actor, error: null }) }) }) }),
      rpc: async (name, params) => { calls.push({ name, ...params }); return rpc ? rpc(params) : { data: { contract: 'portal-command-v1', actor: actor.id, resource: params.p_resource, block: { id: params.p_resource, status: 'cerrado', progress: 100, version: params.p_version + 1 } }, error: null }; }
    }) }
  };
  box.window = box;
  vm.createContext(box);
  for (const file of ['data/empty-state.js','app/atomic-mutations.js','app/write-guard.js','app/supabase.js']) vm.runInContext(source(file), box);
  // DEMO uses synthetic fixtures in the browser suite; this harness always creates two explicit tenants.
  box.DV_SEED = { accounts: [{ id: 'synthetic-a', version: 0 }, { id: 'synthetic-b', version: 0 }], users: [actor],
    brands: [], projects: [], package_access: [], assignments: [], blocks: [{ id: 'synthetic-block-a', version: 4, status: 'en_revision', progress: 30 }],
    rounds: [{ id: 'synthetic-revision-a', block_id: 'synthetic-block-a', seq: 'R1' }], skills: [], leads: [], assets: [], invoices: [], CAPAS: [] };
  vm.runInContext(source('app/store.js'), box);
  vm.runInContext(source('app/client.js'), box);
  box.DVStore.loginAs(actor);
  return { box, calls, notices, routes, subscriptions, setActor: a => { actor = a; }, authEvent: e => authCallback(e) };
}

for (const [label, response] of [
  ['zero rows', { data: null, error: null }],
  ['denial', { data: null, error: { message: 'synthetic private error' } }],
  ['stale version', { data: { contract: 'portal-command-v1', actor: 'synthetic-owner-a', resource: 'synthetic-block-a', block: { id: 'synthetic-block-a', status: 'cerrado', version: 4 } } }],
  ['wrong resource', { data: { contract: 'portal-command-v1', actor: 'synthetic-owner-a', resource: 'synthetic-block-b', block: { id: 'synthetic-block-b', version: 5 } } }]
]) test('adapter + Store + client UI: ' + label + ' never confirms approval', async () => {
  const h = harness({ rpc: async () => response });
  await h.box.DVClient.approve('synthetic-block-a');
  assert.equal(h.box.DVStore.block('synthetic-block-a').status, 'en_revision');
  assert.equal(h.routes.length, 0);
  assert.equal(h.notices.some(s => s.includes('Checkpoint aprobado')), false);
  assert.equal(h.calls.length, 1);
});

test('canonical approval commits the returned version and UI success', async () => {
  const h = harness(); await h.box.DVClient.approve('synthetic-block-a');
  assert.equal(h.box.DVStore.block('synthetic-block-a').version, 5);
  assert.equal(h.routes[0], 'tablero');
  assert.equal(h.calls[0].p_revision, 'synthetic-revision-a');
  assert.equal(h.calls[0].p_version, 4);
});
test('unverified contract performs no RPC and no local write', async () => {
  const h = harness({ enabled: false }); const r = await h.box.DVStore.approve('synthetic-block-a');
  assert.equal(r.status, 'FAILED'); assert.equal(h.calls.length, 0);
  assert.equal(h.box.DVStore.block('synthetic-block-a').status, 'en_revision');
});
test('demo-only mutations deny backend execution without changing state', async () => {
  const h = harness(); const before = JSON.stringify(h.box.DV_SEED);
  for (const [name, args] of [['setRole',['admin']],['setAccountKind',['synthetic-a','piloto']],['saveChat',['synthetic-a',[]]],['updateFreeProfile',[{ role: 'admin' }]],['removeMember',['synthetic-owner-a']],['validatePayment',['synthetic-invoice']]]) {
    const r = await h.box.DVStore[name](...args); assert.equal(r.authorized, false, name);
  }
  assert.equal(JSON.stringify(h.box.DV_SEED), before); assert.equal(h.calls.length, 0);
  assert.equal(h.box.DVStore.session().role, 'cliente');
});
test('legacy backend adapter paths reject instead of partially writing', async () => {
  const h = harness();
  for (const name of ['invite','inviteStaff','assign','validatePayment','publishSkill','register','updateLead']) await assert.rejects(h.box.DVSupa.write[name](), /BACKEND_ACTION_UNSUPPORTED/);
  assert.equal(h.calls.length, 0);
});
test('timeout/rejection retry retains the same intent key', async () => {
  let count = 0;
  const h = harness({ rpc: async p => { if (++count === 1) throw new Error('synthetic timeout'); return { data: { contract: 'portal-command-v1', actor: 'synthetic-owner-a', resource: p.p_resource, block: { id: p.p_resource, status: 'cerrado', version: 5 } } }; } });
  assert.equal((await h.box.DVStore.approve('synthetic-block-a')).status, 'FAILED');
  assert.equal((await h.box.DVStore.approve('synthetic-block-a')).status, 'SUCCEEDED');
  assert.equal(h.calls[0].p_key, h.calls[1].p_key);
});
test('switching identity while a request is pending never commits the old response', async () => {
  let complete, entered;
  const ready = new Promise(r => entered = r);
  const h = harness({ rpc: () => { entered(); return new Promise(r => complete = r); } });
  const task = h.box.DVStore.approve('synthetic-block-a'); await ready;
  h.box.DVStore.loginAs({ id: 'synthetic-owner-b', account_id: 'synthetic-b', role: 'cliente', member_role: 'owner' });
  complete({ data: { contract: 'portal-command-v1', actor: 'synthetic-owner-a', resource: 'synthetic-block-a', block: { id: 'synthetic-block-a', version: 5, status: 'cerrado' } } });
  const result = await task; assert.notEqual(result.status, 'SUCCEEDED');
  assert.equal(h.box.DV_SEED.blocks.length, 0);
});
test('revoked actor fails before the command and clears data', async () => {
  const h = harness(); h.setActor(null);
  assert.notEqual((await h.box.DVStore.approve('synthetic-block-a')).status, 'SUCCEEDED');
  assert.equal(h.calls.length, 0); assert.equal(h.box.DV_SEED.blocks.length, 0);
  assert.equal(h.box.DVStore.session(), null);
});
test('auth signout from another tab clears local data and caches', async () => {
  const h = harness(); await h.box.DVSupa.client();
  h.box.localStorage.setItem('dvportal:TEST:chats', 'legacy-synthetic');
  h.authEvent('SIGNED_OUT');
  assert.equal(h.box.DVStore.session(), null); assert.equal(h.box.DV_SEED.accounts.length, 0);
  assert.equal(h.box.localStorage.getItem('dvportal:TEST:chats'), null);
});
test('DEMO cache is partitioned by user and tenant and purged on logout', () => {
  const h = harness({ mode: 'DEMO' });
  h.box.DVStore.saveChat('synthetic-a', ['synthetic-message']);
  h.box.DVStore.loginAs({ id: 'synthetic-owner-b', account_id: 'synthetic-b', role: 'cliente', member_role: 'owner' });
  assert.equal(h.box.DVStore.chatOf('synthetic-a').length, 0);
  h.box.DVStore.logout(); assert.equal(h.box.localStorage.length, 0);
});
test('environment validation clears existing backend state', () => {
  const h = harness(); h.subscriptions.forEach(fn => fn({ state: 'VALIDATING' }));
  assert.equal(h.box.DVStore.session(), null); assert.equal(h.box.DV_SEED.blocks.length, 0);
});
test('fixture self-guard denies direct execution in every non-DEMO mode', () => {
  for (const mode of ['BLOCKED','SANDBOX','LIVE']) {
    const box = { window: null, DVEnv: { isDemo: () => false } }; box.window = box;
    assert.throws(() => vm.runInNewContext(source('data/seed.js'), box), /FIXTURES_DEMO_ONLY/, mode);
    assert.equal(box.DV_SEED, undefined);
  }
});
test('feedback returns a versioned event without fabricating a new round', async () => {
  const h = harness({ rpc: async p => ({ data: { contract: 'portal-command-v1', actor: 'synthetic-owner-a', resource: p.p_resource,
    block: { id: p.p_resource, version: 5, status: 'en_curso' }, feedback: { id: 'synthetic-feedback', block_id: p.p_resource, revision_id: p.p_revision } } }) });
  const r = await h.box.DVStore.addRound('synthetic-block-a', { result: 'ajustes', feedback: 'Synthetic adjustment' });
  assert.equal(r.status, 'SUCCEEDED'); assert.equal(h.box.DV_SEED.rounds.length, 1);
  assert.equal(h.box.DV_SEED.feedback.length, 1); assert.equal(h.calls[0].p_kind, 'feedback');
});
test('round rejection never leaves a fabricated round or changes the block', async () => {
  const h = harness({ rpc: async () => ({ data:null,error:{message:'synthetic transaction failure'} }) });
  const r = await h.box.DVStore.addRound('synthetic-block-a',{title:'Synthetic round'});
  assert.notEqual(r.status,'SUCCEEDED'); assert.equal(h.box.DV_SEED.rounds.length,1);
  assert.equal(h.box.DVStore.block('synthetic-block-a').version,4);
});
test('real timeout path fails closed and reuses the key on retry', async () => {
  const h = harness({ rpc: () => new Promise(() => {}) });
  h.box.setTimeout = fn => { Promise.resolve().then(fn); return 1; };
  h.box.clearTimeout = () => {};
  assert.equal((await h.box.DVStore.approve('synthetic-block-a')).status,'FAILED');
  assert.equal((await h.box.DVStore.approve('synthetic-block-a')).status,'FAILED');
  assert.equal(h.calls[0].p_key,h.calls[1].p_key);
});
test('unsupported UI actions never announce success or send external requests', () => {
  const h = harness();
  h.box.DVClient.retirarReview('synthetic-review');
  h.box.DVClient.submitSurvey();
  assert.equal(h.notices.length,2);
  assert.equal(h.notices.every(s => s.includes('solo en DEMO')),true);
  assert.equal(h.calls.length,0);
});
test('profile authority drift invalidates actor state before RPC', async () => {
  const h = harness(); h.setActor({id:'synthetic-owner-a',account_id:'synthetic-b',role:'cliente',member_role:'owner',pending:false});
  const r = await h.box.DVStore.approve('synthetic-block-a');
  assert.notEqual(r.status,'SUCCEEDED'); assert.equal(h.box.DVStore.session(),null);
  assert.equal(h.calls.length,0); assert.equal(h.box.DV_SEED.blocks.length,0);
});
test('pending actor cannot submit a command', async () => {
  const h = harness(); h.setActor({id:'synthetic-owner-a',account_id:'synthetic-a',role:'cliente',member_role:'owner',pending:true});
  assert.notEqual((await h.box.DVStore.approve('synthetic-block-a')).status,'SUCCEEDED');
  assert.equal(h.calls.length,0); assert.equal(h.box.DVStore.session(),null);
});
test('identity switch resets client transient drafts and backend preferences stay ephemeral', () => {
  const h = harness(); let resets=0;
  h.box.DVClient.resetTransient = () => resets++;
  h.box.DVStore.savePreference('synthetic-view','synthetic-a');
  h.box.DVStore.loginAs({id:'synthetic-owner-b',account_id:'synthetic-b',role:'cliente',member_role:'owner'});
  assert.equal(resets,1); assert.equal(h.box.DVStore.getPreference('synthetic-view'),null);
});
test('signout can finish after intentional local session purge and needs no business row', async () => {
  const h = harness();
  const signingOut = h.box.DVSupa.signOut(); h.box.DVStore.logout();
  assert.equal(h.box.DVStore.session(),null); assert.equal(h.box.DV_SEED.accounts.length,0);
  assert.equal(await signingOut,true);
});
