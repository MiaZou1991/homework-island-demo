const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
 for(const [width,height] of [[320,730],[375,812],[390,844],[430,932]]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8189/child.html?preview=1&design=original');
   await page.locator('.tf-today').waitFor({timeout:20000});
   await page.locator('#island-loader').waitFor({state:'detached',timeout:20000});
   const result=await page.evaluate(async()=>{
      const image=new Image();image.src='assets/hd/today-island-continuous-v2.svg';
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('scene asset failed'));});
      const phone=document.querySelector('.phone');
      const tasks=document.querySelectorAll('.tf-task');
      const bodyAfter=getComputedStyle(document.body,'::after');
      const bg=getComputedStyle(phone).backgroundImage;
      const nav=document.querySelector('.up-nav');
      return {naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,
        taskCount:tasks.length,tabCount:nav.querySelectorAll('.up-nav-item').length,
        bg,bgSize:getComputedStyle(phone).backgroundSize,
        edgeBackground:bodyAfter.backgroundColor,
        overflows:document.documentElement.scrollWidth>innerWidth,
        logoPresent:!!document.querySelector('.tf-brand .tf-wordmark'),
        pointsPresent:!!document.querySelector('.tf-points')};
   });
   assert.deepEqual(errors,[],'No browser page errors');
   assert.equal(result.naturalWidth,900,'Image width');
   assert.equal(result.naturalHeight,1590,'Natural-height asset: the scene is not stretched');
   assert.ok(result.taskCount<=2,'Only two homework previews');
   assert.equal(result.tabCount,3);
   assert.match(result.bg,/today-island-continuous-v2\.svg/);
   assert.match(result.bgSize,/cover/);
   assert.equal(result.edgeBackground,'rgb(250, 230, 179)');
   assert.equal(result.overflows,false,'No horizontal overflow');
   assert.ok(result.logoPresent && result.pointsPresent,'Logo and points remain intact');
   await page.screenshot({path:'/tmp/iphone-sky-preview-'+width+'.png',fullPage:true});
   console.log('SKY-QA PASS',width,height,result.bgSize);
   await page.close();
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
