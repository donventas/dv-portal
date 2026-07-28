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
    return value && typeof value.then === 'function' ? value : Promise.resolve(value);
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
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar supabase-js'));
        document.head.appendChild(s);
      });
    }
    _client = window.supabase.createClient(CFG.URL, CFG.ANON, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true,
        storageKey: DVEnv.storageKey('supabase-auth')
      }
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
        options: { emailRedirectTo: location.href.split('#')[0] }
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
        options: { redirectTo: location.href.split('#')[0] }
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
      const c = await client(); checked(await c.auth.signOut()); return true;
    });
  }

  /* ── Lectura: hidrata window.DV_SEED con la forma del schema ───── */
  async function hydrate() {
    const c = await client();
    const T = async (name) => {
      const { data, error } = await c.from(name).select('*');
      if (error) throw new Error(name + ': ' + error.message);
      return data || [];
    };
    const [account, app_user, assignment, package_access, brand, project,
           block, round, preview, asset, invoice, skill] = await Promise.all([
      T('account'), T('app_user'), T('assignment'), T('package_access'), T('brand'),
      T('project'), T('block'), T('round'), T('preview'), T('asset'), T('invoice'), T('skill')
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

    const CAPAS = (window.DV_SEED && window.DV_SEED.CAPAS) || [];
    const nextSeed = {
      accounts: account, users, assignments: assignment, package_access,
      brands: brand, projects: project, blocks: block, rounds,
      previews: preview, assets: asset, invoices: invoice, skills: skill, CAPAS
    };
    Object.keys(window.DV_SEED).forEach(k => delete window.DV_SEED[k]);
    Object.assign(window.DV_SEED, nextSeed);
    return window.DV_SEED;
  }

  /* ── Escritura: persiste las mutaciones (el optimismo lo hace store.js) ─
       Fire-and-forget con manejo de error → toast. El RLS decide si procede. */
  function checked(result) {
    if (result && result.error) {
      const safe = new Error('BACKEND_WRITE_FAILED');
      safe.code = 'BACKEND_WRITE_FAILED';
      throw safe;
    }
    return result && result.data !== undefined ? result.data : true;
  }
  async function _c() { return client(); }

  const write = {
    approve(blockId) { return guarded('block.backend.approve', 'block', { resourceId: blockId, requiresAuth: true }, async () => checked(await (await _c()).from('block').update({ status: 'cerrado', progress: 100 }).eq('id', blockId).select().maybeSingle())); },

    addRound(blockId, seqInt, patch) {
      return guarded('round.backend.create', 'round', { resourceId: blockId, requiresAuth: true }, () => _c().then(async c => {
        const row = Object.assign({ block_id: blockId, seq: seqInt, result: 'propuesto' }, patch);
        checked(await c.from('round').insert(row));
        checked(await c.from('block').update({ status: 'en_revision' }).eq('id', blockId));
        return row;
      }));
    },

    invite(accId, email) { return guarded('invitation.backend.create', 'invitation', { resourceId: accId, requiresAuth: true, externallyVisible: true }, async () => checked(await (await _c()).from('invitation').insert({ account_id: accId, email, role: 'miembro' }).select().maybeSingle())); },
    inviteStaff(email) { return guarded('staff.backend.invite', 'invitation', { requiresAuth: true, externallyVisible: true }, async () => checked(await (await _c()).from('invitation').insert({ account_id: null, email, role: 'analista' }).select().maybeSingle())); },

    assign(accId, analystId) {
      return guarded('assignment.backend.upsert', 'assignment', { resourceId: accId, requiresAuth: true }, () => _c().then(async c => {
        const ex = await c.from('assignment').select('id').eq('account_id', accId).maybeSingle();
        checked(ex);
        if (ex.data) return checked(await c.from('assignment').update({ analyst_id: analystId }).eq('id', ex.data.id).select().maybeSingle());
        return checked(await c.from('assignment').insert({ account_id: accId, analyst_id: analystId }).select().maybeSingle());
      }));
    },

    validatePayment(invoiceId, accountId) {
      return guarded('payment.backend.validate', 'payment', { resourceId: invoiceId, requiresAuth: true, destructive: true, externallyVisible: true }, () => _c().then(async c => {
        const r1 = await c.from('invoice').update({ status: 'pagado', paid_at: new Date().toISOString() }).eq('id', invoiceId).select().maybeSingle();
        checked(r1);
        if (r1.data) checked(await c.from('payment').insert({ invoice_id: invoiceId, amount: r1.data.amount, provider: 'manual' }));
        return r1.data;
      }));
    },

    publishSkill(id, v) { return guarded('skill.backend.publish', 'skill', { resourceId: id, requiresAuth: true, externallyVisible: true }, async () => checked(await (await _c()).from('skill').update({ v }).eq('id', id).select().maybeSingle())); },

    register(name, segment, fit, queuePos) {
      return guarded('account.backend.register', 'account', { requiresAuth: true }, async () => checked(await (await _c()).from('account').insert({ name, segment, status: 'waitlist', queue_position: queuePos, fit, diag: 'hecho' }).select().maybeSingle()));
    },

    // Multi-fila y transaccional → RPC (04_rpc.sql). Devuelve el nuevo account_id.
    activate(accId, analystId) {
      return guarded('account.backend.activate', 'account', { resourceId: accId, requiresAuth: true, destructive: true, externallyVisible: true }, async () =>
        checked(await (await _c()).rpc('activate_account', { p_account: accId, p_analyst: analystId })));
    }
  };

  return { LIVE, BACKEND, client, signIn, signInWithGoogle, authUid, authEmail, signOut, hydrate, write };
})();
