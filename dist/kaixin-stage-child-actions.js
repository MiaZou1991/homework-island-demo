/* KAIXIN isolated staging only: child completion has no reward side effects.
 * This deliberately overrides the old DemoCore.finish()/undo() path on the
 * CHILD page alone. The operation is local/pending until the server readback.
 */
(() => {
 'use strict';
 if(window.__KAIXIN_STAGE_BUILD__!==true||document.body?.dataset.mode!=='child')return;
 function toggle(id,done){
   if(window.__KAIXIN_PARENT_PREVIEW_READONLY__){
     if(typeof showToast==='function')showToast('家长预览是只读页面，请回家长端操作');
     return;
   }
   const payload=getData();
   const task=payload.homework?.find(h=>h.id===id);
   if(!task||Boolean(task.done)===done)return;
   if(task.requireReview){
     showToast('这条作业需要家长确认；当前测试版暂不能提交，请家长处理。');
     return;
   }
   // No points, demoGrowth, streak, materials or historical receipts mutation.
   task.done=done;
   task.completedAt=done?new Date().toISOString():null;
   saveData(payload);
   if(typeof refreshAfterChange==='function')refreshAfterChange();
   showToast(done?'已在本机记下完成，等待云端确认':'已在本机撤销完成，等待云端确认');
 }
 completeHomework=id=>toggle(id,true);
 undoHomework=id=>toggle(id,false);
})();
