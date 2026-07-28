/* Don Ventas · Portal — Store (sesión + capa de datos con RLS por rol)
   Espeja lo que hará Supabase: cada consulta se resuelve según el actor de sesión.
   - cliente: solo su account_id (+ member_role para facturación)
   - analista: solo cuentas asignadas
   - admin: todo
   El estado muta en memoria (demo) y persiste solo la sesión en localStorage.  */
window.DVStore = (function () {
  const S = window.DV_SEED;
  const LIVE = () => window.DVSupa && DVSupa.BACKEND();
  const STORAGE = window.DVEnv && DVEnv.storage;
  const listeners = [];
  let session = null; // { userId, role, accountId, memberRole, actor:'cliente'|'staff' }

  /* ── sesión ── */
  function loadSession() {
    try {
      const raw = STORAGE && STORAGE.getItem('session');
      if (raw) {
        const saved = JSON.parse(raw);
        if (DVEnv.validateSession(saved).ok) session = saved.value;
        else STORAGE.removeItem('session');
      }
    } catch (e) { }
    return session;
  }
  function saveSession() {
    try {
      if (!STORAGE) return;
      session
        ? STORAGE.setItem('session', JSON.stringify({ environmentFingerprint: DVEnv.fingerprint(), value: session }))
        : STORAGE.removeItem('session');
    } catch (e) { }
  }
  function userByEmail(email) { return S.users.find(u => u.email.toLowerCase() === String(email).toLowerCase()); }
  function loginAs(user) {
    session = { userId: user.id, role: user.role, accountId: user.account_id, memberRole: user.member_role, actor: user.role === 'cliente' ? 'cliente' : 'staff', environmentFingerprint: DVEnv.fingerprint() };
    saveSession(); emit();
  }
  function setRole(role) { // demo: cambia rol dentro del mismo actor
    if (!session) return;
    if (session.actor === 'cliente') { session.memberRole = role; }
    else { session.role = role; session.userId = role === 'admin' ? 'u-arturo' : 'u-luis'; }
    saveSession(); emit();
  }
  function logout() { session = null; saveSession(); emit(); }
  function me() { if (session && session.actor === 'freemium') return { name: (session.profile && session.profile.person) || (session.profile && session.profile.business) || 'Invitado', email: session.email }; return S.users.find(u => u.id === (session && session.userId)); }
  function isAdmin() { return session && session.actor === 'staff' && session.role === 'admin'; }
  function isAnalyst() { return session && session.actor === 'staff'; }
  function isOwner() { return session && session.actor === 'cliente' && session.memberRole === 'owner'; }
  function isFree() { return session && session.actor === 'freemium'; }

  /* ── freemium (huérfano / sin plan · D-07) ── */
  function loginFree(profile) { session = { actor: 'freemium', email: (profile && profile.email) || '', profile: profile || {}, environmentFingerprint: DVEnv.fingerprint() }; saveSession(); emit(); }
  function freeProfile() { return session && session.actor === 'freemium' ? session.profile : null; }
  function updateFreeProfile(patch) { if (session && session.actor === 'freemium') { session.profile = Object.assign({}, session.profile, patch); saveSession(); emit(); } }

  /* ── alcance (RLS) ── */
  function scopedAccountIds() {
    if (!session) return [];
    if (session.actor === 'cliente') return [session.accountId];
    if (isAdmin()) return S.accounts.map(a => a.id);
    // analista: cuentas asignadas
    return S.assignments.filter(a => a.analyst_id === session.userId).map(a => a.account_id);
  }
  function accounts() { const ids = scopedAccountIds(); return S.accounts.filter(a => ids.indexOf(a.id) >= 0 && a.status === 'activo'); }
  function waitlist() { return isAdmin() ? S.accounts.filter(a => a.status === 'waitlist').sort((a, b) => a.queue_position - b.queue_position) : []; }
  function finished() { const ids = scopedAccountIds(); return S.accounts.filter(a => ids.indexOf(a.id) >= 0 && a.status === 'finalizado').sort((a, b) => Date.parse(b.finished_at || 0) - Date.parse(a.finished_at || 0)); }
  function historyAccounts() { const ids = scopedAccountIds(); return S.accounts.filter(a => ids.indexOf(a.id) >= 0 && (a.status === 'activo' || a.status === 'finalizado')); }
  function analystsLoad() { return staff().map(u => { const load = activeLoadOf(u.id), base = baseOf(u.id); return { id: u.id, name: u.name, first: u.name.split(' ')[0], role: u.role, load, tope: base, base, monthCount: load, atBase: load >= base, founder: isFounder(u.id), pending: pendingCountOf(u.id) }; }).sort((a, b) => (a.load / a.base) - (b.load / b.base)); }
  /* Tope de capas por tipo de cuenta: el tipo fija el TECHO de servicio que puede
     ver el cliente. Cliente = completo · Piloto = sin Activación · Demostración = solo Fundación. */
  const KIND_CAPAS = { cliente: ['Fundación', 'Sistema', 'Activación'], piloto: ['Fundación', 'Sistema'], demostracion: ['Fundación'] };
  function kindCeiling(kind) { return KIND_CAPAS[kind] || KIND_CAPAS.cliente; }
  /* Capas de servicio contratadas por cuenta (Fundación · Sistema · Activación) →
     qué secciones del portal desbloquea cada una para el cliente. */
  const CAPA_SECTIONS = { 'Fundación': ['tablero', 'bitacora'], 'Sistema': ['previews'], 'Activación': ['generadores'] };
  function _pruneToKind(accId, kind) { const acc = access(accId); if (!acc) return; const allow = kindCeiling(kind); Object.keys(CAPA_SECTIONS).forEach(name => { if (name !== 'Fundación' && allow.indexOf(name) < 0) { const need = CAPA_SECTIONS[name]; acc.sections = acc.sections.filter(s => need.indexOf(s) < 0); } }); }
  function setAccountKind(id, kind) { const a = account(id); if (!a) return; a.kind = kind; _pruneToKind(id, kind); emit(); }
  function accountCapas(accId) { const acc = access(accId); const secs = (acc && acc.sections) || []; const a = account(accId); const allow = kindCeiling(a && a.kind); return (S.CAPAS || []).map(c => { const need = CAPA_SECTIONS[c.name] || []; const allowedByKind = allow.indexOf(c.name) >= 0; return { name: c.name, d: c.d, sections: need, base: c.name === 'Fundación', allowedByKind: allowedByKind, enabled: allowedByKind && need.every(s => secs.indexOf(s) >= 0) }; }); }
  function toggleCapa(accId, name) { const acc = access(accId); if (!acc || name === 'Fundación') return; const a = account(accId); if (kindCeiling(a && a.kind).indexOf(name) < 0) return; const need = CAPA_SECTIONS[name] || []; const on = need.every(s => acc.sections.indexOf(s) >= 0); if (on) acc.sections = acc.sections.filter(s => need.indexOf(s) < 0); else need.forEach(s => { if (acc.sections.indexOf(s) < 0) acc.sections.push(s); }); emit(); }
  function account(id) { return S.accounts.find(a => a.id === id); }
  function brandOf(accId) { return S.brands.find(b => b.account_id === accId); }
  function projectOf(accId) { const b = brandOf(accId); return b && S.projects.find(p => p.brand_id === b.id); }
  function access(accId) { return S.package_access.find(p => p.account_id === accId); }
  function analystName(accId) { const a = S.assignments.find(x => x.account_id === accId); const u = a && S.users.find(y => y.id === a.analyst_id); return u ? u.name.split(' ')[0] : '—'; }

  function blocksOf(accId) { const p = projectOf(accId); return p ? S.blocks.filter(b => b.project_id === p.id) : []; }
  function block(id) { return S.blocks.find(b => b.id === id); }
  function roundsOf(blockId) { return S.rounds.filter(r => r.block_id === blockId); }
  function allRounds(accId) {
    const p = projectOf(accId); if (!p) return [];
    const ids = S.blocks.filter(b => b.project_id === p.id).map(b => b.id);
    return S.rounds.filter(r => ids.indexOf(r.block_id) >= 0).slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }
  function previewOf(blockId) { return S.previews.find(p => p.block_id === blockId && !p.merged); }

  /* ── Chat con El Don · persiste por bloque (F2 Parte B) ── */
  let _chats = null, _iters = null;
  function _loadChats() { if (_chats) return; try { _chats = JSON.parse(STORAGE.getItem('chats') || '{}'); } catch (e) { _chats = {}; } }
  function _saveChats() { try { STORAGE.setItem('chats', JSON.stringify(_chats)); } catch (e) { } }
  function _loadIters() { if (_iters) return; try { _iters = JSON.parse(STORAGE.getItem('iters') || '{}'); } catch (e) { _iters = {}; } }
  function _saveIters() { try { STORAGE.setItem('iters', JSON.stringify(_iters)); } catch (e) { } }
  function chatOf(blockId) { _loadChats(); return (_chats[blockId] || []).slice(); }
  function saveChat(blockId, arr) { _loadChats(); _chats[blockId] = arr; _saveChats(); }
  function iterOf(blockId) { _loadIters(); return _iters[blockId] || 0; }
  function bumpIter(blockId) { _loadIters(); _iters[blockId] = (_iters[blockId] || 0) + 1; _saveIters(); return _iters[blockId]; }
  function assetsOf(blockId) { return S.assets.filter(a => a.block_id === blockId); }
  /* Todos los archivos de la cuenta (centro de descargas del cliente), enriquecidos con
     su bloque y su clase de activo. Disponibilidad según el modelo de 3 clases:
     direccion = incluido siempre · produccion = al liquidar el bloque · generador = con retainer. */
  function assetsAllOf(accId) {
    const acc = account(accId), paidAll = balance(accId) === 0;
    const acc_access = S.package_access.find(p => p.account_id === accId) || { sections: [] };
    const retainer = !!(acc && acc.mrr > 0) && acc_access.sections.indexOf('generadores') >= 0;
    return blocksOf(accId).reduce((out, b) => out.concat(assetsOf(b.id).map(a => {
      const cls = a.cls || (a.locked ? 'produccion' : 'direccion');
      let available, reason;
      if (cls === 'direccion') { available = true; reason = 'Incluido siempre'; }
      else if (cls === 'generador') { available = retainer; reason = retainer ? 'Activo con tu retainer' : 'Se reactiva con tu retainer'; }
      else { available = !a.locked; reason = a.locked ? 'Se desbloquea al liquidar el bloque' : 'Disponible'; }
      return Object.assign({}, a, { cls, available, reason, code: b.code, blockTitle: b.title, capa: b.capa, blockStatus: b.status });
    })), []);
  }
  function invoicesOf(accId) { return S.invoices.filter(i => i.account_id === accId); }
  function balance(accId) { return invoicesOf(accId).filter(i => i.status !== 'pagado').reduce((s, i) => s + i.amount, 0); }
  function membersOf(accId) { return S.users.filter(u => u.account_id === accId); }

  /* staff-wide */
  function queue() { const ids = scopedAccountIds(); return S.blocks.filter(b => ['en_curso', 'pendiente'].indexOf(b.status) >= 0 && ids.indexOf(accIdOfBlock(b)) >= 0); }
  function accIdOfBlock(b) { const p = S.projects.find(x => x.id === b.project_id); const br = p && S.brands.find(y => y.id === p.brand_id); return br && br.account_id; }
  function acctNameOfBlock(b) { const a = account(accIdOfBlock(b)); return a ? a.name : ''; }
  function staff() { return S.users.filter(u => u.role === 'analista' || u.role === 'admin'); }
  /* ── skill (motor) · versión + historial persistente (F2 Parte C) ── */
  let _skillMeta = null;
  function _loadSkillMeta() { if (_skillMeta) return; try { _skillMeta = JSON.parse(STORAGE.getItem('skills') || '{}'); } catch (e) { _skillMeta = {}; } }
  function _saveSkillMeta() { try { STORAGE.setItem('skills', JSON.stringify(_skillMeta)); } catch (e) { } }
  function skills() {
    _loadSkillMeta();
    return S.skills.map(s => {
      const m = _skillMeta[s.id];
      return m ? Object.assign({}, s, { v: m.v, note: m.note, history: m.history || [] }) : Object.assign({}, s, { history: [] });
    });
  }
  function skillHistory(id) { _loadSkillMeta(); const m = _skillMeta[id]; return (m && m.history) ? m.history.slice() : []; }
  function _bumpVersion(v) { const p = String(v).split('.'); p[p.length - 1] = (parseInt(p[p.length - 1], 10) + 1); return p.join('.'); }
  function _curV(id) { _loadSkillMeta(); const m = _skillMeta[id]; const s = S.skills.find(x => x.id === id); return m ? m.v : (s ? s.v : '1.0'); }

  /* ── Aprendizaje del Motor · feedback → propuesta → backlog (F2 Parte D) ──
     La skill reúne SOLA el historial de entregable + veredicto + feedback del cliente
     (de todas las cuentas) y sintetiza una propuesta de mejora que el admin aprueba
     y manda al backlog. Todo deriva de rounds; nada se inventa fuera de la evidencia. */
  function _skillForCode(code) { if (/^F1/.test(code)) return 'sk-1'; if (code === 'F2') return 'sk-3'; return 'sk-2'; }
  const _LEVERS = [
    { re: /ruta|variante|eleg|opci[oó]n/i, change: 'Presentar siempre 2–3 rutas nombradas y dejar que el cliente elija; nunca una sola variante.' },
    { re: /conservar|original|anterior|me gustaba|volver/i, change: 'Preservar la versión aprobada como opción por defecto al iterar; mostrar comparativa lado a lado antes de reemplazar.' },
    { re: /hero|portada/i, change: 'Estandarizar el patrón de hero premium (aire alto, chevron como único acento) como punto de partida.' },
    { re: /aire|espacio|premium|sobrio|densidad/i, change: 'Subir el aire por defecto y bajar la densidad — registro de salida más sobrio.' },
    { re: /color|azul|naranja|paleta/i, change: 'Endurecer las guardas de paleta (negro-azul, acento único) en la generación.' },
    { re: /chevron|logo|isotipo|grosor/i, change: 'Validar automáticamente el grosor canónico del isotipo antes de proponer.' }
  ];
  const _AJUSTE_LEVER = 'Añadir un checkpoint intermedio de afinamiento antes de dar el bloque por cerrado.';
  function skillSignals(id) {
    return S.rounds.map(r => { const b = block(r.block_id); if (!b || _skillForCode(b.code) !== id) return null;
      return { acct: acctNameOfBlock(b), code: b.code, title: b.title, deliverable: r.deliverable, result: r.result, feedback: r.feedback, at: r.created_at, rid: r.id }; })
      .filter(Boolean).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }
  function skillProposal(id) {
    const sig = skillSignals(id);
    const improv = sig.filter(s => s.feedback && s.feedback !== '—' && (s.result === 'ajustes' || _LEVERS.some(l => l.re.test(s.feedback))));
    if (!improv.length) return null;
    const counts = {};
    improv.forEach(s => { _LEVERS.forEach(l => { if (l.re.test(s.feedback || '')) counts[l.change] = (counts[l.change] || 0) + 1; }); if (s.result === 'ajustes') counts[_AJUSTE_LEVER] = (counts[_AJUSTE_LEVER] || 0) + 1; });
    const changes = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
    return { skillId: id, changes: changes.length ? changes : [_AJUSTE_LEVER], evidence: improv, n: improv.length, approvals: sig.filter(s => s.result === 'aprobado').length, total: sig.length, targetV: _bumpVersion(_curV(id)), signature: improv.map(s => s.rid).sort().join(',') };
  }
  let _backlog = null;
  function _loadBacklog() { if (_backlog) return; try { _backlog = JSON.parse(STORAGE.getItem('backlog') || '{"items":[],"dismissed":{}}'); } catch (e) { _backlog = { items: [], dismissed: {} }; } }
  function _saveBacklog() { try { STORAGE.setItem('backlog', JSON.stringify(_backlog)); } catch (e) { } }
  function backlog() { _loadBacklog(); return _backlog.items.slice(); }
  function proposalState(id) {
    _loadBacklog(); const p = skillProposal(id); if (!p) return { status: 'none' };
    const item = _backlog.items.find(x => x.skillId === id && x.signature === p.signature);
    if (item) return { status: 'approved', p, item };
    if (_backlog.dismissed[id] === p.signature) return { status: 'dismissed', p };
    return { status: 'pending', p };
  }
  function pendingMejoras() { return isAdmin() ? S.skills.filter(s => proposalState(s.id).status === 'pending').length : 0; }
  function approveProposal(id) {
    _loadBacklog(); const p = skillProposal(id); if (!p) return; const s = S.skills.find(x => x.id === id);
    _backlog.items.unshift({ id: 'bl-' + Date.now(), skillId: id, skillName: s ? s.n : id, targetV: p.targetV, changes: p.changes, evidence: p.evidence, signature: p.signature, status: 'backlog', at: new Date().toISOString(), by: (me() || {}).name || 'Admin' });
    delete _backlog.dismissed[id]; _saveBacklog(); emit();
  }
  function dismissProposal(id) { _loadBacklog(); const p = skillProposal(id); if (!p) return; _backlog.dismissed[id] = p.signature; _saveBacklog(); emit(); }
  function shipBacklog(itemId) {
    _loadBacklog(); const it = _backlog.items.find(x => x.id === itemId); if (!it || it.status === 'publicada') return;
    publishSkill(it.skillId, 'Backlog: ' + it.changes[0]);
    it.status = 'publicada'; it.shipped_at = new Date().toISOString(); it.shippedV = _curV(it.skillId); _saveBacklog(); emit();
  }
  function billingAll() { const ids = scopedAccountIds(); return S.invoices.filter(i => ids.indexOf(i.account_id) >= 0); }

  /* ── Utilidad por cliente · consumo de Claude (dato de FUNDADOR · solo admin) ──
     Espeja migrations/06_usage.sql: costo por modelo × tokens → cost_mxn, y
     margin_pre_labor = ingreso liquidado − costo de Claude. No descuenta capacidad
     humana (no vive en la base). RLS real = solo-admin; aquí gateado por isAdmin(). */
  const CLAUDE_FX = 18; // USD→MXN demo (en vivo: env USD_MXN_FX o feed)
  const CLAUDE_PRICES = { // USD por 1M tokens (verificar contra tarifa vigente)
    'claude-sonnet-4-5': { in: 3, out: 15, cr: 0.30 },
    'claude-opus-4-1': { in: 15, out: 75, cr: 1.50 },
    'claude-haiku-4-5': { in: 1, out: 5, cr: 0.10 },
    _default: { in: 3, out: 15, cr: 0.30 }
  };
  function _usdOf(u) { const p = CLAUDE_PRICES[u.model] || CLAUDE_PRICES._default; return (u.input_tokens || 0) * p.in / 1e6 + (u.output_tokens || 0) * p.out / 1e6 + (u.cache_read_tokens || 0) * p.cr / 1e6; }
  function claudeUsage() { return (S.claude_usage || []).slice(); }
  function _claudeMxnOf(accId) { return claudeUsage().filter(u => u.account_id === accId).reduce((s, u) => s + _usdOf(u), 0) * CLAUDE_FX; }
  /* ── Periodo (regla: cifras juntas = misma base) ─────────────────────────────
     base: 'mensual' (un mes) | 'acumulado' (running total a la fecha).
     span: trimestral|semestral|anual — SOLO aplica a acumulado (ventana de acumulación).
     anchor: índice de mes (0 = mes actual, 1 = mes anterior…) → mensual: qué mes;
             acumulado: mes de corte (hasta). Escala solo cifras de dinero; capacidad/
             utilización es tasa mensual y no se escala. */
  const PERIOD_MONTHS = { trimestral: 3, semestral: 6, anual: 12 };
  let _period = null;
  function periodMonths() { const out = []; const now = new Date(); for (let i = 0; i < 6; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ i, ts: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime(), label: d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }) }); } return out; }
  function _anchorTs(anchor) { const m = periodMonths(); return (m[anchor] || m[0]).ts; }
  function getPeriod() { if (!_period) { try { _period = JSON.parse(STORAGE.getItem('period') || 'null'); } catch (e) { } _period = _period || { base: 'mensual', span: 'trimestral', anchor: 0 }; if (['trimestral', 'semestral', 'anual'].indexOf(_period.span) < 0) _period.span = 'trimestral'; } return _period; }
  function setPeriod(patch) { _period = Object.assign(getPeriod(), patch); try { STORAGE.setItem('period', JSON.stringify(_period)); } catch (e) { } emit(); }
  function periodLabel() { const p = getPeriod(), mo = (periodMonths()[p.anchor] || periodMonths()[0]).label; return p.base === 'mensual' ? ('mensual · ' + mo) : ('acum. ' + p.span + ' · a ' + mo); }
  function monthsActiveOf(acc, atTs) { const a = typeof acc === 'string' ? account(acc) : acc; if (!a || !a.created_at) return 0; return Math.max(0, Math.round(((atTs || Date.now()) - Date.parse(a.created_at)) / (30 * 864e5))); }
  function _pf(a) { const p = getPeriod(), at = _anchorTs(p.anchor); if (Date.parse(a.created_at || 0) > at) return 0; if (p.base === 'mensual') return 1; return Math.min(PERIOD_MONTHS[p.span] || 3, Math.max(1, monthsActiveOf(a, at))); }

  function margin() {
    if (!isAdmin()) return [];
    const usage = claudeUsage();
    return S.accounts.filter(a => a.status === 'activo').map(a => {
      const rev = S.invoices.filter(i => i.account_id === a.id && i.status === 'pagado').reduce((s, i) => s + i.amount, 0);
      const rows = usage.filter(u => u.account_id === a.id);
      const usd = rows.reduce((s, u) => s + _usdOf(u), 0);
      const mxn = usd * CLAUDE_FX;
      return { id: a.id, name: a.name, pkg: a.pkg, revenue: rev, calls: rows.length, tokens: rows.reduce((s, u) => s + (u.input_tokens || 0) + (u.output_tokens || 0), 0), claudeUsd: usd, claudeMxn: mxn, margin: rev - mxn, pct: rev > 0 ? (mxn / rev * 100) : null };
    }).sort((x, y) => y.revenue - x.revenue);
  }

  /* ── Utilidad OPERATIVA (Fase 1) · ingreso mensual − Claude − costo laboral ──
     Costo laboral estimado SIN registrar a nadie: el tracker suma el tiempo con la
     sesión de un cliente abierta (session tracking) → horas activas por cuenta. La
     tarifa por hora se prorratea sobre HORAS CONTRATADAS (no sobre activas): así el
     cliente solo carga las horas que se le trabajaron y la capacidad no usada queda
     como «gasto de operación», no se le echa al cliente. Todo solo-admin. */
  function _laborOv() { try { return JSON.parse(STORAGE.getItem('labor') || '{}'); } catch (e) { return {}; } }
  function teamCost() {
    const ov = _laborOv();
    return (S.team_cost || []).map(t => { const o = ov[t.user_id] || {}; const u = S.users.find(x => x.id === t.user_id);
      const salary = o.salary != null ? o.salary : t.monthly_salary, hours = o.hours != null ? o.hours : t.contracted_hours;
      return { user_id: t.user_id, name: u ? u.name : t.user_id, role: u ? u.role : '', salary, hours, hourly: hours > 0 ? salary / hours : 0 }; });
  }
  function setTeamCost(userId, patch) { const ov = _laborOv(); ov[userId] = Object.assign({}, ov[userId], patch); try { STORAGE.setItem('labor', JSON.stringify(ov)); } catch (e) { } emit(); }
  function _analystIdOf(accId) { const a = S.assignments.find(x => x.account_id === accId); return a ? a.analyst_id : null; }
  function _hourlyOf(userId) { const t = teamCost().find(x => x.user_id === userId); return t ? t.hourly : 0; }

  /* session time tracking · acumulado por cuenta en localStorage (segundos) */
  let _work = null, _wtAcct = null, _wtT0 = null, _visWired = false;
  function _loadWork() { if (_work) return; try { _work = JSON.parse(STORAGE.getItem('worktime') || '{}'); } catch (e) { _work = {}; } }
  function _saveWork() { try { STORAGE.setItem('worktime', JSON.stringify(_work)); } catch (e) { } }
  function _addSeconds(accId, sec) { if (!accId || !(sec > 0)) return; return DVWriteGuard.run('work.track', 'work-session', { resourceId: accId }, () => { _loadWork(); _work[accId] = (_work[accId] || 0) + sec; _saveWork(); }); }
  function _flush() { if (_wtAcct && _wtT0) { _addSeconds(_wtAcct, (Date.now() - _wtT0) / 1000); _wtT0 = Date.now(); } }
  function startWork(accId) { if (!(session && session.actor === 'staff')) return; if (!_visWired) { _visWired = true; document.addEventListener('visibilitychange', () => { if (document.hidden) { _flush(); _wtT0 = null; } else if (_wtAcct) { _wtT0 = Date.now(); } }); window.addEventListener('beforeunload', _flush); } if (_wtAcct === accId && _wtT0) return; _flush(); _wtAcct = accId; _wtT0 = document.hidden ? null : Date.now(); }
  function stopWork() { _flush(); _wtAcct = null; _wtT0 = null; }
  function trackedHours(accId) { _loadWork(); let base = (_work[accId] || 0); if (_wtAcct === accId && _wtT0) base += (Date.now() - _wtT0) / 1000; return base / 3600; }
  function _seedHours(accId) { const w = (S.work_sessions || []).find(x => x.account_id === accId); return w ? w.active_hours : 0; }
  function activeHoursOf(accId) { return _seedHours(accId) + trackedHours(accId); }

  function laborModel() {
    if (!isAdmin()) return [];
    return teamCost().map(t => {
      const accts = S.assignments.filter(a => a.analyst_id === t.user_id).map(a => a.account_id);
      const active = accts.reduce((s, id) => s + activeHoursOf(id), 0);
      return { user_id: t.user_id, name: t.name, role: t.role, salary: t.salary, hours: t.hours, hourly: t.hourly,
        active, util: t.hours > 0 ? active / t.hours : 0, clientCost: active * t.hourly, unabsorbed: Math.max(0, t.hours - active) * t.hourly };
    });
  }
  function operating() {
    if (!isAdmin()) return [];
    return S.accounts.filter(a => a.status === 'activo').map(a => {
      const f = _pf(a), active = activeHoursOf(a.id), hourly = _hourlyOf(_analystIdOf(a.id));
      const labor = active * hourly * f, claude = _claudeMxnOf(a.id) * f, rev = (a.mrr || 0) * f;
      const op = rev - claude - labor;
      return { id: a.id, name: a.name, pkg: a.pkg, analyst: analystName(a.id), rev, claude, labor, activeH: active * f, op, opPct: rev > 0 ? (op / rev * 100) : null };
    }).sort((x, y) => y.op - x.op);
  }

  /* ── Valor entregado & capacidad (throughput) · complementa la utilidad ──────
     Mide el VALOR que el equipo produce (facturación que representan las marcas y
     bloques entregados) y el TECHO a 100% de utilización con la misma nómina. Valor
     entregado = precio de build (invoices de fundación+sistema) × avance de bloques.
     Potencial @100% = valor entregado ÷ utilización. La brecha = capacidad ociosa
     convertida a facturación potencial (≈ marcas/bloques adicionales). Solo-admin. */
  function _buildValue(accId) { return S.invoices.filter(i => i.account_id === accId && (i.layer === 'fundacion' || i.layer === 'sistema')).reduce((s, i) => s + i.amount, 0); }
  function valueModel() {
    if (!isAdmin()) return null;
    const p = getPeriod(), atTs = _anchorTs(p.anchor);
    const brands = S.accounts.filter(a => a.status === 'activo').map(a => {
      const bs = blocksOf(a.id), nb = bs.length, ma = monthsActiveOf(a, atTs), f = _pf(a);
      const done = bs.filter(b => b.status === 'cerrado').length;
      const avg = nb ? bs.reduce((s, b) => s + b.progress, 0) / (nb * 100) : 0;
      const mtdAvg = nb ? bs.reduce((s, b) => s + (b.dprog || 0), 0) / (nb * 100) : 0;
      const build = _buildValue(a.id), deliveredToDate = build * avg, deliveredMonth = build * mtdAvg;
      // valor entregado en la base elegida: mensual = producción del mes; acumulado = total a la fecha (recortado a la ventana)
      const delivered = f === 0 ? 0 : p.base === 'mensual' ? deliveredMonth : (ma > 0 ? deliveredToDate * Math.min(PERIOD_MONTHS[p.span] || 3, ma) / ma : 0);
      const income = (a.mrr || 0) * f;
      const capas = bs.map(b => b.capa).filter((c, i, arr) => arr.indexOf(c) === i);
      return { id: a.id, name: a.name, pkg: a.pkg, blocks: nb, done, avg, build, delivered, income, capas, active: activeHoursOf(a.id) };
    }).sort((x, y) => y.delivered - x.delivered);
    const realVal = brands.reduce((s, b) => s + b.delivered, 0);
    const incomeTotal = brands.reduce((s, b) => s + b.income, 0);
    const activeH = brands.reduce((s, b) => s + b.active, 0);           // horas mensuales (tasa)
    const contractH = teamCost().reduce((s, t) => s + t.hours, 0);
    const util = contractH ? activeH / contractH : 0;
    const potential = util ? realVal / util : 0;
    const gap = potential - realVal;
    const marcas = brands.length;
    const bloquesDone = brands.reduce((s, b) => s + b.done, 0);
    const perBrand = marcas ? realVal / marcas : 0;
    const hoursPerBlock = bloquesDone ? activeH / bloquesDone : 0;
    return { brands, realVal, incomeTotal, potential, gap, util, activeH, contractH, idleH: Math.max(0, contractH - activeH),
      marcas, bloquesDone, yieldH: activeH ? realVal / activeH : 0, perBrand,
      addBrands: perBrand ? gap / perBrand : 0, addBlocks: hoursPerBlock ? Math.max(0, contractH - activeH) / hoursPerBlock : 0 };
  }
  function capacity() {
    return staff().map(u => ({ name: u.name.split(' ')[0], load: activeLoadOf(u.id), tope: baseOf(u.id) }));
  }

  /* ══ CAPA 3 · MODELO DE VALOR (Estrategia de valor · Activación & retainer) ══
     Medidor A = valor de aplicación (catálogo × volumen) · Medidor B = impacto +
     ahorro operativo · incentivos por umbral · programa de referidos. Todo solo-
     admin salvo lo que el cliente ve (su impacto + volumen a valor de lista). */

  /* ── catálogo à-la-carte · valor de lista (editable por admin) ── */
  function _catOv() { try { return JSON.parse(STORAGE.getItem('catalog') || '{}'); } catch (e) { return {}; } }
  function catalog() { const ov = _catOv(); return (S.catalog || []).map(c => Object.assign({}, c, { price: ov[c.code] != null ? ov[c.code] : c.price })); }
  function setCatalogPrice(code, price) { const ov = _catOv(); ov[code] = price; try { STORAGE.setItem('catalog', JSON.stringify(ov)); } catch (e) { } emit(); }

  /* ── Medidor A · valor de aplicación ── */
  function _appItemsOf(accId) { const l = (S.application_log || []).find(x => x.account_id === accId); return l ? l.items : null; }
  function appLinesOf(accId) {
    const items = _appItemsOf(accId); if (!items) return []; const cat = catalog();
    return Object.keys(items).map(code => { const c = cat.find(x => x.code === code); if (!c) return null; const qty = items[code]; return { code, name: c.name, unit: c.unit, price: c.price, qty, subtotal: qty * c.price }; })
      .filter(Boolean).sort((a, b) => b.subtotal - a.subtotal);
  }
  function appMonthlyValue(accId) { return appLinesOf(accId).reduce((s, l) => s + l.subtotal, 0); }
  function appPieces(accId) { return appLinesOf(accId).reduce((s, l) => s + l.qty, 0); }
  function applicationValue() {
    if (!isAdmin()) return null;
    const rows = S.accounts.filter(a => a.status === 'activo' && _appItemsOf(a.id)).map(a => {
      const monthly = appMonthlyValue(a.id), f = _pf(a);
      return { id: a.id, name: a.name, pkg: a.pkg, analyst: analystName(a.id), lines: appLinesOf(a.id), pieces: appPieces(a.id), monthly, value: monthly * f, rev: (a.mrr || 0) * f };
    }).sort((x, y) => y.value - x.value);
    const byCat = {};
    rows.forEach(r => r.lines.forEach(l => { const b = byCat[l.code] || { code: l.code, name: l.name, qty: 0, value: 0 }; b.qty += l.qty; b.value += l.subtotal; byCat[l.code] = b; }));
    return { rows, totalValue: rows.reduce((s, r) => s + r.value, 0), totalRev: rows.reduce((s, r) => s + r.rev, 0), totalPieces: rows.reduce((s, r) => s + r.pieces, 0),
      byCatalog: Object.values(byCat).sort((a, b) => b.value - a.value) };
  }

  /* ── Medidor B · impacto por objetivo (base → actual) + ahorro operativo ── */
  function _impactOf(accId) { return (S.impact || []).find(i => i.account_id === accId); }
  function impactOf(accId) {
    const im = _impactOf(accId); if (!im) return null;
    const metrics = im.metrics.map(m => { const lower = !!m.lowerBetter, deltaAbs = m.now - m.base, deltaPct = m.base ? Math.round((m.now - m.base) / m.base * 100) : null, good = lower ? m.now < m.base : m.now > m.base; return Object.assign({}, m, { deltaAbs, deltaPct, good }); });
    return { account_id: accId, objetivo: im.objetivo, since: im.since, metrics };
  }
  function impactModel() { if (!isAdmin()) return []; return S.accounts.filter(a => a.status === 'activo' && _impactOf(a.id)).map(a => Object.assign({ name: a.name, pkg: a.pkg, analyst: analystName(a.id), mrr: a.mrr }, impactOf(a.id))); }
  function savingsOf(accId) { const s = (S.savings || []).find(x => x.account_id === accId); if (!s) return { items: [], total: 0 }; const items = s.items.map(it => Object.assign({}, it, { mxn: it.hours * it.rate })); return { items, total: items.reduce((a, b) => a + b.mxn, 0) }; }

  /* ── Incentivos · valor entregado y COBRADO vs umbral → bono (post-cobro) ── */
  const DEFAULT_UMBRAL = (window.DV_CFG && DV_CFG.CAPA3 && DV_CFG.CAPA3.umbralDefault) || 40000;
  const DEFAULT_BONO_PCT = (window.DV_CFG && DV_CFG.CAPA3 && DV_CFG.CAPA3.bonoPct) || 8;
  const DEFAULT_COMISION_PCT = (window.DV_CFG && DV_CFG.CAPA3 && DV_CFG.CAPA3.comisionPct) || 10;
  function incentiveCfg() { let c = null; try { c = JSON.parse(STORAGE.getItem('incentive') || 'null'); } catch (e) { } c = c || {}; return { bonoPct: c.bonoPct != null ? c.bonoPct : DEFAULT_BONO_PCT, umbral: c.umbral || {} }; }
  function setIncentiveCfg(patch) { const c = Object.assign(incentiveCfg(), patch); try { STORAGE.setItem('incentive', JSON.stringify(c)); } catch (e) { } emit(); }
  function setUmbral(userId, val) { const c = incentiveCfg(); const u = Object.assign({}, c.umbral); u[userId] = val; setIncentiveCfg({ umbral: u }); }
  function _collRatio(accId) { const inv = S.invoices.filter(i => i.account_id === accId); const all = inv.reduce((s, i) => s + i.amount, 0); if (!all) return 1; return inv.filter(i => i.status === 'pagado').reduce((s, i) => s + i.amount, 0) / all; }
  function incentiveModel() {
    if (!isAdmin()) return []; const cfg = incentiveCfg();
    return teamCost().map(t => {
      const accts = S.assignments.filter(a => a.analyst_id === t.user_id).map(a => a.account_id);
      let entregado = 0, cobrado = 0; accts.forEach(id => { const v = appMonthlyValue(id); entregado += v; cobrado += v * _collRatio(id); });
      const umbral = cfg.umbral[t.user_id] != null ? cfg.umbral[t.user_id] : DEFAULT_UMBRAL;
      const excedente = Math.max(0, cobrado - umbral), bono = excedente * cfg.bonoPct / 100;
      return { user_id: t.user_id, name: t.name, role: t.role, entregado, cobrado, umbral, excedente, bono, bonoPct: cfg.bonoPct };
    });
  }

  /* ── Programa de referidos · comisión post-cobro ── */
  function referrals() {
    if (!isAdmin()) return [];
    return (S.referrals || []).map(r => { const acc = r.account_id ? account(r.account_id) : null; return Object.assign({}, r, { account_name: acc ? acc.name : null, commission: Math.round((r.plan_value || 0) * (r.commission_pct || 0) / 100) }); })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }
  function referralStats() {
    const rs = referrals(), contratados = rs.filter(r => r.status !== 'registrado');
    return { total: rs.length, registrados: rs.filter(r => r.status === 'registrado').length, contratados: contratados.length,
      porPagar: rs.filter(r => r.status === 'cobrado').reduce((s, r) => s + r.commission, 0), pagado: rs.filter(r => r.status === 'liquidado').reduce((s, r) => s + r.commission, 0),
      ingresoGen: contratados.reduce((s, r) => s + (r.plan_value || 0), 0) };
  }
  function markReferralPaid(id) { const r = (S.referrals || []).find(x => x.id === id); if (r && r.status === 'cobrado') { r.status = 'liquidado'; r.paid_at = new Date().toISOString(); } emit(); }
  /* lookup sin gate (el embudo resuelve el referente por código; no expone dato de marca) */
  function referralByCode(code) { if (!code) return null; const r = (S.referrals || []).find(x => x.code === String(code).toLowerCase()); return r ? { code: r.code, referrer: r.referrer, kind: r.kind } : null; }
  function addReferral(referrer, kind, pct) {
    referrer = (referrer || '').trim(); if (!referrer) return null;
    let code = referrer.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 14) || ('ref' + String(Date.now()).slice(-4));
    while ((S.referrals || []).some(r => r.code === code)) code += String(Date.now()).slice(-1);
    (S.referrals = S.referrals || []).unshift({ id: 'ref-' + Date.now(), referrer, kind: kind || 'Red de contactos', code, account_id: null, status: 'registrado', plan_value: 0, commission_pct: pct || DEFAULT_COMISION_PCT, at: new Date().toISOString() });
    emit(); return code;
  }

  /* ── mutaciones (demo, en memoria) ── */
  function _identity() { return session && session.environmentFingerprint || null; }
  function _atomic(key, backend, commit) {
    if (!LIVE()) {
      const value = commit();
      return Promise.resolve({ status: 'SUCCEEDED', committed: true, value });
    }
    const fingerprint = DVEnv.fingerprint(), sessionIdentity = _identity();
    return DVAtomicMutations.run({
      key, fingerprint, sessionIdentity,
      getFingerprint: () => DVEnv.fingerprint(),
      getSessionIdentity: _identity,
      execute: backend,
      commit: canonical => { commit(canonical); }
    });
  }
  function approve(blockId) {
    const b = block(blockId); if (!b) return Promise.resolve({ status: 'FAILED', committed: false });
    return _atomic('approve:' + blockId, () => DVSupa.write.approve(blockId), () => {
      b.status = 'cerrado'; b.prog = b.progress = 100; emit();
    });
  }
  function addRound(blockId, patch) {
    const b = block(blockId); const seqN = roundsOf(blockId).length + 1;
    const p = Object.assign({ title: '', deliverable: '', feedback: '', result: 'propuesto', author: (me() || {}).name || 'Equipo' }, patch);
    const row = Object.assign({ id: blockId + '-R' + seqN, block_id: blockId, seq: 'R' + seqN, created_at: new Date().toISOString() }, p);
    return _atomic('round:' + blockId, () => DVSupa.write.addRound(blockId, seqN, p), canonical => {
      S.rounds.push(Object.assign({}, row, canonical && canonical.id ? canonical : {}));
      if (b && b.status === 'en_curso') b.status = 'en_revision';
      emit();
    });
  }
  function requestScope(blockId) { return addRound(blockId, { title: 'Solicitud de producción', deliverable: 'iteración validada', feedback: 'validado internamente' }); }
  function invite(accId, email) {
    const draft = { id: 'u-inv-' + Date.now(), account_id: accId, email, name: '(invitación enviada)', role: 'cliente', member_role: 'miembro', pending: true, invited_at: new Date().toISOString() };
    return _atomic('invite:' + accId + ':' + email, () => DVSupa.write.invite(accId, email), canonical => {
      S.users.push(Object.assign({}, draft, canonical && canonical.id ? canonical : {})); emit();
    });
  }
  function resendInvite(userId) {
    const u = S.users.find(x => x.id === userId); if (!(u && u.pending)) return Promise.resolve({ status: 'FAILED', committed: false });
    return _atomic('resend:' + userId, () => DVSupa.write.invite(u.account_id, u.email), () => { u.invited_at = new Date().toISOString(); emit(); });
  }
  function removeMember(userId) { const u = S.users.find(x => x.id === userId); if (u && u.member_role !== 'owner') { S.users = S.users.filter(x => x.id !== userId); emit(); return true; } return false; }
  function requestInvoice(invoiceId) { const i = S.invoices.find(x => x.id === invoiceId); if (i) { i.cfdi_requested = true; i.cfdi_requested_at = new Date().toISOString(); emit(); } return i; }
  function inviteStaff(email) {
    const draft = { id: 'u-staff-' + Date.now(), account_id: null, email, name: '(invitación enviada)', role: 'analista', member_role: null, pending: true };
    return _atomic('staff-invite:' + email, () => DVSupa.write.inviteStaff(email), canonical => { S.users.push(Object.assign({}, draft, canonical && canonical.id ? canonical : {})); emit(); });
  }
  function assign(accId, analystName) {
    const u = S.users.find(x => x.name.split(' ')[0] === analystName), a = S.assignments.find(x => x.account_id === accId);
    if (!(u && a)) return Promise.resolve({ status: 'FAILED', committed: false });
    return _atomic('assign:' + accId, () => DVSupa.write.assign(accId, u.id), () => {
      const auto = _canAuto(u.id); a.analyst_id = u.id; a.assigned_at = new Date().toISOString(); a.status = auto ? 'aceptada' : 'pendiente';
      _logAssign(accId, u.id, auto ? 'aceptada' : 'asignada (pend. aceptación)', auto ? (isFounder(u.id) ? 'fundador · recibe' : 'dentro de base') : 'sobre base · requiere aceptación del analista'); emit();
    });
  }
  function validatePayment(invoiceId) {
    const i = S.invoices.find(x => x.id === invoiceId); if (!i) return Promise.resolve({ status: 'FAILED', committed: false });
    return _atomic('payment:' + invoiceId, () => DVSupa.write.validatePayment(invoiceId, i.account_id), canonical => {
      i.status = 'pagado'; i.paid_at = canonical && canonical.paid_at || new Date().toISOString();
      S.assets.filter(a => accIdOfInvoiceBlock(a) === i.account_id).forEach(a => a.locked = false); emit();
    });
  }
  function accIdOfInvoiceBlock(a) { const b = block(a.block_id); return accIdOfBlock(b); }
  function publishSkill(id, note) {
    const s = S.skills.find(x => x.id === id); if (!s) return;
    _loadSkillMeta();
    const cur = _skillMeta[id] || { v: s.v, note: '', history: [] };
    const nextV = _bumpVersion(cur.v);
    return _atomic('skill:' + id, () => DVSupa.write.publishSkill(id, nextV), () => {
    // snapshot the version being replaced into history
    cur.history = cur.history || [];
    cur.history.unshift({ v: cur.v, note: cur.note || 'versión base', at: new Date().toISOString(), kind: 'publicada' });
    cur.v = nextV;
    cur.note = (note || '').trim() || 'mejora sin nota';
    _skillMeta[id] = cur; _saveSkillMeta();
    s.v = cur.v;
    emit();
    });
  }
  function revertSkill(id, version) {
    const s = S.skills.find(x => x.id === id); if (!s) return;
    _loadSkillMeta();
    const cur = _skillMeta[id]; if (!cur) return;
    const target = (cur.history || []).find(h => h.v === version); if (!target) return;
    return _atomic('skill:' + id, () => DVSupa.write.publishSkill(id, target.v), () => {
    cur.history.unshift({ v: cur.v, note: cur.note, at: new Date().toISOString(), kind: 'reemplazada por reversión' });
    cur.v = target.v; cur.note = 'revertida a v' + target.v + (target.note ? ' · ' + target.note : '');
    _skillMeta[id] = cur; _saveSkillMeta();
    s.v = cur.v;
    emit();
    });
  }
  function activate(accId, analystName, kind) {
    const a = account(accId); if (!a) return Promise.resolve({ status: 'FAILED', committed: false });
    const actor = me(), analyst = S.users.find(x => x.name.split(' ')[0] === analystName);
    return _atomic('activate:' + accId, () => DVSupa.write.activate(accId, analyst ? analyst.id : (actor ? actor.id : null)), () => {
    a.status = 'activo'; a.queue_position = null; a.pkg = 'Fundación'; a.kind = kind || a.kind || 'cliente';
    const b = { id: 'br-' + accId.slice(4), account_id: accId, name: a.name, layer: 'marca', enabled: true }; S.brands.push(b);
    const p = { id: 'pr-' + accId.slice(4), brand_id: b.id, title: 'Sistema de marca ' + a.name }; S.projects.push(p);
    S.blocks.push({ id: p.id + '-F1', project_id: p.id, code: 'F1', title: 'Estrategia y arquetipo', capa: 'Fundación', status: 'en_curso', progress: 5 });
    S.package_access.push({ id: 'pa-' + accId.slice(4), account_id: accId, package: 'fundacion', layers: ['marca'], sections: ['tablero', 'previews', 'bitacora', 'cuenta'] });
    const u = me(); if (u) { const tgt = u.role === 'admin' ? (S.users.find(x => x.name.split(' ')[0] === analystName) || u) : u; const auto = _canAuto(tgt.id); S.assignments.push({ id: 'as-' + Date.now(), analyst_id: tgt.id, account_id: accId, assigned_by: 'u-arturo', assigned_at: new Date().toISOString(), status: auto ? 'aceptada' : 'pendiente' }); _logAssign(accId, tgt.id, auto ? 'aceptada' : 'asignada (pend. aceptación)', auto ? (isFounder(tgt.id) ? 'fundador · recibe' : 'dentro de base · activación') : 'sobre base · requiere aceptación del analista'); }
    S.rounds.push({ id: p.id + '-F1-R1', block_id: p.id + '-F1', seq: 'R1', title: 'Kickoff · arranque de Fundación', deliverable: 'agenda de arranque', feedback: '—', result: 'propuesto', created_at: '2026-07-13T12:00:00', author: (u || {}).name || 'Equipo' });
    S.users.push({ id: 'u-' + accId.slice(4) + '-owner', account_id: accId, email: 'owner@' + a.name.toLowerCase().replace(/[^a-z]/g, '') + '.mx', name: 'Owner ' + a.name, role: 'cliente', member_role: 'owner' });
    emit();
    });
  }
  function register(name, segment, fit) {
    const id = 'acc-' + name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) + '-' + String(Date.now()).slice(-4);
    const pos = S.accounts.filter(a => a.status === 'waitlist').length + 1;
    const draft = { id, name, segment, status: 'waitlist', queue_position: pos, pkg: null, fit: fit || 'medio', diag: 'hecho', created_at: new Date().toISOString() };
    return _atomic('register:' + id, () => DVSupa.write.register(name, segment, fit || 'medio', pos), canonical => {
      const row = Object.assign({}, draft, canonical && canonical.id ? canonical : {}); S.accounts.push(row); emit(); return row.id;
    });
  }

  /* ══ Asignación por base mensual + desempeño (RRHH · legal) ═════════════════
     El analista tiene una BASE mensual de cuentas. Mientras no la alcanza recibe
     de una lo que el admin le asigna; al alcanzarla gana derecho a ACEPTAR o
     RECHAZAR. Lo rechazado cae a una cola "por reasignar"; si nadie lo toma en
     8 h se reasigna solo al analista con menos carga. El contador se reinicia el
     día 1 de cada mes natural. El fundador cuenta para desempeño pero siempre
     recibe (no rechaza). Todo queda documentado (bitácora de asignaciones,
     resultado mensual vs base, avisos y reconocimientos) para bono/vesting o
     terminación con respaldo. */
  const DEFAULT_BASE = 3, REASSIGN_MS = 8 * 3600 * 1000, HR_V = 2;
  function isFounder(uid) { return uid === 'u-arturo'; }
  function _hr() { let h; try { h = JSON.parse(STORAGE.getItem('hr') || 'null'); } catch (e) { } if (!h || h.v !== HR_V) { h = JSON.parse(JSON.stringify(S.hr || { base: {}, perf: {}, events: [], log: [], reQueue: [] })); h.v = HR_V; _saveHr(h); } h.base = h.base || {}; h.perf = h.perf || {}; h.events = h.events || []; h.log = h.log || []; h.reQueue = h.reQueue || []; return h; }
  function _saveHr(h) { try { STORAGE.setItem('hr', JSON.stringify(h)); } catch (e) { } }
  function _mkKey(ts) { const d = ts ? new Date(ts) : new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function curMonthKey() { return _mkKey(); }
  function monthLabel(k) { const p = k.split('-'); return ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][(+p[1]) - 1] + ' ' + p[0]; }
  function baseOf(uid) { const h = _hr(); return h.base[uid] != null ? h.base[uid] : DEFAULT_BASE; }
  function setBase(uid, n) { const h = _hr(); h.base[uid] = Math.max(0, n | 0); _saveHr(h); emit(); }
  function activeLoadOf(uid) { return S.assignments.filter(a => a.analyst_id === uid && a.status !== 'rechazada' && a.status !== 'pendiente' && (function () { const acc = account(a.account_id); return acc && acc.status === 'activo'; })()).length; }
  function pendingCountOf(uid) { return S.assignments.filter(a => a.analyst_id === uid && a.status === 'pendiente').length; }
  function _logAssign(accId, uid, action, note) { const h = _hr(); h.log.push({ ts: new Date().toISOString(), account_id: accId, analyst_id: uid, action, by: (me() || {}).id || null, note: note || '' }); _saveHr(h); }
  function assignmentLog(uid) { const h = _hr(); return h.log.slice().filter(l => !uid || l.analyst_id === uid).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)); }
  function _canAuto(uid) { return isFounder(uid) || activeLoadOf(uid) < baseOf(uid); }

  function pendingAssignments(uid) {
    return S.assignments.filter(a => a.status === 'pendiente' && (!uid || a.analyst_id === uid))
      .map(a => ({ assign: a, account: account(a.account_id), analyst: (S.users.find(u => u.id === a.analyst_id) || {}) }));
  }
  function acceptAssignment(accId) { const a = S.assignments.find(x => x.account_id === accId && x.status === 'pendiente'); if (!a) return; a.status = 'aceptada'; a.assigned_at = new Date().toISOString(); _logAssign(accId, a.analyst_id, 'aceptada', 'aceptada por el analista'); emit(); }
  function rejectAssignment(accId, motivo) {
    const a = S.assignments.find(x => x.account_id === accId && x.status === 'pendiente'); if (!a) return;
    const from = a.analyst_id; a.status = 'rechazada';
    const h = _hr(); h.reQueue.push({ account_id: accId, from_uid: from, rejected_at: new Date().toISOString(), deadline: new Date(Date.now() + REASSIGN_MS).toISOString(), motivo: motivo || '' }); _saveHr(h);
    _logAssign(accId, from, 'rechazada', motivo || '');
    emit();
  }
  function reassignQueue() { const h = _hr(); return h.reQueue.map(q => ({ q, account: account(q.account_id), from: (S.users.find(u => u.id === q.from_uid) || {}), overdue: Date.now() > Date.parse(q.deadline), msLeft: Date.parse(q.deadline) - Date.now() })); }
  function _leastLoaded(exclude) { return analystsLoad().filter(a => a.id !== exclude).sort((x, y) => (x.load / x.base) - (y.load / y.base))[0]; }
  function reassignNow(accId, uid, manual) {
    const h = _hr(); const qi = h.reQueue.findIndex(q => q.account_id === accId); if (qi < 0) return;
    const target = uid || (function () { const t = _leastLoaded(h.reQueue[qi].from_uid); return t && t.id; })(); if (!target) return;
    const a = S.assignments.find(x => x.account_id === accId); const auto = _canAuto(target);
    if (a) { a.analyst_id = target; a.assigned_at = new Date().toISOString(); a.status = auto ? 'aceptada' : 'pendiente'; }
    h.reQueue.splice(qi, 1); _saveHr(h);
    const byHand = uid || manual;
    _logAssign(accId, target, byHand ? 'reasignada (manual)' : 'auto-reasignada (8 h)', byHand ? 'reasignada por el admin' : 'sin tomar en 8 h → analista con menos carga');
    emit();
  }
  function sweepReassign() { const h = _hr(); let did = false; h.reQueue.slice().forEach(q => { if (Date.now() > Date.parse(q.deadline)) { reassignNow(q.account_id, null, false); did = true; } }); return did; }

  function perfHistory(uid) {
    const h = _hr(); const seeded = h.perf[uid] || {}; const out = {};
    Object.keys(seeded).forEach(k => { const r = seeded[k]; out[k] = { month: k, attended: r.attended, base: r.base, met: r.attended >= r.base }; });
    const ck = curMonthKey(), cb = baseOf(uid), ca = activeLoadOf(uid);
    out[ck] = { month: ck, attended: ca, base: cb, met: ca >= cb, current: true };
    return Object.keys(out).sort().map(k => out[k]);
  }
  function perfSummary() {
    return staff().map(u => { const hist = perfHistory(u.id); const closed = hist.filter(r => !r.current); const met = closed.filter(r => r.met).length;
      return { id: u.id, name: u.name, first: u.name.split(' ')[0], role: u.role, founder: isFounder(u.id), base: baseOf(u.id), load: activeLoadOf(u.id), hist, months: closed.length, met, ratio: closed.length ? met / closed.length : null, events: hrEvents(u.id) }; });
  }
  function hrEvents(uid) { const h = _hr(); return h.events.filter(e => !uid || e.user_id === uid).slice().sort((a, b) => Date.parse(b.date) - Date.parse(a.date)); }
  function addHrEvent(uid, type, text) { if (!text) return; const h = _hr(); h.events.push({ id: 'hr-' + Date.now(), user_id: uid, type, date: new Date().toISOString().slice(0, 10), text, by: (me() || {}).id || null }); _saveHr(h); emit(); }
  function removeHrEvent(id) { const h = _hr(); h.events = h.events.filter(e => e.id !== id); _saveHr(h); emit(); }
  function userName(uid) { const u = S.users.find(x => x.id === uid); return u ? u.name : uid; }
  function analystStats() {
    const lm = laborModel();
    return analystsLoad().map(a => {
      const l = lm.find(x => x.user_id === a.id) || {}; const hours = l.hours || 0, active = l.active || 0, hourly = l.hourly || 0;
      return Object.assign({}, a, { hours, active, hourly, availH: Math.max(0, hours - active), util: hours ? active / hours : 0, valueNow: active * hourly, valuePotential: hours * hourly, gap: Math.max(0, hours - active) * hourly });
    });
  }

  /* ══ Reseñas del cliente + LTV ═══════════════════════════════════════════════
     Scoring 1–5 + feedback capturados por el cliente al cerrar el build y en Capa 3.
     Con consentimiento, la reseña es publicable a la landing 48 h después. Alimenta
     el rating del analista, del despacho, y el detalle del proyecto finalizado. */
  const REVIEW_GATE_MS = 48 * 3600 * 1000, RV_V = 2;
  function _rv() { let d; try { d = JSON.parse(STORAGE.getItem('reviews') || 'null'); } catch (e) { } if (!d || d.v !== RV_V) { d = { v: RV_V, list: JSON.parse(JSON.stringify(S.reviews || [])) }; _saveRv(d); } d.list = d.list || []; return d; }
  function _saveRv(d) { try { STORAGE.setItem('reviews', JSON.stringify(d)); } catch (e) { } }
  function reviewStatus(r) { if (r.published) return 'publicado'; if (!r.consent) return 'sin_consentimiento'; return (Date.now() - Date.parse(r.submitted_at) >= REVIEW_GATE_MS) ? 'listo' : 'en_espera'; }
  function reviews() { return _rv().list.slice().sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at)); }
  function reviewsOf(accId) { return _rv().list.filter(r => r.account_id === accId).sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at)); }
  function reviewFor(accId, phase) { return _rv().list.find(r => r.account_id === accId && r.phase === phase) || null; }
  function reviewById(id) { return _rv().list.find(r => r.id === id) || null; }
  function addReview(accId, phase, rating, feedback, consent) {
    const d = _rv(); const an = S.assignments.find(x => x.account_id === accId);
    const r = { id: 'rv-' + accId.slice(4) + '-' + phase + '-' + Date.now(), account_id: accId, phase, rating: rating | 0, feedback: feedback || '', analyst_id: an ? an.analyst_id : null, consent: !!consent, submitted_at: new Date().toISOString(), published: false };
    d.list.push(r); _saveRv(d); emit(); return r;
  }
  function publishTestimonial(id) { const d = _rv(); const r = d.list.find(x => x.id === id); if (r && reviewStatus(r) === 'listo') { r.published = true; r.published_at = new Date().toISOString(); _saveRv(d); emit(); } }
  function unpublishTestimonial(id) { const d = _rv(); const r = d.list.find(x => x.id === id); if (r) { r.published = false; delete r.published_at; _saveRv(d); emit(); } }
  /* El cliente retira su consentimiento: sale del feed y no se vuelve a publicar sin su permiso. */
  function retractReview(id) { const d = _rv(); const r = d.list.find(x => x.id === id); if (r) { r.consent = false; r.published = false; delete r.published_at; _saveRv(d); emit(); } return r; }
  /* El cliente vuelve a autorizar: reinicia la ventana de 48 h de arrepentimiento. */
  function grantReviewConsent(id) { const d = _rv(); const r = d.list.find(x => x.id === id); if (r) { r.consent = true; r.published = false; delete r.published_at; r.submitted_at = new Date().toISOString(); _saveRv(d); emit(); } return r; }
  /* Feed público para la landing (donventas.mx/testimonios.json). Solo reseñas
     publicadas + con consentimiento; se serializa y se pega en _deploy-repo/testimonios.json. */
  function publishedFeed() {
    return _rv().list.filter(r => r.published && r.consent)
      .sort((a, b) => Date.parse(b.published_at || b.submitted_at) - Date.parse(a.published_at || a.submitted_at))
      .map(r => { const a = account(r.account_id) || {}; const owner = (S.users || []).find(u => u.account_id === r.account_id && u.member_role === 'owner');
        return { quote: r.feedback || '', rating: r.rating | 0, business: a.name || '', sector: a.segment || '', author: owner ? owner.name : '', date: (r.published_at || r.submitted_at || '').slice(0, 10) }; });
  }
  function ratingAvgOf(accId) { const rs = reviewsOf(accId); if (!rs.length) return null; return rs.reduce((s, r) => s + r.rating, 0) / rs.length; }
  function analystRating(uid) { const rs = _rv().list.filter(r => r.analyst_id === uid); if (!rs.length) return null; return { avg: rs.reduce((s, r) => s + r.rating, 0) / rs.length, n: rs.length }; }
  function firmRating() { const rs = _rv().list; if (!rs.length) return null; return { avg: rs.reduce((s, r) => s + r.rating, 0) / rs.length, n: rs.length, published: rs.filter(r => r.published).length }; }
  function pendingSurvey(accId) {
    const a = account(accId); if (!a) return null;
    const bs = blocksOf(accId); if (!bs.length) return null;
    const fBlocks = bs.filter(b => b.capa === 'Fundación'), foundationDone = fBlocks.length && fBlocks.every(b => b.status === 'cerrado');
    if (!reviewFor(accId, 'build') && (a.status === 'finalizado' || foundationDone)) return { phase: 'build', label: 'Tu experiencia con Don Ventas' };
    const last = reviewsOf(accId)[0];
    if (a.status === 'activo' && last && (Date.now() - Date.parse(last.submitted_at) > 90 * 864e5) && !reviewFor(accId, 'capa3')) return { phase: 'capa3', label: 'Seguimiento · Capa 3' };
    return null;
  }
  function ltvOf(accId) {
    const a = account(accId); if (!a) return { months: 0, money: 0, mrr: 0, build: 0 };
    const start = Date.parse(a.created_at || Date.now()), end = a.finished_at ? Date.parse(a.finished_at) : Date.now();
    const months = Math.max(1, Math.round((end - start) / 2592000000));
    const build = S.invoices.filter(i => i.account_id === accId).reduce((s, i) => s + (i.amount || 0), 0);
    const money = build + (a.mrr || 0) * months;
    return { months, money, mrr: a.mrr || 0, build };
  }

  function on(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

  const api = {
    loadSession, session: () => session, userByEmail, loginAs, setRole, logout, me, isAdmin, isAnalyst, isOwner, isFree,
    loginFree, freeProfile, updateFreeProfile,
    accounts, waitlist, finished, historyAccounts, analystsLoad, setAccountKind, accountCapas, toggleCapa, account, brandOf, projectOf, access, analystName, blocksOf, block, roundsOf, allRounds,
    previewOf, assetsOf, assetsAllOf, invoicesOf, balance, membersOf, resendInvite, removeMember, requestInvoice, queue, acctNameOfBlock, accIdOfBlock, staff, skills, skillHistory, billingAll, capacity, CAPAS: S.CAPAS,
    margin, claudeUsage, operating, laborModel, teamCost, setTeamCost, activeHoursOf, startWork, stopWork, valueModel, getPeriod, setPeriod, periodLabel, periodMonths, monthsActiveOf,
    catalog, setCatalogPrice, appLinesOf, appMonthlyValue, appPieces, applicationValue, impactOf, impactModel, savingsOf, incentiveCfg, setIncentiveCfg, setUmbral, incentiveModel, referrals, referralStats, markReferralPaid, addReferral, referralByCode,
    chatOf, saveChat, iterOf, bumpIter,
    skillSignals, skillProposal, proposalState, pendingMejoras, backlog, approveProposal, dismissProposal, shipBacklog,
    approve, addRound, requestScope, invite, inviteStaff, assign, validatePayment, publishSkill, revertSkill, activate, register, on,
    baseOf, setBase, activeLoadOf, pendingCountOf, curMonthKey, monthLabel, isFounder,
    pendingAssignments, acceptAssignment, rejectAssignment, reassignQueue, reassignNow, sweepReassign,
    perfHistory, perfSummary, hrEvents, addHrEvent, removeHrEvent, assignmentLog, userName, analystStats,
    reviews, reviewsOf, reviewFor, reviewById, reviewStatus, addReview, publishTestimonial, unpublishTestimonial, retractReview, grantReviewConsent, publishedFeed, ratingAvgOf, analystRating, firmRating, pendingSurvey, ltvOf
  };
  const guardedMutations = {
    loginAs: ['session.login', 'session'], setRole: ['session.role', 'session'], logout: ['session.logout', 'session'],
    loginFree: ['session.login', 'session'], updateFreeProfile: ['session.profile', 'profile'],
    setAccountKind: ['account.kind', 'account'], toggleCapa: ['account.layers', 'account'],
    saveChat: ['chat.save', 'chat'], bumpIter: ['iteration.bump', 'iteration'],
    approveProposal: ['skill.proposal.approve', 'skill-proposal'], dismissProposal: ['skill.proposal.dismiss', 'skill-proposal'],
    shipBacklog: ['skill.backlog.publish', 'skill'], setPeriod: ['period.update', 'period'],
    setTeamCost: ['labor.update', 'labor'], startWork: ['work.track', 'work-session'], stopWork: ['work.track', 'work-session'],
    setCatalogPrice: ['catalog.update', 'catalog'], setIncentiveCfg: ['incentive.update', 'incentive'],
    setUmbral: ['incentive.update', 'incentive'], markReferralPaid: ['referral.pay', 'referral'],
    addReferral: ['referral.create', 'referral'], approve: ['block.approve', 'block'],
    addRound: ['round.create', 'round'], requestScope: ['scope.request', 'block'],
    invite: ['member.invite', 'invitation'], inviteStaff: ['staff.invite', 'invitation'],
    resendInvite: ['member.resend', 'invitation'], removeMember: ['member.remove', 'member'],
    requestInvoice: ['invoice.request', 'invoice'], assign: ['assignment.update', 'assignment'],
    validatePayment: ['payment.validate', 'payment'], publishSkill: ['skill.publish', 'skill'],
    revertSkill: ['skill.revert', 'skill'], activate: ['account.activate', 'account'],
    register: ['account.register', 'account'],
    acceptAssignment: ['assignment.accept', 'assignment'], rejectAssignment: ['assignment.reject', 'assignment'],
    reassignNow: ['assignment.reassign', 'assignment'], sweepReassign: ['assignment.reassign', 'assignment'],
    setBase: ['hr.base', 'staff'], addHrEvent: ['hr.event.add', 'staff-event'], removeHrEvent: ['hr.event.remove', 'staff-event'],
    addReview: ['review.create', 'review'], publishTestimonial: ['review.publish', 'review'],
    unpublishTestimonial: ['review.unpublish', 'review'], retractReview: ['review.retract', 'review'],
    grantReviewConsent: ['review.consent', 'review']
  };
  Object.keys(guardedMutations).forEach(name => {
    const original = api[name], policy = guardedMutations[name];
    api[name] = function () {
      const args = arguments;
      return DVWriteGuard.run(policy[0], policy[1], { resourceId: args[0] == null ? null : String(args[0]) }, () => original.apply(null, args));
    };
  });
  return api;
})();
