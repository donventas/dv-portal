param([switch]$AuthorizedRebuildDisposable)
$ErrorActionPreference = 'Stop'
if (-not $AuthorizedRebuildDisposable) { throw 'Explicit disposable rebuild authorization required' }
$taskRoot = Join-Path $env:TEMP 'dv-portal-h10-2795554'
$bin = Join-Path $taskRoot 'pgsql/bin'
$env:PGPASSWORD = [IO.File]::ReadAllText((Join-Path $taskRoot 'local-password.txt'))
$connect = @('-X','-h','127.0.0.1','-p','55439','-U','portal_test_owner','-v','ON_ERROR_STOP=1')
try {
 $identity = & (Join-Path $bin 'psql.exe') @connect -d postgres -Atc 'show data_directory'
 if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($identity.Trim()) -ne [IO.Path]::GetFullPath((Join-Path $taskRoot 'data'))) { throw 'Cluster identity mismatch' }
 # Exact fixed disposable name; no production endpoints, wildcard targets or force.
 & (Join-Path $bin 'dropdb.exe') -h 127.0.0.1 -p 55439 -U portal_test_owner portal_h10_disposable
 if ($LASTEXITCODE -ne 0) { throw 'Disposable drop failed' }
 & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p 55439 -U portal_test_owner portal_h10_disposable
 if ($LASTEXITCODE -ne 0) { throw 'Disposable create failed' }
 $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
 foreach ($f in @('supabase/tests/local-bootstrap.sql','supabase/migrations/01_schema.sql','supabase/migrations/02_rls.sql','supabase/migrations/04_rpc.sql')) {
  & (Join-Path $bin 'psql.exe') @connect -d portal_h10_disposable -f (Join-Path $repo $f) >> (Join-Path $taskRoot 'build.log') 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Base schema failed: $f" }
 }
 # Helper schema USAGE must be supplied by the candidate, never by the harness.
 # Baseline recovery point, before candidate, contains no client data/legacy seed.
 & (Join-Path $bin 'pg_dump.exe') -h 127.0.0.1 -p 55439 -U portal_test_owner -d portal_h10_disposable -Fc -f (Join-Path $taskRoot 'baseline.dump')
 if ($LASTEXITCODE -ne 0) { throw 'Baseline backup failed' }
 foreach ($f in @('supabase/proposals/h10-command-contract.sql','supabase/tests/h10-negative.sql','supabase/tests/h10-security.sql')) {
  $log = Join-Path $taskRoot ([IO.Path]::GetFileNameWithoutExtension($f) + '.log')
  & (Join-Path $bin 'psql.exe') @connect -d portal_h10_disposable -f (Join-Path $repo $f) > $log 2>&1
  if ($LASTEXITCODE -ne 0) { Get-Content $log -Tail 12; throw "SQL failed: $f" }
  Write-Output "PASS $f"
 }
} finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
