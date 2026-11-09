// Real database contract test. STAGING ONLY: never point this at the family's production project.
// Set KAIXIN_STAGE_URL and KAIXIN_STAGE_KEY. No environment is provided in CI by default.
// Run node checks/staging-db-sync.cjs --stage [--conflicts]
// A unique synthetic test family is created for each run. No production family is read/written.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const PRODUCTION_PROJECT = 'syqcpfjudjniripzcjdq';
const url = String(process.env.KAIXIN_STAGE_URL || '').replace(/\/$/, '');
const key = String(process.env.KAIXIN_STAGE_KEY || '');
const runConflict = process.argv.includes('--conflicts');
if (!process.argv.includes('--stage') || !url || !key) {
  console.error('NOT RUN: supply --stage and KAIXIN_STAGE_URL/KAIXIN_STAGE_KEY for a separate staging Supabase project');
  process.exit(2);
}
const host = new URL(url);
if (host.protocol !== 'https:' || !host.hostname.endsWith('.supabase.co') ||
    host.hostname.startsWith(PRODUCTION_PROJECT + '.') ||
    url.includes(PRODUCTION_PROJECT)) {
  console.error('BLOCKED: invalid staging host or production project detected');
  process.exit(2);
}
// 8 uppercase alphanumeric characters, deliberately never KAIXIN.
const family = 'T' + crypto.randomBytes(4).toString('hex').slice(0, 7).toUpperCase();
const testId = crypto.randomBytes(4).toString('hex');
const report = { environment: 'STAGING_ONLY', testId, checks: [] };
async function request(op, payload, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(url + (op === 'revision' ? '/rest/v1/kaixin_sync_signal?id=eq.' + family + '&select=revision&limit=1' :
    '/rest/v1/rpc/' + op), {
    method: op === 'revision' ? 'GET' : 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: op === 'revision' ? undefined : JSON.stringify(payload)
  });
  let body = null;
  try { body = await response.json(); } catch (_) {}
  const info = { check: options.check || op, status: response.status, durationMs: Date.now() - startedAt };
  report.checks.push(info);
  if (!response.ok || body?.ok === false) throw Error(info.check + ' failed, HTTP=' + response.status + ', rpc_ok=' + body?.ok);
  return body;
}
async function load(check) {
  return request('family_load', { p_family_code: family }, { check });
}
async function save(data, check) {
  return request('family_save', { p_family_code: family, p_payload: data }, { check });
}
async function main() {
  const empty = await load('new-family-read');
  assert.equal(!!empty?.exists, false, 'a unique staging family must start empty');
  const initial = { homework: [{ id: 'qa-' + testId + '-1', content: 'STAGING_SYNTHETIC_ONLY', subject: 'QA' }], events: [], classes: [] };
  const a = await save(initial, 'client-a-write');
  assert.equal(a?.ok, true);
  const fromB = await load('client-b-readback');
  assert.equal(fromB?.exists, true);
  assert.equal(fromB.payload.homework[0].id, initial.homework[0].id);
  assert.equal(fromB.payload.homework.length, 1);
  const updated = { ...initial, homework: [...initial.homework, { id: 'qa-' + testId + '-2', content: 'STAGING_SYNTHETIC_ONLY', subject: 'QA' }] };
  const b = await save(updated, 'client-b-update');
  const fromA = await load('client-a-readback');
  assert.equal(fromA.payload.homework.length, 2);
  assert.deepEqual(fromA.payload.homework.map(h => h.id), updated.homework.map(h => h.id));
  if (Number.isInteger(a.revision) && Number.isInteger(b.revision)) {
    assert.ok(b.revision > a.revision, 'a successful write must advance server revision');
    report.checks.push({ check: 'revision-increases', result: 'PASS', from: a.revision, to: b.revision });
  } else throw Error('family_save did not return integer revision');
  // Contract should ensure a stale client cannot silently delete a newer task.
  // Run this destructive-to-test-family scenario only with --conflicts and staging credentials.
  if (runConflict) {
    const snapshot = await load('both-clients-base');
    const clientA = { ...snapshot.payload, homework: [...snapshot.payload.homework, { id: 'qa-' + testId + '-a' }] };
    const clientB = { ...snapshot.payload, homework: [...snapshot.payload.homework, { id: 'qa-' + testId + '-b' }] };
    await save(clientA, 'client-a-race-write');
    let secondRejected = false;
    try { await save(clientB, 'client-b-stale-write'); }
    catch (err) { secondRejected = true; }
    const result = await load('race-final-read');
    const ids = new Set(result.payload.homework.map(h => h.id));
    assert.ok(secondRejected || (ids.has('qa-' + testId + '-a') && ids.has('qa-' + testId + '-b')),
      'BLOCKER: stale client overwrote a concurrent device update (requires server-side revision/CAS)');
    report.checks.push({ check: 'concurrent-write-protection', result: 'PASS' });
  }
  console.log(JSON.stringify({ ...report, conclusion: 'PASS', note: 'synthetic staging database only; inspect RLS and realtime publication separately' }, null, 2));
}
main().catch(error => {
  console.error(JSON.stringify({ ...report, conclusion: 'FAIL', failure: error.message }, null, 2));
  process.exitCode = 1;
});
