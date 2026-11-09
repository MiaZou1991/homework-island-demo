const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  for(const width of [320,375,390,430]){
   const measurements=[];
   for(const mode of [
     {id:'expanded',height:740,safe:0},
     {id:'collapsed',height:844,safe:59}
   ]){
    const page=await browser.newPage({viewport:{width,height:mode.height},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8189/child.html?preview=1&design=original');
    await page.locator('.tf-today').waitFor({timeout:25000});
    await page.locator('#island-loader').waitFor({state:'detached',timeout:25000});
    const sample=await page.evaluate(async(safe)=>{
      document.body.style.setProperty('--island-safe-top',safe+'px');
      const testBar=document.createElement('div');
      testBar.id='ios-safari-status-qa';
      testBar.style.cssText='position:fixed;left:0;right:0;top:0;height:58px;z-index:12000;pointer-events:none;display:flex;align-items:flex-start;justify-content:space-between;padding:17px 20px;color:#111;font:700 14px system-ui;background:transparent;';
      testBar.innerHTML='<span>11:35</span><span>▮▮▮ 5G ▰</span>';
      document.body.appendChild(testBar);
      const im=new Image();im.src='assets/hd/today-island-reference-v1.webp';
      await new Promise((ok,bad)=>{im.onload=ok;im.onerror=bad;});
      const get=(s)=>document.querySelector(s).getBoundingClientRect();
      const phone=document.querySelector('.phone');
      const nav=document.querySelector('.up-nav');
      const bg=getComputedStyle(phone);
      const htmlBg=getComputedStyle(document.documentElement);
      const after=getComputedStyle(document.body,'::after');
      return {
        imageLoaded:[im.naturalWidth,im.naturalHeight],
        logoTop:get('.tf-brand').top,
        scoreTop:get('.tf-points').top,
        homeworkTop:get('.tf-homework-wrap').top,
        navBottom:get('.up-nav').bottom,
        navTop:get('.up-nav').top,
        phoneBottom:get('.phone').bottom,
        topBackground:htmlBg.backgroundImage,
        bgSize:bg.backgroundSize,
        bgPosition:bg.backgroundPosition,
        phoneColor:bg.backgroundColor,
        afterContent:after.content,
        tasks:document.querySelectorAll('.tf-task').length,
        tabs:nav.querySelectorAll('.up-nav-item').length,
        overflow:document.documentElement.scrollWidth>innerWidth
      };
    },mode.safe);
    assert.deepEqual(errors,[]);
    assert.deepEqual(sample.imageLoaded,[900,1748]);
    assert.ok(sample.logoTop>=62,'Logo must clear status text even if env top inset is 0');
    assert.ok(sample.scoreTop>=62,'Points must clear status text');
    assert.ok(sample.homeworkTop>sample.logoTop+75,'Homework cannot cover logo');
    assert.match(sample.bgSize,/^100% auto$/,'Never scale art with viewport height');
    assert.equal(sample.bgPosition,'50% 0%');
    assert.match(sample.topBackground,/linear-gradient/,'A gradient remains behind webpage, not over art');
    assert.equal(sample.phoneColor,'rgb(250, 229, 179)');
    assert.match(sample.bgSize,/^100% auto$/);
    assert.equal(sample.afterContent,'none','No fixed 8px bottom strip');
    assert.equal(sample.tabs,3);
    assert.ok(sample.tasks<=2);
    assert.equal(sample.overflow,false);
    measurements.push(sample);
    await page.screenshot({path:'/tmp/iphone-safari-v6-'+width+'-'+mode.id+'.png',fullPage:true});
    await page.close();
   }
   assert.ok(Math.abs(measurements[0].homeworkTop-measurements[1].homeworkTop)<=2,'Homework must not shift when toolbar collapses');
   assert.ok(Math.abs(measurements[0].logoTop-measurements[1].logoTop)<=8,'Logo positioning should be stable across safe-area modes');
   console.log('PASS expanded/collapsed',width,measurements.map(x=>({logo:x.logoTop,homework:x.homeworkTop,nav:x.navTop})));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
