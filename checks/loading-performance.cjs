// Run only against the optimized Pages artifact, not the original dist/ assets.
// This verifies that a cold child visit uses the approved compressed font and
// does not regress to the 12.5 MB TrueType or the hidden legacy rendering path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.join(__dirname, '..');
const built = path.join(base, 'build', 'pages');
const load = relative => fs.readFileSync(path.join(base, relative), 'utf8');
const size = relative => fs.statSync(path.join(built, relative)).size;
const childHTML = load('dist/child.html');
const app = load('dist/app.js');
const upgrade = load('dist/upgrade.js');
const core = load('dist/demo-core.js');
const css = fs.readFileSync(path.join(built, 'child-dialogs.css'), 'utf8');

assert.match(app, /if \(!window\.__ISLAND_UPGRADE_LOADED__\) renderChild\(\)/);
assert.match(app, /island-family-data-updated/);
assert.match(upgrade, /window\.__ISLAND_UPGRADE_LOADED__=true/);
assert.match(upgrade, /window\.addEventListener\('island-family-data-updated'/);
assert.match(core, /if\(needsSave\)localStorage\.setItem\(DEMO_KEY,JSON\.stringify\(d\)\)/);
assert.match(childHTML, /<link rel="preload" as="image" href="assets\/hd\/today-island-reference-v1\.webp">/);
assert.match(childHTML, /island-loader-art[\s\S]*?today-island-reference-v1\.webp/);
assert.match(css, /chill-ui\.woff2/);
assert.match(css, /chill\.woff2/);
assert.match(css, /unicode-range:/);
assert.doesNotMatch(css, /chill\.ttf'\) format\('truetype'\)/);
const oldBytes = size('assets/font-candidates/chill.ttf');
const uiBytes = size('assets/font-candidates/chill-ui.woff2');
const fullBytes = size('assets/font-candidates/chill.woff2');
assert(uiBytes < fullBytes && fullBytes < oldBytes);
console.log('Fonts:', {oldBytes, uiBytes, fullBytes,
  firstScreenReduction: (100 * (1 - uiBytes / oldBytes)).toFixed(1) + '%'});

(async () => {
  const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}, deviceScaleFactor:2});
    const errors = [];
    const resourceUrls = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => resourceUrls.push(req.url()));
    await page.goto('http://127.0.0.1:8190/child.html?preview=1', {waitUntil:'domcontentloaded'});
    await page.locator('#island-loader').waitFor({state:'detached',timeout:20000});
    await page.evaluate(async () => {
      await document.fonts.load('500 13px IslandRound', '今天的安排');
    });
    assert.equal(await page.locator('.up-nav [data-up]').count(), 3,
      'approved three-tab navigation must remain intact');
    assert.equal(await page.locator('#upgrade-root[data-route="today"]').count(), 1);
    assert(!resourceUrls.some(u=>/\/chill\.ttf(?:\?|$)/.test(u)),
      'published child page must not download the 12.5 MB original TTF');
    assert(resourceUrls.some(u=>u.includes('chill-ui.woff2')),
      'the UI-only compressed font should be loaded');
    await page.locator('.up-nav [data-up="plan"]').click();
    await page.locator('#upgrade-root[data-route="plan"]').waitFor();
    const planNav=await page.evaluate(()=>{
      const nav=document.querySelector('.up-nav'),phone=document.querySelector('.phone');
      const rect=nav.getBoundingClientRect(),pr=phone.getBoundingClientRect();
      return {rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height,bottom:rect.bottom},
        phone:{top:pr.top,bottom:pr.bottom,height:pr.height},
        position:getComputedStyle(nav).position,bottom:getComputedStyle(nav).bottom,
        transform:getComputedStyle(nav).transform,contain:getComputedStyle(phone).contain,
        containerType:getComputedStyle(phone).containerType,
        scrollY,innerHeight,visualHeight:window.visualViewport?.height};
    });
    console.log('P0 plan nav viewport diagnosis:',JSON.stringify(planNav));
    assert.ok(planNav.rect.y>=-1 && planNav.rect.bottom<=planNav.innerHeight+2,
      'plan tab must remain in visible viewport after route switch');
    await page.locator('.up-nav [data-up="today"]').click();
    await page.locator('#upgrade-root[data-route="today"]').waitFor();
    assert.deepEqual(errors, [], 'cold load and route switches must be error-free');
    console.log('PASS built child cold load, compressed font and visible tab switches');
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
