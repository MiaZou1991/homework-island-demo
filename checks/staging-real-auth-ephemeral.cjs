// One-shot staging-only REAL Supabase Auth/JWT integration runner.
// Executed in GitHub Actions: JWTs exist only in process memory, never logs/artifacts.
// Staging family membership is inserted independently by an admin after IDs appear in
// the CI log; no privileged service key is available to this runner.
//
// This deliberately DOES NOT touch production, change Auth configuration, or accept
// user-provided family IDs. It is not imported by the normal app.
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const URL = 'https://tgnznizqhheiwgdhvwdc.supabase.co';
const QA_FAMILY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const key = process.env.KAIXIN_STAGE_PUBLIC_KEY || '';
if (!key.startsWith('sb_publishable_')) {
  console.error('BLOCKED: staging-only publishable key missing');
  process.exit(2);
}
const roles = ['parent_a', 'parent_b', 'child', 'outsider'];
const sessions = Object.create(null);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, body, accessToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(URL + path, {
      method: body === null ? 'GET' : 'POST',
      headers: { apikey:key, 'Content-Type':'application/json',
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}) },
      body:body === null ? undefined : JSON.stringify(body),
      signal:controller.signal
    });
    // Do not log the raw server reply; it may contain JWT/refresh token.
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return {ok:res.ok,status:res.status,data};
  } finally { clearTimeout(timeout); }
}
async function signUp(role) {
  const res = await api('/auth/v1/signup', {
    data: { kaixin_qa_suite:'p0_real_auth_20261109', kaixin_qa_role:role },
    gotrue_meta_security: { captcha_token:null }
  });
  if (!res.ok || !res.data?.access_token || !res.data?.user?.id)
    throw new Error('auth_signup_' + role + '_status_' + res.status +
       '_code_' + String(res.data?.code || res.data?.error_code || res.data?.msg || 'unknown').replace(/[^a-z_]/gi,'').slice(0,80));
  const token = res.data.access_token, id = res.data.user.id;
  assert.match(id,/^[a-f0-9-]{36}$/i);
  const profile = await api('/auth/v1/user',null,token);
  assert.equal(profile.ok,true,'real JWT must be accepted by Auth');
  assert.equal(profile.data?.id,id,'token must resolve to its own Auth user');
  sessions[role] = { id, token };
  // Test-only random UUIDs are safe to display for explicit admin enrollment.
  console.log('QA_AUTH_USER_CREATED role=' + role + ' id=' + id);
}
async function checkMembership() {
  const res = await api('/rest/v1/rpc/family_load_v2',
    { p_family_id:QA_FAMILY }, sessions.parent_a.token);
  return !!(res.ok && res.data?.ok === true && Array.isArray(res.data.payload?.homework));
}
(async () => {
  for (const role of roles) await signUp(role);
  console.log('QA_AUTH_USERS_READY ' + JSON.stringify(Object.fromEntries(roles.map(role=>[role,sessions[role].id]))));
  console.log('WAITING_FOR_STAGING_ADMIN_ENROLLMENT synthetic QA family, no Auth secrets shared');
  let admitted = false;
  // 9 minute upper bound. Admin tool assigns these UUIDs in staging DB only.
  for (let i = 0; i < 180; i++) {
    if (await checkMembership()) { admitted = true; break; }
    await sleep(3000);
  }
  if (!admitted) throw new Error('qa_membership_not_enrolled_before_timeout');
  console.log('QA_MEMBERSHIP_CONFIRMED: running REAL JWT and HTTP integration');
  const env = {
    ...process.env,
    KAIXIN_STAGE_URL: URL,
    KAIXIN_STAGE_KEY: key,
    KAIXIN_STAGE_PARENT_A_JWT:sessions.parent_a.token,
    KAIXIN_STAGE_PARENT_B_JWT:sessions.parent_b.token,
    KAIXIN_STAGE_CHILD_JWT:sessions.child.token,
    KAIXIN_STAGE_OUTSIDER_JWT:sessions.outsider.token
  };
  const result = spawnSync(process.execPath, ['checks/staging-db-sync.cjs','--stage','--conflicts'],{
    env, encoding:'utf8', timeout:180000, maxBuffer:500000,
  });
  // Only the child contract's already-scrubbed test report is printed.
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) throw new Error('real_jwt_contract_failed');
  console.log('PASS REAL SUPABASE JWT+RPC+CAS+RLS INTEGRATION - STAGING ONLY');
  const ws=spawnSync(process.execPath,['checks/staging-realtime-ws.cjs'],{
    env,encoding:'utf8',timeout:100000,maxBuffer:150000
  });
  if(ws.stdout)process.stdout.write(ws.stdout);
  if(ws.stderr)process.stderr.write(ws.stderr);
  if(ws.error||ws.status!==0)throw new Error('real_staging_websocket_validation_failed');
  console.log('PASS REAL SUPABASE WEBSOCKET + MEMBERSHIP REVISIONS - STAGING ONLY');
})().catch(error => {
  console.error('QA_FAILURE ' + String(error?.message || 'unknown').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,120));
  process.exitCode = 1;
});
