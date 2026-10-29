-- Isolated candidate only. Availability never grants access to a request.
create table public.portal_recommendation (
 id uuid primary key, request_id uuid not null references public.portal_request(id),
 scope_version integer not null, user_id uuid not null references public.app_user(id),
 created_by uuid not null references public.app_user(id), revision integer not null default 1,
 brief text not null, due_on date not null, valid_until date not null,
 state text not null default 'asked' check(state in ('asked','available','alternate','declined','offered','withdrawn','confirmed')),
 note text not null default '', alternative_on date, profile_version integer, reason text,
 reviewed_by uuid references public.app_user(id), assignment_id uuid references public.portal_request_assignment(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(request_id,scope_version) references public.portal_request_scope(request_id,version)
);
create table public.portal_recommendation_preference (
 request_id uuid references public.portal_request(id), scope_version integer,
 mode text not null check(mode in ('candidate','team')), recommendation_id uuid references public.portal_recommendation(id),
 revision integer not null default 1, recommendation_revision integer, actor_id uuid not null references public.app_user(id), updated_at timestamptz not null default now(),
 primary key(request_id,scope_version), foreign key(request_id,scope_version) references public.portal_request_scope(request_id,version)
);
alter table public.portal_recommendation enable row level security;
alter table public.portal_recommendation_preference enable row level security;
revoke all on public.portal_recommendation,public.portal_recommendation_preference from public,anon,authenticated;

create function auth_dv.recommendation_live(n public.portal_recommendation) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
 select coalesce(n.state not in ('withdrawn','declined') and n.valid_until >= (now() at time zone 'America/Mexico_City')::date
 and auth_dv.review_scope_current(n.request_id,n.scope_version)
 and exists(select 1 from public.portal_request r where r.id=n.request_id and r.state<>'closed')
 and auth_dv.professional_active(n.user_id)
 and exists(select 1 from public.portal_collaborator_profile c where c.user_id=n.user_id and c.subscribed)
 and (n.state<>'confirmed' or exists(select 1 from public.portal_request_assignment a where a.id=n.assignment_id
   and a.state in ('invited','accepted') and a.expires_at>now())),false)
$$;
create function auth_dv.recommendation_profile_visible(rid uuid,u uuid,viewer uuid) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.portal_recommendation n join public.portal_professional_profile p on p.user_id=n.user_id
 join public.portal_request r on r.id=n.request_id where n.request_id=rid and n.user_id=u
 and auth_dv.recommendation_live(n) and n.profile_version=p.authorized_version and p.authorized is not null
 and ((auth_dv.review_staff(r.account_id,viewer) and n.state in ('available','offered','confirmed'))
 or (auth_dv.review_client(r.account_id,viewer) and n.state in ('offered','confirmed'))))
$$;
revoke all on function auth_dv.recommendation_live(public.portal_recommendation),auth_dv.recommendation_profile_visible(uuid,uuid,uuid) from public,anon,authenticated;

