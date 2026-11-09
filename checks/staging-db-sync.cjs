// Real Supabase V2 HTTP/Auth integration checks. STAGING ONLY.
// Never run against the production project or with real family/child data.
// This requires four REAL Supabase Auth test-user JWTs, with their auth.uid()
// identities enrolled in the synthetic staging family by a staging administrator.
// No JWTs, apikeys, raw HTTP bodies or homework contents are logged.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');

const STAGING_REF = 'tgnznizqhheiwgdhvwdc';
const TEST_FAMILY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const url = String(process.env.KAIXIN_STAGE_URL || '').replace(/\/$/, '');
const key = String(process.env.KAIXIN_STAGE_KEY || '');
const jwt = {
  a: process.env.KAIXIN_STAGE_PARENT_A_JWT || '',
  b: process.env.KAIXIN_STAGE_PARENT_B_JWT || '',
  child: process.env.KAIXIN_STAGE_CHILD_JWT || '',
  outsider: process.env.KAIXIN_STAGE_OUTSIDER_JWT || ''
};
const runRace = process.argv.includes('--conflicts');
if (!process.argv.includes('--stage') || !url || !key || Object.values(jwt).some(v => !v)) {
  console.error('NOT RUN: needs --stage, staging URL/key and 4 REAL staging test Auth JWTs. No database call made.');
  process.exit(2);
}
let u;
try { u = new URL(url); } catch { console.error('INVALID STAGING URL'); process.exit(2); }
if (u.protocol !== 'https:' || u.hostname !== STAGING_REF + '.supabase.co' ||
    u.pathname !== '/' && u.pathname !== '' || u.search) {
  console.error('BLOCKED: URL must be the one approved isolated Supabase staging project.');
  process.exit(2);
}
const report = { environment: 'ISOLATED_SUPABASE_STAGING', runId: randomUUID(), checks: [] };
async function request(name, path, options = {}, token = '') {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url + path, {
      method: options.method || 'POST',
      headers: { apikey: key, ...(token ? {Authorization: 'Bearer ' + token} : {}),
        'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: ctrl.signal
    });
    let json;
    try { json = await res.json(); } catch { throw Error('invalid_json_' + name); }
    report.checks.push({ check: name, httpStatus: res.status, ms: Date.now() - started,
      result: (res.ok && json?.ok !== false) ? 'api_ok' : 'api_rejected' });
    return {status: res.status, ok: res.ok, body: json};
  } finally { clearTimeout(timer); }
}
function rpc(name, fn, token, body) {
  return request(name, '/rest/v1/rpc/' + fn, {method:'POST', body}, token);
}
function load(name,token) { return rpc(name,'family_load_v2',token,{p_family_id:TEST_FAMILY_ID}); }
function save(name,token,payload,expected,operation) {
  return rpc(name,'family_save_v2',token,{
    p_family_id: TEST_FAMILY_ID, p_payload: payload,
    p_expected_revision: expected, p_operation_id: operation
  });
}
function qaTask(id) { return {id,content:'STAGING_SYNTHETIC_ONLY',subject:'QA'}; }
function safePayload(x) {
  assert.equal(x?.ok,true,'failed reading test family; verify Auth test identities and staging enrollment');
  assert.equal(Array.isArray(x.payload?.homework),true,'invalid family test payload');
  assert.ok(x.payload.homework.every(h=>typeof h.id==='string'&&h.id.startsWith('qa-')),
    'BLOCKED: staging family contains non-QA data; refuse all writes');
  assert.ok(Number.isInteger(x.revision) && x.revision>0,'invalid revision');
  return x;
}
function append(data,id) {
  return {...data,homework:[...data.homework,qaTask(id)]};
}
function assertDenied(r,name) {
  assert.ok(!r.ok || r.body?.ok===false,name+' must be denied');
}
async function main() {
  // Real /auth/v1/user JWT validation, not a SQL simulation of auth.uid().
  const identities = [];
  for(const [name,token] of Object.entries(jwt)) {
    const r=await request('auth_'+name,'/auth/v1/user',{method:'GET'},token);
    assert.equal(r.ok,true,'real Supabase Auth session invalid for '+name);
    assert.ok(r.body?.id,'missing Auth user id for '+name);
    identities.push(r.body.id);
  }
  assert.equal(new Set(identities).size,4,'four test identities must be distinct');

  const anonymous = await rpc('anon_denied','family_load_v2','',{p_family_id:TEST_FAMILY_ID});
  assertDenied(anonymous,'anonymous read');
  const outside = await load('other_family_denied',jwt.outsider);
  assertDenied(outside,'external family read');
  const start=safePayload((await load('parent_a_initial',jwt.a)).body);
  const childRead=safePayload((await load('child_initial',jwt.child)).body);
  assert.equal(childRead.revision,start.revision);

  const id='qa-'+report.runId+'-a';
  const payloadA=append(start.payload,id);
  const op=randomUUID();
  const a=await save('parent_a_write',jwt.a,payloadA,start.revision,op);
  assert.equal(a.body?.ok,true,'parent A save not acknowledged');
  assert.equal(a.body?.revision,start.revision+1,'unexpected revision advance');
  const bRead=safePayload((await load('parent_b_readback',jwt.b)).body);
  assert.equal(bRead.revision,a.body.revision);
  assert.ok(bRead.payload.homework.some(h=>h.id===id),'parent B did not see A homework');

  const repeat=await save('idempotent_replay',jwt.a,payloadA,start.revision,op);
  assert.equal(repeat.body?.ok,true);assert.equal(repeat.body?.duplicate,true);
  assert.equal(repeat.body.revision,a.body.revision);
  const reused=await save('reused_operation_rejected',jwt.a,start.payload,start.revision,op);
  assert.equal(reused.body?.error,'idempotency_key_reused');

  const stale=await save('stale_revision_rejected',jwt.b,append(start.payload,'qa-stale-'+report.runId),start.revision,randomUUID());
  assert.equal(stale.body?.error,'conflict','stale overwrite unexpectedly accepted');
  const childSave=await save('child_full_snapshot_denied',jwt.child,append(payloadA,'qa-child-'+report.runId),a.body.revision,randomUUID());
  assertDenied(childSave,'child full snapshot write');
  const outsiderSave=await save('outsider_save_denied',jwt.outsider,append(payloadA,'qa-outside-'+report.runId),a.body.revision,randomUUID());
  assertDenied(outsiderSave,'external family write');

  let current=safePayload((await load('before_notification',jwt.b)).body);
  const signal=await request('realtime_signal_read',
    '/rest/v1/kaixin_sync_signal_v2?family_id=eq.'+TEST_FAMILY_ID+'&select=revision', {method:'GET'},jwt.b);
  assert.equal(signal.ok,true);
  assert.equal(Array.isArray(signal.body),true);
  assert.equal(signal.body.length,1);
  assert.equal(signal.body[0].revision,current.revision);
  const signalOther=await request('signal_member_isolation',
    '/rest/v1/kaixin_sync_signal_v2?family_id=eq.'+TEST_FAMILY_ID+'&select=revision', {method:'GET'},jwt.outsider);
  assert.equal(signalOther.ok,true);
  assert.equal(signalOther.body.length,0);

  if(runRace) {
    const raceA='qa-'+report.runId+'-race-a',raceB='qa-'+report.runId+'-race-b';
    const [x,y]=await Promise.all([
      save('racing_parent_a',jwt.a,append(current.payload,raceA),current.revision,randomUUID()),
      save('racing_parent_b',jwt.b,append(current.payload,raceB),current.revision,randomUUID())
    ]);
    const winners=[x,y].filter(v=>v.body?.ok===true),losers=[x,y].filter(v=>v.body?.error==='conflict');
    assert.equal(winners.length,1,'expected exactly one racing write success');
    assert.equal(losers.length,1,'expected stale competing write to return conflict');
    const updated=safePayload((await load('race_readback',jwt.a)).body);
    const ids=new Set(updated.payload.homework.map(h=>h.id));
    assert.equal(ids.has(raceA)&&ids.has(raceB),false,'both changes cannot appear before merge');
    const missing=ids.has(raceA)?raceB:raceA;
    const merged=await save('merge_missing_on_latest',jwt.b,append(updated.payload,missing),updated.revision,randomUUID());
    assert.equal(merged.body?.ok,true);
    const after=safePayload((await load('race_merged_readback',jwt.a)).body);
    const finalIds=new Set(after.payload.homework.map(h=>h.id));
    assert.ok(finalIds.has(raceA)&&finalIds.has(raceB),'one racing task was lost');
  }
  console.log(JSON.stringify({...report,conclusion:'PASS',
    note:'Real Auth HTTP/RPC and RLS passed in isolated staging; WebSocket, forced network errors and physical iPhone tests still separate'},null,2));
}
main().catch(error=>{
  // Never print raw server response, secrets, JWT, payload, or stack.
  console.error(JSON.stringify({...report,conclusion:'FAIL',failureCode:String(error?.message||'unknown').slice(0,160)},null,2));
  process.exitCode=1;
});
