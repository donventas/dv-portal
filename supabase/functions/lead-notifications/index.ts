type Lead = {
  id: string;
  nombre: string;
  correo: string;
  negocio: string;
  whatsapp?: string | null;
  reto?: string | null;
  paquete?: string | null;
  origen?: string | null;
};

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Lead | null;
  old_record: Lead | null;
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const WEBHOOK_SECRET = Deno.env.get('LEAD_WEBHOOK_SECRET') || '';
const ALERT_EMAIL = Deno.env.get('LEAD_ALERT_EMAIL') || 'arturo.villagomez@donventas.mx';
const EMAIL_FROM = Deno.env.get('LEAD_EMAIL_FROM') || 'Don Ventas <arturo.villagomez@donventas.mx>';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const esc = (value: unknown) => String(value || '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

async function sendEmail(input: { to: string; subject: string; html: string; key: string }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.key
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [input.to], subject: input.subject, html: input.html })
  });
  if (!response.ok) throw new Error(`RESEND_${response.status}`);
}

async function updateDelivery(id: string, patch: Record<string, unknown>) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/lead?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(patch)
  });
}

function acknowledgement(lead: Lead) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#0b1017;color:#f4f6fa;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:48px 28px"><p style="color:#72a0ff;font-size:12px;letter-spacing:.12em;text-transform:uppercase">Don Ventas · diagnóstico</p><h1 style="font-size:34px;line-height:1.05">Recibimos tus respuestas, ${esc(lead.nombre)}.</h1><p style="color:#c5cad3;font-size:17px;line-height:1.65">Vamos a revisar las oportunidades de <b style="color:#fff">${esc(lead.negocio)}</b> y cómo el contenido o el sistema de marca pueden ayudarle a atraer clientes, no solo atención.</p><div style="margin:30px 0;padding:20px;border:1px solid #293242;border-radius:12px"><b>Siguiente paso</b><p style="color:#c5cad3;line-height:1.6">Si existe encaje, recibirás un diagnóstico en PDF con prioridades, alcance recomendado y una propuesta clara. Tiempo estimado: 3–5 días hábiles.</p></div><p style="color:#8f98a8;font-size:13px">Don Ventas · contenido, marca y sistemas que ayudan a vender.</p></div></body></html>`;
}

function internalAlert(lead: Lead) {
  return `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#111827"><h1>Nuevo diagnóstico: ${esc(lead.negocio)}</h1><p><b>Contacto:</b> ${esc(lead.nombre)} · <a href="mailto:${esc(lead.correo)}">${esc(lead.correo)}</a>${lead.whatsapp ? ` · ${esc(lead.whatsapp)}` : ''}</p><p><b>Ruta y presupuesto recomendado:</b> ${esc(lead.paquete)}</p><p><b>Origen:</b> ${esc(lead.origen)}</p><h2>Contexto</h2><p style="white-space:pre-wrap">${esc(lead.reto)}</p><p><a href="https://app.donventas.mx/">Abrir bandeja de prospectos</a></p></body></html>`;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!RESEND_API_KEY || !WEBHOOK_SECRET) return new Response('Missing server configuration', { status: 500 });
  if (request.headers.get('x-dv-webhook-secret') !== WEBHOOK_SECRET) return new Response('Unauthorized', { status: 401 });

  let payload: WebhookPayload;
  try { payload = await request.json(); }
  catch { return new Response('Invalid JSON', { status: 400 }); }
  const lead = payload.record;
  if (payload.type !== 'INSERT' || payload.schema !== 'public' || payload.table !== 'lead' || !lead?.id || !lead.correo) {
    return new Response('Ignored', { status: 202 });
  }

  try {
    await sendEmail({ to: lead.correo, subject: 'Recibimos tu diagnóstico · Don Ventas', html: acknowledgement(lead), key: `lead-ack/${lead.id}` });
    await updateDelivery(lead.id, { acknowledgement_sent_at: new Date().toISOString(), notification_error: null });
    await sendEmail({ to: ALERT_EMAIL, subject: `Nuevo diagnóstico · ${lead.negocio || lead.nombre}`, html: internalAlert(lead), key: `lead-alert/${lead.id}` });
    await updateDelivery(lead.id, { internal_alert_sent_at: new Date().toISOString(), notification_error: null });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 120) : 'NOTIFICATION_FAILED';
    await updateDelivery(lead.id, { notification_error: message });
    return Response.json({ ok: false }, { status: 502 });
  }
});
