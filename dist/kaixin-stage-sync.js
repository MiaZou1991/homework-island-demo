/* KAIXIN V2 isolated staging adapter - never imported by production HTML.
 * Parent-safe record operations only; child writes, unknown top-level effects,
 * schema alterations and conflicts fail CLOSED (no whole-snapshot overwrite).
 * Only verified staging accounts may read V2 cloud data.
 */
(() => {
 'use strict';
 const familyId=()=>window.KaixinStageAuth.familyId();
 const DIRTY='kaixin_stage_v2_unpersisted_v1';
 const BLOCK='kaixin_stage_v2_blocked_v1';
 const BACKUP='kaixin_stage_legacy_local_backup_v1';
 const DB='kaixin_stage_v2_queue_v1',STORE='ops';
 const scope=()=>window.KaixinStageAuth?.familyIdOptional?.()||'unverified';
 const dirtyKey=()=>DIRTY+'_'+scope();
 const blockKey=()=>BLOCK+'_'+scope();
 const backupKey=()=>BACKUP+'_'+scope();
 const dbName=()=>DB+'_'+scope();
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
 async function hasLegacyPending(){
   try{
     if(localStorage.getItem(DIRTY)||localStorage.getItem(BLOCK))return true;
     if(typeof indexedDB.databases==='function'){
       const names=(await indexedDB.databases()).map(item=>item.name);
       if(!names.includes(DB))return false;
     }
     return await new Promise((resolve,reject)=>{
       const req=indexedDB.open(DB,1);
       req.onerror=()=>reject(req.error||Error('legacy_queue_unavailable'));
       req.onupgradeneeded=()=>{req.transaction.abort();resolve(false);};
       req.onsuccess=()=>{
         const db=req.result;
         if(!db.objectStoreNames.contains(STORE)){db.close();resolve(false);return;}
         const tx=db.transaction(STORE,'readonly');
         const count=tx.objectStore(STORE).count();
         count.onsuccess=()=>{db.close();resolve(count.result>0);};
         count.onerror=()=>{db.close();reject(count.error||Error('legacy_queue_unavailable'));};
       };
     });
   }catch(_){return true;}
 }
 // The isolated QA database contains old minimal technical fixtures. The UI needs
 // domain defaults, but these defaults must NEVER be uploaded as independent edits.
 function viewPayload(remote){
   if(typeof createDefaultData!=='function')throw Error('staging_domain_defaults_missing');
   const projected={...createDefaultData(),...safeClone(remote)};
   if(typeof DemoCore==='undefined'||typeof DemoCore.ensure!=='function')throw Error('staging_demo_core_missing');
   DemoCore.ensure(projected);
   return projected;
 }

 // Synchronization is event-driven. Presentation lives in the per-page
 // header/settings UI; no fixed bottom bar or permanent refresh button.
 function emit(change){
   state={...state,...change};
   window.dispatchEvent(new CustomEvent('island-sync-state',{detail:{...state}}));
   if(authorized&&role==='parent'&&document.body){
     let entry=document.getElementById('kaixin-v2-recovery-entry');
     if(state.current==='pending'&&hasPendingLocal()){
       if(!entry){entry=document.createElement('button');entry.id='kaixin-v2-recovery-entry';
         entry.textContent='处理未同步修改';entry.onclick=openRecovery;document.body.append(entry);}
     }else if(entry)entry.remove();
   }
 }
 let blockedInMemory=false;
 function hasPendingLocal(){
   try{return blockedInMemory||!!localStorage.getItem(dirtyKey())||!!localStorage.getItem(blockKey());}
   catch(_){return true;}
 }
 function block(reason) {
   blockedInMemory=true;
   try{localStorage.setItem(blockKey(),reason);}catch(_){}
   try{if(baseline)localStorage.setItem(blockKey()+'_base',JSON.stringify(baseline));}catch(_){}
   preserveLocal('unsupported');
   emit({current:'pending',message:reason+'；本机修改已备份，云端仍可访问'});
 }
 function preserveLocal(reason) {
   try {
     const raw=localStorage.getItem(localKey());
     if(raw)localStorage.setItem(backupKey()+'_'+crypto.randomUUID(),
       JSON.stringify({reason,at:new Date().toISOString(),snapshot:JSON.parse(raw)}));
   }catch(_){}
 }
 // Recovery is explicit and never uploads a whole local snapshot.
 function exportPending(){
   return {schema:1,reason:localStorage.getItem(blockKey()),
     snapshot:JSON.parse(localStorage.getItem(localKey())||'null')};
 }
 async function recoverPending({confirm=false,choice='retry'}={}){
   if(!authorized||role!=='parent'||!confirm)throw Error('recovery_confirmation_required');
   await writing;
   const store=await openOutbox();
   if((await store.all()).length)throw Error('queued_operations_require_resolution');
   const snapshot=exportPending().snapshot;
   if(!snapshot)throw Error('missing_local_snapshot');
   if(choice==='retry'){
     const base=JSON.parse(localStorage.getItem(blockKey()+'_base')||'null');
     if(!base)throw Error('missing_recovery_base_export_required');
     const plan=Ops.planTransition(base,snapshot,()=>crypto.randomUUID());
     if(!plan.safe)throw Error('unsupported_recovery_changes');
     const remote=await load();
     if(Ops.applyBatch(remote.payload,plan.operations).outcome==='conflict')
       throw Error('recovery_conflict_requires_review');
     for(const op of plan.operations)await store.put(op);
     baseline=safeClone(snapshot);
     localStorage.removeItem(dirtyKey());localStorage.removeItem(blockKey());blockedInMemory=false;
     localStorage.removeItem(blockKey()+'_base');
     return flush();
   }
   if(choice!=='cloud')throw Error('invalid_recovery_choice');
   // Unknown base after restart must not be treated as a safe merge.
   // Export remains available; only an explicit cloud choice releases the guard.
   preserveLocal('explicit_cloud_recovery');
   const recoveryKey=backupKey()+'_recovery_'+crypto.randomUUID();
   localStorage.setItem(recoveryKey,JSON.stringify({snapshot,at:new Date().toISOString()}));
   if(!localStorage.getItem(recoveryKey))throw Error('recovery_backup_failed');
   const remote=await load();
   localStorage.removeItem(dirtyKey());localStorage.removeItem(blockKey());blockedInMemory=false;
   localApply(remote.payload);revision=remote.revision;
   return {ok:true,backupKey:recoveryKey,revision};
 }
 function openRecovery(){
   if(!authorized||role!=='parent'||!hasPendingLocal())return false;
   const prior=document.getElementById('kaixin-v2-recovery');if(prior)prior.remove();
   const box=document.createElement('dialog');box.id='kaixin-v2-recovery';
   const title=document.createElement('h2');title.textContent='本机有未同步修改';
   const note=document.createElement('p');note.textContent='先下载本机副本，再选择重试提交或采用云端。冲突和缺少原始版本时会停止。';
   const download=document.createElement('button');download.textContent='下载本机副本';
   download.onclick=()=>{
     const blob=new Blob([JSON.stringify(exportPending())],{type:'application/json'});
     const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
     a.download='kaixin-pending-local.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   };
   const run=choice=>async()=>{try{const result=await recoverPending({confirm:true,choice});
     if(result.ok)box.close();else note.textContent='仍未同步，请保留本机副本。';
   }catch(error){note.textContent='未处理：'+error.message+'。本机修改仍保留。';}};
   const retry=document.createElement('button');retry.textContent='重试提交';retry.onclick=run('retry');
   const cloud=document.createElement('button');cloud.textContent='采用云端';cloud.onclick=run('cloud');
   const close=document.createElement('button');close.textContent='稍后处理';close.onclick=()=>box.close();
   box.append(title,note,download,retry,cloud,close);document.body.append(box);box.showModal();return true;
 }
 function clearLegacyLock(){ /* Pending markers require explicit reconciliation. */ }
 function openOutbox(){
   if(outboxPromise)return outboxPromise;
   outboxPromise=new Promise((resolve,reject)=>{
     if(!window.indexedDB){reject(Error('indexeddb_required'));return;}
     const req=indexedDB.open(dbName(),1);
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
   const out=await call('family_load_v2',{p_family_id:familyId()});
   if(!Number.isSafeInteger(out.revision)||!Array.isArray(out.payload?.homework))
      throw Error('invalid_remote_payload');
   return {payload:out.payload,revision:out.revision};
 }
 function localApply(payload){
   if(!allowed())throw Error('production_origin_blocked');
   if(hasPendingLocal())throw Error('unreconciled_local_changes');
   const uiData=viewPayload(payload);
   localStorage.setItem(localKey(),JSON.stringify(uiData));
   baseline=safeClone(uiData);
   if(refresh)refresh(uiData);
 }
 async function clean(){
   return !hasPendingLocal()&&(await (await openOutbox()).all()).length===0;
 }
 async function checkRemote(){
   if(!authorized||!allowed())return {ok:false};
   if(readBusy)return readBusy;
   readBusy=(async()=>{
     await writing;
     if(role!=='parent-preview'&&!(await clean())) {
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
   const item=op.entity==='$root'?remote.payload:(remote.payload[op.entity||'homework']||[]).find(h=>h.id===(op.homeworkId||op.id));
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
       p_family_id:familyId(),p_homework_id:op.homeworkId||op.id
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
   if(op.entity==='$root'){
     const after=safeClone(remote.payload);
     for(const [key,delta] of Object.entries(op.changes)){
       if(delta.nextHas)after[key]=safeClone(delta.next);else delete after[key];
     }
     return Ops.planTransition(remote.payload,after,()=>crypto.randomUUID()).operations[0]||null;
   }
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
     p_family_id:familyId(),p_homework_id:op.homeworkId,p_done:op.done,
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
   if(role==='parent-preview')return checkRemote();
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
           p_family_id:familyId(),p_payload:proposed.payload,
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
   if(!authorized||!started)return;
   // Parent can inspect child UI but never use child/parent write APIs here.
   if(role==='parent-preview'){
     emit({current:'synced',message:'家长只读预览，未提交任何修改'});
     return;
   } // provisional startup data never uploaded
   if(role==='child'){
     clearLegacyLock();
     let op;
     try{op=childToggleTransition(next);}
     catch(_){block('孩子设备当前只支持作业完成／撤销完成同步，其余本机改动已保留');return;}
     try{localStorage.setItem(dirtyKey(),'1');}catch(_){block('不能保存断电保护标记');return;}
     baseline=safeClone(next);
     writing=writing.then(async()=>{
       await (await openOutbox()).put(op);
       localStorage.removeItem(dirtyKey());
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
   try{localStorage.setItem(dirtyKey(),'1');}catch(_){block('无法写入断电保护标记');return;}
   baseline=safeClone(next);
   writing=writing.then(async()=>{
     const store=await openOutbox();
     for(const op of planned.operations) await store.put(op);
     localStorage.removeItem(dirtyKey());
     emit({current:'pending',message:'本机修改已安全排队，等待云端确认'});
   }).catch(()=>block('本机操作队列持久化失败'));
   writing.then(()=>flush());
 }
 async function refreshNow(){
   if(!authorized||!allowed())return {ok:false};
   if(document.hidden||navigator.onLine===false)return {ok:false,pending:true};
   if(role==='parent-preview')return checkRemote();
   clearLegacyLock();
   const queued=(await (await openOutbox()).all()).length;
   if(queued)return flush();
   return checkRemote();
 }
 function resume(){
   if(!authorized||document.hidden||navigator.onLine===false)return;
   writing.then(async()=>{
     if(role==='parent-preview'){await checkRemote();return;}
     clearLegacyLock();
     if((await (await openOutbox()).all()).length)await flush();
     else await checkRemote();
   }).catch(()=>{});
 }
 async function start({onRemoteUpdate}={}){
   if(started)return;
   started=true;refresh=onRemoteUpdate||null;
   if(!allowed()){block('测试版不能运行在正式域名');return;}
   try{
     role=document.body.dataset.mode==='parent'?'parent':
       (new URLSearchParams(location.search).get('parentPreview')==='1'?'parent-preview':'child');
     const verified=await window.KaixinStageAuth.verifiedRole(role==='parent-preview'?'parent':role);
     if(!verified){emit({current:'unauthorized',message:'请先完成 KAIXIN 测试身份验证'});return;}
     authorized=true;
     if(await hasLegacyPending()){
       window.KaixinStageAuth.showGate('发现旧测试版本尚未核对的本机修改。原数据已保留，请先联系家长处理，不能自动切换家庭。',role);
       emit({current:'pending',message:'旧版本本机修改待核对；已暂停云端覆盖'});
       return;
     }
     if(role==='parent-preview'){
       // Keep the parent preview independent of the child device outbox and
       // stale local flags. The server-authorized snapshot is always canonical.
       if(hasPendingLocal()){emit({current:'pending',message:'本机修改尚未核对，已暂停云端覆盖'});return;}
     const loaded=await load();
       revision=loaded.revision;
       localApply(loaded.payload);
       emit({cloudRecord:'yes',current:'synced',message:'家长只读预览 · 云端版本 '+revision});
     }else{
     const store=await openOutbox();
     clearLegacyLock();
     if((await store.all()).length){
       emit({current:'pending',message:'上次离线待上传操作尚未确认，保留本机数据'});
       await flush();
       return;
     }
     if(hasPendingLocal()){emit({current:'pending',message:'本机修改尚未核对，已暂停云端覆盖'});return;}
     const loaded=await load();
     revision=loaded.revision;
     localApply(loaded.payload);
     emit({cloudRecord:'yes',current:'synced',message:'已加载 KAIXIN 测试数据 · 版本 '+revision});
     }
   }catch(_){window.KaixinStageAuth.showGate('测试云端或登录验证暂不可用，本机数据保持原样。请稍后再试。',role);emit({current:'unknown',message:'测试云端读取失败，本机数据保留；不会上传旧数据'});}
   window.addEventListener('online',resume);
   window.addEventListener('pageshow',resume);
   window.addEventListener('focus',resume);
   document.addEventListener('visibilitychange',resume);
 }
 async function manualSync(){
   // One public entry point for parent More, child Island Settings and retry.
   // It retains the existing offline queue, conflict dialog, and cloud readback.
   try { return await refreshNow(); }
   catch (_) {
     emit({current:'pending',message:'网络连接暂时不可用，点击重试'});
     return {ok:false,error:'network'};
   }
 }
 window.IslandSync=Object.freeze({
   exportPending,recoverPending,openRecovery,start,schedulePush,checkRemote,flush,manualSync,getStatus:()=>({...state}),
   getCode:()=> 'KAIXIN',getFamily:()=> 'KAIXIN',
 });
 window.KaixinStageSyncDiagnostics=Object.freeze({
   getState:()=>({...state,revision,role,authorized}),
   pending:async()=>(await openOutbox()).all()
 });
})();

