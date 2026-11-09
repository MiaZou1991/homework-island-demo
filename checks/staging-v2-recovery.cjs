// Staging-only end-to-end V2 persistence under controlled transport failures.
// Genuine Supabase JWT, family_load_v2/family_save_v2 and server readback; no production access.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const URL='https://tgnznizqhheiwgdhvwdc.supabase.co';
const FAM='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const key=process.env.KAIXIN_STAGE_KEY,token=process.env.KAIXIN_STAGE_PARENT_A_JWT;
if(process.env.KAIXIN_STAGE_URL!==URL||!key?.startsWith('sb_publishable_')||!token){
  console.error('BLOCKED: staging QA credentials unavailable');process.exit(2);
}
const ctx={window:{},fetch,crypto:{randomUUID},AbortController,Date,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(__dirname+'/../dist/v2-sync-client.js','utf8'),ctx);
async function serverLoad(){
 const res=await fetch(URL+'/rest/v1/rpc/family_load_v2',{
  method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({p_family_id:FAM})
 });
 const j=await res.json();assert.equal(j?.ok,true);return j;
}
async function scenario(failure){
 const events=[],outbox=new Map(),taskId='qa-resume-'+failure+'-'+randomUUID();
 let failed=false,firstSaved=false;
 const store={
  put:async op=>outbox.set(op.operationId,op),
  remove:async id=>outbox.delete(id),
  list:async()=>[...outbox.values()]
 };
 const proxy=async(url,init)=>{
  assert.ok(url.startsWith(URL+'/rest/v1/rpc/'),'only staging RPC permitted');
  if(url.endsWith('/family_save_v2')&&!failed){
    failed=true;
    if(failure==='http503')return{ok:false,status:503,json:async()=>({ok:false})};
    if(failure==='timeout'){const e=new Error('test');e.name='AbortError';throw e;}
    if(failure==='lostAck'){
      const response=await fetch(url,init);
      const j=await response.json();
      assert.equal(j?.ok,true,'server must save before hiding reply');
      firstSaved=true;
      throw new Error('test dropped reply');
    }
  }
  return fetch(url,init);
 };
 const client=()=>ctx.window.IslandV2Sync.create({
  url:URL,publicKey:key,familyId:FAM,sessionProvider:async()=>token,
  fetcher:proxy,store,uuid:randomUUID,onEvent:e=>events.push(e)
 });
 const initial=await serverLoad(),c=client();
 await c.enqueueAddHomework({id:taskId,subject:'QA',content:'STAGING_SYNTHETIC_ONLY'});
 await assert.rejects(c.flush());
 assert.equal((await c.pending()).length,1,'failed transport must retain pending');
 const mid=await serverLoad();
 assert.equal(mid.payload.homework.some(h=>h.id===taskId),firstSaved);
 const c2=client(); // reconstruct client using original persisted store
 const result=await c2.flush();
 assert.equal(result.ok,true);
 assert.equal((await c2.pending()).length,0);
 const final=await serverLoad();
 assert.equal(final.payload.homework.filter(h=>h.id===taskId).length,1);
 assert.equal(final.revision-initial.revision,1,'one logical edit must advance revision once');
 const exported=JSON.stringify(events);
 assert.equal(exported.includes('STAGING_SYNTHETIC_ONLY'),false);
 assert.equal(exported.includes(token),false);
 return{failure,firstAttempt:'pending_retained',recovery:'verified_once',revision:final.revision};
}
(async()=>{
 const results=[];
 for(const type of ['http503','timeout','lostAck'])results.push(await scenario(type));
 console.log(JSON.stringify({test:'V2_STAGING_REAL_RPC_RECOVERY',
  conclusion:'PASS',results,note:'Controlled transport faults; server storage and recovery are real; not Safari'}));
})().catch(err=>{
 console.error('RECOVERY_NOT_PASSED '+String(err?.message||'error').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100));
 process.exitCode=1;
});
