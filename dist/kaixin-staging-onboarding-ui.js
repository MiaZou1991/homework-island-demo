/* KAIXIN one-household STAGING page only. No production URL or family data.
 * This page must not be referenced by app.js, child.html or parent.html.
 */
(() => {
 'use strict';
 const STAGE_URL='https://tgnznizqhheiwgdhvwdc.supabase.co';
 const STAGE_KEY='sb_publishable_4XmteXknXrrpVlUAmjCWrQ_luXuRkUV'; // publishable; not a privileged secret
 const $=id=>document.getElementById(id);
 const messages={
  unauthorized:'账号尚未被授权访问 KAIXIN 测试家庭。',
  invalid_invite:'配对码无效、已使用、已撤销或过期。请让家长生成新的配对码。',
  already_bound:'当前账号已绑定其他身份，不允许切换家庭。',
  parent_only:'只有已授权的家长可以执行此操作。',
  need_unbound_child_session:'请在未绑定的孩子设备账号中输入配对码。',
  guest_login_failed:'孩子测试身份暂时创建失败，请重试。',
  signup_failed:'创建账号失败，请检查邮箱、密码及测试库邮件服务配置。',
  invalid_credentials:'登录失败，请检查邮箱密码或先完成邮箱验证。',
  verified_https_redirect_required:'此页面尚未部署在已授权 HTTPS 测试地址，不能在这里创建邮箱账号。请等独立测试地址就绪。',
  server_unavailable:'测试库接口暂时不可用，请重试。',
  session_error:'会话校验失败，请重新登录。',
  sign_out_before_new_device:'当前已有登录身份；请在孩子手机或另一个浏览器中绑定。',
  invalid_invite_response:'服务器返回的配对码格式不正确。',
  invalid_devices_response:'设备列表格式异常，请勿继续操作。',
  invalid_device_id:'设备标识不正确。',
  email_and_password_required:'请填写邮箱和密码。',
  signout_failed:'退出失败，请稍后再试。',
  invalid_family_identity:'此账号不是 KAIXIN 家庭的有效身份。',
  rpc_rejected:'服务器拒绝此操作，请刷新后重试。',
 };
 let flow, current={kind:'signed_out'}, invite='';
 function feedback(message) {$('feedback').textContent=message;}
 function statusError(e) {
  // Do not print raw auth/API errors or secrets to logs or UI.
  feedback(messages[e?.code]||'操作失败。请刷新状态后重试。');
 }
 function busy(id,action) {
  const button=$(id);
  button.addEventListener('click',async event=>{
   event.preventDefault();
   if(button.disabled)return;
   button.disabled=true;
   try { await action(); } catch(e) {statusError(e);} finally {button.disabled=false;}
  });
 }
 function renderRole(state) {
  current=state;
  const kinds={
   signed_out:'尚未登录。家长可验证邮箱后登录，孩子可在另一台设备创建临时身份。',
   unbound:state.anonymous?'临时孩子身份已经建立，尚未绑定 KAIXIN。':'邮箱账号已经登录，等待测试库管理员核实并授予家长权限。',
   parent:'已授权：KAIXIN 家长测试身份。可以生成配对码和撤销孩子设备。',
   child:'已绑定：KAIXIN 孩子设备。无需选择家庭或孩子档案。'
  };
  $('identity-state').textContent=kinds[state.kind]||'未知身份，请退出后重试。';
  $('account-id').textContent=state.userId?'测试用户 ID：'+state.userId+'（此 ID 可用于测试库授权；不要发送密码）':'';
  const parent=state.kind==='parent';
  const child=state.kind==='child';
  const anonUnbound=state.kind==='unbound'&&state.anonymous;
  $('parent-actions').classList.toggle('hidden',!parent);
  $('parent-login').classList.toggle('hidden',parent||child||anonUnbound||state.kind==='unbound'&&!state.anonymous);
  $('child-actions').classList.toggle('hidden',parent||child||state.kind==='unbound'&&!state.anonymous);
  $('guest').disabled=state.kind!=='signed_out';
  $('redeem').disabled=!(anonUnbound);
  $('logout').disabled=state.kind==='signed_out';
  if(!parent){invite='';$('invite-box').classList.add('hidden');}
 }
 async function refresh() {
  const state=await flow.current();
  renderRole(state);
  if(state.kind==='parent')await showDevices();
  return state;
 }
 async function showDevices() {
  const devices=await flow.childDevices();
  const list=$('devices-list');list.replaceChildren();
  if(!devices.length){const p=document.createElement('p');p.className='smallnote';p.textContent='暂无已绑定的孩子设备。';list.append(p);return;}
  devices.forEach((d,i)=>{
   const row=document.createElement('div');row.className='device';
   const title=document.createElement('span');title.textContent='孩子设备 '+(i+1)+' · '+d.id.slice(0,8);
   const button=document.createElement('button');button.type='button';button.className='danger';button.textContent='撤销设备';
   button.addEventListener('click',async()=>{
    if(!window.confirm('确定撤销这台孩子测试设备的 KAIXIN 访问权限？'))return;
    button.disabled=true;
    try {
     const revoked=await flow.revokeDevice(d.id);
     feedback(revoked?'已撤销设备访问。旧设备需重新配对。':'设备已经撤销或不存在。');
     await showDevices();
    }catch(e){statusError(e);button.disabled=false;}
   });
   row.append(title,button);list.append(row);
  });
 }
 async function start() {
  if(!window.supabase?.createClient||!window.KaixinStagingOnboarding?.create) {
   feedback('测试界面依赖的脚本未能加载，请检查网络连接与 CDN 访问。');
   return;
  }
  // Separate storage key: impossible for this QA page to read legacy KAIXIN
  // homework localStorage or to use production Supabase session.
  const client=window.supabase.createClient(STAGE_URL,STAGE_KEY,{
   auth:{storageKey:'kaixin_staging_auth_preview_v1',persistSession:true,
    autoRefreshToken:true,detectSessionInUrl:true}
  });
  const redirectTo=location.protocol==='https:'?
    location.origin+location.pathname:null;
  flow=window.KaixinStagingOnboarding.create(client,{redirectTo});
  busy('refresh',async()=>{await refresh();feedback('测试身份已重新核实。');});
  busy('logout',async()=>{
   await flow.logout();invite='';$('invite-value').textContent='';
   $('pair-code').value='';await refresh();feedback('已退出本设备的测试身份。');
  });
  busy('signup',async()=>{
   const email=$('email').value.trim(),password=$('password').value;
   const result=await flow.signupParent(email,password);$('password').value='';
   feedback('如邮箱验证开启，请查收验证邮件。验证后返回页面登录。账号不会自动获得家长权限。');
   if(result.userId)$('account-id').textContent='待验证的测试账号已创建；验证邮箱后登录查看用户 ID。';
  });
  $('parent-form').addEventListener('submit',async e=>{
   e.preventDefault();const submit=$('parent-form').querySelector('button[type="submit"]');
   submit.disabled=true;
   try{
    await flow.loginParent($('email').value,$('password').value);
    $('password').value='';const state=await refresh();
    feedback(state.kind==='parent'?'家长身份确认成功。':'邮箱登录成功，等待测试库管理员授权该家长账号。');
   }catch(e){statusError(e);}finally{submit.disabled=false;}
  });
  busy('guest',async()=>{await flow.createGuest();await refresh();feedback('孩子测试身份已建立，请输入家长的配对码。');});
  busy('generate',async()=>{
   const result=await flow.createInvite();
   invite=result.token;$('invite-value').textContent=invite;
   $('invite-expires').textContent='有效期至：'+new Date(result.expiresAt).toLocaleString('zh-CN');
   $('invite-box').classList.remove('hidden');
   feedback('新配对码已经生成。旧配对码立即失效。');
  });
  busy('copy-code',async()=>{
   if(!invite)return feedback('请先生成配对码。');
   if(!navigator.clipboard?.writeText)return feedback('本环境无法自动复制；可长按上方配对码复制。');
   await navigator.clipboard.writeText(invite);
   feedback('配对码已复制。请仅用于孩子设备，不要分享到公共空间。');
  });
  busy('redeem',async()=>{
   await flow.redeemInvite($('pair-code').value);
   $('pair-code').value='';await refresh();
   feedback('孩子设备已经绑定 KAIXIN 测试家庭。');
  });
  busy('devices-refresh',async()=>{await showDevices();feedback('孩子设备清单已更新。');});
  await refresh();feedback('测试页面已就绪。仅连接独立 Supabase 测试库。');
 }
 document.addEventListener('DOMContentLoaded',()=>{start().catch(statusError);});
})();
