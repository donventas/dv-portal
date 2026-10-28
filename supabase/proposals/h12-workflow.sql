-- Local isolated candidate. No automatic migration or production admission.
begin;
create table public.portal_collaborator_profile (
 user_id uuid primary key references public.app_user(id), subscribed boolean not null default false
);
create table public.portal_review_grant (
 account_id uuid references public.account(id), user_id uuid references public.app_user(id),
 can_publish boolean not null default false, active boolean not null default true,
 primary key(account_id,user_id)
);
create table public.portal_request (
 id uuid primary key, account_id uuid not null references public.account(id),
 actor_id uuid not null references public.app_user(id), draft_version integer not null,
 snapshot jsonb not null, assets jsonb not null, consent text not null,
 state text not null default 'received' check(state in ('received','reviewing','answered','closed')),
 revision integer not null default 1, responsible uuid references public.app_user(id),
 created_at timestamptz not null default now()
);
create table public.portal_request_message (
 id uuid primary key, request_id uuid not null references public.portal_request(id),
 actor_id uuid not null references public.app_user(id), audience text not null check(audience in ('client','internal','collaborator')),
 assignment_id uuid, body text not null, kind text not null default 'message', created_at timestamptz not null default now()
);
create table public.portal_request_assignment (
 id uuid primary key, request_id uuid not null references public.portal_request(id),
 user_id uuid not null references public.app_user(id), mode text not null check(mode in ('collaboration','referral')),
 scope jsonb not null, state text not null default 'invited' check(state in ('invited','accepted','rejected','revoked')),
 expires_at timestamptz not null, consent_actor uuid references public.app_user(id),
 consent_at timestamptz, created_at timestamptz not null default now()
);
create table public.portal_request_notice (
 id bigint generated always as identity primary key, event_key text not null,
 request_id uuid not null references public.portal_request(id), user_id uuid not null references public.app_user(id),
 audience text not null, assignment_id uuid, title text not null, read_at timestamptz,
 mail_state text not null default 'queued' check(mail_state in ('queued','captured','failed','suppressed')),
 created_at timestamptz not null default now(), unique(event_key,user_id)
);
create table public.portal_request_job (
 request_id uuid primary key references public.portal_request(id), state text not null default 'pending',
 lease uuid, lease_until timestamptz, attempts integer not null default 0,
 result jsonb, error text, completed_at timestamptz
);
-- Scope versions are append-only through RPC, with one immutable acceptance per version.
create table public.portal_request_scope (
 request_id uuid not null references public.portal_request(id), version integer not null check(version>0),
 definition jsonb not null check(jsonb_typeof(definition)='object'),
 delivery_on date not null, valid_until date not null check(valid_until<delivery_on),
 proposed_by uuid not null references public.app_user(id), proposed_at timestamptz not null default now(),
 accepted_by uuid references public.app_user(id), accepted_at timestamptz,
 primary key(request_id,version), check((accepted_by is null)=(accepted_at is null))
);
-- Additive collaboration/delivery slice. Existing assignments remain legacy records.
alter table public.portal_request_assignment add column scope_version integer;
alter table public.portal_request_assignment add column brief text;
alter table public.portal_request_assignment add column due_on date;
alter table public.portal_request_assignment add constraint portal_assignment_scope_fk foreign key(request_id,scope_version) references public.portal_request_scope(request_id,version);
create table public.portal_request_delivery (
 id uuid primary key, request_id uuid not null references public.portal_request(id),
 assignment_id uuid not null references public.portal_request_assignment(id), scope_version integer not null,
 version integer not null check(version>0), author_id uuid not null references public.app_user(id),
 body text not null, usage text not null, submitted_at timestamptz not null default now(),
 state text not null default 'submitted' check(state in ('submitted','changes','published')),
 review_note text, reviewed_by uuid references public.app_user(id), reviewed_at timestamptz,
 unique(assignment_id,version), foreign key(request_id,scope_version) references public.portal_request_scope(request_id,version)
);
-- Client reception: immutable decision per published delivery, reviewed separately by DV.
create table public.portal_delivery_response (
 delivery_id uuid primary key references public.portal_request_delivery(id),
 request_id uuid not null references public.portal_request(id), scope_version integer not null,
 kind text not null check(kind in ('received','changes')), detail jsonb not null,
 actor_id uuid not null references public.app_user(id), created_at timestamptz not null default now(),
 decision text check(decision in ('accepted','scope_needed')), team_note text,
 reviewed_by uuid references public.app_user(id), reviewed_at timestamptz,
 foreign key(request_id,scope_version) references public.portal_request_scope(request_id,version)
);
create table public.portal_request_receipt (
 actor_id uuid not null references public.app_user(id), key uuid not null,
 command jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(actor_id,key)
);
do $$ declare t text; begin
 foreach t in array array['portal_collaborator_profile','portal_review_grant','portal_request','portal_request_message','portal_request_assignment','portal_request_notice','portal_request_job','portal_request_receipt','portal_request_scope','portal_request_delivery','portal_delivery_response'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;

create function auth_dv.review_staff(a uuid,u uuid) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.portal_review_grant g join public.app_user p on p.id=g.user_id
 join public.account ac on ac.id=g.account_id
 where g.account_id=$1 and g.user_id=$2 and g.active and not p.pending
 and p.role in ('admin','analista') and ac.status='activo' and auth_dv.portal_verified_identity($2))
$$;
create function auth_dv.review_client(a uuid,u uuid) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.app_user p join public.account ac on ac.id=p.account_id
 where p.id=$2 and p.account_id=$1 and p.role='cliente' and p.member_role='owner'
 and not p.pending and ac.status='activo' and auth_dv.portal_verified_identity($2))
$$;
create function auth_dv.review_scope_current(rid uuid,ver integer) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.portal_request_scope s join public.portal_request r on r.id=s.request_id
 where s.request_id=rid and s.version=ver and s.accepted_at is not null and r.state<>'closed'
 and s.version=(select max(version) from public.portal_request_scope where request_id=rid))
$$;
create function auth_dv.review_assignment(i uuid,u uuid) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.portal_request_assignment x join public.portal_request r on r.id=x.request_id
 join public.account ac on ac.id=r.account_id join public.app_user p on p.id=x.user_id
 where x.id=$1 and x.user_id=$2 and not p.pending and ac.status='activo'
 and auth_dv.portal_verified_identity($2) and x.state='accepted' and x.expires_at>now()
 and (r.consent<>'improvement-v1' or auth_dv.review_scope_current(r.id,x.scope_version))
 and (x.mode='collaboration' or x.consent_at is not null))
