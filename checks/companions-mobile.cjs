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
   assert.equal(gridColumns,width<360?3:4,'adaptive columns '+width);
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
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
