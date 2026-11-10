/* Stage1 390px reference-layout QA: actual live DOM + screenshot. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8189/family-tree.html?preview=1');
  await page.locator('[data-moment]').first().waitFor({timeout:15000});
  await page.locator('.ft-hero-picture').evaluate(()=>document.fonts.ready);
  const dims=await page.evaluate(()=>{
   const rect=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
   const bg=s=>getComputedStyle(document.querySelector(s)).backgroundImage;
   return {width:innerWidth,docWidth:document.documentElement.scrollWidth,hero:rect('.ft-hero'),plaque:rect('.ft-hero-plaque'),
     firstTag:rect('.ft-tree-tag'),growth:rect('.ft-growth-summary'),nav:rect('.ft-tabs'),
     firstCard:rect('.ft-story-item'),cardCount:document.querySelectorAll('.ft-story-item').length,
     noteArtwork:bg('.ft-tree-tag'),growthArtwork:bg('.ft-growth-summary'),
     storyArtwork:bg('.ft-story-item'),photoArtwork:bg('.ft-story-stamp')};
  });
  assert.equal(dims.width,390);
  assert.ok(dims.docWidth<=390,'no sideways overflow: '+JSON.stringify(dims));
  assert.ok(dims.hero.h>=260&&dims.hero.h<=300,'hero near target aspect: '+JSON.stringify(dims.hero));
  assert.ok(dims.firstCard.y<480,'first record appears in target fold: '+JSON.stringify(dims.firstCard));
  assert.ok(dims.growth.x>245,'growth plaque floats to the right');
  assert.ok(dims.firstTag.x<20,'hanging notes near left of tree');
  assert.ok(dims.cardCount>=2,'record cards retained');
  assert.match(dims.noteArtwork,/family-tree-hifi\/hanging-note.svg/);
  assert.match(dims.growthArtwork,/family-tree-hifi\/growth-panel.svg/);
  assert.match(dims.storyArtwork,/family-tree-hifi\/story-card-frame.svg/);
  assert.match(dims.photoArtwork,/family-tree-hifi\/photo-swimming-approved.webp/);
  await page.screenshot({path:'/tmp/family-tree-hifi-390-firstscreen.png',animations:'disabled'});
  await page.screenshot({path:'/tmp/family-tree-hifi-390-full.png',fullPage:true,animations:'disabled'});
  // Ensure high-fidelity skin did not remove real interaction.
  await page.locator('.ft-write-button').click();
  assert.equal(await page.locator('#editor').evaluate(d=>d.open),true);
  await page.locator('#editorKind').selectOption('note');
  await page.locator('#editorText').fill('390px 高保真记录验收');
  await page.locator('#saveEditor').click();
  await page.locator('.ft-story-item .ft-paper-copy').getByText('390px 高保真记录验收').waitFor();
  await page.locator('[data-section="hearts"]').click();
  assert.equal(await page.locator('#heartComposer').evaluate(d=>d.open),true);
  await page.locator('#heartComposerClose').click();
  assert.deepEqual(errors,[],'no browser page errors');
  console.log('PASS family-tree hifi 390 layout & working controls',JSON.stringify(dims));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
