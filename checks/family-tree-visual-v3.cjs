const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8189/';
(async()=>{
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  for(const width of [320,375,390,430]){
    const page=await browser.newPage({viewport:{width,height:820},deviceScaleFactor:width===390?3:2,isMobile:true,hasTouch:true});
    const pageErrors=[];
    page.on('pageerror',e=>pageErrors.push(e.message));
    const brokenImages=[];
    page.on('response',r=>{
      if(r.url().includes('/assets/family-tree-v3/')&&r.status()>=400)brokenImages.push(r.url());
    });
    await page.goto(base+'family-tree.html?preview=1');
    await page.locator('#previewNotice').waitFor({state:'visible'});
    const skin=await page.evaluate(()=>{
      const main=getComputedStyle(document.querySelector('.ft-hero-picture'));
      return {bg:main.backgroundImage,hero:document.querySelector('.ft-hero').getBoundingClientRect().toJSON(),
        tabCount:document.querySelectorAll('.ft-tabs button').length,
        title:document.querySelector('.ft-hero-plaque h1').innerText};
    });
    assert.equal(skin.title,'家庭树');
    assert.equal(skin.tabCount,2);
    assert.ok(skin.bg.includes('/assets/family-tree-v3/garden-hero.webp'),width+': approved flowerbed painting');
    assert.equal(brokenImages.length,0,width+': all approved images load');
    const art=await page.request.get(base+'assets/family-tree-v3/garden-hero.webp');
    assert.equal(art.status(),200,'approved image available');
    assert.match(art.headers()['content-type']||'',/image\/webp/);
    const dimensions=await page.evaluate(async()=>{
      const image=new Image();image.src='assets/family-tree-v3/garden-hero.webp';
      await image.decode();return [image.naturalWidth,image.naturalHeight];
    });
    assert.ok(dimensions[0]>=350&&dimensions[1]>=430,width+': high resolution approved scene');

    const geometry=await page.evaluate(()=>{
      const rect=x=>document.querySelector(x).getBoundingClientRect();
      const a=rect('.ft-tree-tags'), b=rect('.ft-growth-summary'), hero=rect('.ft-hero');
      return {
        left:a.toJSON(),right:b.toJSON(),hero:hero.toJSON(),
        sw:document.documentElement.scrollWidth,iw:innerWidth
      };
    });
    assert.ok(geometry.left.right<=geometry.right.left+2,
      width+': hanging notes do not overlap growth board');
    assert.ok(geometry.left.bottom<=geometry.hero.bottom+2 &&
      geometry.right.bottom<=geometry.hero.bottom+2,
      width+': elements stay inside painted scene');
    assert.ok(geometry.sw<=geometry.iw+1,width+': no horizontal overflow');

    await page.locator('.ft-write-button').click();
    await page.locator('#editor').waitFor({state:'visible'});
    const titleStyle=await page.locator('#editorTitle').evaluate(el=>getComputedStyle(el).backgroundImage);
    assert.ok(titleStyle.includes('wood-plaque.svg'),width+': approved scalable wooden title asset');
    await page.locator('#cancelEditor').click();
    await page.locator('[data-section="hearts"]').click();
    await page.locator('#heartComposer').waitFor({state:'visible'});
    assert.equal(await page.locator('#heartSubmit').isVisible(),true);
    await page.locator('#heartCancel').click();
    await page.screenshot({path:'/tmp/family-tree-v3-'+width+'.png',fullPage:true});
    assert.deepEqual(pageErrors,[],width+': no JS exceptions');
    await page.close();
    console.log('PASS approved family-tree V3 visual',width);
  }
  const page=await browser.newPage({viewport:{width:390,height:780}});
  await page.goto(base+'our-island.html?preview=1');
  await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
  await page.locator('#mapToggle').click();
  await page.locator('[data-go="tree"]').click();
  await page.locator('#visit').click();
  assert.equal(await page.locator('#detailScene').getAttribute('data-place'),'tree');
  assert.equal(await page.locator('#detailTree').isVisible(),false);
  assert.ok((await page.locator('#detailScene').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('family-tree-v3/entrance-scene.webp'));
  await page.locator('#treeEnter').click();
  await page.frameLocator('#treeFrame').locator('.ft-tabs').waitFor();
  await page.locator('#treeClose').click();
  assert.equal(await page.locator('#treeExperience').evaluate(el=>el.open),false);
  await page.close();
  console.log('PASS garden portal uses integrated family tree art');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
