/* Don Ventas · Portal — Adaptador Supabase (F1)
   Reemplaza data/seed.js por consultas a las mismas tablas cuando hay config.
   El RLS aplica el alcance por rol; el front solo pinta lo que la base devuelve.

   ▸ MODO: si DV_SUPA.URL y DV_SUPA.ANON están vacíos → DEMO (usa data/seed.js).
     Rellena ambos (Supabase → Project Settings → API) para pasar a EN VIVO.        */

window.DV_SUPA = {
  URL:  'https://hlabhmegjnrjygsywnqa.supabase.co',
  ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsYWJobWVnam5yanlnc3l3bnFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MjkzMjIsImV4cCI6MjA5OTQwNTMyMn0.75z2rT6h3uqxIHWdUFefxJTcJ9cI5hA1WK6BQzP-WyQ'
};

window.DVSupa = (function () {
  const CFG = window.DV_SUPA;
  const LIVE = () => !!(CFG.URL && CFG.ANON);

  let _client = null;
  async function client() {
    if (_client) return _client;
    if (!window.supabase) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar supabase-js'));
        document.head.appendChild(s);
      });
    }
    _client = window.supabase.createClient(CFG.URL, CFG.ANON, {
      auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
    });
    return _client;
  }

  /* ── Auth (magic-link) ─────────────────────────────────────────── */
  async function signIn(email) {
    const c = await client();
    const { error } = await c.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.href.split('#')[0] }
    });
    if (error) throw error;
    return true;
  }
  async function signInWithGoogle() {
    const c = await client();
    const { error } = await c.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.href.split('#')[0] }
    });
    if (error) throw error;
    return true;
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
  async function signOut() { const c = await client(); await c.auth.signOut(); }

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
    window.DV_SEED = {
      accounts: account, users, assignments: assignment, package_access,
      brands: brand, projects: project, blocks: block, rounds,
      previews: preview, assets: asset, invoices: invoice, skills: skill, CAPAS
    };
    return window.DV_SEED;
  }

  /* ── Escritura: persiste las mutaciones (el optimismo lo hace store.js) ─
       Fire-and-forget con manejo de error → toast. El RLS decide si procede. */
  function fail(op) { return (e) => { console.error('[supabase] ' + op, e); if (window.DVUtil) DVUtil.toast('No se guardó (' + op + ')'); }; }
  async function _c() { return client(); }

  const write = {
    approve(blockId) { _c().then(c => c.from('block').update({ status: 'cerrado', progress: 100 }).eq('id', blockId).then(r => r.error && fail('aprobar')(r.error))).catch(fail('aprobar')); },

    addRound(blockId, seqInt, patch) {
      _c().then(async c => {
        const row = Object.assign({ block_id: blockId, seq: seqInt, result: 'propuesto' }, patch);
        const r1 = await c.from('round').insert(row); if (r1.error) return fail('registrar ronda')(r1.error);
        await c.from('block').update({ status: 'en_revision' }).eq('id', blockId);
      }).catch(fail('registrar ronda'));
    },

    invite(accId, email) { _c().then(c => c.from('invitation').insert({ account_id: accId, email, role: 'miembro' }).then(r => r.error && fail('invitar')(r.error))).catch(fail('invitar')); },
    inviteStaff(email) { _c().then(c => c.from('invitation').insert({ account_id: null, email, role: 'analista' }).then(r => r.error && fail('invitar staff')(r.error))).catch(fail('invitar staff')); },

    assign(accId, analystId) {
      _c().then(async c => {
        const ex = await c.from('assignment').select('id').eq('account_id', accId).maybeSingle();
        if (ex.data) await c.from('assignment').update({ analyst_id: analystId }).eq('id', ex.data.id);
        else await c.from('assignment').insert({ account_id: accId, analyst_id: analystId });
      }).catch(fail('asignar'));
    },

    validatePayment(invoiceId, accountId) {
      _c().then(async c => {
        const r1 = await c.from('invoice').update({ status: 'pagado', paid_at: new Date().toISOString() }).eq('id', invoiceId).select().maybeSingle();
        if (r1.error) return fail('validar pago')(r1.error);
        if (r1.data) await c.from('payment').insert({ invoice_id: invoiceId, amount: r1.data.amount, provider: 'manual' });
      }).catch(fail('validar pago'));
    },

    publishSkill(id, v) { _c().then(c => c.from('skill').update({ v }).eq('id', id).then(r => r.error && fail('publicar skill')(r.error))).catch(fail('publicar skill')); },

    register(name, segment, fit, queuePos) {
      _c().then(c => c.from('account').insert({ name, segment, status: 'waitlist', queue_position: queuePos, fit, diag: 'hecho' }).then(r => r.error && fail('registrar marca')(r.error))).catch(fail('registrar marca'));
    },

    // Multi-fila y transaccional → RPC (04_rpc.sql). Devuelve el nuevo account_id.
    activate(accId, analystId) {
      return _c().then(c => c.rpc('activate_account', { p_account: accId, p_analyst: analystId }))
        .then(r => { if (r.error) fail('activar')(r.error); return r.data; })
        .catch(fail('activar'));
    }
  };

  return { LIVE, client, signIn, signInWithGoogle, authUid, authEmail, signOut, hydrate, write };
})();
