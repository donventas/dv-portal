-- Isolated review candidate; apply once AFTER h10-identity-contract.sql.
-- No automatic grants, no hosted rollout, no automatic resend after ambiguity.
begin;
create function auth_dv.portal_require_admin_mfa() returns uuid language plpgsql
security definer set search_path=pg_catalog,public,pg_temp as $$ begin
 if not auth_dv.portal_actor_active() or auth_dv.role()<>'admin'
  or coalesce(auth.jwt()->>'aal','')<>'aal2' or not exists(
   select 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id' and aal::text='aal2') then
  raise exception 'ADMIN_MFA_REQUIRED' using errcode='42501';
 end if;
 return auth.uid();
end $$;
revoke all on function auth_dv.portal_require_admin_mfa() from public,anon,authenticated;

create table public.portal_invitation (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.app_user(id),
 operation_key uuid not null, actor_session uuid not null, actor_version integer not null,
 email text not null, reason text not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 state text not null default 'queued' check(state in ('queued','dispatching','sent','uncertain','failed','cancelled')),
 dispatch_nonce uuid, claimed_at timestamptz, completed_at timestamptz,
 target_id uuid references public.app_user(id), cancelled_by uuid references public.app_user(id),
 unique(actor_id,operation_key)
);
create unique index portal_invitation_open_email on public.portal_invitation(email)
 where state in ('queued','dispatching','sent','uncertain');
alter table public.portal_invitation enable row level security;
revoke all on public.portal_invitation from public,anon,authenticated;

create function public.portal_invitation_request_v1(p_key uuid,p_email text,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid; previous public.portal_invitation; v_email text:=lower(btrim(p_email)); begin
 actor:=auth_dv.portal_require_admin_mfa();
 if p_key is null or v_email is null or length(v_email)>254
  or v_email !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@synthetic[.]invalid$'
  or p_reason is null or length(btrim(p_reason)) not between 8 and 500 then
  raise exception 'INVITATION_INVALID' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('portal-invitations-v1',0));
 select * into previous from public.portal_invitation where actor_id=actor and operation_key=p_key;
 if found then
  if previous.email<>v_email or previous.reason<>btrim(p_reason) then raise exception 'INVITATION_KEY_CONFLICT' using errcode='PT409'; end if;
  return jsonb_build_object('id',previous.id,'state',previous.state);
 end if;
 if exists(select 1 from public.portal_invitation i where i.email=v_email and state in ('queued','dispatching','sent','uncertain')) then
  raise exception 'INVITATION_ALREADY_EXISTS' using errcode='PT409'; end if;
 if (select count(*) from public.portal_invitation where actor_id=actor and created_at>now()-interval '1 hour')>=20 then
  raise exception 'INVITATION_RATE_LIMIT' using errcode='PT429'; end if;
 insert into public.portal_invitation(actor_id,operation_key,actor_session,actor_version,email,reason)
 values(actor,p_key,(auth.jwt()->>'session_id')::uuid,(select access_version from public.app_user where id=actor),v_email,btrim(p_reason)) returning * into previous;
 return jsonb_build_object('id',previous.id,'state',previous.state);
end $$;

-- Trusted dispatcher only. Every claim revalidates the original approval.
create function public.portal_invitation_claim_v1(p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare item public.portal_invitation; begin
 select * into item from public.portal_invitation where id=p_id for update;
 if not found then raise exception 'INVITATION_NOT_FOUND' using errcode='22023'; end if;
 if item.state='dispatching' and item.claimed_at<now()-interval '1 minute' then
  update public.portal_invitation set state='uncertain' where id=p_id returning * into item;
 end if;
 if item.state<>'queued' then return jsonb_build_object('id',item.id,'state',item.state); end if;
 if item.expires_at<=now() or not exists(select 1 from public.app_user u join auth.sessions s on s.user_id=u.id
  where u.id=item.actor_id and u.role='admin' and not u.pending and u.access_version=item.actor_version
   and auth_dv.portal_verified_identity(u.id) and s.id=item.actor_session and s.aal::text='aal2'
   and s.created_at>=u.access_valid_after and (s.not_after is null or s.not_after>now())) then
  update public.portal_invitation set state='failed',completed_at=now() where id=p_id;
  return jsonb_build_object('id',item.id,'state','failed');
 end if;
 update public.portal_invitation set state='dispatching',dispatch_nonce=gen_random_uuid(),claimed_at=now() where id=p_id returning * into item;
 return jsonb_build_object('id',item.id,'state',item.state,'nonce',item.dispatch_nonce,'email',item.email);
end $$;

create function public.portal_invitation_complete_v1(p_id uuid,p_nonce uuid,p_state text,p_target uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare item public.portal_invitation; begin
 select * into item from public.portal_invitation where id=p_id for update;
 if not found or p_nonce is null or item.dispatch_nonce is distinct from p_nonce
  or p_state is null or p_state not in ('sent','uncertain','failed')
  or (p_state='sent')<>(p_target is not null) then raise exception 'INVITATION_RECEIPT_INVALID' using errcode='22023'; end if;
 if item.completed_at is not null then
  if item.state<>p_state or item.target_id is distinct from p_target then raise exception 'INVITATION_RECEIPT_CONFLICT' using errcode='PT409'; end if;
 else
  if item.state not in ('dispatching','uncertain') then raise exception 'INVITATION_STATE_CONFLICT' using errcode='PT409'; end if;
  if p_target is not null and not exists(select 1 from auth.users where id=p_target and lower(email)=item.email) then
   raise exception 'INVITATION_TARGET_MISMATCH' using errcode='42501'; end if;
  -- Record an already-performed effect even if the requester has since lost access.
  update public.portal_invitation set state=p_state,target_id=p_target,completed_at=now() where id=p_id;
 end if;
 return jsonb_build_object('id',item.id,'state',p_state);
end $$;

create function public.portal_invitation_cancel_v1(p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid; item public.portal_invitation; begin
 actor:=auth_dv.portal_require_admin_mfa();
 select * into item from public.portal_invitation where id=p_id for update;
 if not found or item.state not in ('queued','cancelled') then raise exception 'INVITATION_CANNOT_CANCEL' using errcode='PT409'; end if;
 update public.portal_invitation set state='cancelled',cancelled_by=actor,completed_at=now() where id=p_id and state='queued';
 return jsonb_build_object('id',p_id,'state','cancelled');
end $$;

-- Keyset pagination; no secrets, provider tokens or dispatch nonces exposed.
create function public.portal_identity_directory_v1(p_kind text,p_after uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare rows jsonb; begin
 perform auth_dv.portal_require_admin_mfa();
 if p_kind='invitations' then
  select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from (
   select id,email,reason,created_at,target_id,
    case when state='dispatching' then 'uncertain' else state end as state
   from public.portal_invitation where p_after is null or id>p_after order by id limit 21) t;
 elsif p_kind='users' then
  select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into rows from (
   select id,email,role,account_id,member_role,pending,access_version,
    auth_dv.portal_verified_identity(id) as verified
   from public.app_user where role<>'admin' and (p_after is null or id>p_after) order by id limit 21) t;
 else raise exception 'DIRECTORY_KIND_INVALID' using errcode='22023'; end if;
 return jsonb_build_object('rows',rows);
end $$;

revoke all on function public.portal_invitation_request_v1(uuid,text,text),public.portal_invitation_cancel_v1(uuid),public.portal_identity_directory_v1(text,uuid) from public,anon;
grant execute on function public.portal_invitation_request_v1(uuid,text,text),public.portal_invitation_cancel_v1(uuid),public.portal_identity_directory_v1(text,uuid) to authenticated;
revoke all on function public.portal_invitation_claim_v1(uuid),public.portal_invitation_complete_v1(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.portal_invitation_claim_v1(uuid),public.portal_invitation_complete_v1(uuid,uuid,text,uuid) to service_role;
commit;
