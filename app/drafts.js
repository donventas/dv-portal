/* H1.2 isolated contract. No privileged credential or hosted capability admission. */
window.DVDrafts=(function(){
  'use strict';
  let epoch=0;
  function enabled(){
    const r=window.DVEnv?.resolution(),c=r?.config;
    try{return r.state==='SANDBOX'&&r.originClass==='LOCAL'&&location.hostname==='127.0.0.1'&&c?.features?.h12Drafts==='isolated-v1'&&new URL(c.backendUrl).origin===location.origin;}catch{return false;}
  }
  function gate(){if(!enabled())throw Error('DRAFT_UNAVAILABLE');}
  function invalidate(){
    DVSupa.invalidateIdentity();
    const auth=document.getElementById('auth');
    if(auth&&window.DVAuth){auth.style.display='';DVAuth.render();}
  }
  function identity(){const s=window.DVStore?.session();return JSON.stringify([epoch,DVEnv.fingerprint(),s?.userId,s?.accountId,s?.generation]);}
  function authUser(result){
    if(result.error){
      if([401,403].includes(result.error.status)||result.error.name==='AuthSessionMissingError'||result.error.code==='session_not_found'){invalidate();throw Error('AUTH_REVALIDATION_REQUIRED');}
      throw Error('DRAFT_UNCONFIRMED');
    }
    if(!result.data?.user){invalidate();throw Error('AUTH_REVALIDATION_REQUIRED');}
    return result.data.user.id;
  }
  async function rpc(name,args={},boot=false){
    gate();const initial=identity(),c=await DVSupa.client();
    const u=await c.auth.getUser();
    const actor=authUser(u),s=window.DVStore?.session();
    if(!boot&&(!s||s.userId!==actor)){invalidate();throw Error('IDENTITY_STALE');}
    const r=await c.rpc(name,args).abortSignal(AbortSignal.timeout(15000));
    if(initial!==identity())throw Error('IDENTITY_STALE');
    if(r.error){
      const safe=['DRAFT_CONFLICT','DRAFT_KEY_CONFLICT','DRAFT_INVALID','DRAFT_FORBIDDEN','DRAFT_CURSOR_INVALID','ASSET_INVALID','ASSET_LIMIT','ASSET_KEY_CONFLICT','ASSET_NOT_FOUND'];
      const message=safe.includes(r.error.message)?r.error.message:'DRAFT_UNCONFIRMED';
      if(r.error.code==='42501'||r.error.code==='PGRST301'){invalidate();throw Error('AUTH_REVALIDATION_REQUIRED');}
      throw Error(message);
    }
    const current=await c.auth.getUser();
    if(authUser(current)!==actor){invalidate();throw Error('IDENTITY_STALE');}
    if(initial!==identity())throw Error('IDENTITY_STALE');
    if(!r.data||r.data.contract!=='portal-draft-v1')throw Error('DRAFT_UNCONFIRMED');
    return r.data;
  }
  async function bootstrap(){
    const r=await rpc('portal_draft_open_v1',{},true);
    if(!r.actor||!r.account)throw Error('DRAFT_UNCONFIRMED');
    const seed=window.DV_SEED;
    Object.keys(seed).forEach(k=>{if(Array.isArray(seed[k])&&k!=='CAPAS')seed[k]=[];});
    seed.users=[r.actor];seed.accounts=[r.account];
    return seed;
  }
  async function open(){const r=await rpc('portal_draft_open_v1');if(r.document)DVDraftContract.validate(r.document);return r;}
  async function save(key,version,document){
    gate();const value=DVDraftContract.validate(document);
    const result=await DVWriteGuard.run('draft.save','brand-draft',{requiresAuth:true},async()=>{
      try{return await rpc('portal_draft_save_v1',{p_key:key,p_expected:version,p_document:value});}
      catch(error){return {safeError:error.message};}
    });
    if(result?.safeError)throw Error(result.safeError);
    if(!result||result.authorized===false||result.version!==version+1||result.operationKey!==key)throw Error('DRAFT_UNCONFIRMED');
    return result;
  }
  function history(after=0,snapshot=null){return rpc('portal_draft_history_v1',{p_after:after,p_snapshot:snapshot});}
  async function upload(intent){
    gate();
    const result=await DVWriteGuard.run('draft.save','brand-asset',{requiresAuth:true},async()=>{
      try{return await rpc('portal_draft_asset_put_v1',intent);}catch(error){return {safeError:error.message};}
    });
    if(result?.safeError)throw Error(result.safeError);
    if(!result?.asset||result.asset.id!==intent.p_key)throw Error('DRAFT_UNCONFIRMED');
    return result.asset;
  }
  function asset(id){return rpc('portal_draft_asset_get_v1',{p_id:id});}
  function resetTransient(){epoch++;window.DVWorkflowUI?.reset();window.DVDraftUI?.resetTransient();}
  return {enabled,bootstrap,open,save,history,upload,asset,resetTransient};
})();
