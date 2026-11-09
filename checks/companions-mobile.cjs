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
   assert.equal(await p.locator('.island-mate-tile').count(),16,width+' should show all companions');
   assert.equal(await p.locator('.island-mate-tile').first().getAttribute('data-id'),'bear');
   const images=await p.locator('.island-mate-tile img').evaluateAll(async elems=>Promise.all(elems.map(async img=>{
     img.loading='eager';
     if(!img.complete) await new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});});
     return {src:img.getAttribute('src'),ok:img.naturalWidth>0};
   })));
   assert.equal(images.length,16);
   assert.ok(images.find(i=>i.src?.endsWith('companion-rabbit-v5.png')),'rabbit should use the corrected transparent PNG');
   const rabbitAlpha=await p.locator('.island-mate-tile[data-id="rabbit"] img').evaluate(img=>{
      const cvs=document.createElement('canvas');cvs.width=img.naturalWidth;cvs.height=img.naturalHeight;
      const ctx=cvs.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      return {gap:ctx.getImageData(210,58,1,1).data[3],face:ctx.getImageData(250,190,1,1).data[3]};
   });
   assert.ok(rabbitAlpha.gap<12 && rabbitAlpha.face>240,'rabbit card background must be transparent '+width);
   assert.ok(images.every(i=>i.ok),JSON.stringify(images.filter(i=>!i.ok)));
   const gridColumns=await p.locator('.island-mate-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
   assert.equal(gridColumns,width<360?3:4,'adaptive columns '+width);
   await p.screenshot({path:'/tmp/companions-gallery-'+width+'.png'});
   const before=await p.evaluate(()=>{const d=getData();return {points:d.points,construction:d.demoGrowth?.construction,redemptions:d.redemptions?.length||0};});
   await p.locator('.island-mate-tile[data-id="deer"]').click();
   await p.locator('button[data-up="mate-picker"]').first().waitFor();
   const selected=await p.evaluate(()=>({mate:getData().todayMate,owned:getData().rewardsUnlocked,points:getData().points,construction:getData().demoGrowth?.construction,redemptions:getData().redemptions?.length||0}));
   assert.equal(selected.mate,'🦌','deer selection');
   assert.ok(selected.owned.includes('🦌'));
   assert.equal(selected.points,before.points,'no points spending');
   assert.equal(selected.construction,before.construction,'no construction change');
   assert.equal(selected.redemptions,before.redemptions,'no redemption added');
   await p.reload();await p.locator('#island-loader').waitFor({state:'detached'});
   assert.equal(await p.evaluate(()=>getData().todayMate),'🦌','reload keeps selection');
   await p.locator('button[data-up="mate-picker"]').first().click();
   assert.equal(await p.locator('.island-mate-tile[data-id="deer"]').getAttribute('aria-pressed'),'true');
   await p.locator('.island-mate-tabs button[data-tab="owned"]').click();
   assert.equal(await p.locator('.island-mate-tile').count(),2,'only bear and deer met in isolated preview');
   const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   assert.equal(overflow,false,'no horizontal page overflow '+width);
   assert.deepEqual(errors,[],'no browser errors '+width);
   await p.close();
   console.log('PASS companion gallery',width,'px');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
