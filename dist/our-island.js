(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('world');
  const ctx = canvas.getContext('2d');
  const W = 1536, H = 1024;
  const SPAWN = Object.freeze({x: 768, y: 925});
  // The family tree is rooted in the circular flower bed at the heart of the garden.
  // Leave the garden walkway and central island paths clear for walking.
  const tree = Object.freeze({x: 322, y: 473});

  // Landing points are on the walkable stone paths, not inside buildings/flowerbeds.
  const areas = Object.freeze([
    {id: 'pier', title: '码头', x: 768, y: 910, radius: 130, focus: '50% 100%',
      action: '逛逛码头', intro: '沿着木栈桥来到小岛，海风轻轻吹过，这里是每次冒险的起点。',
      later: '钓鱼和码头布置将在后续阶段加入。'},
    {id: 'garden', title: '花园', x: 540, y: 525, radius: 120, focus: '18% 50%',
      action: '走进花园', intro: '花园里有鲜花、长椅和一条被阳光照亮的小路。',
      later: '下一阶段会接入花朵与装饰物的收藏、摆放。'},
    {id: 'tree', title: '家庭树', x: 432, y: 490, radius: 115, focus: '22% 50%',
      action: '看看家庭树', intro: '一棵陪着我们长大的树，把家庭里温暖的时光留在这里。',
      later: '家庭便签、成长记录和爱心互动将在后续阶段接入。'},
    {id: 'treehouse', title: '森林书屋', x: 766, y: 340, radius: 119, focus: '50% 5%',
      action: '走进森林书屋', intro: '顺着石阶往上走，花丛和瀑布旁藏着一间安静的森林书屋。',
      later: '书屋内部布置和阅读收藏将在后续阶段开放。'},
    {id: 'house', title: '我的小屋', x: 1182, y: 475, radius: 127, focus: '100% 42%',
      action: '走进我的小屋', intro: '蓝色屋顶的小屋就在花丛旁，这里是属于我们的温暖角落。',
      later: '小屋家具布置会在后续阶段与已有收藏连接。'}
  ]);
  const byId = Object.fromEntries(areas.map(area => [area.id, area]));

  // raw.githack is for code preview only. Its image gateway can be unreliable on
  // mobile, so for this public demo reuse the identical published image files.
  // Normal production and local preview continue loading relative assets.
  const PREVIEW_HOST = /(^|\.)githack\.com$/i.test(location.hostname);
  const PUBLIC_ASSETS = 'https://miazou1991.github.io/homework-island-demo/';
  function sourceFor(path) {
    return PREVIEW_HOST ? new URL(path, PUBLIC_ASSETS).href : path;
  }
  function configurePreviewArtwork() {
    if (!PREVIEW_HOST) return;
    $('detailMap').src = sourceFor('assets/our-island-v1/map.webp');
    $('detailTree').src = sourceFor('assets/our-island-v1/tree.webp');
    $('detailKid').style.backgroundImage = 'url("' + sourceFor('assets/our-island-v1/girl.webp') + '")';
    const rules = document.createElement('style');
    const img = name => 'url("' + sourceFor('assets/hd/dialogs-v3/' + name + '.webp') + '")';
    rules.textContent =
      '#toolbar h1,#detailTitle{background-image:' + img('plaque') + '!important}' +
      '#visit,#back{background-image:' + img('button-primary') + '!important}' +
      '#mapPanel,.detail-copy{border-image-source:' + img('panel') + '!important}';
    document.head.append(rules);
  }

  // Walkable polygons match the pier, central square and three outgoing paths
  // on the approved map illustration. Movement is blocked at shore/flowers.
  const polygons = [
    [[692,817],[850,817],[956,1010],[556,1010]],
    // Overlap adjacent paths by 15-30px; touching edges alone leaves impassable seams.
    [[687,817],[850,817],[835,600],[665,600]],
    [[515,465],[598,421],[918,421],[1017,476],[1000,560],[902,617],[650,617],[530,564]],
    [[718,450],[816,450],[800,290],[733,290]],
    [[970,486],[1115,467],[1258,436],[1280,465],[1135,515],[970,550]],
    [[555,487],[445,470],[409,447],[368,471],[445,521],[555,540]]
  ];
  const state = {x: SPAWN.x, y: SPAWN.y, dir: 0, overview: false, ready: false, near: null};
  const keys = new Set(), axis = {x: 0, y: 0}, images = {};
  let pointer = null, last = 0, frame = 0, vw = 0, vh = 0, scale = 1;
  let camera = {x: 0, y: 0}, loadingAttempt = 0, lastHint = '';

  function inside(x, y, poly) {
    let contained = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) &&
          x < ((b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) contained = !contained;
    }
    return contained;
  }
  function walkable(x, y) {
    return polygons.some(poly => inside(x, y, poly)) &&
      Math.hypot((x - tree.x) / 1.3, y - tree.y) > 32;
  }
  function stop() {
    keys.clear(); axis.x = 0; axis.y = 0; pointer = null;
    $('knob').style.transform = '';
  }
  function nearestLandmark() {
    return areas
      .filter(area => Math.hypot(state.x - area.x, state.y - area.y) <= area.radius)
      .sort((a, b) => Math.hypot(state.x - a.x, state.y - a.y) -
                      Math.hypot(state.x - b.x, state.y - b.y))[0] || null;
  }
  function setHint(message) {
    if (lastHint !== message) {
      $('hint').textContent = message;
      lastHint = message;
    }
  }
  function syncNearby(message) {
    const area = !state.overview && state.ready ? nearestLandmark() : null;
    state.near = area ? area.id : null;
    const visit = $('visit');
    visit.hidden = !area;
    if (area) {
      visit.textContent = area.action;
      visit.dataset.place = area.id;
    } else {
      delete visit.dataset.place;
    }
    if (message) setHint(message);
    else if (state.overview) setHint('选一个地点快速抵达，或者收起地图继续漫步');
    else if (area) setHint('你来到' + area.title + '附近啦');
    else setHint('沿着石头小路走，还能发现更多地方');
  }
  function cameraTarget() {
    if (state.overview) return {x: (W - vw / scale) / 2, y: (H - vh / scale) / 2};
    return {
      x: Math.max(0, Math.min(W - vw / scale, state.x - vw / scale / 2)),
      y: Math.max(0, Math.min(H - vh / scale, state.y - vh / scale * .62))
    };
  }
  function snapCamera() { camera = cameraTarget(); }
  function resize() {
    vw = canvas.clientWidth; vh = canvas.clientHeight;
    if (!(vw > 0 && vh > 0)) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * d); canvas.height = Math.round(vh * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    scale = state.overview ? Math.min(vw / W, vh / H) : Math.max(vw / W, vh / H, .9);
    snapCamera();
  }
  function drawPerson(time, moving) {
    const col = state.dir % 4 + (moving ? Math.floor(time / 190) % 2 : 0);
    const row = state.dir >= 4 ? 1 : 0;
    const image = images.girl, iw = image.width / 4, ih = image.height / 2;
    ctx.save();
    ctx.fillStyle = '#57432238';
    ctx.beginPath(); ctx.ellipse(state.x, state.y - 2, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(image, col * iw, row * ih, iw, ih, state.x - 50, state.y - 124, 100, 133);
    ctx.restore();
  }
  function drawMarkers() {
    for (const area of areas) {
      const pos = area.id === 'tree' ? {x: 330, y: 468} : {x: area.x, y: area.y - 24};
      ctx.fillStyle = '#fff5d7';
      ctx.strokeStyle = '#769b66';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 29, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#416c4a';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold 41px "PingFang SC",system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 7; ctx.strokeStyle = '#fff9e8';
      ctx.strokeText(area.title, pos.x, pos.y - 48);
      ctx.fillStyle = '#5e452b'; ctx.fillText(area.title, pos.x, pos.y - 48);
    }
  }
  function paint(time, moving) {
    if (!vw || !vh) return;
    ctx.clearRect(0, 0, vw, vh);
    ctx.save(); ctx.scale(scale, scale); ctx.translate(-camera.x, -camera.y);
    ctx.drawImage(images.map, 0, 0, W, H);
    if (state.y < tree.y) drawPerson(time, moving);
    ctx.drawImage(images.tree, tree.x - 53, tree.y - 158, 106, 162);
    if (state.y >= tree.y) drawPerson(time, moving);
    if (state.overview) drawMarkers();
    ctx.restore();
  }
  function tick(time) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min((time - last) / 1000 || 0, .035);
    last = time;
    if (!state.ready) return;
    const active = !$('detail').open && !$('treeExperience').open && !state.overview && !document.hidden;
    let dx = active ? axis.x + Number(keys.has('ArrowRight') || keys.has('d')) -
                  Number(keys.has('ArrowLeft') || keys.has('a')) : 0;
    let dy = active ? axis.y + Number(keys.has('ArrowDown') || keys.has('s')) -
                  Number(keys.has('ArrowUp') || keys.has('w')) : 0;
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }
    if (length > 0 && active) {
      state.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 4 : 6) : (dy < 0 ? 0 : 2);
      const nx = state.x + dx * 155 * dt, ny = state.y + dy * 155 * dt;
      if (walkable(nx, state.y)) state.x = nx;
      if (walkable(state.x, ny)) state.y = ny;
    }
    const target = cameraTarget();
    const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
    const ease = reduced ? 1 : 1 - Math.exp(-dt * 9);
    camera.x += (target.x - camera.x) * ease;
    camera.y += (target.y - camera.y) * ease;
    paint(time, length > 0 && active);
    syncNearby();
  }
  function toggleMap(force) {
    stop();
    state.overview = typeof force === 'boolean' ? force : !state.overview;
    $('island').classList.toggle('is-map', state.overview);
    $('mapPanel').hidden = !state.overview;
    $('mapToggle').textContent = state.overview ? '继续漫步' : '看看地图';
    $('mapToggle').setAttribute('aria-expanded', String(state.overview));
    resize();
    syncNearby();
  }
  function goTo(id) {
    const place = byId[id];
    if (!state.ready || !place || !walkable(place.x, place.y)) return false;
    stop();
    state.x = place.x; state.y = place.y;
    state.dir = id === 'treehouse' ? 0 : 2;
    if (state.overview) toggleMap(false);
    snapCamera();
    syncNearby('已经来到' + place.title + '附近，点下方按钮可以进去看看');
    return true;
  }
  function openDetail(id) {
    const place = byId[id];
    if (!state.ready || !place || state.overview || $('detail').open) return false;
    // The canvas visit action cannot enter an area from across the island.
    if (Math.hypot(state.x - place.x, state.y - place.y) > place.radius) return false;
    stop();
    $('detailTitle').textContent = place.id === 'tree' ? '我们的家庭树' : place.title;
    $('detailDescription').textContent = place.intro;
    $('detailFuture').textContent = place.later;
    $('detailMap').style.objectPosition = place.focus;
    $('detailScene').dataset.place = place.id;
    $('detailTree').hidden = place.id !== 'tree';
    $('detailKid').hidden = place.id !== 'tree';
    $('treeEnter').hidden = place.id !== 'tree';
    const stageBadge=$('treePreviewState');
    stageBadge.hidden=true;
    if(place.id==='tree'){
      try{
        const summary=JSON.parse(localStorage.getItem('kaixin_family_tree_aggregate_preview_v21')||'null');
        if(summary&&Number.isInteger(summary.stage)&&summary.stage>=0&&summary.stage<=5){
          const stageNames=['初芽树','幼树','成长树','开花树','繁盛树','家庭大树'];
          const n=Number(summary.count)||0;
          stageBadge.textContent='🌱 '+stageNames[summary.stage]+' · 家人累计 '+Math.max(0,Math.floor(n))+' 颗爱心（体验数据）';
          stageBadge.hidden=false;
        }
      }catch(_){}
    }
    $('detail').showModal();
    $('back').focus();
    return true;
  }
  function closeDetail() { if ($('detail').open) $('detail').close(); }
  $('visit').addEventListener('click', () => { if (state.near) openDetail(state.near); });
  $('back').addEventListener('click', closeDetail);
  $('detailClose').addEventListener('click', closeDetail);
  $('treeEnter').addEventListener('click', () => {
    closeDetail();stop();
    const frame = $('treeFrame');
    if(!frame.getAttribute('src'))frame.src=frame.dataset.src;
    $('treeExperience').showModal();$('treeClose').focus();
  });
  function closeFamilyTree(){if($('treeExperience').open)$('treeExperience').close();}
  $('treeClose').addEventListener('click', closeFamilyTree);
  $('treeExperience').addEventListener('close',()=>{stop();syncNearby();if(!$('visit').hidden)$('visit').focus();});
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==$('treeFrame').contentWindow)return;
    if(event.data?.type==='kaixin-family-tree-close')closeFamilyTree();
  });
  $('detail').addEventListener('close', () => {
    stop(); syncNearby(); if (!$('visit').hidden) $('visit').focus(); else $('mapToggle').focus();
  });
  $('mapToggle').addEventListener('click', () => toggleMap());
  $('keepWalking').addEventListener('click', () => { toggleMap(false); $('mapToggle').focus(); });
  $('mapPanel').addEventListener('click', event => {
    const button = event.target.closest('button[data-go]');
    if (button && goTo(button.dataset.go) && !$('visit').hidden) $('visit').focus();
  });
  $('home').addEventListener('click', () => goTo('pier'));

  const stick = $('stick');
  stick.addEventListener('pointerdown', event => {
    if (pointer !== null || !state.ready || state.overview || $('detail').open) return;
    pointer = event.pointerId; stick.setPointerCapture(pointer); moveStick(event);
  });
  function moveStick(event) {
    if (event.pointerId !== pointer) return;
    const rect = stick.getBoundingClientRect();
    let x = event.clientX - rect.left - rect.width / 2;
    let y = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(x, y), factor = Math.min(length, 36) / (length || 1);
    x *= factor; y *= factor;
    axis.x = length < 9 ? 0 : x / 36;
    axis.y = length < 9 ? 0 : y / 36;
    $('knob').style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }
  stick.addEventListener('pointermove', moveStick);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, stop);
  window.addEventListener('keydown', event => {
    if ($('detail').open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'Escape' && state.overview) { toggleMap(false); return; }
    if (!state.overview && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(event.key)) {
      event.preventDefault(); keys.add(event.key);
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.key));
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', stop);
  window.addEventListener('pagehide', () => { stop(); cancelAnimationFrame(frame); frame = 0; });
  window.addEventListener('pageshow', () => {
    if (state.ready && !frame) { last = 0; frame = requestAnimationFrame(tick); }
  });
  new ResizeObserver(resize).observe(canvas);

  async function loadIsland() {
    const attempt = ++loadingAttempt, loading = $('loading');
    loading.hidden = false;
    const sources = {
      map: 'assets/our-island-v1/map.webp',
      girl: 'assets/our-island-v1/girl.webp',
      tree: 'assets/our-island-v1/tree.webp'
    };
    let completed = Object.keys(sources).filter(name => images[name]).length;
    loading.textContent = '正在加载小岛画面 ' + completed + '/3…';
    try {
      await Promise.all(Object.entries(sources).map(([name, src]) =>
        images[name] ? Promise.resolve() : new Promise((resolve, reject) => {
          const img = new Image();
          let finished = false;
          // A slow image CDN is not a broken island. Allow more time, and use
          // the published asset host directly for third-party HTML previews.
          const timer = setTimeout(() => finish(new Error('timeout')), 30000);
          function finish(error) {
            if (finished) return;
            finished = true; clearTimeout(timer); img.onload = img.onerror = null;
            if (error) { img.src = ''; reject(error); return; }
            if (attempt === loadingAttempt) {
              images[name] = img; completed += 1;
              loading.textContent = '正在加载小岛画面 ' + completed + '/3…';
            }
            resolve();
          }
          img.onload = () => finish();
          img.onerror = () => finish(new Error('image'));
          img.src = sourceFor(src);
        })
      ));
      if (attempt !== loadingAttempt) return;
      state.ready = true; resize(); loading.hidden = true;
      syncNearby();
      if (!frame) { last = 0; frame = requestAnimationFrame(tick); }
    } catch (_) {
      if (attempt !== loadingAttempt) return;
      loadingAttempt++;
      const panel = document.createElement('div');
      const message = document.createElement('p');
      const retry = document.createElement('button');
      const back = document.createElement('a');
      message.textContent = '小岛画面没有加载成功，但家庭记录不会改变。';
      retry.type = 'button'; retry.textContent = '重新加载'; retry.addEventListener('click', loadIsland);
      back.textContent = '返回今日任务'; back.href = 'child.html';
      panel.append(message, retry, document.createElement('br'), back);
      loading.replaceChildren(panel);
    }
  }

  // Read-only testing surface. This scene never touches homework or cloud data.
  window.IslandWalk = {state, tree, areas, polygons, walkable, nearestLandmark, goTo, openDetail, toggleMap, stop, sourceFor};
  configurePreviewArtwork();
  loadIsland();
})();
