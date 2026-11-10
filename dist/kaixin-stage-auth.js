/* Isolated KAIXIN STAGING auth gate. Production HTML never imports this file.
 * Uses verified Supabase Auth JWT and server-side KAIXIN member role; no family switch.
 */
(() => {
 'use strict';
 const url='https://tgnznizqhheiwgdhvwdc.supabase.co';
 const key='sb_publishable_4XmteXknXrrpVlUAmjCWrQ_luXuRkUV';
 let instance=null;
 const productionHost='miazou1991.github.io';
 function assertStage() {
   if(window.__KAIXIN_STAGE_BUILD__!==true ||location.hostname===productionHost)
     throw new Error('not_isolated_stage_origin');
 }
 function client() {
   assertStage();
   if(!instance) {
     if(!window.supabase?.createClient)throw new Error('staging_sdk_unavailable');
     instance=window.supabase.createClient(url,key,{auth:{
       storageKey:'kaixin_staging_auth_preview_v1',persistSession:true,
       autoRefreshToken:true,detectSessionInUrl:true
     }});
   }
   return instance;
 }
 function showGate(message,role) {
   let root=document.getElementById('kaixin-stage-gate');
   if(!root){
     root=document.createElement('section');
     root.id='kaixin-stage-gate';
     root.setAttribute('role','status');
     root.style.cssText='position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:22px;background:#f6f0db;color:#5b6044;font-family:system-ui,sans-serif';
     document.body.appendChild(root);
   }
   root.replaceChildren();
   const box=document.createElement('div');
   box.style.cssText='background:#fffaf1;border:2px solid #9dbd91;border-radius:24px;padding:26px;max-width:390px;box-shadow:0 12px 40px #56754e28;text-align:center';
   const title=document.createElement('h2');
   title.textContent='KAIXIN · 独立测试版';
   const description=document.createElement('p');
   description.textContent=message;
   const link=document.createElement('a');
   link.href='index.html';
   link.textContent=role==='parent'?'家长登录／授权':'孩子绑定／查看登录';
   link.style.cssText='display:inline-block;padding:12px 18px;border-radius:14px;background:#7faf66;color:white;text-decoration:none;font-weight:700';
   box.append(title,description,link);root.appendChild(box);
   document.documentElement.classList.add('kaixin-stage-gated');
 }
 function hideGate(){
   document.getElementById('kaixin-stage-gate')?.remove();
   document.documentElement.classList.remove('kaixin-stage-gated');
 }
 async function verifiedRole(requiredRole) {
   assertStage();
   const c=client();
   const {data:userData,error:userError}=await c.auth.getUser();
   if(userError||!userData?.user){showGate('请先完成测试身份验证。','parent');return false;}
   const {data,error}=await c.rpc('kaixin_identity');
   if(error||data?.ok!==true||data?.family!=='KAIXIN'
      ||data?.role!==requiredRole){
     showGate(requiredRole==='parent'
       ?'这个账号尚未获授权为 KAIXIN 测试家长。请先验证邮箱并等待授权。'
       :'这台设备尚未绑定 KAIXIN 测试家庭，或授权已撤销。',requiredRole);
     return false;
   }
   hideGate();
   return true;
 }
 window.KaixinStageAuth=Object.freeze({client,verifiedRole,showGate,hideGate});
})();
