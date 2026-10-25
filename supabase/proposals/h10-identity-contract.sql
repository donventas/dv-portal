-- REVIEW CANDIDATE. Apply after h10-command-contract.sql only in an authorized DB.
-- Auth verifies identity; an existing admin with MFA grants business authority.
-- No email dispatch, automatic email adoption, administrator creation or tenant transfer.
begin;
alter table public.app_user add column access_version integer not null default 0;
alter table public.app_user add column access_valid_after timestamptz not null default '-infinity';

create function public.portal_access_version() returns trigger language plpgsql
set search_path=pg_catalog,public,pg_temp as $$ begin
 if row(new.role,new.account_id,new.member_role,new.pending,new.email,new.access_valid_after)
    is distinct from row(old.role,old.account_id,old.member_role,old.pending,old.email,old.access_valid_after) then
  new.access_version := old.access_version + 1;
 else new.access_version := old.access_version;
 end if;
 return new;
end $$;
revoke all on function public.portal_access_version() from public,anon,authenticated;
create trigger portal_access_version before update on public.app_user
for each row execute function public.portal_access_version();

create function auth_dv.portal_verified_identity(uid uuid) returns boolean language sql stable
security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from auth.users u where u.id=uid and u.email_confirmed_at is not null
  and nullif(btrim(u.email),'') is not null and not coalesce(u.is_anonymous,false)
  and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()))
$$;
revoke all on function auth_dv.portal_verified_identity(uuid) from public,anon,authenticated;

-- A refreshed token retains its original Auth session. Restoring access therefore
-- requires a new sign-in, not just a JWT with a recent iat or a refreshed token.
create or replace function auth_dv.portal_actor_active() returns boolean language sql stable
security definer set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.app_user u join auth.sessions s on s.user_id=u.id
  where u.id=auth.uid() and not u.pending and auth_dv.portal_verified_identity(u.id)
   and s.id::text=(auth.jwt()->>'session_id')
   and s.created_at >= u.access_valid_after
   and (s.not_after is null or s.not_after > now()))
$$;
create or replace function auth_dv.me() returns public.app_user language sql stable
security definer set search_path=pg_catalog,public,pg_temp as $$
 select * from public.app_user where id=auth.uid() and auth_dv.portal_actor_active()
$$;
create or replace function auth_dv.role() returns public.user_role language sql stable
security definer set search_path=pg_catalog,public,pg_temp as $$select (auth_dv.me()).role$$;
create or replace function auth_dv.account_id() returns uuid language sql stable
security definer set search_path=pg_catalog,public,pg_temp as $$select (auth_dv.me()).account_id$$;
create or replace function auth_dv.member_role() returns public.member_role language sql stable
security definer set search_path=pg_catalog,public,pg_temp as $$select (auth_dv.me()).member_role$$;
create or replace function auth_dv.account_ids() returns setof uuid language plpgsql stable
security definer set search_path=pg_catalog,public,pg_temp as $$
declare u public.app_user; begin
 u := auth_dv.me();
 if u.id is null then return; end if;
 if u.role='cliente' then return query select u.account_id where u.account_id is not null;
 elsif u.role='admin' then return query select id from public.account;
 else return query select account_id from public.assignment where analyst_id=u.id;
 end if;
end $$;

create table public.portal_identity_audit (
 actor_id uuid not null references public.app_user(id),
 operation_key uuid not null,
 target_id uuid not null references public.app_user(id),
 request jsonb not null,
 previous_authority jsonb not null,
 response jsonb not null,
 created_at timestamptz not null default now(),
 primary key(actor_id,operation_key)
);
alter table public.portal_identity_audit enable row level security;
revoke all on public.portal_identity_audit from public,anon,authenticated;

