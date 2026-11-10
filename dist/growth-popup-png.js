/* Growth Calendar PNG asset loader / diagnostics.
   Only enable the image-backed popup after ALL required backgrounds load.
   Add ?pngDebug=1 on a preview URL to see actual asset state on screen. */
(function(){
'use strict';
const base='assets/hd/growth-calendar/popup-png/';
const assets=['popup_bg.png','popup_title_bar.png','card_mood_bg.png','card_task_bg.png','card_habit_bg.png'];
const query=new URLSearchParams(location.search);
const debug=query.has('pngDebug');
const state={ready:false,files:{},testedAt:null};
window.GrowthPopupPng=state;
const statusLabel=()=>{
 const missing=assets.filter(name=>!state.files[name]);
 return state.ready?'PNG 已启用 · 5/5':'PNG 未启用 · 缺少 '+(missing.join('、')||'加载中');
};
const renderDebug=()=>{
 if(!debug)return;
 let box=document.getElementById('gc-png-debug');
 if(!box){
  box=document.createElement('output');box.id='gc-png-debug';
  box.setAttribute('role','status');
  box.style.cssText='position:fixed;z-index:99999;bottom:calc(82px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);max-width:92vw;padding:7px 12px;background:#fff7d9ee;color:#764b2b;border:2px solid #eed2a4;border-radius:15px;box-shadow:0 3px 8px #79502d40;font:700 12px/1.4 sans-serif;text-align:center;pointer-events:none;';
  (document.body||document.documentElement).appendChild(box);
 }
 box.textContent=statusLabel();
};
Promise.all(assets.map(name=>new Promise(resolve=>{
 const img=new Image();
 img.onload=()=>{state.files[name]=img.naturalWidth>0&&img.naturalHeight>0;resolve(state.files[name]);};
 img.onerror=()=>{state.files[name]=false;resolve(false);};
 img.src=base+name+'?v=growth-popup-v2';
}))).then(result=>{
 state.ready=result.every(Boolean);
 state.testedAt=new Date().toISOString();
 document.documentElement.classList.toggle('gc-png-ready',state.ready);
 document.documentElement.dataset.growthPng=state.ready?'ready':'fallback';
 if(!state.ready)console.warn('[GrowthCalendar] Missing PNG assets, original design retained.',state.files);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderDebug,{once:true});
 else renderDebug();
}).catch(error=>{
 state.ready=false;document.documentElement.dataset.growthPng='error';
 console.warn('[GrowthCalendar] PNG loader failed:',error);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderDebug,{once:true});
 else renderDebug();
});
})();