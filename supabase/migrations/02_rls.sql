-- ═══════════════════════════════════════════════════════════════════════════
-- Don Ventas · Portal MVP — F1 · RLS + Auth (Supabase / Postgres)
-- ═══════════════════════════════════════════════════════════════════════════
-- Traducción DIRECTA de portal/app/store.js a políticas de base de datos.
--   store.scopedAccountIds()  →  auth_dv.account_ids()
--   store.isAdmin/isAnalyst/isOwner  →  auth_dv.is_admin/is_staff/is_owner
--   store.validatePayment() (desbloqueo de assets)  →  policy asset_download
--
-- El actor se resuelve por auth.uid() contra app_user (NO por claims del JWT):
-- app_user.id = auth.uid(). Los helpers son SECURITY DEFINER para leer app_user
-- sin disparar su propio RLS (evita recursión).
--
-- Aplicar DESPUÉS de 01_schema.sql.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists auth_dv;

-- ── Actor de sesión (lee app_user por auth.uid()) ─────────────────────────────
create or replace function auth_dv.me()
returns app_user language sql stable security definer set search_path = public as $$
  select * from app_user where id = auth.uid()
$$;

create or replace function auth_dv.role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from app_user where id = auth.uid()
$$;

create or replace function auth_dv.account_id()
returns uuid language sql stable security definer set search_path = public as $$
  select account_id from app_user where id = auth.uid()
$$;

create or replace function auth_dv.member_role()
returns member_role language sql stable security definer set search_path = public as $$
  select member_role from app_user where id = auth.uid()
$$;

create or replace function auth_dv.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from app_user where id = auth.uid()) = 'admin', false)
$$;

create or replace function auth_dv.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from app_user where id = auth.uid()) in ('analista','admin'), false)
$$;

create or replace function auth_dv.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from app_user where id = auth.uid()) = 'cliente'
    and (select member_role from app_user where id = auth.uid()) = 'owner', false)
$$;

-- store.scopedAccountIds(): cliente→su cuenta · admin→todas · analista→asignadas
create or replace function auth_dv.account_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare u app_user;
begin
  select * into u from app_user where id = auth.uid();
  if u.id is null then return; end if;
  if u.role = 'cliente' then
    return query select u.account_id;
  elsif u.role = 'admin' then
    return query select id from account;
  else -- analista: solo cuentas asignadas
    return query select account_id from assignment where analyst_id = u.id;
  end if;
end $$;

