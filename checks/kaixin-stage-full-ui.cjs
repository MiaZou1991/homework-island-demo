/* Real browser QA of full production UI cloned under isolated STAGING build.
 * Supabase Auth/HTTP mocked for this test; standalone genuine JWT/RLS tests live
 * in PR #27. Do NOT confuse browser stubs with real production integration.
 */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const URL='http://127.0.0.1:8191';
const sdkMock=`(()=>{
 const state={role:window.__qaRole||null,revision:4,payload:null,calls:[]};
 window.__qaRemote=state;
 window.supabase={createClient:(url,key,options)=>{
  if(url!=='https://tgnznizqhheiwgdhvwdc.supabase.co'
    ||!key.startsWith('sb_publishable_')
    ||options?.auth?.storageKey!=='kaixin_staging_auth_preview_v1')throw Error('wrong staging config');
  return {
   auth:{
    getUser:async()=>state.role?({data:{user:{id:state.role==='parent'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222',is_anonymous:state.role!=='parent'}},error:null}):({data:{user:null},error:{name:'AuthSessionMissingError',message:'Auth session missing'}}),
    signInAnonymously:async()=>{state.role='unbound';return{data:{user:{id:'22222222-2222-4222-8222-222222222222'}},error:null}},
    getSession:async()=>({data:{session:state.role?{access_token:'test'}:null}}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
   },
   rpc:async(name,body={})=>{
    state.calls.push(name);
    if(name==='kaixin_identity')return{data:['parent','child'].includes(state.role)?{ok:true,family:'KAIXIN',role:state.role}:{ok:false,error:'unauthorized'},error:null};
    if(name==='kaixin_list_child_devices')return{data:{ok:true,family:'KAIXIN',devices:[
      {id:'33333333-3333-4333-8333-333333333333'},
      {id:'b71b98fd-51ee-479c-a029-410a62a317bd'}]},error:null};
    if(name==='family_load_v2'){
      if(!state.role)return{data:{ok:false,error:'unauthorized'},error:null};
      if(state.payload===null){
       // Exact domain defaults from the app itself, preserving all side-effect fields.
       if(window.__qaSparse){
         state.payload={homework:[{id:'qa-old-fixture',subject:'数学',content:'只用于测试',done:false,attachments:[]}],qaHistory:{preserved:true}};
       }else{
         state.payload=JSON.parse(JSON.stringify(window.getData()));
         state.payload.recurringTasks=[];
       if(state.role==='child')state.payload.homework.push({id:'qa_child_assigned',
         subject:'数学',content:'孩子端完成与撤销验收',deadline:'2026-11-11T20:00:00',
         done:false,attachments:[],createdAt:'2026-11-10T00:00:00Z'});
       }
      }
      return{data:{ok:true,revision:state.revision,payload:JSON.parse(JSON.stringify(state.payload))},error:null};
    }
    if(name==='kaixin_child_set_homework_done'){
      if(state.role!=='child')return{data:{ok:false,error:'unauthorized'},error:null};
      const item=state.payload.homework.find(h=>h.id===body.p_homework_id);
      if(!item)return{data:{ok:false,error:'not_found'},error:null};
      if(Boolean(item.done)!==body.p_expected_done)return{data:{ok:false,error:'conflict'},error:null};
      item.done=body.p_done;
      item.completedAt=body.p_done?'2026-11-10T00:00:00Z':null;
      state.revision++;
      return{data:{ok:true,revision:state.revision,duplicate:false},error:null};
    }
    if(name==='family_save_v2'){
      if(state.role!=='parent')return{data:{ok:false,error:'unauthorized'},error:null};
      if(body.p_expected_revision!==state.revision)return{data:{ok:false,error:'conflict',revision:state.revision},error:null};
      state.payload=JSON.parse(JSON.stringify(body.p_payload));
      state.revision++;
      return{data:{ok:true,revision:state.revision,duplicate:false},error:null};
    }
    throw Error('unrecognized mock RPC '+name);
   }
  };
 }};
})();`;
async function boot(browser,role,route='child.html',sparse=false){
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({role,sparse})=>{window.__qaRole=role;window.__qaSparse=sparse;},{role,sparse});
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js',
   r=>r.fulfill({status:200,contentType:'text/javascript',body:sdkMock}));
 await page.goto(URL+'/'+route,{waitUntil:'domcontentloaded'});
 return{page,errors};
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  // An unauthenticated visitor must not see any family-specific data or cloud read.
  const anon=await boot(browser,null);
  await anon.page.locator('#kaixin-stage-gate').waitFor({state:'visible'});
  assert.equal(await anon.page.evaluate(()=>document.documentElement.classList.contains('kaixin-stage-gated')),true);
  assert.equal(await anon.page.locator('.phone').isVisible(),false);
  assert.equal((await anon.page.evaluate(()=>window.__qaRemote.calls)).includes('family_load_v2'),false);
  await anon.page.close();

  // Fresh iPhone Safari: getUser() without a session would raise
  // AuthSessionMissingError. The child must still be able to create a guest.
  const fresh=await boot(browser,null,'index.html');
  await fresh.page.waitForFunction(()=>document.getElementById('feedback')?.textContent?.includes('测试页面已就绪'),{timeout:10000});
  assert.equal(await fresh.page.locator('#guest').isEnabled(),true);
  await fresh.page.locator('#guest').click();
  await fresh.page.getByText('临时孩子身份已经建立', {exact:false}).waitFor({timeout:10000});
  assert.equal(await fresh.page.locator('#redeem').isEnabled(),true);
  assert.deepEqual(fresh.errors,[],'fresh Safari child pairing must not crash due to missing Auth session');
  await fresh.page.close();

  const onboarding=await boot(browser,'parent','index.html');
  await onboarding.page.locator('#devices-list details summary').waitFor();
  assert.match(await onboarding.page.locator('#devices-list h3').textContent(),/新绑定的孩子设备（1）/);
  assert.match(await onboarding.page.locator('#devices-list details summary').textContent(),/开发历史测试记录（1 条/);
  assert.match(await onboarding.page.locator('#devices-list').textContent(),/b71b98fd/);
  onboarding.page.once('dialog',d=>d.accept('孩子测试手机'));
  await onboarding.page.getByRole('button',{name:'给设备命名'}).click();
  await onboarding.page.getByText('孩子测试手机').waitFor();
  assert.deepEqual(onboarding.errors,[],'staging onboarding must identify, fold and rename devices');
  await onboarding.page.close();

  const parent=await boot(browser,'parent','parent.html');
  await parent.page.waitForFunction(()=>window.IslandSync?.getStatus?.().current==='synced',{timeout:15000});
  assert.equal(await parent.page.locator('#kaixin-stage-gate').count(),0);
  assert.ok((await parent.page.title()).includes('独立测试'));
  assert.equal(await parent.page.evaluate(()=>DEMO_KEY.includes('KAIXIN_STAGE_QA')),true);
  assert.equal(await parent.page.evaluate(()=>window.__qaRemote.calls.includes('family_load_v2')),true);
  const id='qa_parent_add_20261110';
  await parent.page.evaluate(id=>{
    const d=getData();
    d.homework.push({id,subject:'语文',content:'模拟测试作业，不含真实姓名',
      deadline:'2026-11-11T20:00:00',duration:10,done:false,
      attachments:[],createdAt:'2026-11-10T00:00:00Z'});
    saveData(d);
  },id);
  await parent.page.waitForFunction(id=>
    window.__qaRemote.payload.homework.some(h=>h.id===id)
    &&window.__qaRemote.calls.includes('family_save_v2')
    &&window.IslandSync.getStatus().current==='synced',
   id,{timeout:15000});
  // Simulate a child on another device completing homework in the server:
  // the visible upgraded parent screen MUST reflect the remote update.
  const upstream=await parent.page.evaluate(async id=>{
    const before=document.querySelector('#upgrade-root')?.textContent||'';
    const record=window.__qaRemote.payload.homework.find(h=>h.id===id);
    record.done=true;record.completedAt=new Date().toISOString();
    window.__qaRemote.revision++;
    await window.IslandSync.checkRemote();
    return {before,after:document.querySelector('#upgrade-root')?.textContent||'',
      cloudDone:getData().homework.find(h=>h.id===id)?.done};
  },id);
  assert.equal(upstream.cloudDone,true,'child completion must be pulled to parent');
  assert.notEqual(upstream.after,upstream.before,
    'parent upgraded visible page must redraw when the child completes');
  const opposite=await parent.page.evaluate(async id=>{
    const before=document.querySelector('#upgrade-root')?.textContent||'';
    const record=window.__qaRemote.payload.homework.find(h=>h.id===id);
    record.done=false;record.completedAt=null;window.__qaRemote.revision++;
    await window.IslandSync.checkRemote();
    return {before,after:document.querySelector('#upgrade-root')?.textContent||'',
      cloudDone:getData().homework.find(h=>h.id===id)?.done};
  },id);
  assert.equal(opposite.cloudDone,false);
  assert.notEqual(opposite.after,opposite.before,
    'parent upgraded visible page must redraw when completion is undone');
  assert.deepEqual(parent.errors,[],'parent staging UI must not produce JS errors');
  await parent.page.close();

  // Actual staging QA payload is sparse and lacks the UI's other top-level fields.
  // Creating a test assignment must NOT upload missing defaults or mutate QA history.
  const sparse=await boot(browser,'parent','parent.html',true);
  await sparse.page.waitForFunction(()=>window.IslandSync?.getStatus?.().current==='synced',{timeout:15000});
  await sparse.page.evaluate(()=>{
    const d=getData();d.homework.push({id:'qa-sparse-parent-new',subject:'英语',content:'安全同步测试',
      deadline:'2026-11-11T21:00:00',duration:10,done:false,attachments:[],createdAt:'2026-11-10T00:00:00Z'});
    saveData(d);
  });
  await sparse.page.waitForFunction(()=>window.__qaRemote.payload.homework.some(h=>h.id==='qa-sparse-parent-new')
    &&window.IslandSync?.getStatus?.().current==='synced',{timeout:15000});
  assert.deepEqual(await sparse.page.evaluate(()=>window.__qaRemote.payload.qaHistory),{preserved:true});
  assert.equal(await sparse.page.evaluate(()=>Object.hasOwn(window.__qaRemote.payload,'points')),false,
    'UI-only default points must NOT be uploaded to staging sparse fixture');
  assert.deepEqual(sparse.errors,[],'sparse staging fixture must not crash the family UI');
  await sparse.page.close();

  // Isolated child uses the restricted RPC; completion and undo never earn
  // points or touch historical growth fields.
  const childToggle=await boot(browser,'child','child.html');
  await childToggle.page.waitForFunction(()=>window.IslandSync?.getStatus?.().current==='synced',{timeout:15000});
  await childToggle.page.evaluate(()=>completeHomework('qa_child_assigned'));
  await childToggle.page.waitForFunction(()=>window.__qaRemote.payload.homework.find(h=>h.id==='qa_child_assigned')?.done===true
    &&window.IslandSync.getStatus().current==='synced',{timeout:15000});
  assert.equal(await childToggle.page.evaluate(()=>window.__qaRemote.calls.includes('kaixin_child_set_homework_done')),true);
  assert.equal(await childToggle.page.evaluate(()=>window.__qaRemote.calls.includes('family_save_v2')),false);
  assert.equal(await childToggle.page.evaluate(()=>window.__qaRemote.payload.points),0);
  await childToggle.page.evaluate(()=>undoHomework('qa_child_assigned'));
  await childToggle.page.waitForFunction(()=>window.__qaRemote.payload.homework.find(h=>h.id==='qa_child_assigned')?.done===false
    &&window.IslandSync.getStatus().current==='synced',{timeout:15000});
  assert.equal(await childToggle.page.evaluate(()=>window.__qaRemote.payload.points),0);
  assert.deepEqual(childToggle.errors,[],'child completion/undo must work without page errors');
  await childToggle.page.close();

  const child=await boot(browser,'child','child.html');
  await child.page.waitForFunction(()=>window.IslandSync?.getStatus?.().current==='synced',{timeout:18000});
  assert.equal(await child.page.locator('#kaixin-stage-gate').count(),0);
  await child.page.evaluate(()=>{
    const d=getData();
    d.homework.push({id:'qa_child_local',subject:'数学',content:'本机未同步的测试作业',done:false});
    saveData(d);
  });
  await child.page.waitForFunction(()=>window.IslandSync?.getStatus?.().current==='blocked',{timeout:9000});
  assert.equal((await child.page.evaluate(()=>window.__qaRemote.calls)).includes('family_save_v2'),false,
    'child write API not approved: must NEVER post parent snapshot RPC');
  assert.equal(await child.page.evaluate(()=>window.IslandSync.getStatus().message.includes('本机内容保留')),true);
  assert.deepEqual(child.errors,[],'child staging UI must not produce JS errors');
  await child.page.close();
  console.log('PASS isolated KAIXIN full-UI 390px: unauthorized gate; parent Auth + real UI add operation CAS/readback; child write fail-closed and original UI intact (mocked server)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
