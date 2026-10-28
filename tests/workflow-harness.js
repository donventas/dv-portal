'use strict';
// No service credential, account adoption, role selector or automatic login.
let session=null,boot=0;
const login=document.getElementById('login'),status=document.getElementById('login-status');
function wordmark(){document.querySelector('header img').src='/brand/donventas-wordmark-b6'+(DVAppearance.getResolvedTheme()==='dark'?'-reverse':'')+'.svg';}
wordmark();window.addEventListener('dv:appearancechange',wordmark);
async function request(path,body,token){
 const r=await fetch(path,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const data=await r.json().catch(()=>null);
 if(!r.ok){const e=Error(data?.message||'WORKFLOW_UNCONFIRMED');e.definite=r.status>=400&&r.status<500;throw e;}return data;
}
login.onsubmit=async e=>{
 e.preventDefault();const fields=new FormData(login),generation=++boot;status.textContent='Validando sesión…';login.querySelector('button').disabled=true;
 try{
  const result=await request('/auth/v1/token?grant_type=password',{email:fields.get('email'),password:fields.get('password')});
  if(generation!==boot)return;session=result;login.reset();login.hidden=true;document.getElementById('logout').hidden=false;
  const rpc=async(action,id=null,data={},key=null)=>{if(generation!==boot||!session)throw Error('WORKFLOW_FORBIDDEN');const r=await request('/rest/v1/rpc/portal_workflow_v1',{p_action:action,p_id:id,p_data:data,p_key:key},session.access_token);if(generation!==boot)throw Error('WORKFLOW_FORBIDDEN');return r;};
  let draft=null;try{await request('/rest/v1/rpc/portal_draft_open_v1',{},session.access_token);draft=()=>request('/rest/v1/rpc/portal_draft_open_v1',{},session.access_token);}catch{}
  DVWorkflowUI.mount(document.getElementById('workflow'),{rpc,...(draft?{draft}:{})},session.user.id);
 }catch{status.textContent='No se pudo iniciar sesión. Revisa tu cuenta de prueba.';}
 finally{login.querySelector('button').disabled=false;}
};
document.getElementById('logout').onclick=async()=>{
 const token=session?.access_token;boot++;session=null;DVWorkflowUI.reset();document.getElementById('workflow').replaceChildren();login.hidden=false;document.getElementById('logout').hidden=true;status.textContent='Sesión cerrada en esta pantalla.';
 if(token)try{await request('/auth/v1/logout',{},token);}catch{status.textContent='Acceso retirado de esta pantalla; cierre remoto sin confirmar.';}
};
