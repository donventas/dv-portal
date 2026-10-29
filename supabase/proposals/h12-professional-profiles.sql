-- Local isolated candidate only. Separate from private client deliveries.
create table public.portal_professional_profile (
 user_id uuid primary key references public.app_user(id), revision integer not null default 0,
 draft jsonb not null default '{}', private_data jsonb not null default '{}',
 authorized jsonb, authorized_version integer, authorized_at timestamptz
);
create table public.portal_portfolio_file (
 id uuid primary key, user_id uuid not null references public.app_user(id), name text not null,
 mime text not null, content bytea not null check(octet_length(content) between 1 and 4194304), sha256 text not null
);
create table public.portal_profile_share (
 request_id uuid references public.portal_request(id), user_id uuid references public.app_user(id),
 version integer not null, reviewer uuid not null references public.app_user(id), reviewed_at timestamptz not null default now(),
 primary key(request_id,user_id)
);
alter table public.portal_professional_profile enable row level security;
alter table public.portal_portfolio_file enable row level security;
alter table public.portal_profile_share enable row level security;
revoke all on public.portal_professional_profile,public.portal_portfolio_file,public.portal_profile_share from public,anon,authenticated;

create function auth_dv.professional_active(u uuid) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
 select exists(select 1 from public.app_user p where p.id=u and not p.pending and p.role in ('analista','admin')
 and auth_dv.portal_verified_identity(u) and (exists(select 1 from public.portal_collaborator_profile c where c.user_id=u and c.subscribed)
 or exists(select 1 from public.portal_review_grant g where g.user_id=u and auth_dv.review_staff(g.account_id,u))))
$$;
create function auth_dv.professional_participant(rid uuid,u uuid) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
 select auth_dv.professional_active(u) and exists(select 1 from public.portal_request r where r.id=rid and
 ((r.responsible=u and auth_dv.review_staff(r.account_id,u)) or exists(select 1 from public.portal_request_assignment a
 where a.request_id=rid and a.user_id=u and auth_dv.review_assignment(a.id,u))))
$$;
revoke all on function auth_dv.professional_active(uuid),auth_dv.professional_participant(uuid,uuid) from public,anon,authenticated;

