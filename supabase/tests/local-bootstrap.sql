-- TEST HARNESS ONLY. PostgreSQL engine is real; auth.uid is a local claims shim.
-- Never apply this file to hosted Supabase or use it to claim provider Auth validation.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'portal_h10_disposable' then raise exception 'DISPOSABLE_DB_REQUIRED'; end if;
end $$;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin nosuperuser nobypassrls; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin nosuperuser nobypassrls; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
-- Reproduce the broad legacy grants so the candidate must actually remove them.
grant usage on schema public to anon,authenticated;
alter default privileges in schema public grant all on tables to anon,authenticated;
alter default privileges in schema public grant all on sequences to anon,authenticated;
