/* 作业岛云端同步：家庭码对应一份 Supabase 家庭数据。 */
(() => {
  if(typeof ISLAND_PREVIEW!=='undefined'&&ISLAND_PREVIEW)return;
  const SUPABASE_URL = 'https://syqcpfjudjniripzcjdq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_01AzYHAiAZYmahNkiYWeog_Y5y6Emax';
  const CODE_KEY = 'homework_island_family_code_v1';
  const PENDING_KEY = 'homework_island_sync_pending_v1:';
  // Only store a tiny marker: the full payload is already in the main local key.
  // Duplicating attachment-heavy family data can exceed iOS Safari localStorage quota.
  const PENDING_MARKER = 'local-v1';
  const POLL_MS = 300000;
  let knownRevision = null;
  let wantedRevision = -1;
  let signal = null;
  let signalConnected = false;
  let revisionBusy = false;
  let revisionTimer = null;
  const RETRY_MS = 60000;
  let lastReadAt = -Infinity;
  let retryAfter = 0;
  let failures = 0;
  const available = () => !document.hidden && navigator.onLine !== false;
  let client = null;
  let cloudConfirmed = false;
  let started = false;
  let startPromise = null;
  let onRemoteUpdate = null;
  let pending = null;
  let pushTimer = null;
  let pollTimer = null;
  let busy = false;
  let syncState = { cloudRecord: 'unknown', current: 'unknown', message: '正在核对云端数据' };
  // Diagnostics contain only operation metadata. Never persist request/response bodies,
  // homework, family codes, photos, headers, keys, raw URLs or raw error messages.
  const DIAG_KEY = 'homework_island_sync_diagnostics_v1';
  const DIAG_LIMIT = 120;
  const session = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let history = [];
  try {
    const saved = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
    if (Array.isArray(saved)) history = saved.slice(-DIAG_LIMIT);
  } catch (_) { history = []; }
  function trace(event, details = {}) {
    const safe = {};
    for (const field of ['operation', 'httpStatus', 'durationMs', 'retryMs', 'revision', 'attempt', 'reason']) {
      const value = details[field];
      if (typeof value === 'number' && Number.isFinite(value)) safe[field] = value;
      else if (typeof value === 'string') safe[field] = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
    }
    const entry = { at: Date.now(), session, event, ...safe };
    history.push(entry);
    history = history.slice(-DIAG_LIMIT);
    try { localStorage.setItem(DIAG_KEY, JSON.stringify(history)); } catch (_) {}
  }
  function errorInfo(error) {
    return {
      httpStatus: Number.isInteger(error?.status) ? error.status : 0,
      reason: error?.name === 'AbortError' ? 'timeout' : error?.status ? 'http' : 'network'
    };
  }
  function recordEvent(event) {
    if (['local_saved', 'local_save_failed', 'publish_started', 'publish_saved', 'publish_failed'].includes(event)) trace(event);
  }

  function setSyncState(change) {
    syncState = { ...syncState, ...change };
    window.dispatchEvent(new CustomEvent('island-sync-state', { detail: { ...syncState } }));
  }

  function code() {
    return 'KAIXIN';
  }

  function localKey() {
    try { return typeof activeStorageKey === 'function' ? activeStorageKey() : 'homework_island_integrated_demo_v2'; }
    catch (_) { return 'homework_island_integrated_demo_v2'; }
  }

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(localKey()) || 'null'); }
    catch (_) { return null; }
  }

  function pendingKey() { return PENDING_KEY + code(); }

  function readPending() {
    try {
      const stored = localStorage.getItem(pendingKey());
      if (stored === PENDING_MARKER) {
        const local = readLocal();
        return validPayload(local) ? local : null;
      }
      // Backward compatible with snapshots saved by earlier releases.
      const data = JSON.parse(stored || 'null');
      return validPayload(data) ? data : null;
    } catch (_) { return null; }
  }

  function rememberPending() {
    try {
      localStorage.setItem(pendingKey(), PENDING_MARKER);
      return true;
    } catch (error) {
      console.warn('[开心岛同步] 无法保存待同步标记', error);
      return false;
    }
  }

  function notify(message) {
    if (typeof showToast === 'function') showToast(message);
  }

  function validPayload(data) {
    return data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.homework);
  }

  async function loadRemote() {
    lastReadAt = Date.now();
    const { data, error } = await client.rpc('family_load', { p_family_code: code() });
    if (error) throw error;
    if (data && data.ok === false) throw new Error(data.error || '家庭数据读取失败');
    cloudConfirmed = true;
    if (!data || !data.exists) {
      trace('cloud_load_empty');
      setSyncState({ cloudRecord: 'no', message: '云端暂无家庭记录' });
      return null;
    }
    if (!validPayload(data.payload)) throw new Error('云端家庭数据格式不正确');
    knownRevision = Number.isInteger(data.revision) ? data.revision : null;
    trace('cloud_loaded', { revision: knownRevision });
    setSyncState({ cloudRecord: 'yes', message: '云端有有效记录，正在核对当前数据' });
    return data.payload;
  }

  function applyRemote(data) {
    if (pending || !validPayload(data)) return false;
    const serialized = JSON.stringify(data);
    if (localStorage.getItem(localKey()) === serialized) return false;
    const backupKey = 'homework_island_before_kaixin_repair_v1';
    if (!localStorage.getItem(backupKey) && localStorage.getItem(localKey()))
      localStorage.setItem(backupKey, localStorage.getItem(localKey()));
    localStorage.setItem('homework_island_last_cloud_KAIXIN_v1', serialized);
    localStorage.setItem(localKey(), serialized);
    trace('remote_applied', { revision: knownRevision });
    if (typeof onRemoteUpdate === 'function') onRemoteUpdate(data);
    return true;
  }

  async function pull() {
    if (!client || !code()) return null;
    if (busy || pending) { trace('pull_skipped', { reason: busy ? 'busy' : 'pending' }); return null; }
    trace('pull_started');
    busy = true;
    try {
      const remote = await loadRemote();
      // A local edit may have happened while the request was in flight.
      if (remote) {
        applyRemote(remote);
        if (!pending && localStorage.getItem(localKey()) === JSON.stringify(remote))
          setSyncState({ current: 'synced', message: '云端有记录，当前数据已同步' });
      } else if (!pending) {
        setSyncState({ current: 'unknown', message: '云端暂无记录，当前数据只在本机' });
      }
      trace('pull_finished', { revision: knownRevision });
      return remote;
    } catch (error) {
      trace('pull_failed', errorInfo(error));
      setSyncState({ current: pending ? 'pending' : 'unknown', message: '云端读取失败，当前数据未确认' });
      throw error;
    } finally {
      busy = false;
      if (pending) scheduleFlush(0);
      drainRevision();
    }
  }

  async function push(data) {
    if (!cloudConfirmed) throw new Error("请先完成云端数据核对");
    if (!client || !code() || !validPayload(data)) return null;
    const { data: result, error } = await client.rpc('family_save', {
      p_family_code: code(), p_payload: data
    });
    if (error) throw error;
    if (result && result.ok === false) throw new Error(result.error || '家庭数据保存失败');
    if (Number.isInteger(result?.revision)) knownRevision = result.revision;
    trace('push_confirmed', { revision: knownRevision });
    return result;
  }

  function scheduleFlush(delay = 450) {
    if (!started || !client || !pending || !available()) return;
    clearTimeout(pushTimer);
    const waitMs = Math.max(delay, retryAfter - Date.now());
    if (waitMs > 0) trace('upload_retry_scheduled', { retryMs: waitMs });
    pushTimer = setTimeout(flush, waitMs);
  }

  async function flush() {
    if (busy || !pending || !client || !available()) return;
    if (Date.now() < retryAfter) { scheduleFlush(RETRY_MS); return; }
    busy = true;
    const snapshot = pending;
    try {
      // A failed initial read must not deadlock a local pending edit forever.
      // Recheck remote first, without applying it over unsynced local work.
      if (!cloudConfirmed) {
        trace('cloud_recheck_before_upload');
        await loadRemote();
      }
      trace('upload_started');
      await push(snapshot);
      if (pending === snapshot) {
        pending = null;
        localStorage.removeItem(pendingKey());
        trace('pending_cleared');
        if (localStorage.getItem(localKey()) === JSON.stringify(snapshot))
          setSyncState({ cloudRecord: 'yes', current: 'synced', message: '云端有记录，当前数据已同步' });
      }
    } catch (error) {
      trace('upload_failed', errorInfo(error));
      console.warn('[作业岛云端同步] 保存失败', error);
      notify('云端保存失败，已暂存本机；稍后自动重试');
      setSyncState({ current: 'pending', message: '当前数据待上传，稍后自动重试' });
      scheduleFlush(RETRY_MS);
    } finally {
      busy = false;
      if (pending && pending !== snapshot) scheduleFlush(0);
      drainRevision();
    }
  }

  function schedulePush(data) {
    if (!validPayload(data)) return;
    // Startup may generate recurring tasks before the cloud snapshot is read.
    // Those provisional writes must not replace an existing family.
    if (!started && !startPromise) return;
    // Keep the newest full snapshot until the server confirms the save.
    pending = data;
    trace('pending_queued');
    const persisted = rememberPending();
    setSyncState({
      current: 'pending',
      message: persisted ? '当前数据待上传' : '本机保存成功，但待同步标记写入失败；请保持页面打开直到同步完成'
    });
    scheduleFlush();
  }

  function drainRevision() {
    clearTimeout(revisionTimer);
    if (!started || busy || pending || !available() || wantedRevision <= (knownRevision ?? -1)) return;
    revisionTimer = setTimeout(() => {
      if (!available() || busy || pending) return;
      pull().catch(() => {});
    }, Math.max(200, retryAfter - Date.now()));
  }

  async function checkRevision() {
    if (!available() || revisionBusy || Date.now() < retryAfter) return;
    revisionBusy = true;
    try {
      const { data } = await client.rpc('__revision', {});
      const row = Array.isArray(data) ? data[0] : null;
      if (!row || !Number.isInteger(row.revision)) throw new Error('版本通知尚不可用');
      wantedRevision = Math.max(wantedRevision, row.revision);
      trace('revision_checked', { revision: row.revision });
      if (pending && !cloudConfirmed) {
        if (!busy) { busy = true; try { await loadRemote(); } finally { busy = false; } }
      }
      if (pending) scheduleFlush(0);
      else drainRevision();
    } catch (error) { trace('revision_check_failed', errorInfo(error)); setSyncState({ message: '暂时无法核对云端版本，本机记录保留' }); }
    finally { revisionBusy = false; }
  }

  function armPoll() {
    clearTimeout(pollTimer);
    if (!started || !available()) return;
    // No periodic data reads while the notification connection is healthy.
    if (signalConnected) return;
    pollTimer = setTimeout(async () => { await checkRevision(); armPoll(); }, Math.max(POLL_MS, retryAfter-Date.now()));
  }

  function resume() {
    trace('connection_resume', { reason: available() ? 'foreground' : 'offline_or_hidden' });
    if (!available()) {
      clearTimeout(pollTimer); clearTimeout(pushTimer); clearTimeout(revisionTimer);
      signal?.stop(); return;
    }
    signal?.start();
    if (pending) scheduleFlush(0);
    // Even with a WebSocket, Safari may suspend or miss notifications in the background.
    // On every foreground/online return, compare the latest server revision.
    checkRevision();
    if (!signalConnected) armPoll();
  }

  async function start(options = {}) {
    trace('sync_start');
    onRemoteUpdate = options.onRemoteUpdate || null;
    if (startPromise) return startPromise;
    startPromise = (async () => {
      // Native HTTP avoids waiting for a third-party SDK download.
      client = { async rpc(name, payload) {
        if (Date.now() < retryAfter) throw new Error('云端暂不可用，稍后重试');
        const operation = name === '__revision' ? 'revision' : name === 'family_load' ? 'load' : 'save';
        const startedAt = Date.now();
        trace('rpc_started', { operation });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(SUPABASE_URL + (name === '__revision' ? '/rest/v1/kaixin_sync_signal?id=eq.KAIXIN&select=revision&limit=1' : '/rest/v1/rpc/' + name), {
            method: name === '__revision' ? 'GET' : 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: name === '__revision' ? undefined : JSON.stringify(payload), signal: controller.signal
          });
          if (!response.ok) {
            const error = new Error('云端请求失败：' + response.status);
            error.status = response.status;
            throw error;
          }
          const data = await response.json();
          trace('rpc_succeeded', { operation, httpStatus: response.status || 200, durationMs: Date.now() - startedAt });
          failures = 0;
          retryAfter = 0;
          return { data, error: null };
        } catch (error) {
          failures++;
          const delay = error.status === 402 ? 30 * 60000 : Math.min(15 * 60000, RETRY_MS * 2 ** Math.min(failures - 1, 4));
          retryAfter = Date.now() + delay;
          trace('rpc_failed', { operation, ...errorInfo(error), durationMs: Date.now() - startedAt, retryMs: delay, attempt: failures });
          if (error.status === 402) setSyncState({ current: pending ? 'pending' : 'unknown', message: '云端额度受限，已暂停频繁重试；本机记录保留' });
          throw error;
        } finally { clearTimeout(timeout); }
      } };
      const local = readLocal();
      const savedPending = readPending();
      if (savedPending) {
        // Startup may have generated today's tasks in the local copy.
        pending = validPayload(local) ? local : savedPending;
        trace('pending_restored');
        // Migrate legacy full pending snapshots only when the main local data is valid.
        // Otherwise keep the older snapshot so a restart cannot discard unsynced work.
        const persisted = validPayload(local) ? rememberPending() : true;
        setSyncState({
          current: 'pending',
          message: persisted ? '本机有待上传的改动' : '待同步标记写入失败；请保持页面打开直到同步完成'
        });
      }
      let initialUploadFailed = false;
      try {
        if (!available()) throw new Error("页面在后台或网络离线");
        const remote = await loadRemote();
        if (pending) {
          // Do not replace edits made while the initial request was running.
          notify('本机有新改动，正在同步');
        } else if (remote) {
          applyRemote(remote);
          if (!pending && localStorage.getItem(localKey()) === JSON.stringify(remote)) {
            setSyncState({ current: 'synced', message: '云端有记录，当前数据已同步' });
            notify('当前数据已同步');
          }
        } else if (validPayload(local) && local.homework.length > 0) {
          try {
            await push(local);
            if (!pending && localStorage.getItem(localKey()) === JSON.stringify(local)) {
              setSyncState({ cloudRecord: 'yes', current: 'synced', message: '已创建云端记录，当前数据已同步' });
              notify('当前数据已同步');
            }
          } catch (error) {
            initialUploadFailed = true;
            throw error;
          }
        }
      } catch (error) {
        trace('sync_initialization_failed', errorInfo(error));
        console.warn('[作业岛云端同步] 初始化失败', error);
        notify('云端暂时不可用，当前使用本机缓存');
        setSyncState({ current: pending ? 'pending' : 'unknown', message: pending ? '本机改动待上传' : '云端读取失败，当前使用本机数据' });
        // Retry only an upload that was actually attempted. A failed read
        // must not let an old local copy overwrite an existing family.
        if (initialUploadFailed && validPayload(local) && !pending) schedulePush(local);
      } finally {
        started = true;
        if (pending) scheduleFlush(0);
      drainRevision();
        if (window.KaixinSignal) signal = window.KaixinSignal({
          url: SUPABASE_URL, key: SUPABASE_KEY,
          onRevision(revision) { wantedRevision = Math.max(wantedRevision, revision); drainRevision(); },
          onReady: checkRevision,
          onState(connected) { signalConnected = connected; setSyncState({ notifications: connected ? 'connected' : 'disconnected' }); armPoll(); }
        });
        resume();
        window.addEventListener('online', resume);
        window.addEventListener('offline', resume);
        window.addEventListener('focus', resume);
        document.addEventListener('visibilitychange', resume);
        window.dispatchEvent(new Event('island-ready'));
      }
    })();
    return startPromise;
  }

  async function retryNow() {
    trace('manual_retry');
    if (!started || !client) throw new Error('同步尚未初始化');
    if (busy) { trace('manual_retry_skipped', { reason: 'busy' }); return { ...syncState }; }
    retryAfter = 0; // A deliberate retry is allowed to bypass automatic backoff.
    if (pending) await flush();
    else await pull();
    return { ...syncState };
  }

  function getDiagnostics() {
    return {
      version: 1,
      generatedAt: Date.now(),
      session,
      state: { cloudRecord: syncState.cloudRecord, current: syncState.current, notifications: syncState.notifications || 'unknown' },
      events: history.slice()
    };
  }

  // Existing app catches unexpected exceptions. Record only classifications, not messages/stacks.
  window.addEventListener('error', (event) => trace('page_error', { reason: event?.error?.name || 'unknown' }));
  window.addEventListener('unhandledrejection', () => trace('unhandled_rejection'));

  function openPanel() {
    if (typeof openFamilyCodeDialog === 'function') openFamilyCodeDialog();
    else notify(syncState.message);
  }

  window.IslandSync = { start, schedulePush, pull, push, retryNow, getDiagnostics, recordEvent, getCode: code, getStatus: () => ({ ...syncState }), setCode: () => {}, openPanel };
})();

