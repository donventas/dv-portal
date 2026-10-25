'use strict';
// Future authorized local test only. Does not provision infrastructure or apply SQL candidates.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const approved = process.argv.includes('--authorized-local-disposable');
assert.ok(approved, 'Explicit --authorized-local-disposable is required; no connection attempted');
const connection = new URL(process.env.H10_DISPOSABLE_DATABASE_URL || 'invalid:');
assert.ok(['postgres:','postgresql:'].includes(connection.protocol));
assert.ok(['127.0.0.1','localhost','[::1]'].includes(connection.hostname), 'Only loopback is permitted');
assert.equal(connection.pathname, '/portal_h10_disposable');
assert.equal(connection.search, '', 'Connection overrides are forbidden');
const env = { ...process.env, PGHOST:connection.hostname.replace(/[\[\]]/g,''), PGPORT:connection.port || '5432',
  PGDATABASE:'portal_h10_disposable',PGUSER:decodeURIComponent(connection.username),PGPASSWORD:decodeURIComponent(connection.password),
  PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'3',PGAPPNAME:'portal-h10-local-tests',PGOPTIONS:'-c statement_timeout=15000 -c lock_timeout=10000' };
const exe = process.env.H10_PSQL_PATH || 'psql';
function sql(input) {
  return new Promise((resolve,reject) => {
    const child = spawn(exe,['-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='';
    child.stdout.on('data', b => output += b);
    child.stderr.on('data', () => {}); // Never print connection/provider errors or passwords.
    child.on('error', () => reject(new Error('LOCAL_PSQL_UNAVAILABLE')));
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error('LOCAL_SQL_TEST_FAILED')));
    child.stdin.end(input);
  });
}
(async () => {
  const identity = await sql("select current_database() || ':' || coalesce(inet_server_addr()::text,'socket');");
  assert.ok(/^portal_h10_disposable:(127\.0\.0\.1|::1|socket)$/.test(identity),'Local server identity mismatch');
  const suite = fs.readFileSync(path.join(__dirname,'h10-negative.sql'),'utf8');
  await sql(suite);
  console.log('H10_SQL_NEGATIVE_PASS');
  if (!process.argv.includes('--concurrency')) return;
  // Requires a fresh disposable DB: committed synthetic fixtures intentionally remain for inspection.
  const fixtures = suite.slice(suite.indexOf('insert into public.account'),suite.indexOf('-- Inventory'));
  await sql('begin;\n' + fixtures + '\ncommit;');
  const command = "select public.portal_command_v1('70000000-0000-0000-0000-000000000010','approve','50000000-0000-0000-0000-000000000001',0,'60000000-0000-0000-0000-000000000001','{}');";
  const actor = "set local role authenticated; select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);";
  const responses = await Promise.all([sql('begin;' + actor + command + 'commit;'),sql('begin;' + actor + command + 'commit;')]);
  assert.equal(responses[0],responses[1],'Two sessions must receive the same canonical result');
  assert.equal(await sql("select version from public.block where id='50000000-0000-0000-0000-000000000001';"),'1');
  assert.equal(await sql("select count(*) from public.portal_command_receipt where operation_key='70000000-0000-0000-0000-000000000010';"),'1');
  console.log('H10_TWO_SESSION_REPLAY_PASS; synthetic fixtures retained in disposable DB');
})().catch(() => { console.error('H10_LOCAL_DB_TEST_FAILED; inspect disposable DB locally'); process.exitCode=1; });
