-- ═══════════════════════════════════════════════════════════════════════════
-- Don Ventas · Portal MVP — F1 · Schema (Supabase / Postgres)
-- ═══════════════════════════════════════════════════════════════════════════
-- Traducción a Postgres del Data Schema (PRD §09) y de la forma de data/seed.js.
-- El tenant es la CUENTA (= la marca): toda tabla de negocio lleva account_id
-- directo o alcanzable por join. El RLS (02_rls.sql) vive sobre estas tablas.
--
-- Orden de aplicación:  01_schema.sql → 02_rls.sql → 03_seed.sql
-- Idempotente en lo posible (drop … if exists de tipos y tablas al recrear).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "unaccent";       -- capa_to_layer()

-- ── ENUMS ────────────────────────────────────────────────────────────────────
do $$ begin
  create type account_status  as enum ('prospecto','waitlist','activo','pausado','cerrado');
  create type brand_layer      as enum ('marca','operacion','datos');
  create type user_role        as enum ('cliente','analista','admin');
  create type member_role      as enum ('owner','miembro');
  create type invitation_role  as enum ('miembro','analista','admin');
  create type invitation_status as enum ('enviada','aceptada','expirada');
  create type package_type     as enum ('fundacion','sistema','activacion','ecosistema');
  create type block_status     as enum ('pendiente','en_curso','en_revision','cerrado');
  create type round_result     as enum ('propuesto','aprobado','ajustes','cerrado');
  create type scope_status     as enum ('solicitado','aceptado','rechazado');
  create type asset_kind       as enum ('snapshot','export','fuente');
  create type invoice_status   as enum ('pendiente','pagado','vencido');
  create type fit_level        as enum ('alto','medio','bajo','—');
exception when duplicate_object then null; end $$;

-- ── account · cliente = tenant = marca ────────────────────────────────────────
create table if not exists account (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  segment        text,
  status         account_status not null default 'prospecto',
  queue_position int,                              -- turno en waitlist (null si activo)
  pkg            text,                             -- etiqueta comercial del paquete
  fit            fit_level default 'medio',
  diag           text,                             -- 'hecho' | 'pendiente'
  created_at     timestamptz not null default now()
);

-- ── app_user · usuarios (cliente owner/miembro · staff analista/admin) ────────
-- "user" es palabra reservada → tabla app_user. id = auth.users.id (auth.uid()).
create table if not exists app_user (
  id           uuid primary key,                   -- = auth.uid() (FK lógica a auth.users)
  account_id   uuid references account(id) on delete cascade,  -- null si es staff DV
  email        text not null unique,
  name         text,
  role         user_role not null default 'cliente',
  member_role  member_role,                        -- owner|miembro (solo clientes; null staff)
  pending      boolean not null default false,     -- invitación aún no aceptada
  created_at   timestamptz not null default now(),
  -- staff: sin cuenta ni member_role. cliente: cuenta+member_role juntos,
  -- o ambos null mientras es un "cliente huérfano" recién autenticado sin invitación.
  constraint app_user_shape check (
    (role in ('analista','admin') and account_id is null and member_role is null)
    or (role = 'cliente' and (
          (account_id is not null and member_role is not null)
       or (account_id is null and member_role is null)
    ))
  )
);
create index if not exists idx_app_user_account on app_user(account_id);

