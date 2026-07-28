/* Don Ventas · Portal — Vistas del EQUIPO (analista / admin) */
window.DVStaff = (function () {
  const U = DVUtil, S = DVStore;
  let curBlock = null, iterN = 0, comments = [], chat = [], hasPreview = false;
  let _open = _loadOpen(), _route = 'cuentas', _cFocus = 'activas', _actSel = null;
  function _loadOpen() { try { return JSON.parse(DVEnv.storage.getItem('open-staff') || '{}'); } catch (e) { return {}; } }
  function _saveOpen() { try { DVWriteGuard.run('ui.preference', 'ui-state', {}, () => DVEnv.storage.setItem('open-staff', JSON.stringify(_open))); } catch (e) { } }
  function activeSkill() { const all = S.skills(); return all.find(s => /brand system/i.test(s.n)) || all[0] || { n: 'Brand System Builder', v: '—' }; }
  function donOpen() { const sk = activeSkill(); return 'Soy El Don, tu copiloto de marca. Trabajo con los rieles cargados — Manual de Marca, tokens del sistema y la skill «' + sk.n + ' v' + sk.v + '» de este bloque. Platícame qué generamos o ajustamos y lo verás en el preview; me quedo dentro de la marca.'; }
  function donReply(userText) {
    const t = (userText || '').toLowerCase();
    const skv = activeSkill().v;
    if (/hero|landing|portada/.test(t)) return 'Va. Preparo 2 propuestas de hero en tono premium, con el chevron azul como único acento y mucho aire arriba. Mira el preview y dime cuál seguimos.';
    if (/chevron|logo|isotipo/.test(t)) return 'Ajusto el chevron respetando el grosor canónico del isotipo y el azul de marca (así lo fija la skill). Actualicé el preview — ¿lo quieres más chico o más centrado?';
    if (/color|azul|naranja/.test(t)) return 'Me quedo dentro de la paleta negro-azul; el naranja está descartado por decisión de marca. Actualicé el preview con el acento en su lugar justo.';
    if (/aire|espacio|margen|respir/.test(t)) return 'Subí el aire y bajé la densidad — más sobrio, más premium. Reflejado en el preview.';
    return 'Entendido. Lo llevo a la voz de Don Ventas (directo, estratégico, premium) siguiendo la metodología v' + skv + ' y actualizo el preview. Dime el siguiente ajuste y seguimos iterando.';
  }

  const nav = () => {
    const admin = S.isAdmin();
    return [
      { group: 'Producción' },
      { route: 'cuentas', icon: '▦', label: 'Mis cuentas' },
      { route: 'cola', icon: '≡', label: 'Cola de trabajo', badge: '<span class="b">' + S.queue().length + '</span>' },
      { route: 'bitacora', icon: '☰', label: 'Bitácora' },
      { route: 'skills', icon: '◆', label: 'Motor · skills' },
      admin && { route: 'mejoras', icon: '◈', label: 'Mejoras · backlog', badge: (S.pendingMejoras() ? '<span class="b">' + S.pendingMejoras() + '</span>' : '') },
      admin && { group: 'Administración' },
      admin && { route: 'waitlist', icon: '◔', label: 'Waitlist', badge: '<span class="b">' + S.waitlist().length + '</span>' },
      admin && { route: 'capacidad', icon: '▤', label: 'Capacidad' },
      admin && { route: 'desempeno', icon: '◇', label: 'Desempeño' },
      admin && { route: 'resenas', icon: '★', label: 'Reseñas' },
      admin && { route: 'equipo', icon: '◎', label: 'Equipo' },
      admin && { route: 'accesos', icon: '▢', label: 'Accesos & asignación' },
      admin && { route: 'facturacion', icon: '$', label: 'Facturación' },
      admin && { route: 'utilidad', icon: '◑', label: 'Utilidad operativa' },
      admin && { route: 'valor', icon: '◮', label: 'Valor & capacidad' },
      admin && { group: 'Capa 3 · Valor & adquisición' },
      admin && { route: 'aplicacion', icon: '⬢', label: 'Valor de aplicación' },
      admin && { route: 'impacto', icon: '◍', label: 'Panel de impacto' },
      admin && { route: 'referidos', icon: '⇄', label: 'Referidos' }
    ].filter(Boolean);
  };
  const ctxLabel = () => '<span class="pkg">Panel interno</span>';

  let _curView = 'utilidad';
  function periodBar() {
    const p = S.getPeriod(), months = S.periodMonths();
    const bbtn = b => '<button class="' + (p.base === b ? 'on' : '') + '" onclick="DVStaff.setPeriod(\'' + b + '\')">' + (b === 'mensual' ? 'Mensual' : 'Acumulado') + '</button>';
    const slbl = { trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
    const sbtn = s => '<button class="' + (p.span === s ? 'on' : '') + '" onclick="DVStaff.setPeriodSpan(\'' + s + '\')">' + slbl[s] + '</button>';
    const spanSeg = p.base === 'acumulado' ? '<div class="perseg" title="ventana de acumulación">' + ['trimestral', 'semestral', 'anual'].map(sbtn).join('') + '</div>' : '';
    const opts = months.map(mo => '<option value="' + mo.i + '"' + (p.anchor === mo.i ? ' selected' : '') + '>' + mo.label + '</option>').join('');
    const monthSel = '<label class="permo">' + (p.base === 'acumulado' ? 'hasta' : 'mes') + ' <select onchange="DVStaff.setPeriodAnchor(this.value)">' + opts + '</select></label>';
    return '<div class="perbar"><div class="perseg" title="base de comparación">' + ['mensual', 'acumulado'].map(bbtn).join('') + '</div>' + spanSeg + monthSel +
      '<span class="perhint">Todas las cifras en esta base · <b>' + (p.base === 'mensual' ? 'flujo de un mes' : 'acumulado a la fecha') + '</b></span></div>';
  }
  function setPeriod(base) { S.setPeriod({ base }); DVPortal.go(_curView); }
  function setPeriodSpan(span) { S.setPeriod({ span }); DVPortal.go(_curView); }
  function setPeriodAnchor(anchor) { S.setPeriod({ anchor: parseInt(anchor, 10) || 0 }); DVPortal.go(_curView); }

  function render(route, host) {
    _route = route;
    const map = { cola: renderCola, bloque: renderBloque, bitacora: renderBitacora, skills: renderSkills, mejoras: renderMejoras, waitlist: renderWaitlist, capacidad: renderCapacidad, desempeno: renderDesempeno, resenas: renderResenas, equipo: renderEquipo, accesos: renderAccesos, facturacion: renderFacturacion, utilidad: renderUtilidad, valor: renderValor, aplicacion: renderAplicacion, impacto: renderImpacto, referidos: renderReferidos };
    if (S.isAdmin()) S.sweepReassign();
    // session time tracking: cuenta el tiempo solo mientras el bloque de un cliente está abierto
    if (route === 'bloque' && curBlock) { const acc = S.accIdOfBlock(S.block(curBlock)); if (acc) S.startWork(acc); else S.stopWork(); } else S.stopWork();
    (map[route] || renderCuentas)(host);
  }
  function kpi(v, k) { return '<div class="kpi"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>'; }
  function kpiClick(v, k, on, action, arrow) { return '<button class="kpi click' + (on ? ' on' : '') + '" onclick="' + action + '"><div class="v">' + v + '</div><div class="k">' + k + '<span class="karrow">' + (arrow || '›') + '</span></div></button>'; }

  /* ── agrupación: acordeón por marca + kanban por estado (compartido) ── */
  function _isOpen(key, def) { return _open[key] === undefined ? (def !== false) : _open[key]; }
  function accToggle(key, def) { _open[key] = !_isOpen(key, def); _saveOpen(); DVPortal.go(_route); }
  function _accKeys(route) {
    if (route === 'cola') return S.accounts().filter(a => S.blocksOf(a.id).length).map(a => 'cola-' + a.id);
    if (route === 'bitacora') return S.historyAccounts().filter(a => S.allRounds(a.id).length).map(a => 'bit-' + a.id);
    return [];
  }
  function accToolbar(route) { const ks = _accKeys(route); if (ks.length < 2) return ''; const allOpen = ks.every(k => _isOpen(k, false)); return '<div class="acctools"><button class="btn sm" onclick="DVStaff.expandAll()"' + (allOpen ? ' disabled' : '') + '>Expandir todo</button><button class="btn sm" onclick="DVStaff.collapseAll()"' + (ks.every(k => !_isOpen(k, false)) ? ' disabled' : '') + '>Colapsar todo</button></div>'; }
  function expandAll() { _accKeys(_route).forEach(k => _open[k] = true); _saveOpen(); DVPortal.go(_route); }
  function collapseAll() { _accKeys(_route).forEach(k => _open[k] = false); _saveOpen(); DVPortal.go(_route); }
  function accordion(key, def, titleHTML, countHTML, bodyHTML) {
    const open = _isOpen(key, def);
    return '<div class="acc' + (open ? ' open' : '') + '"><button class="acc-hd" onclick="DVStaff.accToggle(\'' + key + '\',' + (def !== false) + ')">' + U.CHEVRON +
      '<span class="an">' + titleHTML + '</span>' + (countHTML || '') + '</button>' +
      (open ? '<div class="acc-bd">' + bodyHTML + '</div>' : '') + '</div>';
  }
  function kanban(bs) {
    return '<div class="kb">' + U.CANON_STATES.map(st => {
      const col = bs.filter(b => U.blockState(b.status) === st.key);
      return '<div class="kbcol ' + st.key + '"><div class="kbcol-h"><span class="dot"></span>' + st.label + '<span class="n">' + col.length + '</span></div>' +
        '<div class="kbcards">' + (col.length ? col.map(b => '<div class="kbcard" onclick="DVStaff.open(\'' + b.id + '\')"><div class="kc">' + b.code + '</div><div class="kt">' + U.esc(b.title) + '</div>' + U.prog(b.progress) + '</div>').join('') : '<div class="kbempty">—</div>') + '</div></div>';
    }).join('') + '</div>';
  }
  const KIND_L = { cliente: 'Cliente', piloto: 'Piloto', demostracion: 'Demostración' };
  const KIND_C = { cliente: 'blue', piloto: 'mid', demostracion: 'warn' };
  function kindLabel(k) { return KIND_L[k] || 'Sin tipo'; }
  function kindTag(k) { return '<span class="tag ' + (KIND_C[k] || 'locked') + '">' + kindLabel(k) + '</span>'; }

  function pendingBanner() {
    const meU = S.me(); if (!meU) return '';
    const admin = S.isAdmin(), list = S.pendingAssignments(admin ? null : meU.id);
    if (!list.length) return '';
    return '<div class="panel pend"><div class="row spread"><h3>Asignaciones por aceptar</h3><span class="tag warn">' + list.length + '</span></div>' +
      '<p class="d">' + (admin ? 'Cuentas asignadas a analistas que ya alcanzaron su base del mes — esperan su aceptación. Puedes resolverlas o dejar que el analista decida.' : 'Alcanzaste tu base del mes, así que tienes derecho a aceptar o rechazar. Lo que rechaces pasa a la cola por-reasignar (8 h → analista con menos carga).') + '</p>' +
      '<div class="list">' + list.map(p => '<div class="li"><div class="g"><b>' + U.esc(p.account.name) + '</b><small>' + U.esc(p.account.segment || '') + (admin ? ' · para ' + U.esc((p.analyst.name || '').split(' ')[0]) : '') + '</small></div>' +
        '<button class="btn sm solid" onclick="DVStaff.aceptar(\'' + p.account.id + '\')">Aceptar</button>' +
        '<button class="btn sm" onclick="DVStaff.rechazar(\'' + p.account.id + '\')">Rechazar</button></div>').join('') + '</div></div>';
  }
  function aceptar(accId) { S.acceptAssignment(accId); U.toast('Cuenta aceptada · queda a tu cargo'); DVPortal.go(_route); }
  function rechazar(accId) { const m = window.prompt('Motivo del rechazo (queda registrado para respaldo):', ''); if (m === null) return; S.rejectAssignment(accId, m); U.toast('Rechazada · en cola por reasignar (8 h)'); DVPortal.go(_route); }
  function renderCuentas(host) {
    const admin = S.isAdmin();
    const activas = S.accounts(), wl = S.waitlist(), fin = S.finished();
    host.innerHTML = '<div class="eyebrow">Producción</div><h2 class="vh">' + (admin ? 'Todas las cuentas' : 'Mis cuentas') + '</h2>' +
      '<p class="vsub">' + (admin ? 'Todas las marcas del despacho, por estado. Toca una tarjeta para saltar a su grupo; abre una marca para trabajar sus bloques.' : 'Tus marcas asignadas, por estado. Toca una tarjeta para saltar a su grupo.') + '</p>' +
      pendingBanner() +
      '<div class="kpis">' +
        kpiClick(activas.length, 'Clientes activos', _cFocus === 'activas', "DVStaff.focusCuentas('activas')") +
        kpiClick(admin ? wl.length : '—', 'En waitlist', _cFocus === 'waitlist', admin ? "DVStaff.focusCuentas('waitlist')" : "DVUtil.toast('Solo el admin gestiona la waitlist')") +
        kpiClick(fin.length, 'Finalizados', _cFocus === 'finalizados', "DVStaff.focusCuentas('finalizados')") +
        kpiClick(S.queue().length, 'Bloques en cola', false, "DVPortal.go('cola')", '→') +
      '</div>' +
      accordion('cta-activas', true, '<b>Clientes activos</b>', '<span class="acount">' + activas.length + '</span>', activas.length ? clientKanban(activas) : '<div class="kbempty" style="opacity:.6">Sin cuentas activas asignadas.</div>') +
      (admin ? cuentasContainer('cta-waitlist', false, 'En waitlist', wl.length, wl.map(waitRow).join(''), 'Nadie en espera.') : '') +
      accordion('cta-finalizados', false, '<b>Proyectos finalizados</b>', '<span class="acount">' + fin.length + '</span>', fin.length ? fin.map(finAccordion).join('') : '<div class="kbempty" style="opacity:.6">Aún sin proyectos cerrados.</div>');
  }
  function ratingStars(n) { return '<span class="stars ro">' + [1, 2, 3, 4, 5].map(i => '<span class="star' + (i <= n ? ' on' : '') + '">★</span>').join('') + '</span>'; }
  function reviewStatusTag(r) { const st = S.reviewStatus(r); const M = { publicado: ['hi', 'Publicado en landing'], listo: ['blue', 'Listo para publicar'], en_espera: ['mid', 'En ventana de 48 h'], sin_consentimiento: ['locked', 'Sin consentimiento'] }; const m = M[st] || ['locked', st]; return '<span class="tag ' + m[0] + '">' + m[1] + '</span>'; }
  function testimonialAction(r) { const st = S.reviewStatus(r); if (st === 'listo') return '<button class="btn solid sm" onclick="DVStaff.publicarTestimonio(\'' + r.id + '\')">Publicar a landing →</button>'; if (st === 'publicado') return '<button class="btn sm ghost" onclick="DVStaff.retirarTestimonio(\'' + r.id + '\')">Retirar</button>'; return ''; }
  function finCell(k, v) { return '<div class="fincell"><span class="fk">' + k + '</span><span class="fv">' + v + '</span></div>'; }
  function finAccordion(a) {
    const rv = S.reviewsOf(a.id)[0], ltv = S.ltvOf(a.id);
    const title = '<b>' + U.esc(a.name) + '</b><small>' + U.esc(a.segment) + ' · cerrado ' + U.ago(a.finished_at) + '</small>';
    const count = rv ? ratingStars(rv.rating) : '<span class="fmeta">sin reseña</span>';
    const cells = '<div class="findetail">' + finCell('Analista responsable', S.analystName(a.id)) + finCell('LTV · tiempo', ltv.months + ' meses') + finCell('LTV · valor', U.mxn(ltv.money)) + finCell('Tipo de cuenta', kindLabel(a.kind)) + '</div>';
    const review = rv ? '<div class="finreview"><div class="row spread"><b>Reseña del cliente</b>' + ratingStars(rv.rating) + '</div>' + (rv.feedback ? '<p class="quote">“' + U.esc(rv.feedback) + '”</p>' : '') + '<div class="finrev-ft">' + reviewStatusTag(rv) + testimonialAction(rv) + '</div></div>' : '<div class="finreview empty">Sin reseña del cliente todavía.</div>';
    const body = cells + review + '<div class="acts"><button class="btn sm" onclick="DVPortal.go(\'bitacora\')">Ver bitácora</button><button class="btn sm" onclick="DVPortal.go(\'resenas\')">Ir a Reseñas ↗</button></div>';
    return accordion('fin-' + a.id, false, title, count, body);
  }
  function cuentasContainer(key, def, label, count, rowsHTML, empty) {
    const title = '<b>' + label + '</b>';
    const countHTML = '<span class="acount">' + count + '</span>';
    const body = rowsHTML ? '<div class="list">' + rowsHTML + '</div>' : '<div class="kbempty" style="opacity:.6">' + empty + '</div>';
    return accordion(key, def, title, countHTML, body);
  }
  function focusCuentas(which) {
    _cFocus = which;
    _open['cta-activas'] = (which === 'activas');
    _open['cta-waitlist'] = (which === 'waitlist');
    _open['cta-finalizados'] = (which === 'finalizados');
    _saveOpen();
    DVPortal.go('cuentas');
  }
  const CAPA_ORDER = ['Fundación', 'Sistema', 'Activación'];
  const CAPA_K = { 'Fundación': 'fundacion', 'Sistema': 'sistema', 'Activación': 'activacion' };
  function phaseOf(a) {
    const bs = S.blocksOf(a.id); if (!bs.length) return 'Fundación';
    for (const c of CAPA_ORDER) { if (bs.some(b => b.capa === c && b.status !== 'cerrado')) return c; }
    for (let i = CAPA_ORDER.length - 1; i >= 0; i--) { if (bs.some(b => b.capa === CAPA_ORDER[i])) return CAPA_ORDER[i]; }
    return 'Fundación';
  }
  function clientKanban(accs) {
    const COLS = [{ c: 'Fundación', d: 'Estrategia · arquetipo · voz' }, { c: 'Sistema', d: 'Identidad · aplicaciones' }, { c: 'Activación', d: 'Web · contenido · generadores' }];
    return '<p class="kbnote">Cada marca en la <b>fase que hoy trabajas</b> — el mismo tablero de la cola, a nivel cliente. Avanza de izquierda a derecha conforme cierras bloques.</p><div class="kb kb-cli">' + COLS.map(col => {
      const inCol = accs.filter(a => phaseOf(a) === col.c);
      return '<div class="kbcol ' + CAPA_K[col.c] + '"><div class="kbcol-h"><span class="dot"></span>' + col.c + '<span class="n">' + inCol.length + '</span></div>' +
        '<div class="kbcards">' + (inCol.length ? inCol.map(cliCard).join('') : '<div class="kbempty">—</div>') + '</div></div>';
    }).join('') + '</div>';
  }
  function cliCard(a) {
    const bs = S.blocksOf(a.id), open = bs.filter(b => b.status !== 'cerrado').length;
    const pct = Math.round(bs.reduce((s, b) => s + b.progress, 0) / (bs.length || 1));
    return '<div class="kbcard cli" onclick="DVPortal.go(\'cola\')"><div class="kt">' + U.esc(a.name) + '</div>' +
      '<div class="cmeta">' + U.esc(a.segment) + '</div>' +
      '<div class="crow">' + kindTag(a.kind) + '<span class="tag blue">' + open + ' en cola</span></div>' +
      '<div class="cana">analista: ' + S.analystName(a.id) + '</div>' + U.prog(pct) + '</div>';
  }
  function activaRow(a) {
    const bs = S.blocksOf(a.id), open = bs.filter(b => ['en_curso', 'pendiente', 'en_revision'].indexOf(b.status) >= 0).length;
    const pct = Math.round(bs.reduce((s, b) => s + b.progress, 0) / (bs.length || 1));
    return '<div class="li" style="cursor:pointer" onclick="DVPortal.go(\'cola\')"><div class="g"><b>' + U.esc(a.name) + '</b><small>' + U.esc(a.segment) + ' · ' + U.esc(a.pkg || '—') + ' · analista: ' + S.analystName(a.id) + '</small>' +
      '<div class="prog" style="margin-top:8px;max-width:260px"><i style="width:' + pct + '%"></i></div></div>' +
      kindTag(a.kind) + '<span class="tag blue">' + open + ' en cola</span></div>';
  }
  function waitRow(w) {
    return '<div class="li"><div class="g"><b>Turno ' + w.queue_position + ' · ' + U.esc(w.name) + '</b><small>' + U.esc(w.segment) + ' · diagnóstico: ' + (w.diag || '—') + (w.arquetipo ? ' · ' + U.esc(w.arquetipo) : '') + '</small></div>' +
      U.fitTag(w.fit) + '<button class="btn sm" onclick="event.stopPropagation();DVPortal.go(\'waitlist\')">Activar →</button></div>';
  }
  function finRow(a) {
    return '<div class="li"><div class="g"><b>' + U.esc(a.name) + '</b><small>' + U.esc(a.segment) + ' · ' + U.esc(a.pkg || '—') + ' · cerrado ' + U.ago(a.finished_at) + '</small>' +
      '<div class="prog" style="margin-top:8px;max-width:260px"><i style="width:100%"></i></div></div>' +
      kindTag(a.kind) + '<button class="btn sm" onclick="DVPortal.go(\'bitacora\')">Ver bitácora</button></div>';
  }

  function renderCola(host) {
    const accs = S.accounts().filter(a => S.blocksOf(a.id).length);
    host.innerHTML = '<div class="eyebrow">Producción</div><h2 class="vh">Cola de trabajo</h2>' +
      '<p class="vsub">Agrupada por marca. Abre una marca para ver sus bloques apilados en los cuatro estados; toca un bloque para producirlo con El Don.</p>' +
      accToolbar('cola') +
      (accs.length ? accs.map(a => {
        const bs = S.blocksOf(a.id), pend = bs.filter(b => b.status !== 'cerrado').length;
        const title = '<b>' + U.esc(a.name) + '</b><small>' + U.esc(a.segment) + ' · ' + bs.length + ' bloques · analista: ' + S.analystName(a.id) + '</small>';
        const count = '<span class="acount">' + pend + ' activos / ' + bs.length + '</span>';
        return accordion('cola-' + a.id, pend > 0, title, count, kanban(bs));
      }).join('') : '<div class="list"><div class="li"><div class="g"><small>Sin bloques en cola.</small></div></div></div>');
  }

  function open(id) {
    curBlock = id;
    comments = [{ who: 'Luis', t: 'Subí 2 versiones del hero. ¿Cuál se siente más premium?' }];
    chat = S.chatOf(id);
    if (!chat.length) { chat = [{ from: 'don', expr: 'base', t: donOpen() }]; S.saveChat(id, chat); }
    iterN = S.iterOf(id);
    hasPreview = iterN > 0;
    window.DVPortal.go('bloque');
  }
  function renderBloque(host) {
    const b = S.block(curBlock); if (!b) return window.DVPortal.go('cola');
    const pv = S.previewOf(b.id);
    host.innerHTML = '<button class="back" onclick="DVPortal.go(\'cola\')">← Cola de trabajo</button>' +
      '<div class="eyebrow">' + U.esc(S.acctNameOfBlock(b)) + '</div><h2 class="vh">' + b.code + ' · ' + U.esc(b.title) + '</h2>' +
      '<p class="vsub">' + U.statusPill(b.status) + '</p>' +
      '<div class="panel"><div class="row spread"><h3>Estudio con El Don</h3><span class="mono" style="font-size:11px;color:var(--fg-faint)">copiloto de marca</span></div>' +
      '<p class="d">Platícale a El Don qué generar o ajustar; responde con la voz y el rigor de Don Ventas y actualiza el preview. <b>No tocas código, ramas ni servidores.</b></p>' +
      '<div class="rails">Rieles activos: <span class="rail">Manual de Marca</span><span class="rail">tokens del sistema</span><span class="rail rail-sk">skill «' + U.esc(activeSkill().n) + ' v' + activeSkill().v + '»</span><span class="rail-note">El Don responde dentro de estos límites · no ves el contenido de la skill</span></div>' +
      '<div class="chat" id="chatThread"></div>' +
      '<div class="chatbar"><textarea id="chatInput" class="chatinput" rows="1" placeholder="Escríbele a El Don… (Enter para enviar)"></textarea>' +
      '<button class="btn solid sm" onclick="DVStaff.send()">Enviar</button></div>' +
      '<div class="mono" style="font-size:10.5px;color:var(--fg-faint);margin-top:8px">🔒 Este hilo es tu borrador privado. A la bitácora solo pasan el <b>entregable</b> y el <b>veredicto</b>, no la conversación.</div>' +
      '<div id="pbGen"></div>' +
      '<div class="mono" style="font-size:10.5px;color:var(--fg-faint);margin-top:14px;border-top:1px solid var(--line-2);padding-top:12px">Detalle técnico (automático): rama ' + (pv ? pv.branch : 'mejora/…') + ' · deploy en preview</div></div>' +
      '<div class="panel" id="reviewPanel" style="display:none"></div>' +
      '<h3 style="margin:24px 0 12px;font-size:15px">Rondas registradas</h3><div class="list" id="pbRounds"></div>' +
      '<div class="row" style="margin-top:14px"><button class="btn sm" onclick="DVPortal.modal(\'round\')">Registrar ronda manual</button></div>';
    renderRounds(); renderChat(); if (hasPreview) showPreview(true);
  }
  function renderChat() {
    const host = U.el('chatThread'); if (!host) return;
    host.innerHTML = chat.map(m => m.from === 'don'
      ? '<div class="msg don"><span class="av">' + U.elDon({ expr: m.expr || 'base' }) + '</span><div class="bub"><b class="nm">El Don</b><p>' + U.esc(m.t) + '</p></div></div>'
      : '<div class="msg me"><div class="bub"><p>' + U.esc(m.t) + '</p></div></div>'
    ).join('');
    host.scrollTop = host.scrollHeight;
    const i = U.el('chatInput');
    if (i && !i.dataset.wired) {
      i.dataset.wired = '1';
      i.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 140) + 'px'; });
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    }
  }
  function send() {
    const i = U.el('chatInput'); if (!i) return; const t = (i.value || '').trim(); if (!t) return U.toast('Escríbele algo a El Don');
    chat.push({ from: 'me', t }); S.saveChat(curBlock, chat); i.value = ''; i.style.height = 'auto'; renderChat();
    const host = U.el('chatThread');
    host.insertAdjacentHTML('beforeend', '<div class="msg don typing" id="donTyping"><span class="av">' + U.elDon({ expr: 'base' }) + '</span><div class="bub"><span class="dots"><i></i><i></i><i></i></span></div></div>');
    host.scrollTop = host.scrollHeight;
    setTimeout(() => {
      const ty = U.el('donTyping'); if (ty) ty.remove();
      chat.push({ from: 'don', expr: 'smug', t: donReply(t) }); S.saveChat(curBlock, chat); renderChat();
      showPreview();
    }, 900);
  }
  function showPreview(restore) {
    const g = U.el('pbGen'); if (!g) return;
    if (!restore) { iterN = S.bumpIter(curBlock); }
    if (hasPreview && !restore) { const n = U.el('iterN'); if (n) n.textContent = iterN; U.toast('Preview actualizado en vivo · iteración ' + iterN); return; }
    hasPreview = true;
    g.innerHTML = '<div class="genres"><div class="row spread"><div><b>Preview en vivo · rama de prueba</b>' +
      '<div class="mono" style="font-size:11px;color:var(--fg-faint);margin-top:4px">El Don lo actualiza en cada turno · solo tú y el equipo lo ven</div></div><span class="tag hi">● EN VIVO</span></div>' +
      '<div class="liveframe"><div class="lf-hd">rama-de-prueba.vercel.app</div><div class="lf-body"><div class="sec-stage" style="text-align:center">' +
      '<div class="mono" style="font-size:9px;letter-spacing:.14em;color:var(--fg-faint)">VISTA EN VIVO</div>' +
      '<div style="font-weight:800;font-size:20px;margin-top:6px;letter-spacing:-.02em">Iteración lista</div>' +
      '<div class="mono" style="font-size:11px;color:var(--fg-soft);margin-top:6px">iteración #<span id="iterN">' + iterN + '</span></div></div><div class="wmover"></div></div></div>' +
      '<div class="row" style="margin-top:14px;gap:10px;flex-wrap:wrap"><button class="btn sm" onclick="DVStaff.compartir()">Compartir con equipo</button>' +
      '<button class="btn sm" id="valBtn" onclick="DVStaff.validar()">Validar internamente</button>' +
      '<button class="btn solid sm" id="prodBtn" disabled onclick="DVStaff.solicitar()">Solicitar subir a producción →</button></div>' +
      '<div class="mono" id="valNote" style="font-size:11px;color:var(--fg-faint);margin-top:10px">Valida internamente para poder solicitar producción. Producción pasa por el checkpoint del cliente.</div></div>';
  }
  function renderRounds() {
    const host = U.el('pbRounds'); if (!host) return;
    const rs = S.roundsOf(curBlock);
    host.innerHTML = rs.length ? rs.map(r => '<div class="li"><div class="g"><b>' + U.esc(r.title) + '</b><small>' + U.esc(r.deliverable) + ' · ' + U.ago(r.created_at) + '</small></div>' + U.resTag(r.result) + '</div>').join('')
      : '<div class="li"><div class="g"><small>Aún sin rondas. Genera o registra la primera.</small></div></div>';
  }
  function iterar() { iterN++; const n = U.el('iterN'); if (n) n.textContent = iterN; U.toast('Preview actualizado en vivo · iteración ' + iterN); }
  function validar() { const b = U.el('prodBtn'); if (b) b.disabled = false; const v = U.el('valBtn'); if (v) v.textContent = 'Validado ✓'; const nt = U.el('valNote'); if (nt) nt.textContent = 'Validado internamente ✓ · ya puedes solicitar producción.'; U.toast('Marcado como validado internamente'); }
  async function solicitar() { U.toast('Enviando solicitud…'); const r = await S.requestScope(curBlock); if (r.status !== 'SUCCEEDED') return U.toast('No se envió la solicitud · intenta de nuevo'); renderRounds(); U.toast('Solicitud enviada · pasa por checkpoint del cliente'); const b = S.block(curBlock); U.qsa('.vsub')[0].innerHTML = U.statusPill(b.status); }
  function compartir() {
    const rp = U.el('reviewPanel'); rp.style.display = 'block';
    rp.innerHTML = '<div class="row spread"><h3>Revisión del equipo</h3><span class="mono" style="font-size:11px;color:var(--fg-faint)">dentro del portal</span></div>' +
      '<p class="d">Todos abren el <b>mismo preview</b> y comentan aquí — sin capturas por fuera.</p>' +
      '<div class="row" style="gap:8px;margin:12px 0"><span class="rv"><b>Luis</b> · autor</span><span class="rv"><b>Arturo</b> · invitado</span></div>' +
      '<div id="thread"></div><div class="row" style="margin-top:12px;gap:10px"><input id="cmtInput" placeholder="Escribe un comentario…" style="flex:1;min-width:200px;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:10px 12px;color:var(--fg);font-size:14px"><button class="btn sm" onclick="DVStaff.addComment()">Comentar</button></div>';
    renderThread(); U.toast('Equipo notificado · revisan el mismo preview');
  }
  function renderThread() { U.el('thread').innerHTML = comments.map(c => '<div class="cmt"><b>' + U.esc(c.who) + '</b><span class="tm">ahora</span><p>' + U.esc(c.t) + '</p></div>').join(''); }
  function addComment() { const i = U.el('cmtInput'); const t = (i.value || '').trim(); if (!t) return U.toast('Escribe un comentario'); comments.push({ who: (S.me() || {}).name ? S.me().name.split(' ')[0] : 'Equipo', t }); i.value = ''; renderThread(); i.focus(); }
  async function saveRound(deliv, note) { U.toast('Registrando ronda…'); const r = await S.addRound(curBlock, { title: 'Ronda registrada', deliverable: deliv || 'entregable sin título', feedback: note || '—', result: 'propuesto' }); if (r.status !== 'SUCCEEDED') { U.toast('No se registró la ronda · intenta de nuevo'); return false; } renderRounds(); const b = S.block(curBlock); U.qsa('.vsub')[0].innerHTML = U.statusPill(b.status); U.toast('Ronda registrada · el cliente ya la ve'); return true; }

  function renderBitacora(host) {
    const accs = S.historyAccounts();
    const groups = accs.map(a => ({ a, rounds: S.allRounds(a.id) })).filter(g => g.rounds.length);
    host.innerHTML = '<div class="eyebrow">Registro</div><h2 class="vh">Bitácora</h2>' +
      '<p class="vsub">Agrupada por marca y, dentro de cada una, por estado — el mismo sistema que la cola. Historial de rondas; solo se agregan registros, nunca se editan hacia atrás.</p>' +
      accToolbar('bitacora') +
      (groups.length ? groups.map(g => {
        const a = g.a, rounds = g.rounds;
        const title = '<b>' + U.esc(a.name) + '</b><small>' + rounds.length + ' registros' + (a.status === 'finalizado' ? ' · proyecto finalizado' : '') + '</small>';
        const count = '<span class="acount">' + rounds.length + '</span>';
        const stateGroups = U.CANON_STATES.map(st => ({ st, rows: rounds.filter(r => U.roundState(r.result) === st.key) })).filter(x => x.rows.length);
        const body = stateGroups.map(x => {
          const key = 'bit-' + a.id + '-' + x.st.key, def = x.st.key !== 'aprobado', open = _isOpen(key, def);
          const rows = '<div class="list">' + x.rows.map(r => { const b = S.block(r.block_id); return '<div class="li"><div class="g"><b>' + U.esc((b ? b.code + ' · ' : '') + r.deliverable) + '</b><small>' + U.esc(r.title) + ' · ' + U.ago(r.created_at) + (r.author ? ' · ' + U.esc(r.author) : '') + '</small></div>' + U.resTag(r.result) + '</div>'; }).join('') + '</div>';
          return '<div class="stategrp' + (open ? ' open' : '') + '"><button class="stategrp-h" onclick="DVStaff.accToggle(\'' + key + '\',' + def + ')">' + U.CHEVRON + U.statePill(x.st.key) + '<span class="n">' + x.rows.length + '</span></button>' + (open ? rows : '') + '</div>';
        }).join('');
        return accordion('bit-' + a.id, a.status === 'activo', title, count, body);
      }).join('') : '<div class="list"><div class="li"><div class="g"><small>Sin registros todavía.</small></div></div></div>');
  }

  function renderResenas(host) {
    const rvs = S.reviews(), firm = S.firmRating();
    const head = firm ? '<div class="kpis">' + kpi(firm.avg.toFixed(1) + ' ★', 'Rating promedio') + kpi(firm.n, 'Reseñas') + kpi(firm.published, 'Publicadas en landing') + '</div>' : '';
    const analystRows = S.staff().map(u => { const r = S.analystRating(u.id); return r ? '<div class="li"><div class="g"><b>' + U.esc(u.name.split(' ')[0]) + '</b><small>' + r.n + ' reseña' + (r.n > 1 ? 's' : '') + '</small></div>' + ratingStars(Math.round(r.avg)) + '<span class="fmeta">' + r.avg.toFixed(1) + '</span></div>' : ''; }).join('');
    const list = rvs.map(r => { const a = S.account(r.account_id), ltv = S.ltvOf(r.account_id); const phL = { build: 'Cierre del build', capa3: 'Seguimiento · Capa 3' }[r.phase] || r.phase;
      return '<div class="rvcard"><div class="rvcard-h"><div class="g"><b>' + U.esc(a.name) + '</b><small>' + phL + ' · ' + U.ago(r.submitted_at) + ' · analista: ' + U.esc((S.userName(r.analyst_id) || '—').split(' ')[0]) + '</small></div>' + ratingStars(r.rating) + '</div>' +
        (r.feedback ? '<p class="quote">“' + U.esc(r.feedback) + '”</p>' : '<p class="d">Sin comentario.</p>') +
        '<div class="rvcard-ft"><span class="fmeta">LTV ' + ltv.months + ' meses · ' + U.mxn(ltv.money) + '</span>' + reviewStatusTag(r) + testimonialAction(r) + '</div></div>';
    }).join('');
    const nPub = S.publishedFeed().length;
    const feedBar = '<div class="feedbar"><div class="g"><b>Feed de la landing</b><small>' + (nPub ? nPub + ' testimonio' + (nPub > 1 ? 's' : '') + ' listo' + (nPub > 1 ? 's' : '') + ' para donventas.mx' : 'Aún no hay testimonios publicados') + '</small></div><button class="btn sm" onclick="DVStaff.exportarFeed()">Copiar feed JSON →</button></div>';
    host.innerHTML = '<div class="eyebrow">Administración</div><h2 class="vh">Reseñas & testimonios</h2>' +
      '<p class="vsub">Scoring y feedback del cliente al cerrar el build y en Capa 3. Con consentimiento, una reseña es <b>publicable a la landing 48 h</b> después de enviarse (ventana de arrepentimiento). Alimenta el rating del despacho y de cada analista.</p>' +
      feedBar + head + (analystRows ? '<div class="panel"><h3>Rating por analista</h3><div class="list">' + analystRows + '</div></div>' : '') +
      '<div class="rvlist">' + (list || '<div class="kbempty">Sin reseñas todavía.</div>') + '</div>';
  }
  function publicarTestimonio(id) { if (!window.confirm('¿Publicar esta reseña como testimonio en la landing? El cliente ya dio su consentimiento y pasó la ventana de 48 h.')) return; S.publishTestimonial(id); U.toast('Testimonio publicado en la landing'); DVPortal.go(_route); }
  function retirarTestimonio(id) { if (!window.confirm('¿Retirar este testimonio de la landing?')) return; S.unpublishTestimonial(id); U.toast('Testimonio retirado'); DVPortal.go(_route); }
  function exportarFeed() { const feed = S.publishedFeed(); const json = JSON.stringify(feed, null, 2); try { navigator.clipboard.writeText(json); } catch (e) { } U.toast(feed.length ? feed.length + ' testimonio(s) copiados — pégalos en _deploy-repo/testimonios.json y despliega' : 'Sin testimonios publicados: se copió un feed vacío []'); }

  function renderSkills(host) {
    const admin = S.isAdmin();
    host.innerHTML = '<div class="eyebrow">Motor</div><h2 class="vh">Motor · Skills</h2>' +
      '<p class="vsub">' + (admin ? 'Publica versiones mejoradas de cada skill; se <b>heredan a todo el staff</b> al instante. Puedes revertir a una versión anterior.' : 'Skills instaladas (heredadas del portal). Solo lectura — las usa tu Claude, no ves su contenido.') + '</p>' +
      '<div class="list">' + S.skills().map(s => {
        const hist = S.skillHistory(s.id);
        return '<div class="skcard"><div class="row spread"><div class="g"><b>' + U.esc(s.n) + '</b><small>' + U.esc(s.d) + '</small>' +
          (s.note ? '<small class="skv">v' + s.v + ' · ' + U.esc(s.note) + '</small>' : '') + '</div>' +
          '<span class="skv-slot"><span class="tag blue">v' + s.v + '</span></span>' +
          (admin ? '<button class="btn sm" onclick="DVStaff.publish(\'' + s.id + '\')">Publicar mejora</button>' : '<span class="tag hi">instalada · heredada</span>') + '</div>' +
          (hist.length ? '<div class="skhist"><div class="skhist-h">Historial de versiones</div>' + hist.map(h =>
            '<div class="skh-row"><span class="mono skh-v">v' + h.v + '</span><span class="skh-n">' + U.esc(h.note || '—') + '</span><span class="skh-k">' + U.esc(h.kind || '') + ' · ' + U.ago(h.at) + '</span>' +
            (admin ? '<button class="btn sm ghost" onclick="DVStaff.revert(\'' + s.id + '\',\'' + h.v + '\')">Revertir a esta</button>' : '') + '</div>').join('') + '</div>' : '') +
          '</div>';
      }).join('') + '</div>' +
      '<p class="hint">El contenido de las skills (el <b>secreto industrial</b>) no es visible para el staff: su Claude las <b>invoca</b> desde el portal, no las lee. El admin publica mejoras y se <b>heredan a todos</b>; el historial permite <b>revertir</b> si una versión salió peor.' +
      (admin ? ' Las mejoras que la skill propone sola desde el feedback viven en <b>Mejoras · backlog</b>.' : '') + '</p>';
  }
  async function publish(id) {
    const note = window.prompt('Nota de la nueva versión (qué mejora):', '');
    if (note === null) return;
    U.toast('Publicando versión…'); const r = await S.publishSkill(id, note); if (r.status !== 'SUCCEEDED') return U.toast('No se publicó la versión · intenta de nuevo'); U.toast('Versión publicada · heredada a todo el staff'); DVPortal.go('skills');
  }
  async function revert(id, v) {
    if (!window.confirm('¿Revertir a la versión v' + v + '? Se hereda a todo el staff.')) return;
    U.toast('Revirtiendo versión…'); const r = await S.revertSkill(id, v); if (r.status !== 'SUCCEEDED') return U.toast('No se revirtió la versión · intenta de nuevo'); U.toast('Revertida a v' + v + ' · heredada al staff'); DVPortal.go('skills');
  }

  function evidenceHTML(ev) {
    return '<div class="evd">' + ev.map(s => '<div class="evd-row"><div class="evd-g"><b>' + U.esc(s.acct + ' · ' + s.code) + '</b>' +
      '<span class="evd-fb">“' + U.esc(s.feedback) + '”</span><small class="mono">' + U.esc(s.deliverable) + ' · ' + U.ago(s.at) + '</small></div>' + U.resTag(s.result) + '</div>').join('') + '</div>';
  }
  function propCard(id) {
    const st = S.proposalState(id), s = S.skills().find(x => x.id === id), p = st.p;
    const head = '<div class="row spread"><div class="g"><b>' + U.esc(s.n) + ' <span class="tag blue">v' + s.v + ' → v' + p.targetV + '</span></b>' +
      '<small>El Don reunió <b>' + p.n + ' feedback' + (p.n === 1 ? '' : 's') + ' de mejora</b> sobre ' + p.total + ' rondas y propone:</small></div></div>';
    const changes = '<ul class="prop-ch">' + p.changes.map(c => '<li>' + U.esc(c) + '</li>').join('') + '</ul>';
    const evTitle = '<div class="evd-h">Evidencia · entregable · veredicto · feedback del cliente</div>';
    let actions = '';
    if (st.status === 'pending') actions = '<div class="row" style="gap:10px;margin-top:12px"><button class="btn solid sm" onclick="DVStaff.aprobarMejora(\'' + id + '\')">Aprobar → backlog</button><button class="btn sm ghost" onclick="DVStaff.descartarMejora(\'' + id + '\')">Descartar</button></div>';
    else if (st.status === 'approved') actions = '<div class="mono" style="font-size:11px;color:var(--fg-faint);margin-top:10px">✓ Aprobada · en backlog</div>';
    else if (st.status === 'dismissed') actions = '<div class="row" style="gap:10px;margin-top:12px"><span class="mono" style="font-size:11px;color:var(--fg-faint)">Descartada · reaparece al llegar nuevo feedback</span><button class="btn sm ghost" onclick="DVStaff.aprobarMejora(\'' + id + '\')">Aprobar igual →</button></div>';
    return '<div class="propcard ' + st.status + '">' + head + changes + evTitle + evidenceHTML(p.evidence) + actions + '</div>';
  }
  function renderMejoras(host) {
    const props = S.skills().map(s => ({ s, st: S.proposalState(s.id) }));
    const pending = props.filter(x => x.st.status === 'pending');
    const other = props.filter(x => x.st.status === 'approved' || x.st.status === 'dismissed');
    const none = props.filter(x => x.st.status === 'none');
    const bl = S.backlog();
    const totalFb = S.skills().reduce((n, s) => { const p = S.skillProposal(s.id); return n + (p ? p.n : 0); }, 0);
    host.innerHTML = '<div class="eyebrow">Motor · Aprendizaje</div><h2 class="vh">Mejoras & backlog</h2>' +
      '<p class="vsub">Sin que nadie lo pida, cada skill <b>reúne el feedback de todas las cuentas</b> — entregable, veredicto y comentario del cliente — y te propone una mejora. Tú <b>apruebas</b> y pasa al <b>backlog</b>; publicarla desde ahí hace el bump de versión y se hereda al staff.</p>' +
      '<div class="kpis">' + kpi(totalFb, 'Feedbacks recogidos') + kpi(pending.length, 'Propuestas por aprobar') + kpi(bl.filter(i => i.status === 'backlog').length, 'En backlog') + kpi(bl.filter(i => i.status === 'publicada').length, 'Publicadas') + '</div>' +
      '<h3 style="margin:22px 0 12px;font-size:15px">Propuestas automáticas</h3>' +
      (pending.length ? pending.map(x => propCard(x.s.id)).join('') : '<div class="li"><div class="g"><small>Ninguna propuesta pendiente. Llegan solas al acumularse feedback de mejora.</small></div></div>') +
      (other.length ? '<div class="hint" style="margin:6px 0 0">Ya resueltas</div>' + other.map(x => propCard(x.s.id)).join('') : '') +
      (none.length ? '<p class="hint">Sin feedback suficiente aún: ' + none.map(x => U.esc(x.s.n)).join(' · ') + '.</p>' : '') +
      '<h3 style="margin:26px 0 12px;font-size:15px">Backlog de mejoras</h3>' +
      '<div class="list">' + (bl.length ? bl.map(i => '<div class="li"><div class="g"><b>' + U.esc(i.skillName) + ' <span class="tag blue">→ v' + i.targetV + '</span></b><small>' + U.esc(i.changes[0]) + (i.changes.length > 1 ? ' · +' + (i.changes.length - 1) + ' más' : '') + ' · ' + i.evidence.length + ' evidencias · ' + U.ago(i.at) + '</small></div>' +
        (i.status === 'publicada' ? '<span class="tag hi">publicada v' + (i.shippedV || i.targetV) + '</span>' : '<span class="tag mid">en backlog</span><button class="btn solid sm" onclick="DVStaff.publicarBacklog(\'' + i.id + '\')">Publicar →</button>') + '</div>').join('')
        : '<div class="li"><div class="g"><small>Backlog vacío. Aprueba una propuesta para poblarlo.</small></div></div>') + '</div>' +
      '<p class="hint">El contenido de las skills no se muestra: El Don <b>lee el feedback</b>, no expone la metodología. Publicar desde el backlog reutiliza el versionado del Motor (historial + reversión).</p>';
  }
  function aprobarMejora(id) { S.approveProposal(id); U.toast('Propuesta aprobada · enviada al backlog'); DVPortal.go('mejoras'); }
  function descartarMejora(id) { S.dismissProposal(id); U.toast('Propuesta descartada'); DVPortal.go('mejoras'); }
  function publicarBacklog(itemId) { if (!window.confirm('¿Publicar esta mejora? Hace bump de versión y se hereda a todo el staff.')) return; S.shipBacklog(itemId); U.toast('Mejora publicada · versión heredada al staff'); DVPortal.go('mejoras'); }

  function renderCapacidad(host) {
    const stats = S.analystStats(), q = S.reassignQueue(), mk = S.curMonthKey();
    const cards = stats.map(a => {
      const pct = Math.min(100, a.base ? a.load / a.base * 100 : 0), utilPct = Math.round(a.util * 100);
      return '<div class="capcard">' +
        '<div class="capcard-h"><div class="g"><b>' + U.esc(a.name) + (a.founder ? ' <span class="tag blue">fundador</span>' : '') + '</b>' +
          '<small>' + (a.founder ? 'siempre recibe · ' : '') + (a.atBase ? 'en su base — nuevas cuentas requieren que acepte' : 'con cupo — recibe de una') + '</small></div>' +
          '<label class="basefld">base <input type="number" min="0" value="' + a.base + '" onchange="DVStaff.setBase(\'' + a.id + '\',this.value)"><span>cuentas/mes</span></label></div>' +
        '<div class="cap2col">' +
          '<div class="capblk"><div class="capblk-k">Carga del mes</div><div class="capblk-v">' + a.load + ' <span>/ ' + a.base + '</span></div>' +
            '<div class="capbar' + (a.atBase ? ' full' : '') + '"><i style="width:' + pct + '%"></i></div>' +
            '<div class="capblk-s">' + (a.pending ? a.pending + ' por aceptar' : 'sin pendientes') + '</div></div>' +
          '<div class="capblk"><div class="capblk-k">Valor potencial @100%</div><div class="capblk-v">' + U.mxn(a.valuePotential) + '</div>' +
            '<div class="capbar"><i style="width:' + utilPct + '%"></i></div>' +
            '<div class="capblk-s">hoy ' + U.mxn(a.valueNow) + ' · ' + utilPct + '% util · ' + a.availH.toFixed(1) + ' h libres</div></div>' +
        '</div></div>';
    }).join('');
    const qHTML = q.length ? '<div class="panel reassign"><div class="row spread"><h3>Por reasignar</h3><span class="tag warn">' + q.length + '</span></div>' +
      '<p class="d">Cuentas rechazadas por un analista sobre su base. Si nadie las toma en <b>8 h</b> se reasignan solas al analista con menos carga.</p>' +
      '<div class="list">' + q.map(item => {
        const hrs = Math.max(0, item.msLeft / 3600000);
        return '<div class="li"><div class="g"><b>' + U.esc(item.account.name) + '</b><small>rechazada por ' + U.esc(item.from.name || '—') + ' · ' + (item.overdue ? 'venció el plazo' : hrs.toFixed(1) + ' h para auto-reasignar') + (item.q.motivo ? ' · motivo: ' + U.esc(item.q.motivo) : '') + '</small></div>' +
          '<button class="btn sm solid" onclick="DVStaff.reasignarAhora(\'' + item.account.id + '\')">Reasignar ahora</button></div>';
      }).join('') + '</div></div>' : '';
    host.innerHTML = '<div class="eyebrow">Administración</div><h2 class="vh">Capacidad del equipo</h2>' +
      '<p class="vsub">Carga mensual y <b>valor potencial</b> lado a lado. La base fija cuántas cuentas atiende cada quien al mes; al alcanzarla, el analista gana derecho a aceptar o rechazar. El contador se reinicia el <b>día 1 de cada mes</b> (' + S.monthLabel(mk) + ').</p>' +
      qHTML + '<div class="capgrid">' + cards + '</div>' +
      '<p class="hint">La cola avanza por <b>carga real y valor</b>, no por número de clientes. El fundador cuenta para desempeño pero siempre recibe. El detalle de cumplimiento vive en <b>Desempeño</b>.</p>';
  }
  function setBase(uid, v) { S.setBase(uid, parseInt(v, 10) || 0); U.toast('Base actualizada'); DVPortal.go('capacidad'); }
  function reasignarAhora(accId) { S.reassignNow(accId, null, true); U.toast('Reasignada al analista con menos carga'); DVPortal.go('capacidad'); }

  function perfChip(r) {
    const cls = r.current ? 'cur' : (r.met ? 'met' : 'miss');
    return '<div class="perfchip ' + cls + '"><span class="pm">' + S.monthLabel(r.month) + '</span><span class="pn">' + r.attended + '/' + r.base + '</span>' + (r.current ? '<span class="pc">en curso</span>' : (r.met ? '<span class="pok">✓ meta</span>' : '<span class="pbad">bajo base</span>')) + '</div>';
  }
  function renderDesempeno(host) {
    const admin = S.isAdmin(), meU = S.me();
    const people = admin ? S.perfSummary() : S.perfSummary().filter(p => p.id === (meU || {}).id);
    const cards = people.map(p => {
      const hist = p.hist.map(perfChip).join('');
      const ev = p.events.length ? p.events.map(e => '<div class="evrow ' + e.type + '"><div class="g"><b>' + (e.type === 'recon' ? 'Reconocimiento' : 'Aviso') + '</b><small>' + U.esc(e.text) + '</small><span class="evdate">' + U.esc(e.date) + ' · ' + U.esc((S.userName(e.by) || '').split(' ')[0]) + '</span></div>' + (admin ? '<button class="btn sm ghost" onclick="DVStaff.quitarEvento(\'' + e.id + '\')">Quitar</button>' : '') + '</div>').join('') : '<div class="kbempty">Sin avisos ni reconocimientos.</div>';
      const log = S.assignmentLog(p.id).slice(0, 4).map(l => '<div class="logrow"><span class="mono">' + U.ago(l.ts) + '</span><b>' + U.esc((S.account(l.account_id) || {}).name || '—') + '</b><span class="tag ' + (/rechaz/.test(l.action) ? 'warn' : /auto/.test(l.action) ? 'mid' : 'hi') + '">' + U.esc(l.action) + '</span></div>').join('') || '<div class="kbempty">Sin movimientos.</div>';
      const summary = p.ratio == null ? 'sin meses cerrados' : Math.round(p.ratio * 100) + '% de meses en meta (' + p.met + '/' + p.months + ')';
      const title = '<b>' + U.esc(p.name) + (p.founder ? ' <span class="tag blue">fundador</span>' : '') + '</b><small>base ' + p.base + ' cuentas/mes · ' + summary + '</small>';
      const body = '<div class="perfstrip">' + hist + '</div>' +
        '<div class="perfsec"><div class="perfsec-h">Avisos y reconocimientos' + (admin ? '<span class="addbtns"><button class="btn sm ghost" onclick="DVStaff.nuevoEvento(\'' + p.id + '\',\'recon\')">+ Reconocimiento</button><button class="btn sm ghost" onclick="DVStaff.nuevoEvento(\'' + p.id + '\',\'aviso\')">+ Aviso</button></span>' : '') + '</div>' + ev + '</div>' +
        '<div class="perfsec"><div class="perfsec-h">Bitácora de asignaciones</div><div class="loglist">' + log + '</div></div>' +
        '<div class="perfsec"><button class="btn sm" onclick="DVStaff.expediente(\'' + p.id + '\')">Expediente imprimible</button></div>';
      return accordion('perf-' + p.id, false, title, '', body);
    }).join('');
    host.innerHTML = '<div class="eyebrow">Administración</div><h2 class="vh">Desempeño del equipo</h2>' +
      '<p class="vsub">Cierre mensual <b>atendidas vs. base</b> por persona, con avisos y reconocimientos fechados y la bitácora de asignaciones. Todo queda documentado para bono, vesting o para respaldar una terminación. El fundador cuenta para desempeño pero siempre recibe.</p>' +
      '<div class="perfgrid">' + cards + '</div>';
  }
  function nuevoEvento(uid, type) { const label = type === 'recon' ? 'reconocimiento (criterio de bono / vesting)' : 'aviso (motivo)'; const t = window.prompt('Texto del ' + label + ':', ''); if (!t) return; S.addHrEvent(uid, type, t); U.toast(type === 'recon' ? 'Reconocimiento registrado' : 'Aviso registrado'); DVPortal.go('desempeno'); }
  function quitarEvento(id) { if (!window.confirm('¿Quitar este registro del expediente?')) return; S.removeHrEvent(id); DVPortal.go('desempeno'); }
  function expediente(uid) {
    const p = S.perfSummary().find(x => x.id === uid); if (!p) return;
    const esc = U.esc;
    const rows = p.hist.map(r => '<tr><td>' + S.monthLabel(r.month) + '</td><td>' + r.attended + '</td><td>' + r.base + '</td><td>' + (r.current ? 'En curso' : (r.met ? 'Cumplió' : 'Bajo base')) + '</td></tr>').join('');
    const ev = p.events.length ? p.events.map(e => '<li><b>' + (e.type === 'recon' ? 'Reconocimiento' : 'Aviso') + '</b> — ' + esc(e.date) + ': ' + esc(e.text) + ' <i>(registró ' + esc((S.userName(e.by) || '').split(' ')[0]) + ')</i></li>').join('') : '<li>Sin registros.</li>';
    const log = S.assignmentLog(uid).map(l => '<tr><td>' + new Date(l.ts).toLocaleString('es-MX') + '</td><td>' + esc((S.account(l.account_id) || {}).name || '—') + '</td><td>' + esc(l.action) + '</td><td>' + esc(l.note || '') + '</td></tr>').join('') || '<tr><td colspan="4">Sin movimientos.</td></tr>';
    const today = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Expediente · ' + esc(p.name) + '</title>' +
      '<style>*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#14181F;margin:0;padding:40px 46px;font-size:12.5px;line-height:1.5}h1{font-size:22px;margin:0 0 2px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#3B74F2;margin:26px 0 8px;border-bottom:1px solid #E4E8F0;padding-bottom:5px}.mut{color:#5B6472}.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #14181F;padding-bottom:12px}table{width:100%;border-collapse:collapse;margin-top:4px}th,td{text-align:left;padding:6px 9px;border-bottom:1px solid #E4E8F0;font-size:12px}th{color:#5B6472;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.05em}ul{margin:4px 0;padding-left:18px}li{margin:4px 0}.foot{margin-top:34px;color:#8A93A3;font-size:10.5px;border-top:1px solid #E4E8F0;padding-top:10px}.brand{font-weight:700;letter-spacing:-.01em}</style></head><body>' +
      '<div class="hd"><div><div class="brand">DON·VENTAS</div><h1>Expediente de desempeño</h1><div class="mut">' + esc(p.name) + (p.founder ? ' · Fundador' : ' · ' + esc(p.role)) + '</div></div><div class="mut" style="text-align:right">Generado ' + today + '<br>Base actual: ' + p.base + ' cuentas/mes</div></div>' +
      '<h2>Resultado mensual vs. objetivo</h2><table><thead><tr><th>Mes</th><th>Atendidas</th><th>Base</th><th>Resultado</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="mut" style="margin-top:6px">Meses cerrados en meta: ' + p.met + ' de ' + p.months + (p.ratio != null ? ' (' + Math.round(p.ratio * 100) + '%)' : '') + '.</div>' +
      '<h2>Avisos y reconocimientos</h2><ul>' + ev + '</ul>' +
      '<h2>Bitácora de asignaciones</h2><table><thead><tr><th>Fecha</th><th>Cuenta</th><th>Acción</th><th>Nota</th></tr></thead><tbody>' + log + '</tbody></table>' +
      '<div class="foot">Documento interno de Don Ventas · registro operativo para efectos de compensación (bono / vesting) y de relación laboral. Los datos provienen del portal y se conservan de forma aditiva (no se editan hacia atrás).</div>' +
      '</body></html>';
    const w = window.open('', '_blank', 'width=840,height=1040');
    if (!w) { U.toast('Permite ventanas emergentes para imprimir el expediente'); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch (e) { } }, 450);
  }

  const ACT_KINDS = [
    { k: 'cliente', b: 'Cliente', d: 'Cuenta de pago formal, alcance completo.' },
    { k: 'piloto', b: 'Piloto', d: 'Prueba acotada con alcance reducido.' },
    { k: 'demostracion', b: 'Demostración', d: 'Muestra sin cobro para cerrar la venta.' }
  ];
  function renderWaitlist(host) {
    const wl = S.waitlist();
    const cap = S.capacity(), used = cap.reduce((s, c) => s + Math.min(c.load, c.tope), 0), tope = cap.reduce((s, c) => s + c.tope, 0);
    host.innerHTML = '<div class="eyebrow">Administración</div><h2 class="vh">Waitlist</h2>' +
      '<p class="vsub">Cola de prospectos por turno. Al <b>activar</b> defines el tipo de cuenta y asignas analista según capacidad real — aquí es donde el prospecto se convierte en cuenta oficial.</p>' +
      '<div class="panel"><div class="cap">Capacidad del equipo <span class="capbar"><i style="width:' + Math.round(used / tope * 100) + '%"></i></span> <span>' + used + ' / ' + tope + ' cupos ocupados</span></div></div>' +
      (wl.length ? wl.map(waitlistEntry).join('') : '<div class="list"><div class="li"><div class="g"><small>Sin prospectos en cola.</small></div></div></div>');
  }
  function waitlistEntry(w) {
    if (_actSel && _actSel.id === w.id) return activationPanel(w);
    const meta = U.esc(w.segment) + ' · diagnóstico: ' + (w.diag || '—') + (w.arquetipo ? ' · arquetipo: ' + U.esc(w.arquetipo) : '');
    const perfil = w.perfil ? '<div style="font-size:13px;color:var(--fg-soft);margin-top:8px;max-width:72ch;line-height:1.5">' + U.esc(w.perfil) + '</div>' : '';
    return '<div class="list" style="margin-bottom:12px"><div class="li"><div class="g"><b>Turno ' + w.queue_position + ' · ' + U.esc(w.name) + '</b><small>' + meta + '</small>' + perfil + '</div>' +
      U.fitTag(w.fit) + '<button class="btn solid sm" onclick="DVStaff.beginActivate(\'' + w.id + '\')">Activar</button></div></div>';
  }
  function activationPanel(w) {
    const pr = (k, v) => '<div class="pr"><span class="pk">' + k + '</span><span class="pv">' + v + '</span></div>';
    const perfilBox = '<div class="perfilbox">' +
      pr('Marca', '<b>' + U.esc(w.name) + '</b>') +
      pr('Negocio', U.esc(w.segment)) +
      pr('Diagnóstico', w.diag === 'hecho' ? 'Completado' : 'Pendiente') +
      pr('Fit', U.esc(w.fit)) +
      (w.arquetipo ? pr('Arquetipo', '<b>' + U.esc(w.arquetipo) + '</b>') : '') +
      pr('Qué ofrecer', w.reco ? U.esc(w.reco) : (w.diag !== 'hecho' ? 'Sin diagnóstico — conviene completar el F0 antes de activar.' : '—')) +
      '</div>';
    const kinds = '<div class="kindseg">' + ACT_KINDS.map(x => '<button class="kindopt' + (_actSel.kind === x.k ? ' on' : '') + '" onclick="DVStaff.setActKind(\'' + x.k + '\')"><b>' + x.b + '</b><small>' + x.d + '</small></button>').join('') + '</div>';
    const analysts = '<div class="anlist">' + S.analystStats().map(an => {
      const pct = Math.min(100, an.base ? an.load / an.base * 100 : 0), full = an.atBase && !an.founder;
      return '<button class="anopt' + (_actSel.analyst === an.id ? ' on' : '') + (full ? ' full' : '') + '" onclick="DVStaff.setActAnalyst(\'' + an.id + '\')">' +
        '<div class="ai"><b>' + U.esc(an.name) + (an.founder ? ' · fundador' : '') + '</b><small>' + an.load + ' de ' + an.base + ' cuentas del mes · ' + an.availH.toFixed(1) + ' h libres · potencial ' + U.mxn(an.valuePotential) + '</small>' +
        (full ? '<small class="warn-s">Sobre base → le llegará para aceptar/rechazar</small>' : '') + '</div>' +
        '<div class="acap"><div class="capbar' + (full ? ' full' : '') + '"><i style="width:' + pct + '%"></i></div></div></button>';
    }).join('') + '</div>';
    return '<div class="wlact"><h4>Activar ' + U.esc(w.name) + '</h4><div class="sub">Turno ' + w.queue_position + ' · convierte el prospecto en cuenta oficial.</div>' +
      '<div class="fld"><label>Perfil del prospecto (F0)</label>' + perfilBox + '</div>' +
      '<div class="fld"><label>Tipo de cuenta</label>' + kinds + '</div>' +
      '<div class="fld"><label>Analista responsable · carga del mes y valor potencial</label>' + analysts + '</div>' +
      '<div class="acts"><button class="btn sm" onclick="DVStaff.cancelActivate()">Cancelar</button>' +
      '<button class="btn solid sm" onclick="DVStaff.confirmActivate(\'' + w.id + '\')">Activar cuenta →</button></div></div>';
  }
  function beginActivate(id) { _actSel = { id, kind: 'cliente', analyst: null }; DVPortal.go('waitlist'); }
  function cancelActivate() { _actSel = null; DVPortal.go('waitlist'); }
  function setActKind(k) { if (_actSel) { _actSel.kind = k; DVPortal.go('waitlist'); } }
  function setActAnalyst(id) { if (_actSel) { _actSel.analyst = id; DVPortal.go('waitlist'); } }
  async function confirmActivate(id) {
    if (!_actSel) return;
    if (!_actSel.analyst) return U.toast('Elige un analista responsable');
    const an = S.analystStats().find(a => a.id === _actSel.analyst), kind = _actSel.kind, name = S.account(id).name;
    const willAsk = an && an.atBase && !an.founder;
    U.toast('Activando cuenta…'); const r = await S.activate(id, an.first, kind); if (r.status !== 'SUCCEEDED') return U.toast('No se activó la cuenta · intenta de nuevo'); _actSel = null;
    U.toast(name + ' activado como ' + kindLabel(kind).toLowerCase() + (willAsk ? ' · enviado a ' + an.first + ' para aceptación' : ' · asignado a ' + an.first));
    _cFocus = 'activas'; DVPortal.go('cuentas');
  }

  function renderEquipo(host) {
    host.innerHTML = '<div class="eyebrow">Administración</div><h2 class="vh">Equipo</h2>' +
      '<p class="vsub">Analistas y diseñadores. El staff entra <b>solo por invitación</b>.</p>' +
      '<div class="list">' + S.staff().map(s => '<div class="li"><div class="g"><b>' + U.esc(s.name) + '</b><small>' + U.esc(s.email) + '</small></div><span class="tag ' + (s.role === 'admin' ? 'blue' : '') + '">' + s.role + '</span></div>').join('') + '</div>' +
      '<div class="inviteform"><input id="staffEmail" type="email" placeholder="correo@disenador.mx"><button class="btn solid" onclick="DVStaff.inviteStaff()">Invitar al equipo →</button></div>';
  }
  async function inviteStaff() { const i = U.el('staffEmail'); const e = (i.value || '').trim(); if (!e) return U.toast('Escribe un correo'); U.toast('Enviando invitación…'); const r = await S.inviteStaff(e); if (r.status !== 'SUCCEEDED') return U.toast('No se envió la invitación · intenta de nuevo'); i.value = ''; U.toast('Invitación de equipo enviada a ' + e); }

  const SECT_L = { tablero: 'Tablero', bitacora: 'Bitácora', previews: 'Previews', generadores: 'Generadores' };
  function renderAccesos(host) {
    host.innerHTML = '<div class="eyebrow">Administración</div><h2 class="vh">Accesos & asignación</h2>' +
      '<p class="vsub">Por cuenta: reclasifica el <b>tipo</b>, asigna el analista y controla las <b>capas de servicio contratadas</b>. El <b>tipo de cuenta</b> fija el techo de capas disponibles (Cliente = completo · Piloto = sin Activación · Demostración = solo Fundación); el botón <b>Capas</b> abre qué etapas tiene el cliente y qué secciones del portal le desbloquea cada una.</p>' +
      S.accounts().map(a => {
        const opts = S.staff().map(s => { const n = s.name.split(' ')[0]; return '<option' + (S.analystName(a.id) === n ? ' selected' : '') + '>' + n + '</option>'; }).join('');
        const open = _isOpen('capas-' + a.id, false);
        const kopts = ACT_KINDS.map(x => '<option value="' + x.k + '"' + (a.kind === x.k ? ' selected' : '') + '>' + x.b + '</option>').join('');
        const row = '<div class="li"><div class="g"><b>' + U.esc(a.name) + '</b><small>' + U.esc(a.pkg || '—') + '</small></div>' +
          '<span class="mono" style="font-size:11px;color:var(--fg-faint)">tipo</span><select onchange="DVStaff.changeKind(\'' + a.id + '\',this.value)">' + kopts + '</select>' +
          '<span class="mono" style="font-size:11px;color:var(--fg-faint)">analista</span><select onchange="DVStaff.assign(\'' + a.id + '\',this.value)">' + opts + '</select>' +
          '<button class="btn sm' + (open ? ' solid' : '') + '" onclick="DVStaff.accToggle(\'capas-' + a.id + '\',false)">Capas ' + U.CHEVRON + '</button></div>';
        return '<div class="list" style="margin-bottom:12px">' + row + '</div>' + (open ? capasPanel(a.id) : '');
      }).join('');
  }
  function capasPanel(accId) {
    const a = S.account(accId), capas = S.accountCapas(accId);
    const hdr = '<div class="csec" style="padding:12px 2px 8px;color:var(--fg-soft)">Tipo de cuenta: <b style="color:var(--fg)">' + kindLabel(a.kind) + '</b> — fija el techo de capas que puede contratar.</div>';
    return '<div class="capaspanel">' + hdr + capas.map(c => {
      const secs = c.sections.length ? c.sections.map(s => SECT_L[s] || s).join(' · ') : 'base del portal';
      const swi = c.base ? '<div class="swi on lock" title="Base — siempre incluida"></div>'
        : !c.allowedByKind ? '<div class="swi lock" title="No disponible para el tipo ' + kindLabel(a.kind) + '"></div>'
        : '<div class="swi' + (c.enabled ? ' on' : '') + '" onclick="DVStaff.toggleCapa(\'' + accId + '\',\'' + c.name + '\')"></div>';
      const note = (!c.base && !c.allowedByKind) ? '<div class="csec" style="color:var(--accent)">No incluida en el tipo ' + kindLabel(a.kind) + ' · sube el tipo para habilitarla</div>' : '';
      return '<div class="caparow"' + (!c.allowedByKind && !c.base ? ' style="opacity:.55"' : '') + '><div class="cg"><b>' + U.esc(c.name) + (c.base ? ' · base' : '') + '</b><small>' + U.esc(c.d) + '</small>' +
        '<div class="csec">Desbloquea: ' + secs + '</div>' + note + '</div>' + swi + '</div>';
    }).join('') + '<div class="csec" style="padding:12px 2px 4px;color:var(--fg-faint)">El cliente solo ve las secciones de las capas activadas · nunca operación ni estrategia interna del despacho.</div></div>';
  }
  function toggleCapa(accId, name) { S.toggleCapa(accId, name); DVPortal.go('accesos'); U.toast('Capas de ' + S.account(accId).name + ' actualizadas'); }
  async function assign(id, name) { U.toast('Asignando cuenta…'); const r = await S.assign(id, name); if (r.status !== 'SUCCEEDED') return U.toast('No se asignó la cuenta · intenta de nuevo'); U.toast('Cuenta ' + S.account(id).name + ' asignada a ' + name); }
  function changeKind(id, k) { S.setAccountKind(id, k); DVPortal.go('accesos'); U.toast(S.account(id).name + ' reclasificada como ' + kindLabel(k).toLowerCase()); }

  function renderFacturacion(host) {
    const all = S.billingAll();
    const porCobrar = all.filter(i => i.status !== 'pagado').reduce((s, i) => s + i.amount, 0);
    const cobrado = all.filter(i => i.status === 'pagado').reduce((s, i) => s + i.amount, 0);
    host.innerHTML = '<div class="eyebrow">Administración</div><h2 class="vh">Facturación</h2>' +
      '<p class="vsub">Cobros por cuenta. Al <b>validar el pago</b> se retira la marca de agua y se habilitan las descargas del cliente.</p>' +
      '<div class="kpis" style="grid-template-columns:repeat(3,1fr)">' + kpi(U.mxn(porCobrar), 'Por cobrar') + kpi(U.mxn(cobrado), 'Cobrado a la fecha') + kpi(all.filter(i => i.status !== 'pagado').length, 'Facturas abiertas') + '</div>' +
      '<div class="list">' + all.map(b => { const a = S.account(b.account_id); const cap = { fundacion: 'Fundación', sistema: 'Sistema', activacion: 'Activación' }[b.layer] || b.layer; return '<div class="li"><div class="g"><b>' + U.esc(a.name + ' · ' + b.concept) + '</b><small>capa: ' + U.esc(cap) + '</small></div>' + kindTag(a.kind) + '<span class="amt">' + U.mxn(b.amount) + '</span><span class="tag ' + (b.status === 'pagado' ? 'hi' : 'mid') + '">' + b.status + '</span>' +
        (b.status !== 'pagado' ? '<button class="btn solid sm" onclick="DVStaff.validatePay(\'' + b.id + '\')">Validar pago</button>' : '') + '</div>'; }).join('') + '</div>';
  }
  async function validatePay(id) { U.toast('Validando pago…'); const r = await S.validatePayment(id); if (r.status !== 'SUCCEEDED') return U.toast('No se validó el pago · intenta de nuevo'); U.toast('Pago validado · marca de agua retirada y descargas habilitadas'); }

  function renderUtilidad(host) {
    _curView = 'utilidad';
    const rows = S.operating();
    const pl = S.periodLabel();
    const team = S.laborModel();
    const usd = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const hrs = n => (Math.round(n * 10) / 10).toLocaleString('es-MX') + ' h';
    const totRev = rows.reduce((s, r) => s + r.rev, 0);
    const totClaude = rows.reduce((s, r) => s + r.claude, 0);
    const totLabor = rows.reduce((s, r) => s + r.labor, 0);
    const totOp = totRev - totClaude - totLabor;
    const totUnabsorbed = team.reduce((s, t) => s + t.unabsorbed, 0);
    host.innerHTML = '<div class="eyebrow">Administración · dato de fundador</div><h2 class="vh">Utilidad operativa por cliente</h2>' +
      '<p class="vsub">Los <b>dos costos variables</b> del negocio, ya cruzados: <b>consumo de Claude</b> + <b>costo laboral estimado</b>. El costo laboral sale del <b>tiempo con la sesión del cliente abierta</b> (no registro a nadie), prorrateado sobre horas contratadas. <b>Utilidad operativa = ingreso − Claude − trabajo.</b> Solo tú (admin) lo ves.</p>' +
      periodBar() +
      '<div class="kpis">' + kpi(U.mxn(Math.round(totRev)), 'Ingreso · ' + pl) + kpi(U.mxn(Math.round(totClaude)), 'Costo Claude · ' + pl) + kpi(U.mxn(Math.round(totLabor)), 'Costo laboral · ' + pl) + kpi(U.mxn(Math.round(totOp)), 'Utilidad operativa · ' + pl) + '</div>' +
      '<div class="list">' + rows.map(r => {
        const pct = r.opPct;
        return '<div class="li"><div class="g"><b>' + U.esc(r.name) + '</b><small>' + U.esc(r.pkg || '—') + ' · ' + U.esc(r.analyst) + ' · ' + hrs(r.activeH) + ' activas · Claude ' + U.mxn(Math.round(r.claude)) + ' · trabajo ' + U.mxn(Math.round(r.labor)) + '</small>' +
          '<div class="mono" style="font-size:11px;color:var(--fg-faint);margin-top:6px">ingreso ' + U.mxn(Math.round(r.rev)) + ' − Claude − trabajo</div></div>' +
          '<div style="text-align:right;min-width:150px"><div class="amt" style="' + (r.op < 0 ? 'color:var(--danger,#e5484d)' : '') + '">' + U.mxn(Math.round(r.op)) + '</div>' +
          '<div class="mono" style="font-size:11px;color:var(--fg-faint)">utilidad op.</div></div>' +
          '<span class="tag ' + (pct == null ? '' : pct >= 40 ? 'hi' : pct >= 15 ? 'blue' : 'mid') + '">' + (pct == null ? 's/ingreso' : (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%') + '</span></div>';
      }).join('') + '</div>' +
      '<h3 style="margin:28px 0 6px;font-size:15px">Capacidad & utilización del equipo <span class="mono" style="font-size:10px;color:var(--fg-faint);text-transform:none;letter-spacing:0">· tasa mensual (no varía con el periodo)</span></h3>' +
      '<p class="vsub" style="margin-bottom:14px">Sueldo y horas contratadas por persona (editable). El tiempo <b>activo</b> es el session-tracking sumado sobre sus cuentas; lo que no se usa (contrato − activo) es <b>capacidad no facturada</b> → gasto de operación, no se le carga a ningún cliente.</p>' +
      '<div class="kpis">' + kpi(U.mxn(Math.round(totUnabsorbed)), 'Capacidad no facturada · mensual') + '</div>' +
      '<div class="list">' + team.map(t => {
        const utilPct = Math.round(t.util * 100);
        return '<div class="li"><div class="g"><b>' + U.esc(t.name) + ' <span class="tag ' + (t.role === 'admin' ? 'blue' : '') + '" style="font-size:10px">' + U.esc(t.role) + '</span></b>' +
          '<small class="mono">' + usd((t.hourly)).replace('$', '$') + '/h · ' + hrs(t.active) + ' activas de ' + t.hours + ' h contratadas</small>' +
          '<div class="capbar" style="width:240px;margin-top:8px" title="utilización"><i style="width:' + Math.min(100, utilPct) + '%"></i></div></div>' +
          '<div class="labin"><label>Sueldo/mes<input type="number" value="' + t.salary + '" min="0" step="1000" onchange="DVStaff.setLabor(\'' + t.user_id + '\',\'salary\',this.value)"></label>' +
          '<label>Horas/mes<input type="number" value="' + t.hours + '" min="1" step="5" onchange="DVStaff.setLabor(\'' + t.user_id + '\',\'hours\',this.value)"></label></div>' +
          '<span class="tag ' + (utilPct >= 70 ? 'hi' : utilPct >= 40 ? 'blue' : 'mid') + '">' + utilPct + '% util</span></div>';
      }).join('') + '</div>' +
      '<p class="hint">El tiempo activo es un <b>piso</b> (subcuenta llamadas y trabajo sin sesión abierta): úsalo por tendencia, no por el número de un mes. En vivo, las horas vienen de <span class="mono">work_session</span> y el costo/utilidad de la vista <span class="mono">account_operating_margin</span> (RLS solo-admin). Falta por sumar para utilidad NETA: impuestos, herramientas y overhead fijo.</p>';
  }
  function setLabor(userId, key, val) { const n = parseFloat(val); if (isNaN(n)) return; S.setTeamCost(userId, key === 'salary' ? { salary: n } : { hours: n }); U.toast('Actualizado · utilidad recalculada'); DVPortal.go('utilidad'); }

  function renderValor(host) {
    _curView = 'valor';
    const m = S.valueModel(); if (!m) return;
    const pl = S.periodLabel();
    const round1 = n => (Math.round(n * 10) / 10).toLocaleString('es-MX');
    const capacityPct = Math.round(m.util * 100);
    const ratio = m.incomeTotal ? Math.round(m.realVal / m.incomeTotal * 100) : 0;
    host.innerHTML = '<div class="eyebrow">Administración · dato de fundador</div><h2 class="vh">Valor entregado & capacidad</h2>' +
      '<p class="vsub">Complementa la utilidad: mide el <b>valor de facturación</b> que representan las marcas y bloques entregados, y el <b>techo a 100% de utilización</b> con la misma nómina. Valor entregado = precio de build × avance de bloques. <b>Potencial = valor entregado ÷ utilización.</b> Solo tú (admin) lo ves.</p>' +
      periodBar() +
      '<div class="kpis">' + kpi(U.mxn(Math.round(m.realVal)), 'Valor entregado · ' + pl) + kpi(U.mxn(Math.round(m.potential)), 'Valor potencial @100%') + kpi(U.mxn(Math.round(m.gap)), 'Brecha de capacidad') + kpi(capacityPct + '%', 'Utilización del equipo') + '</div>' +
      '<div class="capnote"><b>Con la misma nómina, a 100% de utilización</b> podrías entregar <b>' + U.mxn(Math.round(m.gap)) + '</b> más de valor — ≈ <b>' + round1(m.addBrands) + ' marcas</b> o <b>' + round1(m.addBlocks) + ' bloques</b> adicionales. Hoy hay <b>' + round1(m.idleH) + ' h/mes</b> de capacidad libre. Valor por hora activa: <b>' + U.mxn(Math.round(m.yieldH)) + '/h</b>.</div>' +
      '<h3 style="margin:26px 0 6px;font-size:15px">Valor producido vs. ingreso · misma base (' + pl + ')</h3>' +
      '<p class="vsub" style="margin-bottom:14px">Ahora comparables: ambos en <b>' + pl + '</b>. El valor entregado es producción de build; el ingreso incluye retainer. Si el valor va muy por debajo del ingreso, el mes es de mantenimiento/activación (no de build) — normal en marcas maduras.</p>' +
      '<div class="kpis">' + kpi(U.mxn(Math.round(m.realVal)), 'Valor entregado · ' + pl) + kpi(U.mxn(Math.round(m.incomeTotal)), 'Ingreso · ' + pl) + kpi(ratio + '%', 'Valor / ingreso') + '</div>' +
      '<h3 style="margin:26px 0 6px;font-size:15px">Valor entregado por marca <span class="mono" style="font-size:10px;color:var(--fg-faint);text-transform:none;letter-spacing:0">· ' + pl + '</span></h3>' +
      '<p class="vsub" style="margin-bottom:14px">' + m.marcas + ' marcas · ' + m.bloquesDone + ' bloques cerrados · ' + U.mxn(Math.round(m.realVal)) + ' de facturación representada.</p>' +
      '<div class="list">' + m.brands.map(b => {
        const pct = Math.round(b.avg * 100);
        return '<div class="li"><div class="g"><b>' + U.esc(b.name) + '</b><small>' + U.esc(b.pkg || '—') + ' · ' + b.done + '/' + b.blocks + ' bloques · ' + b.capas.map(U.esc).join(' · ') + ' · build ' + U.mxn(b.build) + ' · ingreso ' + U.mxn(Math.round(b.income)) + '</small>' +
          '<div class="prog" style="margin-top:8px;max-width:280px" title="avance"><i style="width:' + pct + '%"></i></div></div>' +
          '<div style="text-align:right;min-width:150px"><div class="amt">' + U.mxn(Math.round(b.delivered)) + '</div>' +
          '<div class="mono" style="font-size:11px;color:var(--fg-faint)">' + pct + '% entregado</div></div></div>';
      }).join('') + '</div>' +
      '<p class="hint">El valor entregado usa el precio de build (facturación fundación+sistema) ponderado por avance; en <b>flujo</b> es la producción del periodo, en <b>acumulado</b> el total a la fecha. El potencial @100% es un <b>techo teórico</b> — no toda hora contratada es facturable (dirección, ventas, tiempo del fundador). En vivo, las cifras vienen de <span class="mono">account_delivered_value</span> + <span class="mono">portfolio_capacity_value</span> (RLS solo-admin).</p>';
  }

  /* ══ CAPA 3 · MODELO DE VALOR ══════════════════════════════════════════════ */

  /* ── Medidor A · Valor de aplicación (catálogo × volumen) + incentivos ── */
  function renderAplicacion(host) {
    _curView = 'aplicacion';
    const m = S.applicationValue(); if (!m) return;
    const pl = S.periodLabel();
    const ratio = m.totalRev ? Math.round(m.totalValue / m.totalRev * 100) : 0;
    const cat = S.catalog();
    const inc = S.incentiveModel(), cfg = S.incentiveCfg();
    const mixTop = m.byCatalog.slice(0, 6), mixMax = mixTop.length ? mixTop[0].value : 1;
    host.innerHTML = '<div class="eyebrow">Capa 3 · dato de fundador</div><h2 class="vh">Valor de aplicación</h2>' +
      '<p class="vsub"><b>Medidor A de la Capa 3.</b> Cuando el sistema ya está construido, el retainer se mide por <b>volumen de aplicación × valor de lista</b>, no por avance de build. Cada entregable se valúa a lo que costaría suelto en el mercado — así el número refleja producción real. Solo tú (admin) lo ves.</p>' +
      periodBar() +
      '<div class="kpis">' + kpi(U.mxn(Math.round(m.totalValue)), 'Valor de aplicación · ' + pl) + kpi(m.totalPieces, 'Piezas producidas · ' + pl) + kpi(U.mxn(Math.round(m.totalRev)), 'Ingreso retainer · ' + pl) + kpi(ratio + '%', 'Valor / ingreso') + '</div>' +
      '<div class="capnote">El <b>valor de aplicación</b> es el precio de lista de todo lo producido en el retainer; el <b>ingreso</b> es lo que se cobra por él. Un valor por encima del ingreso es la narrativa de venta: <b>«recibes más valor del que pagas»</b>. Es valor de lista de referencia, no lo facturado.</div>' +
      '<h3 style="margin:26px 0 6px;font-size:15px">Valor de aplicación por marca <span class="mono" style="font-size:10px;color:var(--fg-faint);text-transform:none;letter-spacing:0">· ' + pl + '</span></h3>' +
      '<p class="vsub" style="margin-bottom:14px">Solo marcas con Activación en curso. Abre para ver el desglose por entregable a valor de lista.</p>' +
      '<div class="list">' + (m.rows.length ? m.rows.map(r => {
        const lines = r.lines.map(l => '<span class="applin">' + l.qty + '× ' + U.esc(l.name) + ' <i>' + U.mxn(l.subtotal) + '</i></span>').join('');
        return '<div class="li col"><div class="row spread"><div class="g"><b>' + U.esc(r.name) + '</b><small>' + U.esc(r.pkg || '—') + ' · ' + U.esc(r.analyst) + ' · ' + r.pieces + ' piezas · ingreso ' + U.mxn(Math.round(r.rev)) + '</small></div>' +
          '<div style="text-align:right;min-width:150px"><div class="amt">' + U.mxn(Math.round(r.value)) + '</div><div class="mono" style="font-size:11px;color:var(--fg-faint)">valor de aplicación</div></div></div>' +
          '<div class="applins">' + lines + '</div></div>';
      }).join('') : '<div class="li"><div class="g"><small>Ninguna marca en Activación todavía.</small></div></div>') + '</div>' +
      '<h3 style="margin:28px 0 6px;font-size:15px">Mezcla de producción <span class="mono" style="font-size:10px;color:var(--fg-faint);text-transform:none;letter-spacing:0">· qué entregables pesan más</span></h3>' +
      '<div class="list">' + mixTop.map(c => '<div class="li"><div class="g"><b>' + U.esc(c.name) + '</b><small>' + c.qty + ' piezas</small><div class="capbar" style="width:240px;margin-top:8px"><i style="width:' + Math.round(c.value / mixMax * 100) + '%"></i></div></div><span class="amt">' + U.mxn(Math.round(c.value)) + '</span></div>').join('') + '</div>' +
      '<h3 style="margin:28px 0 6px;font-size:15px">Catálogo à-la-carte <span class="mono" style="font-size:10px;color:var(--fg-faint);text-transform:none;letter-spacing:0">· valor de lista editable</span></h3>' +
      '<p class="vsub" style="margin-bottom:14px">Precio de mercado por entregable suelto (PyME MX 2026). Es el valor de lista con el que se valúa el retainer — ajústalo por tier o mercado.</p>' +
      '<div class="list">' + cat.map(c => '<div class="li"><div class="g"><b>' + U.esc(c.name) + '</b><small>por ' + U.esc(c.unit) + '</small></div>' +
        '<div class="labin"><label>Valor de lista<input type="number" value="' + c.price + '" min="0" step="50" onchange="DVStaff.setCatPrice(\'' + c.code + '\',this.value)"></label></div></div>').join('') + '</div>' +
      '<h3 style="margin:28px 0 6px;font-size:15px">Incentivos por umbral <span class="mono" style="font-size:10px;color:var(--fg-faint);text-transform:none;letter-spacing:0">· bono sobre valor entregado y COBRADO</span></h3>' +
      '<p class="vsub" style="margin-bottom:14px">El equipo gana cuando genera valor <b>cobrado</b> por encima de su umbral. El bono se libera sobre el excedente y se paga <b>después del cobro</b> del cliente — nunca sobre dinero que no entró.</p>' +
      '<div class="labin" style="margin-bottom:14px"><label>Bono % sobre excedente<input type="number" value="' + cfg.bonoPct + '" min="0" max="100" step="1" onchange="DVStaff.setBonoPct(this.value)"></label></div>' +
      '<div class="list">' + inc.map(t => {
        const pctToU = t.umbral ? Math.min(100, Math.round(t.cobrado / t.umbral * 100)) : 100;
        return '<div class="li"><div class="g"><b>' + U.esc(t.name) + ' <span class="tag ' + (t.role === 'admin' ? 'blue' : '') + '" style="font-size:10px">' + U.esc(t.role) + '</span></b>' +
          '<small class="mono">entregado ' + U.mxn(Math.round(t.entregado)) + ' · cobrado ' + U.mxn(Math.round(t.cobrado)) + ' · excedente ' + U.mxn(Math.round(t.excedente)) + '</small>' +
          '<div class="capbar" style="width:240px;margin-top:8px" title="cobrado vs umbral"><i style="width:' + pctToU + '%"></i></div></div>' +
          '<div class="labin"><label>Umbral cobrado<input type="number" value="' + t.umbral + '" min="0" step="5000" onchange="DVStaff.setUmbral(\'' + t.user_id + '\',this.value)"></label></div>' +
          '<div style="text-align:right;min-width:110px"><div class="amt" style="color:' + (t.bono > 0 ? 'var(--accent)' : 'var(--fg-faint)') + '">' + U.mxn(Math.round(t.bono)) + '</div><div class="mono" style="font-size:11px;color:var(--fg-faint)">bono ' + t.bonoPct + '%</div></div></div>';
      }).join('') + '</div>' +
      '<p class="hint">El valor de aplicación no cambia lo que se cobra: hace <b>visible</b> el valor que ya entregamos y no se nombraba. En vivo, el volumen sale de <span class="mono">application_log</span>, el bono se calcula sobre valor <b>cobrado</b> (ratio de invoices pagadas) y se libera <b>post-cobro</b> (misma disciplina de caja que los referidos). Calibración pendiente: precios finales y umbrales de bono.</p>';
  }
  function setCatPrice(code, val) { const n = parseFloat(val); if (isNaN(n)) return; S.setCatalogPrice(code, n); U.toast('Valor de lista actualizado'); DVPortal.go('aplicacion'); }
  function setBonoPct(val) { const n = parseFloat(val); if (isNaN(n)) return; S.setIncentiveCfg({ bonoPct: n }); U.toast('Bono % actualizado'); DVPortal.go('aplicacion'); }
  function setUmbral(userId, val) { const n = parseFloat(val); if (isNaN(n)) return; S.setUmbral(userId, n); U.toast('Umbral actualizado'); DVPortal.go('aplicacion'); }

  /* ── Medidor B · Panel de impacto (objetivo → métricas base→ahora) + ahorro operativo ── */
  function _fmtMetric(v, unit) {
    if (unit === '$') return U.mxn(v);
    if (unit === '%') return (Math.round(v * 10) / 10) + '%';
    if (unit === 's') return v + 's';
    return v.toLocaleString('es-MX');
  }
  function metricRows(metrics) {
    return metrics.map(m => {
      const dir = m.now >= m.base ? '↑' : '↓';
      const cls = m.good ? 'up' : 'dn';
      const dpct = m.deltaPct == null ? '—' : (m.deltaPct > 0 ? '+' : '') + m.deltaPct + '%';
      return '<div class="mtr"><div class="mk">' + U.esc(m.k) + '<small>' + U.esc(m.ch) + (m.lowerBetter ? ' · menos es mejor' : '') + '</small></div>' +
        '<div class="mv">' + _fmtMetric(m.base, m.unit) + ' <span style="color:var(--fg-faint)">→</span> <b>' + _fmtMetric(m.now, m.unit) + '</b></div>' +
        '<div class="md ' + cls + '">' + dir + ' ' + dpct + '</div></div>';
    }).join('');
  }
  function savingsBlock(accId, showHd) {
    const sav = S.savingsOf(accId); if (!sav.items.length) return '';
    return (showHd !== false ? '<div class="imp-hd" style="border-top:1px solid var(--line-2)"><div class="t"><b>Ahorro operativo</b><small>horas × costo/hora · validado por el analista</small></div><div class="obj">' + U.mxn(sav.total) + ' / mes</div></div>' : '') +
      sav.items.map(it => '<div class="savrow"><span>' + U.esc(it.act) + '<span class="who">ahorra a ' + U.esc(it.who) + '</span></span><b>' + it.hours + ' h × $' + it.rate + ' = ' + U.mxn(it.mxn) + '</b></div>').join('');
  }
  function renderImpacto(host) {
    _curView = 'impacto';
    const model = S.impactModel();
    let nUp = 0, nMet = 0, totalSav = 0;
    model.forEach(m => { m.metrics.forEach(x => { nMet++; if (x.good) nUp++; }); totalSav += S.savingsOf(m.account_id).total; });
    const objetivos = model.map(m => m.objetivo).filter((o, i, a) => a.indexOf(o) === i);
    host.innerHTML = '<div class="eyebrow">Capa 3 · dato de fundador</div><h2 class="vh">Panel de impacto</h2>' +
      '<p class="vsub"><b>Medidor B de la Capa 3.</b> Lo que el trabajo produce: resultados por objetivo/canal (base → ahora) <b>+ el ahorro operativo</b> en horas que el equipo o el cliente ya no gasta. Las métricas derivan del <b>objetivo</b> de cada cliente — igual que la marca deriva del arquetipo. En vivo se conecta por <b>API/MCP</b> (Meta, GA4, Google Business, TikTok…); aquí es demo.</p>' +
      '<div class="kpis">' + kpi(model.length, 'Marcas con panel') + kpi(nUp + '/' + nMet, 'Métricas al alza') + kpi(objetivos.length, 'Objetivos activos') + kpi(U.mxn(Math.round(totalSav)), 'Ahorro operativo · mensual') + '</div>' +
      '<div class="capnote">El impacto es lo que hace <b>defendible</b> el retainer: no pides que confíen en nuestra palabra, se <b>ve</b>. Sin <b>línea base al arranque</b> no hay delta atribuible — por eso el panel captura la base al iniciar y mide el cambio mes a mes. El ahorro operativo es el valor que <b>no se ve en redes</b> pero libera margen.</div>' +
      '<div style="margin-top:22px">' + (model.length ? model.map(m => {
        const good = m.metrics.filter(x => x.good).length;
        return '<div class="imp"><div class="imp-hd"><div class="t"><b>' + U.esc(m.name) + '</b><small>' + U.esc(m.pkg || '—') + ' · ' + U.esc(m.analyst) + ' · ' + good + '/' + m.metrics.length + ' métricas al alza · desde ' + U.esc(m.since) + '</small></div>' +
          '<div class="obj">Objetivo · ' + U.esc(m.objetivo) + '</div></div>' +
          metricRows(m.metrics) + savingsBlock(m.account_id) + '</div>';
      }).join('') : '<div class="list"><div class="li"><div class="g"><small>Ninguna marca con panel de impacto todavía. Se activa al fijar un objetivo y conectar fuentes en el retainer.</small></div></div></div>') + '</div>' +
      '<p class="hint">El objetivo lo fija el analista por cliente; cada objetivo trae sus métricas y canales sugeridos (Reconocimiento · Consideración · Conversión · Lealtad · Operación). En vivo, las cifras vienen de las fuentes conectadas por API/MCP y el ahorro operativo lo <b>valida el analista</b> — nunca un número automático sin criterio. El cliente ve su propio panel; el fundador ve todos.</p>';
  }

  /* ── Programa de referidos · link personal + comisión post-cobro ── */
  function refStatusTag(s) {
    if (s === 'liquidado') return '<span class="tag hi">liquidado</span>';
    if (s === 'cobrado') return '<span class="tag warn">comisión exigible</span>';
    if (s === 'contrato') return '<span class="tag blue">contratado</span>';
    return '<span class="tag mid">registrado</span>';
  }
  function renderReferidos(host) {
    _curView = 'referidos';
    const rs = S.referrals(), st = S.referralStats();
    const kinds = ['Red de contactos', 'Cliente embajador', 'Creador de contenido', 'Aliado / agencia', 'Otro'];
    host.innerHTML = '<div class="eyebrow">Capa 3 · adquisición</div><h2 class="vh">Programa de referidos</h2>' +
      '<p class="vsub">Links personales para gente con red de contactos o perfil para referir. Cada referido que <b>contrata un plan</b> paga una comisión al referente, liquidada <b>después del cobro</b> — la misma disciplina de caja que el bono del equipo: nunca se paga sobre dinero que no entró. <b>Costo de adquisición cero</b> hasta que hay venta cobrada.</p>' +
      '<div class="kpis">' + kpi(st.total, 'Referentes activos') + kpi(st.contratados, 'Contrataron un plan') + kpi(U.mxn(Math.round(st.porPagar)), 'Comisión por pagar') + kpi(U.mxn(Math.round(st.pagado)), 'Comisión pagada') + '</div>' +
      '<div class="capnote">La comisión solo se genera si el referido <b>contrata</b>, y solo es exigible cuando <b>cobramos</b>. Estado del referido: <b>registrado</b> → <b>contratado</b> → <b>comisión exigible</b> (ya cobramos) → <b>liquidado</b>. Ingreso generado por referidos hasta hoy: <b>' + U.mxn(Math.round(st.ingresoGen)) + '</b>.</div>' +
      '<div class="panel" style="margin-top:20px"><div class="row spread"><h3>Generar link de referido</h3><span class="mono" style="font-size:11px;color:var(--fg-faint)">rastreable en el portal</span></div>' +
      '<p class="d">Crea un link personal; cuando alguien lo usa y contrata, la comisión se le atribuye automáticamente.</p>' +
      '<div class="addref"><div><label class="flabel">Referente</label><input id="refName" placeholder="Nombre o empresa"></div>' +
      '<div><label class="flabel">Perfil</label><select id="refKind" style="background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:10px 12px;color:var(--fg);font-size:14px">' + kinds.map(k => '<option>' + k + '</option>').join('') + '</select></div>' +
      '<div><label class="flabel">Comisión %</label><input id="refPct" class="w-sm" type="number" value="10" min="0" max="30" step="1"></div>' +
      '<button class="btn solid" onclick="DVStaff.crearReferido()">Generar link →</button></div></div>' +
      '<h3 style="margin:26px 0 12px;font-size:15px">Referentes & comisiones</h3>' +
      '<div class="list">' + (rs.length ? rs.map(r => {
        const link = 'donventas.mx/r/' + r.code;
        return '<div class="li"><div class="g"><b>' + U.esc(r.referrer) + '</b><small>' + U.esc(r.kind) + ' · ' + U.ago(r.at) + (r.account_name ? ' · refirió a ' + U.esc(r.account_name) : '') + (r.status === 'liquidado' && r.paid_at ? ' · pagada ' + U.ago(r.paid_at) : '') + '</small>' +
          '<div style="margin-top:8px"><span class="reflink" title="clic para copiar" onclick="DVStaff.copiarLink(\'' + link + '\')" style="cursor:pointer">' + link + '</span></div></div>' +
          '<div style="text-align:right;min-width:120px"><div class="amt" style="' + (r.status === 'cobrado' ? 'color:var(--accent)' : '') + '">' + (r.commission ? U.mxn(r.commission) : '—') + '</div><div class="mono" style="font-size:11px;color:var(--fg-faint)">comisión ' + r.commission_pct + '%' + (r.plan_value ? ' · plan ' + U.mxn(r.plan_value) : '') + '</div></div>' +
          refStatusTag(r.status) +
          (r.status === 'cobrado' ? '<button class="btn solid sm" onclick="DVStaff.marcarReferido(\'' + r.id + '\')">Marcar pagada</button>' : '') + '</div>';
      }).join('') : '<div class="li"><div class="g"><small>Sin referentes todavía. Genera el primer link arriba.</small></div></div>') + '</div>' +
      '<p class="hint">En vivo, el link (<span class="mono">donventas.mx/r/&lt;code&gt;</span>) escribe <span class="mono">referral.code</span> en el signup del prospecto; al contratar se enlaza <span class="mono">account_id</span> y al validar el pago pasa a <b>comisión exigible</b>. El pago se libera <b>post-cobro</b>, igual que el bono del equipo. Calibración pendiente: <b>% de comisión</b> por tipo de referente.</p>';
  }
  function crearReferido() {
    const n = (U.el('refName').value || '').trim(); if (!n) return U.toast('Escribe el nombre del referente');
    const kind = U.el('refKind').value, pct = parseFloat(U.el('refPct').value) || 10;
    const code = S.addReferral(n, kind, pct);
    U.toast('Link generado · donventas.mx/r/' + code); DVPortal.go('referidos');
  }
  function marcarReferido(id) { if (!window.confirm('¿Marcar la comisión como pagada? (post-cobro)')) return; S.markReferralPaid(id); U.toast('Comisión liquidada'); DVPortal.go('referidos'); }
  function copiarLink(link) { try { navigator.clipboard.writeText('https://' + link); U.toast('Link copiado: ' + link); } catch (e) { U.toast(link); } }

  return { nav, ctxLabel, render, open, send, iterar, validar, solicitar, compartir, addComment, saveRound, publish, revert, aprobarMejora, descartarMejora, publicarBacklog, exportarFeed, accToggle, focusCuentas, beginActivate, cancelActivate, setActKind, setActAnalyst, confirmActivate, toggleCapa, inviteStaff, assign, changeKind, expandAll, collapseAll, setBase, reasignarAhora, aceptar, rechazar, nuevoEvento, quitarEvento, expediente, publicarTestimonio, retirarTestimonio, validatePay, setLabor, setPeriod, setPeriodSpan, setPeriodAnchor, renderAplicacion, setCatPrice, setBonoPct, setUmbral, crearReferido, marcarReferido, copiarLink };
})();
