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
     const original=getComputedStyle(document.querySelector('.tf-world-main'));
     const phone=getComputedStyle(document.querySelector('.phone'));
     const hero=document.querySelector('.tf-hero').getBoundingClientRect();
     const top=document.querySelector('.tf-top').getBoundingClientRect();
     const nav=document.querySelector('.phone > .up-nav');
     return {
       rootImage:root.backgroundImage,worldDisplay:world.display,
       artImage:original.backgroundImage,artPositionY:original.backgroundPositionY,
       artSize:original.backgroundSize,artOpacity:original.opacity,
       artFilter:original.filter,phoneImage:phone.backgroundImage,
       heroHeight:hero.height,logoTop:top.top,
       navColor:getComputedStyle(nav).backgroundColor,
       navArt:getComputedStyle(nav,'::before').backgroundImage
     };
   });
   assert.ok(scene.rootImage.includes('today-island-reference-v1.webp'),'top system canvas must reuse original sky '+width);
   assert.equal(scene.worldDisplay,'none','no second island/beach wallpaper on phones '+width);
   assert.ok(scene.artImage.includes('today-island-reference-v1.webp'),'one original island image '+width);
   assert.equal(scene.phoneImage,'none','old CSS must not paint a second image on phone '+width);
   assert.equal(scene.artSize,'100% auto','do not stretch the original island '+width);
   assert.ok(scene.artPositionY==='top'||scene.artPositionY==='0%','source island must start at the top '+width);
   assert.equal(scene.artFilter,'none','no blurry island ghost '+width);
   assert.equal(scene.artOpacity,'1','full-resolution original artwork '+width);
   assert.ok(Math.abs(scene.heroHeight-width*.93)<2,'restored island composition alignment '+width);
   assert.ok(scene.logoTop>=22,'logo keeps clear of system status area '+width);
   assert.ok(scene.navArt.includes('tab-sand-line.svg'),'use only the approved sand tab skin '+width);
   assert.equal(await p.locator('meta[name="theme-color"]').count(),0,'no forced blue Safari toolbar '+width);
   const sourceImage=await p.evaluate(async()=>{const i=new Image();i.src='assets/hd/today-island-reference-v1.webp';try{await i.decode();return {w:i.naturalWidth,h:i.naturalHeight};}catch{return {w:0,h:0};}});
   assert.equal(sourceImage.w,900,'original high-resolution island loaded '+width);
   assert.equal(sourceImage.h,1748,'original island aspect ratio '+width);
   await p.screenshot({path:'/tmp/companions-gallery-home-'+width+'.png'});
   /* Address-bar expand/collapse analogue: document art must be independent of
      viewport height and bottom nav must stay on the visual viewport. */
   await p.setViewportSize({width,height:720});
   const resized=await p.evaluate(()=>({
      worldDisplay:getComputedStyle(document.querySelector('.tf-world-extension')).display,
      position:getComputedStyle(document.querySelector('.tf-world-main')).backgroundPositionY,
      tabBottom:document.querySelector('.phone > .up-nav').getBoundingClientRect().bottom,
      heroHeight:document.querySelector('.tf-hero').getBoundingClientRect().height
   }));
   assert.equal(resized.worldDisplay,'none','no duplicate backdrop after toolbar resize '+width);
   assert.equal(resized.position,scene.artPositionY,'no island picture jump after viewport resize '+width);
   assert.ok(Math.abs(resized.tabBottom-720)<2,'bottom tab remains anchored to viewport '+width);
   assert.ok(Math.abs(resized.heroHeight-scene.heroHeight)<2,'the island and cards do not jump with Safari toolbar '+width);
   await p.setViewportSize({width,height:850});

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
   if(width===390){
     /* Emulate standalone CSS media state as well as normal Safari-like Chrome.
        This does not replace a real iPhone screenshot, but it catches accidental
        double backgrounds in the PWA-only CSS branch. */
     const session=await p.context().newCDPSession(p);
     try{
       await session.send('Emulation.setEmulatedMedia',{
         features:[{name:'display-mode',value:'standalone'}]
       });
       const pwa=await p.evaluate(()=>({
         mode:matchMedia('(display-mode: standalone)').matches,
         extension:getComputedStyle(document.querySelector('.tf-world-extension')).display,
         original:getComputedStyle(document.querySelector('.tf-world-main')).backgroundImage,
         root:getComputedStyle(document.documentElement).backgroundImage,
         nav:getComputedStyle(document.querySelector('.phone > .up-nav')).position,
         navBottom:document.querySelector('.phone > .up-nav').getBoundingClientRect().bottom
       }));
       if(pwa.mode){
         assert.equal(pwa.extension,'none','standalone PWA must not paint a ghost island');
         assert.ok(pwa.original.includes('today-island-reference-v1.webp'),'PWA original island source');
         assert.ok(pwa.root.includes('today-island-reference-v1.webp'),'PWA status-bar canvas uses original sky');
         assert.equal(pwa.nav,'fixed','PWA tabs remain fixed');
         assert.ok(Math.abs(pwa.navBottom-850)<2,'PWA nav fits the viewport');
         await p.screenshot({path:'/tmp/companions-standalone-390.png'});
         console.log('PASS simulated PWA scene 390px');
       } else {
         console.log('PWA media simulation unsupported on this Chromium; manual Safari PWA required');
       }
     }finally{
       await session.detach();
     }
   }
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
