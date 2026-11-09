// KAIXIN staging-only onboarding UI acceptance. All Supabase responses are mocked;
// this proves UI behavior, not real Auth/JWT. Run with local dist/ on port 8189.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE='http://127.0.0.1:8189/kaixin-staging-onboarding.html';
const QA_STUB=`
(function(){
 const s={user:null,role:null,parentApproved:false,invite:null,devices:[],calls:[]};
 window.__KAIXIN_TEST_STATE=s;
 const parentId='11111111-1111-4111-8111-111111111111';
 const childId='22222222-2222-4222-8222-222222222222';
 window.supabase={createClient:(url,key,settings)=>{
  if(url!=='https://tgnznizqhheiwgdhvwdc.supabase.co')throw Error('Not isolated staging');
  if(!key.startsWith('sb_publishable_')||settings?.auth?.storageKey!=='kaixin_staging_auth_preview_v1')
     throw Error('Wrong public key or Auth session storage');
  return {
   auth:{
    getUser:async()=>({data:{user:s.user}}),
    signUp:async()=>({data:{user:{id:parentId},session:null},error:null}),
    signInWithPassword:async()=>{
      s.user={id:parentId,is_anonymous:false,user_metadata:{member_role:'parent'}};
      s.role=s.parentApproved?'parent':null;
      return {data:{user:s.user},error:null};
    },
    signInAnonymously:async()=>{
      s.user={id:childId,is_anonymous:true};s.role=null;
      return {data:{user:s.user},error:null};
    },
    signOut:async()=>{s.user=null;s.role=null;return{error:null}}
   },
   rpc:async(name,args)=>{
    s.calls.push(name);
    switch(name){
      case 'kaixin_identity':
       return {data:s.role?{ok:true,role:s.role,family:'KAIXIN'}:{ok:false,error:'unauthorized'}};
      case 'kaixin_create_child_invite':
       if(s.role!=='parent')return{data:{ok:false,error:'unauthorized'}};
       s.invite='b'.repeat(64);return {data:{ok:true,token:s.invite,expires_at:'2026-11-11T08:00:00Z'}};
      case 'kaixin_redeem_child_invite':
       if(s.role||args.p_token!==s.invite)return {data:{ok:false,error:'invalid_invite'}};
       s.role='child';s.invite=null;s.devices.push({id:childId});
       return{data:{ok:true,family:'KAIXIN',role:'child'}};
      case 'kaixin_list_child_devices':
       return{data:s.role==='parent'?{ok:true,family:'KAIXIN',devices:s.devices}:{ok:false,error:'unauthorized'}};
      case 'kaixin_revoke_child_device':
       if(s.role!=='parent')return{data:{ok:false,error:'unauthorized'}};
       const n=s.devices.length;
       s.devices=s.devices.filter(x=>x.id!==args.p_user_id);
       return{data:{ok:true,revoked:s.devices.length!==n}};
      default:throw Error('Unexpected RPC '+name);
    }
   }
  };
 }};
})();
`;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 try{
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
   route=>route.fulfill({status:200,contentType:'text/javascript',body:QA_STUB}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(BASE,{waitUntil:'load'});
  await page.locator('#identity-state').getByText('尚未登录').waitFor();
  await page.locator('#email').fill('parent@example.test');
  await page.locator('#password').fill('TEST_PASSWORD_123');
  await page.locator('#signup').click();
  await page.locator('#feedback').getByText('查收验证邮件',{exact:false}).waitFor();
  await page.locator('#parent-form button[type="submit"]').click();
  await page.locator('#identity-state').getByText('等待测试库管理员',{exact:false}).waitFor();
  const deniedBefore=await page.evaluate(()=>window.__KAIXIN_TEST_STATE.calls);
  assert.ok(!deniedBefore.includes('kaixin_create_child_invite'),'Unverified parent must never get invite');
  await page.evaluate(()=>{window.__KAIXIN_TEST_STATE.parentApproved=true;window.__KAIXIN_TEST_STATE.role='parent';});
  await page.locator('#refresh').click();
  await page.locator('#parent-actions').waitFor({state:'visible'});
  await page.locator('#generate').click();
  await page.locator('#invite-box').waitFor({state:'visible'});
  const token=await page.locator('#invite-value').textContent();
  assert.equal(token,'b'.repeat(64));
  assert.equal((await page.url()).includes(token),false,'No token in URL');
  await page.locator('#logout').click();
  await page.locator('#guest').click();
  await page.locator('#identity-state').getByText('尚未绑定',{exact:false}).waitFor();
  await page.locator('#pair-code').fill(token);
  await page.locator('#redeem').click();
  await page.locator('#identity-state').getByText('已绑定',{exact:false}).waitFor();
  assert.equal(await page.locator('#parent-actions').isVisible(),false);
  await page.locator('#logout').click();
  await page.locator('#email').fill('parent@example.test');
  await page.locator('#password').fill('TEST_PASSWORD_123');
  await page.locator('#parent-form button[type="submit"]').click();
  await page.locator('#parent-actions').waitFor({state:'visible'});
  await page.locator('#devices-refresh').click();
  const remove=page.locator('#devices-list button.danger');
  await remove.waitFor();
  await remove.click();
  await page.locator('#devices-list').getByText('暂无已绑定').waitFor();
  const state=await page.evaluate(()=>({
    calls:window.__KAIXIN_TEST_STATE.calls,
    deviceCount:window.__KAIXIN_TEST_STATE.devices.length,
    overflow:document.documentElement.scrollWidth>window.innerWidth
  }));
  assert.equal(state.deviceCount,0);
  assert.equal(state.overflow,false,'390px mobile layout must not overflow');
  assert.ok(state.calls.includes('kaixin_revoke_child_device'));
  assert.deepEqual(errors,[],'no page errors');
  console.log('PASS KAIXIN staging UI Chrome 390px: email verification pending parent, authorized login, one-time child pairing, device list and revoke; no real Supabase traffic');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
