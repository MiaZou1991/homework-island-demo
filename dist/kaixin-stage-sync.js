/* KAIXIN V2 isolated staging adapter - never imported by production HTML.
 * Parent-safe record operations only; child writes, unknown top-level effects,
 * schema alterations and conflicts fail CLOSED (no whole-snapshot overwrite).
 * Only verified staging accounts may read V2 cloud data.
 */
(() => {
 'use strict';
 const FAMILY='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const DIRTY='kaixin_stage_v2_unpersisted_v1';
 const BLOCK='kaixin_stage_v2_blocked_v1';
 const DB='kaixin_stage_v2_queue_v1',STORE='ops';
 const Ops=window.KaixinV2Operations;
 if(!Ops)throw new Error('staging_operation_engine_missing');
 let started=false,authorized=false,role='',baseline=null,revision=null,refresh=null;
 let writing=Promise.resolve(),busy=null,readBusy=null,updateTimer=null;
 let state={cloudRecord:'unknown',current:'unknown',message:'独立测试版：等待身份验证'};
 let outboxPromise=null;
 const allowed=()=>window.__KAIXIN_STAGE_BUILD__===true && (
   (location.protocol==='https:' && location.hostname==='miazou1991.github.io' &&
     /^\/kaixin-island-staging(?:\/|$)/.test(location.pathname)) ||
   (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) &&
     (location.protocol==='http:'||location.protocol==='https:'))
 );
 const localKey=()=>typeof activeStorageKey==='function'?activeStorageKey():'kaixin_stage_local_v1';
 const safeClone=x=>JSON.parse(JSON.stringify(x));
 // The isolated QA database contains old minimal technical fixtures. The UI needs
 // domain defaults, but these defaults must NEVER be uploaded as independent edits.
 function viewPayload(remote){
   if(typeof createDefaultData!=='function')throw Error('staging_domain_defaults_missing');
   const projected={...createDefaultData(),...safeClone(remote)};
   if(typeof DemoCore==='undefined'||typeof DemoCore.ensure!=='function')throw Error('staging_demo_core_missing');
   DemoCore.ensure(projected);
   return projected;
 }

 function emit(change){
   state={...state,...change};
   window.dispatchEvent(new CustomEvent('island-sync-state',{detail:{...state}}));
   const label=document.getElementById('kaixin-stage-status');
   if(label)label.textContent='KAIXIN 测试同步：'+state.message;
 }
 function initStatus(){
   if(document.getElementById('kaixin-stage-status'))return;
   const el=document.createElement('div');
   el.id='kaixin-stage-status';
   el.setAttribute('role','status');
   el.style.cssText='position:fixed;bottom:10px;left:10px;right:10px;max-width:440px;margin:0 auto;background:#fef6dc;color:#715432;border:1px solid #dfc290;padding:7px 12px;border-radius:13px;z-index:900001;font:12px/1.5 system-ui,sans-serif;box-shadow:0 2px 9px #0002;pointer-events:none';
   document.body.appendChild(el);
   emit({});
 }
 function block(reason) {
   try {localStorage.setItem(BLOCK,'1');} catch (_) {}
   emit({current:'blocked',message:reason+'；本机内容保留，未上传云端'});
 }
 function openOutbox(){
   if(outboxPromise)return outboxPromise;
   outboxPromise=new Promise((resolve,reject)=>{
     if(!window.indexedDB){reject(Error('indexeddb_required'));return;}
     const req=indexedDB.open(DB,1);
     req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'operationId'});};
     req.onerror=()=>reject(Error('indexeddb_open_failed'));
     req.onblocked=()=>reject(Error('indexeddb_blocked'));
     req.onsuccess=()=>{
       const db=req.result;
       function task(mode,run) {
         return new Promise((done,fail)=>{
           const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
           let result;
           tx.oncomplete=()=>done(result);
           tx.onabort=()=>fail(Error('indexeddb_transaction_aborted'));
           tx.onerror=()=>fail(Error('indexeddb_transaction_failed'));
           const request=run(store);
           if(request)request.onsuccess=()=>{result=request.result;};
         });
       }
       resolve({
         put:op=>task('readwrite',s=>s.put(op)),
         remove:id=>task('readwrite',s=>s.delete(id)),
         all:async()=>((await task('readonly',s=>s.getAll()))||[]).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))
       });
     };
   });
   return outboxPromise;
 }
 async function call(name,args){
   const c=window.KaixinStageAuth.client();
   const {data,error}=await c.rpc(name,args);
   if(error)throw Error('rpc_unavailable');
   if(data?.ok!==true)throw Error(data?.error||'rpc_rejected');
   return data;
 }
 async function load(){
   const out=await call('family_load_v2',{p_family_id:FAMILY});
   if(!Number.isSafeInteger(out.revision)||!Array.isArray(out.payload?.homework))
      throw Error('invalid_remote_payload');
   return {payload:out.payload,revision:out.revision};
 }
 function localApply(payload){
   if(!allowed())throw Error('production_origin_blocked');
   const uiData=viewPayload(payload);
   localStorage.setItem(localKey(),JSON.stringify(uiData));
   baseline=safeClone(uiData);
   if(refresh)refresh(uiData);
 }
 async function clean(){
   if(localStorage.getItem(DIRTY)||localStorage.getItem(BLOCK))return false;
   return (await (await openOutbox()).all()).length===0;
 }
 async function checkRemote(){
   if(!authorized||!allowed())return {ok:false};
   if(readBusy)return readBusy;
   readBusy=(async()=>{
     await writing;
     if(!(await clean())) {
       emit({current:'pending',message:'有本机待处理变更，暂不覆盖本机数据'});
       return {ok:false,pending:true};
     }
     const remote=await load();
     revision=remote.revision;
     if(JSON.stringify(viewPayload(remote.payload))!==JSON.stringify(baseline)){
       localApply(remote.payload);
     }
     emit({current:'synced',cloudRecord:'yes',message:'已核对测试云端版本 '+revision});
     return {ok:true,revision};
   })();
   try{return await readBusy;}finally{readBusy=null;}
 }
 function childToggleTransition(next){
   if(!baseline||!next||!Array.isArray(next.homework)||!Array.isArray(baseline.homework))
     throw Error('child_transition_invalid');
   const keys=new Set([...Object.keys(baseline),...Object.keys(next)]);
   for(const key of keys){
     if(key==='homework')continue;
     if(JSON.stringify(baseline[key])!==JSON.stringify(next[key]))
       throw Error('child_unapproved_field');
   }
   if(next.homework.length!==baseline.homework.length)throw Error('child_unapproved_list_edit');
   const old=new Map(baseline.homework.map(h=>[h.id,h]));
   if(old.size!==baseline.homework.length)throw Error('child_duplicate_ids');
   const edits=[];
   for(const item of next.homework){
     const prior=old.get(item?.id);
     if(!prior)throw Error('child_unapproved_new_homework');
     if(JSON.stringify(prior)!==JSON.stringify(item)){
       const properties=new Set([...Object.keys(prior),...Object.keys(item)]);
       for(const prop of properties){
         if(prop!=='done'&&prop!=='completedAt'
           &&JSON.stringify(prior[prop])!==JSON.stringify(item[prop]))
           throw Error('child_unapproved_homework_change');
       }
       if(Boolean(prior.done)===Boolean(item.done)||item.requireReview===true)
         throw Error('child_unapproved_completion');
       if(item.done&&!item.completedAt)throw Error('child_invalid_completion_time');
       edits.push({kind:'child_homework_done',operationId:crypto.randomUUID(),
         homeworkId:item.id,expectedDone:Boolean(prior.done),done:Boolean(item.done),
         createdAt:new Date().toISOString()});
     }
   }
   if(edits.length!==1)throw Error('child_exactly_one_toggle_required');
   return edits[0];
 }
 async function flushChildOperation(op,store){
   if(op.kind!=='child_homework_done') {
     block('孩子设备队列含未识别操作，需核实');
     return {ok:false,blocked:true};
   }
   const result=await window.KaixinStageAuth.client().rpc('kaixin_child_set_homework_done',{
     p_homework_id:op.homeworkId,p_done:op.done,
     p_expected_done:op.expectedDone,p_operation_id:op.operationId
   });
   if(result.error)throw Error('child_rpc_unavailable');
   if(result.data?.ok!==true){
     if(result.data?.error==='conflict'||result.data?.error==='already_in_state'){
       block('作业完成状态与另一台设备冲突；双方修改已保留，请家长核对');
       return {ok:false,conflict:true};
     }
     if(result.data?.error==='unauthorized'){
       block('孩子设备权限已经失效；当前修改仍保留');
       return {ok:false,unauthorized:true};
     }
     if(result.data?.error==='review_required'){
       block('这条作业需要家长确认，不能自动完成');
       return {ok:false,blocked:true};
     }
     throw Error('child_save_rejected');
   }
   const verified=await load();
   const matches=verified.payload.homework.filter(h=>h.id===op.homeworkId);
   if(matches.length!==1||Boolean(matches[0].done)!==op.done)
     throw Error('child_readback_unverified');
   await store.remove(op.operationId);
   revision=verified.revision;
   emit({current:'pending',message:'孩子完成状态已获云端确认，正在刷新其他设备'});
   return {ok:true};
 }
 async function flush(){
   if(!authorized||!allowed())return {ok:false};
   if(busy)return busy;
   busy=(async()=>{
     await writing;
     if(localStorage.getItem(DIRTY)||localStorage.getItem(BLOCK))
       return {ok:false,blocked:true};
     const store=await openOutbox();
     const ops=await store.all();
     if(!ops.length)return checkRemote();
     emit({current:'pending',message:'正在提交 '+ops.length+' 项测试变更'});
     for(const op of ops) {
       if(role==='child'){
         const childResult=await flushChildOperation(op,store);
         if(!childResult.ok)return childResult;
         continue;
       }
       let completed=false;
       for(let attempt=0;attempt<4;attempt++){
         const remote=await load();
         const proposed=Ops.apply(remote.payload,op);
         if(proposed.outcome==='conflict') {
           block('多人同时修改相同内容，需人工核对');
           return {ok:false,conflict:true};
         }
         if(proposed.outcome==='already_applied'){
           await store.remove(op.operationId);completed=true;break;
         }
         const result=await window.KaixinStageAuth.client().rpc('family_save_v2',{
           p_family_id:FAMILY,p_payload:proposed.payload,
           p_expected_revision:remote.revision,p_operation_id:op.operationId
         });
         if(result.error)throw Error('rpc_save_unavailable');
         if(result.data?.error==='conflict')continue;
         if(result.data?.ok!==true)throw Error(result.data?.error||'rpc_save_rejected');
         const verified=await load();
         const applied=Ops.apply(verified.payload,op);
         if(applied.outcome!=='already_applied')throw Error('readback_unverified');
         await store.remove(op.operationId);
         completed=true;revision=verified.revision;
         break;
       }
       if(!completed) {
         block('测试云端版本冲突多次重试失败');
         return {ok:false,conflict:true};
       }
     }
     // Never pull a newer snapshot over unsaved local changes.
     if(await clean())return checkRemote();
     return {ok:false,pending:true};
   })();
   try{return await busy;}catch(e){
     emit({current:'pending',message:'网络或上传暂不可用，本机操作仍保留，待恢复重试'});
     return {ok:false,error:'upload_unconfirmed'};
   }finally{busy=null;}
 }
 function schedulePush(next){
   if(!authorized||!started)return; // provisional startup data never uploaded
   if(role==='child'){
     if(localStorage.getItem(DIRTY)||localStorage.getItem(BLOCK)){
       emit({current:'blocked',message:'此前有未确认操作，禁止覆盖，请家长核对'});return;
     }
     let op;
     try{op=childToggleTransition(next);}
     catch(_){block('孩子设备当前只支持作业完成／撤销完成同步，其余本机改动已保留');return;}
     try{localStorage.setItem(DIRTY,'1');}catch(_){block('不能保存断电保护标记');return;}
     baseline=safeClone(next);
     writing=writing.then(async()=>{
       await (await openOutbox()).put(op);
       localStorage.removeItem(DIRTY);
       emit({current:'pending',message:'孩子操作已保存在本机，待云端确认'});
     }).catch(()=>block('孩子操作队列持久化失败'));
     writing.then(()=>flush());
     return;
   }
   if(localStorage.getItem(DIRTY)||localStorage.getItem(BLOCK)){
     emit({current:'blocked',message:'此前有未确认的本机变更，禁止覆盖上传'});
     return;
   }
   let planned;
   try {planned=Ops.planTransition(baseline,next,()=>crypto.randomUUID());}
   catch (_){block('本机数据结构无法安全合并');return;}
   if(!planned.safe){block('本次保存涉及 '+planned.unsupportedTopLevelKeys.slice(0,4).join('、')+' 等联动字段，必须先实现无损合并');return;}
   if(!planned.operations.length)return;
   // Marker is synchronous: crash before IndexedDB commit cannot silently drop data.
   try{localStorage.setItem(DIRTY,'1');}catch(_){block('无法写入断电保护标记');return;}
   baseline=safeClone(next);
   writing=writing.then(async()=>{
     const store=await openOutbox();
     for(const op of planned.operations) await store.put(op);
     localStorage.removeItem(DIRTY);
     emit({current:'pending',message:'本机修改已安全排队，等待云端确认'});
   }).catch(()=>block('本机操作队列持久化失败'));
   writing.then(()=>flush());
 }
 function resume(){
   if(!authorized||document.hidden||navigator.onLine===false)return;
   writing.then(async()=>{
     if(localStorage.getItem(BLOCK)||localStorage.getItem(DIRTY))return;
     if((await (await openOutbox()).all()).length)await flush();
     else await checkRemote();
   }).catch(()=>{});
 }
 async function start({onRemoteUpdate}={}){
   if(started)return;
   started=true;refresh=onRemoteUpdate||null;
   initStatus();
   if(!allowed()){block('测试版不能运行在正式域名');return;}
   try{
     role=document.body.dataset.mode==='parent'?'parent':'child';
     const verified=await window.KaixinStageAuth.verifiedRole(role);
     if(!verified){emit({current:'unauthorized',message:'请先完成 KAIXIN 测试身份验证'});return;}
     authorized=true;
     if(localStorage.getItem(DIRTY)||localStorage.getItem(BLOCK)){
       emit({current:'blocked',message:'本机有尚未核实的改动，为避免覆盖，云端同步暂停'});
       return;
     }
     const store=await openOutbox();
     if((await store.all()).length){
       emit({current:'pending',message:'上次离线待上传操作尚未确认，保留本机数据'});
       await flush();
       return;
     }
     const loaded=await load();
     revision=loaded.revision;
     localApply(loaded.payload);
     emit({cloudRecord:'yes',current:'synced',message:'已加载 KAIXIN 测试数据 · 版本 '+revision});
   }catch(_){window.KaixinStageAuth.showGate('测试云端或登录验证暂不可用，本机数据保持原样。请稍后再试。',role);emit({current:'unknown',message:'测试云端读取失败，本机数据保留；不会上传旧数据'});}
   window.addEventListener('online',resume);
   window.addEventListener('pageshow',resume);
   document.addEventListener('visibilitychange',resume);
   updateTimer=setInterval(()=>{if(!document.hidden)resume();},60000);
 }
 window.IslandSync=Object.freeze({
   start,schedulePush,checkRemote,flush,getStatus:()=>({...state}),
   getCode:()=> 'KAIXIN',getFamily:()=> 'KAIXIN',
 });
 window.KaixinStageSyncDiagnostics=Object.freeze({
   getState:()=>({...state,revision,role,authorized}),
   pending:async()=>(await openOutbox()).all()
 });
})();
