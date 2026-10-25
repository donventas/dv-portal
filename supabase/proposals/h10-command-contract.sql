-- H1.0 REVIEW CANDIDATE ONLY. Never auto-apply. Historical SQL remains unchanged.
-- Requires the inspected core schema/RLS. Legacy RPC 04 is optional.
-- Still review-only: hosted backup/restore and final schema reconciliation are required.
begin;
revoke create on schema public from public, anon, authenticated;
-- Revocation applies to helpers as well as table policies, including direct SQL calls.
create or replace function auth_dv.me() returns public.app_user language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$select * from public.app_user where id=auth.uid() and not pending$$;
create or replace function auth_dv.role() returns public.user_role language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$select role from public.app_user where id=auth.uid() and not pending$$;
create or replace function auth_dv.account_id() returns uuid language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$select account_id from public.app_user where id=auth.uid() and not pending$$;
create or replace function auth_dv.member_role() returns public.member_role language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$select member_role from public.app_user where id=auth.uid() and not pending$$;
create or replace function auth_dv.is_admin() returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$select coalesce(auth_dv.role()='admin',false)$$;
create or replace function auth_dv.is_staff() returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$select coalesce(auth_dv.role() in ('admin','analista'),false)$$;
create or replace function auth_dv.is_owner() returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$select coalesce(auth_dv.role()='cliente' and auth_dv.member_role()='owner',false)$$;
create or replace function auth_dv.account_ids() returns setof uuid language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare u public.app_user; begin
 select * into u from public.app_user where id=auth.uid() and not pending;
 if u.id is null then return; end if;
 if u.role='cliente' then return query select u.account_id where u.account_id is not null;
 elsif u.role='admin' then return query select id from public.account;
 else return query select account_id from public.assignment where analyst_id=u.id;
 end if;
end $$;
create or replace function auth_dv.account_of_block(b uuid) returns uuid language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select br.account_id from public.block bl join public.project p on p.id=bl.project_id join public.brand br on br.id=p.brand_id
 where bl.id=b and br.account_id in(select auth_dv.account_ids())
$$;
create or replace function auth_dv.block_is_paid(b uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.block bl join public.project p on p.id=bl.project_id join public.brand br on br.id=p.brand_id
 join public.invoice i on i.account_id=br.account_id where bl.id=b and br.account_id in(select auth_dv.account_ids())
 and i.status='pagado' and i.layer=public.capa_to_layer(bl.capa))