create function public.portal_identity_command_v1(
 p_key uuid, p_action text, p_target uuid, p_version integer,
 p_account uuid, p_access text, p_reason text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare
 actor public.app_user; target public.app_user; saved public.portal_identity_audit;
 req jsonb; previous jsonb; response jsonb; target_account uuid; target_access text;
begin
 if p_key is null or p_target is null or p_version is null or p_version<0
  or p_action is null or p_action not in ('provision','revoke','restore')
  or p_reason is null or length(btrim(p_reason)) not between 8 and 500 then
  raise exception 'IDENTITY_REQUEST_INVALID' using errcode='22023';
 end if;
 -- All identity mutations share one short lock: consistent order, bounded seats.
 perform pg_advisory_xact_lock(hashtextextended('portal-identity-v1',0));
 select * into actor from public.app_user where id=auth.uid() for share;
 if actor.id is null or actor.role<>'admin' or not auth_dv.portal_actor_active() then
  raise exception 'IDENTITY_ADMIN_REQUIRED' using errcode='42501';
 end if;
 if coalesce(auth.jwt()->>'aal','')<>'aal2' or not exists(
  select 1 from auth.sessions s where s.user_id=actor.id and s.id::text=auth.jwt()->>'session_id'
   and s.aal::text='aal2') then
  raise exception 'IDENTITY_MFA_REQUIRED' using errcode='42501';
 end if;
 select * into target from public.app_user where id=p_target for update;
 if target.id is null or target.id=actor.id or target.role='admin' then
  raise exception 'IDENTITY_TARGET_FORBIDDEN' using errcode='42501';
 end if;
 req := jsonb_build_object('action',p_action,'target',p_target,'version',p_version,
  'account',p_account,'access',p_access,'reason',btrim(p_reason));
 select * into saved from public.portal_identity_audit where actor_id=actor.id and operation_key=p_key;
 if found then
  if saved.request<>req then raise exception 'IDENTITY_KEY_CONFLICT' using errcode='23505'; end if;
  if target.access_version<>(saved.response->>'version')::integer then
   raise exception 'IDENTITY_REPLAY_STALE' using errcode='PT409';
  end if;
  return saved.response;
 end if;
 if target.access_version<>p_version then raise exception 'IDENTITY_VERSION_CONFLICT' using errcode='PT409'; end if;
 if p_action='provision' then
  if not target.pending or target.access_version<>0 or target.role<>'cliente'
    or target.account_id is not null or target.member_role is not null then
   raise exception 'IDENTITY_ALREADY_BOUND' using errcode='42501';
  end if;
  if p_access is null or p_access not in ('owner','miembro','analista')
    or (p_access='analista')<>(p_account is null) then
   raise exception 'IDENTITY_ACCESS_INVALID' using errcode='22023';
  end if;
  target_account:=p_account; target_access:=p_access;
 else
  if p_account is not null or p_access is not null then
   raise exception 'IDENTITY_AUTHORITY_IMMUTABLE' using errcode='22023';
  end if;
  if (p_action='revoke' and target.pending) or (p_action='restore' and not target.pending) then
   raise exception 'IDENTITY_STATE_CONFLICT' using errcode='PT409';
  end if;
  if p_action='restore' and (target.access_version=0 or not exists(
   select 1 from public.portal_identity_audit a where a.target_id=target.id
    and a.request->>'action'='revoke' and (a.response->>'version')::integer=target.access_version)) then
   raise exception 'IDENTITY_RESTORE_REQUIRES_REVOCATION' using errcode='42501';
  end if;
  target_account:=target.account_id;
  target_access:=case when target.role='analista' then 'analista' else target.member_role::text end;
 end if;
 if p_action<>'revoke' then
  if not auth_dv.portal_verified_identity(target.id) then
   raise exception 'IDENTITY_VERIFICATION_REQUIRED' using errcode='42501';
  end if;
  if target_account is not null then
   perform 1 from public.account where id=target_account and status='activo' for update;
   if not found then raise exception 'IDENTITY_ACCOUNT_NOT_ACTIVE' using errcode='42501'; end if;
   -- Only active access consumes a seat. Restore rechecks both limits.
   if (select count(*) from public.app_user where account_id=target_account and not pending)>=5 then
    raise exception 'IDENTITY_SEAT_LIMIT' using errcode='23514';
   end if;
   if target_access='owner' and exists(select 1 from public.app_user
    where account_id=target_account and member_role='owner' and not pending) then
    raise exception 'IDENTITY_OWNER_EXISTS' using errcode='23514';
   end if;
  end if;
 end if;
 previous:=jsonb_build_object('role',target.role,'account',target.account_id,
  'memberRole',target.member_role,'pending',target.pending,'version',target.access_version);
 if p_action='provision' then
  update public.app_user set role=case when target_access='analista' then 'analista'::public.user_role else 'cliente'::public.user_role end,
   account_id=target_account,member_role=case when target_access='analista' then null else target_access::public.member_role end,
   pending=false,access_valid_after=clock_timestamp() where id=target.id returning * into target;
 else
  update public.app_user set pending=(p_action='revoke'),access_valid_after=clock_timestamp()
   where id=target.id returning * into target;
 end if;
 response:=jsonb_build_object('contract','portal-identity-v1','actor',actor.id,'target',target.id,
  'role',target.role,'account',target.account_id,'memberRole',target.member_role,
  'pending',target.pending,'version',target.access_version,'requiresNewSignIn',p_action<>'revoke');
 insert into public.portal_identity_audit(actor_id,operation_key,target_id,request,previous_authority,response)
 values(actor.id,p_key,target.id,req,previous,response);
 return response;
end $$;
revoke all on function public.portal_identity_command_v1(uuid,text,uuid,integer,uuid,text,text) from public,anon;
grant execute on function public.portal_identity_command_v1(uuid,text,uuid,integer,uuid,text,text) to authenticated;
commit;
