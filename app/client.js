/* Don Ventas · Portal — Vistas del CLIENTE (owner / miembro) */
window.DVClient = (function () {
  const U = DVUtil, S = DVStore;
  let curBlock = null, _route = 'tablero';

  /* ── acordeón + kanban (mismo sistema que el staff, memoria propia del cliente) ── */
  let _open = _loadOpen();
  function _loadOpen() { try { return JSON.parse(DVEnv.storage.getItem('open-client') || '{}'); } catch (e) { return {}; } }
  function _saveOpen() { try { DVWriteGuard.run('ui.preference', 'ui-state', {}, () => DVEnv.storage.setItem('open-client', JSON.stringify(_open))); } catch (e) { } }
  function _isOpen(key, def) { return _open[key] === undefined ? (def !== false) : _open[key]; }
  function accToggle(key, def) { _open[key] = !_isOpen(key, def); _saveOpen(); DVPortal.go(_route); }
  function accordion(key, def, titleHTML, countHTML, bodyHTML) {
    const open = _isOpen(key, def);
    return '<div class="acc' + (open ? ' open' : '') + '"><button class="acc-hd" onclick="DVClient.accToggle(\'' + key + '\',' + (def !== false) + ')">' + U.CHEVRON +
      '<span class="an">' + titleHTML + '</span>' + (countHTML || '') + '</button>' +
      (open ? '<div class="acc-bd">' + bodyHTML + '</div>' : '') + '</div>';
  }
  function _accKeys(route) {
    const accId = S.session().accountId, blocks = S.blocksOf(accId);
    if (route === 'tablero') return S.CAPAS.filter(c => blocks.some(b => b.capa === c.name)).map(c => 'cli-tab-' + c.name);
    if (route === 'bitacora') { const rs = S.allRounds(accId); return S.CAPAS.filter(c => { const ids = blocks.filter(b => b.capa === c.name).map(b => b.id); return rs.some(r => ids.indexOf(r.block_id) >= 0); }).map(c => 'cli-bit-' + c.name); }
    return [];
  }
  function accToolbar(route) { const ks = _accKeys(route); if (ks.length < 2) return ''; const allOpen = ks.every(k => _isOpen(k, true)); const allClosed = ks.every(k => !_isOpen(k, true)); return '<div class="acctools"><button class="btn sm" onclick="DVClient.expandAll()"' + (allOpen ? ' disabled' : '') + '>Expandir todo</button><button class="btn sm" onclick="DVClient.collapseAll()"' + (allClosed ? ' disabled' : '') + '>Colapsar todo</button></div>'; }
  function expandAll() { _accKeys(_route).forEach(k => _open[k] = true); _saveOpen(); DVPortal.go(_route); }
  function collapseAll() { _accKeys(_route).forEach(k => _open[k] = false); _saveOpen(); DVPortal.go(_route); }
  function cliKanban(bs) {
    return '<div class="kb">' + U.CANON_STATES.map(st => {
      const col = bs.filter(b => U.blockState(b.status) === st.key);
      return '<div class="kbcol ' + st.key + '"><div class="kbcol-h"><span class="dot"></span>' + st.label + '<span class="n">' + col.length + '</span></div>' +
        '<div class="kbcards">' + (col.length ? col.map(b => '<div class="kbcard" onclick="DVClient.open(\'' + b.id + '\')"><div class="kc">' + b.code + '</div><div class="kt">' + U.esc(b.title) + '</div>' + U.prog(b.progress) + '</div>').join('') : '<div class="kbempty">—</div>') + '</div></div>';
    }).join('') + '</div>';
  }

  const nav = () => {
    const owner = S.isOwner();
    const accId = S.session().accountId;
    const hasValue = !!S.impactOf(accId) || (S.appMonthlyValue(accId) > 0);
    return [
      { group: 'Mi marca' },
      { route: 'tablero', icon: '◧', label: 'Tablero' },
      hasValue && { route: 'impacto', icon: '◍', label: 'Impacto & valor' },
      { route: 'bitacora', icon: '☰', label: 'Bitácora' },
      { route: 'archivos', icon: '⤓', label: 'Archivos' },
      owner && { route: 'cuenta', icon: '$', label: 'Cuenta' },
      owner && { route: 'miembros', icon: '◎', label: 'Miembros' },
      { group: 'Capas del ecosistema' },
      { static: true, icon: '◆', label: 'Marca', badge: '<span class="lock" style="color:#7DE0A6;opacity:1">activa</span>' },
      { static: true, locked: true, icon: '◇', label: 'Operación', badge: '<span class="lock">🔒</span>', title: 'Otra empresa del grupo — operación y estrategia comercial' },
      { static: true, locked: true, icon: '◇', label: 'Datos · finanzas', badge: '<span class="lock">🔒</span>', title: 'Otra empresa del grupo — datos, contabilidad y finanzas' }
    ].filter(Boolean);
  };

  function ctxLabel() {
    const acc = S.account(S.session().accountId);
    return 'Marca · <b>' + U.esc(acc.name) + '</b> <span class="pkg">· ' + U.esc(acc.pkg) + '</span>';
  }

  function render(route, host) {
    _route = route;
    if (route === 'bloque') return renderBlock(host);
    if (route === 'impacto') return renderImpacto(host);
    if (route === 'bitacora') return renderBitacora(host);
    if (route === 'archivos') return renderArchivos(host);
    if (route === 'cuenta') return renderCuenta(host);
    if (route === 'miembros') return renderMiembros(host);
    return renderTablero(host);
  }

  function renderTablero(host) {
    const accId = S.session().accountId;
    const blocks = S.blocksOf(accId);
    const closed = blocks.filter(b => b.status === 'cerrado').length;
    const revis = blocks.filter(b => b.status === 'en_revision').length;
    const pct = Math.round(blocks.reduce((s, b) => s + b.progress, 0) / (blocks.length || 1));
    const capas = S.CAPAS.filter(c => blocks.some(b => b.capa === c.name)).map(c => {
      const bs = blocks.filter(b => b.capa === c.name);
      const done = bs.filter(b => b.status === 'cerrado').length;
      const title = '<b>' + c.name + '</b><small>' + U.esc(c.d) + '</small>';
      const count = '<span class="acount">' + done + '/' + bs.length + ' cerrados</span>';
      return accordion('cli-tab-' + c.name, true, title, count, cliKanban(bs));
    }).join('');
    host.innerHTML =
      '<div class="eyebrow">Tu marca, en vivo</div><h2 class="vh">Tablero</h2>' +
      '<p class="vsub">Así avanza tu sistema de marca, por etapa y estado. Cuando algo esté <b>en revisión</b>, ábrelo y aprueba tu checkpoint.</p>' +
      surveyCard(accId) +
      '<div class="kpis">' +
      kpi('<i>' + blocks.length + '</i>', 'Bloques del sistema') + kpi(closed, 'Cerrados') +
      kpi(revis, 'En revisión') + kpi(pct + '%', 'Avance total') + '</div>' +
      '<div class="prog" style="margin-bottom:24px"><i style="width:' + pct + '%"></i></div>' +
      '<p class="kbnote">Cada etapa muestra sus bloques en los cuatro estados — el mismo tablero que ve el equipo. Toca un bloque para abrir su detalle.</p>' +
      accToolbar('tablero') + capas;
  }
  function kpi(v, k) { return '<div class="kpi"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>'; }

  /* ── Encuesta de satisfacción (scoring + feedback + consentimiento de testimonio) ── */
  let _survey = null;
  function _captureSurvey() { if (_survey) { const el = U.el('surveyText'); if (el) _survey.text = el.value; } }
  function starRow(rating, interactive) {
    return '<div class="stars' + (interactive ? ' int' : '') + '">' + [1, 2, 3, 4, 5].map(n =>
      '<button class="star' + (n <= rating ? ' on' : '') + '"' + (interactive ? ' onclick="DVClient.setStars(' + n + ')"' : ' disabled') + '>★</button>').join('') + '</div>';
  }
  function surveyCard(accId) {
    if (_survey) {
      const labels = ['Toca una estrella', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];
      return '<div class="panel survey"><h3>' + (_survey.phase === 'capa3' ? 'Seguimiento · Capa 3' : 'Tu experiencia con Don Ventas') + '</h3>' +
        '<p class="d">Tu opinión nos ayuda a mejorar y a reconocer al equipo. Solo se publica como testimonio si tú lo autorizas.</p>' +
        '<div class="fld"><label>¿Cómo calificarías el servicio?</label><div class="starwrap">' + starRow(_survey.rating, true) + '<span class="starlbl">' + labels[_survey.rating] + '</span></div></div>' +
        '<div class="fld"><label>¿Qué nos quieres compartir? <span class="opt">(opcional)</span></label><textarea id="surveyText" rows="4" placeholder="Lo que más te gustó, los resultados que viste, o qué podemos mejorar…">' + U.esc(_survey.text || '') + '</textarea></div>' +
        '<label class="consent' + (_survey.consent ? ' on' : '') + '"><input type="checkbox"' + (_survey.consent ? ' checked' : '') + ' onclick="DVClient.toggleConsent()"><span><b>Autorizo a Don Ventas</b> a usar mi reseña y el nombre de mi marca como testimonio en su sitio. Puedo retirarla cuando quiera; se publicaría <b>48 h</b> después de enviarla.</span></label>' +
        '<div class="acts"><button class="btn sm" onclick="DVClient.cancelSurvey()">Cancelar</button><button class="btn solid sm" onclick="DVClient.submitSurvey()">Enviar reseña →</button></div></div>';
    }
    const parts = [];
    const rs = S.reviewsOf(accId);
    if (rs.length) parts.push('<div class="panel survey-done"><div class="row spread"><h3>Tus reseñas</h3>' +
      (rs.length > 1 ? '<span class="fmeta">' + rs.length + ' reseñas</span>' : '') + '</div>' +
      rs.map(reviewRow).join('') + '</div>');
    const pend = S.pendingSurvey(accId);
    if (pend) parts.push('<div class="panel survey-cta"><div class="row spread"><div class="g"><h3>' + pend.label + '</h3><p class="d">Cuéntanos cómo va tu experiencia con Don Ventas. Toma menos de un minuto.</p></div>' +
      '<button class="btn solid sm" onclick="DVClient.startSurvey(\'' + pend.phase + '\')">Calificar mi experiencia</button></div></div>');
    return parts.join('');
  }
  const PHASE_L = { build: 'Al cierre del build', capa3: 'Seguimiento · Capa 3' };
  function reviewRow(r) {
    const st = S.reviewStatus(r);
    const msg = st === 'publicado' ? 'Publicada como testimonio en nuestro sitio. ¡Gracias por la confianza!' :
      (st === 'listo' || st === 'en_espera') ? 'Autorizaste publicarla — aparecerá en testimonios en las próximas horas.' :
      'No la publicaremos sin tu permiso.';
    const canRetract = st === 'publicado' || st === 'listo' || st === 'en_espera';
    const act = canRetract
      ? '<button class="btn sm ghost" onclick="DVClient.retirarReview(\'' + r.id + '\')">Retirar de testimonios</button>'
      : '<button class="btn sm" onclick="DVClient.reautorizarReview(\'' + r.id + '\')">Autorizar publicación</button>';
    return '<div class="revrow"><div class="row spread"><small class="revph mono">' + (PHASE_L[r.phase] || r.phase) + ' · ' + U.ago(r.submitted_at) + '</small>' + starRow(r.rating, false) + '</div>' +
      (r.feedback ? '<p class="quote">“' + U.esc(r.feedback) + '”</p>' : '') +
      '<div class="revrow-ft"><span class="revmsg">' + msg + '</span>' + act + '</div></div>';
  }
  function startSurvey(phase) { _survey = { phase, rating: 0, consent: false, text: '' }; DVPortal.go('tablero'); }
  function setStars(n) { _captureSurvey(); if (_survey) _survey.rating = n; DVPortal.go('tablero'); }
  function toggleConsent() { _captureSurvey(); if (_survey) _survey.consent = !_survey.consent; DVPortal.go('tablero'); }
  function cancelSurvey() { _survey = null; DVPortal.go('tablero'); }
  function submitSurvey() {
    if (!_survey || !_survey.rating) return U.toast('Elige una calificación de 1 a 5');
    _captureSurvey(); const accId = S.session().accountId;
    S.addReview(accId, _survey.phase, _survey.rating, _survey.text || '', _survey.consent);
    const consent = _survey.consent; _survey = null;
    U.toast('¡Gracias! Tu reseña quedó registrada' + (consent ? ' · publicable en 48 h' : ''));
    DVPortal.go('tablero');
  }
  function retirarReview(id) { S.retractReview(id); U.toast('Reseña retirada · no se publicará sin tu permiso'); DVPortal.go('tablero'); }
  function reautorizarReview(id) { S.grantReviewConsent(id); U.toast('Autorizada · se publica 48 h después'); DVPortal.go('tablero'); }

  /* ── Impacto & valor (lo que el cliente ve · Capa 3) — su impacto + volumen a valor de lista ── */
  function _cliMetric(m) {
    const dir = m.now >= m.base ? '↑' : '↓', cls = m.good ? 'up' : 'dn';
    const dpct = m.deltaPct == null ? '—' : (m.deltaPct > 0 ? '+' : '') + m.deltaPct + '%';
    const fmt = v => m.unit === '$' ? U.mxn(v) : m.unit === '%' ? ((Math.round(v * 10) / 10) + '%') : m.unit === 's' ? (v + 's') : v.toLocaleString('es-MX');
    return '<div class="mtr"><div class="mk">' + U.esc(m.k) + '<small>' + U.esc(m.ch) + '</small></div>' +
      '<div class="mv">' + fmt(m.base) + ' <span style="color:var(--fg-faint)">→</span> <b>' + fmt(m.now) + '</b></div>' +
      '<div class="md ' + cls + '">' + dir + ' ' + dpct + '</div></div>';
  }
  function renderImpacto(host) {
    const accId = S.session().accountId, acc = S.account(accId);
    const im = S.impactOf(accId);
    const lines = S.appLinesOf(accId), appVal = S.appMonthlyValue(accId), pieces = S.appPieces(accId);
    const sav = S.savingsOf(accId); const myItems = sav.items.filter(it => it.who === 'cliente'); const myTotal = myItems.reduce((s, it) => s + it.mxn, 0);
    const mrr = acc.mrr || 0;
    const kpis = [];
    if (appVal > 0) kpis.push(kpi(U.mxn(Math.round(appVal)), 'Valor producido este mes'));
    if (pieces > 0) kpis.push(kpi(pieces, 'Piezas entregadas'));
    if (im) { const up = im.metrics.filter(x => x.good).length; kpis.push(kpi(up + '/' + im.metrics.length, 'Métricas al alza')); }
    if (myTotal > 0) kpis.push(kpi(U.mxn(Math.round(myTotal)), 'Horas que te ahorramos'));
    host.innerHTML = '<div class="eyebrow">Tu marca trabajando</div><h2 class="vh">Impacto & valor</h2>' +
      '<p class="vsub">Ya no pagas por construcción: pagas porque tu marca <b>trabaja y genera valor todos los días</b>. Aquí ves lo que produce y el resultado que genera — con datos, no de palabra.</p>' +
      (kpis.length ? '<div class="kpis">' + kpis.join('') + '</div>' : '') +
      (appVal > mrr && mrr > 0 ? '<div class="capnote">Este mes tu retainer produjo <b>' + U.mxn(Math.round(appVal)) + '</b> en valor de aplicación — a precio de mercado, más de lo que pagas por él. <b>Recibes más valor del que inviertes.</b></div>' : '') +
      (im ? '<h3 style="margin:26px 0 12px;font-size:15px">Resultados · objetivo: ' + U.esc(im.objetivo) + '</h3>' +
        '<p class="vsub" style="margin-bottom:14px">Desde que arrancó tu retainer (' + U.esc(im.since) + '), comparado con la línea base al inicio.</p>' +
        '<div class="imp"><div class="imp-hd"><div class="t"><b>' + U.esc(acc.name) + '</b><small>medido por canal · base → hoy</small></div><div class="obj">Objetivo · ' + U.esc(im.objetivo) + '</div></div>' +
        im.metrics.map(_cliMetric).join('') + '</div>' : '') +
      (lines.length ? '<h3 style="margin:26px 0 12px;font-size:15px">Lo que produjimos este mes <span class="mono" style="font-size:10px;color:var(--fg-faint);text-transform:none;letter-spacing:0">· a valor de lista de mercado</span></h3>' +
        '<div class="list">' + lines.map(l => '<div class="li"><div class="g"><b>' + l.qty + '× ' + U.esc(l.name) + '</b><small>por ' + U.esc(l.unit) + ' · ' + U.mxn(l.price) + ' c/u</small></div><span class="amt">' + U.mxn(l.subtotal) + '</span></div>').join('') +
        '<div class="li"><div class="g"><b>Valor total producido</b><small>suma a precio de mercado</small></div><span class="amt" style="color:var(--accent-2)">' + U.mxn(Math.round(appVal)) + '</span></div></div>' : '') +
      (myItems.length ? '<h3 style="margin:26px 0 12px;font-size:15px">Tiempo que te ahorramos <span class="mono" style="font-size:10px;color:var(--fg-faint);text-transform:none;letter-spacing:0">· operación que ya no haces a mano</span></h3>' +
        '<div class="imp">' + myItems.map(it => '<div class="savrow"><span>' + U.esc(it.act) + '</span><b>' + it.hours + ' h/mes = ' + U.mxn(it.mxn) + '</b></div>').join('') + '</div>' : '') +
      '<p class="hint">Las cifras de resultados se conectan a tus fuentes (redes, web, Google) para medir el cambio real desde el arranque. El valor de aplicación usa precios de mercado de referencia — es lo que costaría suelto cada entregable.</p>';
  }

  /* ── Archivos · centro de descargas (todos los entregables de la marca en un lugar) ── */
  const CLS_META = {
    direccion: { label: 'Dirección & documentos', d: 'Tu estrategia, tu voz y tus guías. Son tuyos siempre — incluidos en tu plan.' },
    produccion: { label: 'Producción', d: 'Archivos fuente y exports de cada bloque. Se liberan al liquidar el bloque.' },
    generador: { label: 'Generadores', d: 'Plantillas vivas y automatizaciones. Activas mientras tu retainer esté al corriente.' }
  };
  function renderArchivos(host) {
    const accId = S.session().accountId;
    const all = S.assetsAllOf(accId);
    const avail = all.filter(a => a.available).length, wait = all.length - avail;
    const groups = ['direccion', 'produccion', 'generador'].filter(c => all.some(a => a.cls === c)).map(c => {
      const rows = all.filter(a => a.cls === c), m = CLS_META[c], n = rows.filter(a => a.available).length;
      const items = rows.map(a => {
        const act = a.available
          ? '<button class="btn sm solid" onclick="DVClient.download(\'' + a.id + '\')">Descargar ↓</button>'
          : '<span class="tag locked">🔒 ' + U.esc(a.reason) + '</span>';
        return '<div class="li"><div class="g"><b>' + U.esc(a.name) + '</b><small>' + U.esc(a.code + ' · ' + a.blockTitle) + ' · ' + U.esc(a.capa) + '</small></div>' + act + '</div>';
      }).join('');
      return '<h3 style="margin:28px 0 4px;font-size:15px">' + m.label + ' <span class="acount">' + n + '/' + rows.length + ' disponibles</span></h3>' +
        '<p class="vsub" style="margin-bottom:12px">' + m.d + '</p><div class="list">' + items + '</div>';
    }).join('');
    host.innerHTML = '<div class="eyebrow">Todo en un lugar</div><h2 class="vh">Archivos</h2>' +
      '<p class="vsub">Todas las descargas de tu marca, reunidas. Tu dirección y documentos son tuyos siempre; la producción se libera al liquidar cada bloque, y los generadores viven con tu retainer.</p>' +
      '<div class="kpis">' + kpi(all.length, 'Archivos') + kpi(avail, 'Disponibles') + kpi(wait, 'En espera') + '</div>' +
      (groups || '<div class="list"><div class="li"><div class="g"><small>Aún sin archivos.</small></div></div></div>') +
      '<p class="hint">¿Necesitas otro formato o un archivo que no ves aquí? Pídelo a tu analista desde cualquier bloque.</p>';
  }
  function download(id) { U.toast('Preparando tu descarga…'); }

  function open(id) { curBlock = id; window.DVPortal.go('bloque'); }

  function renderBlock(host) {
    const b = S.block(curBlock); if (!b) return window.DVPortal.go('tablero');
    const pv = S.previewOf(b.id);
    const rs = S.roundsOf(b.id);
    const showPrev = (b.status === 'en_curso' || b.status === 'en_revision') && pv;
    const showChk = b.status === 'en_revision';
    const paid = S.balance(S.session().accountId) === 0;
    host.innerHTML =
      '<button class="back" onclick="DVPortal.go(\'tablero\')">← Tablero</button>' +
      '<div class="eyebrow">' + b.code + '</div><h2 class="vh">' + U.esc(b.title) + '</h2>' +
      '<p class="vsub">' + U.statusPill(b.status) + '</p>' +
      (showPrev ? '<div class="panel"><div class="row spread"><div><h3>Preview de la mejora</h3><p class="d mono">rama · ' + U.esc(pv.branch) + '</p></div>' +
        '<button class="btn solid sm" onclick="DVClient.preview(\'' + b.id + '\')">Abrir preview ↗</button></div>' +
        (paid ? '' : '<div class="row" style="margin-top:14px"><span class="wm">⛓ Con marca de agua hasta liquidar el proyecto</span></div>') + '</div>' : '') +
      (b.status === 'cerrado' ? '<div class="panel"><div class="row spread"><div><h3>Entregable final</h3><p class="d">Bloque cerrado. Ábrelo en vivo en tu sitio o revisa la vista de pantalla.</p></div>' +
        '<button class="btn solid sm" onclick="DVUtil.toast(\'Abriendo el entregable en vivo…\')">Abrir en vivo ↗</button></div></div>' : '') +
      (showChk ? '<div class="panel"><div class="row spread"><div><h3>Tu checkpoint</h3><p class="d">Revisa el preview y aprueba, o pide ajustes. Nada avanza sin tu sí.</p></div>' +
        '<div class="row"><button class="btn sm" onclick="DVClient.comment()">Pedir ajustes</button><button class="btn solid sm" onclick="DVClient.approve(\'' + b.id + '\')">Aprobar ✓</button></div></div></div>' : '') +
      '<h3 style="margin:26px 0 12px;font-size:15px">Rondas de este bloque</h3>' +
      '<div class="rounds">' + (rs.length ? rs.map(r => rndRow(r)).join('') : '<div class="rnd"><div class="tt"><small>Aún sin rondas.</small></div></div>') + '</div>' +
      '<h3 style="margin:26px 0 12px;font-size:15px">Entregables</h3><div class="list">' +
      S.assetsOf(b.id).map(a => '<div class="li"><div class="g"><b>' + U.esc(a.name) + '</b><small>' + (a.locked ? 'se desbloquea al liquidar' : a.kind) + '</small></div>' +
        (a.locked ? '<span class="tag locked">🔒 bloqueado</span>' : '<button class="btn sm" onclick="DVUtil.toast(\'Abriendo…\')">Ver</button>') + '</div>').join('') +
      (S.assetsOf(b.id).length ? '' : '<div class="li"><div class="g"><small>Sin entregables aún.</small></div></div>') + '</div>';
  }
  function rndRow(r) {
    return '<div class="rnd"><div class="seq">' + r.seq + '</div><div class="tt">' + U.esc(r.title) + '<small>' + U.esc(r.deliverable) + ' · ' + U.ago(r.created_at) + '</small></div>' +
      '<div class="fb">' + U.esc(r.feedback) + '</div>' + U.resTag(r.result) + '</div>';
  }

  function renderBitacora(host) {
    const accId = S.session().accountId;
    const blocks = S.blocksOf(accId);
    const capas = S.CAPAS.filter(c => {
      const ids = blocks.filter(b => b.capa === c.name).map(b => b.id);
      return S.allRounds(accId).some(r => ids.indexOf(r.block_id) >= 0);
    }).map(c => {
      const ids = blocks.filter(b => b.capa === c.name).map(b => b.id);
      const rs = S.allRounds(accId).filter(r => ids.indexOf(r.block_id) >= 0);
      const done = blocks.filter(b => b.capa === c.name && b.status === 'cerrado').length;
      const stateGroups = U.CANON_STATES.map(st => ({ st, rows: rs.filter(r => U.roundState(r.result) === st.key) })).filter(x => x.rows.length);
      const body = stateGroups.map(x => {
        const key = 'cli-bit-' + c.name + '-' + x.st.key, def = x.st.key !== 'aprobado', open = _isOpen(key, def);
        const rows = '<div class="rounds">' + x.rows.map(r => {
          const bl = S.block(r.block_id);
          return '<div class="rnd link" onclick="DVClient.open(\'' + r.block_id + '\')"><div class="seq">' + r.seq + '</div>' +
            '<div class="tt">' + U.esc(bl.code + ' · ' + r.title) + '<small>' + U.esc(r.deliverable) + ' · ' + U.ago(r.created_at) + '</small></div>' +
            '<div class="fb">' + U.esc(r.feedback) + '</div>' + U.resTag(r.result) + '</div>';
        }).join('') + '</div>';
        return '<div class="stategrp' + (open ? ' open' : '') + '"><button class="stategrp-h" onclick="DVClient.accToggle(\'' + key + '\',' + def + ')">' + U.CHEVRON + U.statePill(x.st.key) + '<span class="n">' + x.rows.length + '</span></button>' + (open ? rows : '') + '</div>';
      }).join('');
      const title = '<b>' + c.name + '</b><small>' + rs.length + ' ronda' + (rs.length === 1 ? '' : 's') + '</small>';
      const count = '<span class="acount">' + done + '/' + blocks.filter(b => b.capa === c.name).length + ' cerrados</span>';
      return accordion('cli-bit-' + c.name, true, title, count, body);
    }).join('');
    host.innerHTML = '<div class="eyebrow">Tu tablero compartido</div><h2 class="vh">Bitácora</h2>' +
      '<p class="vsub">El historial vivo de tu marca — por etapa y estado, cada ronda que registramos, visible para ti. Solo se agregan registros, nunca se editan hacia atrás.</p>' +
      accToolbar('bitacora') + (capas || '<div class="list"><div class="li"><div class="g"><small>Sin registros todavía.</small></div></div></div>');
  }

  function renderCuenta(host) {
    const accId = S.session().accountId;
    const inv = S.invoicesOf(accId);
    const bal = S.balance(accId);
    host.innerHTML = '<div class="eyebrow">Solo el owner</div><h2 class="vh">Estado de cuenta</h2>' +
      '<p class="vsub">Anticipos, saldo y retainer de tu marca. Al liquidar un bloque se retira su marca de agua y se habilitan sus descargas.</p>' +
      '<div class="list">' + inv.map(i => '<div class="li"><div class="g"><b>' + U.esc(i.concept) + '</b>' +
        (i.paid_at ? '<small>pagado ' + U.ago(i.paid_at) + '</small>' : '') + '</div><span class="amt">' + U.mxn(i.amount) + '</span><span class="tag ' + i.status + '">' + i.status + '</span></div>').join('') + '</div>' +
      (bal > 0 ? '<div class="row" style="margin-top:18px;justify-content:space-between"><span class="memlimit">Saldo por pagar: <b style="color:var(--fg)">' + U.mxn(bal) + '</b></span>' +
        '<button class="btn solid" onclick="DVUtil.toast(\'Redirigiendo a pago seguro (Stripe)…\')">Pagar saldo →</button></div>' : '<p class="hint">Sin saldo pendiente. Todo al corriente.</p>');
  }

  function renderMiembros(host) {
    const accId = S.session().accountId;
    const mem = S.membersOf(accId);
    host.innerHTML = '<div class="eyebrow">Solo el owner</div><h2 class="vh">Miembros de la marca</h2>' +
      '<p class="vsub">Invita a tu equipo a colaborar bajo <b>' + U.esc(S.account(accId).name) + '</b>. <span class="memlimit">' + mem.length + '/5 miembros</span></p>' +
      '<div class="list">' + mem.map(m => {
        const tag = m.member_role === 'owner' ? '<span class="tag blue">owner</span>' : (m.pending ? '<span class="tag pendiente">invitación enviada</span>' : '<span class="tag">miembro</span>');
        return '<div class="li"><div class="g"><b>' + U.esc(m.name) + '</b><small>' + U.esc(m.email) + '</small></div>' + tag + '</div>';
      }).join('') + '</div>' +
      '<div class="inviteform"><input id="inviteEmail" type="email" placeholder="correo@delsocio.mx">' +
      '<button class="btn solid" onclick="DVClient.invite()">Invitar miembro →</button></div>' +
      '<p class="memlimit" style="margin-top:12px">Límite: 5 miembros por marca (hasta 10 en Ecosistema). El invitado colabora sin ver facturación.</p>';
  }

  /* actions */
  async function approve(id) {
    U.toast('Aprobando checkpoint…');
    const r = await S.approve(id);
    if (r.status !== 'SUCCEEDED') return U.toast('No se aprobó el checkpoint · intenta de nuevo');
    U.toast('Checkpoint aprobado ✓ — el bloque se cierra'); window.DVPortal.go('tablero');
  }
  function comment() { window.DVPortal.modal('comment'); }
  async function sendComment(text) {
    const b = S.block(curBlock);
    const r = b && await S.addRound(b.id, { title: 'Ajustes solicitados', deliverable: 'checkpoint', feedback: text || 'Ajustes solicitados', result: 'ajustes' });
    if (!r || r.status !== 'SUCCEEDED') { U.toast('No se enviaron los ajustes · intenta de nuevo'); return false; }
    U.toast('Ajustes enviados — queda en la ronda'); return true;
  }
  async function invite() {
    const i = U.el('inviteEmail'); const e = (i.value || '').trim();
    if (!e) return U.toast('Escribe un correo');
    if (S.membersOf(S.session().accountId).length >= 5) return U.toast('Alcanzaste el límite de 5 miembros');
    U.toast('Enviando invitación…');
    const r = await S.invite(S.session().accountId, e);
    if (r.status !== 'SUCCEEDED') return U.toast('No se envió la invitación · intenta de nuevo');
    i.value = ''; U.toast('Invitación enviada a ' + e);
  }
  function preview(id) { curBlock = id; window.DVPortal.modal('preview'); }
  function curBlockObj() { return S.block(curBlock); }

  return { nav, ctxLabel, render, open, approve, comment, sendComment, invite, preview, curBlockObj, startSurvey, setStars, toggleConsent, cancelSurvey, submitSurvey, retirarReview, reautorizarReview, download, accToggle, expandAll, collapseAll };
})();
