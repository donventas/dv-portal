-- BUG-001 · restaura el envío público del diagnóstico sin abrir acceso de lectura.
-- Los grants de 05_lead_pipeline.sql limitan las columnas que anon puede insertar;
-- esta política RLS valida el contenido de la fila antes de aceptar el INSERT.

begin;

alter table public.lead enable row level security;

drop policy if exists lead_anon_insert on public.lead;
create policy lead_anon_insert on public.lead
  for insert to anon
  with check (
    consent is true
    and nullif(btrim(nombre), '') is not null
    and char_length(nombre) <= 160
    and nullif(btrim(negocio), '') is not null
    and char_length(negocio) <= 200
    and nullif(btrim(correo), '') is not null
    and char_length(correo) <= 320
    and correo ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and (whatsapp is null or char_length(whatsapp) <= 80)
    and (submission_key is null or char_length(submission_key) between 8 and 128)
  );

commit;
