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
     const body=getComputedStyle(document.body);
     const world=getComputedStyle(document.querySelector('.tf-world-extension'));
     const original=getComputedStyle(document.querySelector('.tf-world-main'));
     const phone=getComputedStyle(document.querySelector('.phone'));
     const nav=getComputedStyle(document.querySelector('.phone > .up-nav'));
     const hero=document.querySelector('.tf-hero').getBoundingClientRect();
     const top=document.querySelector('.tf-top').getBoundingClientRect();
     return {bodyImage:body.backgroundImage,bodySize:body.backgroundSize,bodyPosition:body.backgroundPosition,
       worldDisplay:world.display,worldImage:world.backgroundImage,
       originalDisplay:original.display,phoneImage:phone.backgroundImage,
       navImage:nav.backgroundImage,navPosition:nav.position,
       heroHeight:hero.height,logoTop:top.top,bodyTop:document.body.getBoundingClientRect().top};
   });
   const lift=Math.min(44,Math.max(34,width/10));
   assert.ok(scene.bodyImage.includes('today-island-reference-v1.webp'),'one original island behind whole page '+width);
   assert.equal(scene.bodySize,'100% auto','island keeps exact aspect ratio '+width);
   assert.equal(scene.bodyPosition,'50% 0%','original sky begins at top edge '+width);
   assert.equal(scene.worldDisplay,'none','no duplicated panorama or blurry lighthouse '+width);
   assert.equal(scene.originalDisplay,'none','no second overlapping island bitmap '+width);
   assert.equal(scene.phoneImage,'none','no third phone-container background '+width);
   assert.equal(scene.navPosition,'fixed','nav remains viewport-fixed '+width);
   assert.ok(scene.navImage.includes('linear-gradient'),'tabs have protected solid sand field '+width);
   assert.ok(Math.abs(scene.bodyTop)<1,'scene anchored to viewport top '+width);
   assert.ok(Math.abs(scene.heroHeight-(width*.93-lift))<2,'task layout remains aligned '+width);
   assert.ok(scene.logoTop>=22&&scene.logoTop<=29,'logo stays clear of browser header '+width);
   const source=await p.evaluate(async()=>{
     const i=new Image();i.src='assets/hd/today-island-reference-v1.webp';
     try{await i.decode();return {w:i.naturalWidth,h:i.naturalHeight};}
     catch{return {w:0,h:0};}
   });
   assert.deepEqual(source,{w:900,h:1748},'original source not stretched or replaced');
   // Chrome DevTools can emulate the standalone CSS display-mode, unlike a
   // normal browser viewport. Never count a skipped emulation as real Safari QA.
   const cdp=await p.context().newCDPSession(p);
   try{
     await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'display-mode',value:'standalone'}]});
     const pwa=await p.evaluate(()=>{
       const standalone=matchMedia('(display-mode: standalone)').matches;
       const bodyImage=getComputedStyle(document.body).backgroundImage;
       const worldDisplay=getComputedStyle(document.querySelector('.tf-world-extension')).display;
       const navRect=document.querySelector('.up-nav').getBoundingClientRect();
       return {standalone,bodyImage,worldDisplay,navBottom:navRect.bottom,top:getComputedStyle(document.querySelector('.tf-top')).top};
     });
     if(pwa.standalone){
       assert.ok(pwa.bodyImage.includes('today-island-reference-v1.webp'),'PWA has exact same island bitmap '+width);
       assert.equal(pwa.worldDisplay,'none','PWA does not duplicate the beach '+width);
       assert.ok(Math.abs(pwa.navBottom-850)<2,'PWA fixed tabs align with bottom '+width);
       await p.screenshot({path:'/tmp/ios-standalone-'+width+'.png'});
       console.log('PASS simulated PWA scene',width,'px');
     }else console.log('NOTE CDP standalone media simulation unavailable on this Chrome build');
   }finally{
     await cdp.send('Emulation.setEmulatedMedia',{features:[]});
     await cdp.detach();
   }
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
     const phone=document.querySelector('.phone');
     const world=document.querySelector('.tf-world-extension');
     const art=document.querySelector('.tf-world-main');
     const nav=document.querySelector('.up-nav');
     const prect=phone.getBoundingClientRect();
     const nrect=nav.getBoundingClientRect();
     return {world:getComputedStyle(world).backgroundImage,
       art:getComputedStyle(art).backgroundImage,mask:getComputedStyle(art).maskImage,
       phoneWidth:prect.width,phoneCenter:prect.x+prect.width/2,
       navWidth:nrect.width,navBottom:nrect.bottom,
       scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,
       activeTab:nav.querySelector('[aria-current="page"]')?.textContent?.trim()};
   });
   assert.ok(layout.world.includes('island-world-panoramic-v2.webp'),'tablet extension image '+width);
   assert.ok(layout.art.includes('today-island-reference-v1.webp'),'tablet retains original island '+width);
   assert.ok(layout.mask!=='none','tablet island art should feather into surrounding panorama '+width);
   assert.ok(layout.phoneWidth>=490&&layout.phoneWidth<=501,'tablet content column width '+width);
   assert.ok(Math.abs(layout.phoneCenter-width/2)<3,'tablet island centered '+width);
   assert.ok(Math.abs(layout.navWidth-layout.phoneWidth)<3,'tablet original tabs share content width '+width);
   assert.ok(Math.abs(layout.navBottom-1024)<2,'tablet tabs fixed at viewport bottom '+width);
   assert.ok(layout.scrollWidth<=width+2,'no unwanted horizontal scroll on tablet '+width);
   await p.screenshot({path:'/tmp/island-world-tablet-'+width+'.png'});
   assert.deepEqual(errors,[],'no browser errors on tablet '+width);
   await p.close();
   console.log('PASS world extension',width,'px');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
