const assert=require('node:assert/strict');
const F=require('../dist/family-schedule.js');
const defaults={date:'2026-11-08',member:'all'};
assert.equal(F.parse('下午三点开心游泳，爸爸送',defaults).start,'15:00');
assert.deepEqual(F.parse('下午三点开心游泳，爸爸送',defaults).members,['child','dad']);
assert.deepEqual(F.parse('开心和妈妈一起阅读',defaults).members,['child','mom']);
assert.equal(F.parse('看外婆',defaults).start,'');
assert.equal(F.parse('二十五点看书',defaults).start,'');
assert.equal(F.parse('上午十点半读书',defaults).start,'10:30');
assert.equal(F.visible({kind:'class'},'dad'),false);
assert.equal(F.visible({kind:'event',ev:{members:['all']}},'mom'),true);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});for(const width of [320,375,390,430]){
 const p=await browser.newPage({viewport:{width,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8189/child.html?preview=1&design=original&view=calendar');await p.locator('.cp-title').waitFor();await p.locator('#island-loader').waitFor({state:'detached'});await p.evaluate(()=>document.fonts.ready);
 const type=await p.evaluate(()=>{
   const title=getComputedStyle(document.querySelector('.cp-agenda-head h2'));
   const task=getComputedStyle(document.querySelector('.cp-item-copy b'));
   const date=getComputedStyle(document.querySelector('.cp-date-nav strong'));
   return {titleSize:parseFloat(title.fontSize),taskSize:parseFloat(task.fontSize),taskWeight:Number(task.fontWeight),dateSize:parseFloat(date.fontSize),fontFamily:task.fontFamily,clamp:task.webkitLineClamp};
 });
 assert.ok(type.titleSize<=17,'calendar heading should be compact');
 assert.ok(type.taskSize<=13.1,'task body should be at most 13px');
 assert.ok(type.taskWeight<=600,'task body should no longer be extra bold');
 assert.ok(type.dateSize<=13.1,'date label should be compact');
 assert.match(type.fontFamily,/PingFang SC/,'schedule text should use a native Chinese system font');
 assert.equal(type.clamp,'3','long task preview should clamp to three lines');
 await p.screenshot({path:`/tmp/family-calendar-${width}.png`,fullPage:true});

 const originalTask=p.locator('.cp-item-copy b').first();
 const savedTitle=await originalTask.textContent();
 const longHomework='钢琴练习🌈 1️⃣ 指法：左右手每个5次 2️⃣ 唱谱：2次 3️⃣ 练习：5遍。整理自己的书包 1️⃣ 文具：铅笔、直尺、橡皮 2️⃣ 语文、数学、英语三科课本及作业本。';
 await originalTask.evaluate((el,title)=>{el.textContent=title},longHomework);
 const longText=await originalTask.evaluate(el=>({height:el.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(el).lineHeight),title:el.textContent}));
 assert.equal(longText.title,longHomework,'long task text should stay intact for details and accessibility');
 assert.ok(longText.height<=longText.lineHeight*3+10,'long Chinese homework should preview within three lines');
 await p.screenshot({path:`/tmp/family-calendar-longtext-${width}.png`,fullPage:true});
 await originalTask.evaluate((el,title)=>{el.textContent=title},savedTitle);

 assert.equal(await p.locator('.cp-title h1').innerText(),'小岛日程');assert.equal(await p.locator('.cp-packing h2 img').getAttribute('src'),'assets/hd/course/backpack.webp');assert.equal(await p.locator('.up-nav .tf-library-tab').count(),3);assert.ok((await p.locator('.cp-seaside').boundingBox()).height<=135,'companion should be compact');
 await p.locator('[data-up="add-menu"]').click();await p.locator('#fs-sentence').fill('下午三点开心游泳，爸爸送');assert.match(await p.locator('#fs-summary').innerText(),/15:00.*爸爸/);
 await p.screenshot({path:`/tmp/family-calendar-dialog-${width}.png`,fullPage:true});
 await p.locator('.fs-save').click();await p.locator('.cp-item').filter({hasText:'开心游泳，爸爸送'}).waitFor();
 await p.locator('[data-member="dad"]').click();assert.equal(await p.locator('.cp-item').filter({hasText:'开心游泳，爸爸送'}).count(),1);
 await p.locator('[data-member="mom"]').click();assert.equal(await p.locator('.cp-item').filter({hasText:'开心游泳，爸爸送'}).count(),0);
 await p.locator('[data-up="add-menu"]').click();await p.locator('#fs-sentence').fill('测试无时间安排');await p.locator('.fs-save').click();const card=p.locator('.cp-item').filter({hasText:'测试无时间安排'});assert.match(await card.innerText(),/时间未定/);await p.reload();await p.locator('.cp-item').filter({hasText:'测试无时间安排'}).click();await p.locator('[data-up="edit-event"]').click();await p.locator('[data-up="small-event-delete"]').click();await p.locator('[data-up="small-event-remove"]').click();assert.equal(await p.locator('.cp-item').filter({hasText:'测试无时间安排'}).count(),0);
 await p.locator('.cp-title [data-up="plan-range"]').click();assert.ok(await p.locator('.cp-calendar.monthly .cp-day').count()>=28);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log('PASS',width);await p.close();
}await browser.close()})().catch(e=>{console.error(e);process.exit(1)});