-- ¿la cuenta está dentro del alcance del actor?
create or replace function auth_dv.can_see_account(acc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select acc in (select auth_dv.account_ids())
$$;

-- account_id alcanzable desde un block (block→project→brand→account)
create or replace function auth_dv.account_of_block(b uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select br.account_id
  from block bl
  join project p on p.id = bl.project_id
  join brand br on br.id = p.brand_id
  where bl.id = b
$$;

-- ¿hay factura liquidada que cubra la capa del block? (gate de descarga)
create or replace function auth_dv.block_is_paid(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from block bl
    join project p on p.id = bl.project_id
    join brand br on br.id = p.brand_id
    join invoice i on i.account_id = br.account_id
    where bl.id = b
      and i.status = 'pagado'
      and i.layer = capa_to_layer(bl.capa)
  )
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Habilitar RLS en todas las tablas de negocio
-- ═══════════════════════════════════════════════════════════════════════════
alter table account        enable row level security;
alter table app_user       enable row level security;
alter table invitation     enable row level security;
alter table assignment     enable row level security;
alter table package_access enable row level security;
alter table brand          enable row level security;
alter table project        enable row level security;
alter table block          enable row level security;
alter table round          enable row level security;
alter table preview        enable row level security;
alter table scope_change   enable row level security;
alter table asset          enable row level security;
alter table invoice        enable row level security;
alter table payment        enable row level security;
alter table skill          enable row level security;

-- ── account ───────────────────────────────────────────────────────────────────
-- cliente/analista: cuentas de su alcance · admin: todas (incl. waitlist §store.waitlist)
drop policy if exists account_scope on account;
create policy account_scope on account
  for select using ( id in (select auth_dv.account_ids()) );
-- solo admin crea/edita cuentas (activar, waitlist, capacidad)
drop policy if exists account_admin_write on account;
create policy account_admin_write on account
  for all using ( auth_dv.is_admin() ) with check ( auth_dv.is_admin() );

-- ── app_user ───────────────────────────────────────────────────────────────────
-- Sin recursión: comparaciones directas contra auth.uid() y el propio account_id.
-- (auth.uid() no dispara RLS; account_id() es security definer.)
drop policy if exists app_user_self on app_user;
create policy app_user_self on app_user
  for select using ( id = auth.uid() );
-- el cliente ve a los miembros de su misma cuenta
drop policy if exists app_user_same_account on app_user;
create policy app_user_same_account on app_user
  for select using ( account_id is not null and account_id = auth_dv.account_id() );
-- staff ve a todos (para asignar/gestionar)
drop policy if exists app_user_staff_read on app_user;
create policy app_user_staff_read on app_user
  for select using ( auth_dv.is_staff() );
-- cada quien edita su propio perfil; admin edita cualquiera
drop policy if exists app_user_self_update on app_user;
create policy app_user_self_update on app_user
  for update using ( id = auth.uid() or auth_dv.is_admin() )
  with check ( id = auth.uid() or auth_dv.is_admin() );

-- ── invitation ─────────────────────────────────────────────────────────────────
-- lectura: staff, o el owner de la cuenta invitante
drop policy if exists invitation_read on invitation;
create policy invitation_read on invitation
  for select using (
    auth_dv.is_staff()
    or (account_id = auth_dv.account_id() and auth_dv.is_owner())
  );
-- solo el OWNER invita miembros de SU cuenta, hasta el límite (5) — store.invite()
drop policy if exists invitation_owner_insert on invitation;
create policy invitation_owner_insert on invitation
  for insert with check (
    account_id = auth_dv.account_id()
    and auth_dv.is_owner()
    and role = 'miembro'
    and (select count(*) from app_user where account_id = auth_dv.account_id()) < 5
  );
-- solo el ADMIN invita staff (account_id null) — store.inviteStaff()
drop policy if exists invitation_admin_staff on invitation;
create policy invitation_admin_staff on invitation
  for insert with check (
    auth_dv.is_admin() and account_id is null and role in ('analista','admin')
  );

-- ── assignment (solo admin asigna · staff lee) ─────────────────────────────────
drop policy if exists assignment_read on assignment;
create policy assignment_read on assignment
  for select using ( auth_dv.is_staff() );
drop policy if exists assignment_admin_write on assignment;
create policy assignment_admin_write on assignment
  for all using ( auth_dv.is_admin() ) with check ( auth_dv.is_admin() );

-- ── package_access ─────────────────────────────────────────────────────────────
drop policy if exists pa_scope on package_access;
create policy pa_scope on package_access
  for select using ( account_id in (select auth_dv.account_ids()) );
drop policy if exists pa_admin_write on package_access;
create policy pa_admin_write on package_access
  for all using ( auth_dv.is_admin() ) with check ( auth_dv.is_admin() );

-- ── brand · alcance por cuenta + capa habilitada en package_access ─────────────
-- (Eje 2 · Contratación · Matriz A) — el cliente solo ve capas de su paquete.
drop policy if exists brand_scope on brand;
create policy brand_scope on brand
  for select using (
    account_id in (select auth_dv.account_ids())
    and (
      auth_dv.is_staff()
      or layer = any (
        select unnest(layers) from package_access where account_id = brand.account_id
      )
    )
  );
drop policy if exists brand_staff_write on brand;
create policy brand_staff_write on brand
  for all using ( auth_dv.is_staff() and account_id in (select auth_dv.account_ids()) )
  with check ( auth_dv.is_staff() and account_id in (select auth_dv.account_ids()) );

-- ── project · vía brand→account (store.staff_scope) ────────────────────────────
drop policy if exists project_scope on project;
create policy project_scope on project
  for select using (
    brand_id in (select id from brand where account_id in (select auth_dv.account_ids()))
  );
drop policy if exists project_staff_write on project;
create policy project_staff_write on project
  for all using (
    auth_dv.is_staff()
    and brand_id in (select id from brand where account_id in (select auth_dv.account_ids()))
  ) with check (
    auth_dv.is_staff()
    and brand_id in (select id from brand where account_id in (select auth_dv.account_ids()))
  );

-- ── block ────────────────────────────────────────────────────────────────────
-- lectura por alcance de cuenta; escritura (construir/aprobar) solo staff.
drop policy if exists block_scope on block;
create policy block_scope on block
  for select using ( auth_dv.account_of_block(id) in (select auth_dv.account_ids()) );
drop policy if exists block_staff_write on block;
create policy block_staff_write on block
  for all using ( auth_dv.is_staff() and auth_dv.account_of_block(id) in (select auth_dv.account_ids()) )
  with check ( auth_dv.is_staff() and auth_dv.account_of_block(id) in (select auth_dv.account_ids()) );

-- ── round · bitácora: lectura por alcance · SOLO INSERT staff · nunca editar ───
-- (el trigger round_is_append_only ya bloquea update/delete a nivel físico)
drop policy if exists round_scope on round;
create policy round_scope on round
  for select using ( auth_dv.account_of_block(block_id) in (select auth_dv.account_ids()) );
drop policy if exists round_staff_insert on round;
create policy round_staff_insert on round
  for insert with check (
    auth_dv.is_staff() and auth_dv.account_of_block(block_id) in (select auth_dv.account_ids())
  );

-- ── preview ────────────────────────────────────────────────────────────────────
drop policy if exists preview_scope on preview;
create policy preview_scope on preview
  for select using ( auth_dv.account_of_block(block_id) in (select auth_dv.account_ids()) );
drop policy if exists preview_staff_write on preview;
create policy preview_staff_write on preview
  for all using ( auth_dv.is_staff() and auth_dv.account_of_block(block_id) in (select auth_dv.account_ids()) )
  with check ( auth_dv.is_staff() and auth_dv.account_of_block(block_id) in (select auth_dv.account_ids()) );

-- ── scope_change · el cliente solicita en su cuenta; staff cotiza/edita ────────
drop policy if exists scope_scope on scope_change;
create policy scope_scope on scope_change
  for select using (
    project_id in (
      select p.id from project p join brand b on b.id = p.brand_id
      where b.account_id in (select auth_dv.account_ids())
    )
  );
drop policy if exists scope_client_insert on scope_change;
create policy scope_client_insert on scope_change
  for insert with check (
    project_id in (
      select p.id from project p join brand b on b.id = p.brand_id
      where b.account_id = auth_dv.account_id()
    )
  );
drop policy if exists scope_staff_update on scope_change;
create policy scope_staff_update on scope_change
  for update using ( auth_dv.is_staff() ) with check ( auth_dv.is_staff() );

-- ── asset · VER (lista/snapshot) ≠ DESCARGAR (fuente/export si liquidado) ──────
-- Eje 3 · Pago. store.validatePayment() → block_is_paid() abre las fuentes.
drop policy if exists asset_view on asset;
create policy asset_view on asset
  for select using (
    auth_dv.account_of_block(block_id) in (select auth_dv.account_ids())
    and (
      auth_dv.is_staff()                 -- staff ve todo
      or kind = 'snapshot'               -- cliente: vista previa siempre visible
      or not locked                      -- entregable ya liberado
      or auth_dv.block_is_paid(block_id) -- o bloque liquidado
    )
  );
drop policy if exists asset_staff_write on asset;
create policy asset_staff_write on asset
  for all using ( auth_dv.is_staff() and auth_dv.account_of_block(block_id) in (select auth_dv.account_ids()) )
  with check ( auth_dv.is_staff() and auth_dv.account_of_block(block_id) in (select auth_dv.account_ids()) );

-- ── invoice · cliente OWNER ve su cuenta · staff (admin) gestiona ──────────────
drop policy if exists invoice_read on invoice;
create policy invoice_read on invoice
  for select using (
    auth_dv.is_staff()
    or (account_id = auth_dv.account_id() and auth_dv.is_owner())
  );
drop policy if exists invoice_admin_write on invoice;
create policy invoice_admin_write on invoice
  for all using ( auth_dv.is_admin() ) with check ( auth_dv.is_admin() );

-- ── payment · owner lee sus pagos · escritura solo admin/webhook (service_role) ─
drop policy if exists payment_read on payment;
create policy payment_read on payment
  for select using (
    auth_dv.is_staff()
    or invoice_id in (
      select id from invoice where account_id = auth_dv.account_id() and auth_dv.is_owner()
    )
  );
drop policy if exists payment_admin_write on payment;
create policy payment_admin_write on payment
  for all using ( auth_dv.is_admin() ) with check ( auth_dv.is_admin() );

-- ── skill · motor interno: SOLO staff (nunca expuesto al cliente) ──────────────
drop policy if exists skill_staff on skill;
create policy skill_staff on skill
  for all using ( auth_dv.is_staff() ) with check ( auth_dv.is_admin() );

-- ═══════════════════════════════════════════════════════════════════════════
-- Auth: magic-link → vincular auth.users con app_user (F1)
-- ═══════════════════════════════════════════════════════════════════════════
-- Al confirmarse un usuario nuevo por email, se reconcilia con app_user por email:
--   · si ya existe una fila (invitación previa) → se le fija el id = auth.uid()
--     y se marca pending=false;
--   · si aceptó una invitación válida → se crea con su rol;
--   · si no, queda como cliente sin cuenta (el admin lo resolverá).
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv invitation;
begin
  -- 1) app_user preexistente por email (sembrado o invitado) → adoptar el uid
  update app_user set id = new.id, pending = false
    where lower(email) = lower(new.email) and id <> new.id;
  if found then return new; end if;

  if exists (select 1 from app_user where id = new.id) then
    return new;
  end if;

  -- 2) invitación vigente
  select * into inv from invitation
    where lower(email) = lower(new.email) and status = 'enviada' and expires_at > now()
    order by created_at desc limit 1;

  if inv.id is not null then
    insert into app_user (id, account_id, email, name, role, member_role)
    values (
      new.id, inv.account_id, new.email, split_part(new.email,'@',1),
      case when inv.role = 'miembro' then 'cliente'::user_role else inv.role::text::user_role end,
      case when inv.role = 'miembro' then 'miembro'::member_role else null end
    );
    update invitation set status = 'aceptada' where id = inv.id;
    return new;
  end if;

  -- 3) sin invitación: cliente huérfano (el admin lo asocia a una cuenta)
  insert into app_user (id, email, name, role, account_id, member_role)
  values (new.id, new.email, split_part(new.email,'@',1), 'cliente', null, null)
  on conflict (id) do nothing;
  return new;
exception when others then
  return new; -- nunca bloquear el alta de auth por un fallo de reconciliación
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Nota: el "cliente huérfano" (caso 3) queda con account_id y member_role en null
-- (permitido por app_user_shape). No pertenece a ninguna cuenta → account_ids()
-- devuelve vacío y el RLS no le muestra dato alguno hasta que el admin lo asocie.
