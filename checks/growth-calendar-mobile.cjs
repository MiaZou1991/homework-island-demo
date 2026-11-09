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
   assert.ok((await page.locator('.gc-month-day').count())>=28,'month grid is populated');
   const today=await page.evaluate(()=>{
    const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
   });
   const dayButton=page.locator('.gc-month-day[data-date="'+today+'"]');
   await dayButton.click();
   await page.locator('#up-dialog[open] .gc-detail').waitFor();
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
   await page.screenshot({path:'/tmp/growth-calendar-'+width+'.png',fullPage:true});
   await page.close();
  }
  console.log('PASS growth calendar mobile QA 320/375/390/430: week/month, existing mood sync, habit stamp, tabs, and layout');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
