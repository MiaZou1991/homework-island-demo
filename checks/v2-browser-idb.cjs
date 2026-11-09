// Browser-level durable V2 outbox test. Local http.server and Chrome only; no Supabase traffic.
const { chromium }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const script=path.resolve(__dirname,'../dist/v2-sync-client.js');
const HOME='http://127.0.0.1:8189/child.html?preview=1&design=original';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
   const page=await browser.newPage({viewport:{width:390,height:844}});
   await page.goto(HOME,{waitUntil:'domcontentloaded'});
   await page.addScriptTag({path:script});
   const id='qa-v2-outbox-browser-'+Date.now();
   const secret='SYNTHETIC_TEST_HOMEWORK_LOCAL_ONLY';
   await page.evaluate(async({id,secret})=>{
     const store=window.IslandV2Sync.browserOutbox();
     await store.put({operationId:id,createdAt:Date.now(),kind:'add_homework',homework:{id:'qa-browser-task',content:secret}});
     const rows=await store.list();
     if(!rows.some(x=>x.operationId===id&&x.homework.content===secret))throw Error('IndexedDB write/read failed');
   },{id,secret});
   await page.reload({waitUntil:'domcontentloaded'});
   await page.addScriptTag({path:script});
   const stored=await page.evaluate(async id=>{
     const store=window.IslandV2Sync.browserOutbox();
     const rows=await store.list();
     const got=rows.find(x=>x.operationId===id);
     if(got)await store.remove(id);
     return {found:!!got,taskId:got?.homework?.id,pendingAfterCleanup:(await store.list()).filter(x=>x.operationId===id).length};
   },id);
   assert.equal(stored.found,true,'pending upload must survive page reload');
   assert.equal(stored.taskId,'qa-browser-task');
   assert.equal(stored.pendingAfterCleanup,0,'acknowledged operation must clear IndexedDB');
   console.log('PASS browser IndexedDB: durable V2 operation survives reload, ack cleanup works; no Supabase network');
 } finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
