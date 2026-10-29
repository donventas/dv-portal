'use strict';
// Requires the explicitly authorized isolated database; creates only synthetic fixtures.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),L=require('./h12-workflow-local.cjs'),F=require('./h12-files.cjs');
const {chromium,expect}=require('@playwright/test'),{createServer}=require('./h12-server.cjs');
async function main(){
 assert.ok(process.argv.includes('--authorized-local-h12'));assert.equal(L.sql('select current_database();'),'portal_h10_disposable');
 const u=await F.users(),arg=process.argv.find(v=>v.startsWith('--fixture=')),token=arg?arg.slice(10):'pagination-'+crypto.randomUUID(),owner=L.literal(u.owner.id);
 assert.ok(/^pagination-[0-9a-f-]{36}$/.test(token));
 const ids=arg?JSON.parse(L.sql(`select coalesce(json_agg(id),'[]') from public.portal_request where actor_id=${owner}::uuid and snapshot->>'improvement_need' like ${L.literal(token+'-%')};`)):JSON.parse(L.sql(`with owner as (select id,account_id from public.app_user where id=${owner}::uuid), inserted as (
  insert into public.portal_request(id,account_id,actor_id,draft_version,snapshot,assets,consent,created_at)
  select gen_random_uuid(),owner.account_id,owner.id,0,jsonb_build_object('improvement_need',${L.literal(token)}||'-'||n), '[]'::jsonb,'improvement-v1',
  now()-(case when n<=65 then interval '0 seconds' else n * interval '1 second' end)
  from owner cross join generate_series(1,125) n returning id)
  select coalesce(json_agg(id),'[]') from inserted;`));
 assert.equal(ids.length,125,'fixture must have 125 rows');
 const owned=async(actor,id=null)=>F.ok(await F.rpc(actor,'inbox',id));
 const results={};
 for(const role of ['owner','publisher']){
  let cursor=null,pages=[],seen=new Set();
  for(let n=0;n<100;n++){
   const page=(await owned(u[role],cursor)).requests;assert.ok(page.length<=50);
   for(const row of page){assert.ok(!seen.has(row.id),'duplicate across pages');seen.add(row.id);pages.push(row);}
   if(page.length<50)break;cursor=page.at(-1).id;
  }
  assert.ok(ids.every(id=>seen.has(id)),role+' must recover all fixture requests');
  const keys=pages.map(q=>q.id),actor=L.literal(u[role].id);const expected=JSON.parse(L.sql(`select coalesce(json_agg(id order by created_at desc,id desc),'[]') from public.portal_request where auth_dv.review_staff(account_id,${actor}::uuid) or auth_dv.review_client(account_id,${actor}::uuid);`));
  assert.deepEqual(keys,expected,role+' chronological order and timestamp ties');results[role]={pages:Math.ceil(pages.length/50),fixture:ids.length};
 }
 for(const role of ['other','outsider','collab']){
  const page=(await owned(u[role])).requests;assert.ok(!page.some(q=>ids.includes(q.id)),role+' cannot see another account');
  assert.equal((await F.rpc(u[role],'inbox',ids[0])).status,403,role+' cannot use unauthorized cursor');
 }
 assert.equal((await F.rpc(u.owner,'inbox',crypto.randomUUID())).status,403,'unknown cursor cannot change access semantics');
 const server=createServer(L.jwt({role:'anon'}),55478);await new Promise(r=>server.listen(55478,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu']});
 try{
  for(const role of ['owner','publisher']){
   const ctx=await browser.newContext({viewport:{width:390,height:1000},reducedMotion:'reduce'}),p=await ctx.newPage();
   await p.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:55478'?r.continue():r.abort());
   await p.goto('http://127.0.0.1:55478/?experience=requests');await p.locator('#labEmail').fill(u[role].email);await p.locator('#labPassword').fill(u[role].credential);await p.getByRole('button',{name:'Entrar al portal',exact:true}).click();await expect(p.locator('#app')).toHaveClass(/on/);
   await p.locator('#topBar .mobile-nav-toggle').click();await p.locator('#side [data-nav=workflow]').click();await expect(p.locator('[data-status]')).toContainText('Bandeja actualizada');
   const first=await owned(u[role]),expectedCursor=first.requests.at(-1).id;await expect(p.locator('[data-inbox-after]')).toHaveAttribute('data-inbox-after',expectedCursor);
   await p.locator('[data-inbox-after]').click();await expect(p.locator('[data-status]')).toContainText('Bandeja actualizada');
   const second=await owned(u[role],expectedCursor);assert.ok(second.requests.length);await expect(p.locator('[data-open="'+second.requests[0].id+'"]')).toBeVisible();
   await ctx.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log(JSON.stringify({status:'PASS',results,denied:['other','outsider','collab'],ui:['owner','publisher'],sameTimestamp:65,fixtureToken:token}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
