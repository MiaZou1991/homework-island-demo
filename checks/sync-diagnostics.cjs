// P0 sync diagnosis and recovery regression tests. All DB responses are synthetic.
// Run: node checks/sync-diagnostics.cjs
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const src = fs.readFileSync(__dirname + '/../dist/cloud-sync.js', 'utf8');
const MARKER = 'PRIVATE_HOMEWORK_CONTENT_MUST_NEVER_BE_LOGGED';

function makeEnv(opts = {}) {
  const store = new Map();
  const events = {};
  const timers = new Map();
  const requests = [];
  let nextTimer = 1;
  let failLoad = !!opts.failLoad;
  let failSave = !!opts.failSave;
  let remote = opts.remote || { homework: [{ id: 'old', subject: '数学' }], points: 2 };
  let revision = 41;
  const local = opts.local || { homework: [...remote.homework, { id: 'new', content: MARKER }], points: 2 };
  store.set('data', JSON.stringify(local));
  if (opts.pending) store.set('homework_island_sync_pending_v1:KAIXIN', 'local-v1');

  const mockFetch = async (url, init = {}) => {
    const method = url.includes('family_load') ? 'load' : url.includes('family_save') ? 'save' : 'revision';
    requests.push({ method, postLength: init.body?.length || 0 });
    if ((method === 'load' && failLoad) || (method === 'save' && failSave)) {
      return { ok: false, status: 503, json: async () => ({ error: 'never log this response' }) };
    }
    if (method === 'load') return { ok: true, status: 200, json: async () => ({ ok: true, exists: true, revision, payload: remote }) };
    if (method === 'revision') return { ok: true, status: 200, json: async () => ([{ revision }]) };
    const body = JSON.parse(init.body);
    assert.equal(body.p_family_code, 'KAIXIN');
    remote = body.p_payload;
    revision++;
    return { ok: true, status: 200, json: async () => ({ ok: true, revision }) };
  };
  const ctx = {
    window: {
      addEventListener(name, cb) { events['window:' + name] = cb; },
      dispatchEvent() {}
    },
    document: { hidden: false, addEventListener(name, cb) { events['document:' + name] = cb; } },
    navigator: { onLine: true },
    localStorage: {
      getItem(k) { return store.get(k) ?? null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); }
    },
    activeStorageKey: () => 'data',
    CustomEvent: class {}, Event: class {}, Math, Date,
    AbortController, fetch: mockFetch,
    console: { warn() {} },
    setTimeout(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(src, ctx);
  const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
  return {
    sync: ctx.window.IslandSync, store, requests, events, settle,
    setFailLoad(v) { failLoad = v; },
    setFailSave(v) { failSave = v; },
    remote() { return remote; },
    revision() { return revision; },
    async runTimers(limit = 10) {
      for (let i = 0; i < limit && timers.size; i++) {
        const [id, t] = [...timers.entries()].sort((a, b) => a[1].ms - b[1].ms)[0];
        timers.delete(id); await t.fn(); await settle();
      }
    }
  };
}

async function pendingRecovery() {
  const t = makeEnv({ failLoad: true, pending: true });
  await t.sync.start();
  assert.equal(t.sync.getStatus().current, 'pending', 'failed initial DB read must retain pending');
  assert.equal(JSON.parse(t.store.get('data')).homework.length, 2);
  const failedLog = t.sync.getDiagnostics().events.find(x => x.event === 'rpc_failed' && x.operation === 'load');
  assert.equal(failedLog.httpStatus, 503, 'diagnostics must expose real HTTP code');
  assert.equal(failedLog.reason, 'http');

  t.setFailLoad(false);
  await t.sync.retryNow();
  assert.equal(t.sync.getStatus().current, 'synced', 'manual retry must flush pending rather than silently skip');
  assert.equal(t.remote().homework.length, 2, 'DB must receive pending homework');
  assert.equal(t.store.has('homework_island_sync_pending_v1:KAIXIN'), false);
  assert.equal(t.sync.getDiagnostics().events.some(x => x.event === 'push_confirmed'), true);
  assert.equal(t.sync.getDiagnostics().events.some(x => x.event === 'pending_cleared'), true);
  assert.equal(t.requests.filter(x => x.method === 'save').length, 1, 'one successful server write');

  const exported = JSON.stringify(t.sync.getDiagnostics());
  assert.equal(exported.includes(MARKER), false, 'log must never contain homework content');
  assert.equal(exported.includes('sb_publishable'), false, 'log must never contain an API key');
  assert.equal(exported.includes('syqcpfjudjniripzcjdq'), false, 'log must never contain DB URL');
}

async function failedUploadRecovery() {
  const t = makeEnv({ pending: true, failSave: true });
  await t.sync.start();
  await t.sync.retryNow();
  assert.equal(t.sync.getStatus().current, 'pending', 'HTTP 503 must not discard pending edits');
  assert.equal(t.store.get('homework_island_sync_pending_v1:KAIXIN'), 'local-v1');
  assert.equal(t.sync.getDiagnostics().events.some(x => x.event === 'upload_failed'), true);
  t.setFailSave(false);
  await t.sync.retryNow();
  assert.equal(t.sync.getStatus().current, 'synced');
  assert.equal(t.remote().homework.length, 2);
}

async function secondaryPhoneReads() {
  const remote = { homework: [{ id: 'first' }, { id: 'second' }], points: 0 };
  const t = makeEnv({ remote, local: { homework: [{ id: 'first' }], points: 0 } });
  await t.sync.start();
  assert.equal(JSON.parse(t.store.get('data')).homework.length, 2, 'second phone must get remote');
  assert.equal(t.sync.getStatus().current, 'synced');
  assert.equal(t.requests.filter(x => x.method === 'save').length, 0, 'second phone must not overwrite on load');
  assert.equal(t.sync.getDiagnostics().events.some(x => x.event === 'remote_applied'), true);
}

async function boundedRuntimeErrors() {
  const t = makeEnv();
  await t.sync.start();
  t.sync.recordEvent('local_saved');
  t.sync.recordEvent('publish_started');
  t.sync.recordEvent(MARKER); // arbitrary user text must be ignored
  t.events['window:error']?.({ error: { name: 'TypeError', message: MARKER } });
  assert.equal(t.sync.getDiagnostics().events.some(x => x.event === MARKER), false);
  assert.equal(JSON.stringify(t.sync.getDiagnostics()).includes(MARKER), false);
  assert.equal(t.sync.getDiagnostics().events.some(x => x.event === 'page_error'), true);
  for (let i = 0; i < 180; i++) t.sync.recordEvent('local_saved');
  assert.equal(t.sync.getDiagnostics().events.length, 120, 'diagnostic history is bounded');
}

(async () => {
  await pendingRecovery();
  await failedUploadRecovery();
  await secondaryPhoneReads();
  await boundedRuntimeErrors();
  console.log('PASS DB failure codes, saved pending recovery, manual retries, second phone pull, local logs and redaction');
})().catch(err => { console.error(err); process.exitCode = 1; });
