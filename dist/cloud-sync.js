/* 作业岛云端同步：家庭码对应一份 Supabase 家庭数据。 */
(() => {
  const SUPABASE_URL = 'https://syqcpfjudjniripzcjdq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_01AzYHAiAZYmahNkiYWeog_Y5y6Emax';
  const CODE_KEY = 'homework_island_family_code_v1';
  let client = null;
  let pushTimer = null;
  let started = false;
  let syncing = false;
  let onRemoteUpdate = null;

  function code() {
    return String(localStorage.getItem(CODE_KEY) || '')
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

  function writeLocal(data) {
    if (!data) return;
    localStorage.setItem(localKey(), JSON.stringify(data));
  }

  function notify(message) {
    if (typeof showToast === 'function') showToast(message);
  }

  async function pull() {
    const familyCode = code();
    if (!client || !familyCode) return null;
    const { data, error } = await client.rpc('family_load', { p_family_code: familyCode });
    if (error) throw error;
    if (!data || data.ok === false || !data.exists) return null;
    if (data.payload && typeof data.payload === 'object') {
      writeLocal(data.payload);
      if (typeof onRemoteUpdate === 'function') onRemoteUpdate(data.payload);
    }
    return data.payload || null;
  }

  async function push(data) {
    const familyCode = code();
    if (!client || !familyCode || !data) return null;
    const { data: result, error } = await client.rpc('family_save', {
      p_family_code: familyCode,
      p_payload: data
    });
    if (error) throw error;
    return result;
  }

  function schedulePush(data) {
    if (!started || syncing || !client || !code()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try { await push(data || readLocal()); }
      catch (error) {
        console.warn('[作业岛云端同步] 保存失败', error);
        notify('云端保存失败，已暂存本机');
      }
    }, 450);
  }

  async function start(options = {}) {
    onRemoteUpdate = options.onRemoteUpdate || null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('[作业岛云端同步] Supabase 客户端未加载');
      return;
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    started = true;
    const local = readLocal();
    try {
      syncing = true;
      const remote = await pull();
      if (!remote && local) {
        await push(local);
        notify('已将本机家庭数据同步到云端');
      } else if (remote) {
        notify('已连接云端家庭数据');
      }
    } catch (error) {
      console.warn('[作业岛云端同步] 初始化失败', error);
      notify('云端暂时不可用，当前使用本机缓存');
    } finally {
      syncing = false;
    }
  }

  function openPanel() {
    if (typeof openFamilyCodeDialog === 'function') openFamilyCodeDialog();
    else notify('请先设置家庭码');
  }

  window.IslandSync = { start, schedulePush, pull, push, getCode: code, setCode: () => {}, openPanel };
})();
