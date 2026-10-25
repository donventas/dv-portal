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
    try { const v = S.getPreference('view-' + S.session().actor); if (v && hasRoute(v)) go(v); } catch (e) { }
  }
  function hasRoute(v) { return (v==='hybrid' && DVEnv.isDemo() && window.DVHybridDemo) || mod().nav().some(n => n.route === v); }

  function buildShell() {
    const s = S.session(), m = mod();
    const me = S.me() || {};
    const roleSeg = (!DVEnv.isDemo() || s.actor === 'freemium') ? ''
      : s.actor === 'cliente'
      ? '<span class="roleseg"><button id="rgA" class="' + (S.isOwner() ? 'on' : '') + '" onclick="DVPortal.role(\'owner\')">Owner</button><button id="rgB" class="' + (S.isOwner() ? '' : 'on') + '" onclick="DVPortal.role(\'miembro\')">Miembro</button></span>'
      : '<span class="roleseg"><button id="rgA" class="' + (S.isAdmin() ? '' : 'on') + '" onclick="DVPortal.role(\'analista\')">Analista</button><button id="rgB" class="' + (S.isAdmin() ? 'on' : '') + '" onclick="DVPortal.role(\'admin\')">Admin</button></span>';
    U.el('topBar').innerHTML =
      '<button id="mobileNavToggle" class="mobile-nav-toggle" aria-controls="side" aria-expanded="false">Menú</button>' + U.WORDMARK +
      '<span class="ctx">' + m.ctxLabel() + '</span>' +
      '<span class="who">' + roleSeg +
      '<div class="popwrap" onmouseenter="DVPortal.renderNoti()"><button class="iconbtn" onclick="DVPortal.pin(\'noti\')" aria-label="Notificaciones">' + U.icon('message') + '<span class="ndot"></span></button>' +
      '<div class="pop" id="notiPop"><div class="ph">Notificaciones</div><div id="notiBody"></div></div></div>' +
      '<div class="popwrap" onmouseenter="DVPortal.renderGloss()"><button class="iconbtn" onclick="DVPortal.pin(\'gloss\')" aria-label="Glosario">?</button>' +
      '<div class="pop" id="glossPop"><div class="ph">Glosario</div><div class="ghead" id="glossHead"></div><div id="glossBody"></div></div></div>' +
      '<span class="pill" id="rolePill"></span><span class="av">' + U.esc(me.name ? me.name[0] : '·') + '</span>' +
      '<button class="iconbtn" title="Salir" onclick="DVPortal.logout()" aria-label="Salir">⎋</button></span>';
    U.el('rolePill').textContent = s.actor === 'freemium' ? 'Cuenta gratis' : s.actor === 'cliente' ? (S.isOwner() ? 'Owner' : 'Miembro') : (S.isAdmin() ? 'Admin' : 'Analista');
    buildNav();
    U.el('app').classList.remove('nav-open');
    U.el('mobileNavToggle').onclick = () => {
      const open = U.el('app').classList.toggle('nav-open');
      U.el('mobileNavToggle').setAttribute('aria-expanded', String(open));
    };
    U.el('app').onkeydown = e => { if(e.key==='Escape' && U.el('app').classList.contains('nav-open')) { U.el('app').classList.remove('nav-open');U.el('mobileNavToggle').setAttribute('aria-expanded','false');U.el('mobileNavToggle').focus(); } };
  }

  function buildNav() {
    const icons = { tablero:'layers', impacto:'target', bitacora:'article', archivos:'order', cuenta:'coins', miembros:'users', cuentas:'layers', cola:'order', skills:'zap', mejoras:'bulb', waitlist:'calendar', capacidad:'chart', desempeno:'trending', resenas:'message', equipo:'users', accesos:'shield', facturacion:'coins', utilidad:'chart', valor:'target', prospectos:'search', aplicacion:'website', referidos:'users', diagnostico:'diagnosis' };
    U.el('side').innerHTML = (DVEnv.isDemo() && window.DVHybridDemo ? '<button class="nav" data-nav="hybrid" onclick="DVPortal.go(\'hybrid\')">' + U.icon('compass') + 'Recorrido de marca · DEMO</button>' : '') + mod().nav().map(n => {
      if (n.group) return '<div class="lbl">' + n.group + '</div>';
      if (n.static) return '<div class="nav locked"' + (n.title ? ' title="' + U.esc(n.title) + '"' : '') + '>' + U.icon(n.locked ? 'shield' : 'tag') + ' ' + n.label + ' ' + (n.badge || '') + '</div>';
      return '<button class="nav" data-nav="' + n.route + '" onclick="DVPortal.go(\'' + n.route + '\')">' + U.icon(icons[n.route] || 'layers') + ' ' + n.label + ' ' + (n.badge || '') + '</button>';
    }).join('');
    markNav();
  }
  function markNav() { U.qsa('#side .nav[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === route)); }

  function go(v) {
    const menuWasOpen=U.el('app').classList.contains('nav-open');
    U.el('app').classList.remove('nav-open');
    U.el('mobileNavToggle')?.setAttribute('aria-expanded','false');
    route = v;
    if(v==='hybrid' && DVEnv.isDemo() && window.DVHybridDemo) DVHybridDemo.render(U.el('viewHost'));
    else mod().render(v, U.el('viewHost'));
    applyCapabilities();
    markNav();
    const main = U.el('main'); if (main) main.scrollTop = 0;
    if(menuWasOpen){U.el('viewHost').tabIndex=-1;U.el('viewHost').focus({preventScroll:true});}
    try { if (v !== 'bloque') DVWriteGuard.run('ui.preference', 'ui-state', {}, () => S.savePreference('view-' + S.session().actor, v)); } catch (e) { }
  }

  function applyCapabilities() {
    if (DVEnv.isDemo()) return;
    document.querySelectorAll('[onclick],[onchange],[oninput]').forEach(el => {
      const handlers = ['onclick','onchange','oninput'].map(a => el.getAttribute(a) || '').join(' ');
      const matches = handlers.matchAll(/(DVClient|DVStaff|DVFree|DVAuth)\.(\w+)\(/g);
      for (const match of matches) {
        const target = window[match[1]];
        if (target && target.demoOnly && target.demoOnly.includes(match[2])) {
          el.disabled = true; el.setAttribute('aria-disabled','true'); el.title = 'Disponible solo en DEMO';
        }
      }
    });
  }
  function role(r) {
    S.setRole(r);
    buildShell();
    if (!hasRoute(route)) route = defaultRoute();
    go(route);
  }
  async function logout() {
    const signingOut = window.DVSupa && DVSupa.BACKEND() ? DVSupa.signOut() : null;
    S.logout();
    ['side','topBar','viewHost','modalHost'].forEach(id => { U.el(id).innerHTML = ''; });
    U.el('app').classList.remove('on'); U.el('auth').style.display = 'grid'; DVAuth.render();
    U.el('auth').inert = !!signingOut;
    if (signingOut) { try { await signingOut; } catch (_) { U.toast('No se pudo confirmar el cierre remoto'); } finally { U.el('auth').inert = false; } }
  }

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
    const list = !DVEnv.isDemo() ? [] : act === 'cliente' ? NOTI_C : act === 'freemium' ? NOTI_F : NOTI_S;
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
  async function doComment() { const t = (U.el('commentText').value || '').trim(); if (await DVClient.sendComment(t)) { closeModal(); go('bloque'); } }
  async function doRound() { const d = (U.el('rDeliv').value || '').trim(), n = (U.el('rNote').value || '').trim(); if (await DVStaff.saveRound(d, n)) closeModal(); }

  document.addEventListener('click', e => {
    if (!(e.target.closest && e.target.closest('.popwrap'))) U.qsa('.pop').forEach(p => p.classList.remove('pin'));
  });

  return { applyCapabilities, boot, go, role, logout, renderGloss, renderNoti, notiGo, pin, modal, closeModal, doComment, doRound };
})();

/* arranque */
(function () {
  const BACKEND = window.DVSupa && DVSupa.BACKEND();
  if (BACKEND) {
    // EN VIVO: la sesión se deriva de Supabase Auth (no de localStorage).
    U_boot();
    return;
  }
  if (!window.DVEnv || !DVEnv.isDemo()) {
    U.el('auth').innerHTML = '<div class="acard"><h1>Portal bloqueado</h1><p class="lead">No pudimos verificar el ambiente del Portal.</p></div>';
    return;
  }
  // DEMO: sesión desde storage aislado sobre datos semilla.
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
        if (u && !u.pending) { DVStore.loginAs(u); DVPortal.boot(); return; }
        DVStore.logout();
        DVAuth.render();
        DVUtil.toast('No hay un perfil operativo autorizado para esta sesión');
        return;
      }
    } catch (e) { console.error('[portal] BACKEND_BOOT_FAILED'); if (window.DVUtil) DVUtil.toast('No se pudo cargar tu portal'); }
    DVAuth.render();
  }
})();
