// Preview-only 320/375/390/430px companion gallery smoke test.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  for(const width of [320,375,390,430]){
   const p=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:width===390?3:2});
   const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://127.0.0.1:8189/child.html?preview=1&design=original');
   await p.locator('#island-loader').waitFor({state:'detached'});
   const scene=await p.evaluate(()=>{
     const root=getComputedStyle(document.documentElement);
     const world=getComputedStyle(document.querySelector('.tf-world-extension'));
     const sky=getComputedStyle(document.querySelector('.tf-sky-extension'));
     const original=getComputedStyle(document.querySelector('.tf-world-main'));
     const paint=getComputedStyle(document.querySelector('.tf-world-paint'));
     const beach=getComputedStyle(document.querySelector('.tf-beach-transition'));
     const nav=document.querySelector('.up-nav');
     const navRect=nav.getBoundingClientRect();
     const navPseudo=getComputedStyle(nav,'::before');
     const hero=document.querySelector('.tf-hero').getBoundingClientRect();
     const top=document.querySelector('.tf-top').getBoundingClientRect();
     const phone=document.querySelector('.phone');
     return {rootColor:root.backgroundColor,world:world.backgroundImage,worldShow:world.display,
       sky:sky.backgroundImage,skyShow:sky.display,main:original.backgroundImage,
       paint:paint.backgroundImage,paintMask:paint.maskImage,beach:beach.backgroundImage,
       navBackground:getComputedStyle(nav).backgroundImage,navPosition:getComputedStyle(nav).position,
       navBottom:navRect.bottom,shoreline:navPseudo.backgroundImage,
       mainRect:document.querySelector('.tf-world-main').getBoundingClientRect().toJSON(),
       phoneRect:phone.getBoundingClientRect().toJSON(),
       heroHeight:hero.height,logoTop:top.top,scrollWidth:document.documentElement.scrollWidth};
   });
   const lift=Math.min(44,Math.max(34,width/10));
   assert.equal(scene.worldShow,'block','world extension visible '+width);
   assert.equal(scene.skyShow,'block','independent sky visible '+width);
   assert.ok(scene.world.includes('side-world-extension-v1.webp'),'no duplicate village panorama '+width);
   assert.ok(scene.sky.includes('sky-extension-v1.webp'),'painted sky not solid bar '+width);
   assert.equal(scene.main,'none','main wrapper must not paint a second image '+width);
   assert.ok(scene.paint.includes('today-island-reference-v1.webp'),'original island only once '+width);
   assert.notEqual(scene.paintMask,'none','upper/lower fade prevents hard rectangular seam '+width);
   assert.ok(scene.beach.includes('beach-transition-v1.webp'),'registered, transparent beach layer '+width);
   assert.equal(scene.navBackground,'none','no large beige navigation field '+width);
   assert.ok(scene.shoreline.includes('tab-shoreline-v1.svg'),'narrow hand-drawn shoreline '+width);
   assert.equal(scene.navPosition,'fixed','three tabs remain fixed '+width);
   assert.ok(Math.abs(scene.navBottom-850)<2,'nav anchored at viewport bottom '+width);
   assert.ok(Math.abs(scene.mainRect.width-width)<2,'original island equals screen width '+width);
   assert.ok(Math.abs(scene.mainRect.height-width*1748/900)<2,'original island aspect preserved '+width);
   assert.ok(scene.scrollWidth<=width+2,'no horizontal overflow '+width);
   assert.ok(Math.abs(scene.heroHeight-(width*.93-lift))<2,'task placement preserved '+width);
   assert.ok(scene.logoTop>=22 && scene.logoTop<=29,'logo safe at top '+width);
   const loaded=await p.evaluate(async()=>{
     const paths=['assets/hd/five-layers/sky-extension-v1.webp',
       'assets/hd/five-layers/side-world-extension-v1.webp',
       'assets/hd/five-layers/beach-transition-v1.webp'];
     return Promise.all(paths.map(async src=>{const i=new Image();i.src=src;
       try{await i.decode();return [i.naturalWidth,i.naturalHeight];}
       catch{return [0,0];}
     }));
   });
   assert.deepEqual(loaded,[[1800,600],[2400,1748],[900,480]],'new transparent textures decode '+width);
   await p.screenshot({path:'/tmp/companions-gallery-home-'+width+'.png'});
   await p.locator('button[data-up="mate-picker"]').first().click();
   await p.locator('.island-mate-grid').waitFor();
   assert.equal(await p.locator('.island-mate-tile').count(),17,width+' should show all companions');
   assert.equal(await p.locator('.island-mate-tile').first().getAttribute('data-id'),'bear');
   const images=await p.locator('.island-mate-tile img').evaluateAll(async elems=>Promise.all(elems.map(async img=>{
     img.loading='eager';
     if(!img.complete) await new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});});
     return {src:img.getAttribute('src'),ok:img.naturalWidth>0};
   })));
   assert.equal(images.length,17);
   assert.ok(images.every(i=>/^assets\/characters\/companion-[a-z]+-v7\.(png|svg)$/.test(i.src)),'all 17 images must use v7');
   assert.equal(images.filter(i=>i.src.endsWith('.svg')).length,1,'mouse portrait uses SVG with embedded transparent WebP');
   const alphas=await p.locator('.island-mate-tile img').evaluateAll(imgs=>imgs.filter(img=>img.closest('[data-id]')?.dataset.id!=='mouse').map(img=>{
     const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
     const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
     const sample=(x,y)=>ctx.getImageData(x,y,1,1).data[3];
     const region=ctx.getImageData(92,93,328,378).data;let opaque=0;
     for(let i=3;i<region.length;i+=4)if(region[i]>220)opaque++;
     return {id:img.closest('[data-id]')?.dataset.id,w:img.naturalWidth,h:img.naturalHeight,
       edges:[sample(256,20),sample(20,256),sample(490,256),sample(256,492)],
       fill:opaque/(328*378)};
   }));
   for(const sample of alphas){
     assert.equal(sample.w,512,sample.id+' width');
     assert.equal(sample.h,512,sample.id+' height');
     assert.ok(sample.edges.every(a=>a<12),sample.id+' must have transparent outside, '+sample.edges);
     assert.ok(sample.fill>0.3 && sample.fill<0.965,sample.id+' must not contain old opaque beige panel '+sample.fill);
   }
   assert.ok((await p.locator('.tf-companion-art').first().getAttribute('src'))?.endsWith('-v7.png'),'today mascot must use v7');
   assert.equal(alphas.length,16,'all sixteen original PNG portraits remain valid');
   assert.ok(images.every(i=>i.ok),JSON.stringify(images.filter(i=>!i.ok)));
   const gridColumns=await p.locator('.island-mate-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
   assert.equal(gridColumns,3,'V2 companion columns '+width);
   const ui=await p.evaluate(()=>{
     const nav=document.querySelector('.phone > .up-nav');
     const grid=document.querySelector('.island-mate-grid');
     const tabs=document.querySelector('.island-mate-tabs');
     const button=tabs?.querySelector('[aria-pressed="true"]');
     return {navPosition:getComputedStyle(nav).position,navBottom:nav.getBoundingClientRect().bottom,
       gridOverflow:getComputedStyle(grid).overflowY,gridCanScroll:grid.scrollHeight>grid.clientHeight,
       tabTop:tabs.getBoundingClientRect().top,tabOutline:button?getComputedStyle(button).outlineStyle:'missing'};
   });
   assert.equal(ui.navPosition,'fixed','bottom nav must use viewport-fixed positioning');
   assert.ok(Math.abs(ui.navBottom-850)<2,'bottom nav must align with visual viewport '+width);
   assert.equal(ui.gridOverflow,'auto','only gallery list should scroll');
   assert.ok(ui.gridCanScroll,'all sixteen animals must be reachable by scrolling');
   assert.equal(ui.tabOutline,'none','no unexpected selection focus outline');
   await p.locator('.island-mate-grid').evaluate(el=>{el.scrollTop=el.scrollHeight;});
   const afterScroll=await p.evaluate(()=>({scroll:document.querySelector('.island-mate-grid').scrollTop,
     tabTop:document.querySelector('.island-mate-tabs').getBoundingClientRect().top}));
   assert.ok(afterScroll.scroll>0,'gallery can scroll to last companion');
   assert.ok(Math.abs(afterScroll.tabTop-ui.tabTop)<2,'segment control remains fixed when gallery scrolls');
   await p.screenshot({path:'/tmp/companions-gallery-'+width+'.png'});
   const before=await p.evaluate(()=>{const d=getData();return {points:d.points,construction:d.demoGrowth?.construction,redemptions:d.redemptions?.length||0};});
   await p.locator('.island-mate-tile[data-id="mouse"]').click();
   await p.locator('button[data-up="mate-picker"]').first().waitFor();
   const selected=await p.evaluate(()=>({mate:getData().todayMate,owned:getData().rewardsUnlocked,points:getData().points,construction:getData().demoGrowth?.construction,redemptions:getData().redemptions?.length||0}));
   assert.equal(selected.mate,'🐭','mouse selection');
   assert.ok(selected.owned.includes('🐭'));
   assert.ok((await p.locator('.tf-companion-art').first().getAttribute('src'))?.endsWith('companion-mouse-v7.svg'),'today uses mouse portrait');
   await p.screenshot({path:'/tmp/companions-mouse-'+width+'.png'});
   assert.equal(selected.points,before.points,'no points spending');
   assert.equal(selected.construction,before.construction,'no construction change');
   assert.equal(selected.redemptions,before.redemptions,'no redemption added');
   await p.reload();await p.locator('#island-loader').waitFor({state:'detached'});
   assert.equal(await p.evaluate(()=>getData().todayMate),'🐭','reload keeps mouse selection');
   await p.locator('button[data-up="mate-picker"]').first().click();
   assert.equal(await p.locator('.island-mate-tile[data-id="mouse"]').getAttribute('aria-pressed'),'true');
   await p.locator('.island-mate-tabs button[data-tab="owned"]').click();
   assert.equal(await p.locator('.island-mate-tile').count(),2,'only bear and mouse met in isolated preview');
   const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   assert.equal(overflow,false,'no horizontal page overflow '+width);
   assert.deepEqual(errors,[],'no browser errors '+width);
   await p.close();
   console.log('PASS companion gallery',width,'px');
  }
  for(const width of [768,1024,1366]){
   const p=await browser.newPage({viewport:{width,height:1024},deviceScaleFactor:2});
   const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://127.0.0.1:8189/child.html?preview=1&design=original');
   await p.locator('#island-loader').waitFor({state:'detached'});
   const layout=await p.evaluate(()=>{
     const phone=document.querySelector('.phone'),nav=document.querySelector('.up-nav');
     const world=document.querySelector('.tf-world-extension');
     const main=document.querySelector('.tf-world-main'),paint=document.querySelector('.tf-world-paint');
     const sky=document.querySelector('.tf-sky-extension');
     const prect=phone.getBoundingClientRect(),nrect=nav.getBoundingClientRect();
     return {world:getComputedStyle(world).backgroundImage,sky:getComputedStyle(sky).backgroundImage,
       main:getComputedStyle(main).backgroundImage,paint:getComputedStyle(paint).backgroundImage,
       sideMask:getComputedStyle(main).maskImage,topMask:getComputedStyle(paint).maskImage,
       phoneWidth:prect.width,phoneCenter:prect.x+prect.width/2,
       navWidth:nrect.width,navBottom:nrect.bottom,
       scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
   });
   assert.ok(layout.world.includes('side-world-extension-v1.webp'),'iPad panorama without duplicated island '+width);
   assert.ok(layout.sky.includes('sky-extension-v1.webp'),'iPad sky overlay '+width);
   assert.equal(layout.main,'none','iPad has one island bitmap, not two '+width);
   assert.ok(layout.paint.includes('today-island-reference-v1.webp'),'central island original retained '+width);
   assert.notEqual(layout.sideMask,'none','left/right feathering applied '+width);
   assert.notEqual(layout.topMask,'none','top/bottom feathering applied '+width);
   assert.ok(layout.phoneWidth>=490&&layout.phoneWidth<=501,'iPad content max width '+width);
   assert.ok(Math.abs(layout.phoneCenter-width/2)<3,'iPad island centered '+width);
   assert.ok(Math.abs(layout.navWidth-layout.phoneWidth)<3,'original tabs share column width '+width);
   assert.ok(Math.abs(layout.navBottom-1024)<2,'iPad tabs fixed at viewport bottom '+width);
   assert.ok(layout.scrollWidth<=width+2,'no horizontal scroll on iPad '+width);
   await p.screenshot({path:'/tmp/island-world-tablet-'+width+'.png'});
   assert.deepEqual(errors,[],'no browser errors on tablet '+width);
   await p.close();
   console.log('PASS world extension',width,'px');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