-- ── invitation · miembros (owner) y staff (admin) ─────────────────────────────
create table if not exists invitation (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references account(id) on delete cascade,   -- null si admin invita staff
  email       text not null,
  role        invitation_role not null,
  status      invitation_status not null default 'enviada',
  token       text not null default encode(gen_random_bytes(18),'hex'),
  invited_by  uuid references app_user(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days'
);
create index if not exists idx_invitation_account on invitation(account_id);
create index if not exists idx_invitation_email   on invitation(lower(email));

-- ── assignment · analista ↔ cuenta (el admin asigna) ──────────────────────────
create table if not exists assignment (
  id          uuid primary key default gen_random_uuid(),
  analyst_id  uuid not null references app_user(id) on delete cascade,
  account_id  uuid not null references account(id) on delete cascade,
  assigned_by uuid references app_user(id),
  created_at  timestamptz not null default now(),
  unique (analyst_id, account_id)
);
create index if not exists idx_assignment_analyst on assignment(analyst_id);
create index if not exists idx_assignment_account on assignment(account_id);

-- ── package_access · base del RLS (capas y secciones por cuenta) ──────────────
-- Una fila por cuenta; layers[] y sections[] igual que data/seed.js.
-- Add-ons = agregar capas al arreglo layers (matriz §03/§05).
create table if not exists package_access (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references account(id) on delete cascade unique,
  package     package_type not null,
  layers      brand_layer[] not null default array['marca']::brand_layer[],
  sections    text[] not null default array['tablero','previews','bitacora','cuenta'],
  updated_at  timestamptz not null default now()
);

-- ── brand · marcas del ecosistema y su capa ───────────────────────────────────
create table if not exists brand (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references account(id) on delete cascade,
  name        text not null,
  layer       brand_layer not null default 'marca',
  enabled     boolean not null default true
);
create index if not exists idx_brand_account on brand(account_id);

-- ── project · un sistema de marca por brand (Etapa 0) ─────────────────────────
create table if not exists project (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references brand(id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_project_brand on project(brand_id);

-- ── block · entregable · capa = Fundación/Sistema/Activación ───────────────────
create table if not exists block (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  code       text not null,                        -- F1 · B10 · …
  title      text not null,
  capa       text not null,                        -- 'Fundación'|'Sistema'|'Activación'
  status     block_status not null default 'pendiente',
  progress   int not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists idx_block_project on block(project_id);

-- ── round · bitácora · INMUTABLE (solo se agrega) ─────────────────────────────
create table if not exists round (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references block(id) on delete cascade,
  seq         int not null,                         -- R# consecutivo
  title       text not null,
  deliverable text,
  feedback    text,
  result      round_result not null default 'propuesto',
  author      text,
  created_at  timestamptz not null default now(),
  unique (block_id, seq)
);
create index if not exists idx_round_block on round(block_id);

-- ── preview · rama / URL de mejora ────────────────────────────────────────────
create table if not exists preview (
  id       uuid primary key default gen_random_uuid(),
  block_id uuid not null references block(id) on delete cascade,
  branch   text not null,
  url      text,
  merged   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_preview_block on preview(block_id);

-- ── scope_change · cambios de alcance ─────────────────────────────────────────
create table if not exists scope_change (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references project(id) on delete cascade,
  description text not null,
  price_delta numeric(12,2) default 0,
  status      scope_status not null default 'solicitado',
  created_by  uuid references app_user(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_scope_project on scope_change(project_id);

-- ── asset · entregables / snapshots (gate por pago) ───────────────────────────
create table if not exists asset (
  id       uuid primary key default gen_random_uuid(),
  block_id uuid not null references block(id) on delete cascade,
  kind     asset_kind not null,
  name     text not null,
  url      text,
  locked   boolean not null default true,          -- se libera al liquidar (validatePayment)
  created_at timestamptz not null default now()
);
create index if not exists idx_asset_block on asset(block_id);

-- ── invoice · facturación (pago conforme a la capa) ───────────────────────────
create table if not exists invoice (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  concept    text not null,
  layer      package_type not null,                -- fundacion|sistema|activacion
  amount     numeric(12,2) not null,
  status     invoice_status not null default 'pendiente',
  paid_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoice_account on invoice(account_id);

-- ── payment · pagos (Stripe webhook · F3) ─────────────────────────────────────
create table if not exists payment (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoice(id) on delete cascade,
  amount      numeric(12,2) not null,
  provider    text default 'stripe',
  provider_ref text,                                -- payment_intent id
  paid_at     timestamptz not null default now()
);
create index if not exists idx_payment_invoice on payment(invoice_id);

-- ── skill · motor del despacho (solo staff · sin account_id) ──────────────────
create table if not exists skill (
  id  uuid primary key default gen_random_uuid(),
  n   text not null,
  v   text not null,
  d   text
);

-- ── Helpers de dominio ────────────────────────────────────────────────────────
-- capa (display) → layer/paquete (ascii) — para cruzar block.capa con invoice.layer.
create or replace function capa_to_layer(capa text)
returns package_type language sql stable as $$
  select lower(unaccent(capa))::package_type
$$;

-- ── Trigger: rondas inmutables (solo INSERT; sin UPDATE/DELETE) ───────────────
create or replace function round_is_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'round es inmutable: la bitácora solo se agrega (no % )', tg_op;
end $$;
drop trigger if exists trg_round_no_mutate on round;
create trigger trg_round_no_mutate
  before update or delete on round
  for each row execute function round_is_append_only();

-- ── Trigger: mantener updated_at en package_access ────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_pa_touch on package_access;
create trigger trg_pa_touch before update on package_access
  for each row execute function touch_updated_at();
