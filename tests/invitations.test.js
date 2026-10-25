const test=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const {createInvitationHandler}=require('../server/invitations.cjs');
const local={authUrl:'http://127.0.0.1:55451',restUrl:'http://127.0.0.1:55452',origin:'http://127.0.0.1:55454',serviceKey:'synthetic-dispatch-key'};
const valid={key:'10000000-0000-0000-0000-000000000001',email:'person@synthetic.invalid',reason:'Synthetic test reason'};
async function call(handler,body=valid,patch={}){
 const req=Readable.from([typeof body==='string'?body:JSON.stringify(body)]);
 Object.assign(req,{method:'POST',headers:{origin:local.origin,'content-type':'application/json',authorization:'Bearer synthetic-admin'},...patch});
 const res={writeHead(status){this.status=status;return this;},end(raw){this.data=JSON.parse(raw);}};
 await handler(req,res);return res;
}
test('dispatcher cannot be configured with a hosted service',()=>{
 for(const key of ['authUrl','restUrl','origin'])assert.throws(()=>createInvitationHandler({...local,[key]:'https://production.example'}));
});
test('invalid origin, missing auth, excessive body and recipient cannot reach provider',async()=>{
 let calls=0;const handler=createInvitationHandler({...local,transport:async()=>{calls++;throw Error();}});
 assert.equal((await call(handler,valid,{headers:{origin:'https://untrusted.example','content-type':'application/json'}})).status,403);
 assert.equal((await call(handler,valid,{headers:{origin:local.origin,'content-type':'application/json'}})).status,401);
 assert.equal((await call(handler,'x'.repeat(4097))).status,413);
 assert.equal((await call(handler,{...valid,email:'person@example.com'})).status,400);
 assert.equal((await call(handler,{...valid,redirect:'https://untrusted.example'})).status,400);
 assert.equal(calls,0);
});
test('untrusted JWT rejection never reaches privileged dispatch',async()=>{
 const calls=[];const handler=createInvitationHandler({...local,transport:async(url,options)=>{calls.push([url,options]);return Response.json({}, {status:403});}});
 assert.equal((await call(handler)).status,403);assert.equal(calls.length,1);
 assert.equal(calls[0][1].headers.Authorization,'Bearer synthetic-admin');
});
test('replayed receipt does not dispatch or expose service fields',async()=>{
 let calls=0;const handler=createInvitationHandler({...local,transport:async()=>{calls++;return Response.json(calls===1?{id:'id',state:'sent'}:{id:'id',state:'sent'});}});
 const r=await call(handler);assert.deepEqual(r.data,{id:'id',state:'sent'});assert.equal(calls,2);
});
test('ambiguous provider failure persists uncertainty, not a success or retry',async()=>{
 const bodies=[];let calls=0;const handler=createInvitationHandler({...local,transport:async(url,options)=>{
  calls++;bodies.push(JSON.parse(options.body));
  if(calls===1)return Response.json({id:'id'});
  if(calls===2)return Response.json({id:'id',state:'dispatching',nonce:'nonce',email:valid.email});
  if(calls===3)throw new Error('synthetic uncertain transport');
  return Response.json({id:'id',state:'uncertain'});
 }});
 assert.deepEqual((await call(handler)).data,{id:'id',state:'uncertain'});assert.equal(calls,4);
 assert.equal(bodies[3].p_state,'uncertain');assert.equal(bodies[3].p_target,null);
 assert.deepEqual(Object.keys(bodies[2]),['email']);
});
