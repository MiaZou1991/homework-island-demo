/* Checks every required asset before enabling the PNG visual layer.
   Graceful fallback to the existing island-growth-dialog design when missing. */
(function(){
'use strict';
const base='assets/hd/growth-calendar/popup-png/';
const assets=['popup_bg.png','popup_title_bar.png','card_mood_bg.png','card_task_bg.png','card_habit_bg.png'];
Promise.all(assets.map(name=>new Promise(resolve=>{
 const img=new Image();img.onload=()=>resolve(img.naturalWidth>0);img.onerror=()=>resolve(false);
 img.src=base+name+'?v=growth-popup-v1';
}))).then(result=>{
 if(result.every(Boolean)){document.documentElement.classList.add('gc-png-ready');}
 else console.warn('[GrowthCalendar] PNG assets unavailable, using original CSS fallback.');
});
})();