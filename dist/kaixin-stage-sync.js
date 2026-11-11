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
 const BACKUP='kaixin_stage_legacy_local_backup_v1';
 const DB='kaixin_stage_v2_queue_v1',STORE='ops';
 const Ops=window.KaixinV2Operations;
 if(!Ops)throw new Error('staging_operation_engine_missing');
 let started=false,authorized=false,role='',baseline=null,revision=null,refresh=null;
 let writing=Promise.resolve(),busy=null,readBusy=null;
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
   if(label){
     const calm=state.current==='synced';
     const msg=label.querySelector('#kaixin-stage-status-message');
     if(msg){
       msg.textContent=calm?'已同步':('KAIXIN 测试同步：'+state.message);
       msg.style.flex=calm?'0':'1';
     }
     // During normal use keep a compact sync control. Only pending/failed
     // operations expand the message; no full-width permanent yellow banner.
     label.style.left=calm?'auto':'10px';
     label.style.right='10px';
     label.style.width=calm?'auto':'auto';
     label.style.maxWidth=calm?'none':'440px';
     label.style.padding=calm?'5px 7px':'7px 12px';
     label.style.opacity=calm?'.88':'1';
     label.style.fontSize=calm?'11px':'12px';
   }
 }
 function initStatus(){
   if(document.getElementById('kaixin-stage-status'))return;
   const el=document.createElement('div');
   el.id='kaixin-stage-status';
   el.setAttribute('role','status');
   el.style.cssText='position:fixed;bottom:10px;left:10px;right:10px;max-width:440px;margin:0 auto;background:#fef6dc;color:#715432;border:1px solid #dfc290;padding:7px 12px;border-radius:13px;z-index:900001;font:12px/1.5 system-ui,sans-serif;box-shadow:0 2px 9px #0002;display:flex;gap:8px;align-items:center;justify-content:space-between';
   const message=document.createElement('span');
   message.id='kaixin-stage-status-message';
   message.style.flex='1';
   const button=document.createElement('button');
   button.id='kaixin-stage-refresh';
   button.type='button';
   button.textContent='立即同步';
   button.style.cssText='background:#7caf79;color:white;border:0;border-radius:9px;padding:6px 10px;font:600 12px system-ui;flex-shrink:0;cursor:pointer';
   button.addEventListener('click',async()=>{
     if(button.disabled)return;
     button.disabled=true;button.textContent='正在同步…';
     try{
       const result=await refreshNow();
       if(result?.ok)emit({current:'synced',message:'手动核对完成 · 云端版本 '+result.revision});
       else if(!result?.pending)emit({message:'尚未完成同步，请检查当前登录身份和网络'});
     }catch(_){emit({message:'无法获取云端最新数据；保留本机内容，请检查网络'});}
     finally{button.disabled=false;button.textContent='立即同步';}
   });
   el.append(message,button);
   document.body.appendChild(el);
   emit({});
 }
 function block(reason) {
   preserveLocal('unsupported');
   emit({current:'pending',message:reason+'；本机修改已备份，云端仍可访问'});
 }
 function preserveLocal(reason) {
   try {
     const raw=localStorage.getItem(localKey());
     if(raw)localStorage.setItem(BACKUP+'_'+crypto.randomUUID(),
       JSON.stringify({reason,at:new Date().toISOString(),snapshot:JSON.parse(raw)}));
   }catch(_){}
 }
 function clearLegacyLock(){
   if(localStorage.getItem(DIRTY)||localStorage.getItem(BLOCK)){
     preserveLocal('legacy_lock');
     localStorage.removeItem(DIRTY);
     localStorage.removeItem(BLOCK);
   }
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
 function conflictMessage(op,remote){
   const item=(remote.payload.homework||[]).find(h=>h.id===(op.homeworkId||op.id));
   const fields=op.kind==='child_homework_done'?['done']:
     op.action==='patch'?Object.keys(op.changes||{}):[op.action];
   const details=fields.map(k=>{
     const now=k==='done'?(item?.done?'已完成':'未完成'):JSON.stringify(item?.[k]??'空');
     return k+'：云端目前为 '+now;
   }).join('；');
   const moment=remote.updatedAt||item?.completedAt;
   const date=moment?new Date(moment):null;
   const when=date&&Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{hour12:false}):'暂无具体操作时间记录';
   return {item,when,details};
 }
 async function askConflict(op,remote){
   let {when,details}=conflictMessage(op,remote);
   let actor='操作设备未记录',action='修改作业';
   try{
     const result=await call('kaixin_homework_last_change_v2',{
       p_family_id:FAMILY,p_homework_id:op.homeworkId||op.id
     });
     if(result.exists){
       const at=new Date(result.at);
       if(Number.isFinite(at.getTime()))when=at.toLocaleString('zh-CN',{hour12:false});
       actor=result.actor||actor;action=result.action||action;
     }
   }catch(_){/* Older server audit not installed: never invent attribution. */}
   return new Promise(resolve=>{
     const dialog=document.createElement('dialog');
     dialog.id='kaixin-stage-conflict';
     dialog.style.cssText='border:1px solid #c4d3aa;border-radius:20px;max-width:420px;width:calc(100% - 38px);padding:24px;color:#574939;background:#fff9e9;box-shadow:0 20px 70px #0004';
     const title=document.createElement('h2');title.textContent='这条作业有新的修改';title.style.margin='0 0 12px';
     const summary=document.createElement('p');
     summary.style.cssText='font:14px/1.7 system-ui;white-space:pre-wrap';
     summary.textContent='最新云端操作：'+actor+' · '+when+'\n操作：'+action+'\n'+details+'\n是否仍要提交本机这次修改？确认后只更新本次修改的字段。';
     const row=document.createElement('div');row.style.cssText='display:flex;gap:10px;flex-wrap:wrap';
     const keep=document.createElement('button');keep.textContent='仍提交我的修改';keep.style.cssText='padding:11px;border:0;border-radius:11px;background:#74a76e;color:white';
     const newest=document.createElement('button');newest.textContent='使用云端最新状态';newest.style.cssText='padding:11px;border:1px solid #c4d3aa;border-radius:11px;background:white';
     let settled=false;
     function done(answer){if(settled)return;settled=true;dialog.close();dialog.remove();resolve(answer);}
     keep.onclick=()=>done(true);newest.onclick=()=>done(false);dialog.addEventListener('cancel',e=>{e.preventDefault();done(false)});
     row.append(keep,newest);dialog.append(title,summary,row);document.body.append(dialog);dialog.showModal();
     emit({current:'conflict',message:'这条作业有更新，等待你确认'});
   });
 }
 function rebaseParent(op,remote){
   const items=remote.payload[op.entity]||[];
   const current=items.find(x=>x.id===op.id)||null;
   if(op.action==='add')return null; // Never replace an unknown object via id collision.
   if(op.action==='remove')return current?Ops.make({entity:op.entity,before:current,after:null,operationId:crypto.randomUUID()}):null;
   if(!current)return null;
   const after=safeClone(current);
   for(const [field,delta] of Object.entries(op.changes)){
     if(delta.nextHas)after[field]=safeClone(delta.next);
     else delete after[field];
   }
   try{return Ops.make({entity:op.entity,before:current,after,operationId:crypto.randomUUID()});}
   catch(error){if(error.code==='no_change')return null;throw error;}
 }
 async function flushChildOperation(op,store,attempt=0){
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
       const remote=await load();
       const current=remote.payload.homework.find(h=>h.id===op.homeworkId);
       if(!current){await askConflict(op,remote);await store.remove(op.operationId);return {ok:true};}
       if(Boolean(current.done)===op.done){await store.remove(op.operationId);return {ok:true};}
       if(!(await askConflict(op,remote))){
         await store.remove(op.operationId);return {ok:true};
       }
       const retry={...op,operationId:crypto.randomUUID(),expectedDone:Boolean(current.done)};
       await store.put(retry);await store.remove(op.operationId);
       if(attempt>=4){emit({current:'pending',message:'这条作业多次产生冲突，请再次点击立即同步'});return {ok:false,conflict:true};}
       return flushChildOperation(retry,store,attempt+1);
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
     clearLegacyLock();
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
       let completed=false;let activeOp=op;
       for(let attempt=0;attempt<4;attempt++){
         const remote=await load();
         const proposed=Ops.apply(remote.payload,activeOp);
         if(proposed.outcome==='conflict'){
           if(!(await askConflict(activeOp,remote))){
             await store.remove(activeOp.operationId);completed=true;break;
           }
           const rebased=rebaseParent(activeOp,remote);
           if(!rebased){
             await store.remove(activeOp.operationId);completed=true;break;
           }
           await store.put(rebased);await store.remove(activeOp.operationId);
           activeOp=rebased;continue;
         }
         if(proposed.outcome==='already_applied'){
           await store.remove(activeOp.operationId);completed=true;break;
         }
         const result=await window.KaixinStageAuth.client().rpc('family_save_v2',{
           p_family_id:FAMILY,p_payload:proposed.payload,
           p_expected_revision:remote.revision,p_operation_id:activeOp.operationId
         });
         if(result.error)throw Error('rpc_save_unavailable');
         if(result.data?.error==='conflict')continue;
         if(result.data?.ok!==true)throw Error(result.data?.error||'rpc_save_rejected');
         const verified=await load();
         const applied=Ops.apply(verified.payload,activeOp);
         if(applied.outcome!=='already_applied')throw Error('readback_unverified');
         await store.remove(activeOp.operationId);
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
     clearLegacyLock();
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
   clearLegacyLock();
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
 async function refreshNow(){
   if(!authorized||!allowed())return {ok:false};
   if(document.hidden||navigator.onLine===false)return {ok:false,pending:true};
   clearLegacyLock();
   const queued=(await (await openOutbox()).all()).length;
   if(queued)return flush();
   return checkRemote();
 }
 function resume(){
   if(!authorized||document.hidden||navigator.onLine===false)return;
   writing.then(async()=>{
     clearLegacyLock();
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
     const store=await openOutbox();
     clearLegacyLock();
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
   window.addEventListener('focus',resume);
   document.addEventListener('visibilitychange',resume);
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