create function public.portal_professional_v1(p_action text,p_request uuid default null,p_user uuid default null,p_key uuid default null,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.app_user; p public.portal_professional_profile; r public.portal_request; staff boolean:=false; client boolean:=false;
 target uuid; item jsonb; picture jsonb; k text; bytes bytea; f public.portal_portfolio_file; digest_hex text; result jsonb; role_name text;
begin
 perform pg_advisory_xact_lock(hashtextextended('portal-identity-v1',0));
 actor:=auth_dv.me(); target:=coalesce(p_user,actor.id);
 if actor.id is null then raise exception 'PROFILE_FORBIDDEN' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>5700000 then raise exception 'PROFILE_INVALID' using errcode='22023';end if;
 if p_request is not null then
  select * into r from public.portal_request where id=p_request for update;
  staff:=coalesce(auth_dv.review_staff(r.account_id,actor.id),false);client:=coalesce(auth_dv.review_client(r.account_id,actor.id),false);
  if not (staff or client) then raise exception 'PROFILE_FORBIDDEN' using errcode='42501';end if;
 end if;
 if p_action='list' then
  if r.id is null then raise exception 'PROFILE_FORBIDDEN' using errcode='42501';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.user_id,'version',q.authorized_version,'profile',q.authorized,
   'role',case when q.user_id=r.responsible then 'Responsable de Don Ventas' else 'Colaborador del encargo' end,
   'shared',exists(select 1 from public.portal_profile_share s where s.request_id=r.id and s.user_id=q.user_id and s.version=q.authorized_version)) order by q.user_id),'[]') into result
  from public.portal_professional_profile q where q.authorized is not null and auth_dv.professional_participant(r.id,q.user_id)
   and (staff or exists(select 1 from public.portal_profile_share s where s.request_id=r.id and s.user_id=q.user_id and s.version=q.authorized_version));
  return jsonb_build_object('contract','portal-professional-v1','items',result,'canShare',staff and exists(select 1 from public.portal_review_grant g where g.account_id=r.account_id and g.user_id=actor.id and g.active and g.can_publish));
 end if;
 if p_action in ('share','unshare') then
  if not staff or not exists(select 1 from public.portal_review_grant g where g.account_id=r.account_id and g.user_id=actor.id and g.active and g.can_publish) then raise exception 'PROFILE_FORBIDDEN' using errcode='42501';end if;
  if p_action='unshare' then delete from public.portal_profile_share where request_id=r.id and user_id=target;
  else
   select * into p from public.portal_professional_profile where user_id=target for update;
   if not auth_dv.professional_participant(r.id,target) then raise exception 'PROFILE_FORBIDDEN' using errcode='42501';end if;
   if p.authorized is null or p.authorized_version is distinct from (p_data->>'version')::integer or p_data->>'reviewed' is distinct from 'true' then raise exception 'PROFILE_VERSION' using errcode='PT409';end if;
   insert into public.portal_profile_share(request_id,user_id,version,reviewer) values(r.id,target,p.authorized_version,actor.id)
    on conflict(request_id,user_id) do update set version=excluded.version,reviewer=excluded.reviewer,reviewed_at=now();
  end if;
  return jsonb_build_object('contract','portal-professional-v1','saved',true);
 end if;
 if p_action in ('download','preview') then
  select * into p from public.portal_professional_profile where user_id=target;
  if target=actor.id and p_request is null then
   if not auth_dv.professional_active(actor.id) then raise exception 'PROFILE_FORBIDDEN' using errcode='42501';end if;
  elsif r.id is null or not (auth_dv.professional_participant(r.id,target) or auth_dv.recommendation_profile_visible(r.id,target,actor.id)) or p.authorized is null
   or not (coalesce(p.authorized->>'photoId' = p_key::text,false)
    or exists(select 1 from jsonb_array_elements(p.authorized->'projects') x where x->>'fileId'=p_key::text
     or exists(select 1 from jsonb_array_elements(coalesce(x->'gallery','[]')) g where g->>'fileId'=p_key::text)))
   or not ((auth_dv.professional_participant(r.id,target) and (staff or (client and exists(select 1 from public.portal_profile_share s where s.request_id=r.id and s.user_id=target and s.version=p.authorized_version)))) or auth_dv.recommendation_profile_visible(r.id,target,actor.id)) then
   raise exception 'PROFILE_FORBIDDEN' using errcode='42501';
  end if;
  select * into f from public.portal_portfolio_file where id=p_key and user_id=target;
  if f.id is null then raise exception 'PROFILE_FORBIDDEN' using errcode='42501';end if;
  if p_action='preview' then perform auth_dv.portfolio_image_size(f.content,f.mime);end if;
  return jsonb_build_object('contract','portal-professional-v1','name',f.name,'mime',f.mime,'sha256',f.sha256,'base64',encode(f.content,'base64'));
 end if;
 if target<>actor.id or p_request is not null or not auth_dv.professional_active(actor.id) then raise exception 'PROFILE_FORBIDDEN' using errcode='42501';end if;
 insert into public.portal_professional_profile(user_id) values(actor.id) on conflict do nothing;
 select * into p from public.portal_professional_profile where user_id=actor.id for update;
 if p_action='own' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'mime',mime) order by name,id),'[]') into result from public.portal_portfolio_file where user_id=actor.id;
  return jsonb_build_object('contract','portal-professional-v1','revision',p.revision,'draft',p.draft,'private',p.private_data,'authorized',p.authorized,'authorizedVersion',p.authorized_version,'files',result);
 elsif p_action='upload' then
  if p_key is null or exists(select 1 from jsonb_object_keys(p_data) x(v) where v not in ('name','mime','base64')) or
   jsonb_typeof(p_data->'name') is distinct from 'string' or length(p_data->>'name') not between 1 and 120 or
   (p_data->>'name') !~ '^[a-zA-Z0-9][a-zA-Z0-9 _().-]*\.(pdf|png|jpg|jpeg)$' or
   jsonb_typeof(p_data->'base64') is distinct from 'string' or length(p_data->>'base64') not between 4 and 5592408 or
   (p_data->>'base64') !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'PROFILE_FILE_INVALID' using errcode='22023';end if;
  begin bytes:=decode(p_data->>'base64','base64');exception when invalid_parameter_value or invalid_text_representation then raise exception 'PROFILE_FILE_INVALID' using errcode='22023';end;
  if octet_length(bytes) not between 1 and 4194304 or replace(encode(bytes,'base64'),E'\n','')<>p_data->>'base64' then raise exception 'PROFILE_FILE_INVALID' using errcode='22023';end if;
  if not coalesce((p_data->>'mime'='application/pdf' and p_data->>'name' ~ '\.pdf$' and substring(bytes from 1 for 5)=decode('255044462d','hex')) or
   (p_data->>'mime'='image/png' and p_data->>'name' ~ '\.png$' and substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex')) or
   (p_data->>'mime'='image/jpeg' and p_data->>'name' ~ '\.(jpg|jpeg)$' and substring(bytes from 1 for 3)=decode('ffd8ff','hex')),false) then raise exception 'PROFILE_FILE_INVALID' using errcode='22023';end if;
  digest_hex:=encode(sha256(bytes),'hex');select * into f from public.portal_portfolio_file where id=p_key;
  if f.id is not null then
   if f.user_id<>actor.id or f.name<>p_data->>'name' or f.mime<>p_data->>'mime' or f.sha256<>digest_hex then raise exception 'PROFILE_VERSION' using errcode='PT409';end if;
  else
   if (select count(*) from public.portal_portfolio_file where user_id=actor.id)>=12 then raise exception 'PROFILE_FILE_QUOTA' using errcode='22023';end if;
   insert into public.portal_portfolio_file values(p_key,actor.id,p_data->>'name',p_data->>'mime',bytes,digest_hex);
  end if;
  return jsonb_build_object('contract','portal-professional-v1','id',p_key);
 elsif p_action in ('save','authorize','withdraw') then
  if p.revision is distinct from (p_data->>'revision')::integer then raise exception 'PROFILE_VERSION' using errcode='PT409';end if;
  if p_action='save' then
   if jsonb_typeof(p_data->'draft') is distinct from 'object' or jsonb_typeof(p_data->'private') is distinct from 'object' or octet_length(p_data::text)>24000 then raise exception 'PROFILE_INVALID' using errcode='22023';end if;
   for k,item in select key,value from jsonb_each(p_data->'draft') loop
    if k not in ('name','intro','specialties','skills','tools','passions','brands','explore','projects','photoId') then raise exception 'PROFILE_INVALID' using errcode='22023';end if;
    if k<>'projects' and (jsonb_typeof(item)<>'string' or length(item#>>'{}')>1200) then raise exception 'PROFILE_INVALID' using errcode='22023';end if;
   end loop;
   if jsonb_typeof(p_data->'draft'->'projects') is distinct from 'array' or jsonb_array_length(p_data->'draft'->'projects')>6 then raise exception 'PROFILE_INVALID' using errcode='22023';end if;
   if coalesce(p_data->'draft'->>'photoId','')<>'' then
    select * into f from public.portal_portfolio_file where id::text=p_data->'draft'->>'photoId' and user_id=actor.id;
    if f.id is null then raise exception 'PROFILE_FORBIDDEN' using errcode='42501';end if;
    perform auth_dv.portfolio_image_size(f.content,f.mime);
   end if;
   for item in select value from jsonb_array_elements(p_data->'draft'->'projects') loop
    if jsonb_typeof(item)<>'object' then raise exception 'PROFILE_INVALID' using errcode='22023';end if;
    for k in select key from jsonb_each(item) loop
     if k not in ('title','problem','contribution','result','fileId','gallery') or (k<>'gallery' and (jsonb_typeof(item->k)<>'string' or length(item->>k)>1200)) then raise exception 'PROFILE_INVALID' using errcode='22023';end if;
    end loop;
    if item ? 'gallery' then
     if jsonb_typeof(item->'gallery')<>'array' or jsonb_array_length(item->'gallery')>4 then raise exception 'PROFILE_INVALID' using errcode='22023';end if;
     if (select count(distinct x->>'fileId') from jsonb_array_elements(item->'gallery') x)<>jsonb_array_length(item->'gallery') then raise exception 'PROFILE_INVALID' using errcode='22023';end if;
     for picture in select value from jsonb_array_elements(item->'gallery') loop
      if jsonb_typeof(picture)<>'object' or jsonb_typeof(picture->'fileId') is distinct from 'string' or jsonb_typeof(picture->'caption') is distinct from 'string'
       or length(picture->>'caption')>300 or exists(select 1 from jsonb_object_keys(picture) x(v) where v not in ('fileId','caption')) then raise exception 'PROFILE_INVALID' using errcode='22023';end if;
      select * into f from public.portal_portfolio_file where id::text=picture->>'fileId' and user_id=actor.id;
      if f.id is null then raise exception 'PROFILE_FORBIDDEN' using errcode='42501';end if;
      perform auth_dv.portfolio_image_size(f.content,f.mime);
     end loop;
    end if;
    if coalesce(item->>'fileId','')<>'' and not exists(select 1 from public.portal_portfolio_file where id::text=item->>'fileId' and user_id=actor.id) then raise exception 'PROFILE_FORBIDDEN' using errcode='42501';end if;
   end loop;
   for k,item in select key,value from jsonb_each(p_data->'private') loop
    if k not in ('contact','availability','timezone') or jsonb_typeof(item)<>'string' or length(item#>>'{}')>1200 then raise exception 'PROFILE_INVALID' using errcode='22023';end if;
   end loop;
   update public.portal_professional_profile set draft=p_data->'draft',private_data=p_data->'private',revision=revision+1 where user_id=actor.id;
  elsif p_action='authorize' then
   if p_data->>'consent' is distinct from 'portfolio-rights-v1' or length(trim(coalesce(p.draft->>'name','')))=0 or length(trim(coalesce(p.draft->>'intro','')))=0
    or exists(select 1 from jsonb_array_elements(p.draft->'projects') x where length(trim(coalesce(x->>'title','')))=0 or length(trim(coalesce(x->>'contribution','')))=0) then raise exception 'PROFILE_CONSENT' using errcode='22023';end if;
   update public.portal_professional_profile set authorized=draft,authorized_version=revision+1,authorized_at=now(),revision=revision+1 where user_id=actor.id;
  else
   update public.portal_professional_profile set authorized=null,authorized_version=null,authorized_at=null,revision=revision+1 where user_id=actor.id;
  end if;
  return jsonb_build_object('contract','portal-professional-v1','saved',true,'revision',p.revision+1);
 end if;
 raise exception 'PROFILE_INVALID' using errcode='22023';
end $$;
revoke all on function public.portal_professional_v1(text,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.portal_professional_v1(text,uuid,uuid,uuid,jsonb) to authenticated;
