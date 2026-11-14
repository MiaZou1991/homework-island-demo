/* KAIXIN V2 staging: a parent may inspect the child's actual screen with
 * the parent's existing login. This does NOT grant child-device write rights.
 * True child devices still require their own binding and server-side role.
 */
(() => {
  'use strict';
  if(window.__KAIXIN_STAGE_BUILD__!==true)return;
  const isChild=document.body?.dataset.mode==='child';
  const preview=isChild&&new URLSearchParams(location.search).get('parentPreview')==='1';
  if(preview){
    window.__KAIXIN_PARENT_PREVIEW_READONLY__=true;
    // Even if some legacy handler reaches saveData, a parent preview cannot
    // queue writes or edit its own cached snapshot through that handler.
    window.saveData=()=>{if(typeof showToast==='function')showToast('家长预览仅用于查看，请回家长端修改作业');return false;};
    const safeReadActions=new Set([
      'today','plan','island','back','task','plan-range','prev','next',
      'reset-day','class','family-filter','task-detail','calendar',
      'open-packing','packing','view-day','day','month','week',
      'room','mates','mate','reward','achieve','collection'
    ]);
    document.addEventListener('click',event=>{
      const target=event.target.closest('button,a,[role="button"],input,select,textarea');
      if(!target)return;
      if(target.closest('#kaixin-stage-preview-label')||target.closest('#kaixin-island-settings')||target.closest('#kaixin-sync-notice'))return;
      if(target.closest('.up-nav')||target.closest('details > summary'))return;
      if(target.matches('a')) {
        const dest=target.getAttribute('href')||'';
        if(dest.startsWith('parent.html')||dest.startsWith('index.html'))return;
      }
      if(safeReadActions.has(target.getAttribute('data-up')))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(typeof showToast==='function')showToast('家长预览是只读页面，修改请返回家长端');
    },true);
    document.addEventListener('submit',event=>{
      event.preventDefault();event.stopImmediatePropagation();
    },true);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const modeSwitch=document.querySelector('.up-mode-switch');
    if(!isChild){
      if(modeSwitch){
        modeSwitch.href='child.html?parentPreview=1';
        modeSwitch.textContent='查看儿童端 ↗';
        modeSwitch.setAttribute('aria-label','家长查看儿童端，只读，无需绑定设备');
      }
      return;
    }
    if(!preview)return;
    if(modeSwitch){
      modeSwitch.href='parent.html';
      modeSwitch.textContent='返回家长端 ↗';
      modeSwitch.setAttribute('aria-label','返回家长端');
    }
    const indicator=document.createElement('a');
    indicator.id='kaixin-stage-preview-label';
    indicator.href='parent.html';
    indicator.textContent='家长预览 · 只读 · 返回家长端';
    indicator.style.cssText='position:fixed;z-index:900005;top:calc(env(safe-area-inset-top,0px) + 5px);right:8px;max-width:73vw;padding:7px 9px;font:600 11px system-ui;color:#426848;background:#f1ffe8;border:1px solid #9bc38c;border-radius:12px;text-decoration:none;box-shadow:0 2px 8px #0002';
    document.body.append(indicator);
  });
})();