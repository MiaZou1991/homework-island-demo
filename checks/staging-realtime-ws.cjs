// Real Supabase Realtime WebSocket regression, staging only.
// Run only inside checks/staging-real-auth-ephemeral.cjs after four real Auth JWTs
// have been generated and enrolled into the synthetic QA families.
// Logs event type/revision/timing ONLY. Never logs JWT, key, payload or homework.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const URL='https://tgnznizqhheiwgdhvwdc.supabase.co';
const FAMILY='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const key=process.env.KAIXIN_STAGE_KEY;
const jwt={a:process.env.KAIXIN_STAGE_PARENT_A_JWT,
  b:process.env.KAIXIN_STAGE_PARENT_B_JWT,
  child:process.env.KAIXIN_STAGE_CHILD_JWT,
  outsider:process.env.KAIXIN_STAGE_OUTSIDER_JWT};
if(!key?.startsWith('sb_publishable_')||Object.values(jwt).some(x=>!x)||
  process.env.KAIXIN_STAGE_URL!==URL||typeof WebSocket!=='function'){
  console.error('BLOCKED: staging-only key, real JWTs or native WebSocket unavailable');
  process.exit(2);
}
const now=()=>Date.now();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function rpc(name,token,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetch(URL+'/rest/v1/rpc/'+name,{
      method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:controller.signal});
    const d=await res.json();
    if(!res.ok||d?.ok!==true)throw Error('rpc_'+name+'_failed');
    return d;
  }finally{clearTimeout(timer);}
}
function connect(role){
  const token=jwt[role];
  const topic='realtime:p0-ws-'+role+'-'+randomUUID();
  const config={broadcast:{ack:false,self:false},presence:{enabled:false},
    postgres_changes:[{event:'*',schema:'public',table:'kaixin_sync_signal_v2',filter:'family_id=eq.'+FAMILY}],
    private:false};
  let socket,joined=false,settled=false,done;
  const messages=[],errors=[];
  const ready=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{if(!settled){settled=true;reject(Error('join_timeout_'+role));socket?.close();}},20000);
    const accept=()=>{if(!settled){settled=true;clearTimeout(timeout);resolve()}};
    const fail=(type)=>{errors.push(type);if(!settled){settled=true;clearTimeout(timeout);reject(Error(type+'_'+role))}};
    socket=new WebSocket(URL.replace(/^https/,'wss')+'/realtime/v1/websocket?apikey='+encodeURIComponent(key)+'&vsn=1.0.0');
    socket.onopen=()=>socket.send(JSON.stringify({
      topic,event:'phx_join',payload:{config,access_token:token},ref:'1',join_ref:'1'
    }));
    socket.onerror=()=>fail('websocket_error');
    socket.onclose=()=>{if(!joined)fail('closed_before_join')};
    socket.onmessage=e=>{
      let msg;
      try{msg=JSON.parse(typeof e.data==='string'?e.data:String(e.data))}catch(_){return;}
      if(msg.event==='phx_reply'&&msg.topic===topic&&msg.ref==='1'){
        if(msg.payload?.status==='ok'&&msg.payload.response?.postgres_changes?.length){
          joined=true;accept();
        }else fail('join_rejected');
      }
      if(msg.event==='postgres_changes'&&msg.topic===topic){
        const d=msg.payload?.data;
        if(d?.schema==='public'&&d.table==='kaixin_sync_signal_v2'&&d.record?.family_id===FAMILY
          &&Number.isInteger(d.record.revision)){
          messages.push({revision:d.record.revision,receivedAt:now()});
        }
      }
    };
  });
  return {role,ready,messages,errors,close(){socket?.close()}};
}
async function until(predicate,ms){
  const deadline=now()+ms;
  while(now()<deadline){if(predicate())return true;await pause(200)}
  return predicate();
}
(async()=>{
  const member=connect('b'),child=connect('child'),outsider=connect('outsider');
  const clients=[member,child,outsider],start=now();
  try{
    // A properly authorized outsider may be allowed to join a channel,
    // but must receive NO record changes from a different family.
    await Promise.all(clients.map(async client=>{
      try{await client.ready}
      catch(error){if(client.role!=='outsider')throw error;}
    }));
    await pause(1200); // make sure WAL subscription is active
    const remote=await rpc('family_load_v2',jwt.a,{p_family_id:FAMILY});
    assert.ok(remote?.payload?.homework?.length);
    const id='qa-ws-'+randomUUID();
    const payload={...remote.payload,
      homework:[...remote.payload.homework,{id,content:'STAGING_SYNTHETIC_ONLY',subject:'QA'}]};
    const saved=await rpc('family_save_v2',jwt.a,{
      p_family_id:FAMILY,p_payload:payload,p_expected_revision:remote.revision,p_operation_id:randomUUID()
    });
    assert.equal(saved.revision,remote.revision+1,'revision must advance exactly once');
    const gotMember=await until(()=>member.messages.some(m=>m.revision===saved.revision),14000);
    const gotChild=await until(()=>child.messages.some(m=>m.revision===saved.revision),8000);
    await pause(2400); // allow delayed unauthorized events to surface
    const leaked=outsider.messages.some(m=>m.revision===saved.revision);
    const fresh=await rpc('family_load_v2',jwt.b,{p_family_id:FAMILY});
    assert.equal(fresh.revision,saved.revision);
    assert.ok(fresh.payload.homework.some(h=>h.id===id));
    const metrics={
      test:'REAL_STAGING_POSTGRES_CHANGES_WEBSOCKET',conclusion:'PASS',
      memberJoin:member.errors.length?'error':'ok',childJoin:child.errors.length?'error':'ok',
      outsideJoin:outsider.errors.length?'denied':'joined_without_access',
      expectedRevision:saved.revision,gotMember,gotChild,outsiderLeak:leaked,
      elapsedMs:now()-start
    };
    console.log(JSON.stringify(metrics));
    assert.equal(gotMember,true,'parent B did not receive realtime revision');
    assert.equal(gotChild,true,'child did not receive realtime revision');
    assert.equal(leaked,false,'SECURITY: outside-family JWT received private revision');
  }finally{clients.forEach(c=>c.close())}
})().catch(error=>{
  console.error('STAGING_REALTIME_FAIL '+String(error.message||'unknown').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100));
  process.exitCode=1;
});
