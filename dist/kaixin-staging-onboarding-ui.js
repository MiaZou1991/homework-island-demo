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
  signup_password_too_short:'新注册或重设密码至少需要 8 个字符。已有账号可用原密码登录。',
  email_required:'请先填写邮箱地址。',
  password_reset_request_failed:'重置邮件发送失败，请检查测试库邮件设置或稍后重试。',
  password_recovery_session_required:'请先点击邮箱中的密码重置链接返回本页面。',
  password_update_failed:'修改密码失败，请稍后重试。',
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
  $('account-id').textContent=state.userId?(state.kind==='child'?'这台孩子设备的识别码：'+state.userId.slice(0,8)+'（家长在设备清单中对照）\n测试用户 ID：'+state.userId:'测试用户 ID：'+state.userId+'（此 ID 可用于测试库授权；不要发送密码）'):'';
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
 // Previously seeded, synthetic staging accounts. They are NOT identified as the user's phones.
 const HISTORICAL_QA_IDS=new Set([
  '0d1ab085-a7f6-48fb-8114-c9b9ae21c1d6',
  '33333333-3333-4333-8333-333333333333',
  '6c952ade-2ee5-4ddf-a618-5798879fa6f8',
  '79a8696c-fbf3-4dd1-900c-d4da5e6a8712',
  'd64f577c-68f7-49d2-a16b-e44963d339f9'
 ]);
 const DEVICE_LABELS_KEY='kaixin_staging_child_labels_v1';
 function deviceNames(){
  try {
   const stored=JSON.parse(localStorage.getItem(DEVICE_LABELS_KEY)||'{}');
   return stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{};
  }catch(_){return {};}
 }
 function labelDevice(id,name){
  const names=deviceNames();
  if(name)names[id]=name;else delete names[id];
  localStorage.setItem(DEVICE_LABELS_KEY,JSON.stringify(names));
 }
 function makeDeviceRow(device,history){
  const row=document.createElement('div');row.className='device';
  const info=document.createElement('div');
  const heading=document.createElement('div');heading.style.fontWeight='700';
  const names=deviceNames();
  heading.textContent=history?'开发测试身份（非当前手机）':names[device.id]||'孩子手机（待命名）';
  const code=document.createElement('p');code.className='smallnote mono';code.style.margin='6px 0';
  code.textContent='识别码：'+device.id.slice(0,8);
  info.append(heading,code);
  if(history){row.append(info);return row;}
  const controls=document.createElement('div');controls.className='stack';
  const rename=document.createElement('button');rename.type='button';rename.className='secondary';rename.textContent='给设备命名';
  rename.addEventListener('click',()=>{
   const proposed=window.prompt('为这台孩子设备起个名字（只保存在本浏览器）。请先对照孩子手机显示的识别码：'+device.id.slice(0,8),deviceNames()[device.id]||'孩子的手机');
   if(proposed===null)return;
   const name=proposed.trim().slice(0,20);
   if(!name){feedback('设备名称不能为空。');return;}
   try{labelDevice(device.id,name);showDevices().catch(statusError);feedback('设备名称已保存到这台家长设备的浏览器。');}
   catch(_){feedback('浏览器无法保存名称，可继续用识别码对照。');}
  });
  const revoke=document.createElement('button');revoke.type='button';revoke.className='danger';revoke.textContent='撤销设备';
  revoke.addEventListener('click',async()=>{
   if(!window.confirm('确定撤销「'+(deviceNames()[device.id]||device.id.slice(0,8))+'」的测试访问权限？请先核对孩子手机识别码。'))return;
   revoke.disabled=true;
   try{const removed=await flow.revokeDevice(device.id);
    feedback(removed?'已撤销这台测试设备。':'设备已经撤销或不存在。');
    await showDevices();
   }catch(e){statusError(e);revoke.disabled=false;}
  });
  controls.append(rename,revoke);row.append(info,controls);return row;
 }
 async function showDevices() {
  const devices=await flow.childDevices();
  const list=$('devices-list');list.replaceChildren();
  const live=devices.filter(d=>!HISTORICAL_QA_IDS.has(d.id));
  const old=devices.filter(d=>HISTORICAL_QA_IDS.has(d.id));
  const intro=document.createElement('p');intro.className='help';
  intro.textContent='辨认方法：在孩子手机打开此测试页，找到「当前登录身份」下的设备识别码（ID 前 8 位），与这里核对。可以给新绑定设备命名；名称仅保存在当前家长浏览器。';
  list.append(intro);
  const headline=document.createElement('h3');headline.style.margin='14px 0 8px';
  headline.textContent='新绑定的孩子设备（'+live.length+'）';list.append(headline);
  if(!live.length){const p=document.createElement('p');p.className='smallnote';
   p.textContent='暂无新绑定的孩子手机。先用另一台手机完成一次性配对，然后点「刷新设备清单」。';list.append(p);
  }else live.forEach(d=>list.append(makeDeviceRow(d,false)));
  if(old.length){
   const details=document.createElement('details');details.style.marginTop='20px';
   const summary=document.createElement('summary');summary.style.cursor='pointer';summary.style.fontWeight='700';
   summary.textContent='开发历史测试记录（'+old.length+' 条，点此展开）';
   const note=document.createElement('p');note.className='smallnote';
   note.textContent='这几条是开发联调时保留的测试账号，不代表你的手机；为避免误操作已单独折叠，不建议撤销。';
   details.append(summary,note);old.forEach(d=>details.append(makeDeviceRow(d,true)));list.append(details);
  }
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
  busy('reset-password',async()=>{
    const email=$('email').value.trim();
    await flow.requestPasswordReset(email);
    feedback('如果该邮箱已有测试账号，密码重置邮件将发送到该邮箱。请检查收件箱及垃圾邮件。');
  });
  busy('change-password',async()=>{
    const password=$('new-password').value;
    await flow.updatePassword(password);
    $('new-password').value='';
    $('recovery-box').classList.add('hidden');
    feedback('测试密码已更新。现在可以使用新密码登录。');
    await refresh();
  });
  client.auth.onAuthStateChange((event)=>{
    if(event==='PASSWORD_RECOVERY') {
      $('recovery-box').classList.remove('hidden');
      feedback('邮箱重置链接验证成功，请在下方设置至少 8 位新密码。');
    }
  });
  if(location.hash.includes('type=recovery') || location.search.includes('type=recovery')) {
    $('recovery-box').classList.remove('hidden');
  }
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
