-- Authorized isolated candidate only. Apply after H10 + identity, once to a fresh copy.
begin;
-- Immutable private attachments. Removing from a draft detaches its reference;
-- saved revisions retain the exact bytes. No public Storage bucket or URL.
create table public.portal_brand_asset (
 id uuid primary key, account_id uuid not null references public.account(id),
 actor_id uuid not null references public.app_user(id), kind text not null,
 name text not null, mime text not null, content bytea not null,
 created_at timestamptz not null default now()
);
alter table public.portal_brand_asset enable row level security;
revoke all on public.portal_brand_asset from public,anon,authenticated;
create table public.portal_brand_draft (
 account_id uuid primary key references public.account(id),
 version integer not null check(version>0),
 document jsonb not null,
 updated_at timestamptz not null default now()
);
create table public.portal_brand_draft_revision (
 account_id uuid not null references public.account(id),
 version integer not null check(version>0),
 actor_id uuid not null references public.app_user(id),
 operation_key uuid not null,
 document jsonb not null,
 created_at timestamptz not null default now(),
 primary key(account_id,version), unique(actor_id,operation_key)
);
alter table public.portal_brand_draft enable row level security;
alter table public.portal_brand_draft_revision enable row level security;
revoke all on public.portal_brand_draft,public.portal_brand_draft_revision from public,anon,authenticated;

create function auth_dv.portal_draft_owner() returns public.app_user
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.app_user;
begin
 -- Same lock as the identity contract: revocation and draft operations serialize.
 perform pg_advisory_xact_lock(hashtextextended('portal-identity-v1',0));
 select * into actor from public.app_user where id=auth.uid() for share;
 if actor.id is null or actor.role is distinct from 'cliente' or actor.member_role is distinct from 'owner'
  or actor.account_id is null or not auth_dv.portal_actor_active() then
  raise exception 'DRAFT_FORBIDDEN' using errcode='42501';
 end if;
 perform 1 from public.account where id=actor.account_id and status='activo' for share;
 if not found then raise exception 'DRAFT_FORBIDDEN' using errcode='42501'; end if;
 return actor;
end $$;
revoke all on function auth_dv.portal_draft_owner() from public,anon,authenticated;

create function public.portal_draft_open_v1() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.app_user; draft public.portal_brand_draft;
begin
 actor:=auth_dv.portal_draft_owner();
 select * into draft from public.portal_brand_draft where account_id=actor.account_id;
 return jsonb_build_object('contract','portal-draft-v1','accountId',actor.account_id,
  'actor',jsonb_build_object('id',actor.id,'account_id',actor.account_id,'name',actor.name,'email',actor.email,'role',actor.role,'member_role',actor.member_role,'pending',actor.pending),
  'account',(select jsonb_build_object('id',id,'name',name,'status',status) from public.account where id=actor.account_id),
  'version',coalesce(draft.version,0),'document',draft.document,'savedAt',draft.updated_at,
  'assets',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'mime',mime,'kind',kind,'size',octet_length(content))),'[]'::jsonb) from public.portal_brand_asset where account_id=actor.account_id));
end $$;

