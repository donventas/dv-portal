/* Don Ventas · Portal — Adaptador Supabase (F1)
   Reemplaza data/seed.js por consultas a las mismas tablas cuando hay config.
   El RLS aplica el alcance por rol; el front solo pinta lo que la base devuelve.

   ▸ MODO: app/environment.js valida la selección antes de permitir el cliente.
   URL + key nunca son suficientes para declarar LIVE.                           */

window.DVSupa = (function () {
  const CFG = window.DV_SUPA || { URL: '', ANON: '', BACKEND_ID: '' };
  const LIVE = () => !!(window.DVEnv && DVEnv.state() === DVEnv.STATES.LIVE);
  const BACKEND = () => !!(window.DVEnv && DVEnv.isBackend());
  const guarded = (action, resourceType, options, executor) => {
    if (!window.DVWriteGuard) return Promise.reject(new Error('WRITE_DIRECT_BYPASS_BLOCKED'));
    const value = DVWriteGuard.run(action, resourceType, options || {}, executor);
    return Promise.resolve(value).then(result => { if (result && result.authorized === false) throw new Error('WRITE_DENIED'); return result; });
  };

  let _client = null;
  let _clientFingerprint = null;
  async function client() {
    if (!BACKEND()) throw new Error('ENV_CLIENT_UNAVAILABLE');
    const resolution = DVEnv.resolution();
    if (!resolution.config || !resolution.fingerprint) throw new Error('ENV_UNRESOLVED');
    if (_client && _clientFingerprint === resolution.fingerprint) return _client;
    if (_client && _clientFingerprint !== resolution.fingerprint) {
      try { if (_client.removeAllChannels) await _client.removeAllChannels(); } catch (e) { }
      _client = null;
    }
    if (!window.supabase) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.min.js';
        s.integrity = 'sha384-UagCvVPT5XXA0Hx+nJYUAGBFseHT9zBgpJMSebsAxl9lciTwbT+39j5VfRjdP5Tp';
        s.crossOrigin = 'anonymous';
        s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar supabase-js'));
        document.head.appendChild(s);
      });
    }
    _client = window.supabase.createClient(CFG.URL, CFG.ANON, {
      auth: {
        persistSession: true,
        flowType: 'pkce',
        detectSessionInUrl: true,
        autoRefreshToken: true,
        storageKey: DVEnv.storageKey('supabase-auth')
      }
    });
    if (_client.auth.onAuthStateChange) _client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'SIGNED_IN') clearIdentity();
    });
    _clientFingerprint = resolution.fingerprint;
    return _client;
  }

  /* ── Auth (magic-link) ─────────────────────────────────────────── */
  async function signIn(email) {
    return guarded('auth.otp', 'auth-session', { externallyVisible: true }, async () => {
      const c = await client();
      const { error } = await c.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: new URL(location.href).origin + new URL(location.href).pathname }
      });
      if (error) throw error;
      return true;
    });
  }
  async function signInWithGoogle() {
    return guarded('auth.oauth', 'auth-session', { externallyVisible: true }, async () => {
      const c = await client();
      const { error } = await c.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: new URL(location.href).origin + new URL(location.href).pathname }
      });
      if (error) throw error;
      return true;
    });
  }
  async function authUid() {
    const c = await client();
    const { data: { user } } = await c.auth.getUser();
    return user ? user.id : null;
  }
  async function authEmail() {
    const c = await client();
    const { data: { user } } = await c.auth.getUser();
    return user ? user.email : null;
  }
  async function signOut() {
    return guarded('auth.signout', 'auth-session', { requiresAuth: true }, async () => {
      const c = await client(); const result = await c.auth.signOut(); if (!result || result.error) throw new Error('AUTH_SIGNOUT_FAILED'); return true;
    });
  }

  /* ── Lectura: hidrata window.DV_SEED con la forma del schema ───── */
  async function hydrate() {
    const c = await client();
    const startEpoch = epoch, fingerprint = DVEnv.fingerprint();
    const uid = await authUid();
    if (!uid) throw new Error('AUTH_REVALIDATION_REQUIRED');
    const T = async (name) => {
      const { data, error } = await c.from(name).select('*');
      if (error) throw new Error('BACKEND_READ_FAILED');
      return data || [];
    };
    const [account, app_user, assignment, package_access, brand, project,
           block, round, preview, asset, invoice, skill, lead] = await Promise.all([
      T('account'), T('app_user'), T('assignment'), T('package_access'), T('brand'),
      T('project'), T('block'), T('round'), T('preview'), T('asset'), T('invoice'), T('skill'),
      T('lead')
    ]);

    const users = app_user.map(u => ({
      id: u.id, account_id: u.account_id, email: u.email, name: u.name,
      role: u.role, member_role: u.member_role, pending: !!u.pending
    }));
    const rounds = round
      .slice().sort((a, b) => (a.seq || 0) - (b.seq || 0))
      .map(r => ({
        id: r.id, block_id: r.block_id, seq: 'R' + r.seq, title: r.title,
        deliverable: r.deliverable, feedback: r.feedback, result: r.result,
        created_at: r.created_at, author: r.author
      }));

    const feedback = DVEnv.resolution().config.features.h10Commands === 'verified-v1' ? await T('portal_feedback') : [];
    const CAPAS = (window.DV_SEED && window.DV_SEED.CAPAS) || [];
    const nextSeed = {
      feedback, accounts: account, users, assignments: assignment, package_access,
      brands: brand, projects: project, blocks: block, rounds,
      previews: preview, assets: asset, invoices: invoice, skills: skill, leads: lead, CAPAS
    };
    if (startEpoch !== epoch || fingerprint !== DVEnv.fingerprint() || uid !== await authUid()) throw new Error('IDENTITY_STALE');
    Object.keys(window.DV_SEED).forEach(k => delete window.DV_SEED[k]);
    Object.assign(window.DV_SEED, nextSeed);
    return window.DV_SEED;
  }

  /* H1 commands fail closed until the versioned backend contract is verified.
     No legacy multi-request mutation is a fallback. */
  function checked(result) {
    if (!result || result.error || result.data == null) { const safe = new Error('BACKEND_RESULT_REQUIRED'); throw safe; }
    return result.data;
  }
  const intentions = new Map();
  let epoch = 0;
  function clearIdentity() {
    epoch++; intentions.clear();
    if (window.DVStore) DVStore.logout();
    ['viewHost','modalHost','topBar','side'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    const app = document.getElementById('app'); if (app) app.classList.remove('on');
  }
  async function command(kind, resource, version, revision, payload) {
    return guarded(kind === 'approve' ? 'block.backend.approve' : kind === 'activate' ? 'account.backend.activate' : 'round.backend.create', kind === 'activate' ? 'account' : 'block', { resourceId: resource, requiresAuth: true }, async () => {
      const resolution = DVEnv.resolution();
      if (!resolution.config || !resolution.config.features || resolution.config.features.h10Commands !== 'verified-v1') throw new Error('BACKEND_CONTRACT_UNVERIFIED');
      if (!Number.isInteger(version) || version < 0 || (kind !== 'activate' && !revision)) throw new Error('EXPECTED_REVISION_REQUIRED');
      const c = await client();
      const startEpoch = epoch, fingerprint = DVEnv.fingerprint();
      const userResult = await c.auth.getUser();
      const user = userResult && !userResult.error && userResult.data && userResult.data.user;
      if (!user) { clearIdentity(); throw new Error('AUTH_REVALIDATION_REQUIRED'); }
      const actorResult = await c.from('app_user').select('*').eq('id', user.id).single();
      if (!actorResult || actorResult.error || !actorResult.data) { clearIdentity(); throw new Error('AUTH_REVALIDATION_REQUIRED'); }
      const actor = actorResult.data;
      const session = window.DVStore && DVStore.session();
      if (!session || actor.pending || actor.id !== session.userId || actor.account_id !== session.accountId || actor.role !== session.role || actor.member_role !== session.memberRole) {
        clearIdentity(); throw new Error('AUTH_REVALIDATION_REQUIRED');
      }
      const signature = JSON.stringify([fingerprint, user.id, actor.account_id, kind, resource, version, revision, payload]);
      if (!intentions.has(signature)) intentions.set(signature, crypto.randomUUID());
      let timer;
      const result = checked(await Promise.race([c.rpc('portal_command_v1', { p_key: intentions.get(signature), p_kind: kind, p_resource: resource, p_version: version, p_revision: revision, p_payload: payload }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('COMMAND_TIMEOUT')), 15000); })]).finally(() => clearTimeout(timer)));
      if (epoch !== startEpoch || fingerprint !== DVEnv.fingerprint()) throw new Error('IDENTITY_STALE');
      const row = kind === 'activate' ? result.account : result.block;
      if (result.contract !== 'portal-command-v1' || result.actor !== user.id || result.resource !== resource || !row || row.id !== resource || row.version !== version + 1 || (kind === 'approve' && row.status !== 'cerrado') || (kind === 'round' && (!result.round || result.round.block_id !== resource)) || (kind === 'feedback' && (!result.feedback || result.feedback.block_id !== resource || result.feedback.revision_id !== revision))) throw new Error('CANONICAL_RESULT_INVALID');
      return result;
    });
  }
  const unsupported = () => Promise.reject(new Error('BACKEND_ACTION_UNSUPPORTED'));
  const write = {
    approve: (id, version, revision) => command('approve', id, version, revision, {}),
    addRound: (id, seq, patch, version, revision) => command(patch.result === 'ajustes' ? 'feedback' : 'round', id, version, revision, { title: patch.title, deliverable: patch.deliverable, feedback: patch.feedback }),
    activate: (id, analyst, version) => command('activate', id, version, null, { analyst_id: analyst }),
    invite: unsupported, inviteStaff: unsupported, assign: unsupported,
    validatePayment: unsupported, publishSkill: unsupported, register: unsupported, updateLead: unsupported
  };
  if (window.DVEnv && DVEnv.subscribe) DVEnv.subscribe(snapshot => {
    if (snapshot.state === 'VALIDATING' || snapshot.state === 'BLOCKED') { epoch++; intentions.clear(); if (_client && _client.removeAllChannels) _client.removeAllChannels(); _client = null; _clientFingerprint = null; }
  });
  return { LIVE, BACKEND, client, signIn, signInWithGoogle, authUid, authEmail, signOut, hydrate, write };
})();
