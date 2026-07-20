/* Don Ventas · Portal — Autenticación (magic-link demo), registro y diagnóstico F0 */
window.DVAuth = (function () {
  const U = DVUtil, S = DVStore;
  const LIVE = () => window.DVSupa && DVSupa.LIVE();
  const F0Q = (window.DV_CFG && DV_CFG.F0Q) || [
    { q: '¿Tu marca ya vende o apenas arranca?', o: ['Vende y quiere crecer', 'Arranca', 'Reposiciona'] },
    { q: '¿Qué te duele más hoy?', o: ['Me eligen por precio', 'No me recuerdan', 'No sé comunicar valor'] },
    { q: '¿Tienes identidad visual?', o: ['No', 'Improvisada', 'Sí, pero no vende'] }
  ];
  let f0 = {};
  let _lastF0 = null;

  const GLOGO = '<svg viewBox="0 0 48 48" width="18" height="18" style="vertical-align:-4px;margin-right:8px" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  function googleBtn(label) {
    return '<button class="btn full" style="background:#fff;color:#111;border-color:#fff;margin-top:10px" onclick="DVAuth.google()">' + GLOGO + (label || 'Continuar con Google') + '</button>';
  }

  function render() {
    const host = U.el('auth');
    host.innerHTML =
      '<div class="acard">' + U.MARK +
      '<div class="tabs">' +
      '<button id="tabCli" class="on" onclick="DVAuth.tab(\'cli\')">Soy cliente</button>' +
      '<button id="tabNew" onclick="DVAuth.tab(\'new\')">Nueva marca</button>' +
      '<button id="tabTeam" onclick="DVAuth.tab(\'team\')">Equipo</button>' +
      '</div>' +

      // CLIENTE — magic link
      '<div class="pane on" id="paneCli">' +
      '<h1>Entra a tu portal</h1>' +
      '<p class="lead">Tu marca, en vivo. Te enviamos un enlace mágico a tu correo — sin contraseñas.</p>' +
      '<div id="cli1"><label>Correo (corporativo o personal)</label>' +
      '<input id="cliEmail" type="email" placeholder="tu@correo.com" autocomplete="email"' + (LIVE() ? '' : ' value="daniela@sicaru.mx"') + '>' +
      '<button class="btn solid full" onclick="DVAuth.sendLink()">Enviar enlace mágico →</button>' +
      (LIVE() ? '<div class="orsep">o</div>' + googleBtn('Continuar con Google') : '') +
      '<div class="suggest" id="cliSuggest"></div></div>' +
      '<div id="cli2" style="display:none"><label>Revisa tu correo</label>' +
      '<p class="lead" style="margin:0 0 10px">Te enviamos un enlace a <b id="cliEcho"></b>. Ábrelo en este dispositivo para entrar.</p>' +
      '<button class="btn solid full" id="cli2demo" style="margin-top:6px" onclick="DVAuth.enterClient()">Abrir mi portal →</button>' +
      '<div class="note">El enlace expira en 15 min y es de un solo uso.</div></div>' +
      '</div>' +

      // NUEVA MARCA — registro + F0
      '<div class="pane" id="paneNew">' +
      '<h1>Registra tu marca</h1>' +
      '<p class="lead">Haz un <b>diagnóstico F0 gratis</b> (3 preguntas). Entras a la waitlist ordenada por <i>fit</i>; te activamos según capacidad.</p>' +
      '<div id="new1"><label>Nombre del negocio</label><input id="newName" placeholder="Ej. Café Nube">' +
      '<label>Sector</label><input id="newSeg" placeholder="Ej. Cafetería de especialidad">' +
      '<button class="btn solid full" onclick="DVAuth.startF0()">Empezar diagnóstico F0 →</button></div>' +
      '<div id="new2" style="display:none"><div class="f0" id="f0box"></div>' +
      '<button class="btn solid full" id="f0submit" onclick="DVAuth.finishF0()" disabled>Ver mi resultado →</button></div>' +
      '<div id="new3" style="display:none"></div>' +
      '</div>' +

      // EQUIPO
      '<div class="pane" id="paneTeam">' +
      '<h1>Acceso de equipo</h1>' +
      '<p class="lead">Panel interno de Don Ventas. Solo por invitación del admin — el equipo no se auto-registra.</p>' +
      (LIVE()
        ? '<label>Correo del equipo</label><input id="teamEmail" type="email" placeholder="tu@donventas.mx" autocomplete="email">' +
          '<button class="btn solid full" onclick="DVAuth.sendTeamLink()">Enviar enlace mágico →</button>' +
          '<div class="orsep">o</div>' + googleBtn('Continuar con Google') +
          '<div class="note">Tu rol (analista o admin) se resuelve por tu cuenta. El enlace expira en 15 min.</div>'
        : '<button class="btn solid full" style="margin-top:6px" onclick="DVAuth.enterStaff(\'analista\')">Entrar como analista →</button>' +
          '<button class="btn full" onclick="DVAuth.enterStaff(\'admin\')">Entrar como admin →</button>' +
          '<div class="note">Analista: tus cuentas asignadas. Admin: todas + waitlist, equipo, accesos y facturación.</div>') +
      '</div>' +
      '</div>';
    renderSuggest();
  }

  function renderSuggest() {
    if (LIVE()) { U.el('cliSuggest').innerHTML = ''; return; }
    const clients = window.DV_SEED.users.filter(u => u.role === 'cliente' && u.member_role === 'owner');
    U.el('cliSuggest').innerHTML = '<div class="memlimit" style="margin:14px 0 2px">Cuentas demo — entra con un clic:</div>' +
      clients.map(u => '<button class="sg" onclick="DVAuth.quick(\'' + u.email + '\')"><span>' + U.esc(u.name) + ' · ' + U.esc(S.account(u.account_id).name) + '</span><small>' + U.esc(u.email) + '</small></button>').join('');
  }

  function tab(t) {
    ['Cli', 'New', 'Team'].forEach(x => {
      U.el('tab' + x).classList.toggle('on', x.toLowerCase() === t);
      U.el('pane' + x).classList.toggle('on', x.toLowerCase() === t);
    });
  }
  function quick(email) { U.el('cliEmail').value = email; sendLink(); }
  function google() {
    if (!(window.DVSupa && DVSupa.LIVE())) { U.toast('Google solo funciona en modo EN VIVO'); return; }
    DVSupa.signInWithGoogle().catch(err => { console.error(err); U.toast('No se pudo iniciar con Google'); });
  }
  function sendLink() {
    const e = U.el('cliEmail').value.trim() || 'tu correo';
    U.el('cliEcho').textContent = e;
    U.el('cli1').style.display = 'none'; U.el('cli2').style.display = 'block';
    if (LIVE()) {
      const btn = U.el('cli2demo'); if (btn) btn.style.display = 'none';
      DVSupa.signIn(e).then(() => U.toast('Enlace enviado a ' + e)).catch(err => { console.error(err); U.toast('No se pudo enviar el enlace'); });
    }
  }
  function sendTeamLink() {
    const e = (U.el('teamEmail').value || '').trim();
    if (!e) { U.toast('Escribe tu correo'); return; }
    DVSupa.signIn(e).then(() => U.toast('Enlace enviado a ' + e)).catch(err => { console.error(err); U.toast('No se pudo enviar el enlace'); });
  }
  function enterClient() {
    const email = U.el('cliEmail').value.trim();
    const user = S.userByEmail(email) || window.DV_SEED.users.find(u => u.member_role === 'owner');
    S.loginAs(user); boot();
  }
  function enterStaff(role) { S.loginAs(S.userByEmail(role === 'admin' ? 'arturo@donventas.mx' : 'luis@donventas.mx')); boot(); }

  function startF0() {
    const name = U.el('newName').value.trim();
    if (!name) { U.toast('Escribe el nombre del negocio'); return; }
    f0 = {}; U.el('new1').style.display = 'none'; U.el('new2').style.display = 'block';
    U.el('f0box').innerHTML = F0Q.map((it, i) =>
      '<div class="q"><p>' + (i + 1) + ' · ' + it.q + '</p><div class="opts">' +
      it.o.map((o, j) => '<button onclick="DVAuth.pick(' + i + ',' + j + ',this)">' + o + '</button>').join('') + '</div></div>').join('');
  }
  function pick(i, j, btn) {
    f0[i] = j;
    Array.from(btn.parentNode.children).forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    U.el('f0submit').disabled = Object.keys(f0).length < F0Q.length;
  }
  function finishF0() {
    const name = U.el('newName').value.trim();
    const seg = U.el('newSeg').value.trim() || 'Sin sector';
    const D = (window.DV_CFG && DV_CFG.diag) ? DV_CFG.diag(f0) : (function () {
      const score = (f0[0] === 0 ? 2 : 1) + (f0[1] === 2 ? 2 : 1) + (f0[2] === 2 ? 2 : f0[2] === 1 ? 1 : 0);
      return { fit: score >= 5 ? 'alto' : score >= 3 ? 'medio' : 'bajo', findings: ['Tu diferenciador no está explícito — hoy compites por precio.', 'Falta un sistema visual que sostenga la promesa.', 'El arquetipo preliminar da un tono claro para comunicar valor.'], arquetipo: '—' };
    })();
    _lastF0 = { business: name, segment: seg, fit: D.fit, findings: D.findings, arquetipo: D.arquetipo, answers: f0 };
    U.el('new2').style.display = 'none';
    const n3 = U.el('new3'); n3.style.display = 'block';
    n3.innerHTML = '<h1 style="font-size:22px">Listo, ' + U.esc(name) + '</h1>' +
      '<div class="f0res"><b>3 hallazgos preliminares</b>' +
      '<p>' + D.findings.map((h, i) => (i + 1) + ' · ' + U.esc(h)).join('<br>') + '</p>' +
      '<div class="fitline">Fit estimado: ' + U.esc(D.fit) + ' · arquetipo preliminar: ' + U.esc(D.arquetipo) + '</div></div>' +
      '<p class="lead" style="margin:18px 0 0">Tu diagnóstico ya vive en tu portal gratuito. Ábrelo para verlo y, cuando quieras, aparta tu lugar para arrancar.</p>' +
      '<button class="btn solid full" onclick="DVAuth.enterFree()">Entrar a mi portal gratis →</button>' +
      '<button class="btn full" style="margin-top:10px" onclick="DVAuth.render()">← Volver al inicio</button>' +
      '<div class="note">Cuenta gratuita creada. Al apartar tu lugar, un admin activa tu cuenta y verás tu marca avanzar en vivo.</div>';
  }
  function enterFree() {
    S.loginFree(_lastF0 || { business: (U.el('newName') && U.el('newName').value) || '' });
    boot();
  }

  function boot() { window.DVPortal.boot(); }

  return { render, tab, quick, sendLink, sendTeamLink, enterClient, enterStaff, startF0, pick, finishF0, enterFree, google };
})();
