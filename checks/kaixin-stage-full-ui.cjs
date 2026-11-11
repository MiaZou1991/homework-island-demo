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
       const persisted=window.sessionStorage.getItem('__qaFixedCloud');
       if(persisted){state.payload=JSON.parse(persisted);}else{
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
      }
      return{data:{ok:true,revision:state.revision,payload:JSON.parse(JSON.stringify(state.payload))},error:null};
    }
    if(name==='kaixin_homework_last_change_v2')return{data:{ok:true,exists:true,
      at:'2026-11-11T12:55:00Z',actor:'孩子',action:'修改作业',fields:['content']},error:null};
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
  // Simulate a slow third-party CDN: it must NOT delay DOMContentLoaded,
  // trigger the old 9s fatal loader, or bypass Auth gating.
  const slowSdk=await browser.newPage({viewport:{width:390,height:844}});
  await slowSdk.addInitScript(()=>{window.__qaRole='child';});
  await slowSdk.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js',
    async route=>{
      await new Promise(resolve=>setTimeout(resolve,10000));
      await route.fulfill({status:200,contentType:'text/javascript',body:sdkMock});
    });
  const startedAt=Date.now();
  await slowSdk.goto(URL+'/child.html',{waitUntil:'domcontentloaded'});
  assert.ok(Date.now()-startedAt<8000,
    'slow remote Supabase SDK must not delay local island initial render');
  await slowSdk.locator('#upgrade-root .up-main').count(); // DOM is rendered independently
  await slowSdk.waitForFunction(()=>document.querySelector('#upgrade-root > *')!==null,{timeout:6000});
  await slowSdk.waitForFunction(()=>window.IslandSync?.getStatus?.().current==='synced',{timeout:17000});
  assert.equal(await slowSdk.locator('#kaixin-stage-gate').count(),0);
  await slowSdk.close();

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

  // Same authorized parent login may VIEW the real child UI without pairing
  // a child device. This access is strictly read-only.
  const parentPreview=await boot(browser,'parent','child.html?parentPreview=1');
  await parentPreview.page.waitForFunction(()=>
    window.IslandSync?.getStatus?.().current==='synced',{timeout:15000});
  assert.equal(await parentPreview.page.evaluate(()=>
    window.KaixinStageSyncDiagnostics.getState().role),'parent-preview');
  assert.equal(await parentPreview.page.locator('#kaixin-stage-gate').count(),0);
  assert.equal(await parentPreview.page.locator('#kaixin-stage-preview-label').isVisible(),true);
  assert.equal(await parentPreview.page.locator('.up-nav [data-up]').count(),3);
  const previewWrites=await parentPreview.page.evaluate(async()=>{
    const h=getData().homework[0],before=Boolean(h.done);
    const writesBefore=window.__qaRemote.calls.filter(c=>
      c==='family_save_v2'||c==='kaixin_child_set_homework_done').length;
    completeHomework(h.id);
    const denied=saveData({...getData(),kidName:'read-only forbidden update'})===false;
    document.querySelector('#kaixin-stage-refresh').click();
    await new Promise(resolve=>setTimeout(resolve,120));
    const writesAfter=window.__qaRemote.calls.filter(c=>
      c==='family_save_v2'||c==='kaixin_child_set_homework_done').length;
    return {before,after:Boolean(getData().homework[0].done),
      denied,writesBefore,writesAfter};
  });
  assert.equal(previewWrites.before,previewWrites.after,
    'parent preview cannot toggle homework even in local storage');
  assert.equal(previewWrites.denied,true,'all generic saves are disabled in read-only preview');
  assert.equal(previewWrites.writesAfter,previewWrites.writesBefore,
    'viewing child screen as parent must never invoke a write RPC');
  assert.deepEqual(parentPreview.errors,[]);
  await parentPreview.page.close();

  // Without an explicit preview URL, the independent child device still
  // requires its own server-authorized child identity.
  const unpairedChild=await boot(browser,'parent','child.html');
  await unpairedChild.page.waitForFunction(()=>
    window.IslandSync?.getStatus?.().current==='unauthorized',{timeout:15000});
  assert.equal(await unpairedChild.page.locator('#kaixin-stage-gate').isVisible(),true);
  assert.equal((await unpairedChild.page.evaluate(()=>
    window.__qaRemote.calls)).includes('family_load_v2'),false);
  await unpairedChild.page.close();

  const parent=await boot(browser,'parent','parent.html');
  await parent.page.waitForFunction(()=>window.IslandSync?.getStatus?.().current==='synced',{timeout:15000});
  assert.equal(await parent.page.locator('#kaixin-stage-gate').count(),0);
  assert.equal(await parent.page.locator('.up-mode-switch').getAttribute('href'),
    'child.html?parentPreview=1','parent page links directly to child read-only preview');

  assert.ok((await parent.page.title()).includes('独立测试'));
  assert.equal(await parent.page.evaluate(()=>DEMO_KEY.includes('KAIXIN_STAGE_QA')),true);
  assert.equal(await parent.page.evaluate(()=>window.__qaRemote.calls.includes('family_load_v2')),true);
  assert.equal(await parent.page.locator('#kaixin-stage-refresh').isVisible(),true);
  assert.equal(await parent.page.locator('link[rel="stylesheet"]').count(),1,
    'parent uses one bundled, ordered stylesheet');
  assert.equal(await parent.page.evaluate(()=>document.getElementById('kaixin-stage-status-message')?.textContent),'已同步',
    'normal sync state is a compact indicator');

  const refreshResult=await parent.page.evaluate(async()=>{
    const callsBefore=window.__qaRemote.calls.filter(x=>x==='family_load_v2').length;
    document.querySelector('#kaixin-stage-refresh').click();
    await new Promise(resolve=>{
      const button=document.querySelector('#kaixin-stage-refresh');
      const watch=new MutationObserver(()=>{if(!button.disabled){watch.disconnect();resolve();}});
      watch.observe(button,{attributes:true,attributeFilter:['disabled']});
      setTimeout(()=>{watch.disconnect();resolve();},2500);
    });
    return {before:callsBefore,after:window.__qaRemote.calls.filter(x=>x==='family_load_v2').length};
  });
  assert.ok(refreshResult.after>refreshResult.before,'manual cloud button must actually query backend');

  // V2 now synchronizes by user and page lifecycle events, never by intervals.
  const schedule=await parent.page.evaluate(async()=>{
    const sync=await fetch('kaixin-stage-sync.js?v=20261111-on-demand1').then(r=>r.text());
    const before=window.__qaRemote.calls.filter(x=>x==='family_load_v2').length;
    window.dispatchEvent(new Event('focus'));
    await new Promise(resolve=>setTimeout(resolve,250));
    const onFocus=window.__qaRemote.calls.filter(x=>x==='family_load_v2').length;
    window.dispatchEvent(new Event('online'));
    await new Promise(resolve=>setTimeout(resolve,250));
    const onOnline=window.__qaRemote.calls.filter(x=>x==='family_load_v2').length;
    return {noInterval:!sync.includes('setInterval('),noDelayedRecheck:!sync.includes('setTimeout(()=>{if(!document.hidden)resume()'),
      onFocus:onFocus-before,onOnline:onOnline-onFocus};
  });
  assert.equal(schedule.noInterval,true,'event-driven transport must not poll periodically');
  assert.equal(schedule.noDelayedRecheck,true,'opening page must not schedule a delayed second read');
  assert.ok(schedule.onFocus>0,'returning focus must recheck cloud');
  assert.ok(schedule.onOnline>0,'restoring network must recheck cloud');


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
  // Cloud is the single state. A collision asks once, server-audited action
  // is visible, and cancelling discards ONLY the local uncommitted operation.
  await parent.page.evaluate(id=>{
    const d=getData();d.homework.find(h=>h.id===id).content='我的旧设备编辑';
    window.__qaRemote.payload.homework.find(h=>h.id===id).content='云端另一设备编辑';
    window.__qaRemote.revision++;saveData(d);
  },id);
  await parent.page.locator('#kaixin-stage-conflict').waitFor({state:'visible',timeout:15000});
  assert.match(await parent.page.locator('#kaixin-stage-conflict').textContent(),/孩子.*2026.*修改作业/s);
  await parent.page.getByRole('button',{name:'使用云端最新状态'}).click();
  await parent.page.waitForFunction(id=>
    getData().homework.find(h=>h.id===id)?.content==='云端另一设备编辑'
    &&window.IslandSync?.getStatus?.().current==='synced',id,{timeout:15000});
  assert.equal(await parent.page.evaluate(id=>window.__qaRemote.payload.homework.find(h=>h.id===id).content,id),
    '云端另一设备编辑');

  // Confirming collision rebases just changed field; child's concurrent
  // done status stays true in the single authoritative cloud record.
  await parent.page.evaluate(id=>{
    const d=getData();d.homework.find(h=>h.id===id).content='家长确认保留的内容';
    const remote=window.__qaRemote.payload.homework.find(h=>h.id===id);
    remote.content='云端冲突的新文字';remote.done=true;
    remote.completedAt='2026-11-11T12:55:00Z';
    window.__qaRemote.revision++;saveData(d);
  },id);
  await parent.page.locator('#kaixin-stage-conflict').waitFor({state:'visible',timeout:15000});
  await parent.page.getByRole('button',{name:'仍提交我的修改'}).click();
  await parent.page.waitForFunction(id=>{
    const h=window.__qaRemote.payload.homework.find(h=>h.id===id);
    return h?.content==='家长确认保留的内容'&&h?.done===true
      &&window.IslandSync?.getStatus?.().current==='synced';
  },id,{timeout:15000});

  await parent.page.evaluate(()=>sessionStorage.setItem('__qaFixedCloud',
    JSON.stringify(window.__qaRemote.payload)));
  // Crash/reload recovery: a stale marker must clear ONLY when the local
  // snapshot and cloud projection are identical, with no queued operations.
  await parent.page.evaluate(()=>localStorage.setItem('kaixin_stage_v2_blocked_v1','1'));
  await parent.page.reload({waitUntil:'domcontentloaded'});
  await parent.page.waitForFunction(()=>window.IslandSync?.getStatus?.().current==='synced',{timeout:15000});
  assert.equal(await parent.page.evaluate(()=>localStorage.getItem('kaixin_stage_v2_blocked_v1')),null,
    'exact equality + empty outbox safely recovers stale marker');

  // Old Safari global locks no longer disable cloud access. The divergent
  // local snapshot is preserved as a backup before cloud state becomes visible.
  await parent.page.evaluate(()=>{
    const key=DEMO_KEY,local=JSON.parse(localStorage.getItem(key));
    local.kidName='只存在于本机的安全测试';
    localStorage.setItem(key,JSON.stringify(local));
    localStorage.setItem('kaixin_stage_v2_blocked_v1','1');
  });
  await parent.page.reload({waitUntil:'domcontentloaded'});
  await parent.page.waitForFunction(()=>window.IslandSync?.getStatus?.().current==='synced',{timeout:15000});
  assert.equal(await parent.page.evaluate(()=>localStorage.getItem('kaixin_stage_v2_blocked_v1')),null);
  const backup=await parent.page.evaluate(()=>{
    const keys=Object.keys(localStorage).filter(k=>k.startsWith('kaixin_stage_legacy_local_backup_v1_'));
    return keys.map(k=>JSON.parse(localStorage.getItem(k)).snapshot.kidName);
  });
  assert.ok(backup.includes('只存在于本机的安全测试'),'legacy local edits are backed up');
  assert.notEqual(await parent.page.evaluate(()=>getData().kidName),'只存在于本机的安全测试',
    'cloud is the one visible state after backup');
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
  assert.equal(await childToggle.page.locator('link[rel="stylesheet"]').count(),1,
    'child uses one bundled, ordered stylesheet');

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
  await child.page.waitForFunction(()=>
    Object.keys(localStorage).some(k=>k.startsWith('kaixin_stage_legacy_local_backup_v1_')),
    {timeout:9000});
  assert.equal((await child.page.evaluate(()=>window.__qaRemote.calls)).includes('family_save_v2'),false,
    'child write API not approved: must NEVER post parent snapshot RPC');
  assert.equal(await child.page.evaluate(()=>
    Object.keys(localStorage).some(k=>k.startsWith('kaixin_stage_legacy_local_backup_v1_'))),true,
    'unsupported child edit remains safely backed up independent of transient status text');
  assert.deepEqual(child.errors,[],'child staging UI must not produce JS errors');
  await child.page.close();
  console.log('PASS isolated KAIXIN full-UI 390px: unauthorized gate; parent Auth + real UI add operation CAS/readback; child write fail-closed and original UI intact (mocked server)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
