/* Authenticated single-family sync for the production Pages entry points. */
(() => {
  'use strict';
  if (typeof ISLAND_PREVIEW !== 'undefined' && ISLAND_PREVIEW) return;
  const mode = document.body.dataset.mode;
  const originalSave = saveData;
  const originalGet = getData;
  let memorySnapshot, cacheAvailable = true;
  getData = () => memorySnapshot ? JSON.parse(JSON.stringify(memorySnapshot)) : originalGet();
  let client, user, revision, pending, running = false, blocked = false, gate;
  let storageKey = 'kaixin_production_locked';
  let status = { current: 'unknown', message: '正在核对云端记录' };
  activeStorageKey = () => storageKey;

  function report(current, message) {
    status = { current, message, cloudRecord: Number.isSafeInteger(revision) ? 'yes' : 'unknown' };
    window.dispatchEvent(new CustomEvent('island-sync-state', { detail: status }));
  }

  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc('kaixin_production_' + name, args);
    if (error) throw error;
    if (!data?.ok) throw Object.assign(new Error(data?.error || 'server_error'), { code: data?.error });
    return data;
  }

  function remember(next) {
    const key = storageKey + ':pending';
    if (next) localStorage.setItem(key, JSON.stringify(next));
    else localStorage.removeItem(key);
    pending = next;
  }

  function readPending() {
    return JSON.parse(localStorage.getItem(storageKey + ':pending') || 'null');
  }

  async function readCloud() {
    const remote = await rpc('load');
    if (remote.role !== mode || !Number.isSafeInteger(remote.revision) || !Array.isArray(remote.payload?.homework))
      throw new Error('role_or_data_invalid');
    return remote;
  }

  function apply(remote) {
    const serialized = JSON.stringify(remote.payload);
    let changed = true;
    try {
      changed = localStorage.getItem(storageKey) !== serialized || Boolean(memorySnapshot);
      if (changed) localStorage.setItem(storageKey, serialized);
      memorySnapshot = undefined;
      cacheAvailable = true;
    } catch (_) {
      memorySnapshot = remote.payload;
      cacheAvailable = false;
    }
    revision = remote.revision;
    if (changed) refreshCurrentView();
  }

  async function sync() {
    if (!user || running || blocked || document.hidden || navigator.onLine === false) return;
    running = true;
    try {
      const operation = pending;
      if (operation) {
        const args = { p_expected_revision: operation.base };
        const result = operation.task
          ? await rpc('set_homework_done', { ...args, p_homework_id: operation.task.id,
              p_done: operation.task.done, p_expected_done: operation.task.expected })
          : await rpc('save', { ...args, p_payload: operation.payload });
        if (!Number.isSafeInteger(result.revision)) throw new Error('invalid_revision');
        revision = result.revision;
        if (pending === operation) remember(null);
        else remember({ ...pending, base: revision });
      }
      const remote = await readCloud();
      if (!pending) {
        apply(remote);
        report('synced', cacheAvailable ? '手机和电脑共用这份云端记录' : '已读取云端记录，本机存储不可用');
      }
    } catch (error) {
      if (['conflict', 'review_required', 'not_found_or_duplicate'].includes(error.code)) {
        blocked = true;
        report('pending', '云端记录已变化，本机修改已保留。请在同步状态中处理');
        showToast(status.message);
      } else if (['unauthorized', 'unavailable_or_unauthorized'].includes(error.code) || error.message === 'role_or_data_invalid') {
        location.reload();
      } else {
        report(pending ? 'pending' : 'unknown', pending ? '本机修改待上传，联网后重试' : '暂时无法核对云端记录');
      }
    } finally {
      running = false;
    }
  }

  function openPanel() {
    if (!pending || !blocked) {
      if (mode === 'parent' && user) {
        if (confirm('为孩子的新设备生成一次性授权码？授权码十分钟内有效。')) {
          rpc('create_device_invite').then(({ token }) => {
            prompt('请把这串授权码粘贴到孩子设备的开心岛页面', token);
          }).catch(() => showToast('暂时无法生成授权码，请稍后重试'));
        }
      } else showToast(status.message);
      return;
    }
    const backup = new Blob([JSON.stringify(pending, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(backup);
    const link = Object.assign(document.createElement('a'), { href: url, download: '开心岛待同步修改.json' });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (confirm('已请求下载本机修改。确认保存后，是否重新读取云端记录？')) {
      remember(null);
      blocked = false;
      sync();
    }
  }

  saveData = data => {
    if (!user || mode !== 'parent' || !Number.isSafeInteger(revision)) return false;
    if (!cacheAvailable) { showToast('本机存储不可用，当前只能查看云端记录'); return false; }
    try {
      remember({ base: pending?.base ?? revision, payload: JSON.parse(JSON.stringify(data)) });
      originalSave(data);
      report('pending', blocked ? '本机修改已保留，请处理同步冲突' : '本机已保存，等待同步');
      sync();
      return true;
    } catch (_) {
      showToast('设备存储空间不足，请保留当前页面并导出记录');
      return false;
    }
  };

  function toggle(id, done) {
    if (mode !== 'child' || !user || !Number.isSafeInteger(revision)) return;
    if (pending) { showToast(status.message); return; }
    const task = getData().homework.find(entry => entry.id === id);
    if (!task || Boolean(task.done) === done) return;
    if (task.requireReview) { showToast('这项作业需要家长确认'); return; }
    try {
      remember({ base: revision, task: { id, done, expected: Boolean(task.done) } });
      report('pending', '已记下本次操作，等待云端确认');
      sync();
    } catch (_) { showToast('设备空间不足，本次操作未保存'); }
  }

  async function enter() {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data?.user) throw new Error('login_required');
    const remote = await readCloud();
    storageKey = 'kaixin_production:' + data.user.id;
    try { pending = readPending(); }
    catch (error) {
      if (error instanceof SyntaxError) throw new Error('pending_cache_invalid');
      cacheAvailable = false;
    }
    if (!pending) apply(remote);
    else {
      if (pending.payload) localStorage.setItem(storageKey, JSON.stringify(pending.payload));
      else apply(remote);
      revision = remote.revision;
      refreshCurrentView();
      report('pending', '正在核对本机待同步修改');
    }
    user = data.user;
    gate.close();
    gate.remove();
    window.dispatchEvent(new Event('island-ready'));
    sync();
    setInterval(sync, 30000);
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
  }

  function explainEntry(error) {
    const code = error?.code || error?.message;
    if (code === 'invalid_credentials') return '邮箱或密码不正确，可点「忘记密码」重新设置。';
    if (code === 'email_not_confirmed') return '邮箱尚未验证，请先完成邮箱验证。';
    if (code === 'login_required' || error?.name === 'AuthSessionMissingError')
      return mode === 'parent' ? '请用家长邮箱和密码登录。' : '请家长为这台设备完成一次授权。';
    if (['invalid_invite', 'already_bound'].includes(code)) return '授权码无效或已使用，请家长重新生成。';
    if (['unauthorized', 'unavailable_or_unauthorized'].includes(code))
      return mode === 'parent' ? '这个账号未绑定家长权限，请核对登录邮箱。' : '这台设备尚未获得家长授权。';
    if (code === 'pending_cache_invalid') return '本机待同步记录无法读取。原记录已保留，请联系协助处理。';
    if (code === 'role_or_data_invalid') return '身份已验证，但此入口或云端数据格式不匹配。';
    return '暂时无法读取家庭记录，请点「重新连接」重试。';
  }

  async function start() {
    if (gate) return;
    if (mode === 'child') {
      completeHomework = id => toggle(id, true);
      undoHomework = id => toggle(id, false);
    }
    gate = document.createElement('dialog');
    gate.style.cssText = 'max-width:360px;width:90%;padding:24px;border:0;border-radius:20px;background:#fffaf0;color:#50442c';
    gate.innerHTML = '<form><h2>开心岛</h2><p role="status">正在验证设备…</p>'
      + (mode === 'child' ? '<label>家长授权码 <input name="token" autocomplete="off" autocapitalize="off" required></label><br><br>'
      : '<label>授权邮箱 <input type="email" name="email" autocomplete="username" required></label><br><br>'
      + '<label>密码 <input type="password" name="password" autocomplete="current-password" required></label><br><a href="./parent-password.html">忘记密码</a><br><br>')
      + '<button type="submit">进入开心岛</button> <button type="button">重新连接</button></form>';
    gate.addEventListener('cancel', event => event.preventDefault());
    document.body.append(gate);
    gate.showModal();
    const form = gate.querySelector('form');
    const message = form.querySelector('[role="status"]');
    form.querySelector('button[type="button"]').onclick = () => location.reload();
    if (!window.supabase?.createClient) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.append(script);
        });
      } catch (_) { /* The reconnect action remains available. */ }
    }
    if (!window.supabase?.createClient) { message.textContent = '登录服务加载失败，请重新连接'; return; }
    client = window.supabase.createClient('https://syqcpfjudjniripzcjdq.supabase.co', 'sb_publishable_01AzYHAiAZYmahNkiYWeog_Y5y6Emax', {
      auth: { storageKey: 'kaixin-production-session-' + mode, persistSession: true, detectSessionInUrl: false }
    });
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        if (mode === 'child') {
          const token = form.elements.token.value.trim().toLowerCase();
          if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('invalid_invite');
          const { data: session } = await client.auth.getSession();
          if (!session?.session) {
            const { error } = await client.auth.signInAnonymously();
            if (error) throw error;
          }
          await rpc('redeem_device_invite', { p_token: token });
          form.elements.token.value = '';
        } else {
          const { error } = await client.auth.signInWithPassword({
            email: form.elements.email.value.trim(), password: form.elements.password.value
          });
          form.elements.password.value = '';
          if (error) throw error;
        }
        await enter();
      } catch (error) { message.textContent = explainEntry(error); }
      finally { button.disabled = false; }
    };
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try { await enter(); }
    catch (error) { message.textContent = explainEntry(error); }
    finally { submit.disabled = false; }
  }

  window.IslandSync = {
    start, pull: sync, schedulePush() {}, getStatus: () => ({ ...status }), getCode: () => '', openPanel
  };
})();
