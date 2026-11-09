// V2 browser transport regression suite. All credentials and RPC responses are synthetic.
const fs=require('node:fs'), vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),src=fs.readFileSync(path.join(__dirname,'../dist/v2-sync-client.js'),'utf8');
const URL='https://tgnznizqhheiwgdhvwdc.supabase.co',KEY='pub-test-only',FAMILY='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function setup(options={}){
  const stored=new Map(),logs=[],ops=new Map(),counts={load:0,save:0},saved=new Map();
  const remote={revision:1,payload:{homework:[{id:'original',content:'keep-me'}],other:'must-preserve'}};
  let failSaves=options.failSaves||0,loseAck=!!options.loseAck,unauthorized=!!options.unauthorized;
  let id=0;
  const opStore={
    async put(op){ops.set(op.operationId,JSON.parse(JSON.stringify(op)))},
    async remove(opId){ops.delete(opId)},
    async list(){return [...ops.values()].sort((a,b)=>a.createdAt-b.createdAt)}
  };
  const network=async(url,request)=>{
    assert.ok(url.startsWith(URL+'/rest/v1/rpc/'));
    assert.equal(request.headers.apikey,KEY);assert.equal(request.headers.Authorization,'Bearer jwt-synthetic');
    const name=url.substring(url.lastIndexOf('/')+1),data=JSON.parse(request.body);
    assert.equal(data.p_family_id,FAMILY);
    if(name==='family_load_v2'){
      counts.load++;
      return {ok:true,status:200,json:async()=>({ok:true,exists:true,revision:remote.revision,payload:JSON.parse(JSON.stringify(remote.payload))})};
    }
    assert.equal(name,'family_save_v2');counts.save++;
    if(unauthorized)return{ok:true,status:200,json:async()=>({ok:false,error:'unauthorized'})};
    if(failSaves-- > 0)return {ok:false,status:503,json:async()=>({message:'UNTRUSTED_PRIVATE_PAYLOAD'})};
    const prev=saved.get(data.p_operation_id);
    if(prev)return{ok:true,status:200,json:async()=>({ok:true,duplicate:true,revision:prev})};
    if(data.p_expected_revision!==remote.revision)return{ok:true,status:200,json:async()=>({ok:false,error:'conflict',revision:remote.revision})};
    const revision=++remote.revision;
    remote.payload=JSON.parse(JSON.stringify(data.p_payload));
    saved.set(data.p_operation_id,revision);
    if(loseAck){loseAck=false;throw Error('transport failed after save committed')}
    return{ok:true,status:200,json:async()=>({ok:true,duplicate:false,revision})};
  };
  const ctx={window:{},fetch:network,AbortController,Date,crypto:{randomUUID:()=>('00000000-0000-4000-8000-'+String(++id).padStart(12,'0'))},
    setTimeout(fn){return 1},clearTimeout(){},console};
  vm.runInNewContext(src,ctx);
  const client=()=>ctx.window.IslandV2Sync.create({url:URL,publicKey:KEY,familyId:FAMILY,
    sessionProvider:async()=>({access_token:'jwt-synthetic'}),fetcher:network,store:opStore,
    onEvent:x=>logs.push(x),uuid:()=>('00000000-0000-4000-8000-'+String(++id).padStart(12,'0')),now:()=>id});
  return{client,remote,counts,logs,ops,opStore,turnOffErrors(){failSaves=0},enableUnauthorized(){unauthorized=true},
    addRemoteTask(task){remote.payload.homework.push(task);remote.revision++}};
}
(async()=>{
  const a=setup(),first=a.client(),second=a.client();
  const op1=await first.enqueueAddHomework({id:'parent-a',content:'PRIVATE_HOMEWORK_SENTINEL'});
  assert.equal((await first.pending()).length,1,'outbox must persist before network');
  await second.enqueueAddHomework({id:'parent-b',content:'different phone'});
  await Promise.all([first.flush(),second.flush()]);
  assert.deepEqual(new Set(a.remote.payload.homework.map(x=>x.id)),new Set(['original','parent-a','parent-b']));
  assert.equal(a.remote.payload.other,'must-preserve','unrelated server fields survive');
  assert.equal((await first.pending()).length,0);
  assert.equal(a.remote.revision,3);
  assert.equal(a.logs.some(x=>x.event==='v2_save_ack'),true);
  assert.equal(JSON.stringify(a.logs).includes('PRIVATE_HOMEWORK_SENTINEL'),false);
  assert.equal(JSON.stringify(a.logs).includes('jwt-synthetic'),false);

  const offline=setup({failSaves:1}),c=offline.client();
  await c.enqueueAddHomework({id:'offline-added'});
  await assert.rejects(c.flush(),e=>e.kind==='http_failure');
  assert.equal((await c.pending()).length,1,'503 must preserve durable operation');
  offline.turnOffErrors();
  await c.flush();
  assert.equal((await c.pending()).length,0);
  assert.equal(offline.remote.payload.homework.filter(x=>x.id==='offline-added').length,1);

  const lost=setup({loseAck:true}),d=lost.client();
  await d.enqueueAddHomework({id:'lost-ack'});
  await assert.rejects(d.flush(),e=>e.kind==='network_failure');
  assert.equal((await d.pending()).length,1);
  await d.flush();
  assert.equal((await d.pending()).length,0);
  assert.equal(lost.remote.payload.homework.filter(x=>x.id==='lost-ack').length,1);
  assert.equal(lost.remote.revision,2,'lost acknowledgement retry must not write twice');

  const noAuth=setup(),z=noAuth.client();
  await z.enqueueAddHomework({id:'protected'});
  noAuth.enableUnauthorized();
  await assert.rejects(z.flush(),e=>e.kind==='unauthorized');
  assert.equal((await z.pending()).length,1);

  const idCollision=setup(),v=idCollision.client();
  await v.enqueueAddHomework({id:'same-id',content:'LOCAL'});
  idCollision.addRemoteTask({id:'same-id',content:'REMOTE'});
  await assert.rejects(v.flush(),e=>e.kind==='homework_id_conflict');
  assert.equal((await v.pending()).length,1,'conflicting item must never be silently dropped');
  assert.equal(idCollision.remote.payload.homework.some(x=>x.content==='LOCAL'),false);

  console.log('PASS V2 transport: two devices, CAS retry, server-preserving merge, durable pending, HTTP 503, lost ACK idempotency, unauthorized, data collision, log privacy');
})().catch(e=>{console.error(e);process.exitCode=1});
