-- Local provider integration ONLY: roles and auth.users are created by the test
-- cluster and actual GoTrue migrations before this file. Not a hosted migration.
-- auth.uid() is supplied by the official GoTrue migrations and left unchanged.
grant usage on schema auth,public to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
alter default privileges in schema public grant all on tables to anon,authenticated;
alter default privileges in schema public grant all on sequences to anon,authenticated;
