-- Isolated laboratory adapter only. No hosted migration, public bucket or external service.
-- Bounded byte storage follows the existing private brand-asset laboratory pattern.
create table public.portal_delivery_file (
 id uuid primary key, delivery_id uuid not null references public.portal_request_delivery(id),
 author_id uuid not null references public.app_user(id), name text not null, mime text not null,
 content bytea not null check(octet_length(content) between 1 and 4194304),
 sha256 text not null, created_at timestamptz not null default now()
);
alter table public.portal_delivery_file enable row level security;
revoke all on public.portal_delivery_file from public,anon,authenticated;

create function public.portal_delivery_file_v1(p_action text,p_request uuid,p_delivery uuid,p_assignment uuid default null,p_key uuid default null,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare view jsonb; item jsonb; actor public.app_user; d public.portal_request_delivery;
 f public.portal_delivery_file; bytes bytea; digest_hex text; result jsonb;
begin
 -- Same identity/request locks and live audience check as the workflow, before any replay/download.
 view:=public.portal_workflow_v1('read',p_request,null,jsonb_build_object('assignmentId',p_assignment));
 actor:=auth_dv.me();
 select v into item from jsonb_array_elements(view->'work'->'items') v where v->>'id'=p_delivery::text;
 if item is null then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
 select * into d from public.portal_request_delivery where id=p_delivery and request_id=p_request;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>5700000 then raise exception 'FILE_INVALID' using errcode='22023';end if;
 if p_action='download' then
  select * into f from public.portal_delivery_file where id=p_key and delivery_id=d.id;
  if f.id is null then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  return jsonb_build_object('contract','portal-delivery-file-v1','id',f.id,'name',f.name,'mime',f.mime,'sha256',f.sha256,'base64',encode(f.content,'base64'));
 elsif p_action='upload' then
  if d.author_id<>actor.id or p_assignment is distinct from d.assignment_id or not auth_dv.review_assignment(d.assignment_id,actor.id) then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501';end if;
  if d.state<>'submitted' or not auth_dv.review_scope_current(p_request,d.scope_version) then raise exception 'FILE_FROZEN' using errcode='PT409';end if;
  if p_key is null or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('name','mime','base64')) or
    jsonb_typeof(p_data->'name') is distinct from 'string' or length(p_data->>'name') not between 1 and 120 or
    (p_data->>'name') !~ '^[a-zA-Z0-9][a-zA-Z0-9 _().-]*\.(pdf|png|jpg|jpeg)$' or
    jsonb_typeof(p_data->'base64') is distinct from 'string' or length(p_data->>'base64') not between 4 and 5592408 or
    (p_data->>'base64') !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'FILE_INVALID' using errcode='22023';end if;
  begin
   bytes:=decode(p_data->>'base64','base64');
  exception when invalid_parameter_value or invalid_text_representation then raise exception 'FILE_INVALID' using errcode='22023';
  end;
  if octet_length(bytes) not between 1 and 4194304 or replace(encode(bytes,'base64'),E'\n','')<>p_data->>'base64' then raise exception 'FILE_INVALID' using errcode='22023';end if;
  if not coalesce((p_data->>'mime'='application/pdf' and p_data->>'name' ~ '\.pdf$' and substring(bytes from 1 for 5)=decode('255044462d','hex')) or
   (p_data->>'mime'='image/png' and p_data->>'name' ~ '\.png$' and substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex')) or
   (p_data->>'mime'='image/jpeg' and p_data->>'name' ~ '\.(jpg|jpeg)$' and substring(bytes from 1 for 3)=decode('ffd8ff','hex')),false) then raise exception 'FILE_TYPE' using errcode='22023';end if;
  -- Signature/type bounds are not a malware scan. External activation remains gated.
  digest_hex:=encode(sha256(bytes),'hex');
  select * into f from public.portal_delivery_file where id=p_key;
  if f.id is not null then
   if f.author_id<>actor.id or f.delivery_id<>d.id or f.name<>p_data->>'name' or f.mime<>p_data->>'mime' or f.sha256<>digest_hex then raise exception 'FILE_KEY_CONFLICT' using errcode='PT409';end if;
  else
   if (select count(*) from public.portal_delivery_file where delivery_id=d.id)>=3 or
    (select coalesce(sum(octet_length(a.content)),0) from public.portal_delivery_file a join public.portal_request_delivery b on b.id=a.delivery_id where b.request_id=p_request)+octet_length(bytes)>50331648 then raise exception 'FILE_QUOTA' using errcode='22023';end if;
   insert into public.portal_delivery_file(id,delivery_id,author_id,name,mime,content,sha256) values(p_key,d.id,actor.id,p_data->>'name',p_data->>'mime',bytes,digest_hex);
   update public.portal_request set revision=revision+1 where id=p_request;
  end if;
  return jsonb_build_object('contract','portal-delivery-file-v1','id',p_key,'sha256',digest_hex);
 end if;
 raise exception 'FILE_INVALID' using errcode='22023';
end $$;
revoke all on function public.portal_delivery_file_v1(text,uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.portal_delivery_file_v1(text,uuid,uuid,uuid,uuid,jsonb) to authenticated;
