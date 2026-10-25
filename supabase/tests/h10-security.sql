-- Real Postgres regression matrix. Run after candidate in disposable local DB.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'portal_h10_disposable' or host(inet_server_addr())<>'127.0.0.1' then raise exception 'LOCAL_DB_REQUIRED'; end if;
end $$;
\ir h10-fixtures.sql
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'ASSERT_FAILED: %',label; end if;
end $$;
create function pg_temp.expect_denied(q text, expected_state text, expected_message text default null) returns void language plpgsql as $$
begin
 begin execute q;
 exception when others then
  if sqlstate=expected_state and (expected_message is null or sqlerrm=expected_message) then return; end if;
  raise;
 end;
 raise exception 'EXPECTED_DENIAL_MISSING';
end $$;
insert into public.brand(id,account_id,name,layer) values
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Other tenant','marca'),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Uncontracted','datos');
insert into public.project(id,brand_id,title) values
 ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','Other project'),
 ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','Uncontracted project');
insert into public.block(id,project_id,code,title,capa,status) values
 ('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000003','D1','Uncontracted block','Sistema','en_revision');
insert into public.round(id,block_id,seq,title) values
 ('60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000003',1,'Uncontracted revision');
insert into public.invoice(id,account_id,concept,layer,amount) values
 ('80000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Other invoice','fundacion',1);
insert into public.payment(invoice_id,amount) values('80000000-0000-0000-0000-000000000002',1);
insert into public.invitation(account_id,email,role) values('10000000-0000-0000-0000-000000000002','invited@synthetic.invalid','miembro');
insert into public.assignment(analyst_id,account_id) values('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002');
-- Effective privileges catch grants via PUBLIC, role membership and columns.
do $$ declare t text; c record; begin
 foreach t in array array['account','app_user','assignment','invitation','brand','project','block','round','scope_change','invoice','payment','asset','skill'] loop
  perform pg_temp.assert_true(not has_table_privilege('authenticated','public.'||t,'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER'),t||' no direct mutation');
  perform pg_temp.assert_true(not has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),t||' no anon privilege');
  for c in select column_name from information_schema.columns where table_schema='public' and table_name=t loop
   if t<>'app_user' or c.column_name<>'name' then
    perform pg_temp.assert_true(not has_column_privilege('authenticated','public.'||t,c.column_name,'INSERT,UPDATE,REFERENCES'),t||' column write denied');
   end if;
  end loop;
 end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
select pg_temp.assert_true((select count(*)=0 from public.app_user where account_id='10000000-0000-0000-0000-000000000002'),'staff user scope');
select pg_temp.assert_true((select count(*)=0 from public.invoice),'staff invoice scope');
select pg_temp.assert_true((select count(*)=0 from public.payment),'staff payment scope');
select pg_temp.assert_true((select count(*)=0 from public.invitation),'staff invitation scope');
select pg_temp.assert_true((select count(*)=0 from public.assignment where account_id='10000000-0000-0000-0000-000000000002'),'staff assignment scope');
-- A temp relation cannot shadow the trusted helper relation.
create temporary table app_user(id uuid,role public.user_role);
insert into pg_temp.app_user values('20000000-0000-0000-0000-000000000004','admin');
select pg_temp.assert_true(not auth_dv.is_admin(),'temp shadow cannot promote actor');
select public.portal_command_v1('70000000-0000-0000-0000-000000000020','round','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000001','{"title":"Assigned specialist revision"}');
select pg_temp.assert_true((select count(*)=2 from public.round where block_id='50000000-0000-0000-0000-000000000001'),'assigned round succeeds');
reset role;
delete from public.assignment where analyst_id='20000000-0000-0000-0000-000000000004';
set local role authenticated;
select pg_temp.expect_denied($q$select public.portal_command_v1('70000000-0000-0000-0000-000000000020','round','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000001','{"title":"Assigned specialist revision"}')$q$,'42501','FORBIDDEN');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true((select count(*)=0 from public.block where id='50000000-0000-0000-0000-000000000003'),'uncontracted block hidden');
select pg_temp.assert_true((select count(*)=0 from public.round where block_id='50000000-0000-0000-0000-000000000003'),'uncontracted round hidden');
select pg_temp.expect_denied($q$select public.portal_command_v1('70000000-0000-0000-0000-000000000021','approve','50000000-0000-0000-0000-000000000003',0,'60000000-0000-0000-0000-000000000003','{}')$q$,'42501','PACKAGE_FORBIDDEN');
do $$ begin
 update public.app_user set name='Not allowed' where id='20000000-0000-0000-0000-000000000003';
 perform pg_temp.assert_true(not found,'cannot rename other member');
end $$;
select pg_temp.expect_denied($q$update public.app_user set name=null where id='20000000-0000-0000-0000-000000000001'$q$,'23514');
reset role;
-- Expired invitation and a revoked/pending legacy email do not transfer authority.
insert into public.invitation(account_id,email,role,expires_at) values
 ('10000000-0000-0000-0000-000000000001','revoked@synthetic.invalid','miembro',now()-interval '1 day');
insert into auth.users(id,email) values('20000000-0000-0000-0000-000000000007','revoked@synthetic.invalid');
select pg_temp.assert_true((select pending from public.app_user where id='20000000-0000-0000-0000-000000000006'),'legacy pending preserved');
select pg_temp.assert_true(not exists(select 1 from public.app_user where id='20000000-0000-0000-0000-000000000007'),'email does not transfer membership');
update public.app_user set pending=true where id='20000000-0000-0000-0000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',true);
select pg_temp.assert_true(not auth_dv.is_admin(),'revoked admin helper');
select pg_temp.assert_true((select count(*)=0 from auth_dv.account_ids()),'revoked admin cannot enumerate accounts');
select pg_temp.assert_true(auth_dv.account_of_block('50000000-0000-0000-0000-000000000001') is null,'revoked resource helper');
reset role;
rollback;
\echo H10_SECURITY_MATRIX_PASS