$$;
-- Explicit, supported write surface: commands plus own display name only.
-- RLS does not protect TRUNCATE, and column grants survive table REVOKE.
do $$ declare t text; c record; begin
 foreach t in array array['account','app_user','invitation','assignment','package_access','brand','project','block','round','preview','scope_change','asset','invoice','payment','skill'] loop
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  for c in select column_name from information_schema.columns where table_schema='public' and table_name=t loop
   execute format('revoke all (%I) on public.%I from public,anon,authenticated',c.column_name,t);
  end loop;
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
-- Harden inherited definers too; pg_temp must be explicit LAST, never implicit first.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth_dv' loop
  execute format('alter function %s set search_path = pg_catalog, public, pg_temp',f.signature);
  execute format('revoke all on function %s from public,anon',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
-- Retire a legacy activation entry point only if it exists. Activation below is
-- self-contained; do not create a missing legacy RPC just to satisfy this migration.
do $$ begin
 if to_regprocedure('public.activate_account(uuid,uuid)') is not null then
  execute 'alter function public.activate_account(uuid,uuid) set search_path = pg_catalog, public, pg_temp';
  execute 'revoke all on function public.activate_account(uuid,uuid) from public, anon, authenticated';
 end if;
end $$;
alter function public.handle_new_auth_user() set search_path = pg_catalog, public, pg_temp;
-- Authentication does not grant membership. Legacy email matching must never
-- reactivate a revoked/pending identity or accept an expired invitation.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
 insert into public.app_user(id,email,name,role,account_id,member_role,pending)
 values(new.id,new.email,split_part(new.email,'@',1),'cliente',null,null,true)
 on conflict do nothing;
 return new;
end $$;
revoke all on function public.handle_new_auth_user() from public,anon,authenticated;
alter table public.app_user add constraint portal_display_name
 check(name is not null and length(btrim(name)) between 1 and 120) not valid;
alter function public.capa_to_layer(text) set search_path = pg_catalog, public, pg_temp;
-- Narrow staff reads to assigned accounts. Admin keeps its explicit global scope.
drop policy app_user_staff_read on public.app_user;
create policy app_user_staff_read on public.app_user for select to authenticated
 using(auth_dv.is_admin() or (auth_dv.is_staff() and account_id in(select auth_dv.account_ids())));
drop policy invitation_read on public.invitation;
create policy invitation_read on public.invitation for select to authenticated
 using(auth_dv.is_admin() or (account_id in(select auth_dv.account_ids()) and (auth_dv.is_staff() or auth_dv.is_owner())));
drop policy assignment_read on public.assignment;
create policy assignment_read on public.assignment for select to authenticated
 using(auth_dv.is_admin() or analyst_id=auth.uid());
drop policy invoice_read on public.invoice;
create policy invoice_read on public.invoice for select to authenticated
 using(account_id in(select auth_dv.account_ids()) and (auth_dv.is_staff() or auth_dv.is_owner()));
drop policy payment_read on public.payment;
create policy payment_read on public.payment for select to authenticated
 using(invoice_id in(select id from public.invoice));
-- Existing permissive policies are intersected with the contracted brand layer.
create function auth_dv.portal_can_read_block(bid uuid) returns boolean language sql stable
 security definer set search_path = pg_catalog, public, pg_temp as $$
 select exists(select 1 from public.block b join public.project p on p.id=b.project_id
 join public.brand br on br.id=p.brand_id
 where b.id=bid and br.account_id in(select auth_dv.account_ids()) and
 (auth_dv.is_staff() or (br.enabled and exists(select 1 from public.package_access pa
 where pa.account_id=br.account_id and br.layer=any(pa.layers)))))
$$;
revoke all on function auth_dv.portal_can_read_block(uuid) from public,anon;
grant execute on function auth_dv.portal_can_read_block(uuid) to authenticated;
create policy portal_package on public.block as restrictive for select to authenticated using(auth_dv.portal_can_read_block(id));
create policy portal_package on public.round as restrictive for select to authenticated using(auth_dv.portal_can_read_block(block_id));
create policy portal_package on public.preview as restrictive for select to authenticated using(auth_dv.portal_can_read_block(block_id));
create policy portal_package on public.asset as restrictive for select to authenticated using(auth_dv.portal_can_read_block(block_id));
-- Self-service profile updates have one field. Even staff/admin cannot self-edit authority.
revoke update on public.app_user from public, anon, authenticated;
do $$ declare c record; begin
  for c in select column_name from information_schema.columns where table_schema='public' and table_name='app_user' loop
    execute format('revoke update (%I) on public.app_user from public, anon, authenticated', c.column_name);
  end loop;
end $$;
grant update(name) on public.app_user to authenticated;
drop policy if exists app_user_self_update on public.app_user;
create policy app_user_self_update on public.app_user for update to authenticated
using (id=auth.uid()) with check (id=auth.uid());
create or replace function public.portal_profile_boundary() returns trigger
language plpgsql set search_path = pg_catalog, public, pg_temp as $$ begin
  if current_user in ('anon','authenticated') and
     (to_jsonb(new) - 'name') is distinct from (to_jsonb(old) - 'name') then
    raise exception 'PROFILE_AUTHORITY_IMMUTABLE' using errcode='42501';
  end if;
  return new;
end $$;
create trigger portal_profile_boundary before update on public.app_user
for each row execute function public.portal_profile_boundary();
alter table public.block add column version integer not null default 0;
alter table public.account add column version integer not null default 0;
create or replace function public.portal_bump_version() returns trigger language plpgsql as $$
begin new.version := old.version + 1; return new; end $$;
create trigger portal_block_version before update on public.block for each row execute function public.portal_bump_version();
create trigger portal_account_version before update on public.account for each row execute function public.portal_bump_version();
create table public.portal_command_receipt (
  actor_id uuid not null references public.app_user(id), operation_key uuid not null,
  request jsonb not null, response jsonb not null, created_at timestamptz not null default now(),
  primary key(actor_id, operation_key)
);
create table public.portal_feedback (
  id uuid primary key default gen_random_uuid(), block_id uuid not null references public.block(id),
  revision_id uuid not null references public.round(id), actor_id uuid not null references public.app_user(id),
  feedback text not null check(length(feedback) between 1 and 8000), created_at timestamptz not null default now()
);
create table public.portal_command_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.app_user(id),
  operation_key uuid not null, kind text not null, resource_id uuid not null, tenant_id uuid not null references public.account(id), created_at timestamptz not null default now(),
  unique(actor_id, operation_key)
);
alter table public.portal_command_receipt enable row level security;
alter table public.portal_feedback enable row level security;
alter table public.portal_command_audit enable row level security;
revoke all on public.portal_command_receipt, public.portal_feedback, public.portal_command_audit from public, anon, authenticated;
grant select on public.portal_feedback to authenticated;
create policy portal_feedback_read on public.portal_feedback for select to authenticated
using (auth_dv.portal_can_read_block(block_id));
-- Direct block/round writes cannot bypass the command contract.
revoke insert, update, delete on public.block, public.round, public.account from public, anon, authenticated;
-- Also remove column grants, which survive table-level REVOKE.
do $$ declare c record; begin
  for c in select table_name,column_name from information_schema.columns
    where table_schema='public' and table_name in ('block','round','account') loop
    execute format('revoke insert (%I), update (%I) on public.%I from public, anon, authenticated',c.column_name,c.column_name,c.table_name);
  end loop;