$$;
create function auth_dv.review_can_submit(aid uuid,uid uuid) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
 select auth_dv.review_assignment(aid,uid)
 and not exists(select 1 from public.portal_request_delivery where assignment_id=aid and state='submitted')
 and (not exists(select 1 from public.portal_request_delivery where assignment_id=aid and state='published')
 or exists(select 1 from public.portal_delivery_response f where f.delivery_id=(select id from public.portal_request_delivery where assignment_id=aid and state='published' order by version desc limit 1) and f.kind='changes' and f.decision='accepted'))
$$;
create function auth_dv.review_notice_visible(n public.portal_request_notice,u uuid) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.portal_request r where r.id=n.request_id and n.user_id=u and (
 auth_dv.review_staff(r.account_id,u) or
 (n.audience='client' and auth_dv.review_client(r.account_id,u)) or
 (n.audience='collaborator' and auth_dv.review_assignment(n.assignment_id,u)) or
 (n.audience='invitation' and exists(select 1 from public.portal_request_assignment x join public.app_user p on p.id=x.user_id
  join public.account ac on ac.id=r.account_id where x.id=n.assignment_id and x.user_id=u and not p.pending
  and ac.status='activo' and auth_dv.portal_verified_identity(u) and x.state='invited' and x.expires_at>now()
  and (r.consent<>'improvement-v1' or auth_dv.review_scope_current(r.id,x.scope_version))
  and (x.mode='collaboration' or x.consent_at is not null)))))
$$;
create function auth_dv.review_notify(rid uuid,event text,aud text,title text,aid uuid default null) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare acct uuid; begin
 select account_id into acct from public.portal_request where id=rid;
 insert into public.portal_request_notice(event_key,request_id,user_id,audience,assignment_id,title,mail_state)
 select event,rid,u.id,aud,aid,title,case when exists(select 1 from public.portal_request where id=rid and consent='improvement-v1') then 'suppressed' else 'queued' end from public.app_user u where
 auth_dv.review_staff(acct,u.id) or (aud='client' and auth_dv.review_client(acct,u.id)) or
 (aud='collaborator' and auth_dv.review_assignment(aid,u.id)) or
 (aud='invitation' and not u.pending and auth_dv.portal_verified_identity(u.id) and exists(select 1 from public.portal_request_assignment x
  where x.id=aid and x.user_id=u.id and x.state='invited' and x.expires_at>now() and (x.mode='collaboration' or x.consent_at is not null)))
 on conflict(event_key,user_id) do nothing;
end $$;

