-- Private loopback laboratory worker contract; not exposed via PostgREST.
begin;
alter table public.portal_request_notice drop constraint portal_request_notice_mail_state_check;
alter table public.portal_request_notice add constraint portal_request_notice_mail_state_check check(mail_state in ('queued','uncertain','captured','failed','suppressed'));
create table public.portal_worker_scope(account_id uuid primary key references public.account(id), active boolean not null default true);
alter table public.portal_worker_scope enable row level security;
revoke all on public.portal_worker_scope from public,anon,authenticated;
create function auth_dv.review_worker(p_action text,p_id uuid default null,p_lease uuid default null,p_result jsonb default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.portal_request_job;r public.portal_request;f jsonb;item jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('portal-identity-v1',0));
 if p_action='claim' then
  for j in update public.portal_request_job set state='failed',error='LEASE_ATTEMPTS_EXHAUSTED'
   where state='running' and lease_until<=now() and attempts>=3 and request_id in
    (select scoped.id from public.portal_request scoped join public.portal_worker_scope w on w.account_id=scoped.account_id where w.active) returning * loop
   perform auth_dv.review_notify(j.request_id,'analysis-exhausted:'||j.lease,'internal','Análisis pendiente de reintento');
  end loop;
  select q.* into j from public.portal_request_job q join public.portal_request s on s.id=q.request_id
   join public.portal_worker_scope w on w.account_id=s.account_id and w.active
   join public.account ac on ac.id=s.account_id and ac.status='activo'
   where q.attempts<3 and (q.state='pending' or q.state='running' and q.lease_until<=now())
   order by s.created_at for update of q skip locked limit 1;
  if j.request_id is null then return jsonb_build_object('job',null);end if;
  update public.portal_request_job set state='running',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1
   where request_id=j.request_id returning * into j;
 else
  select * into j from public.portal_request_job where request_id=p_id for update;
  if j.request_id is null or j.lease is distinct from p_lease or p_lease is null then raise exception 'WORKER_LEASE_INVALID';end if;
 end if;
 select * into r from public.portal_request where id=j.request_id;
 if not exists(select 1 from public.portal_worker_scope w join public.account ac on ac.id=w.account_id
  where w.account_id=r.account_id and w.active and ac.status='activo') then raise exception 'WORKER_SCOPE_REVOKED';end if;
 if p_action='complete' and j.state='complete' and j.result=p_result then return jsonb_build_object('state','complete');end if;
 if j.state<>'running' or j.lease_until<=now() then raise exception 'WORKER_LEASE_INVALID';end if;
 if p_action in ('claim','read') then return jsonb_build_object('requestId',r.id,'draftVersion',r.draft_version,
  'lease',j.lease,'leaseUntil',j.lease_until,'snapshot',r.snapshot,'assets',r.assets);end if;
 if p_action='fail' then
  update public.portal_request_job set state='failed',error='ANALYSIS_FAILED' where request_id=r.id;
  perform auth_dv.review_notify(r.id,'analysis-failed:'||j.lease,'internal','Análisis pendiente de reintento');
  return jsonb_build_object('state','failed');
 end if;
 if p_action<>'complete' then raise exception 'WORKER_INVALID';end if;
 if p_result is null or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>30000
  or p_result->>'requestId' is distinct from r.id::text or (p_result->>'draftVersion')::integer is distinct from r.draft_version
  or p_result->>'mode' is distinct from 'simulation' or p_result->>'method' is distinct from 'dv-review-simulator-v1'
  or p_result->>'summary' is null or length(p_result->>'summary')>4000
  or p_result->>'proposedReturn' is null or length(p_result->>'proposedReturn')>8000
  or jsonb_typeof(p_result->'facts') is distinct from 'array'
  or jsonb_typeof(p_result->'hypotheses') is distinct from 'array'
  or jsonb_typeof(p_result->'missing') is distinct from 'array'
  or p_result->>'recommendation' is null
  or p_result-array['requestId','draftVersion','mode','method','summary','proposedReturn','facts','hypotheses','missing','recommendation']<>'{}'
  then raise exception 'WORKER_RESULT_INVALID';end if;
 for item in select * from jsonb_array_elements(p_result->'facts') loop
  if jsonb_typeof(item) is distinct from 'object' or not (r.snapshot ? (item->>'field'))
   or item->'value' is distinct from r.snapshot->(item->>'field') or item-array['field','value']<>'{}'
   then raise exception 'WORKER_SOURCE_INVALID';end if;
 end loop;
 update public.portal_request_job set state='complete',result=p_result,error=null,completed_at=now() where request_id=r.id;
 perform auth_dv.review_notify(r.id,'analysis:'||r.id,'internal','Revisión simulada lista');
 return jsonb_build_object('state','complete');
end $$;
revoke all on function auth_dv.review_worker(text,uuid,uuid,jsonb) from public,anon,authenticated;

create function auth_dv.review_mail(p_ack bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare n public.portal_request_notice;email text;
begin
 perform pg_advisory_xact_lock(hashtextextended('portal-identity-v1',0));
 if p_ack is not null then
  update public.portal_request_notice set mail_state='captured' where id=p_ack and mail_state='uncertain';
  return jsonb_build_object('captured',found);
 end if;
 update public.portal_request_notice z set mail_state='suppressed' where mail_state='queued'
  and not auth_dv.review_notice_visible(z,z.user_id);
 select z.* into n from public.portal_request_notice z join public.portal_request r on r.id=z.request_id
  join public.portal_worker_scope w on w.account_id=r.account_id and w.active
  where z.mail_state='queued' order by z.id for update of z skip locked limit 1;
 if n.id is null then return jsonb_build_object('mail',null);end if;
 select u.email into email from public.app_user u where id=n.user_id;
 if email is null or email !~ '^[a-zA-Z0-9._+-]+@synthetic[.]invalid$' then
  update public.portal_request_notice set mail_state='suppressed' where id=n.id;
  return jsonb_build_object('suppressed',true);
 end if;
 -- Reserve before external effect. A timeout stays uncertain and is never resent automatically.
 update public.portal_request_notice set mail_state='uncertain' where id=n.id;
 return jsonb_build_object('id',n.id,'to',email,'subject',n.title,
  'text','Aviso de prueba Don Ventas. '||n.title||'. Abre el Portal con tu cuenta autorizada: http://127.0.0.1:55474/ . No se adjuntan expedientes ni análisis internos.');
end $$;
revoke all on function auth_dv.review_mail(bigint) from public,anon,authenticated;
commit;