end $$;
-- Revoked/pending actors cannot use a still-valid JWT for existing table reads/writes.
create or replace function auth_dv.portal_actor_active() returns boolean language sql stable
security definer set search_path = pg_catalog, public, pg_temp as $$
 select exists(select 1 from public.app_user where id=auth.uid() and not pending)
$$;
revoke all on function auth_dv.portal_actor_active() from public,anon;
grant execute on function auth_dv.portal_actor_active() to authenticated;
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename in
 ('account','app_user','invitation','assignment','package_access','brand','project','block','round','preview','scope_change','asset','invoice','payment','skill','lead','portal_feedback') loop
  execute format('create policy portal_active_actor on public.%I as restrictive for all to authenticated using (auth_dv.portal_actor_active()) with check (auth_dv.portal_actor_active())',t.tablename);
 end loop;
end $$;
create or replace function public.portal_command_v1(
 p_key uuid, p_kind text, p_resource uuid, p_version integer, p_revision uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
 u public.app_user; b public.block; a public.account; r public.round;
 f public.portal_feedback; saved public.portal_command_receipt;
 req jsonb; res jsonb; tenant uuid; latest uuid; analyst uuid;
 activation_brand uuid; activation_project uuid; activation_block uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into u from public.app_user where id=auth.uid() for share;
 if u.id is null or u.pending or not auth_dv.portal_actor_active() then raise exception 'ACTOR_REVOKED' using errcode='42501'; end if;
 if p_key is null or p_resource is null or p_version is null or p_version < 0
    or p_kind not in ('approve','feedback','round','activate') or p_kind is null
    or p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'COMMAND_INVALID'; end if;
 -- Lock the actor/key across sessions. Reusing the key with another payload fails.
 perform pg_advisory_xact_lock(hashtextextended(u.id::text || p_key::text, 0));
 req := jsonb_build_object('kind',p_kind,'resource',p_resource,'version',p_version,'revision',p_revision,'payload',p_payload);
 if p_kind='activate' then
   if u.role <> 'admin' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   select * into a from public.account where id=p_resource for update;
   if a.id is null then raise exception 'RESOURCE_UNAVAILABLE'; end if;
 else
   select * into b from public.block where id=p_resource for update;
   if b.id is null then raise exception 'RESOURCE_UNAVAILABLE'; end if;
   tenant := auth_dv.account_of_block(b.id);
   if tenant is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   select * into a from public.account where id=tenant for share;
   if a.id is null or a.status <> 'activo' then raise exception 'ACCOUNT_UNAVAILABLE'; end if;
   if u.role='cliente' then
     if not auth_dv.portal_can_read_block(b.id) then raise exception 'PACKAGE_FORBIDDEN' using errcode='42501'; end if;
     if u.account_id is distinct from tenant or u.member_role <> 'owner' or p_kind='round' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   elsif u.role='analista' then
     perform 1 from public.assignment where analyst_id=u.id and account_id=tenant for share;
     if not found or p_kind <> 'round' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   elsif u.role='admin' then
     if p_kind <> 'round' then raise exception 'CLIENT_ACCEPTANCE_REQUIRED' using errcode='42501'; end if;
   else raise exception 'FORBIDDEN' using errcode='42501'; end if;
 end if;
 -- Revalidate present authority before returning even a cached result.
 select * into saved from public.portal_command_receipt where actor_id=u.id and operation_key=p_key;
 if found then
   if saved.request is distinct from req then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
   return saved.response;
 end if;
 if p_kind='activate' then
   if a.version <> p_version or a.status <> 'waitlist' then raise exception 'VERSION_OR_STATE_CONFLICT'; end if;
   if (p_payload - 'analyst_id') <> '{}'::jsonb then raise exception 'PAYLOAD_INVALID'; end if;
   analyst := (p_payload->>'analyst_id')::uuid;
   perform 1 from public.app_user where id=analyst and role in ('analista','admin') and not pending for share;
   if not found then raise exception 'ANALYST_UNAVAILABLE'; end if;
   -- Preserve the existing activation result inside the locked, audited command.
   -- No dependency on a separately callable legacy SECURITY DEFINER function.
   update public.account set status='activo',queue_position=null,pkg='Fundación' where id=a.id;
   insert into public.brand(account_id,name,layer,enabled)
     values(a.id,a.name,'marca',true) returning id into activation_brand;
   insert into public.project(brand_id,title)
     values(activation_brand,'Sistema de marca '||a.name) returning id into activation_project;
   insert into public.block(project_id,code,title,capa,status,progress)
     values(activation_project,'F1','Estrategia y arquetipo','Fundación','en_curso',5)
     returning id into activation_block;
   insert into public.package_access(account_id,package,layers,sections)
     values(a.id,'fundacion',array['marca']::public.brand_layer[],
       array['tablero','previews','bitacora','cuenta']) on conflict(account_id) do nothing;
   insert into public.assignment(analyst_id,account_id,assigned_by)
     values(analyst,a.id,u.id) on conflict(analyst_id,account_id) do nothing;
   insert into public.round(block_id,seq,title,deliverable,feedback,result,author)
     values(activation_block,1,'Kickoff · arranque de Fundación','agenda de arranque','—','propuesto',u.name);
   select * into a from public.account where id=p_resource;
   tenant := a.id;
   res := jsonb_build_object('account',to_jsonb(a),
     'brands',(select coalesce(jsonb_agg(br),'[]') from public.brand br where br.account_id=a.id),
     'projects',(select coalesce(jsonb_agg(p),'[]') from public.project p join public.brand br on br.id=p.brand_id where br.account_id=a.id),
     'blocks',(select coalesce(jsonb_agg(bl),'[]') from public.block bl join public.project p on p.id=bl.project_id join public.brand br on br.id=p.brand_id where br.account_id=a.id),
     'rounds',(select coalesce(jsonb_agg(rr),'[]') from public.round rr join public.block bl on bl.id=rr.block_id join public.project p on p.id=bl.project_id join public.brand br on br.id=p.brand_id where br.account_id=a.id),
     'assignments',(select coalesce(jsonb_agg(ass),'[]') from public.assignment ass where ass.account_id=a.id),
     'package_access',(select coalesce(jsonb_agg(pa),'[]') from public.package_access pa where pa.account_id=a.id));
 else
   select id into latest from public.round where block_id=b.id order by seq desc limit 1;
   if b.version <> p_version or latest is distinct from p_revision or p_revision is null then raise exception 'VERSION_OR_REVISION_CONFLICT'; end if;
   if p_kind in ('approve','feedback') and b.status <> 'en_revision' then raise exception 'STATE_CONFLICT'; end if;
   if p_kind='approve' then
     if p_payload <> '{}'::jsonb then raise exception 'PAYLOAD_INVALID'; end if;
     update public.block set status='cerrado',progress=100 where id=b.id returning * into b;
   elsif p_kind='feedback' then
     if (p_payload - array['title','deliverable','feedback']) <> '{}'::jsonb then raise exception 'PAYLOAD_INVALID'; end if;
     insert into public.portal_feedback(block_id,revision_id,actor_id,feedback)
       values(b.id,p_revision,u.id,p_payload->>'feedback') returning * into f;
     update public.block set status='en_curso' where id=b.id returning * into b;
   else
     if b.status not in ('en_curso','en_revision') or (p_payload - array['title','deliverable','feedback']) <> '{}'::jsonb
        or coalesce(length(p_payload->>'title'),0) not between 1 and 500 then raise exception 'PAYLOAD_OR_STATE_INVALID'; end if;
     insert into public.round(block_id,seq,title,deliverable,feedback,result,author)
       select b.id,coalesce(max(seq),0)+1,p_payload->>'title',p_payload->>'deliverable',p_payload->>'feedback','propuesto',u.name
       from public.round where block_id=b.id returning * into r;
     update public.block set status='en_revision' where id=b.id returning * into b;
   end if;
   res := jsonb_build_object('block',to_jsonb(b),'round',case when r.id is not null then to_jsonb(r) else null end,
     'feedback',case when f.id is not null then to_jsonb(f) else null end);
 end if;
 res := res || jsonb_build_object('contract','portal-command-v1','actor',u.id,'resource',p_resource);
 insert into public.portal_command_receipt(actor_id,operation_key,request,response) values(u.id,p_key,req,res);
 insert into public.portal_command_audit(actor_id,operation_key,kind,resource_id,tenant_id) values(u.id,p_key,p_kind,p_resource,tenant);
 -- No external side effects in v1. No email/payment dispatcher or outbox consumer.
 return res;
end $$;
revoke all on function public.portal_command_v1(uuid,text,uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.portal_command_v1(uuid,text,uuid,integer,uuid,jsonb) to authenticated;
-- The hosted inventory lacks USAGE. Admit only the role whose helper/table
-- privileges have just been restricted, atomically with the rest of this change.
revoke all on schema auth_dv from public,anon,authenticated;
grant usage on schema auth_dv to authenticated;
commit;
