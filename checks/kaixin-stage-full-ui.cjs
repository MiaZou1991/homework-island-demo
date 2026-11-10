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
    getUser:async()=>({data:{user:state.role?{id:state.role==='parent'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222',is_anonymous:state.role==='child'}:null},error:null}),
    getSession:async()=>({data:{session:state.role?{access_token:'test'}:null}}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
   },
   rpc:async(name,body={})=>{
    state.calls.push(name);
    if(name==='kaixin_identity')return{data:state.role?{ok:true,family:'KAIXIN',role:state.role}:{ok:false,error:'unauthorized'},error:null};
    if(name==='family_load_v2'){
      if(!state.role)return{data:{ok:false,error:'unauthorized'},error:null};
      if(state.payload===null){
       // Exact domain defaults from the app itself, preserving all side-effect fields.
       if(window.__qaSparse){
         state.payload={homework:[{id:'qa-old-fixture',subject:'数学',content:'只用于测试',done:false,attachments:[]}],qaHistory:{preserved:true}};
       }else{
         state.payload=JSON.parse(JSON.stringify(window.getData()));
         state.payload.recurringTasks=[];
       }
      }
      return{data:{ok:true,revision:state.revision,payload:JSON.parse(JSON.stringify(state.payload))},error:null};
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
