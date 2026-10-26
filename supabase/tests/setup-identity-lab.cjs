'use strict';
// Explicitly authorized local rehearsal. Never connects to a hosted database.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
assert.ok(process.argv.includes('--authorized-local-identity'),'Explicit isolated Auth authorization required');
const repo=path.resolve(__dirname,'../..'),dir=path.join(os.tmpdir(),'dv-portal-identity-20261025');
const backup=path.join(process.env.LOCALAPPDATA,'DonVentas/Backups/portal-20261025-132427');
const podman=path.join(process.env.LOCALAPPDATA,'Programs/Podman/podman.exe');
const network='dv-portal-identity-20261025',db='dv-identity-db',auth='dv-identity-auth',rest='dv-identity-rest',mail='dv-identity-mail';
const label='dv.rehearsal=identity-20261025';
function pod(args,input){try{return cp.execFileSync(podman,['--connection','dv-portal-h1',...args],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();}catch(e){throw new Error('LOCAL_PODMAN_FAILED: '+args[0]+' '+String(e.stderr||'').slice(0,350));}}
function sql(q,user='supabase_admin'){return pod(['exec','-i',db,'psql','-X','-qAt','-h','127.0.0.1','-U',user,'-d','portal_h10_disposable','-v','ON_ERROR_STOP=1'],q);}
function copy(file,target){pod(['cp',file,db+':'+target]);}
function apply(file){copy(path.join(repo,file),'/tmp/candidate.sql');pod(['exec',db,'psql','-X','-h','127.0.0.1','-U','postgres','-d','portal_h10_disposable','-v','ON_ERROR_STOP=1','-f','/tmp/candidate.sql']);}
function ip(name){const state=JSON.parse(pod(['inspect',name]))[0];return state.NetworkSettings.Networks[network].IPAddress;}
function envFile(name,values){const file=path.join(dir,name);fs.writeFileSync(file,Object.entries(values).map(([k,v])=>k+'='+v).join('\n')+'\n');return file;}
async function ready(url){for(let n=0;n<50;n++){try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error('LOCAL_SERVICE_NOT_READY: '+new URL(url).port);}
(async()=>{
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(backup,'production-original.dump'))).digest('hex'),'4861b9665818e19bcdce122b9bbe567c0dddc2c09720075b49a8b4789f0dfabc');
 if(process.argv.includes('--reset-owned-lab')){
  for(const name of [auth,rest,mail,db]){
   let state;try{state=JSON.parse(pod(['inspect',name]))[0];}catch{continue;}
   assert.equal(state.Config.Labels?.['dv.rehearsal'],'identity-20261025','Refuse removal of unowned container');
   pod(['rm','-f',name]);
  }
  let net;try{net=JSON.parse(pod(['network','inspect',network]))[0];}catch{}
  if(net){assert.equal(net.labels?.['dv.rehearsal'],'identity-20261025');pod(['network','rm',network]);}
  if(fs.existsSync(dir))fs.renameSync(dir,dir+'-previous-'+Date.now());
 }
 assert.ok(!fs.existsSync(dir),'Fresh private lab directory required');
 fs.mkdirSync(dir);
 cp.execFileSync('icacls.exe',[dir,'/inheritance:r','/grant:r',process.env.USERDOMAIN+'\\'+process.env.USERNAME+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{windowsHide:true,stdio:'pipe'});
 assert.deepEqual(JSON.parse(pod(['ps','-a','--filter','label='+label,'--format','json'])),[],'Existing rehearsal must be explicitly closed first');
 pod(['network','create','--internal','--label',label,network]);
 assert.equal(JSON.parse(pod(['network','inspect',network]))[0].internal,true);
 const image='docker.io/supabase/postgres@sha256:5a4314708484bec672de2c09653a5c01fb1c84a998564ac231b0325e2238ed5b';
 pod(['run','-d','--name',db,'--label',label,'--network',network,'--user','postgres','--entrypoint','/bin/bash',image,'-c',
  'initdb -D /tmp/identity-data -U supabase_admin -A trust --encoding=UTF8 --locale=C >/tmp/initdb.log 2>&1 && echo "host all all 0.0.0.0/0 scram-sha-256" >> /tmp/identity-data/pg_hba.conf && exec postgres -D /tmp/identity-data -c listen_addresses=* -c shared_preload_libraries=pg_cron,pg_stat_statements,pg_net -c cron.database_name=portal_h10_disposable -c cron.launch_active_jobs=off -c pg_net.database_name=disabled_network_worker']);
 for(let n=0;n<30;n++){try{pod(['exec',db,'pg_isready','-h','127.0.0.1','-U','supabase_admin']);break;}catch{await new Promise(r=>setTimeout(r,300));}}
 const roles=fs.readFileSync(path.join(backup,'roles-no-passwords.sql'),'utf8').replace('CREATE ROLE supabase_admin;','-- bootstrap role exists');
 pod(['exec','-i',db,'psql','-X','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],roles+'\nALTER ROLE postgres SUPERUSER;\nCREATE DATABASE portal_h10_disposable OWNER postgres TEMPLATE template0;');
 copy(path.join(backup,'production-original.dump'),'/tmp/original.dump');
 try{pod(['exec',db,'pg_restore','-h','127.0.0.1','-U','supabase_admin','-d','portal_h10_disposable','--single-transaction','--exit-on-error','/tmp/original.dump']);}
 finally{sql('ALTER ROLE postgres NOSUPERUSER;');}
 console.log('PASS actual-backup schema restored; no Auth/REST/SMTP services started');
 // Remove all application/identity/secret/job contents before exposing local APIs.
 // Migration ledgers are schema version metadata needed by the actual provider.
 sql(`DO $$ DECLARE targets text; r record; remaining bigint; BEGIN
 IF current_database()<>'portal_h10_disposable' OR host(inet_server_addr())<>'127.0.0.1' THEN RAISE EXCEPTION 'LOCAL_ONLY'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('m','f'))
  THEN RAISE EXCEPTION 'MATERIALIZED_OR_FOREIGN_RELATION_REQUIRES_RECONCILIATION'; END IF;
 SELECT string_agg(format('%I.%I',n.nspname,c.relname),',') INTO targets FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p') AND NOT c.relispartition AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
 AND (n.nspname,c.relname) NOT IN (('auth','schema_migrations'),('storage','migrations'),('realtime','schema_migrations'),('supabase_functions','migrations'));
 EXECUTE 'TRUNCATE '||targets||' RESTART IDENTITY CASCADE';
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p') AND NOT c.relispartition AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
  AND (n.nspname,c.relname) NOT IN (('auth','schema_migrations'),('storage','migrations'),('realtime','schema_migrations'),('supabase_functions','migrations')) LOOP
  EXECUTE format('SELECT count(*) FROM %I.%I',r.nspname,r.relname) INTO remaining;
  IF remaining<>0 THEN RAISE EXCEPTION 'SANITIZATION_INCOMPLETE'; END IF;
 END LOOP; END $$;`);
 const sanitation=JSON.parse(sql(`select json_build_object('materializedOrForeign',count(*) filter(where c.relkind in ('m','f')),'partitionedRoots',count(*) filter(where c.relkind='p'),'ordinaryTables',count(*) filter(where c.relkind='r')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema';`));
 fs.writeFileSync(path.join(dir,'sanitation.json'),JSON.stringify({...sanitation,allNonLedgerTablesCheckedEmpty:true}));
 const empty=sql('select (select count(*) from auth.users),(select count(*) from public.app_user),(select count(*) from public.lead),(select count(*) from vault.secrets),(select count(*) from cron.job);');
 assert.equal(empty,'0|0|0|0|0');
 pod(['exec',db,'rm','/tmp/original.dump']);
 apply('supabase/proposals/h10-command-contract.sql');
 apply('supabase/proposals/h10-identity-contract.sql');
 console.log('PASS private restored rows removed; H10 and identity candidates applied as NOSUPERUSER');
 const dbCredential=crypto.randomBytes(24).toString('hex'),jwtKey=crypto.randomBytes(32).toString('hex');
 sql(`ALTER ROLE supabase_auth_admin PASSWORD '${dbCredential}'; ALTER ROLE authenticator PASSWORD '${dbCredential}';`);
 pod(['run','-d','--name',mail,'--label',label,'--network',network,'-p','127.0.0.1:55453:8025','docker.io/axllent/mailpit:v1.32.0']);
 const authEnv=envFile('auth.env',{
  GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgres://supabase_auth_admin:'+dbCredential+'@'+ip(db)+':5432/portal_h10_disposable',
  GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:9999,API_EXTERNAL_URL:'http://127.0.0.1:55451',
  GOTRUE_SITE_URL:'http://127.0.0.1:55454/',GOTRUE_URI_ALLOW_LIST:'http://127.0.0.1:55454/',
  GOTRUE_JWT_SECRET:jwtKey,GOTRUE_JWT_EXP:3600,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',
  GOTRUE_DISABLE_SIGNUP:'false',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED:'false',GOTRUE_EXTERNAL_PHONE_ENABLED:'false',
  GOTRUE_MAILER_AUTOCONFIRM:'false',GOTRUE_MAILER_OTP_EXP:900,GOTRUE_SMTP_HOST:ip(mail),GOTRUE_SMTP_PORT:1025,
  GOTRUE_SMTP_ADMIN_EMAIL:'auth@synthetic.invalid',GOTRUE_SMTP_SENDER_NAME:'Synthetic Don Ventas',GOTRUE_SMTP_MAX_FREQUENCY:'1s',
  GOTRUE_RATE_LIMIT_EMAIL_SENT:1000,GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED:'true',GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL:0,
  GOTRUE_MFA_TOTP_ENROLL_ENABLED:'true',GOTRUE_MFA_TOTP_VERIFY_ENABLED:'true',GOTRUE_MFA_MAX_ENROLLED_FACTORS:10,
  GOTRUE_MAILER_URLPATHS_CONFIRMATION:'/verify',GOTRUE_MAILER_URLPATHS_INVITE:'/verify',GOTRUE_MAILER_URLPATHS_RECOVERY:'/verify'
 });
 const restEnv=envFile('rest.env',{PGRST_DB_URI:'postgres://authenticator:'+dbCredential+'@'+ip(db)+':5432/portal_h10_disposable',PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:jwtKey});
 pod(['run','-d','--name',auth,'--label',label,'--network',network,'-p','127.0.0.1:55451:9999','--env-file',authEnv,'docker.io/supabase/gotrue:v2.197.0']);
 pod(['run','-d','--name',rest,'--label',label,'--network',network,'-p','127.0.0.1:55452:3000','--env-file',restEnv,'docker.io/postgrest/postgrest:v14.18']);
 fs.writeFileSync(path.join(dir,'private.json'),JSON.stringify({jwtKey,network,containers:[db,auth,rest,mail]}));
 await ready('http://127.0.0.1:55451/health');await ready('http://127.0.0.1:55452/');await ready('http://127.0.0.1:55453/api/v1/messages');
 console.log('PASS isolated Auth/PostgREST/SMTP sink ready; fresh local keys; loopback APIs only');
})().catch(e=>{console.error(String(e.message).slice(0,500));process.exitCode=1;});
