-- Don Ventas · adquisición — convierte public.lead en un pipeline operativo.
-- Compatible con los registros históricos y con el INSERT anónimo de la landing.

alter table public.lead
  add column if not exists submission_key text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists status text not null default 'nuevo',
  add column if not exists owner_id uuid references public.app_user(id) on delete set null,
  add column if not exists next_action_at timestamptz,
  add column if not exists notes text not null default '',
  add column if not exists acknowledgement_sent_at timestamptz,
  add column if not exists internal_alert_sent_at timestamptz,
  add column if not exists notification_error text;

-- No inventamos una fecha para registros históricos; el default aplica hacia delante.
alter table public.lead alter column created_at set default now();
alter table public.lead alter column updated_at set default now();

do $$ begin
  alter table public.lead
    add constraint lead_status_check
    check (status in ('nuevo','contactado','calificado','propuesta','ganado','nutrir','perdido'));
exception when duplicate_object then null; end $$;

create unique index if not exists lead_submission_key_unique
  on public.lead(submission_key)
  where submission_key is not null;
create index if not exists lead_created_at_idx on public.lead(created_at desc);
create index if not exists lead_status_idx on public.lead(status, created_at desc);

drop trigger if exists trg_lead_touch on public.lead;
create trigger trg_lead_touch before update on public.lead
  for each row execute function public.touch_updated_at();

alter table public.lead enable row level security;

drop policy if exists lead_admin_read on public.lead;
create policy lead_admin_read on public.lead
  for select to authenticated
  using (auth_dv.is_admin());

drop policy if exists lead_admin_update on public.lead;
create policy lead_admin_update on public.lead
  for update to authenticated
  using (auth_dv.is_admin())
  with check (auth_dv.is_admin());

-- El visitante solo puede enviar los campos comerciales del formulario.
revoke insert on public.lead from anon;
grant insert (nombre, correo, negocio, whatsapp, reto, paquete, consent, origen, submission_key)
  on public.lead to anon;
grant select, update on public.lead to authenticated;

comment on table public.lead is
  'Prospectos de Don Ventas: captura pública; lectura y seguimiento solo para admin.';
