// Regression: publishing must always acknowledge a local save, even if queueing fails.
// No real family data or network calls are used.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '../dist');
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const syncSrc = fs.readFileSync(path.join(root, 'cloud-sync.js'), 'utf8');

function makeElement(value = '') {
  const classes = new Set();
  return {
    value, textContent: '', innerHTML: '', checked: false, disabled: false, files: [],
    classList: {
      add: x => classes.add(x), remove: x => classes.delete(x),
      toggle: (x, on) => on ? classes.add(x) : classes.delete(x),
      contains: x => classes.has(x)
    }
  };
}

function makeApp(failQueue = false, failLocal = false) {
  const store = new Map();
  const toasts = [];
  const fields = {};
  for (const name of [
    'manual-subject', 'manual-content', 'manual-deadline', 'manual-duration',
    'manual-points', 'manual-is-recurring', 'manual-attachments',
    'manual-frequency', 'manual-weekly-day', 'manual-monthly-day',
    'cycle-panel', 'manual-attach-preview', 'ovl-publish', 'btn-publish-hw'
  ]) fields[name] = makeElement();
  Object.assign(fields['manual-subject'], {value: '数学'});
  Object.assign(fields['manual-content'], {value: '完成每日口算'});
  Object.assign(fields['manual-deadline'], {value: '2026-11-09T21:00'});
  Object.assign(fields['manual-duration'], {value: '20'});
  Object.assign(fields['manual-points'], {value: '7'});
  Object.assign(fields['manual-frequency'], {value: 'daily'});
  fields['btn-publish-hw'].textContent = '✨ 发布到小岛';
  fields['ovl-publish'].classList.add('on');
  const doc = {
    body: {classList: makeElement().classList, getAttribute: () => 'parent'},
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    getElementById: id => fields[id] || null
  };
  const ctx = {
    document: doc, window: {addEventListener() {}, __ISLAND_ERRORS__: []},
    localStorage: {
      getItem: k => store.get(k) ?? null,
      setItem(k, v) {
        if (failLocal) throw Error('QuotaExceededError: local data');
        store.set(k, String(v));
      },
      removeItem: k => store.delete(k)
    },
    sessionStorage: {getItem: () => null, setItem() {}},
    location: {search: '', reload() {}}, URLSearchParams,
    Date, Math, console, setTimeout: () => 1, clearTimeout() {},
    requestAnimationFrame() {},
    IslandSync: {
      schedulePush() { if (failQueue) throw Error('QuotaExceededError: pending snapshot'); },
      getStatus() { return {current: 'pending', message: '当前数据待上传'}; }
    },
    __toasts: toasts
  };
  vm.createContext(ctx);
  vm.runInContext(appSrc, ctx);
  vm.runInContext('showToast = msg => __toasts.push(msg)', ctx);
  return {ctx, store, toasts, fields};
}

function makeCloud(store, remote) {
  const ctx = {
    document: {hidden: false, addEventListener() {}}, navigator: {onLine: true},
    window: {addEventListener() {}, dispatchEvent() {}}, activeStorageKey: () => 'data',
    localStorage: {
      getItem: k => store.get(k) ?? null,
      setItem(k, v) {
        // Old snapshots (an entire family with images) would fail this quota.
        if (k.includes('sync_pending') && String(v).length > 24)
          throw Error('QuotaExceededError: duplicate family snapshot');
        store.set(k, String(v));
      },
      removeItem: k => store.delete(k)
    },
    Event: class {}, CustomEvent: class {}, AbortController,
    console, setTimeout: () => 1, clearTimeout() {},
    fetch: async url => {
      const payload = url.endsWith('family_load')
        ? {ok: true, exists: true, payload: remote, revision: 1}
        : url.includes('kaixin_sync_signal') ? [{revision: 1}] : {ok: true, revision: 2};
      return {ok: true, json: async () => payload};
    }
  };
  vm.runInNewContext(syncSrc, ctx);
  return ctx.window.IslandSync;
}

(async () => {
  const normal = makeApp();
  const first = vm.runInContext('addManualHomework()', normal.ctx);
  assert.equal(normal.fields['btn-publish-hw'].disabled, true);
  const second = vm.runInContext('addManualHomework()', normal.ctx);
  await Promise.all([first, second]);
  const value = JSON.parse([...normal.store.values()][0]);
  assert.equal(value.homework.length, 1, 'double tap must not add twice');
  assert.equal(normal.fields['ovl-publish'].classList.contains('on'), false);
  assert.equal(normal.fields['btn-publish-hw'].disabled, false);
  assert.ok(normal.toasts.at(-1).includes('已保存'));

  const queueFail = makeApp(true);
  await vm.runInContext('addManualHomework()', queueFail.ctx);
  assert.equal(JSON.parse([...queueFail.store.values()][0]).homework.length, 1);
  assert.equal(queueFail.fields['ovl-publish'].classList.contains('on'), false);
  assert.ok(queueFail.toasts.at(-1).includes('已保存本机'));

  const localFail = makeApp(false, true);
  await vm.runInContext('addManualHomework()', localFail.ctx);
  assert.equal(localFail.store.size, 0);
  assert.ok(localFail.toasts.at(-1).includes('未保存'));
  assert.equal(localFail.fields['btn-publish-hw'].disabled, false);

  const store = new Map();
  const remote = {homework: [{id: 'old'}], points: 6};
  store.set('data', JSON.stringify(remote));
  const firstSync = makeCloud(store, remote);
  await firstSync.start();
  const updated = {homework: [{id: 'old'}, {id: 'new', content: '很长的作业'.repeat(500)}], points: 6};
  store.set('data', JSON.stringify(updated));
  firstSync.schedulePush(updated);
  assert.equal(store.get('homework_island_sync_pending_v1:KAIXIN'), 'local-v1',
    'pending storage should be a marker rather than another entire data copy');

  // When Safari reloads before the upload, the marker must prevent stale cloud overwrite.
  const afterReload = makeCloud(store, remote);
  await afterReload.start();
  assert.equal(JSON.parse(store.get('data')).homework.length, 2);
  assert.equal(afterReload.getStatus().current, 'pending');
  console.log('PASS publish feedback, no duplicate taps, sync failure, quota marker and reload recovery');
})().catch(error => {console.error(error); process.exitCode = 1;});
