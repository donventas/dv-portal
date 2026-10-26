'use strict';
// Local-only dispatcher candidate. No deployment entry point and no embedded keys.
const assert=require('node:assert/strict');
function createInvitationHandler({authUrl,restUrl,serviceKey,origin,transport=fetch}) {
  for(const value of [authUrl,restUrl,origin]) { const u=new URL(value); assert.equal(u.hostname,'127.0.0.1');assert.equal(u.protocol,'http:');assert.equal(u.pathname,'/');assert.equal(u.search,'');assert.equal(u.hash,''); }
  assert.ok(serviceKey);
  async function request(base,route,token,body) {
    const r=await transport(base+route,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
    return {status:r.status,data:await r.json().catch(()=>null)};
  }
  const rpc=(name,token,body)=>request(restUrl,'/rpc/'+name,token,body);
  return async function handle(req,res) {
    const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    if(req.method!=='POST')return reply(405,{error:'METHOD_REQUIRED'});
    if(req.headers.origin!==origin || req.headers['content-type']?.split(';')[0]!=='application/json')return reply(403,{error:'ORIGIN_REQUIRED'});
    const token=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.headers.authorization||'')?.[1];
    if(!token)return reply(401,{error:'AUTH_REQUIRED'});
    let body;try{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)return reply(413,{error:'BODY_TOO_LARGE'});}body=JSON.parse(raw);}catch{return reply(400,{error:'REQUEST_INVALID'});}
    if(!body||Object.keys(body).sort().join(',')!=='email,key,reason'||typeof body.email!=='string'||!/^[^\s@]+@synthetic\.invalid$/i.test(body.email.trim()))return reply(400,{error:'SYNTHETIC_RECIPIENT_REQUIRED'});
    let item;
    try {
      const intent=await rpc('portal_invitation_request_v1',token,{p_key:body.key,p_email:body.email,p_reason:body.reason});
      if(intent.status!==200)return reply(intent.status===401?401:intent.status===409?409:403,{error:'INVITATION_NOT_AUTHORIZED'});
      const claim=await rpc('portal_invitation_claim_v1',serviceKey,{p_id:intent.data.id});
      if(claim.status!==200||!claim.data)return reply(503,{error:'INVITATION_RETRY_SAME_INTENTION'});
      item=claim.data;
      if(!item.nonce)return reply(200,{id:item.id,state:item.state==='dispatching'?'uncertain':item.state});
      let state='uncertain',target=null;
      try {
        const sent=await request(authUrl,'/invite?redirect_to='+encodeURIComponent(origin+'/'),serviceKey,{email:item.email});
        const uid=sent.data?.id||sent.data?.user?.id;
        if(sent.status===200&&/^[0-9a-f-]{36}$/.test(uid||'')){state='sent';target=uid;}
        else if(sent.status>=400&&sent.status<500){state='failed';}
      } catch { /* Outcome unknown: never retry a provider dispatch automatically. */ }
      const saved=await rpc('portal_invitation_complete_v1',serviceKey,{p_id:item.id,p_nonce:item.nonce,p_state:state,p_target:target});
      if(saved.status!==200)return reply(202,{id:item.id,state:'uncertain'});
      return reply(200,{id:item.id,state});
    } catch { return reply(item?202:503,item?{id:item.id,state:'uncertain'}:{error:'INVITATION_RETRY_SAME_INTENTION'}); }
  };
}
module.exports={createInvitationHandler};
