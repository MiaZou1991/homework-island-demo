/* 作业岛云端同步：家庭码对应一份 Supabase 家庭数据。 */
(() => {
  if(typeof ISLAND_PREVIEW!=='undefined'&&ISLAND_PREVIEW)return;
  const SUPABASE_URL = 'https://syqcpfjudjniripzcjdq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_01AzYHAiAZYmahNkiYWeog_Y5y6Emax';
  const CODE_KEY = 'homework_island_family_code_v1';
  const PENDING_KEY = 'homework_island_sync_pending_v1:';
  const POLL_MS = 5000;
  const RETRY_MS = 5000;
  let client = null;
  let started = false;
  let startPromise = null;
  let onRemoteUpdate = null;
  let pending = null;
  let pushTimer = null;
  let pollTimer = null;
  let busy = false;
  let syncState = { cloudRecord: 'unknown', current: 'unknown', message: '正在核对云端数据' };

  function setSyncState(change) {
    syncState = { ...syncState, ...change };
    window.dispatchEvent(new CustomEvent('island-sync-state', { detail: { ...syncState } }));
  }

  function code() {
    return String(localStorage.getItem(CODE_KEY) || 'KAIXIN')
      .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
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
      const data = JSON.parse(localStorage.getItem(pendingKey()) || 'null');
      return validPayload(data) ? data : null;
    } catch (_) { return null; }
  }

  function notify(message) {
    if (typeof showToast === 'function') showToast(message);
  }

  function validPayload(data) {
    return data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.homework);
  }

  async function loadRemote() {
    const { data, error } = await client.rpc('family_load', { p_family_code: code() });
    if (error) throw error;
    if (data && data.ok === false) throw new Error(data.error || '家庭数据读取失败');
    if (!data || !data.exists) {
      setSyncState({ cloudRecord: 'no', message: '云端暂无家庭记录' });
      return null;
    }
    if (!validPayload(data.payload)) throw new Error('云端家庭数据格式不正确');
    setSyncState({ cloudRecord: 'yes', message: '云端有有效记录，正在核对当前数据' });
    return data.payload;
  }

  function applyRemote(data) {
    if (pending || !validPayload(data)) return false;
    const serialized = JSON.stringify(data);
    if (localStorage.getItem(localKey()) === serialized) return false;
    localStorage.setItem(localKey(), serialized);
    if (typeof onRemoteUpdate === 'function') onRemoteUpdate(data);
    return true;
  }

  async function pull() {
    if (!client || !code()) return null;
    if (busy || pending) return null;
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
      return remote;
    } catch (error) {
      setSyncState({ current: pending ? 'pending' : 'unknown', message: '云端读取失败，当前数据未确认' });
      throw error;
    } finally {
      busy = false;
      if (pending) scheduleFlush(0);
    }
  }

  async function push(data) {
    if (!client || !code() || !validPayload(data)) return null;
    const { data: result, error } = await client.rpc('family_save', {
      p_family_code: code(), p_payload: data
    });
    if (error) throw error;
    if (result && result.ok === false) throw new Error(result.error || '家庭数据保存失败');
    return result;
  }

  function scheduleFlush(delay = 450) {
    if (!started || !client || !pending) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flush, delay);
  }

  async function flush() {
    if (busy || !pending || !client) return;
    busy = true;
    const snapshot = pending;
    try {
      await push(snapshot);
      if (pending === snapshot) {
        pending = null;
        localStorage.removeItem(pendingKey());
        if (localStorage.getItem(localKey()) === JSON.stringify(snapshot))
          setSyncState({ cloudRecord: 'yes', current: 'synced', message: '云端有记录，当前数据已同步' });
      }
    } catch (error) {
      console.warn('[作业岛云端同步] 保存失败', error);
      notify('云端保存失败，已暂存本机；稍后自动重试');
      setSyncState({ current: 'pending', message: '当前数据待上传，稍后自动重试' });
      scheduleFlush(RETRY_MS);
    } finally {
      busy = false;
      if (pending && pending !== snapshot) scheduleFlush(0);
    }
  }

  function schedulePush(data) {
    if (!validPayload(data)) return;
    // Startup may generate recurring tasks before the cloud snapshot is read.
    // Those provisional writes must not replace an existing family.
    if (!started && !startPromise) return;
    // Keep the newest full snapshot until the server confirms the save.
    pending = data;
    localStorage.setItem(pendingKey(), JSON.stringify(data));
    setSyncState({ current: 'pending', message: '当前数据待上传' });
    scheduleFlush();
  }

  async function poll() {
    if (!started || !client || busy) return;
    if (pending) { scheduleFlush(0); return; }
    try { await pull(); }
    catch (error) { console.warn('[作业岛云端同步] 读取失败', error); }
  }

  async function start(options = {}) {
    onRemoteUpdate = options.onRemoteUpdate || null;
    if (startPromise) return startPromise;
    startPromise = (async () => {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.warn('[作业岛云端同步] Supabase 客户端未加载');
        notify('云端暂时不可用，当前使用本机缓存');
        setSyncState({ current: 'unknown', message: '云端未加载，当前使用本机数据' });
        window.dispatchEvent(new Event('island-ready'));
        return;
      }
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const local = readLocal();
      const savedPending = readPending();
      if (savedPending) {
        // Startup may have generated today's tasks in the local copy.
        pending = validPayload(local) ? local : savedPending;
        localStorage.setItem(pendingKey(), JSON.stringify(pending));
        setSyncState({ current: 'pending', message: '本机有待上传的改动' });
      }
      let initialUploadFailed = false;
      try {
        const remote = pending ? null : await loadRemote();
        if (pending) {
          // Do not replace edits made while the initial request was running.
          notify('本机有新改动，正在同步');
        } else if (remote) {
          applyRemote(remote);
          if (!pending && localStorage.getItem(localKey()) === JSON.stringify(remote)) {
            setSyncState({ current: 'synced', message: '云端有记录，当前数据已同步' });
            notify('当前数据已同步');
          }
        } else if (validPayload(local)) {
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
        console.warn('[作业岛云端同步] 初始化失败', error);
        notify('云端暂时不可用，当前使用本机缓存');
        setSyncState({ current: pending ? 'pending' : 'unknown', message: pending ? '本机改动待上传' : '云端读取失败，当前使用本机数据' });
        // Retry only an upload that was actually attempted. A failed read
        // must not let an old local copy overwrite an existing family.
        if (initialUploadFailed && validPayload(local) && !pending) schedulePush(local);
      } finally {
        started = true;
        if (pending) scheduleFlush(0);
        pollTimer = setInterval(poll, POLL_MS);
        window.addEventListener('online', poll);
        window.addEventListener('focus', poll);
        window.dispatchEvent(new Event('island-ready'));
      }
    })();
    return startPromise;
  }

  function openPanel() {
    if (typeof openFamilyCodeDialog === 'function') openFamilyCodeDialog();
    else notify('请先设置家庭码');
  }

  window.IslandSync = { start, schedulePush, pull, push, getCode: code, getStatus: () => ({ ...syncState }), setCode: () => {}, openPanel };
})();

