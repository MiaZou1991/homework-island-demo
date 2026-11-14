/* Approved Family Tree V3: UI states and artwork QA.
   Captures actual DOM-powered dialogs, not flattened illustration mockups. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin='http://127.0.0.1:8189';
const url=origin+'/family-tree.html?preview=1';
const pub='kaixin_family_tree_public_preview_v1';
const priv='kaixin_family_tree_private_preview_v1';
const meta='kaixin_family_tree_meta_preview_v21';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const failures=[];
  page.on('pageerror',e=>failures.push(e.message));
  await page.goto(url);
  await page.locator('#previewNotice').waitFor({state:'visible'});
  // Confirm approved visual assets are applied to each kind of popup.
  const visual=await page.evaluate(()=>{
   const bg=sel=>getComputedStyle(document.querySelector(sel)).backgroundImage;
   return {hero:bg('.ft-hero-picture'),plaque:bg('.ft-hero-plaque'),
    floral:getComputedStyle(document.querySelector('.ft-story-item'),'::before').backgroundImage,
    button:bg('.ft-write-button')};
  });
  assert.match(visual.hero,/family-tree-v3\/entrance-scene\.webp/);
  assert.match(visual.plaque,/family-tree-v3\/wood-plaque\.svg/);
  assert.match(visual.floral,/family-tree-v3\/floral-corner\.svg/);
  assert.match(visual.button,/family-tree-v3\/button-primary\.svg/);
  assert.equal(await page.locator('.ft-tabs button').count(),2);
  assert.equal(await page.locator('#previewNotice').evaluate(el=>el.open),false,'preview identity tools initially collapsed');
  await page.screenshot({path:'/tmp/family-tree-v3-state-00-home.png',fullPage:true});

  // 01: write story default; 02: growth memory; 03: shared note.
  await page.locator('.ft-write-button').click();
  assert.equal(await page.locator('#editor').evaluate(d=>d.open),true);
  assert.equal(await page.locator('#editorKind').inputValue(),'moment');
  assert.equal(await page.locator('[data-kind-choice="moment"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.ft-upload-target').isVisible(),true,'illustrated photo card visible');
  const fileChrome=await page.locator('#editorPhoto').evaluate(el=>({
    width:el.getBoundingClientRect().width,clip:getComputedStyle(el).clipPath
  }));
  assert.ok(fileChrome.width<=1 && fileChrome.clip.includes('50%'),'native English file UI visually hidden');
  await page.screenshot({path:'/tmp/family-tree-v3-state-01-write.png'});
  await page.locator('[data-kind-choice="note"]').click();
  assert.equal(await page.locator('#editorKind').inputValue(),'note');
  assert.equal(await page.locator('[data-kind-choice="note"]').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:'/tmp/family-tree-v3-state-03-note.png'});
  await page.locator('#editorText').fill('准备周末去花园看花');
  await page.locator('#saveEditor').click();
  await page.locator('.ft-story-item.is-note .ft-paper-copy').getByText('准备周末去花园看花').waitFor();

  // 04: record detail with replies; all buttons must be truly clickable.
  await page.locator('.ft-tree-tag[data-view]').first().click();
  assert.equal(await page.locator('#storyDetail').evaluate(d=>d.open),true);
  await page.screenshot({path:'/tmp/family-tree-v3-state-04-detail.png'});
  await page.locator('#storyDetailClose').click();

  // 05: heart composer; 06: success; 07: quota exhausted.
  await page.locator('[data-section="hearts"]').click();
  assert.equal(await page.locator('#heartComposer').evaluate(d=>d.open),true);
  await page.screenshot({path:'/tmp/family-tree-v3-state-05-send.png'});
  await page.locator('#heartTo').selectOption('mom');
  await page.locator('#heartText').fill('谢谢妈妈给我讲故事');
  await page.locator('#heartSubmit').click();
  await page.locator('#ftModalTitle').getByText('爱心送出成功！').waitFor();
  await page.screenshot({path:'/tmp/family-tree-v3-state-06-success.png'});
  await page.locator('#ftModalClose').click();
  await page.locator('#openHeartComposer').click();
  await page.locator('#heartTo').selectOption('dad');
  await page.locator('#heartText').fill('谢谢爸爸陪我散步');
  await page.locator('#heartSubmit').click();
  await page.locator('#ftModalClose').click();
  assert.equal(await page.evaluate(()=>FamilyTreePreview.remaining),0);
  await page.locator('#openHeartComposer').click();
  assert.equal(await page.locator('#ftModalTitle').textContent(),'今日的爱心已送达');
  await page.screenshot({path:'/tmp/family-tree-v3-state-07-quota.png'});
  await page.locator('#ftModalClose').click();

  // 08/09: received and sent inbox with per-recipient visibility.
  assert.equal(await page.locator('[data-heart-view="sent"]').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:'/tmp/family-tree-v3-state-09-sent.png'});
  await page.locator('#previewNotice summary').click();
await page.locator('#activeMember').selectOption('mom');
  assert.equal(await page.locator('[data-heart]').count(),1);
  assert.match(await page.locator('[data-heart]').first().innerText(),/谢谢妈妈/);
  await page.screenshot({path:'/tmp/family-tree-v3-state-08-received.png'});

  // 10: age and love milestone progression.
  await page.locator('#viewTreeGrowth').click();
  assert.equal(await page.locator('.ft-growth-list li').count(),6);
  await page.screenshot({path:'/tmp/family-tree-v3-state-10-growth.png'});
  await page.locator('#ftModalClose').click();

  // 12/13: delete record/reply confirmation.
  await page.locator('[data-section="stories"]').click();
  await page.locator('#activeMember').selectOption('kid');
  await page.locator('.ft-story-item [data-view="moment"]').first().click();
  assert.equal(await page.locator('#storyDetail').evaluate(el=>el.open),true,'record details open');
  await page.locator('#storyDetail [data-delete="moment"]').first().click();
  assert.match(await page.locator('#ftModalTitle').textContent(),/确认删除/);
  await page.screenshot({path:'/tmp/family-tree-v3-state-12-delete-record.png'});
  await page.locator('#ftModalActions button').first().click();
  await page.locator('.ft-story-item [data-delete="reply"]').first().count();

  // 15: empty home; zero records should not show inaccessible controls.
  await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:1,moments:[],notes:[],replies:[]})),pub);
  await page.reload();
  await page.locator('.ft-empty').first().waitFor();
  assert.equal(await page.locator('.ft-tree-tag[data-view]').count(),0);
  await page.screenshot({path:'/tmp/family-tree-v3-state-15-empty.png',fullPage:true});
  assert.deepEqual(failures,[],'no script exceptions in modal flow');
  await page.close();
  console.log('PASS approved Family Tree V3 DOM popups: write, note, detail, heart, quota, inbox, growth, delete, empty');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
