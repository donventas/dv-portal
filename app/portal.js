/* Don Ventas · Portal — Shell, router, boot, glosario, notificaciones y modales */
window.DVPortal = (function () {
  const U = DVUtil, S = DVStore;
  let route = 'tablero';

  function mod() { const a = S.session().actor; return a === 'cliente' ? DVClient : a === 'freemium' ? DVFree : DVStaff; }
  function defaultRoute() { const a = S.session().actor; return a === 'cliente' ? 'tablero' : a === 'freemium' ? 'diagnostico' : 'cuentas'; }

  function boot() {
    U.el('auth').style.display = 'none';
    U.el('app').classList.add('on');
    route = defaultRoute();
    buildShell();
    go(route);
    try { const v = localStorage.getItem('dvportal-view-' + S.session().actor); if (v && hasRoute(v)) go(v); } catch (e) { }
  }
  function hasRoute(v) { return mod().nav().some(n => n.route === v); }

  function buildShell() {
    const s = S.session(), m = mod();
    const me = S.me() || {};
    const roleSeg = s.actor === 'freemium' ? ''
      : s.actor === 'cliente'
      ? '<span class="roleseg"><button id="rgA" class="' + (S.isOwner() ? 'on' : '') + '" onclick="DVPortal.role(\'owner\')">Owner</button><button id="rgB" class="' + (S.isOwner() ? '' : 'on') + '" onclick="DVPortal.role(\'miembro\')">Miembro</button></span>'
      : '<span class="roleseg"><button id="rgA" class="' + (S.isAdmin() ? '' : 'on') + '" onclick="DVPortal.role(\'analista\')">Analista</button><button id="rgB" class="' + (S.isAdmin() ? 'on' : '') + '" onclick="DVPortal.role(\'admin\')">Admin</button></span>';
    U.el('topBar').innerHTML =
      U.MARK + '<span class="brand">DON<i>·</i>VENTAS</span>' +
      '<span class="ctx">' + m.ctxLabel() + '</span>' +
      '<span class="who">' + roleSeg +
      '<div class="popwrap" onmouseenter="DVPortal.renderNoti()"><button class="iconbtn" onclick="DVPortal.pin(\'noti\')" aria-label="Notificaciones">🔔<span class="ndot"></span></button>' +
      '<div class="pop" id="notiPop"><div class="ph">Notificaciones</div><div id="notiBody"></div></div></div>' +
      '<div class="popwrap" onmouseenter="DVPortal.renderGloss()"><button class="iconbtn" onclick="DVPortal.pin(\'gloss\')" aria-label="Glosario">?</button>' +
      '<div class="pop" id="glossPop"><div class="ph">Glosario</div><div class="ghead" id="glossHead"></div><div id="glossBody"></div></div></div>' +
      '<span class="pill" id="rolePill"></span><span class="av">' + (me.name ? me.name[0] : '·') + '</span>' +
      '<button class="iconbtn" title="Salir" onclick="DVPortal.logout()" aria-label="Salir">⎋</button></span>';
    U.el('rolePill').textContent = s.actor === 'freemium' ? 'Cuenta gratis' : s.actor === 'cliente' ? (S.isOwner() ? 'Owner' : 'Miembro') : (S.isAdmin() ? 'Admin' : 'Analista');
    buildNav();
  }

  function buildNav() {
    U.el('side').innerHTML = mod().nav().map(n => {
      if (n.group) return '<div class="lbl">' + n.group + '</div>';
      if (n.static) return '<div class="nav locked"' + (n.title ? ' title="' + U.esc(n.title) + '"' : '') + '><span class="i">' + n.icon + '</span> ' + n.label + ' ' + (n.badge || '') + '</div>';
      return '<button class="nav" data-nav="' + n.route + '" onclick="DVPortal.go(\'' + n.route + '\')"><span class="i">' + n.icon + '</span> ' + n.label + ' ' + (n.badge || '') + '</button>';
    }).join('');
    markNav();
  }
  function markNav() { U.qsa('#side .nav[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === route)); }

  function go(v) {
    route = v;
    mod().render(v, U.el('viewHost'));
    markNav();
    const main = U.el('main'); if (main) main.scrollTop = 0;
    try { if (v !== 'bloque') localStorage.setItem('dvportal-view-' + S.session().actor, v); } catch (e) { }
  }

  function role(r) {
    S.setRole(r);
    buildShell();
    if (!hasRoute(route)) route = defaultRoute();
    go(route);
  }
  function logout() { if (window.DVSupa && DVSupa.LIVE()) { try { DVSupa.signOut(); } catch (e) { } } S.logout(); U.el('app').classList.remove('on'); U.el('side').innerHTML = ''; U.el('topBar').innerHTML = ''; U.el('auth').style.display = 'grid'; DVAuth.render(); }

  /* ── glosario ── */
  const GLOSS_C = {
    'Ronda': { k: 'R1, R2, R3…', d: 'Cada iteración de trabajo sobre un bloque. Incluye entregable, feedback y resultado.' },
    'Bloque': { k: 'B01, B10…', d: 'Una pieza de tu sistema de marca (Logo, Landing…). Siempre verás su nombre.' },
    'Capas de servicio': { k: 'Fundación · Sistema · Activación', d: 'Las 3 etapas del servicio: estrategia, identidad y puesta a vender.' },
    'Checkpoint': { k: 'punto de aprobación', d: 'Cuando revisas y apruebas o pides ajustes. Nada avanza sin tu sí.' },
    'Preview': { k: 'vista previa segura', d: 'Una vista del avance dentro del portal, con marca de agua, antes de aprobarlo.' },
    'Marca de agua': { k: 'sello temporal', d: 'Protege tus entregables hasta que el bloque se liquida; luego se retira.' },
    'Estado de cuenta': { k: 'pagos', d: 'Tus anticipos, saldo y retainer. Solo el owner lo ve.' },
    'Owner / Miembro': { k: 'tipos de usuario', d: 'Owner registró la marca (ve pagos, invita). Miembro colabora sin ver facturación.' }
  };
  const GLOSS_S = {
    'Rama': { k: 'branch git', d: 'Cada mejora se trabaja en su rama; al empujarla se publica un preview.' },
    'Preview': { k: 'vista previa', d: 'Enlace vivo por rama que el cliente revisa en su checkpoint.' },
    'Checkpoint': { k: 'validación', d: 'Punto donde el cliente aprueba o pide ajustes. Nada se funde a main sin su sí.' },
    'Fit': { k: 'ajuste del prospecto', d: 'Qué tanto encaja un prospecto (del F0). Ordena la waitlist junto con el turno.' },
    'Capacidad': { k: 'cupos del equipo', d: 'Carga real que el equipo atiende sin bajar calidad. Decide el siguiente turno.' },
    'Motor': { k: 'skills del portal', d: 'Las skills (metodología DV) que tu Claude usa. Viven en el portal, las hereda el staff.' },
    'Ronda': { k: 'R1, R2…', d: 'Cada iteración sobre un bloque: entregable, feedback y resultado.' },
    'Marca de agua': { k: 'sello temporal', d: 'Protege entregables hasta liquidar; al validar el pago se retira.' }
  };
  const VIEWTERMS_C = { tablero: ['Bloque', 'Capas de servicio', 'Ronda', 'Checkpoint'], bloque: ['Preview', 'Checkpoint', 'Marca de agua', 'Ronda'], bitacora: ['Ronda', 'Bloque'], cuenta: ['Estado de cuenta', 'Marca de agua'], miembros: ['Owner / Miembro'] };
  const VIEWTERMS_S = { cuentas: ['Bloque', 'Preview'], cola: ['Rama', 'Ronda', 'Preview'], bloque: ['Rama', 'Preview', 'Ronda', 'Checkpoint'], bitacora: ['Ronda'], waitlist: ['Fit', 'Capacidad'], skills: ['Motor'], facturacion: ['Marca de agua'], capacidad: ['Capacidad'] };
  const GLOSS_F = {
    'Diagnóstico': { k: 'F0 · gratis', d: 'Tu primer read de marca: 3 hallazgos, fit y arquetipo preliminar. Es tuyo sin costo.' },
    'Fit': { k: 'qué tan bien encajas', d: 'Qué tanto encaja tu marca con el método Don Ventas. Orienta por dónde empezar.' },
    'Arquetipo': { k: 'personalidad de marca', d: 'El carácter que hace que te elijan. Se congela en Fundación y guía todo lo visual.' },
    'Capas de servicio': { k: 'Fundación · Sistema · Activación', d: 'La Ruta Don Ventas: estrategia, identidad y puesta a vender. Se contrata por capa.' },
    'Reserva': { k: 'anticipo', d: 'Apartas tu lugar con un pago seguro; al confirmarse activamos tu cuenta.' }
  };
  const VIEWTERMS_F = { diagnostico: ['Diagnóstico', 'Fit', 'Arquetipo', 'Capas de servicio'], contratar: ['Capas de servicio', 'Reserva', 'Fit'] };
  function renderGloss() {
    const act = S.session().actor;
    const G = act === 'cliente' ? GLOSS_C : act === 'freemium' ? GLOSS_F : GLOSS_S;
    const VT = act === 'cliente' ? VIEWTERMS_C : act === 'freemium' ? VIEWTERMS_F : VIEWTERMS_S;
    const keys = VT[route] || Object.keys(G);
    U.el('glossHead').textContent = 'En esta vista';
    U.el('glossBody').innerHTML = keys.filter(t => G[t]).map(t => '<div class="gterm"><div class="k">' + G[t].k + '</div><b>' + t + '</b><p>' + G[t].d + '</p></div>').join('');
  }
  const NOTI_C = [{ t: 'Checkpoint pendiente', d: 'B10 · Landing — revisa y aprueba', go: () => { DVClient.open('pr-sicaru-B10'); } }, { t: 'Saldo por pagar', d: 'Sistema Pro', go: () => go('cuenta') }];
  const NOTI_S = [{ t: 'Solicitud de producción', d: 'Sicarú · B11 — por revisar', go: () => DVStaff.open('pr-sicaru-B11') }, { t: 'Turno en waitlist', d: 'Café Nube listo para activar', go: () => S.isAdmin() && go('waitlist') }];
  const NOTI_F = [{ t: 'Tu diagnóstico está listo', d: 'Revísalo y da el siguiente paso', go: () => go('diagnostico') }, { t: 'Aparta tu lugar', d: 'Arranca con Fundación', go: () => go('contratar') }];
  function renderNoti() {
    const act = S.session().actor;
    const list = act === 'cliente' ? NOTI_C : act === 'freemium' ? NOTI_F : NOTI_S;
    window.__noti = list;
    U.el('notiBody').innerHTML = list.map((n, i) => '<div class="noti" onclick="DVPortal.notiGo(' + i + ')" style="cursor:pointer"><b>' + n.t + '</b><p>' + n.d + '</p></div>').join('');
  }
  function notiGo(i) { U.el('notiPop').classList.remove('pin'); if (window.__noti && window.__noti[i]) window.__noti[i].go(); }
  function pin(which) { const p = U.el(which === 'noti' ? 'notiPop' : 'glossPop'); which === 'noti' ? renderNoti() : renderGloss(); p.classList.toggle('pin'); }

  /* ── modales ── */
  function modal(kind) {
    const host = U.el('modalHost');
    if (kind === 'comment') {
      host.innerHTML = mbox('Pedir ajustes', 'Cuéntanos qué cambiar. Queda registrado como el feedback de esta ronda.',
        '<textarea id="commentText" placeholder="Ej. Me gustaba más la composición anterior del hero…"></textarea>',
        '<button class="btn sm" onclick="DVPortal.closeModal()">Cancelar</button><button class="btn solid sm" onclick="DVPortal.doComment()">Enviar ajustes</button>');
    } else if (kind === 'round') {
      host.innerHTML = mbox('Registrar ronda', 'Se agrega a la bitácora (visible para el cliente) y el bloque pasa a "en revisión".',
        '<label>Entregable</label><input id="rDeliv" placeholder="Ej. 2 propuestas de hero + galería"><label>Nota interna (opcional)</label><textarea id="rNote" placeholder="Contexto para el equipo…"></textarea>',
        '<button class="btn sm" onclick="DVPortal.closeModal()">Cancelar</button><button class="btn solid sm" onclick="DVPortal.doRound()">Registrar y enviar a revisión</button>');
    } else if (kind === 'preview') {
      const b = DVClient.curBlockObj(), pv = S.previewOf(b.id), acc = S.account(S.session().accountId);
      const wm = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='140'%3E%3Ctext x='6' y='86' font-family='monospace' font-size='15' fill='%23F0C674' fill-opacity='0.13' transform='rotate(-20 120 70)'%3EBORRADOR %C2%B7 " + encodeURIComponent(acc.name.toUpperCase()) + "%3C/text%3E%3C/svg%3E";
      host.innerHTML = '<div class="modal sec-modal on" onclick="if(event.target===this)DVPortal.closeModal()"><div class="mbox">' +
        '<div class="sec-hd"><span style="color:#7DE0A6">🔒</span> Vista segura · dentro del portal <span class="x2" onclick="DVPortal.closeModal()">Cerrar ✕</span></div>' +
        '<div class="sec-body"><div class="sec-stage"><div class="mono" style="font-size:10px;letter-spacing:.14em;color:var(--fg-faint)">PREVIEW · ' + b.code + ' · ' + U.esc(b.title.toUpperCase()) + '</div>' +
        '<div style="font-size:28px;font-weight:800;letter-spacing:-.02em;margin-top:10px;line-height:1.05">Tu marca<br>es tu <span style="color:var(--accent)">ventaja.</span></div>' +
        '<div class="mono" style="color:var(--fg-soft);font-size:12px;margin-top:10px">rama · ' + U.esc(pv.branch) + '</div></div>' +
        '<div style="position:absolute;inset:0;pointer-events:none;background-image:url(\"' + wm + '\")"></div></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;padding:12px 18px;border-top:1px solid var(--line)"><button class="btn sm" onclick="DVPortal.closeModal();DVClient.comment()">Comentar</button><button class="btn solid sm" onclick="DVPortal.closeModal();DVClient.approve(\'' + b.id + '\')">Aprobar ✓</button></div>' +
        '<div class="sec-ft">Enmarcado solo por el portal (frame-ancestors) · enlace firmado y efímero · marca de agua horneada en el preview. Las fuentes se descargan al liquidar.</div></div></div>';
      return;
    }
    U.qsa('#modalHost .modal').forEach(m => m.classList.add('on'));
  }
  function mbox(title, desc, body, actions) {
    return '<div class="modal on" onclick="if(event.target===this)DVPortal.closeModal()"><div class="mbox"><h3>' + title + '</h3><p>' + desc + '</p>' + body + '<div class="mrow">' + actions + '</div></div></div>';
  }
  function closeModal() { U.el('modalHost').innerHTML = ''; }
  function doComment() { const t = (U.el('commentText').value || '').trim(); closeModal(); DVClient.sendComment(t); go('bloque'); }
  function doRound() { const d = (U.el('rDeliv').value || '').trim(), n = (U.el('rNote').value || '').trim(); closeModal(); DVStaff.saveRound(d, n); }

  document.addEventListener('click', e => {
    if (!(e.target.closest && e.target.closest('.popwrap'))) U.qsa('.pop').forEach(p => p.classList.remove('pin'));
  });

  return { boot, go, role, logout, renderGloss, renderNoti, notiGo, pin, modal, closeModal, doComment, doRound };
})();

/* arranque */
(function () {
  const LIVE = window.DVSupa && DVSupa.LIVE();
  if (LIVE) {
    // EN VIVO: la sesión se deriva de Supabase Auth (no de localStorage).
    U_boot();
    return;
  }
  // DEMO: sesión desde localStorage sobre datos semilla.
  DVStore.loadSession();
  const s = DVStore.session();
  if (s && DVStore.me()) { DVPortal.boot(); }
  else { DVAuth.render(); }

  async function U_boot() {
    try {
      const uid = await DVSupa.authUid();
      if (uid) {
        await DVSupa.hydrate();
        const u = window.DV_SEED.users.find(x => x.id === uid);
        if (u) { DVStore.loginAs(u); DVPortal.boot(); return; }
        // huérfano (sin app_user / sin cuenta) → vista freemium (D-07)
        let email = '';
        try { email = (await DVSupa.authEmail()) || ''; } catch (e) { }
        DVStore.loginFree({ email: email });
        DVPortal.boot(); return;
      }
    } catch (e) { console.error('[portal] boot en vivo', e); if (window.DVUtil) DVUtil.toast('No se pudo cargar tu portal'); }
    DVAuth.render();
  }
})();
