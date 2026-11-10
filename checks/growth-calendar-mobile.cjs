const assert=require('node:assert/strict');
const FamilySchedule=require('../dist/family-schedule.js');
assert.equal(FamilySchedule.parse('下午三点开心游泳，爸爸送',{date:'2026-11-09',member:'all'}).start,'15:00');
assert.deepEqual(FamilySchedule.packingItems([{kind:'class',cls:{bring:['水杯','水杯','泳帽']}}]),['水杯','泳帽']);
assert.equal(FamilySchedule.visible({kind:'class'},'dad'),false);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  for(const width of [320,375,390,430]){
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto('http://127.0.0.1:8189/child.html?preview=1&view=calendar&calendarView=month');
   await page.locator('.gc-month-grid').waitFor({timeout:20000});
   await page.locator('#island-loader').waitFor({state:'detached',timeout:20000});
   assert.equal(await page.locator('.up-nav [data-up]').count(),3,'retain original three tabs');
   assert.match(await page.locator('.gc-top-row h1').innerText(),/成长日历/);
   assert.equal(await page.locator('.cp-page.gc-page').count(),0,'P0 layout must not inherit old cp-page CSS');
   assert.equal(await page.locator('.gc-range-ico img').count(),1,'real calendar icon replaces placeholder square');
   assert.equal(await page.locator('.gc-range-ico').innerText(),'','date nav has no old square symbol');
   const font = await page.locator('.gc-top-row h1').evaluate(el=>({family:getComputedStyle(el).fontFamily,weight:Number(getComputedStyle(el).fontWeight),size:parseFloat(getComputedStyle(el).fontSize)}));
   assert.match(font.family,/IslandRound/,'use the established rounded child font');
   assert.ok(font.size>=18 && font.weight>=700,'title must be large and visibly bold');
   assert.ok((await page.locator('.gc-month-day').count())>=28,'month grid is populated');
   assert.equal(await page.locator('.gc-family').count(),0,'month view omits auxiliary family filter');
   assert.equal(await page.locator('.gc-memory-book').count(),1,'illustrated notebook appears beneath calendar');
   assert.equal(await page.locator('.gc-challenge').count(),1,'21-day challenge is a distinct illustrated panel');
   const monthWidth=await page.locator('.gc-page').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));
   assert.ok(monthWidth.scroll<=monthWidth.width+3,'no month overflow at '+width+'px: '+JSON.stringify(monthWidth));
   await page.screenshot({path:'/tmp/growth-calendar-month-'+width+'.png',fullPage:true});
   const today=await page.evaluate(()=>{
    const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
   });
   const dayButton=page.locator('.gc-month-day[data-date="'+today+'"]');
   await dayButton.click();
   await page.locator('#up-dialog[open] .gc-detail').waitFor();
   await page.locator('html.gc-png-ready').waitFor({timeout:15000});
   const pngSkin=await page.evaluate(()=>{
     const panel=document.querySelector('#up-dialog .island-dialog-surface');
     const mood=document.querySelector('#up-dialog .gc-detail-stat.mood');
     const title=document.querySelector('#up-dialog .island-dialog-title');
     return {frame:getComputedStyle(panel,'::before').borderImageSource,
       mood:getComputedStyle(mood).backgroundImage,
       title:getComputedStyle(title).backgroundImage};
   });
   assert.match(pngSkin.frame,/popup_bg\.png/,'popup uses actual PNG nine-slice');
   assert.match(pngSkin.title,/popup_title_bar\.png/,'title uses approved PNG');
   assert.match(pngSkin.mood,/card_mood_bg\.png/,'growth stat uses mood PNG');
   assert.equal(await page.locator('#up-dialog .gc-detail-stat').count(),3,'three summary cards');
   assert.equal(await page.locator('#up-dialog .gc-detail-ribbon .gc-ribbon-icon').count(),4,'four scrapbook module headings use real illustrated icons');
   assert.equal(await page.locator('#up-dialog .gc-detail-list-row').count()>=3,true,'schedule renders illustrated homework, course, packing rows');
   assert.equal(await page.locator('#up-dialog .gc-paper-raised').count()>=3,true,'note, schedule, habits and moments have raised material panels');
   const assetState=await page.evaluate(()=>window.GrowthPopupPng);
   assert.ok(assetState?.ready && Object.values(assetState.files).every(Boolean),'all five PNGs are actually enabled');
   const artResult=await page.locator('#up-dialog .gc-ribbon-icon, #up-dialog .gc-detail-row-icon').evaluateAll(async images=>{
     await Promise.all(images.map(img=>img.decode().catch(()=>null)));
     return images.map(img=>({src:img.getAttribute('src'),ok:img.complete&&img.naturalWidth>0}));
   });
   assert.deepEqual(artResult.filter(x=>!x.ok),[],'all section and schedule illustrations load in real popup');
   const dialogUI=await page.evaluate(()=>{
    const panel=document.querySelector('#up-dialog .island-dialog-surface')?.getBoundingClientRect();
    const close=document.querySelector('#up-dialog .island-dialog-surface>.up-close')?.getBoundingClientRect();
    return {panel:panel&&{top:panel.top,left:panel.left,right:panel.right},close:close&&{top:close.top,left:close.left,right:close.right}};
   });
   assert.ok(dialogUI.panel && dialogUI.close && dialogUI.close.top>=dialogUI.panel.top-10 && dialogUI.close.top<dialogUI.panel.top+60,'close is anchored at upper right, not below dialog');
   assert.ok(dialogUI.close.right<=dialogUI.panel.right+3,'close remains inside panel');
   assert.equal(await page.locator('#up-dialog .gc-detail-meadow').count(),1,'bottom meadow illustration is present');
   assert.equal(await page.locator('#up-dialog .gc-detail-stat').count(),3,'date scrapbook has three pastel summary tiles');
   const raised=await page.locator('#up-dialog .gc-diary-paper').evaluate(el=>getComputedStyle(el).borderImageSource);
   assert.match(raised,/dialogs-v3\/panel\.webp/,'actual page uses illustrated paper, not a flat box');
   const ribbons=await page.locator('#up-dialog .gc-detail-ribbon').evaluateAll(xs=>xs.map(el=>({
      text:el.textContent.trim(),
      image:el.querySelector('img')?.getAttribute('src'),
      background:getComputedStyle(el,'::before').backgroundImage
   })));
   assert.equal(ribbons.length,4,'four visible scrapbook module headers are rendered');
   assert.ok(ribbons.every(r=>r.image&&r.background.includes('linear-gradient')),'headers have illustrated icon and raised inset material');
   await page.screenshot({path:'/tmp/growth-calendar-dialog-'+width+'.png',fullPage:true});
   await page.locator('#up-dialog [data-up="journal-edit"]').click();
   await page.locator('#up-dialog [data-up="journal-mood"][data-mood="happy"]').click();
   await page.locator('#up-journal-text').fill('开心！');
   await page.locator('#up-dialog [data-up="journal-save"]').click();
   await dayButton.click();
   assert.match(await page.locator('#up-dialog .gc-detail').innerText(),/开心！/,'mood note synchronizes from existing journal');
   await page.locator('#up-dialog [data-up="growth-habit-new"]').click();
   await page.locator('#gc-habit-name').fill('每天阅读20分钟');
   await page.locator('#up-dialog [data-up="growth-habit-save"]').click();
   await dayButton.click();
   await page.locator('#up-dialog [data-up="growth-habit-check"]').first().click();
   await page.locator('#up-dialog [data-up="close"]').click();
   assert.ok(await page.locator('.gc-month-day[data-date="'+today+'"] .gc-mark-habit').count()>0,'habit appears as a leaf on month grid');
   await page.locator('.gc-switch [data-range="week"]').click();
   await page.locator('.gc-week-row').first().waitFor();
   assert.equal(await page.locator('.gc-week-row').count(),3,'morning / afternoon / evening timetable');
   await page.locator('.gc-family [data-member="dad"]').click();
   assert.ok(await page.locator('.gc-week-row').count()===3,'switching a member keeps the timetable');
   await page.locator('.gc-family [data-member="all"]').click();
   if(width===390){
    await page.locator('.gc-timetable [data-up="add-menu"]').click();
    await page.locator('#fs-sentence').fill('下午三点和妈妈一起阅读');
    await page.locator('.fs-save').click();
    await page.locator('.gc-week-row').first().waitFor();
    assert.match(await page.locator('.gc-timetable').innerText(),/和妈妈一起阅读/,'one-line family schedule editor remains connected');
   }
   assert.equal(await page.locator('.gc-page [data-up="complete"]').count(),0,'courses and packing remain read-only');
   const layout=await page.locator('.gc-page').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));
   assert.ok(layout.scroll<=layout.width+3,'no horizontal overflow at '+width+'px: '+JSON.stringify(layout));
   assert.deepEqual(errors,[],'no browser page errors at '+width+'px');
   await page.screenshot({path:'/tmp/growth-calendar-week-'+width+'.png',fullPage:true});
   await page.close();
  }
  console.log('PASS growth calendar mobile QA 320/375/390/430: week/month, existing mood sync, habit stamp, tabs, and layout');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
