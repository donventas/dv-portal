/* Don Ventas · Portal MVP — Etapa 0
   Datos semilla con la FORMA del schema real (PRD §09). Todo ficticio/demo.
   Al cablear Supabase, este módulo se reemplaza por consultas a las mismas tablas.
   Tablas: account · brand · user · invitation · assignment · package_access
           project · block · round · preview · asset · invoice · skill (staff)   */
window.DV_SEED = (function () {
  const now = Date.parse('2026-07-13T12:00:00');
  const days = d => new Date(now - d * 864e5).toISOString();

  /* ── account (cliente = tenant = marca) ── */
  const accounts = [
    { id: 'acc-sicaru', name: 'Sicarú', segment: 'Joyería artesanal · Oaxaca', status: 'activo', kind: 'cliente', queue_position: null, pkg: 'Sistema · Pro', fit: 'alto', mrr: 30000, created_at: days(96) },
    { id: 'acc-tamanova', name: 'Tamanova', segment: 'Hospitalidad · Mérida', status: 'activo', kind: 'cliente', queue_position: null, pkg: 'Sistema · Growth', fit: 'alto', mrr: 20000, created_at: days(74) },
    { id: 'acc-pafi', name: 'Pafi', segment: 'Viajes · contenido', status: 'activo', kind: 'piloto', queue_position: null, pkg: 'Sistema · Starter', fit: 'medio', mrr: 12000, created_at: days(120) },
    { id: 'acc-quickfinance', name: 'QuickFinance', segment: 'Fintech contable · CDMX', status: 'activo', kind: 'demostracion', queue_position: null, pkg: 'Fundación', fit: 'alto', mrr: 8000, created_at: days(41) },
    // finalizado (proyecto cerrado · sale de los tableros activos, vive en su propio contenedor)
    { id: 'acc-lumbre', name: 'Lumbre', segment: 'Mezcalería · Oaxaca', status: 'finalizado', kind: 'cliente', queue_position: null, pkg: 'Sistema · Growth', fit: 'alto', mrr: 0, created_at: days(210), finished_at: days(24) },
    // waitlist (mismo modelo, status distinto · con resultado de perfilamiento del F0)
    { id: 'acc-cafenube', name: 'Café Nube', segment: 'Cafetería de especialidad', status: 'waitlist', queue_position: 1, pkg: null, fit: 'alto', diag: 'hecho', arquetipo: 'El Creador', perfil: 'Marca joven con producto fuerte y estética descuidada. Compra por experiencia, no por precio.', reco: 'Sistema · Growth — arranca por Instagram + empaque; el mayor salto está en cómo se ve, no en qué vende.', created_at: days(9) },
    { id: 'acc-drsalas', name: 'Dr. Salas', segment: 'Consultorio dental', status: 'waitlist', queue_position: 2, pkg: null, fit: 'medio', diag: 'hecho', arquetipo: 'El Cuidador', perfil: 'Servicio de confianza sin diferenciación clara; compite por cercanía y reputación local.', reco: 'Fundación + Landing de captación — primero el porqué te eligen, luego una web que convierta reseñas en citas.', created_at: days(6) },
    { id: 'acc-lomareal', name: 'Loma Real', segment: 'Inmobiliaria', status: 'waitlist', queue_position: 3, pkg: null, fit: '—', diag: 'pendiente', created_at: days(3) }
  ];

  /* ── user (cliente owner/miembro · staff analista/admin) ── */
  const users = [
    // staff DV (account_id null)
    { id: 'u-arturo', account_id: null, email: 'arturo@donventas.mx', name: 'Arturo Villagómez', role: 'admin', member_role: null },
    { id: 'u-luis', account_id: null, email: 'luis@donventas.mx', name: 'Luis Antonio Rosas', role: 'analista', member_role: null },
    // clientes
    { id: 'u-sicaru-owner', account_id: 'acc-sicaru', email: 'daniela@sicaru.mx', name: 'Daniela Ríos', role: 'cliente', member_role: 'owner' },
    { id: 'u-sicaru-mem', account_id: 'acc-sicaru', email: 'socio@sicaru.mx', name: '(invitación enviada)', role: 'cliente', member_role: 'miembro', pending: true },
    { id: 'u-tama-owner', account_id: 'acc-tamanova', email: 'hola@tamanova.mx', name: 'Renata Cauich', role: 'cliente', member_role: 'owner' },
    { id: 'u-pafi-owner', account_id: 'acc-pafi', email: 'team@pafi.travel', name: 'Emilio Fonseca', role: 'cliente', member_role: 'owner' },
    { id: 'u-qf-owner', account_id: 'acc-quickfinance', email: 'ceo@quickfinance.mx', name: 'Paola Bernal', role: 'cliente', member_role: 'owner' }
  ];

  /* ── assignment (analista ↔ cuenta · el admin asigna) ──
     assigned_at = cuándo entró la cuenta al analista · status: aceptada | pendiente | rechazada.
     Mientras el analista no llega a su base mensual, la cuenta entra 'aceptada' de una;
     al superar la base gana derecho a aceptar/rechazar (status 'pendiente'). */
  const assignments = [
    { id: 'as-1', analyst_id: 'u-luis', account_id: 'acc-sicaru', assigned_by: 'u-arturo', assigned_at: '2026-05-04T10:00:00', status: 'aceptada' },
    { id: 'as-2', analyst_id: 'u-luis', account_id: 'acc-tamanova', assigned_by: 'u-arturo', assigned_at: '2026-06-02T09:30:00', status: 'aceptada' },
    { id: 'as-3', analyst_id: 'u-arturo', account_id: 'acc-pafi', assigned_by: 'u-arturo', assigned_at: '2026-05-10T11:00:00', status: 'aceptada' },
    { id: 'as-4', analyst_id: 'u-arturo', account_id: 'acc-quickfinance', assigned_by: 'u-arturo', assigned_at: '2026-06-15T12:00:00', status: 'aceptada' },
    { id: 'as-5', analyst_id: 'u-luis', account_id: 'acc-lumbre', assigned_by: 'u-arturo', assigned_at: '2026-04-20T10:00:00', status: 'aceptada' }
  ];

  /* ── RRHH / desempeño (base mensual, avisos, reconocimientos, historial, bitácora
        de asignaciones) · registro documentado para bono/vesting o terminación ──
     base: override por persona (el fundador y default usan 3; Luis en 2 para el demo).
     perf: cierre mensual atendidas-vs-base (el mes en curso se calcula en vivo).
     events: avisos (con fecha+motivo) y reconocimientos (con fecha+criterio).
     log: bitácora inmutable de asignaciones (quién, cuándo, acción). */
  const hr = {
    base: { 'u-luis': 2, 'u-arturo': 2 },
    perf: {
      'u-luis':   { '2026-04': { attended: 1, base: 2 }, '2026-05': { attended: 2, base: 2 }, '2026-06': { attended: 3, base: 2 } },
      'u-arturo': { '2026-04': { attended: 2, base: 2 }, '2026-05': { attended: 2, base: 2 }, '2026-06': { attended: 2, base: 2 } }
    },
    events: [
      { id: 'hr-1', user_id: 'u-luis', type: 'recon', date: '2026-05-30', text: 'Cerró Sicarú sin re-trabajo y adelantó el arranque de Tamanova. Bono de desempeño Q2 aprobado.', by: 'u-arturo' },
      { id: 'hr-2', user_id: 'u-luis', type: 'recon', date: '2026-06-30', text: 'Superó su base en junio (3 cuentas atendidas vs base 2). Elegible a vesting acelerado 0.5%.', by: 'u-arturo' },
      { id: 'hr-3', user_id: 'u-arturo', type: 'recon', date: '2026-06-30', text: 'Sostiene 2 cuentas de alto valor (Pafi, QuickFinance) con utilidad operativa positiva.', by: 'u-arturo' }
    ],
    log: [
      { ts: '2026-04-20T10:00:00', account_id: 'acc-lumbre', analyst_id: 'u-luis', action: 'aceptada', by: 'u-arturo', note: 'dentro de base' },
      { ts: '2026-05-04T10:00:00', account_id: 'acc-sicaru', analyst_id: 'u-luis', action: 'aceptada', by: 'u-arturo', note: 'dentro de base' },
      { ts: '2026-05-10T11:00:00', account_id: 'acc-pafi', analyst_id: 'u-arturo', action: 'aceptada', by: 'u-arturo', note: 'fundador · recibe' },
      { ts: '2026-06-02T09:30:00', account_id: 'acc-tamanova', analyst_id: 'u-luis', action: 'aceptada', by: 'u-arturo', note: 'sobre base · aceptada por el analista' },
      { ts: '2026-06-15T12:00:00', account_id: 'acc-quickfinance', analyst_id: 'u-arturo', action: 'aceptada', by: 'u-arturo', note: 'fundador · recibe' }
    ],
    reQueue: []
  };

  /* ── review (encuesta de satisfacción del cliente) ──
     El cliente califica al cerrar el build y periódicamente en Capa 3. rating 1–5,
     feedback en texto y consentimiento para reusar la reseña como testimonio. Con
     consentimiento, la reseña es publicable a la landing 48 h después (ventana de
     arrepentimiento). phase: build | capa3. analyst_id = responsable en ese momento. */
  const reviews = [
    { id: 'rv-lumbre-build', account_id: 'acc-lumbre', phase: 'build', rating: 5, analyst_id: 'u-luis', consent: true, submitted_at: days(24), published: true, published_at: days(22),
      feedback: 'Pasamos de una etiqueta improvisada a una marca que la gente reconoce en el estante. El equipo entendió el mezcal y la historia detrás — hoy vendemos más caro sin pedir permiso.' },
    { id: 'rv-tama-build', account_id: 'acc-tamanova', phase: 'build', rating: 4, analyst_id: 'u-luis', consent: false, submitted_at: days(10), published: false,
      feedback: 'Muy buen sistema de marca; nos encantaría un poco más de velocidad entre rondas.' },
    { id: 'rv-pafi-build', account_id: 'acc-pafi', phase: 'build', rating: 5, analyst_id: 'u-arturo', consent: true, submitted_at: days(5), published: false,
      feedback: 'El equipo entendió Pafi mejor que nosotros mismos. La marca por fin se siente de viaje — y ya hay reservas que lo confirman.' }
  ];

  /* ── package_access (base del RLS: capas y secciones por cuenta) ── */
  const SECT_BASE = ['tablero', 'previews', 'bitacora', 'cuenta'];
  const package_access = [
    { id: 'pa-sicaru', account_id: 'acc-sicaru', package: 'sistema', layers: ['marca'], sections: SECT_BASE.concat(['generadores']) },
    { id: 'pa-tama', account_id: 'acc-tamanova', package: 'sistema', layers: ['marca'], sections: SECT_BASE.concat(['generadores']) },
    { id: 'pa-pafi', account_id: 'acc-pafi', package: 'sistema', layers: ['marca'], sections: SECT_BASE },
    { id: 'pa-qf', account_id: 'acc-quickfinance', package: 'fundacion', layers: ['marca'], sections: SECT_BASE }
  ];

  /* ── brand + project (una marca y un proyecto por cuenta en Etapa 0) ── */
  const brands = accounts.filter(a => a.status === 'activo' || a.status === 'finalizado').map(a => ({ id: 'br-' + a.id.slice(4), account_id: a.id, name: a.name, layer: 'marca', enabled: true }));
  const projects = brands.map(b => ({ id: 'pr-' + b.id.slice(3), brand_id: b.id, title: 'Sistema de marca ' + b.name }));

  /* ── block (entregable) · capa = Fundación/Sistema/Activación ── */
  const CAPAS = [
    { name: 'Fundación', d: 'Estrategia, arquetipo y voz — el porqué te eligen.' },
    { name: 'Sistema', d: 'La identidad: logo, color, tipografía y aplicaciones.' },
    { name: 'Activación', d: 'Web, contenido y generadores que ponen a vender.' }
  ];
  const B = (project_id, code, title, capa, status, progress) => ({ id: project_id + '-' + code, project_id, code, title, capa, status, progress });
  const blocks = [
    // Sicarú — piloto completo
    B('pr-sicaru', 'F1', 'Estrategia y arquetipo', 'Fundación', 'cerrado', 100),
    B('pr-sicaru', 'F2', 'Voz de marca', 'Fundación', 'cerrado', 100),
    B('pr-sicaru', 'B01', 'Logo', 'Sistema', 'cerrado', 100),
    B('pr-sicaru', 'B02', 'Sistema de color', 'Sistema', 'cerrado', 100),
    B('pr-sicaru', 'B03', 'Tipografía', 'Sistema', 'cerrado', 100),
    B('pr-sicaru', 'B04', 'Patterns', 'Sistema', 'en_curso', 55),
    B('pr-sicaru', 'B12', 'Merchandising', 'Sistema', 'pendiente', 0),
    B('pr-sicaru', 'B10', 'Landing', 'Activación', 'en_revision', 80),
    B('pr-sicaru', 'B11', 'Contenido educativo', 'Activación', 'en_curso', 45),
    // Tamanova
    B('pr-tamanova', 'F1', 'Estrategia y arquetipo', 'Fundación', 'cerrado', 100),
    B('pr-tamanova', 'B01', 'Logo', 'Sistema', 'cerrado', 100),
    B('pr-tamanova', 'B04', 'Patterns', 'Sistema', 'en_curso', 40),
    B('pr-tamanova', 'B09', 'Instagram', 'Sistema', 'pendiente', 0),
    // Pafi
    B('pr-pafi', 'F1', 'Estrategia y arquetipo', 'Fundación', 'cerrado', 100),
    B('pr-pafi', 'B01', 'Logo', 'Sistema', 'cerrado', 100),
    B('pr-pafi', 'B05', 'Iconografía', 'Sistema', 'cerrado', 100),
    B('pr-pafi', 'B10', 'Landing', 'Activación', 'en_revision', 85),
    // QuickFinance (solo Fundación)
    B('pr-quickfinance', 'F1', 'Estrategia y arquetipo', 'Fundación', 'en_curso', 60),
    // Lumbre — proyecto finalizado (todo aprobado)
    B('pr-lumbre', 'F1', 'Estrategia y arquetipo', 'Fundación', 'cerrado', 100),
    B('pr-lumbre', 'B01', 'Logo', 'Sistema', 'cerrado', 100),
    B('pr-lumbre', 'B02', 'Sistema de color', 'Sistema', 'cerrado', 100),
    B('pr-lumbre', 'B03', 'Tipografía', 'Sistema', 'cerrado', 100),
    B('pr-lumbre', 'B10', 'Landing', 'Activación', 'cerrado', 100)
  ];

  /* ── avance de bloques GANADO en el mes en curso (puntos de progress) ──
     Base del «valor entregado en el mes» (flujo de producción mensual), a diferencia
     del valor entregado acumulado. En vivo saldría de un log de snapshots de progress. */
  const month_progress = { 'pr-sicaru-B04': 30, 'pr-sicaru-B10': 25, 'pr-sicaru-B11': 20, 'pr-tamanova-B04': 25, 'pr-pafi-B10': 30, 'pr-quickfinance-F1': 40 };
  blocks.forEach(b => { b.dprog = month_progress[b.id] || 0; });

  /* ── round (bitácora · inmutable, solo se agrega) ── */
  const R = (block_id, seq, title, deliverable, feedback, result, ago, author) => ({ id: block_id + '-' + seq, block_id, seq, title, deliverable, feedback, result, created_at: days(ago), author });
  const rounds = [
    R('pr-sicaru-F1', 'R1', 'Estrategia y arquetipo', 'Arquetipo preliminar + 3 hallazgos', 'Aprobado — El Guardián', 'aprobado', 90, 'Luis'),
    R('pr-sicaru-F2', 'R1', 'Voz de marca', 'Tono, léxico y do/don\'t', 'Aprobada', 'aprobado', 84, 'Luis'),
    R('pr-sicaru-B01', 'R1', 'Logo cerrado', 'Ruta B (boceto) · triángulo + chevron', 'Aprobado', 'aprobado', 70, 'Luis'),
    R('pr-sicaru-B02', 'R1', 'Color cerrado', 'Paleta negro-azul', 'Aprobado', 'aprobado', 66, 'Luis'),
    R('pr-sicaru-B03', 'R1', 'Tipografía cerrada', 'Schibsted Grotesk + Space Mono', 'Aprobada', 'aprobado', 62, 'Luis'),
    R('pr-sicaru-B04', 'R1', 'Familia de patrones v1', '3 patrones tileables', '—', 'propuesto', 8, 'Luis'),
    R('pr-sicaru-B10', 'R1', 'Estructura Ruta A', '1 variante · terminal', 'Elegí la Ruta A', 'aprobado', 22, 'Luis'),
    R('pr-sicaru-B10', 'R2', 'Afinamientos + jubilar v2', 'hero, lightbox, niveles', 'Conservar hero original', 'ajustes', 12, 'Luis'),
    R('pr-sicaru-B10', 'R3', 'Preview en revisión', 'rama mejora/B10-hero', '—', 'propuesto', 2, 'Luis'),
    R('pr-sicaru-B11', 'R1', '2 plantillas de carrusel', 'carrusel educativo A/B', 'Base aprobada, faltan ajustes', 'ajustes', 5, 'Luis'),
    R('pr-tamanova-F1', 'R1', 'Estrategia y arquetipo', 'Arquetipo + posicionamiento', 'Aprobado', 'aprobado', 60, 'Luis'),
    R('pr-tamanova-B01', 'R1', 'Logo cerrado', 'marca denominativa + símbolo', 'Aprobado', 'aprobado', 40, 'Luis'),
    R('pr-tamanova-B04', 'R1', 'Familia de patrones v1', 'set inicial', '—', 'propuesto', 4, 'Luis'),
    R('pr-pafi-B10', 'R1', 'Landing en revisión', 'rama mejora/B10-portada', '—', 'propuesto', 3, 'Arturo'),
    R('pr-quickfinance-F1', 'R1', 'Kickoff · arranque de Fundación', 'diagnóstico + research inicial', 'En proceso', 'propuesto', 6, 'Arturo'),
    R('pr-lumbre-F1', 'R1', 'Estrategia y arquetipo', 'Arquetipo + posicionamiento', 'Aprobado — El Forajido', 'aprobado', 190, 'Luis'),
    R('pr-lumbre-B01', 'R1', 'Logo cerrado', 'símbolo + denominativo', 'Aprobado', 'aprobado', 120, 'Luis'),
    R('pr-lumbre-B02', 'R1', 'Color cerrado', 'paleta cálida', 'Base aprobada, ajustamos contraste', 'ajustes', 100, 'Luis'),
    R('pr-lumbre-B02', 'R2', 'Color · contraste afinado', 'paleta v2', 'Aprobada', 'aprobado', 96, 'Luis'),
    R('pr-lumbre-B10', 'R1', 'Landing cerrada', 'sitio completo + exports', 'Aprobada · cierre de proyecto', 'aprobado', 26, 'Luis')
  ];

  /* ── preview (rama / URL de mejora) ── */
  const previews = [
    { id: 'pv-1', block_id: 'pr-sicaru-B10', branch: 'mejora/B10-hero', url: 'b10-hero.sicaru.vercel.app', merged: false },
    { id: 'pv-2', block_id: 'pr-sicaru-B11', branch: 'mejora/B11-carruseles', url: 'b11-carruseles.sicaru.vercel.app', merged: false },
    { id: 'pv-3', block_id: 'pr-sicaru-B04', branch: 'mejora/B04-patterns', url: 'b04-patterns.sicaru.vercel.app', merged: false },
    { id: 'pv-4', block_id: 'pr-pafi-B10', branch: 'mejora/B10-portada', url: 'b10-portada.pafi.vercel.app', merged: false }
  ];

  /* ── asset (entregables · centro de descargas del cliente) ──
     cls = clase de activo (modelo de 3 clases): 'direccion' (siempre incluido) ·
     'produccion' (se libera al liquidar el bloque) · 'generador' (vive con el retainer). */
  const assets = [
    // Sicarú · dirección & documentos (siempre incluidos)
    { id: 'at-s-f1', block_id: 'pr-sicaru-F1', kind: 'documento', cls: 'direccion', name: 'Estrategia y arquetipo · PDF', locked: false },
    { id: 'at-s-f2', block_id: 'pr-sicaru-F2', kind: 'documento', cls: 'direccion', name: 'Guía de voz y tono · PDF', locked: false },
    { id: 'at-s-b03', block_id: 'pr-sicaru-B03', kind: 'documento', cls: 'direccion', name: 'Especímenes tipográficos · PDF', locked: false },
    { id: 'at-2', block_id: 'pr-sicaru-B10', kind: 'snapshot', cls: 'direccion', name: 'Landing · vista previa (pantalla)', locked: false },
    // Sicarú · producción (se desbloquea al liquidar el bloque)
    { id: 'at-3', block_id: 'pr-sicaru-B01', kind: 'export', cls: 'produccion', name: 'Logo · SVG + PNG + curvas', locked: false },
    { id: 'at-s-b02', block_id: 'pr-sicaru-B02', kind: 'export', cls: 'produccion', name: 'Tokens de color · SVG + JSON', locked: false },
    { id: 'at-1', block_id: 'pr-sicaru-B10', kind: 'fuente', cls: 'produccion', name: 'Landing · código fuente y exports', locked: true },
    // Sicarú · generadores (vivos con el retainer)
    { id: 'at-s-gen', block_id: 'pr-sicaru-B11', kind: 'generador', cls: 'generador', name: 'Generador de carruseles · plantilla viva', locked: false },
    // Tamanova
    { id: 'at-t-f1', block_id: 'pr-tamanova-F1', kind: 'documento', cls: 'direccion', name: 'Estrategia y arquetipo · PDF', locked: false },
    { id: 'at-t-b01', block_id: 'pr-tamanova-B01', kind: 'export', cls: 'produccion', name: 'Logo · SVG + PNG + curvas', locked: false },
    // Pafi
    { id: 'at-p-b01', block_id: 'pr-pafi-B01', kind: 'export', cls: 'produccion', name: 'Logo · SVG + PNG + curvas', locked: false },
    { id: 'at-p-b05', block_id: 'pr-pafi-B05', kind: 'export', cls: 'produccion', name: 'Set de iconografía · SVG', locked: false }
  ];

  /* ── invoice (facturación · pago conforme a la capa) ── */
  const I = (account_id, concept, layer, amount, status, ago) => ({ id: account_id + '-' + concept.slice(0, 4) + amount, account_id, concept, layer, amount, status, paid_at: status === 'pagado' ? days(ago) : null });
  const invoices = [
    I('acc-sicaru', 'Anticipo · Sistema Pro', 'sistema', 35000, 'pagado', 88),
    I('acc-sicaru', 'Saldo · Sistema Pro', 'sistema', 35000, 'pendiente', 0),
    I('acc-sicaru', 'Retainer · mes en curso', 'activacion', 12000, 'pendiente', 0),
    I('acc-tamanova', 'Anticipo · Growth', 'sistema', 25000, 'pagado', 70),
    I('acc-tamanova', 'Saldo · Growth', 'sistema', 25000, 'pendiente', 0),
    I('acc-pafi', 'Anticipo · Starter', 'sistema', 14000, 'pagado', 118),
    I('acc-pafi', 'Saldo · Starter', 'sistema', 14000, 'pagado', 30),
    I('acc-quickfinance', 'Apartado · Fundación', 'fundacion', 500, 'pagado', 40),
    I('acc-lumbre', 'Fundación · Growth', 'fundacion', 18000, 'pagado', 190),
    I('acc-lumbre', 'Anticipo · Sistema Growth', 'sistema', 25000, 'pagado', 120),
    I('acc-lumbre', 'Saldo + Activación · cierre', 'activacion', 32000, 'pagado', 26)
  ];

  /* ── skill (motor · staff) ── */
  const skills = [
    { id: 'sk-1', n: 'Motor de Arquetipos', v: '1.18', d: 'Deriva cada decisión de marca del arquetipo del cliente.' },
    { id: 'sk-2', n: 'Brand System Builder', v: '1.17', d: 'Construye el sistema bloque por bloque, con checkpoints.' },
    { id: 'sk-3', n: 'Voz & Copy', v: '1.4', d: 'Aplica el léxico y el tono de la marca.' },
    { id: 'sk-4', n: 'Investigación de mercado', v: '1.2', d: 'Research potenciado con las bases del fundador.' }
  ];

  /* ── claude_usage (consumo de Claude atribuido a cuenta · dato de fundador) ──
     Una fila por llamada a la API (mismo shape que migrations/06_usage.sql).
     Demo: refleja que el costo de IA es una fracción mínima del ingreso (<5%). */
  const cu = (account_id, purpose, model, input_tokens, output_tokens, ago) => ({ id: account_id + '-' + purpose + '-' + ago, account_id, purpose, model, input_tokens, output_tokens, cache_read_tokens: Math.round(input_tokens * 0.4), created_at: days(ago) });
  const claude_usage = [
    cu('acc-sicaru', 'research', 'claude-sonnet-4-5', 1_650_000, 210_000, 92),
    cu('acc-sicaru', 'estudio', 'claude-sonnet-4-5', 1_240_000, 980_000, 66),
    cu('acc-sicaru', 'estudio', 'claude-sonnet-4-5', 640_000, 520_000, 12),
    cu('acc-sicaru', 'propuesta_skill', 'claude-haiku-4-5', 320_000, 90_000, 5),
    cu('acc-tamanova', 'research', 'claude-sonnet-4-5', 980_000, 160_000, 60),
    cu('acc-tamanova', 'estudio', 'claude-sonnet-4-5', 720_000, 560_000, 40),
    cu('acc-tamanova', 'estudio', 'claude-sonnet-4-5', 410_000, 300_000, 4),
    cu('acc-pafi', 'research', 'claude-sonnet-4-5', 720_000, 120_000, 118),
    cu('acc-pafi', 'estudio', 'claude-sonnet-4-5', 480_000, 360_000, 30),
    cu('acc-quickfinance', 'diagnostico', 'claude-haiku-4-5', 240_000, 60_000, 40),
    cu('acc-quickfinance', 'research', 'claude-sonnet-4-5', 520_000, 90_000, 6)
  ];

  /* ── team_cost (Fase 1 · costo laboral) · sueldo mensual + horas contratadas ──
     Editable en vivo por el admin (override en localStorage). Deriva la tarifa
     por hora cargada = sueldo ÷ horas contratadas. Incluye al fundador. */
  const team_cost = [
    { user_id: 'u-arturo', monthly_salary: 60000, contracted_hours: 160 },
    { user_id: 'u-luis', monthly_salary: 35000, contracted_hours: 160 }
  ];

  /* ── work_sessions (Fase 1 · horas ACTIVAS del mes por analista×cuenta) ──     Baseline demo del tiempo con la sesión del cliente abierta (session tracking).
     En vivo se acumula solo; aquí es semilla + lo que el tracker sume en localStorage.
     Sirve de LLAVE DE REPARTO del costo laboral y da la utilización (activo vs contrato). */
  const work_sessions = [
    { account_id: 'acc-sicaru', analyst_id: 'u-luis', active_hours: 42 },
    { account_id: 'acc-tamanova', analyst_id: 'u-luis', active_hours: 28 },
    { account_id: 'acc-pafi', analyst_id: 'u-arturo', active_hours: 12 },
    { account_id: 'acc-quickfinance', analyst_id: 'u-arturo', active_hours: 30 }
  ];

  /* ══════════════════════════════════════════════════════════════════════════
     CAPA 3 · MODELO DE VALOR (Estrategia de valor · Activación & retainer)
     Medidor A = valor de aplicación · Medidor B = impacto · + referidos.
     Todo demo; en vivo saldría de tablas application_log / impact_metric /
     internal_saving / referral (mismo shape). ══════════════════════════════ */

  /* ── catálogo à-la-carte · valor de lista de mercado (PyME MX 2026) ──
     Precio de referencia por entregable suelto (punto medio de la banda del doc
     rector). Es el VALOR DE LISTA con el que se valúa el retainer, editable por
     el admin (override en localStorage). No es necesariamente lo que se cobra. */
  const catalog = [
    { code: 'post', name: 'Post de feed', price: 675, unit: 'pieza' },
    { code: 'carrusel', name: 'Carrusel educativo', price: 1350, unit: 'pieza' },
    { code: 'reel', name: 'Reel / video corto', price: 2100, unit: 'pieza' },
    { code: 'stories', name: 'Set de historias', price: 425, unit: 'set' },
    { code: 'imagen', name: 'Imagen editorial / render', price: 1100, unit: 'imagen' },
    { code: 'mail', name: 'Mail / newsletter', price: 1550, unit: 'envío' },
    { code: 'campana', name: 'Campaña integral', price: 12000, unit: 'campaña' },
    { code: 'generador', name: 'Generador / automatización', price: 9500, unit: 'una vez' },
    { code: 'landing', name: 'Actualización de landing', price: 3250, unit: 'bloque' },
    { code: 'articulo', name: 'Artículo blog / SEO', price: 2100, unit: 'artículo' }
  ];

  /* ── application_log · entregables producidos en el retainer (Capa 3) ──
     qty = producción del MES en curso (tasa mensual). Solo cuentas con Activación.
     El valor de aplicación = Σ qty × precio de lista del catálogo. */
  const application_log = [
    { account_id: 'acc-sicaru', month: '2026-07', items: { post: 12, carrusel: 3, reel: 2, stories: 4, imagen: 5, mail: 2, articulo: 2, landing: 1 } },
    { account_id: 'acc-tamanova', month: '2026-07', items: { post: 8, carrusel: 2, reel: 1, stories: 3, imagen: 3, mail: 1 } },
    { account_id: 'acc-pafi', month: '2026-07', items: { post: 6, imagen: 2, articulo: 1, stories: 2 } }
  ];

  /* ── impact_metric · Medidor B · resultado por objetivo/canal ──
     El analista fija UN objetivo por cliente; cada métrica trae línea base (al
     arrancar el retainer) y valor actual → el delta es el impacto atribuible.
     En vivo se conecta por API/MCP (Meta, GA4, Google Business, TikTok…). */
  const impact = [
    { account_id: 'acc-sicaru', objetivo: 'Conversión', since: '2026-04', metrics: [
      { k: 'Leads / mes', base: 18, now: 47, ch: 'WhatsApp · landing', unit: '' },
      { k: 'Ventas atribuidas', base: 6, now: 19, ch: 'landing · email', unit: '' },
      { k: 'Visitas web / mes', base: 1200, now: 3400, ch: 'web · SEO', unit: '' },
      { k: 'Costo por lead', base: 210, now: 96, ch: 'campañas', unit: '$', lowerBetter: true }
    ] },
    { account_id: 'acc-tamanova', objetivo: 'Reconocimiento', since: '2026-05', metrics: [
      { k: 'Alcance / mes', base: 8200, now: 26400, ch: 'IG · TikTok', unit: '' },
      { k: 'Seguidores', base: 1820, now: 3210, ch: 'IG · FB', unit: '' },
      { k: 'Reseñas Google', base: 12, now: 34, ch: 'Google', unit: '' }
    ] },
    { account_id: 'acc-pafi', objetivo: 'Consideración', since: '2026-03', metrics: [
      { k: 'Engagement', base: 2.1, now: 5.8, ch: 'IG · web', unit: '%' },
      { k: 'Guardados / mes', base: 140, now: 520, ch: 'IG', unit: '' },
      { k: 'Tiempo en sitio', base: 42, now: 96, ch: 'web', unit: 's' }
    ] }
  ];

  /* ── internal_saving · ahorro operativo interno (horas × costo/hora) ──
     Horas/mes que el equipo o el cliente ya NO gasta, validadas por el analista.
     who: 'cliente' o 'equipo' · rate = costo/hora aplicado a esa parte. */
  const savings = [
    { account_id: 'acc-sicaru', items: [
      { act: 'Presentaciones desde plantilla', hours: 6, rate: 350, who: 'cliente' },
      { act: 'Cotizaciones con generador', hours: 5, rate: 350, who: 'cliente' },
      { act: 'Reportes desde el panel', hours: 3, rate: 300, who: 'equipo' }
    ] },
    { account_id: 'acc-tamanova', items: [
      { act: 'Piezas desde el sistema (no desde cero)', hours: 5, rate: 300, who: 'equipo' },
      { act: 'Respuestas con plantillas de venta', hours: 4, rate: 250, who: 'cliente' }
    ] },
    { account_id: 'acc-pafi', items: [
      { act: 'Reportes desde el panel', hours: 2, rate: 300, who: 'equipo' }
    ] }
  ];

  /* ── referral · programa de referidos (D-05 acquisition) ──
     Link personal por referente; comisión SOLO si el referido contrata un plan,
     pagada POST-COBRO (misma disciplina que el bono del equipo).
     status: registrado → contrato → cobrado (comisión exigible) → liquidado.
     plan_value = primer cobro del referido · commission = plan_value × pct. */
  const referrals = [
    { id: 'ref-mariana', referrer: 'Mariana Ochoa', kind: 'Creadora de contenido', code: 'mariana', account_id: 'acc-tamanova', status: 'liquidado', plan_value: 25000, commission_pct: 10, at: days(72) },
    { id: 'ref-kip', referrer: 'Estudio Kip', kind: 'Aliado / agencia', code: 'kip', account_id: 'acc-pafi', status: 'cobrado', plan_value: 14000, commission_pct: 10, at: days(116) },
    { id: 'ref-sicaru', referrer: 'Daniela Ríos (Sicarú)', kind: 'Cliente embajador', code: 'daniela', account_id: null, status: 'registrado', plan_value: 0, commission_pct: 10, at: days(11) },
    { id: 'ref-colegio', referrer: 'Colegio de Diseño MX', kind: 'Red de contactos', code: 'colegiodm', account_id: null, status: 'registrado', plan_value: 0, commission_pct: 12, at: days(4) }
  ];

  return { accounts, users, assignments, hr, reviews, package_access, brands, projects, blocks, rounds, previews, assets, invoices, skills, claude_usage, team_cost, work_sessions, CAPAS, catalog, application_log, impact, savings, referrals };
})();
