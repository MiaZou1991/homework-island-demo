// Stage 1: real-browser, isolated island walkthrough. No family storage/sync is loaded.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = 'http://127.0.0.1:8189/our-island.html';
const places = [
  ['pier', '码头'], ['garden', '花园'], ['tree', '我们的家庭树'],
  ['treehouse', '森林书屋'], ['house', '我的小屋']
];

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    for (const width of [320, 375, 390, 430]) {
      const page = await browser.newPage({
        viewport: {width, height: 690},
        deviceScaleFactor: width === 390 ? 3 : 2,
        isMobile: true, hasTouch: true
      });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.locator('#loading').waitFor({state: 'hidden', timeout: 25000});
      assert.equal(await page.evaluate(() => IslandWalk.state.ready), true, width + ': map loads');
      assert.equal(await page.evaluate(() => IslandWalk.areas.length), 5, 'five landmarks');
      assert.equal(await page.evaluate(() => IslandWalk.walkable(768, 910)), true, 'pier traversable');
      assert.equal(await page.evaluate(() => IslandWalk.walkable(40, 40)), false, 'sea blocked');
      assert.equal(await page.locator('#visit').isVisible(), true, 'pier action on arrival');

      // Regression: the old map had a 3px dead gap between the pier and
      // central plaza plus a tree-trunk collider straight across the route.
      // Check EVERY 1px along the entire northbound path; no jumping gaps.
      const blockedY = await page.evaluate(() => {
        const ys = [];
        for (let y = 910; y >= 340; y--) {
          if (!IslandWalk.walkable(768, y)) ys.push(y);
        }
        return ys;
      });
      assert.deepEqual(blockedY, [], width + ': uninterrupted pier-to-treehouse path');
      if (width === 320) {
        // At 2px increments the old path polygons were in separate reachable
        // components; ensure ALL five regions can be reached by actual steps.
        const connectivity = await page.evaluate(() => {
          const step = 2, key = (x,y) => x + ',' + y;
          const start = [Math.round(768/step), Math.round(910/step)];
          const queue = [start], seen = new Set([key(...start)]);
          for (let index = 0; index < queue.length; index++) {
            const [x,y] = queue[index];
            for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
              const nx=x+dx, ny=y+dy, id=key(nx,ny);
              if (!seen.has(id) && IslandWalk.walkable(nx*step,ny*step)) {
                seen.add(id);
                queue.push([nx,ny]);
              }
            }
          }
          return IslandWalk.areas.map(area => ({
            id:area.id,
            reachable:seen.has(key(Math.round(area.x/step),Math.round(area.y/step)))
          }));
        });
        assert.ok(connectivity.every(item => item.reachable),
          'continuous pedestrian routes for every landmark: ' + JSON.stringify(connectivity));
      }

      await page.locator('#mapToggle').click();
      assert.equal(await page.locator('#mapToggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#mapPanel').isVisible(), true);
      assert.equal(await page.locator('#stick').isVisible(), false, 'joystick hidden in map');

      for (const [id, title] of places) {
        if (!(await page.locator('#mapPanel').isVisible())) await page.locator('#mapToggle').click();
        await page.locator('#mapPanel button[data-go="' + id + '"]').click();
        assert.equal(await page.evaluate(() => IslandWalk.state.overview), false, id + ': map closes');
        assert.equal(await page.evaluate(() => IslandWalk.state.near), id, id + ': valid landing');
        assert.equal(await page.evaluate(() => IslandWalk.walkable(IslandWalk.state.x, IslandWalk.state.y)),
          true, id + ': position on path');
        const before = await page.evaluate(() => ({x: IslandWalk.state.x, y: IslandWalk.state.y}));
        await page.locator('#visit').click();
        assert.equal(await page.locator('#detail').evaluate(dialog => dialog.open), true, id + ': enters');
        assert.equal(await page.locator('#detailTitle').textContent(), title, id + ': scene title');
        assert.equal(await page.locator('#detailMap').evaluate(img => img.complete && img.naturalWidth > 0),
          true, id + ': scene illustration loads');
        if (id === 'tree') assert.equal(await page.locator('#detailTree').isVisible(), true);
        await page.locator('#back').click();
        assert.equal(await page.locator('#detail').evaluate(dialog => dialog.open), false, id + ': returns');
        assert.deepEqual(await page.evaluate(() => ({x: IslandWalk.state.x, y: IslandWalk.state.y})),
          before, id + ': keeps location');
      }

      // No teleport: physically walk from the pier, past the family tree, to
      // the forest bookhouse using a single held direction (same as joystick).
      await page.locator('#home').click();
      assert.equal(await page.evaluate(() => IslandWalk.state.y), 910);
      await page.keyboard.down('ArrowUp');
      try {
        await page.waitForFunction(() => IslandWalk.state.y < 380, null, {timeout: 12000});
      } finally {
        await page.keyboard.up('ArrowUp');
      }
      assert.ok(await page.evaluate(() => IslandWalk.state.y < 380),
        width + ': walks beyond family tree to forest bookhouse without teleport');
      assert.equal(await page.evaluate(() => IslandWalk.walkable(IslandWalk.state.x, IslandWalk.state.y)),
        true, 'movement remains on path');

      await page.locator('#mapToggle').click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#mapPanel').isVisible(), false, 'Escape closes map');
      const bounds = await page.evaluate(() => ({
        viewport: innerWidth, body: document.documentElement.scrollWidth,
        mapButton: document.querySelector('#mapToggle').getBoundingClientRect().right,
        controls: document.querySelector('#home').getBoundingClientRect().right
      }));
      assert.ok(bounds.body <= bounds.viewport + 1, width + ': no horizontal overflow');
      assert.ok(bounds.mapButton <= bounds.viewport + 1 && bounds.controls <= bounds.viewport + 1,
        width + ': controls inside viewport');
      await page.screenshot({path: '/tmp/island-explore-' + width + '.png'});
      assert.deepEqual(errors, [], width + ': no browser exceptions');
      await page.close();
      console.log('PASS island exploration', width, 'px; all five landmarks, return and keyboard movement');
    }

    // A missing scene image must produce an explicit retry and never mutate data.
    const page = await browser.newPage({viewport: {width: 390, height: 690}});
    await page.route('**/assets/our-island-v1/map.webp', route => route.abort());
    await page.goto(base);
    await page.locator('#loading button').waitFor({timeout: 20000});
    assert.match(await page.locator('#loading').innerText(), /记录不会改变/);
    await page.unroute('**/assets/our-island-v1/map.webp');
    await page.locator('#loading button').click();
    await page.locator('#loading').waitFor({state: 'hidden', timeout: 25000});
    assert.equal(await page.evaluate(() => IslandWalk.state.ready), true, 'retry recovers');
    await page.close();
    console.log('PASS map load error and retry');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exit(1);});