create function public.portal_draft_save_v1(p_key uuid,p_expected integer,p_document jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.app_user; previous public.portal_brand_draft_revision; current_version integer;
 saved_at timestamptz; entry record; rule jsonb;
 rules constant jsonb := '{"name":{"type":"string","max":500},"offer":{"type":"string","max":500},"audience":{"type":"string","max":500},"objective":{"type":"string","max":500},"channels":{"type":"string","max":2000},"tone":{"type":"string","max":2000},"restrictions":{"type":"string","max":2000},"welcome_skipped":{"type":"boolean"},"welcome_section":{"type":"string","values":["negocio","objetivo","clientes","identidad","profundizar"]},"brand_status":{"type":"string","values":["","ready","organize","none"]},"brand_primary":{"type":"string","max":100},"brand_secondary":{"type":"string","max":100},"brand_background":{"type":"string","max":100},"brand_fonts":{"type":"string","max":500},"brand_context":{"type":"string","max":2000},"brand_logo":{"type":"string","max":36},"brand_logo_light":{"type":"string","max":36},"brand_logo_dark":{"type":"string","max":36},"brand_manual":{"type":"string","max":36},"q_needs_launch":{"type":"boolean"},"qnote_needs_launch":{"type":"string","max":1500},"q_needs_align":{"type":"boolean"},"qnote_needs_align":{"type":"string","max":1500},"q_needs_connect":{"type":"boolean"},"qnote_needs_connect":{"type":"string","max":1500},"q_needs_integrate":{"type":"boolean"},"qnote_needs_integrate":{"type":"string","max":1500},"q_needs_delegate":{"type":"boolean"},"qnote_needs_delegate":{"type":"string","max":1500},"q_needs_evolve":{"type":"boolean"},"qnote_needs_evolve":{"type":"string","max":1500},"q_needs_other":{"type":"boolean"},"qnote_needs_other":{"type":"string","max":1500},"q_needs_unknown":{"type":"boolean"},"qnote_needs_unknown":{"type":"string","max":1500},"q_offerTypes_product":{"type":"boolean"},"qnote_offerTypes_product":{"type":"string","max":1500},"q_offerTypes_service":{"type":"boolean"},"qnote_offerTypes_service":{"type":"string","max":1500},"q_offerTypes_experience":{"type":"boolean"},"qnote_offerTypes_experience":{"type":"string","max":1500},"q_offerTypes_digital":{"type":"boolean"},"qnote_offerTypes_digital":{"type":"string","max":1500},"q_offerTypes_other":{"type":"boolean"},"qnote_offerTypes_other":{"type":"string","max":1500},"q_offerTypes_unknown":{"type":"boolean"},"qnote_offerTypes_unknown":{"type":"string","max":1500},"q_audiences_people":{"type":"boolean"},"qnote_audiences_people":{"type":"string","max":1500},"q_audiences_business":{"type":"boolean"},"qnote_audiences_business":{"type":"string","max":1500},"q_audiences_community":{"type":"boolean"},"qnote_audiences_community":{"type":"string","max":1500},"q_audiences_current":{"type":"boolean"},"qnote_audiences_current":{"type":"string","max":1500},"q_audiences_other":{"type":"boolean"},"qnote_audiences_other":{"type":"string","max":1500},"q_audiences_unknown":{"type":"boolean"},"qnote_audiences_unknown":{"type":"string","max":1500},"q_channels_web":{"type":"boolean"},"qnote_channels_web":{"type":"string","max":1500},"q_channels_social":{"type":"boolean"},"qnote_channels_social":{"type":"string","max":1500},"q_channels_direct":{"type":"boolean"},"qnote_channels_direct":{"type":"string","max":1500},"q_channels_physical":{"type":"boolean"},"qnote_channels_physical":{"type":"string","max":1500},"q_channels_other":{"type":"boolean"},"qnote_channels_other":{"type":"string","max":1500},"q_channels_unknown":{"type":"boolean"},"qnote_channels_unknown":{"type":"string","max":1500},"it_situation":{"type":"string","max":1500},"is_situation":{"type":"string","max":300},"ib_situation":{"type":"string","values":["hypothesis","observed","pending"]},"it_language":{"type":"string","max":1500},"is_language":{"type":"string","max":300},"ib_language":{"type":"string","values":["hypothesis","observed","pending"]},"it_feeling":{"type":"string","max":1500},"is_feeling":{"type":"string","max":300},"ib_feeling":{"type":"string","values":["hypothesis","observed","pending"]},"it_attention":{"type":"string","max":1500},"is_attention":{"type":"string","max":300},"ib_attention":{"type":"string","values":["hypothesis","observed","pending"]},"it_friction":{"type":"string","max":1500},"is_friction":{"type":"string","max":300},"ib_friction":{"type":"string","values":["hypothesis","observed","pending"]},"it_purpose":{"type":"string","max":1500},"is_purpose":{"type":"string","max":300},"ib_purpose":{"type":"string","values":["hypothesis","observed","pending"]},"it_difference":{"type":"string","max":1500},"is_difference":{"type":"string","max":300},"ib_difference":{"type":"string","values":["hypothesis","observed","pending"]},"it_proof":{"type":"string","max":1500},"is_proof":{"type":"string","max":300},"ib_proof":{"type":"string","values":["hypothesis","observed","pending"]},"it_success":{"type":"string","max":1500},"is_success":{"type":"string","max":300},"ib_success":{"type":"string","values":["hypothesis","observed","pending"]}}'::jsonb;
begin
 actor:=auth_dv.portal_draft_owner();
 if p_key is null or p_expected is null or p_expected<0 or p_expected>=2147483647
  or p_document is null or jsonb_typeof(p_document)<>'object' or octet_length(p_document::text)>100000
  or (p_document->'schema') is distinct from '1'::jsonb
  or coalesce(p_document->>'stage','') not in ('marca','identidad','contexto','panel')
  or jsonb_typeof(p_document->'fields') is distinct from 'object'
  or p_document-'schema'-'stage'-'fields'<>'{}'::jsonb then
  raise exception 'DRAFT_INVALID' using errcode='22023';
 end if;
 for entry in select * from jsonb_each(p_document->'fields') loop
  rule:=rules->entry.key;
  if rule is null or jsonb_typeof(entry.value) is distinct from (rule->>'type')
   or (rule ? 'max' and length(entry.value#>>'{}')>(rule->>'max')::integer)
   or (rule ? 'values' and not (rule->'values' @> jsonb_build_array(entry.value))) then
   raise exception 'DRAFT_INVALID' using errcode='22023';
  end if;
  if entry.key in ('brand_logo','brand_logo_light','brand_logo_dark','brand_manual') and entry.value#>>'{}'<>'' then
   perform 1 from public.portal_brand_asset where id::text=entry.value#>>'{}' and account_id=actor.account_id
    and kind=case when entry.key='brand_manual' then 'manual' else 'logo' end;
   if not found then raise exception 'DRAFT_INVALID' using errcode='22023'; end if;
  end if;
 end loop;
 select * into previous from public.portal_brand_draft_revision where actor_id=actor.id and operation_key=p_key;
 if found then
  if previous.account_id<>actor.account_id or previous.version<>p_expected+1 or previous.document<>p_document then
   raise exception 'DRAFT_KEY_CONFLICT' using errcode='PT409';
  end if;
  return jsonb_build_object('contract','portal-draft-v1','accountId',actor.account_id,'version',previous.version,'operationKey',p_key,'savedAt',previous.created_at);
 end if;
 select version into current_version from public.portal_brand_draft where account_id=actor.account_id for update;
 if coalesce(current_version,0)<>p_expected then raise exception 'DRAFT_CONFLICT' using errcode='PT409'; end if;
 saved_at:=clock_timestamp();
 insert into public.portal_brand_draft(account_id,version,document,updated_at)
 values(actor.account_id,p_expected+1,p_document,saved_at)
 on conflict(account_id) do update set version=excluded.version,document=excluded.document,updated_at=excluded.updated_at;
 insert into public.portal_brand_draft_revision(account_id,version,actor_id,operation_key,document,created_at)
 values(actor.account_id,p_expected+1,actor.id,p_key,p_document,saved_at);
 return jsonb_build_object('contract','portal-draft-v1','accountId',actor.account_id,'version',p_expected+1,'operationKey',p_key,'savedAt',saved_at);
end $$;

-- Immutable versions and a fixed upper bound keep pagination stable during writes.
create function public.portal_draft_history_v1(p_after integer default 0,p_snapshot integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.app_user; ceiling integer; bound integer; rows jsonb; last_version integer;
begin
 actor:=auth_dv.portal_draft_owner();
 select coalesce(max(version),0) into ceiling from public.portal_brand_draft where account_id=actor.account_id;
 bound:=coalesce(p_snapshot,ceiling);
 if p_after is null or p_after<0 or bound<0 or bound>ceiling or p_after>bound then raise exception 'DRAFT_CURSOR_INVALID' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by version),'[]'::jsonb),coalesce(max(version),p_after) into rows,last_version
 from (select version,actor_id,created_at from public.portal_brand_draft_revision
  where account_id=actor.account_id and version>p_after and version<=bound order by version limit 20) r;
 return jsonb_build_object('contract','portal-draft-v1','snapshot',bound,'rows',rows,'next',case when last_version<bound then last_version else null end);
end $$;
revoke all on function public.portal_draft_open_v1(),public.portal_draft_save_v1(uuid,integer,jsonb),public.portal_draft_history_v1(integer,integer) from public,anon,authenticated;
grant execute on function public.portal_draft_open_v1(),public.portal_draft_save_v1(uuid,integer,jsonb),public.portal_draft_history_v1(integer,integer) to authenticated;

create function public.portal_draft_asset_put_v1(p_key uuid,p_kind text,p_name text,p_mime text,p_base64 text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.app_user; bytes bytea; previous public.portal_brand_asset; total bigint; count_assets integer;
begin
 actor:=auth_dv.portal_draft_owner();
 if p_key is null or p_kind is null or p_kind not in ('logo','manual') or p_name is null or length(p_name) not between 1 and 120
  or p_name ~ '[[:cntrl:]]' or p_mime is null or p_base64 is null or length(p_base64)>5592408 then
  raise exception 'ASSET_INVALID' using errcode='22023';
 end if;
 begin bytes:=decode(p_base64,'base64'); exception when others then raise exception 'ASSET_INVALID' using errcode='22023'; end;
 if octet_length(bytes)=0 or
  not ((p_kind='logo' and octet_length(bytes)<=1048576 and
   ((p_mime='image/png' and substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex'))
    or (p_mime='image/jpeg' and substring(bytes from 1 for 3)=decode('ffd8ff','hex') and substring(bytes from octet_length(bytes)-1)=decode('ffd9','hex'))))
   or (p_kind='manual' and p_mime='application/pdf' and octet_length(bytes)<=4194304
    and substring(bytes from 1 for 5)=convert_to('%PDF-','UTF8')
    and position(convert_to('%%EOF','UTF8') in substring(bytes from greatest(1,octet_length(bytes)-1024)))>0)) then
  raise exception 'ASSET_INVALID' using errcode='22023';
 end if;
 select * into previous from public.portal_brand_asset where id=p_key;
 if found then
  if previous.account_id<>actor.account_id or previous.actor_id<>actor.id or previous.kind<>p_kind
   or previous.name<>p_name or previous.mime<>p_mime or previous.content<>bytes then
   raise exception 'ASSET_KEY_CONFLICT' using errcode='PT409';
  end if;
 else
  select count(*),coalesce(sum(octet_length(content)),0) into count_assets,total from public.portal_brand_asset where account_id=actor.account_id;
  if count_assets>=32 or total+octet_length(bytes)>16777216 then raise exception 'ASSET_LIMIT' using errcode='22023'; end if;
  insert into public.portal_brand_asset(id,account_id,actor_id,kind,name,mime,content) values(p_key,actor.account_id,actor.id,p_kind,p_name,p_mime,bytes);
 end if;
 return jsonb_build_object('contract','portal-draft-v1','asset',jsonb_build_object('id',p_key,'kind',p_kind,'name',p_name,'mime',p_mime,'size',octet_length(bytes)));
end $$;
create function public.portal_draft_asset_get_v1(p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor public.app_user; item public.portal_brand_asset;
begin
 actor:=auth_dv.portal_draft_owner();
 select * into item from public.portal_brand_asset where id=p_id and account_id=actor.account_id;
 if not found then raise exception 'ASSET_NOT_FOUND' using errcode='22023'; end if;
 return jsonb_build_object('contract','portal-draft-v1','asset',jsonb_build_object('id',item.id,'kind',item.kind,'name',item.name,'mime',item.mime,'size',octet_length(item.content),'base64',encode(item.content,'base64')));
end $$;
revoke all on function public.portal_draft_asset_put_v1(uuid,text,text,text,text),public.portal_draft_asset_get_v1(uuid) from public,anon,authenticated;
grant execute on function public.portal_draft_asset_put_v1(uuid,text,text,text,text),public.portal_draft_asset_get_v1(uuid) to authenticated;
commit;
