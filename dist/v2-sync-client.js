/* 开心岛 Sync V2 client, staging integration candidate.
 * NOT imported by production app.js yet. Never use family codes as credentials.
 * Syncs per-homework add operations, not blind whole-family snapshot replacements.
 */
(() => {
  const DB_NAME = 'kaixin_v2_outbox';
  const STORE_NAME = 'operations';
  function event(cb, name, metadata = {}) {
    // Log operation metadata only; never send homework, tokens, request bodies or names.
    try { if (typeof cb === 'function') cb({ event: name, at: Date.now(), ...metadata }); } catch (_) {}
  }
  function browserOutbox() {
    if (typeof indexedDB === 'undefined') throw new Error('indexeddb_required');
    const open = new Promise((resolve,reject) => {
      const request = indexedDB.open(DB_NAME,1);
      request.onupgradeneeded = () => {
        const db=request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME,{keyPath:'operationId'});
      };
      request.onerror=()=>reject(new Error('indexeddb_open_failed'));
      request.onblocked=()=>reject(new Error('indexeddb_blocked'));
      request.onsuccess=()=>resolve(request.result);
    });
    async function execute(mode, action) {
      const db=await open;
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE_NAME,mode);
        const store=tx.objectStore(STORE_NAME);
        let result;
        tx.oncomplete=()=>resolve(result);
        tx.onerror=()=>reject(new Error('indexeddb_transaction_failed'));
        tx.onabort=()=>reject(new Error('indexeddb_transaction_aborted'));
        const request=action(store);
        if(request) { request.onsuccess=()=>{result=request.result};request.onerror=()=>reject(new Error('indexeddb_request_failed')); }
      });
    }
    return {
      put:op=>execute('readwrite',s=>s.put(op)),
      remove:id=>execute('readwrite',s=>s.delete(id)),
      list:async()=>{
        const rows=await execute('readonly',s=>s.getAll());
        return (rows||[]).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
      }
    };
  }
  function canonical(x) {
    if(Array.isArray(x)) return '['+x.map(canonical).join(',')+']';
    if(x&&typeof x==='object') return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
    return JSON.stringify(x);
  }
  function typedError(kind,status=0) { const x=new Error(kind);x.kind=kind;x.status=status;return x; }
  function create(options) {
    const {url,publicKey,familyId,sessionProvider,fetcher,store,onEvent,uuid,now}=options||{};
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url||'') ||
       !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(familyId||'') ||
       !publicKey || typeof sessionProvider!=='function') throw typedError('invalid_v2_config');
    const request=fetcher||fetch, outbox=store||browserOutbox();
    const newId=uuid||(()=>crypto.randomUUID()), clock=now||(()=>Date.now());
    let inFlight=null,latest=null;
    let status={phase:'idle',pendingCount:0,lastError:null,revision:null};
    function setStatus(patch){status={...status,...patch};event(onEvent,'v2_status',{phase:status.phase,pendingCount:status.pendingCount,revision:status.revision??0});}
    async function token() {
      const session=await sessionProvider();
      const value=typeof session==='string'?session:session?.access_token;
      if(!value||typeof value!=='string') throw typedError('auth_required');
      return value;
    }
    async function rpc(name,body,method='POST') {
      const accessToken=await token(), ctrl=new AbortController();
      const timer=setTimeout(()=>ctrl.abort(),10000);
      let response;
      try {
        response=await request(url+'/rest/v1/rpc/'+name,{
          method,headers:{apikey:publicKey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
          body:JSON.stringify(body),signal:ctrl.signal
        });
        let result;
        try{result=await response.json()}catch(_){throw typedError('invalid_server_response',response.status||0)}
        if(!response.ok) {
          const kind=response.status===401||response.status===403?'unauthorized':
            response.status===409?'conflict':'http_failure';
          throw typedError(kind,response.status||0);
        }
        if(!result||result.ok!==true) {
          const kind=['conflict','unauthorized','idempotency_key_reused','invalid_request',
            'payload_too_large'].includes(result?.error)?result.error:'server_rejected';
          throw typedError(kind,response.status||200);
        }
        return result;
      }catch(error){
        if(error.name==='AbortError')throw typedError('timeout');
        if(error.kind)throw error;
        throw typedError('network_failure');
      }finally {clearTimeout(timer);}
    }
    async function load() {
      const data=await rpc('family_load_v2',{p_family_id:familyId});
      if(!Number.isInteger(data.revision)||!data.payload||
         !Array.isArray(data.payload.homework))throw typedError('invalid_family_payload');
      latest={payload:data.payload,revision:data.revision};
      setStatus({revision:data.revision});
      event(onEvent,'v2_cloud_loaded',{revision:data.revision});
      return latest;
    }
    async function pending(){const rows=await outbox.list();setStatus({pendingCount:rows.length});return rows;}
    async function enqueueAddHomework(homework) {
      if(!homework ||typeof homework.id!=='string'||!homework.id||homework.id.length>128)
        throw typedError('invalid_homework');
      // The user interface must persist its own local state before queueing.
      const operation={operationId:newId(),kind:'add_homework',homework,createdAt:clock()};
      await outbox.put(operation); // durable before network attempt
      const rows=await pending();
      event(onEvent,'v2_pending_queued',{pendingCount:rows.length});
      return operation.operationId;
    }
    async function applyOne(op) {
      if(op.kind!=='add_homework'||!op.homework?.id) throw typedError('unsupported_pending_operation');
      for(let attempt=0;attempt<4;attempt++){
        const remote=await load();
        const existing=remote.payload.homework.find(x=>x.id===op.homework.id);
        if(existing) {
          if(canonical(existing)!==canonical(op.homework))throw typedError('homework_id_conflict');
          // A previous write may have succeeded even if its HTTP response was lost.
          await outbox.remove(op.operationId);
          event(onEvent,'v2_existing_confirmed',{revision:remote.revision});
          return;
        }
        const payload={...remote.payload,homework:[...remote.payload.homework,op.homework]};
        try{
          const saved=await rpc('family_save_v2',{p_family_id:familyId,p_payload:payload,
            p_expected_revision:remote.revision,p_operation_id:op.operationId});
          event(onEvent,'v2_save_ack',{revision:saved.revision});
          const verified=await load();
          const item=verified.payload.homework.find(x=>x.id===op.homework.id);
          if(!item||canonical(item)!==canonical(op.homework)) throw typedError('readback_mismatch');
          await outbox.remove(op.operationId);
          event(onEvent,'v2_server_verified',{revision:verified.revision});
          return;
        }catch(error) {
          if(error.kind==='conflict' && attempt<3){
            event(onEvent,'v2_revision_conflict',{revision:remote.revision,attempt:attempt+1});
            continue;
          }
          throw error;
        }
      }
      throw typedError('retry_limit_reached');
    }
    async function flush() {
      if(inFlight)return inFlight;
      inFlight=(async()=>{
        const rows=await pending();
        if(!rows.length){setStatus({phase:'synced',lastError:null});return {ok:true,pending:0};}
        setStatus({phase:'uploading',lastError:null});
        try{
          for(const op of rows) await applyOne(op);
          const after=await pending();
          setStatus({phase:after.length?'pending':'synced',lastError:null});
          return {ok:after.length===0,pending:after.length};
        }catch(error){
          const remaining=await pending();
          setStatus({phase:'pending',pendingCount:remaining.length,lastError:error.kind||'unknown'});
          event(onEvent,'v2_upload_failed',{reason:error.kind||'unknown',httpStatus:error.status||0});
          throw error;
        }
      })();
      try{return await inFlight}finally{inFlight=null}
    }
    async function checkRemote(){
      const value=await load();
      return {payload:value.payload,revision:value.revision,pending:await pending()};
    }
    function getStatus(){return {...status};}
    // In staging this component is opt-in. Caller supplies authenticated session,
    // local-first UI persistence, and handles visibility/network resume.
    return {enqueueAddHomework,flush,checkRemote,pending,getStatus};
  }
  window.IslandV2Sync={create,browserOutbox};
})();