create function public.portal_recommendation_v1(p_action text,p_request uuid default null,p_id uuid default null,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.app_user; r public.portal_request; n public.portal_recommendation; p public.portal_professional_profile;
 s public.portal_request_scope; pref public.portal_recommendation_preference; target uuid; staff boolean:=false; client boolean:=false; publisher boolean:=false;
 today date:=(now() at time zone 'America/Mexico_City')::date; due date; valid date; alt date; result jsonb; items jsonb; users jsonb; assigned jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('portal-identity-v1',0));actor:=auth_dv.me();
 if actor.id is null then raise exception 'REC_FORBIDDEN' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'REC_INVALID' using errcode='22023';end if;
 if p_action='inbox' then
  if not auth_dv.professional_active(actor.id) then raise exception 'REC_FORBIDDEN' using errcode='42501';end if;
  select coalesce(jsonb_agg(x.body order by x.created_at desc,x.id),'[]') into items from (
   select q.id,q.created_at,jsonb_build_object('id',q.id,'requestId',q.request_id,'revision',q.revision,'brief',q.brief,'dueOn',q.due_on,
    'validUntil',q.valid_until,'state',q.state,'note',q.note,'alternativeOn',q.alternative_on,'live',auth_dv.recommendation_live(q),
    'profileVersion',q.profile_version) body from public.portal_recommendation q where q.user_id=actor.id order by q.created_at desc,q.id limit 50) x;
  select * into p from public.portal_professional_profile where user_id=actor.id;
  return jsonb_build_object('contract','portal-recommendation-v1','items',items,'authorizedVersion',p.authorized_version);
 end if;
 select * into r from public.portal_request where id=p_request for update;
 if r.id is null then raise exception 'REC_FORBIDDEN' using errcode='42501';end if;
 staff:=coalesce(auth_dv.review_staff(r.account_id,actor.id),false);client:=coalesce(auth_dv.review_client(r.account_id,actor.id),false);
 publisher:=staff and exists(select 1 from public.portal_review_grant g where g.account_id=r.account_id and g.user_id=actor.id and g.active and g.can_publish);
 select * into s from public.portal_request_scope where request_id=r.id order by version desc limit 1;
 select * into pref from public.portal_recommendation_preference where request_id=r.id and scope_version=s.version;
 if p_id is not null then select * into n from public.portal_recommendation where id=p_id and request_id=r.id for update;end if;
 if p_action='list' then
  if not(staff or client) then raise exception 'REC_FORBIDDEN' using errcode='42501';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'userId',q.user_id,'name',u.name,'revision',q.revision,'brief',q.brief,
   'dueOn',q.due_on,'validUntil',q.valid_until,'state',q.state,'note',case when staff then q.note end,'alternativeOn',q.alternative_on,
   'reason',q.reason,'live',auth_dv.recommendation_live(q),'profileVersion',q.profile_version,
   'profile',case when auth_dv.recommendation_profile_visible(r.id,q.user_id,actor.id) and q.profile_version=pp.authorized_version then pp.authorized end,
   'assignmentId',q.assignment_id) order by q.created_at desc,q.id),'[]') into items
  from public.portal_recommendation q join public.app_user u on u.id=q.user_id left join public.portal_professional_profile pp on pp.user_id=q.user_id
  where q.request_id=r.id and (staff or (q.state in ('offered','confirmed') and auth_dv.recommendation_live(q)
   and q.profile_version=pp.authorized_version and pp.authorized is not null));
  if publisher then select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name,u.id),'[]') into users
   from public.app_user u join public.portal_collaborator_profile c on c.user_id=u.id
   where c.subscribed and u.role='analista' and auth_dv.professional_active(u.id);end if;
  return jsonb_build_object('contract','portal-recommendation-v1','items',items,'canManage',publisher,'client',client,
   'candidates',coalesce(users,'[]'),'scopeVersion',s.version,'ready',coalesce(auth_dv.review_scope_current(r.id,s.version),false) and r.state<>'closed',
   'requestRevision',r.revision,'deliveryOn',s.delivery_on,'preference',case when pref.request_id is not null then jsonb_build_object('mode',pref.mode,'id',pref.recommendation_id,'revision',pref.revision,
   'fulfilled',exists(select 1 from public.portal_recommendation q join public.portal_request_assignment a on a.id=q.assignment_id where q.request_id=r.id and q.scope_version=s.version and q.state='confirmed' and a.state in ('invited','accepted') and a.expires_at>now() and (pref.mode='team' or q.id=pref.recommendation_id)),
   'valid',pref.mode='team' or exists(select 1 from public.portal_recommendation q where q.id=pref.recommendation_id and q.scope_version=s.version and q.revision=pref.recommendation_revision and q.state='offered' and auth_dv.recommendation_live(q) and auth_dv.recommendation_profile_visible(r.id,q.user_id,actor.id))) end);
 end if;
 if p_action in ('ask','offer','withdraw','confirm') and not publisher then raise exception 'REC_FORBIDDEN' using errcode='42501';end if;
 if p_action='prefer' and not client then raise exception 'REC_FORBIDDEN' using errcode='42501';end if;
 if p_action='reply' and (n.id is null or n.user_id<>actor.id or not auth_dv.professional_active(actor.id)) then raise exception 'REC_FORBIDDEN' using errcode='42501';end if;
 if p_action not in ('ask','offer','withdraw','confirm','prefer','reply') then raise exception 'REC_INVALID' using errcode='22023';end if;
 if r.state='closed' or not coalesce(auth_dv.review_scope_current(r.id,s.version),false) then raise exception 'REC_STALE' using errcode='PT409';end if;
 if p_action='ask' then
  if p_id is null or p_data->>'scopeVersion' is distinct from s.version::text or jsonb_typeof(p_data->'brief') is distinct from 'string'
   or length(btrim(p_data->>'brief')) not between 1 and 2000 or p_data->'approved' is distinct from 'true'::jsonb then raise exception 'REC_INVALID' using errcode='22023';end if;
  begin target:=(p_data->>'userId')::uuid;due:=(p_data->>'dueOn')::date;valid:=(p_data->>'validUntil')::date;
   exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'REC_INVALID' using errcode='22023';end;
  if target is null or due is null or valid is null or due<today or due>s.delivery_on or valid<today or valid>due or valid>today+14 then raise exception 'REC_INVALID' using errcode='22023';end if;
  if not exists(select 1 from public.portal_collaborator_profile c join public.app_user u on u.id=c.user_id where u.id=target and c.subscribed and u.role='analista' and auth_dv.professional_active(u.id)) then raise exception 'REC_FORBIDDEN' using errcode='42501';end if;
  if n.id is not null then
   if n.created_by<>actor.id or n.scope_version<>s.version or n.user_id<>target or n.brief<>btrim(p_data->>'brief') or n.due_on<>due or n.valid_until<>valid then raise exception 'REC_STALE' using errcode='PT409';end if;
   return jsonb_build_object('contract','portal-recommendation-v1','saved',true,'id',n.id);
  end if;
  if exists(select 1 from public.portal_recommendation q where q.request_id=r.id and q.user_id=target and q.scope_version=s.version and auth_dv.recommendation_live(q)) then raise exception 'REC_DUPLICATE' using errcode='PT409';end if;
  insert into public.portal_recommendation(id,request_id,scope_version,user_id,created_by,brief,due_on,valid_until)
   values(p_id,r.id,s.version,target,actor.id,btrim(p_data->>'brief'),due,valid);
 elsif p_action='prefer' then
  if p_data->>'scopeVersion' is distinct from s.version::text or p_data->>'revision' is distinct from coalesce(pref.revision,0)::text or p_data->>'mode' not in ('candidate','team') or p_data->>'mode' is null then raise exception 'REC_STALE' using errcode='PT409';end if;
  if exists(select 1 from public.portal_recommendation q where q.request_id=r.id and q.scope_version=s.version and q.state='confirmed' and auth_dv.recommendation_live(q)) then raise exception 'REC_STALE' using errcode='PT409';end if;
  if p_data->>'mode'='candidate' and (n.id is null or n.scope_version<>s.version or not auth_dv.recommendation_live(n) or n.state<>'offered' or not auth_dv.recommendation_profile_visible(r.id,n.user_id,actor.id)) then raise exception 'REC_FORBIDDEN' using errcode='42501';end if;
  if p_data->>'mode'='candidate' and p_data->>'recommendationRevision' is distinct from n.revision::text then raise exception 'REC_STALE' using errcode='PT409';end if;
  insert into public.portal_recommendation_preference(request_id,scope_version,mode,recommendation_id,recommendation_revision,actor_id) values(r.id,s.version,p_data->>'mode',case when p_data->>'mode'='candidate' then n.id end,case when p_data->>'mode'='candidate' then n.revision end,actor.id)
   on conflict(request_id,scope_version) do update set mode=excluded.mode,recommendation_id=excluded.recommendation_id,recommendation_revision=excluded.recommendation_revision,actor_id=excluded.actor_id,revision=portal_recommendation_preference.revision+1,updated_at=now();
 else
  if n.id is null then raise exception 'REC_FORBIDDEN' using errcode='42501';end if;
  if n.scope_version<>s.version or p_data->>'revision' is distinct from n.revision::text then raise exception 'REC_STALE' using errcode='PT409';end if;
  if p_action='withdraw' then update public.portal_recommendation set state='withdrawn',revision=revision+1,updated_at=now() where id=n.id;
  else
   if not auth_dv.recommendation_live(n) then raise exception 'REC_STALE' using errcode='PT409';end if;
   if p_action='reply' then
    if n.state='confirmed' or p_data->>'response' not in ('available','alternate','declined') or p_data->>'response' is null or length(coalesce(p_data->>'note',''))>1000 then raise exception 'REC_INVALID' using errcode='22023';end if;
    select * into p from public.portal_professional_profile where user_id=actor.id;
    if p_data->>'response'='available' and (p.authorized is null or p_data->>'profileVersion' is distinct from p.authorized_version::text or p_data->>'consent' is distinct from 'request-profile-v1') then raise exception 'REC_CONSENT' using errcode='22023';end if;
    if p_data->>'response'='alternate' then
     begin alt:=(p_data->>'alternativeOn')::date;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'REC_INVALID' using errcode='22023';end;
     if alt is null or alt<today or alt>today+90 then raise exception 'REC_INVALID' using errcode='22023';end if;
    end if;
    update public.portal_recommendation set state=p_data->>'response',note=coalesce(p_data->>'note',''),alternative_on=alt,
     profile_version=case when p_data->>'response'='available' then p.authorized_version end,reviewed_by=null,reason=null,revision=revision+1,updated_at=now() where id=n.id;
   elsif p_action='offer' then
    if n.state<>'available' or not auth_dv.recommendation_profile_visible(r.id,n.user_id,actor.id)
     or p_data->>'profileVersion' is distinct from n.profile_version::text or p_data->'reviewed' is distinct from 'true'::jsonb
     or jsonb_typeof(p_data->'reason') is distinct from 'string' or length(btrim(p_data->>'reason')) not between 1 and 1000 then raise exception 'REC_CONSENT' using errcode='22023';end if;
    if (select count(*) from public.portal_recommendation q where q.request_id=r.id and q.state='offered' and auth_dv.recommendation_live(q))>=3 then raise exception 'REC_LIMIT' using errcode='22023';end if;
    update public.portal_recommendation set state='offered',reason=btrim(p_data->>'reason'),reviewed_by=actor.id,revision=revision+1,updated_at=now() where id=n.id;
   elsif p_action='confirm' then
    if n.state='confirmed' then return jsonb_build_object('contract','portal-recommendation-v1','saved',true,'assignmentId',n.assignment_id);end if;
    if n.state<>'offered' or not auth_dv.recommendation_profile_visible(r.id,n.user_id,actor.id) or pref.request_id is null
     or (pref.mode='candidate' and (pref.recommendation_id<>n.id or pref.recommendation_revision is distinct from n.revision)) or p_data->>'preferenceRevision' is distinct from pref.revision::text
     or p_data->'confirmed' is distinct from 'true'::jsonb or p_data->>'requestRevision' is distinct from r.revision::text then raise exception 'REC_STALE' using errcode='PT409';end if;
    assigned:=public.portal_workflow_v1('work_assign',r.id,n.id,jsonb_build_object('revision',r.revision,'scopeVersion',n.scope_version,
      'userId',n.user_id,'brief',n.brief,'dueOn',n.due_on,'keys','[]'::jsonb));
    update public.portal_recommendation set state='confirmed',assignment_id=(assigned->>'id')::uuid,revision=revision+1,updated_at=now() where id=n.id;
   end if;
  end if;
 end if;
 return jsonb_build_object('contract','portal-recommendation-v1','saved',true,'id',p_id,'assignmentId',assigned->>'id');
end $$;
revoke all on function public.portal_recommendation_v1(text,uuid,uuid,jsonb) from public,anon;
grant execute on function public.portal_recommendation_v1(text,uuid,uuid,jsonb) to authenticated;
