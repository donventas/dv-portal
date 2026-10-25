-- H1.0 REVIEW CANDIDATE ONLY. Never auto-apply. Historical SQL remains unchanged.
-- Requires schema 01, RLS 02 and RPC 04; owner must inventory actual grants first.
begin;
revoke create on schema public from public, anon, authenticated;
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
language plpgsql set search_path = pg_catalog, public as $$ begin
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
using (auth_dv.can_see_account(auth_dv.account_of_block(block_id)));
-- Old activation and direct block/round writes cannot bypass the command contract.
revoke execute on function public.activate_account(uuid,uuid) from public, anon, authenticated;
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
security definer set search_path = pg_catalog, public as $$
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
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
 u public.app_user; b public.block; a public.account; r public.round;
 f public.portal_feedback; saved public.portal_command_receipt;
 req jsonb; res jsonb; tenant uuid; latest uuid; analyst uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into u from public.app_user where id=auth.uid() for share;
 if u.id is null or u.pending then raise exception 'ACTOR_REVOKED' using errcode='42501'; end if;
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
   select * into a from public.account where id=tenant for share;
   if a.id is null or a.status <> 'activo' then raise exception 'ACCOUNT_UNAVAILABLE'; end if;
   if u.role='cliente' then
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
   -- Existing definer is called only inside this transaction and after waitlist/version gates.
   perform public.activate_account(a.id,analyst);
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
commit;