create function public.portal_workflow_v1(p_action text,p_id uuid default null,p_key uuid default null,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.app_user; r public.portal_request; x public.portal_request_assignment;
 delivery_row public.portal_request_delivery; response_row public.portal_delivery_response;
 scope_row public.portal_request_scope; scope_version integer; delivery date; valid date; today date;
 old public.portal_request_receipt; d public.portal_brand_draft; fields jsonb; chosen jsonb;
 result jsonb; cmd jsonb; staff boolean; client boolean; allowed boolean; mid uuid; k text; v jsonb; cursor bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('portal-identity-v1',0));
 today:=(clock_timestamp() at time zone 'America/Mexico_City')::date;
 actor:=auth_dv.me();
 if actor.id is null then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>100000 then
  raise exception 'WORKFLOW_INVALID' using errcode='22023'; end if;
 if p_action='inbox' then
  return jsonb_build_object('contract','portal-workflow-v1','actor',jsonb_build_object('id',actor.id,'name',actor.name),
   'requests',(select coalesce(jsonb_agg(z order by z.created_at desc,z.id),'[]') from (
    select id,draft_version,state,revision,created_at,responsible,snapshot->>'improvement_category' as category,snapshot->>'improvement_need' as need,auth_dv.review_staff(account_id,actor.id) as staff
    from public.portal_request where (auth_dv.review_staff(account_id,actor.id) or auth_dv.review_client(account_id,actor.id))
    and (p_id is null or id>p_id) order by id limit 50) z),
   'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'requestId',a.request_id,'mode',a.mode,
    'scopeVersion',a.scope_version,'brief',case when a.state in ('invited','accepted') and a.expires_at>now() and (q.consent<>'improvement-v1' or auth_dv.review_scope_current(q.id,a.scope_version)) then a.brief end,'dueOn',a.due_on,
    'state',case when a.expires_at<=now() then 'expired' when q.consent='improvement-v1' and not auth_dv.review_scope_current(q.id,a.scope_version) then 'outdated' else a.state end,'expiresAt',a.expires_at)), '[]')
    from public.portal_request_assignment a join public.portal_request q on q.id=a.request_id join public.account ac on ac.id=q.account_id
    where a.user_id=actor.id and ac.status='activo' and a.state in ('invited','accepted')
    and (a.mode='collaboration' or a.consent_at is not null)));
 end if;
 if p_action='notices' then
  cursor:=coalesce((p_data->>'after')::bigint,0);
  return jsonb_build_object('contract','portal-workflow-v1','notices',(select coalesce(jsonb_agg(z order by z.id),'[]')
   from (select n.id,n.request_id,n.title,n.read_at,n.created_at from public.portal_request_notice n
    where n.id>cursor and auth_dv.review_notice_visible(n,actor.id) order by n.id limit 50) z));
 end if;
 if p_action in ('submit','submit_improvement') then
  actor:=auth_dv.portal_draft_owner();
 else
  select * into r from public.portal_request where id=p_id for update;
  if r.id is null then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501'; end if;
  staff:=auth_dv.review_staff(r.account_id,actor.id);client:=auth_dv.review_client(r.account_id,actor.id);
  select * into x from public.portal_request_assignment where id=nullif(p_data->>'assignmentId','')::uuid and request_id=r.id;
  allowed:=staff or client or auth_dv.review_assignment(x.id,actor.id);
  if p_action in ('accept','reject','work_accept','work_reject') then allowed:=x.user_id=actor.id and x.state in ('invited','accepted','rejected') and x.expires_at>now()
    and (x.mode='collaboration' or x.consent_at is not null)
    and exists(select 1 from public.account where id=r.account_id and status='activo'); end if;
  if not coalesce(allowed,false) then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501'; end if;
 end if;
 if p_action='asset' then
  if not (staff or client) or not (r.assets @> jsonb_build_array(p_data->>'assetId')) then
   raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  return (select jsonb_build_object('contract','portal-workflow-v1','asset',jsonb_build_object('id',id,'name',name,'mime',mime,'base64',encode(content,'base64')))
   from public.portal_brand_asset where id=(p_data->>'assetId')::uuid and account_id=r.account_id);
 end if;
 if p_action='read' then
  result:=jsonb_build_object('contract','portal-workflow-v1','id',r.id,'draftVersion',r.draft_version,
   'state',r.state,'revision',r.revision,'responsible',r.responsible,'staff',staff,'client',client,
   'canPublish',staff and exists(select 1 from public.portal_review_grant where account_id=r.account_id and user_id=actor.id and can_publish),
   'snapshot',case when staff or client then r.snapshot else x.scope end,
   'assets',case when staff or client then r.assets else '[]'::jsonb end,
   'messages',(select coalesce(jsonb_agg(z order by z.created_at,z.id),'[]') from (
     select id,actor_id,audience,body,kind,created_at from public.portal_request_message
     where request_id=r.id and (staff or client and audience='client' or
      audience='collaborator' and assignment_id=x.id and auth_dv.review_assignment(x.id,actor.id))
     and (p_data->>'after' is null or id>(p_data->>'after')::uuid) order by id limit 50) z));
  if staff then result:=result||jsonb_build_object('analysis',(select jsonb_build_object('state',j.state,'attempts',j.attempts,'result',j.result,'error',j.error) from public.portal_request_job j where j.request_id=r.id),
   'team',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name)),'[]') from public.app_user u where auth_dv.review_staff(r.account_id,u.id)),
   'collaborators',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name)),'[]') from public.app_user u join public.portal_collaborator_profile c on c.user_id=u.id where c.subscribed and not u.pending and u.role='analista' and auth_dv.portal_verified_identity(u.id)),
   'assignments',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.portal_request_assignment a where request_id=r.id));
  elsif client then result:=result||jsonb_build_object('referrals',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'recipient',u.name,'recipientId',u.id,'scope',a.scope,'state',a.state,'consented',a.consent_at is not null)),'[]') from public.portal_request_assignment a join public.app_user u on u.id=a.user_id where request_id=r.id and mode='referral'));
  end if;
  if (staff or client) and r.consent='improvement-v1' then
   result:=result||jsonb_build_object('scopes',(select coalesce(jsonb_agg(
    jsonb_build_object('version',s.version,'definition',s.definition,'deliveryOn',s.delivery_on,'validUntil',s.valid_until,
     'proposedBy',s.proposed_by,'proposedAt',s.proposed_at,'acceptedBy',s.accepted_by,'acceptedAt',s.accepted_at,
     'status',case when s.version<>(select max(version) from public.portal_request_scope where request_id=r.id) then 'superseded'
      when r.state='closed' then 'closed' when s.accepted_at is not null then 'accepted'
      when s.valid_until<today or s.delivery_on<=today then 'expired' else 'proposed' end) order by s.version desc),'[]')
     from public.portal_request_scope s where s.request_id=r.id));
  end if;
  if r.consent='improvement-v1' then
   select * into scope_row from public.portal_request_scope where request_id=r.id order by version desc limit 1;
   result:=result||jsonb_build_object('work',jsonb_build_object('scopeVersion',scope_row.version,
    'ready',coalesce(auth_dv.review_scope_current(r.id,scope_row.version),false),
    'assignment',case when not staff and not client then jsonb_build_object('id',x.id,'scopeVersion',x.scope_version,'brief',x.brief,'dueOn',x.due_on,'expiresAt',x.expires_at) end,
    'items',(select coalesce(jsonb_agg(jsonb_build_object('id',item.id,'assignmentId',item.assignment_id,'scopeVersion',item.scope_version,'version',item.version,
     'body',item.body,'usage',item.usage,'state',item.state,'submittedAt',item.submitted_at,'reviewedAt',item.reviewed_at,
     'files',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',octet_length(f.content),'sha256',f.sha256) order by f.id),'[]') from public.portal_delivery_file f where f.delivery_id=item.id),
     'canUpload',item.state='submitted' and item.author_id=actor.id and auth_dv.review_assignment(a.id,actor.id) and auth_dv.review_scope_current(r.id,item.scope_version),
     'reviewNote',case when staff or not client then item.review_note end,
     'response',case when staff or client then (select jsonb_build_object('kind',f.kind,'detail',f.detail,'createdAt',f.created_at,'decision',f.decision,'teamNote',f.team_note,'reviewedAt',f.reviewed_at) from public.portal_delivery_response f where f.delivery_id=item.id) end,
     'canRespond',client and item.state='published' and auth_dv.review_scope_current(r.id,item.scope_version)
       and item.id=(select pub.id from public.portal_request_delivery pub where pub.request_id=r.id and pub.scope_version=item.scope_version and pub.state='published' order by pub.reviewed_at desc,pub.id desc limit 1)
       and not exists(select 1 from public.portal_delivery_response where delivery_id=item.id),
     'canReviewResponse',staff and item.state='published' and auth_dv.review_scope_current(r.id,item.scope_version)
       and item.id=(select pub.id from public.portal_request_delivery pub where pub.request_id=r.id and pub.scope_version=item.scope_version and pub.state='published' order by pub.reviewed_at desc,pub.id desc limit 1)
       and exists(select 1 from public.portal_delivery_response where delivery_id=item.id and kind='changes' and decision is null)
       and exists(select 1 from public.portal_review_grant where account_id=r.account_id and user_id=actor.id and active and can_publish),
     'revisionInstruction',case when not staff and not client then (select f.team_note from public.portal_delivery_response f where f.delivery_id=item.id and f.decision='accepted') end,
     'canReview',staff and item.state='submitted' and item.author_id<>actor.id
       and auth_dv.review_assignment(a.id,a.user_id) and item.version=(select max(version) from public.portal_request_delivery where assignment_id=a.id)
       and exists(select 1 from public.portal_review_grant where account_id=r.account_id and user_id=actor.id and active and can_publish))
     order by item.submitted_at desc,item.id),'[]') from public.portal_request_delivery item join public.portal_request_assignment a on a.id=item.assignment_id
     where item.request_id=r.id and (staff or client and item.state='published' or not client and not staff and item.assignment_id=x.id)),
    'roundsRemaining',case when staff or client then greatest(0,coalesce((scope_row.definition->>'rounds')::integer,0)-(select count(*)::integer from public.portal_delivery_response resp where resp.request_id=r.id and resp.scope_version=scope_row.version and resp.decision='accepted')) end,
    'canSubmit',not staff and not client and auth_dv.review_can_submit(x.id,actor.id)));
  end if;return result;
 end if;
 -- Revalidate capability before receipt replay, including permission revocations.
 if p_action in ('delivery_respond','response_review') then
  if r.consent<>'improvement-v1' or (p_action='delivery_respond' and not client) or
    (p_action='response_review' and (not staff or not exists(select 1 from public.portal_review_grant where account_id=r.account_id and user_id=actor.id and active and can_publish)))
    then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  select * into delivery_row from public.portal_request_delivery where id=nullif(p_data->>'deliveryId','')::uuid and request_id=r.id and state='published';
  if delivery_row.id is null then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  if not auth_dv.review_scope_current(r.id,delivery_row.scope_version) or delivery_row.id is distinct from
   (select pub.id from public.portal_request_delivery pub where pub.request_id=r.id and pub.scope_version=delivery_row.scope_version and pub.state='published' order by pub.reviewed_at desc,pub.id desc limit 1)
   then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  select * into scope_row from public.portal_request_scope where request_id=r.id and version=delivery_row.scope_version;
  select * into response_row from public.portal_delivery_response where delivery_id=delivery_row.id;
  if p_action='response_review' and p_data->>'decision'='accepted' and not auth_dv.review_assignment(delivery_row.assignment_id,delivery_row.author_id) then
   raise exception 'WORKFLOW_ASSIGNMENT_STALE' using errcode='22023';end if;
 end if;
 if p_action in ('scope_propose','scope_accept') then
  if r.consent<>'improvement-v1' or
   (p_action='scope_propose' and (not staff or not exists(select 1 from public.portal_review_grant where account_id=r.account_id and user_id=actor.id and active and can_publish))) or
   (p_action='scope_accept' and not client) then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
 end if;
 -- All scoped work authority is checked before replay, including stale grants/assignments.
 if r.consent='improvement-v1' and p_action in ('assign','publish','accept','reject') then
  raise exception 'WORKFLOW_BOUND_ACTION_REQUIRED' using errcode='22023';end if;
 if p_action in ('work_assign','work_accept','work_reject','delivery_submit','delivery_review') then
  if r.consent is distinct from 'improvement-v1' then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  select * into scope_row from public.portal_request_scope where request_id=r.id order by version desc limit 1;
  if not coalesce(auth_dv.review_scope_current(r.id,scope_row.version),false) then raise exception 'WORKFLOW_SCOPE_REQUIRED' using errcode='22023';end if;
  if p_action<>'delivery_review' and p_data->>'scopeVersion' is distinct from scope_row.version::text then
   raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  if p_action='work_assign' then
   if not staff then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  else
   if x.id is null or x.scope_version is distinct from scope_row.version or x.expires_at<=now() or x.state='revoked' then
    raise exception 'WORKFLOW_ASSIGNMENT_STALE' using errcode='22023';end if;
   if p_action in ('work_accept','work_reject') then
    if x.user_id<>actor.id then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
   elsif p_action='delivery_submit' then
    if x.user_id<>actor.id or not auth_dv.review_assignment(x.id,actor.id) then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
   elsif p_action='delivery_review' then
    if not staff or not auth_dv.review_assignment(x.id,x.user_id) or not exists(select 1 from public.portal_review_grant where account_id=r.account_id and user_id=actor.id and active and can_publish)
     then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
   end if;
  end if;
 end if;
 if p_key is null then raise exception 'WORKFLOW_KEY_REQUIRED' using errcode='22023'; end if;
 cmd:=jsonb_build_object('action',p_action,'id',p_id,'data',p_data);
 select * into old from public.portal_request_receipt where actor_id=actor.id and key=p_key;
 if found then
  if old.command<>cmd then raise exception 'WORKFLOW_KEY_CONFLICT' using errcode='PT409'; end if;
  -- Revalidate scoped authority before replaying a receipt.
  if p_action in ('assign','manage','publish','revoke','retry_analysis') and not staff then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501'; end if;
  return old.result;
 end if;
 if p_action='submit_improvement' then
  if p_data->>'consent' is distinct from 'improvement-v1' then raise exception 'WORKFLOW_CONFIRM_REQUIRED' using errcode='22023';end if;
  if p_data->>'category' is null or p_data->>'category' not in ('explain','identity','sales','content','web','spaces','unsure','other')
   or jsonb_typeof(p_data->'need') is distinct from 'string' or length(btrim(p_data->>'need')) not between 1 and 4000
   or jsonb_typeof(p_data->'contextKeys') is distinct from 'array' or jsonb_array_length(p_data->'contextKeys')>100
   or exists(select 1 from jsonb_object_keys(p_data) z where z not in ('category','need','contextKeys','version','consent'))
   then raise exception 'WORKFLOW_INVALID' using errcode='22023';end if;
  if not exists(select 1 from public.app_user u where auth_dv.review_staff(actor.account_id,u.id)) then
   raise exception 'WORKFLOW_TEAM_UNAVAILABLE' using errcode='22023';end if;
  fields:=jsonb_build_object('improvement_category',p_data->>'category','improvement_need',btrim(p_data->>'need'));
  select * into d from public.portal_brand_draft where account_id=actor.account_id;
  if jsonb_array_length(p_data->'contextKeys')>0 and (d.version is null or (p_data->>'version')::integer is distinct from d.version) then
   raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  for v in select * from jsonb_array_elements(p_data->'contextKeys') loop
   k:=v#>>'{}';
   if jsonb_typeof(v)<>'string' or not coalesce(d.document->'fields' ? k,false) or fields ? k
    or k like 'welcome_%' or k in ('brand_logo','brand_logo_light','brand_logo_dark','brand_manual')
    or k like 'qnote_%' and coalesce(d.document->'fields'->('q_'||substring(k from 7)),'false')<>'true'::jsonb
    then raise exception 'WORKFLOW_INVALID' using errcode='22023';end if;
   fields:=fields||jsonb_build_object(k,d.document->'fields'->k);
  end loop;
  mid:=gen_random_uuid();
  insert into public.portal_request(id,account_id,actor_id,draft_version,snapshot,assets,consent)
   values(mid,actor.account_id,actor.id,case when jsonb_array_length(p_data->'contextKeys')>0 then d.version else 0 end,fields,'[]','improvement-v1');
  -- Human inbox only: no analysis job and all notices for this request suppress mail.
  perform auth_dv.review_notify(mid,'received:'||mid,'internal','Nueva solicitud de mejora');
  result:=jsonb_build_object('id',mid,'revision',1,'state','received');
 elsif p_action='submit' then
  if p_data->>'consent' is distinct from 'review-v1' or jsonb_typeof(p_data->'assets') is distinct from 'array'
   then raise exception 'WORKFLOW_CONFIRM_REQUIRED' using errcode='22023'; end if;
  select * into d from public.portal_brand_draft where account_id=actor.account_id;
  if d.version is null or (p_data->>'version')::integer is distinct from d.version then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409'; end if;
  fields:='{}';
  for k,v in select * from jsonb_each(d.document->'fields') loop
   if k like 'welcome_%' or k in ('brand_logo','brand_logo_light','brand_logo_dark','brand_manual')
    or k like 'qnote_%' and coalesce(d.document->'fields'->('q_'||substring(k from 7)),'false')<>'true'::jsonb then continue;end if;
   fields:=fields||jsonb_build_object(k,v);
  end loop;
  chosen:='[]';
  for v in select * from jsonb_array_elements(p_data->'assets') loop
   if jsonb_typeof(v)<>'string' or not exists(select 1 from public.portal_brand_asset a
    where a.id::text=v#>>'{}' and a.account_id=actor.account_id and a.id::text in (
     d.document->'fields'->>'brand_logo',d.document->'fields'->>'brand_logo_light',d.document->'fields'->>'brand_logo_dark',d.document->'fields'->>'brand_manual'))
    or chosen @> jsonb_build_array(v) then raise exception 'WORKFLOW_ASSET_INVALID' using errcode='22023';end if;
   chosen:=chosen||jsonb_build_array(v);
  end loop;
  mid:=gen_random_uuid();
  insert into public.portal_request(id,account_id,actor_id,draft_version,snapshot,assets,consent)
   values(mid,actor.account_id,actor.id,d.version,fields,chosen,'review-v1');
  insert into public.portal_request_job(request_id) values(mid);
  perform auth_dv.review_notify(mid,'received:'||mid,'internal','Solicitud recibida');
  result:=jsonb_build_object('contract','portal-workflow-v1','id',mid,'draftVersion',d.version,'revision',1,'state','received');
 elsif p_action='scope_propose' then
  if r.state='closed' then raise exception 'WORKFLOW_SCOPE_CLOSED' using errcode='22023';end if;
  if p_data->>'revision' is distinct from r.revision::text then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  if exists(select 1 from jsonb_object_keys(p_data) z where z not in ('revision','outcome','exclusions','requirements','rounds','deliveryOn','validUntil','capacityConfirmed'))
   or jsonb_typeof(p_data->'outcome') is distinct from 'string' or length(btrim(p_data->>'outcome')) not between 1 and 4000
   or jsonb_typeof(p_data->'exclusions') is distinct from 'string' or length(btrim(p_data->>'exclusions')) not between 1 and 2000
   or jsonb_typeof(p_data->'requirements') is distinct from 'string' or length(btrim(p_data->>'requirements')) not between 1 and 2000
   or jsonb_typeof(p_data->'rounds') is distinct from 'number' or (p_data->>'rounds') !~ '^[0-5]$'
   or p_data->'capacityConfirmed' is distinct from 'true'::jsonb
   or jsonb_typeof(p_data->'deliveryOn') is distinct from 'string' or (p_data->>'deliveryOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or jsonb_typeof(p_data->'validUntil') is distinct from 'string' or (p_data->>'validUntil') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   then raise exception 'WORKFLOW_SCOPE_INVALID' using errcode='22023';end if;
  begin delivery:=(p_data->>'deliveryOn')::date;valid:=(p_data->>'validUntil')::date;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'WORKFLOW_SCOPE_INVALID' using errcode='22023';end;
  if valid<today or delivery<=valid then raise exception 'WORKFLOW_SCOPE_DATES' using errcode='22023';end if;
  select coalesce(max(version),0)+1 into scope_version from public.portal_request_scope where request_id=r.id;
  insert into public.portal_request_scope(request_id,version,definition,delivery_on,valid_until,proposed_by)
   values(r.id,scope_version,jsonb_build_object('outcome',btrim(p_data->>'outcome'),'exclusions',btrim(p_data->>'exclusions'),
    'requirements',btrim(p_data->>'requirements'),'rounds',(p_data->>'rounds')::integer,'capacityConfirmed',true),delivery,valid,actor.id);
  update public.portal_request set revision=revision+1,responsible=actor.id where id=r.id;
  perform auth_dv.review_notify(r.id,'scope:'||r.id||':'||scope_version,'client','Propuesta de alcance y fecha disponible');
  result:=jsonb_build_object('id',r.id,'scopeVersion',scope_version,'revision',r.revision+1);
 elsif p_action='scope_accept' then
  if r.state='closed' then raise exception 'WORKFLOW_SCOPE_CLOSED' using errcode='22023';end if;
  if p_data->>'consent' is distinct from 'scope-lab-v1' or jsonb_typeof(p_data->'scopeVersion') is distinct from 'number'
   or (p_data->>'scopeVersion') !~ '^[1-9][0-9]{0,8}$'
   or exists(select 1 from jsonb_object_keys(p_data) z where z not in ('scopeVersion','consent')) then
   raise exception 'WORKFLOW_SCOPE_CONFIRM_REQUIRED' using errcode='22023';end if;
  select * into scope_row from public.portal_request_scope where request_id=r.id order by version desc limit 1;
  if scope_row.version is null or scope_row.version is distinct from (p_data->>'scopeVersion')::integer then
   raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  if scope_row.accepted_at is null then
   if scope_row.valid_until<today or scope_row.delivery_on<=today then raise exception 'WORKFLOW_SCOPE_EXPIRED' using errcode='22023';end if;
   update public.portal_request_scope set accepted_by=actor.id,accepted_at=clock_timestamp()
    where request_id=r.id and version=scope_row.version returning * into scope_row;
   update public.portal_request set revision=revision+1 where id=r.id;
   perform auth_dv.review_notify(r.id,'scope-accepted:'||r.id||':'||scope_row.version,'client','Alcance y fecha aceptados en la prueba');
  end if;
  result:=jsonb_build_object('id',r.id,'scopeVersion',scope_row.version,'acceptedBy',scope_row.accepted_by,'acceptedAt',scope_row.accepted_at);
 elsif p_action='delivery_respond' then
  if response_row.delivery_id is not null or p_data->>'revision' is distinct from r.revision::text then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  if exists(select 1 from jsonb_object_keys(p_data) z where z not in ('deliveryId','revision','kind','note','focus','confirmed'))
   or p_data->>'kind' is null or p_data->>'kind' not in ('received','changes') or p_data->'confirmed' is distinct from 'true'::jsonb
   or jsonb_typeof(p_data->'note') is distinct from 'string' or length(p_data->>'note')>4000
   or jsonb_typeof(p_data->'focus') is distinct from 'array' or jsonb_array_length(p_data->'focus')>5
   or exists(select 1 from jsonb_array_elements(p_data->'focus') z where jsonb_typeof(z)<>'string' or z#>>'{}' not in ('clarity','tone','accuracy','use','other'))
   or (p_data->>'kind'='changes' and length(btrim(p_data->>'note'))=0)
   or (p_data->>'kind'='received' and (p_data->>'note'<>'' or jsonb_array_length(p_data->'focus')<>0))
   then raise exception 'WORKFLOW_RESPONSE_INVALID' using errcode='22023';end if;
  insert into public.portal_delivery_response(delivery_id,request_id,scope_version,kind,detail,actor_id)
   values(delivery_row.id,r.id,delivery_row.scope_version,p_data->>'kind',jsonb_build_object('focus',p_data->'focus','note',btrim(p_data->>'note')),actor.id);
  update public.portal_request set revision=revision+1 where id=r.id;
  perform auth_dv.review_notify(r.id,'client-response:'||delivery_row.id,'client',case when p_data->>'kind'='received' then 'El cliente confirmó la recepción' else 'El cliente pidió revisar ajustes' end);
  result:=jsonb_build_object('id',delivery_row.id,'kind',p_data->>'kind');
 elsif p_action='response_review' then
  if response_row.kind is distinct from 'changes' or response_row.decision is not null or p_data->>'revision' is distinct from r.revision::text then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  if exists(select 1 from jsonb_object_keys(p_data) z where z not in ('deliveryId','revision','decision','note','approved'))
   or p_data->>'decision' is null or p_data->>'decision' not in ('accepted','scope_needed') or p_data->'approved' is distinct from 'true'::jsonb
   or jsonb_typeof(p_data->'note') is distinct from 'string' or length(btrim(p_data->>'note')) not between 1 and 4000 then
   raise exception 'WORKFLOW_RESPONSE_REVIEW_REQUIRED' using errcode='22023';end if;
  if p_data->>'decision'='accepted' and (select count(*) from public.portal_delivery_response resp where resp.request_id=r.id and resp.scope_version=scope_row.version and resp.decision='accepted')>=coalesce((scope_row.definition->>'rounds')::integer,0) then
   raise exception 'WORKFLOW_ROUNDS_EXHAUSTED' using errcode='22023';end if;
  update public.portal_delivery_response set decision=p_data->>'decision',team_note=btrim(p_data->>'note'),reviewed_by=actor.id,reviewed_at=clock_timestamp() where delivery_id=delivery_row.id;
  update public.portal_request set revision=revision+1 where id=r.id;
  perform auth_dv.review_notify(r.id,'response-review:'||delivery_row.id,'client',case when p_data->>'decision'='accepted' then 'El equipo atenderá tus ajustes' else 'Revisemos un nuevo alcance para tus ajustes' end);
  if p_data->>'decision'='accepted' then perform auth_dv.review_notify(r.id,'revision-work:'||delivery_row.id,'collaborator','Ajustes autorizados por el equipo',delivery_row.assignment_id);end if;
  result:=jsonb_build_object('id',delivery_row.id,'decision',p_data->>'decision');
 elsif p_action='work_assign' then
  if p_data->>'revision' is distinct from r.revision::text or p_data->>'scopeVersion' is distinct from scope_row.version::text then
   raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  if exists(select 1 from jsonb_object_keys(p_data) z where z not in ('revision','scopeVersion','userId','brief','dueOn','keys'))
   or jsonb_typeof(p_data->'brief') is distinct from 'string' or length(btrim(p_data->>'brief')) not between 1 and 4000
   or jsonb_typeof(p_data->'keys') is distinct from 'array' or jsonb_array_length(p_data->'keys')>100
   or jsonb_typeof(p_data->'dueOn') is distinct from 'string' or (p_data->>'dueOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   then raise exception 'WORKFLOW_WORK_INVALID' using errcode='22023';end if;
  if not exists(select 1 from public.app_user u join public.portal_collaborator_profile c on c.user_id=u.id where u.id=(p_data->>'userId')::uuid and not u.pending and u.role='analista' and c.subscribed and auth_dv.portal_verified_identity(u.id)) then
   raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  begin delivery:=(p_data->>'dueOn')::date;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'WORKFLOW_WORK_INVALID' using errcode='22023';end;
  if delivery<today or delivery>scope_row.delivery_on then raise exception 'WORKFLOW_WORK_DATES' using errcode='22023';end if;
  if exists(select 1 from public.portal_request_assignment a where a.request_id=r.id and a.scope_version=scope_row.version and a.state in ('invited','accepted') and a.expires_at>now()) then
   raise exception 'WORKFLOW_ACTIVE_ASSIGNMENT' using errcode='22023';end if;
  chosen:='{}';for v in select * from jsonb_array_elements(p_data->'keys') loop
   if jsonb_typeof(v)<>'string' or not r.snapshot ? (v#>>'{}') or chosen ? (v#>>'{}') then raise exception 'WORKFLOW_WORK_INVALID' using errcode='22023';end if;
   chosen:=chosen||jsonb_build_object(v#>>'{}',r.snapshot->(v#>>'{}'));
  end loop;
  mid:=gen_random_uuid();insert into public.portal_request_assignment(id,request_id,user_id,mode,scope,expires_at,scope_version,brief,due_on)
   values(mid,r.id,(p_data->>'userId')::uuid,'collaboration',chosen,(scope_row.delivery_on+8)::timestamp at time zone 'America/Mexico_City',scope_row.version,btrim(p_data->>'brief'),delivery);
  update public.portal_request set revision=revision+1 where id=r.id;
  perform auth_dv.review_notify(r.id,'invitation:'||mid,'invitation','Nuevo encargo de prueba con alcance y fecha',mid);
  result:=jsonb_build_object('id',mid,'scopeVersion',scope_row.version,'state','invited');
 elsif p_action in ('work_accept','work_reject') then
  if exists(select 1 from jsonb_object_keys(p_data) z where z not in ('assignmentId','scopeVersion','confirmed')) or
   p_data->>'scopeVersion' is distinct from x.scope_version::text or p_data->'confirmed' is distinct from 'true'::jsonb then
   raise exception 'WORKFLOW_WORK_CONFIRM_REQUIRED' using errcode='22023';end if;
  if x.state<>'invited' then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  if p_action='work_accept' and x.due_on<today then raise exception 'WORKFLOW_WORK_DATES' using errcode='22023';end if;
  update public.portal_request_assignment set state=case when p_action='work_accept' then 'accepted' else 'rejected' end where id=x.id;
  update public.portal_request set revision=revision+1 where id=r.id;
  perform auth_dv.review_notify(r.id,'assignment:'||x.id||':'||p_action,'internal','Respuesta al encargo de prueba');
  result:=jsonb_build_object('id',x.id,'state',case when p_action='work_accept' then 'accepted' else 'rejected' end);
 elsif p_action='delivery_submit' then
  if exists(select 1 from jsonb_object_keys(p_data) z where z not in ('assignmentId','scopeVersion','body','usage')) or
   p_data->>'scopeVersion' is distinct from x.scope_version::text or
   jsonb_typeof(p_data->'body') is distinct from 'string' or length(btrim(p_data->>'body')) not between 1 and 12000 or
   jsonb_typeof(p_data->'usage') is distinct from 'string' or length(btrim(p_data->>'usage')) not between 1 and 4000 then
   raise exception 'WORKFLOW_DELIVERY_INVALID' using errcode='22023';end if;
  if not auth_dv.review_can_submit(x.id,actor.id) then
   raise exception 'WORKFLOW_DELIVERY_WAIT' using errcode='22023';end if;
  select coalesce(max(version),0)+1 into scope_version from public.portal_request_delivery where assignment_id=x.id;
  mid:=gen_random_uuid();insert into public.portal_request_delivery(id,request_id,assignment_id,scope_version,version,author_id,body,usage)
   values(mid,r.id,x.id,x.scope_version,scope_version,actor.id,btrim(p_data->>'body'),btrim(p_data->>'usage'));
  update public.portal_request set revision=revision+1 where id=r.id;
  perform auth_dv.review_notify(r.id,'delivery:'||mid,'internal','Avance listo para revisión del equipo');
  result:=jsonb_build_object('id',mid,'version',scope_version,'state','submitted');
 elsif p_action='delivery_review' then
  if exists(select 1 from jsonb_object_keys(p_data) z where z not in ('assignmentId','deliveryId','revision','decision','note','approved','fileIds')) or
   p_data->>'decision' is null or p_data->>'decision' not in ('changes','publish') or
   p_data->'approved' is distinct from 'true'::jsonb or jsonb_typeof(p_data->'note') is distinct from 'string' or length(btrim(p_data->>'note')) not between 1 and 4000 then
   raise exception 'WORKFLOW_REVIEW_REQUIRED' using errcode='22023';end if;
  if p_data->>'revision' is distinct from r.revision::text then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  select * into delivery_row from public.portal_request_delivery where id=(p_data->>'deliveryId')::uuid and request_id=r.id and assignment_id=x.id;
  if delivery_row.id is null or delivery_row.author_id=actor.id then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  if delivery_row.state<>'submitted' or delivery_row.scope_version<>scope_row.version or delivery_row.version<>(select max(version) from public.portal_request_delivery where assignment_id=x.id) then
   raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  if exists(select 1 from public.portal_delivery_file where delivery_id=delivery_row.id) and
    (p_data->'fileIds' is distinct from (select jsonb_agg(f.id order by f.id) from public.portal_delivery_file f where f.delivery_id=delivery_row.id)) then
   raise exception 'FILE_REVIEW_REQUIRED' using errcode='PT409';end if;
  update public.portal_request_delivery set state=case when p_data->>'decision'='publish' then 'published' else 'changes' end,
   review_note=btrim(p_data->>'note'),reviewed_by=actor.id,reviewed_at=clock_timestamp() where id=delivery_row.id;
  update public.portal_request set revision=revision+1,state=case when p_data->>'decision'='publish' then 'answered' else state end where id=r.id;
  perform auth_dv.review_notify(r.id,'review:'||delivery_row.id,case when p_data->>'decision'='publish' then 'client' else 'collaborator' end,
   case when p_data->>'decision'='publish' then 'Entrega revisada disponible' else 'El equipo pidió ajustes al avance' end,x.id);
  result:=jsonb_build_object('id',delivery_row.id,'version',delivery_row.version,'state',case when p_data->>'decision'='publish' then 'published' else 'changes' end);
 elsif p_action='message' then
  if p_data->>'audience' not in ('client','internal','collaborator') or p_data->>'audience' is null
   or length(coalesce(p_data->>'body','')) not between 1 and 4000 or btrim(p_data->>'body')=''
   or (p_data->>'audience'='internal' and not staff)
   or (p_data->>'audience'='client' and not (staff or client))
   or (p_data->>'audience'='collaborator' and not coalesce((x.state='accepted' and x.expires_at>now() and
     (x.mode='collaboration' or x.consent_at is not null) and (staff or auth_dv.review_assignment(x.id,actor.id))),false))
   then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  mid:=gen_random_uuid();
  insert into public.portal_request_message(id,request_id,actor_id,audience,assignment_id,body)
   values(mid,r.id,actor.id,p_data->>'audience',case when p_data->>'audience'='collaborator' then x.id else null end,p_data->>'body');
  perform auth_dv.review_notify(r.id,'message:'||mid,p_data->>'audience','Nuevo mensaje',x.id);
  result:=jsonb_build_object('id',mid);
 elsif p_action='manage' then
  if not staff then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  if (p_data->>'revision')::integer is distinct from r.revision then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  if p_data->>'state' not in ('received','reviewing','answered','closed') or p_data->>'state' is null or
   (p_data->>'state'='answered' and r.state<>'answered') or
   not auth_dv.review_staff(r.account_id,(p_data->>'responsible')::uuid) then raise exception 'WORKFLOW_INVALID' using errcode='22023';end if;
  update public.portal_request set state=p_data->>'state',responsible=(p_data->>'responsible')::uuid,revision=revision+1 where id=r.id;
  result:=jsonb_build_object('revision',r.revision+1);
 elsif p_action='publish' then
  if not staff or not exists(select 1 from public.portal_review_grant where account_id=r.account_id and user_id=actor.id and can_publish)
   then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  if (p_data->>'revision')::integer is distinct from r.revision then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  if p_data->'approved' is distinct from 'true'::jsonb or length(coalesce(p_data->>'body','')) not between 1 and 8000
   or btrim(p_data->>'body')='' then raise exception 'WORKFLOW_CONFIRM_REQUIRED' using errcode='22023';end if;
  mid:=gen_random_uuid();insert into public.portal_request_message(id,request_id,actor_id,audience,body,kind)
   values(mid,r.id,actor.id,'client',p_data->>'body','approved_return');
  update public.portal_request set state='answered',revision=revision+1 where id=r.id;
  perform auth_dv.review_notify(r.id,'return:'||mid,'client','Devolución revisada disponible');
  result:=jsonb_build_object('id',mid,'revision',r.revision+1);
 elsif p_action='mark_read' then
  update public.portal_request_notice n set read_at=coalesce(read_at,now()) where id=(p_data->>'noticeId')::bigint
   and request_id=r.id and auth_dv.review_notice_visible(n,actor.id);
  if not found then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  result:=jsonb_build_object('read',true);
 elsif p_action='assign' then
  if not staff then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  if p_data->>'mode' not in ('collaboration','referral') or p_data->>'mode' is null
   or jsonb_typeof(p_data->'keys') is distinct from 'array' or jsonb_array_length(p_data->'keys')=0
   or not exists(select 1 from public.app_user u join public.portal_collaborator_profile c on c.user_id=u.id where u.id=(p_data->>'userId')::uuid and not u.pending and u.role='analista' and c.subscribed and auth_dv.portal_verified_identity(u.id))
   then raise exception 'WORKFLOW_INVALID' using errcode='22023';end if;
  chosen:='{}';for v in select * from jsonb_array_elements(p_data->'keys') loop
   if jsonb_typeof(v)<>'string' or not r.snapshot ? (v#>>'{}') then raise exception 'WORKFLOW_INVALID' using errcode='22023';end if;
   chosen:=chosen||jsonb_build_object(v#>>'{}',r.snapshot->(v#>>'{}'));
  end loop;
  if p_data ? 'replace' then
   update public.portal_request_assignment set state='revoked' where id=(p_data->>'replace')::uuid and request_id=r.id and state in ('invited','accepted');
   if not found then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  end if;
  mid:=gen_random_uuid();
  insert into public.portal_request_assignment(id,request_id,user_id,mode,scope,expires_at)
   values(mid,r.id,(p_data->>'userId')::uuid,p_data->>'mode',chosen,now()+interval '7 days');
  perform auth_dv.review_notify(r.id,'invitation:'||mid,'invitation','Invitación a un encargo',mid);
  result:=jsonb_build_object('id',mid,'state','invited');
 elsif p_action='consent_referral' then
  if not client or x.id is null or x.mode<>'referral' or x.state<>'invited' or x.expires_at<=now()
   or p_data->'approved' is distinct from 'true'::jsonb then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  update public.portal_request_assignment set consent_actor=actor.id,consent_at=now() where id=x.id;
  perform auth_dv.review_notify(r.id,'invitation:'||x.id,'invitation','Invitación a un encargo',x.id);
  result:=jsonb_build_object('consented',true);
 elsif p_action in ('accept','reject') then
  if x.state<>'invited' then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  update public.portal_request_assignment set state=case when p_action='accept' then 'accepted' else 'rejected' end where id=x.id;
  perform auth_dv.review_notify(r.id,'assignment:'||x.id||':'||p_action,'internal','Respuesta a invitación');
  result:=jsonb_build_object('state',case when p_action='accept' then 'accepted' else 'rejected' end);
 elsif p_action='revoke' then
  if not (staff or client and x.mode='referral') or x.id is null then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  update public.portal_request_assignment set state='revoked' where id=x.id;
  result:=jsonb_build_object('revoked',true);
 elsif p_action='retry_analysis' then
  if not staff then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  update public.portal_request_job set state='pending',error=null,lease=null,lease_until=null,attempts=0
   where request_id=r.id and state='failed';
  if not found then raise exception 'WORKFLOW_VERSION_CONFLICT' using errcode='PT409';end if;
  result:=jsonb_build_object('state','pending');
 else raise exception 'WORKFLOW_INVALID' using errcode='22023';end if;
 result:=jsonb_build_object('contract','portal-workflow-v1')||result;
 insert into public.portal_request_receipt(actor_id,key,command,result) values(actor.id,p_key,cmd,result);
 return result;
end $$;
revoke all on function public.portal_workflow_v1(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.portal_workflow_v1(text,uuid,uuid,jsonb) to authenticated;
revoke all on function auth_dv.review_scope_current(uuid,integer) from public,anon,authenticated;
revoke all on function auth_dv.review_can_submit(uuid,uuid) from public,anon,authenticated;
revoke all on function auth_dv.review_staff(uuid,uuid),auth_dv.review_client(uuid,uuid),auth_dv.review_assignment(uuid,uuid),auth_dv.review_notice_visible(public.portal_request_notice,uuid),auth_dv.review_notify(uuid,text,text,text,uuid) from public,anon,authenticated;
commit;
