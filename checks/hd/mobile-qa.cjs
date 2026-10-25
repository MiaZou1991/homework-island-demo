/* Run with the bundled Playwright runtime; only isolated preview data is used. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];
 for(const width of [375,390,430])for(const dpr of [2,3]){
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:dpr,isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8178/')?r.continue():r.abort());
  await page.goto('http://127.0.0.1:8178/child.html?preview=1');await page.locator('.hd-map-art').waitFor();await page.locator('#island-loader').waitFor({state:'detached'});
  await page.locator('.hd-map-art').evaluate(img=>img.decode());
  const density=await page.locator('.hd-map-art,.hd-mascot').evaluateAll(imgs=>imgs.map(i=>({src:i.getAttribute('src'),natural:[i.naturalWidth,i.naturalHeight],css:[i.width,i.height],ratio:Math.min(i.naturalWidth/i.width,i.naturalHeight/i.height)})));
  const overflow=await page.locator('html').evaluate(el=>el.scrollWidth>innerWidth);
  if(overflow||density.some(x=>x.ratio<dpr))throw Error('Layout/density failure '+width+'@'+dpr);
  await page.screenshot({path:path.join(__dirname,`today-${width}-${dpr}.png`),fullPage:true});
  await page.getByRole('button',{name:/17:30.*游泳课/}).click();
  const course=await page.getByRole('dialog').innerText();
  if(!course.includes('泳衣')||/已备|打卡.*按钮/.test(course))throw Error('Unexpected packing state');
  if(await page.getByRole('dialog').locator('input[type=checkbox],button[data-up=complete]').count())throw Error('Course has a completion control');
  await page.getByRole('button',{name:'关闭弹层'}).click();
  await page.getByRole('button',{name:'小岛日程',exact:true}).click();
  await page.getByRole('button',{name:'月视图',exact:true}).click();
  await page.screenshot({path:path.join(__dirname,`calendar-${width}-${dpr}.png`),fullPage:true});
  await page.getByRole('button',{name:'今日任务',exact:true}).click();
  await page.getByRole('button',{name:'☀ 记心情 ›',exact:true}).click();
  await page.getByRole('button',{name:'开心',exact:true}).click();
  await page.locator('#up-journal-text').fill('今天在小岛上学习。');
  await page.getByRole('button',{name:'保存这段小记录',exact:true}).click();
  await page.getByRole('button',{name:'完成练习册第 3 页，完成后检查一遍',exact:true}).click();
  await page.getByRole('button',{name:'关闭弹层'}).click();
  if(!(await page.locator('.up-header-points').innerText()).includes('138'))throw Error('Unexpected points');
  await page.getByRole('button',{name:'撤销完成练习册第 3 页，完成后检查一遍',exact:true}).click();
  if(!(await page.locator('.up-header-points').innerText()).includes('128'))throw Error('Undo points failed');
  await page.getByRole('button',{name:'我的小岛',exact:true}).click();
  await page.locator('.up-island-scene img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
  await page.locator('.toast').waitFor({state:'detached'});
  await page.screenshot({path:path.join(__dirname,`island-${width}-${dpr}.png`),fullPage:true});
  for(const [name,file] of [['小岛花园','garden.jpg'],['海边码头','dock.jpg'],['森林书屋','library.jpg']]){
   await page.locator('.up-hotspot').filter({hasText:name}).click();
   const img=page.locator('.hd-area-preview img');await img.evaluate(el=>el.decode());
   const asset=await img.evaluate(el=>({src:el.getAttribute('src'),ratio:Math.min(el.naturalWidth/el.width,el.naturalHeight/el.height)}));
   if(!asset.src.endsWith(file)||asset.ratio<dpr)throw Error(`Scene density failure ${file} ${width}@${dpr}`);
  }
  await page.locator('.up-hotspot.house').click();
  const room=page.locator('.up-room-bg');await room.evaluate(el=>el.decode());
  const roomRatio=await room.evaluate(el=>Math.min(el.naturalWidth/el.width,el.naturalHeight/el.height));
  if(roomRatio<dpr)throw Error(`Room density failure ${width}@${dpr}`);
  if(width===430&&dpr===3)await page.screenshot({path:path.join(__dirname,'room-430-3.png'),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  results.push({width,dpr,overflow,density,errors,flows:['read-only course','week/month','mood save','complete/undo exact points','island navigation','three area previews and room image density']});await context.close();
 }
 await browser.close();fs.writeFileSync(path.join(__dirname,'mobile-results.json'),JSON.stringify(results,null,2));console.log('PASS 6 mobile viewport/DPR combinations and interaction flows');
})().catch(e=>{console.error(e);process.exit(1)});
