-- EXECUTE ONLY in an explicitly authorized disposable local database after the candidate.
-- psql -X -v ON_ERROR_STOP=1 -f supabase/tests/h10-negative.sql
-- This suite never installs/applies migrations. All fixtures/tests roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() <> 'portal_h10_disposable' or inet_server_addr() is not null and
    host(inet_server_addr()) not in ('127.0.0.1','::1') then raise exception 'DISPOSABLE_LOCAL_DB_REQUIRED'; end if;
end $$;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'ASSERT_FAILED: %',label; end if;
end $$;
create function pg_temp.denied(query text) returns void language plpgsql as $$ begin
 begin execute query; exception when others then
   if sqlstate in ('42501','P0001') then return; end if; raise;
 end;
 raise exception 'EXPECTED_DENIAL_MISSING: %',query;
end $$;
\ir h10-fixtures.sql
-- Inventory effective grants, including inherited table/column privileges. Do not report secrets.
select grantee,table_name,privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name in ('app_user','block','round','account');
select grantee,table_name,column_name,privilege_type from information_schema.role_column_grants
 where table_schema='public' and table_name='app_user';
select schemaname,tablename,policyname,cmd from pg_policies where schemaname='public';
set local role authenticated;
-- Profile authority negative tests run directly as every actor, never through the frontend.
do $$ declare actor uuid; begin
 foreach actor in array array[
 '20000000-0000-0000-0000-000000000001'::uuid,'20000000-0000-0000-0000-000000000002'::uuid,
 '20000000-0000-0000-0000-000000000003'::uuid,'20000000-0000-0000-0000-000000000004'::uuid,
 '20000000-0000-0000-0000-000000000005'::uuid] loop
   perform set_config('request.jwt.claim.sub',actor::text,true);
   perform pg_temp.denied(format('update public.app_user set role=''admin'' where id=%L',actor));
   perform pg_temp.denied(format('update public.app_user set account_id=null,member_role=null where id=%L',actor));
   perform pg_temp.denied(format('update public.app_user set member_role=''owner'' where id=%L',actor));
   perform pg_temp.denied(format('update public.app_user set pending=false where id=%L',actor));
   update public.app_user set name='Synthetic edited name' where id=actor;
   perform pg_temp.assert_true(found,'own safe name update');
 end loop;
end $$;
-- Cross-tenant owner, ordinary member, staff, admin and revoked cannot accept for owner A.
do $$ declare actor uuid; begin
 foreach actor in array array[
 '20000000-0000-0000-0000-000000000002'::uuid,'20000000-0000-0000-0000-000000000003'::uuid,
 '20000000-0000-0000-0000-000000000004'::uuid,'20000000-0000-0000-0000-000000000005'::uuid,
 '20000000-0000-0000-0000-000000000006'::uuid] loop
   perform set_config('request.jwt.claim.sub',actor::text,true);
   perform pg_temp.denied($q$select public.portal_command_v1('70000000-0000-0000-0000-000000000001','approve','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000001','{}')$q$);
 end loop;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
-- Feedback is an event against the exact revision; roll the test back to preserve the approval case.
do $$ declare result jsonb; begin
 begin
  result := public.portal_command_v1('70000000-0000-0000-0000-000000000008','feedback','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000001','{"feedback":"Synthetic request"}');
  perform pg_temp.assert_true(result->'feedback'->>'revision_id'='60000000-0000-0000-0000-000000000001','feedback exact revision');
  perform pg_temp.assert_true(result->'round'='null'::jsonb,'feedback does not fabricate a round');
  raise exception 'SYNTHETIC_ABORT' using errcode='P0002';
 exception when no_data_found then null; end;
end $$;
select pg_temp.denied($q$update public.block set status='cerrado' where id='50000000-0000-0000-0000-000000000001'$q$);
select pg_temp.denied($q$select public.portal_command_v1('70000000-0000-0000-0000-000000000002','approve','50000000-0000-0000-0000-000000000001',9,'60000000-0000-0000-0000-000000000001','{}')$q$);
select pg_temp.denied($q$select public.portal_command_v1('70000000-0000-0000-0000-000000000002','approve','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000009','{}')$q$);
-- A forced failure after command effects must roll back the block, receipt and audit together.
do $$ begin
 begin
  perform public.portal_command_v1('70000000-0000-0000-0000-000000000003','approve','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000001','{}');
  raise exception 'SYNTHETIC_ABORT' using errcode='P0002';
 exception when no_data_found then null; end;
 perform pg_temp.assert_true((select version=0 and status='en_revision' from public.block where id='50000000-0000-0000-0000-000000000001'),'rollback block');
end $$;
-- Same-key replay returns byte-equivalent JSON; changed payload is a conflict.
do $$ declare a jsonb; b jsonb; begin
 a := public.portal_command_v1('70000000-0000-0000-0000-000000000004','approve','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000001','{}');
 b := public.portal_command_v1('70000000-0000-0000-0000-000000000004','approve','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000001','{}');
 perform pg_temp.assert_true(a=b,'same-key replay');
 perform pg_temp.denied($q$select public.portal_command_v1('70000000-0000-0000-0000-000000000004','feedback','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000001','{"feedback":"different"}')$q$);
 perform pg_temp.denied($q$select public.portal_command_v1('70000000-0000-0000-0000-000000000005','approve','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000001','{}')$q$);
end $$;
-- Activation is admin-only and replay cannot duplicate a brand/project/block.
select pg_temp.denied($q$select public.activate_account('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004')$q$);
select pg_temp.denied($q$select public.portal_command_v1('70000000-0000-0000-0000-000000000006','activate','10000000-0000-0000-0000-000000000003',0,null,'{"analyst_id":"20000000-0000-0000-0000-000000000004"}')$q$);
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',true);
select public.portal_command_v1('70000000-0000-0000-0000-000000000006','activate','10000000-0000-0000-0000-000000000003',0,null,'{"analyst_id":"20000000-0000-0000-0000-000000000004"}');
select public.portal_command_v1('70000000-0000-0000-0000-000000000006','activate','10000000-0000-0000-0000-000000000003',0,null,'{"analyst_id":"20000000-0000-0000-0000-000000000004"}');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.brand where account_id='10000000-0000-0000-0000-000000000003'),'activation once');
select pg_temp.assert_true((select count(*)=1 from public.portal_command_audit where operation_key='70000000-0000-0000-0000-000000000004'),'audit once');
select pg_temp.assert_true((select count(*)=0 from public.portal_command_receipt where operation_key='70000000-0000-0000-0000-000000000003'),'rollback receipt');
select pg_temp.assert_true((select count(*)=0 from public.portal_command_audit where operation_key='70000000-0000-0000-0000-000000000003'),'rollback audit');
-- JWT still valid but actor revoked: even cached command replay and reads must now fail.
update public.app_user set pending=true where id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true((select count(*)=0 from public.block where id='50000000-0000-0000-0000-000000000001'),'revoked actor read denied');
select pg_temp.denied($q$select public.portal_command_v1('70000000-0000-0000-0000-000000000004','approve','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000001','{}')$q$);
reset role;
rollback;
\echo H10_NEGATIVE_SUITE_PASS
