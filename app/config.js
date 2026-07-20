/* Don Ventas · Portal — Configuración de producto (F2)
   Puente entre el F0 público y el gate de pago. Sin llaves aquí no hay backend:
   el CTA usa Payment Links de Stripe (F3 = cobro por API/webhooks).
   Rellena STRIPE_RESERVA_LINK con el Payment Link real del dashboard de Stripe. */
window.DV_CFG = {
  /* Payment Link de Stripe para apartar el lugar / anticipo de arranque.
     Vacío ('') → el CTA avisa que falta configurarlo (no rompe el portal).   */
  STRIPE_RESERVA_LINK: 'https://buy.stripe.com/bJe9ASfHu0gdff58KY8g000',
  /* Contacto directo alterno al pago (WhatsApp / correo). Vacío = se oculta.  */
  CONTACTO_LINK: '',

  /* La Ruta Don Ventas — capas de servicio (rangos reales; cotización a medida).
     El diagnóstico (F0) es el entregable freemium; el resto se contrata.       */
  RUTA: [
    { id: 'f0',        capa: 'F0',      name: 'Diagnóstico',      price: 'Gratis',      free: true, d: 'Análisis de tu marca + 3 hallazgos accionables. Tu punto de partida — sin costo.' },
    { id: 'fundacion', capa: 'Capa 1',  name: 'Fundación',        price: '$12K – $35K', d: 'Estrategia, arquetipo, voz y modelo de negocio: el porqué te eligen a ti.' },
    { id: 'sistema',   capa: 'Capa 2',  name: 'Sistema de marca', price: '$18K – $120K', tag: 'Starter · Growth · Pro', d: 'La identidad completa: logo, color, tipografía y aplicaciones que sostienen la promesa.' },
    { id: 'activacion',capa: 'Capa 3',  name: 'Activación',       price: '$15K – $180K', d: 'Generadores, web/producto funcional y contenido que ponen tu marca a vender.' }
  ],

  /* Capa 3 · defaults CALIBRADOS del modelo de valor (Estrategia de valor · Activación
     & retainer). Fuente única de umbrales/comisiones y del mapa canónico objetivo→métricas.
     Editables por el admin en vivo (override en localStorage); estos son los valores base. */
  CAPA3: {
    umbralDefault: 45000,   // valor COBRADO/mes desde el que corre el bono del analista (post-cobro)
    bonoPct: 8,             // % del excedente sobre el umbral
    comisionPct: 10,        // % de comisión de referido por defecto (post-cobro)
    // mapa canónico objetivo → métricas y canales sugeridos (el analista fija UN objetivo por cliente)
    objetivos: {
      'Conversión':     { metricas: ['Leads / mes', 'Ventas atribuidas', 'Costo por lead'],      canales: ['landing', 'WhatsApp', 'campañas'] },
      'Reconocimiento': { metricas: ['Alcance / mes', 'Seguidores', 'Reseñas Google'],           canales: ['IG', 'TikTok', 'Google'] },
      'Consideración':  { metricas: ['Engagement', 'Guardados / mes', 'Tiempo en sitio'],        canales: ['IG', 'web'] },
      'Recompra':       { metricas: ['Clientes recurrentes', 'Ticket promedio', 'Frecuencia'],   canales: ['email', 'CRM'] }
    }
  },

  /* Diagnóstico F0 — preguntas compartidas por el registro público y el portal. */
  F0Q: [
    { q: '¿Tu marca ya vende o apenas arranca?', o: ['Vende y quiere crecer', 'Apenas arranca', 'Reposiciona'] },
    { q: '¿Qué te duele más hoy?',               o: ['Me eligen por precio', 'No me recuerdan', 'No sé comunicar valor'] },
    { q: '¿Tienes identidad visual?',            o: ['No', 'Improvisada', 'Sí, pero no vende'] }
  ],

  /* Heurística de diagnóstico (preliminar; el análisis a fondo llega en Fundación). */
  diag: function (f0) {
    var etapa = f0[0], dolor = f0[1], ident = f0[2];
    var score = (etapa === 0 ? 2 : 1) + (ident === 2 ? 2 : ident === 1 ? 1 : 0) + (dolor === 2 ? 2 : 1);
    var fit = score >= 5 ? 'alto' : score >= 3 ? 'medio' : 'bajo';
    var H1 = [
      'Compites por precio: tu diferenciador no está explícito, así que el cliente decide por lo más barato.',
      'Tu marca no deja huella: sin un sistema memorable, cada venta arranca de cero.',
      'Tu valor no se comunica: haces buen trabajo, pero el mensaje no lo transmite.'
    ][dolor];
    var H2 = [
      'No tienes identidad visual — la primera impresión hoy juega en tu contra.',
      'Tu identidad es improvisada: inconsistente entre canales, resta confianza.',
      'Tienes identidad, pero no vende: es estética, no estratégica.'
    ][ident];
    var H3 = [
      'Estás listo para escalar: un sistema de marca convierte tu tracción en crecimiento sostenido.',
      'Arrancas con ventaja si defines la estrategia antes que el logo.',
      'Reposicionar exige claridad de arquetipo antes de tocar lo visual.'
    ][etapa];
    var arq = ['Gobernante / Experto', 'Creador / Bufón', 'Sabio'][dolor] || 'Explorador';
    return { fit: fit, score: score, findings: [H1, H2, H3], arquetipo: arq };
  }
};
