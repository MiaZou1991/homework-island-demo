/* KAIXIN V2 staging: contextual manual sync (parent More / child Island Settings).
 * The transport remains IslandSync.manualSync. No recurring polling or writes
 * are introduced here. Normal state has no persistent overlay.
 */
(() => {
  'use strict';
  if (window.__KAIXIN_STAGE_BUILD__ !== true) return;
  const isChild = document.body?.dataset.mode === 'child';
  let state = {current:'unknown',message:''}, lastChecked = null;
  let manualBusy = false, noticeTimer = null, islandObserver = null;
  const formatTime = when => when
    ? new Date(when).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})
    : '尚未完成云端核对';

  function css() {
    const sheet=document.createElement('style');
    sheet.id='kaixin-context-sync-css';
    sheet.textContent=`
      #kaixin-parent-more{flex:none;position:relative}
      #kaixin-parent-more-trigger{width:33px;height:33px;display:grid;place-items:center;cursor:pointer;
        border:1px solid #e4d8bd;background:#fff8eb;color:#6e6a50;border-radius:50%;
        font:700 22px/1 system-ui;touch-action:manipulation}
      #kaixin-parent-more-panel{position:absolute;top:calc(100% + 10px);right:0;z-index:110;
        width:min(275px,calc(100vw - 34px));padding:14px;box-sizing:border-box;
        border:1px solid #e4d5bb;border-radius:18px;background:#fffaf0;
        box-shadow:0 10px 30px #66573e30;color:#5d523f;font:13px/1.5 system-ui}
      #kaixin-parent-more-panel[hidden]{display:none!important}
      #kaixin-parent-more-panel h2{font-size:14px;margin:0 0 10px;color:#51452f}
      .kaixin-sync-menu-state{display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:10px}
      .kaixin-sync-menu-state::before{content:"";width:7px;height:7px;border-radius:50%;background:#85b783;flex:none}
      .kaixin-sync-last-time{display:block;font-size:11px;color:#8d806c;margin:2px 0 11px}
      .kaixin-sync-action{width:100%;min-height:40px;border:1px solid #98bd80;border-radius:12px;
        background:#eaf6de;color:#42663c;font:600 13px system-ui;cursor:pointer;padding:9px 12px}
      .kaixin-sync-action:disabled{opacity:.6;cursor:wait}
      #kaixin-island-settings{margin:2px 4px 8px;text-align:right;color:#655642;
        font:13px/1.5 system-ui;position:relative;z-index:2}
      #kaixin-island-settings summary{display:inline-flex;align-items:center;list-style:none;
        padding:6px 12px;border:1px solid #d9dfbd;border-radius:20px;
        background:#fff9e9;cursor:pointer;font:600 12px system-ui}
      #kaixin-island-settings summary::-webkit-details-marker{display:none}
      #kaixin-island-settings .kaixin-island-settings-panel{margin-top:7px;text-align:left;
        padding:13px;background:#fffaf0;border:1px solid #d9dfbd;border-radius:16px}
      #kaixin-island-settings .kaixin-island-settings-panel h2{font:700 14px system-ui;margin:0 0 7px}
      #kaixin-sync-notice{position:fixed;z-index:950000;
        top:calc(env(safe-area-inset-top,0px) + 68px);left:50%;transform:translateX(-50%);
        width:max-content;max-width:calc(100vw - 30px);box-sizing:border-box;
        border:1px solid #d8cb9a;border-radius:12px;background:#fff9e6;
        box-shadow:0 6px 16px #65563f24;color:#75573e;
        padding:9px 12px;display:flex;gap:10px;align-items:center;
        font:12px/1.5 system-ui}
      #kaixin-sync-notice[hidden]{display:none!important}
      #kaixin-sync-retry{border:0;border-radius:9px;background:#77aa73;
        color:white;padding:6px 10px;font:600 12px system-ui;cursor:pointer}
      #kaixin-sync-retry[hidden]{display:none!important}
    `;
    document.head.appendChild(sheet);
  }
  function action(id) {
    const button=document.createElement('button');
    button.type='button';button.className='kaixin-sync-action';button.id=id;
    button.textContent='立即同步';
    button.addEventListener('click',()=>manualSync());
    return button;
  }
  function statusDisplay() {
    if(manualBusy)return '正在同步…';
    if(state.current==='synced')return '云端数据已同步';
    if(state.current==='conflict')return '有作业修改待确认';
    if(state.current==='pending')return '有操作正在同步或待处理';
    return '尚未连接云端';
  }
  function refreshLabels() {
    for(const el of document.querySelectorAll('.kaixin-sync-menu-state'))el.textContent=statusDisplay();
    for(const el of document.querySelectorAll('.kaixin-sync-last-time'))el.textContent=
      lastChecked?'最近核对：'+formatTime(lastChecked):'尚未完成云端核对';
    for(const el of document.querySelectorAll('.kaixin-sync-action')){
      el.disabled=manualBusy;
      el.textContent=manualBusy?'正在同步…':'立即同步';
    }
  }
  function ensureParentMenu() {
    if(isChild)return;
    const chrome=document.querySelector('.up-chrome');
    if(!chrome||document.getElementById('kaixin-parent-more'))return;
    const wrap=document.createElement('div');wrap.id='kaixin-parent-more';
    const trigger=document.createElement('button');trigger.id='kaixin-parent-more-trigger';
    trigger.type='button';trigger.textContent='···';
    trigger.setAttribute('aria-label','更多设置');trigger.setAttribute('aria-haspopup','true');
    trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','kaixin-parent-more-panel');
    const panel=document.createElement('section');panel.id='kaixin-parent-more-panel';
    panel.setAttribute('aria-label','更多设置');panel.hidden=true;
    const title=document.createElement('h2');title.textContent='更多设置';
    const stateRow=document.createElement('div');stateRow.className='kaixin-sync-menu-state';
    const last=document.createElement('span');last.className='kaixin-sync-last-time';
    panel.append(title,stateRow,last,action('kaixin-parent-manual-sync'));
    wrap.append(trigger,panel);chrome.append(wrap);
    const close=()=>{panel.hidden=true;trigger.setAttribute('aria-expanded','false');};
    trigger.addEventListener('click',()=>{
      panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));
      refreshLabels();
    });
    document.addEventListener('click',event=>{
      if(!panel.hidden&&!wrap.contains(event.target))close();
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!panel.hidden){close();trigger.focus();}
    });
    refreshLabels();
  }
  function ensureIslandSettings() {
    if(!isChild)return;
    const root=document.getElementById('upgrade-root');
    if(!root||root.dataset.route!=='island'||document.getElementById('kaixin-island-settings'))return;
    const details=document.createElement('details');details.id='kaixin-island-settings';
    const summary=document.createElement('summary');summary.textContent='⚙ 小岛设置';
    const panel=document.createElement('section');panel.className='kaixin-island-settings-panel';
    const title=document.createElement('h2');title.textContent='小岛设置';
    const stateRow=document.createElement('div');stateRow.className='kaixin-sync-menu-state';
    const last=document.createElement('span');last.className='kaixin-sync-last-time';
    panel.append(title,stateRow,last,action('kaixin-child-manual-sync'));
    details.append(summary,panel);
    root.prepend(details);
    refreshLabels();
  }
  function showNotice(message,canRetry=false,brief=false) {
    const el=document.getElementById('kaixin-sync-notice');
    if(!el)return;
    if(noticeTimer){clearTimeout(noticeTimer);noticeTimer=null;}
    if(!message){el.hidden=true;return;}
    el.querySelector('#kaixin-sync-notice-text').textContent=message;
    const retry=el.querySelector('#kaixin-sync-retry');retry.hidden=!canRetry;
    el.hidden=false;
    if(brief)noticeTimer=setTimeout(()=>{el.hidden=true;},2200);
  }
  function ensureNotice() {
    if(document.getElementById('kaixin-sync-notice'))return;
    const el=document.createElement('div');el.id='kaixin-sync-notice';
    el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.hidden=true;
    const text=document.createElement('span');text.id='kaixin-sync-notice-text';
    const retry=document.createElement('button');retry.id='kaixin-sync-retry';
    retry.type='button';retry.textContent='重试';retry.hidden=true;
    retry.addEventListener('click',()=>manualSync());
    el.append(text,retry);document.body.append(el);
  }
  function onState(next) {
    state=next;
    if(state.current==='synced'){
      lastChecked=Date.now();
      if(!manualBusy)showNotice(null);
    } else if(state.current==='pending' && !manualBusy){
      const failing=/失败|不可用|无法|网络|未确认|被拒绝|备份|异常|已失效|多次|禁止/.test(state.message||'');
      showNotice(failing?'同步待处理 · 点击重试':'正在同步…',failing,!failing);
    } else if(state.current==='conflict'||state.current==='unauthorized'){
      showNotice(null); // the existing conflict/Auth dialog is the only prompt
    }
    refreshLabels();
  }
  async function manualSync() {
    if(manualBusy||!window.IslandSync?.manualSync)return;
    manualBusy=true;refreshLabels();
    showNotice('正在核对云端数据…',false);
    try{
      const result=await window.IslandSync.manualSync();
      if(result?.ok)showNotice('已同步最新数据',false,true);
      else if(result?.pending){
        showNotice(navigator.onLine===false?'当前离线，网络恢复后会自动同步':'有操作待同步，可稍后重试',true);
      } else showNotice('同步未完成 · 点击重试',true);
    }catch(_){showNotice('网络连接异常 · 点击重试',true);}
    finally{manualBusy=false;refreshLabels();}
  }
  function boot(){
    css();ensureNotice();ensureParentMenu();ensureIslandSettings();
    if(isChild){
      const root=document.getElementById('upgrade-root');
      if(root){
        islandObserver=new MutationObserver(()=>ensureIslandSettings());
        islandObserver.observe(root,{childList:true});
      }
    }
    window.addEventListener('island-sync-state',event=>onState(event.detail));
    if(window.IslandSync?.getStatus)onState(window.IslandSync.getStatus());
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
