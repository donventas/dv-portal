/* Don Ventas · Portal — Vista FREEMIUM (huérfano / sin plan · D-07)
   El usuario autenticado sin cuenta/paquete no ve dato de marca (RLS), pero
   tampoco un portal vacío: aterriza aquí con su diagnóstico gratuito + CTA a
   contratar (Stripe Payment Link). Es el embudo, no un error.                */
window.DVFree = (function () {
  const U = DVUtil, S = DVStore;
  const C = () => window.DV_CFG || {};
  let f0 = {}; // respuestas del diagnóstico inline

  const nav = () => [
    { group: 'Tu cuenta gratuita' },
    { route: 'diagnostico', icon: '◈', label: 'Diagnóstico' },
    { route: 'contratar', icon: '→', label: 'Contratar', badge: '<span class="b">plan</span>' },
    { group: 'Se activa al contratar' },
    { static: true, locked: true, icon: '◇', label: 'Fundación', badge: '<span class="lock">🔒</span>', title: 'Estrategia y arquetipo — Capa 1' },
    { static: true, locked: true, icon: '◇', label: 'Sistema', badge: '<span class="lock">🔒</span>', title: 'Identidad completa — Capa 2' },
    { static: true, locked: true, icon: '◇', label: 'Activación', badge: '<span class="lock">🔒</span>', title: 'Web, generadores y contenido — Capa 3' }
  ];

  function prof() { return S.freeProfile() || {}; }
  function refInfo() {
    const p = prof(); let code = p.ref;
    if (!code) { try { code = new URLSearchParams(location.search).get('r'); } catch (e) { } if (code) { code = code.toLowerCase(); S.updateFreeProfile({ ref: code }); } }
    return code ? S.referralByCode(code) : null;
  }
  function refBanner() {
    const r = refInfo(); if (!r) return '';
    return '<div class="ctabar" style="border-color:rgba(59,116,242,.4);margin-bottom:22px;margin-top:0"><div class="g"><b>Llegaste recomendado por ' + U.esc(r.referrer) + '</b>' +
      '<p>Nos da gusto tenerte. Tu diagnóstico es gratis igual — y si contratas, ' + U.esc(r.referrer.split(' ')[0]) + ' recibe una comisión por la recomendación.</p></div>' +
      '<span class="tag blue">referido</span></div>';
  }
  function ctxLabel() {
    const p = prof();
    return 'Cuenta gratuita' + (p.business ? ' · <b>' + U.esc(p.business) + '</b>' : '') + ' <span class="pkg">· sin plan</span>';
  }

  function render(route, host) {
    if (route === 'contratar') return renderContratar(host);
    return renderDiagnostico(host);
  }

  /* ── Diagnóstico (home freemium) ── */
  function renderDiagnostico(host) {
    const p = prof();
    if (!p.findings) return renderRunner(host);
    const cap = C().RUTA || [];
    const teaser = cap.filter(c => !c.free).map(c =>
      '<div class="lockcard"><div class="lh"><span class="mono cp">' + c.capa + '</span><span class="lock">🔒</span></div>' +
      '<b>' + U.esc(c.name) + '</b><p>' + U.esc(c.d) + '</p><span class="lprice mono">' + U.esc(c.price) + '</span></div>').join('');
    host.innerHTML =
      '<div class="eyebrow">Tu diagnóstico gratuito</div>' +
      '<h2 class="vh">Hola' + (p.business ? ', ' + U.esc(p.business) : '') + '</h2>' +
      '<p class="vsub">Esto es lo que vimos en tu marca. Es un primer read — el análisis a fondo llega en tu arranque de <b>Fundación</b>.</p>' +
      refBanner() +
      '<div class="kpis">' +
      '<div class="kpi"><div class="v">' + p.findings.length + '</div><div class="k">Hallazgos</div></div>' +
      '<div class="kpi"><div class="v" style="text-transform:capitalize">' + U.esc(p.fit || 'medio') + '</div><div class="k">Fit estimado</div></div>' +
      '<div class="kpi"><div class="v" style="font-size:17px;line-height:1.2;font-weight:700">' + U.esc(p.arquetipo || '—') + '</div><div class="k">Arquetipo preliminar</div></div>' +
      '<div class="kpi"><div class="v"><i>$0</i></div><div class="k">Lo que pagaste</div></div>' +
      '</div>' +
      '<div class="panel"><h3>3 hallazgos</h3><div class="findlist">' +
      p.findings.map((h, i) => '<div class="find"><span class="fn mono">' + (i + 1) + '</span><p>' + U.esc(h) + '</p></div>').join('') +
      '</div></div>' +
      '<h3 style="margin:26px 0 12px;font-size:15px">Lo que se activa cuando contratas</h3>' +
      '<div class="lockgrid">' + teaser + '</div>' +
      previewValor() +
      ctaBanner();
  }

  /* ── Preview de valor · ver el alcance antes de decidir (estrategia de venta por preview) ── */
  function previewValor() {
    const p = prof();
    return '<h3 style="margin:26px 0 12px;font-size:15px">Ve tu marca antes de decidir <span class="mono" style="font-size:10px;color:var(--fg-faint);text-transform:none;letter-spacing:0">· sin compromiso</span></h3>' +
      '<div class="panel"><div class="row spread"><div class="g" style="min-width:240px"><b style="font-size:16px">Un preview real de lo que podrías tener</b>' +
      '<p class="d" style="margin-top:6px;max-width:62ch">Muchas veces el valor no se ve hasta que se visualiza. Te preparamos un <b>preview tangible</b> — un mockup o prototipo de tu web, o un <b>extracto de tu ADN de marca</b>. Lo ves, y si te gusta, lo tomas. Si no, tu diagnóstico es tuyo igual.</p>' +
      '<div class="rails" style="margin-top:12px"><span class="rail">Mockup de web</span><span class="rail">Prototipo navegable</span><span class="rail">Extracto de ADN de marca</span></div></div>' +
      '<button class="btn solid" onclick="DVFree.pedirPreview()">Quiero mi preview →</button></div></div>';
  }
  function pedirPreview() {
    const link = C().CONTACTO_LINK;
    if (link) { window.open(link, '_blank', 'noopener'); U.toast('Te contactamos para tu preview de valor'); }
    else U.toast('Listo — te contactamos para preparar tu preview de valor');
  }

  function ctaBanner() {
    return '<div class="ctabar"><div class="g"><b>Tu diagnóstico ya es tuyo. El siguiente paso es construir.</b>' +
      '<p>Aparta tu lugar y arrancamos con Fundación — estrategia y arquetipo que hacen que te elijan a ti.</p></div>' +
      '<button class="btn solid" onclick="DVPortal.go(\'contratar\')">Ver planes →</button></div>';
  }

  /* ── Diagnóstico inline (huérfano sin F0 previo) ── */
  function renderRunner(host) {
    const Q = C().F0Q || [];
    host.innerHTML =
      '<div class="eyebrow">Empieza gratis</div><h2 class="vh">Haz tu diagnóstico</h2>' +
      '<p class="vsub">3 preguntas. Te devolvemos un primer read de tu marca — sin costo y sin compromiso.</p>' +
      '<div class="panel"><label class="flabel">Nombre de tu negocio</label>' +
      '<input id="frBiz" class="frin" placeholder="Ej. Café Nube" value="' + U.esc(prof().business || '') + '">' +
      '<label class="flabel" style="margin-top:16px">¿Tienes un código de referido? <span style="text-transform:none;letter-spacing:0;color:var(--fg-faint)">(opcional)</span></label>' +
      '<input id="frRef" class="frin" placeholder="Ej. mariana" value="' + U.esc(prof().ref || (function () { try { return new URLSearchParams(location.search).get('r') || ''; } catch (e) { return ''; } })()) + '">' +
      '<div class="f0" id="frF0" style="margin-top:8px">' + Q.map((it, i) =>
        '<div class="q"><p>' + (i + 1) + ' · ' + U.esc(it.q) + '</p><div class="opts">' +
        it.o.map((o, j) => '<button onclick="DVFree.pick(' + i + ',' + j + ',this)">' + U.esc(o) + '</button>').join('') + '</div></div>').join('') +
      '</div><button class="btn solid full" id="frSubmit" onclick="DVFree.submit()" disabled>Ver mi diagnóstico →</button></div>';
    f0 = {};
  }
  function pick(i, j, btn) {
    f0[i] = j;
    Array.from(btn.parentNode.children).forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    const done = Object.keys(f0).length >= (C().F0Q || []).length;
    U.el('frSubmit').disabled = !done;
  }
  function submit() {
    const biz = (U.el('frBiz').value || '').trim();
    const ref = (U.el('frRef') && U.el('frRef').value || '').trim().toLowerCase();
    const d = C().diag(f0);
    S.updateFreeProfile({ business: biz, findings: d.findings, fit: d.fit, arquetipo: d.arquetipo, answers: f0, ref: ref || prof().ref || null });
    U.toast('Listo — aquí está tu diagnóstico');
    window.DVPortal.go('diagnostico');
  }

  /* ── Contratar (gate de pago · Payment Link) ── */
  function renderContratar(host) {
    const cap = C().RUTA || [];
    const cards = cap.map(c => {
      const free = c.free;
      return '<div class="plan' + (free ? ' owned' : '') + '">' +
        '<div class="ph"><span class="mono cp">' + c.capa + '</span>' + (free ? '<span class="tag hi">incluido</span>' : (c.tag ? '<span class="tag">' + U.esc(c.tag) + '</span>' : '')) + '</div>' +
        '<b>' + U.esc(c.name) + '</b><div class="pprice">' + U.esc(c.price) + '</div>' +
        '<p>' + U.esc(c.d) + '</p>' +
        (free ? '<div class="powned mono">✓ Ya lo tienes</div>' : '') + '</div>';
    }).join('');
    const contacto = C().CONTACTO_LINK
      ? '<button class="btn" onclick="DVFree.contacto()">Prefiero hablarlo primero →</button>' : '';
    host.innerHTML =
      '<div class="eyebrow">Da el paso</div><h2 class="vh">La Ruta Don Ventas</h2>' +
      '<p class="vsub">Empiezas por Fundación y avanzas capa por capa — cada una se cotiza a tu alcance. Aparta tu lugar con un anticipo y arrancamos.</p>' +
      '<div class="plangrid">' + cards + '</div>' +
      '<div class="ctabar solid"><div class="g"><b>Aparta tu lugar</b>' +
      '<p>Reservas tu arranque de Fundación con un anticipo seguro (Stripe). Al confirmarse, activamos tu cuenta y verás tu marca avanzar en vivo aquí mismo.</p></div>' +
      '<div class="row"><button class="btn solid" onclick="DVFree.reservar()">Reservar mi lugar →</button>' + contacto + '</div></div>' +
      '<p class="hint">Pago seguro con Stripe. El anticipo se abona a tu proyecto. Sin permanencia: si no seguimos, tu diagnóstico es tuyo de todos modos.</p>';
  }

  function reservar() {
    const link = C().STRIPE_RESERVA_LINK;
    if (link) { window.open(link, '_blank', 'noopener'); U.toast('Abriendo pago seguro (Stripe)…'); }
    else U.toast('Falta configurar el Payment Link en app/config.js');
  }
  function contacto() {
    const link = C().CONTACTO_LINK;
    if (link) window.open(link, '_blank', 'noopener');
  }

  return { nav, ctxLabel, render, pick, submit, reservar, contacto, pedirPreview };
})();
