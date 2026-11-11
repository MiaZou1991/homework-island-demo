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
  assert.equal(await page.locator('#previewNotice').evaluate(el=>el.open),false,'test member tools stay collapsed in primary UI');
  assert.equal(await page.locator('[data-moment="sample-growth"] .ft-heart-status.is-own').count(),1,
    'own story renders a status, not a disabled action');
  assert.equal(await page.locator('[data-note="sample-note"] .ft-story-heart:not(.is-exhausted)').count(),1,
    'another member’s story offers a high-contrast heart action');
  assert.match(await page.locator('[data-moment="sample-growth"] .ft-story-comments').textContent(),/留言 \\d+/);
  assert.equal((await page.locator('.ft-tree-tag span').first().innerText()).includes('…'),false,
    'hanging cards do not show dangling ellipses');
  const cardEdges=await page.locator('.ft-story-item').evaluateAll(cards=>cards.map(card=>{
    const bounds=el=>{const b=el.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right}};
    return {card:bounds(card),actions:bounds(card.querySelector('.ft-record-controls')),
      image:card.dataset.art?bounds(card.querySelector('.ft-story-stamp')):null};
  }));
  assert.ok(cardEdges.every(x=>x.actions.bottom<=x.card.bottom+3),'story controls remain inside art cards: '+JSON.stringify(cardEdges));
  assert.ok(cardEdges.every(x=>!x.image||x.image.right<=x.card.right+3),'photo stickers do not leave card bounds');
  await page.screenshot({path:'/tmp/family-tree-hifi-390-firstscreen.png',animations:'disabled'});
  await page.screenshot({path:'/tmp/family-tree-hifi-390-full.png',fullPage:true,animations:'disabled'});
  // Demo identity tools exist only in the collapsible test panel.
  await page.locator('#previewNotice summary').click();
  await page.locator('#activeMember').selectOption('mom');
  assert.equal(await page.locator('[data-note="sample-note"] .ft-heart-status.is-own').count(),1,
    'mom sees own note as a non-clickable status');
  assert.equal(await page.locator('[data-moment="sample-growth"] .ft-story-heart').count(),1,
    'mom can send a heart on the child’s record');
  await page.locator('#activeMember').selectOption('kid');
  await page.locator('#previewNotice summary').click();
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
  // Legacy preview content may have no photo. Do not synthesize a green
  // placeholder or mismatch another family's illustrated demo entry.
  await page.evaluate(()=>{
    localStorage.setItem('kaixin_family_tree_public_preview_v1',JSON.stringify({
      version:1,
      moments:[{id:'legacy-breakfast',author:'mom',day:'2026-11-10',category:'together',
        text:'我们一起做了美味的早餐，开心极了！',createdAt:'2026-11-10T09:00:00.000Z'}],
      notes:[],replies:[]
    }));
  });
  await page.reload();
  const textOnly=page.locator('.ft-story-item:not([data-art])').first();
  await textOnly.waitFor();
  assert.equal(await textOnly.locator('.ft-story-stamp').isVisible(),false,
    'text-only entry must not show a fabricated placeholder image');
  const widths=await textOnly.evaluate(el=>({
    card:el.getBoundingClientRect().width,
    row:el.querySelector('.ft-story-row').getBoundingClientRect().width,
    copy:el.querySelector('.ft-paper-copy').getBoundingClientRect().width
  }));
  assert.ok(widths.copy>widths.card*.72,'text-only entry should use available card width: '+JSON.stringify(widths));
  const excerpt=await page.locator('.ft-tree-tag span').first().innerText();
  assert.ok(Array.from(excerpt).length<=13,'hanging note excerpt is short enough: '+excerpt);
  assert.match(await page.locator('.ft-tree-tag').first().getAttribute('aria-label'),/美味的早餐/);
  await page.screenshot({path:'/tmp/family-tree-hifi-390-text-only.png',animations:'disabled'});
  assert.deepEqual(errors,[],'no browser page errors');
  console.log('PASS family-tree hifi 390 layout & working controls',JSON.stringify(dims));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
