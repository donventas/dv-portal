const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness({ backend = true, denied = false, failure = false } = {}) {
  const calls = [];
  const box = { URL, location: { href: 'https://portal.example/entry?code=private-code#private-fragment' },
    document: { getElementById: () => null },
    DV_SUPA: { URL: 'https://synthetic.example', ANON: 'synthetic-public' },
    DVEnv: { STATES: {}, state: () => 'SANDBOX', isBackend: () => backend,
      resolution: () => ({ config: {}, fingerprint: 'test-only' }), storageKey: k => 'test-only:' + k },
    DVWriteGuard: { run: (action, type, options, execute) => { calls.push({ action, options }); return denied ? { authorized: false } : execute(); } },
    supabase: { createClient: (url, key, options) => {
      calls.push({ url, key, options });
      return { auth: {
        signInWithOtp: async value => { calls.push({ otp: value }); return { error: failure ? new Error('synthetic failure') : null }; },
        signInWithOAuth: async value => { calls.push({ oauth: value }); return { error: failure ? new Error('synthetic failure') : null }; }
      } };
    } }
  };
  box.window = box; vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/supabase.js'), 'utf8'), box);
  return { api: box.DVSupa, calls };
}
test('email login uses PKCE, refuses implicit signup and strips callback secrets', async () => {
  const h = harness(); assert.equal(await h.api.signIn('user@synthetic.invalid'), true);
  assert.equal(h.calls[1].options.auth.flowType, 'pkce');
  assert.equal(h.calls[1].options.auth.storageKey, 'test-only:supabase-auth');
  assert.equal(h.calls[2].otp.options.shouldCreateUser, false);
  assert.equal(h.calls[2].otp.options.emailRedirectTo, 'https://portal.example/entry');
  assert.equal(h.calls[0].options.externallyVisible, true);
});
test('OAuth uses the same clean callback and guarded action', async () => {
  const h = harness(); await h.api.signInWithGoogle();
  assert.equal(h.calls[0].action, 'auth.oauth');
  assert.equal(h.calls[2].oauth.options.redirectTo, 'https://portal.example/entry');
  assert.equal(h.calls[2].oauth.provider, 'google');
});
test('unavailable environment and denied guard never instantiate the SDK', async () => {
  for (const options of [{ backend: false }, { denied: true }]) {
    const h = harness(options); await assert.rejects(h.api.signIn('user@synthetic.invalid'));
    assert.equal(h.calls.length, 1);
  }
});
test('Auth rejection cannot report successful login request', async () => {
  const h = harness({ failure: true });
  await assert.rejects(h.api.signIn('user@synthetic.invalid'));
  await assert.rejects(h.api.signInWithGoogle());
});
test('administrative invitations remain disabled without explicit isolated capability admission', async () => {
  const h = harness();
  assert.equal(h.api.identity.enabled(), false);
  await assert.rejects(h.api.identity.directory('users'), /IDENTITY_CONTRACT_UNVERIFIED/);
  await assert.rejects(h.api.identity.invite('synthetic', 'person@synthetic.invalid', 'Synthetic reason'), /IDENTITY_CONTRACT_UNVERIFIED/);
  assert.equal(h.calls.length, 1);
});
