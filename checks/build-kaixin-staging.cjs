#!/usr/bin/env node
/* Build complete, visually identical KAIXIN V2 staging site from main's dist/.
 * Never writes dist/, main or production Pages; cannot deploy by itself.
 * Both HTML entrypoints keep all original DOM/design except for staging-only
 * Supabase Auth gates and replacing insecure KAIXIN-code snapshot syncing.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..');
const source=path.join(base,'dist');
const target=path.resolve(base,process.argv[2]||'build/kaixin-staging');
assert.ok(target.startsWith(path.join(base,'build')+path.sep),'output must be build/ only');
assert.ok(fs.existsSync(path.join(source,'child.html'))&&fs.existsSync(path.join(source,'parent.html')));
fs.rmSync(target,{recursive:true,force:true});
fs.mkdirSync(target,{recursive:true});
fs.cpSync(source,target,{recursive:true});
function read(file){return fs.readFileSync(path.join(target,file),'utf8');}
function write(file,s){fs.writeFileSync(path.join(target,file),s);}
const blocked=['cloud-sync.js','realtime-signal.js','family-access.js'];
for(const filename of blocked)fs.rmSync(path.join(target,filename),{force:true});
const stageTag='<script>window.__KAIXIN_STAGE_BUILD__=true;document.documentElement.classList.add("kaixin-stage-gated");</script>';
// Fetch remote SDK asynchronously so a slow CDN cannot hold DOMContentLoaded
// or the island's initial visual render hostage. The auth gate awaits readiness.
const sdk='<script>window.__kaixinStageSdkReady=new Promise(function(resolve,reject){window.__kaixinStageSdkResolve=resolve;window.__kaixinStageSdkReject=reject})</script>'+
 '<script async src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js" onload="window.__kaixinStageSdkResolve()" onerror="window.__kaixinStageSdkReject(new Error(\'sdk_load_failed\'))"></script>';
const gateCss='<style>html.kaixin-stage-gated .phone{visibility:hidden!important;pointer-events:none!important}</style>';
for(const page of ['child.html','parent.html']){
 let s=read(page);
 const inline=/\<script\s+src="cloud-sync\.js\?[^"]+"\>\<\/script\>/;
 const family=/\<script\s+src="family-access\.js\?[^"]+"\>\<\/script\>/;
 const signal=/\<script\s+src="realtime-signal\.js\?[^"]+"\>\<\/script\>/;
 assert.match(s,inline,'main script must explicitly load legacy cloud-sync');
 assert.match(s,family,'main script must explicitly load legacy family-access');
 assert.match(s,signal,'main script must explicitly load legacy realtime');
 s=s.replace('app.js?v=20261110-performance1','app.js?v=20261111-parent-refresh1');
 s=s.replace(inline,[
  '<script src="kaixin-stage-auth.js?v=20261111-bootperf1"></script>',
  '<script src="v2-operation-engine.js"></script>',
  '<script src="kaixin-stage-sync.js?v=20261111-single-state1"></script>'
 ].join('\n'));
 s=s.replace(family,'<!-- STAGING: role-based Auth gate replaces insecure family code / math puzzle -->');
 s=s.replace(signal,'<!-- STAGING: no unauthenticated legacy realtime subscription -->');
 // Preserve the original CSS cascade, while reducing ten blocking stylesheet
 // requests to one on the child and three to one on the parent. CSS remains in
 // the site root, so all relative asset URLs retain their meaning.
 const sheetPattern=/<link\s+rel="stylesheet"\s+href="([^"]+\.css)(?:\?[^"]*)?"\s*\/?\s*>/g;
 const sheets=[...s.matchAll(sheetPattern)];
 assert.ok(sheets.length>=(page==='child.html'?10:3),'unexpected stylesheet topology');
 const bundle='kaixin-stage-'+(page==='child.html'?'child':'parent')+'.css';
 const contents=sheets.map((m,i)=>'/* original '+m[1]+' '+i+' */\n'+read(m[1])).join('\n');
 write(bundle,contents);
 let firstSheet=true;
 s=s.replace(sheetPattern,()=>{if(firstSheet){firstSheet=false;return '<link rel="stylesheet" href="'+bundle+'?v=20261111-perf-css1">';}return '';});
 s=s.replace('</head>',sdk+'\n'+gateCss+'\n'+stageTag+'\n</head>');
 s=s.replace(/<title>([^<]+)<\/title>/,(_,title)=>'<title>'+title+' · KAIXIN V2 独立测试</title>');
 // Persistent visual banner, covers only 10px at top, rest of the original UI intact.
 s=s.replace(/<body([^>]*)>/,(_all,attrs)=>'<body'+attrs+'><div id="kaixin-stage-badge" style="position:fixed;top:env(safe-area-inset-top, 0px);left:8px;z-index:800000;background:#fff4d8;border:1px solid #deb96e;border-radius:0 0 9px 9px;padding:2px 8px;font:11px system-ui;color:#75562c">KAIXIN V2 · 隔离测试</div>');
 if(page==='parent.html'){
  const dataNote='<div id="kaixin-stage-data-note" role="note" style="position:fixed;top:36px;left:12px;right:12px;max-width:480px;margin:0 auto;z-index:800001;border:1px solid #c8aa64;border-radius:14px;background:#fff9e5;color:#684e32;padding:11px 42px 11px 14px;font:13px/1.5 system-ui;box-shadow:0 4px 14px #0002">这里是独立 V2 测试库，不含正式开心岛历史作业。开发测试记录可能没有作业日期，因此不会显示在今日任务中。请新建一条模拟作业进行测试。<button type="button" aria-label="关闭测试提示" style="position:absolute;right:8px;top:7px;padding:3px 8px;border:0;border-radius:8px;background:#e3d1a9;color:#5c432a;font-size:20px" onclick="this.parentElement.remove()">×</button></div>';
  s=s.replace(/<body([^>]*)>/,(_all,attrs)=>'<body'+attrs+'>'+dataNote);
 }

 if(page==='child.html'){
  // The old 9s watchdog starts while stylesheets and blocking scripts are
  // still downloading. A slow iPhone was falsely labelled a failed island.
  // Preserve a genuine recovery link after 30s, and show a non-fatal status
  // after 9s instead of turning a slow boot into an error.
  const watchdog='},9000)})();</script>';
  assert.ok(s.includes(watchdog),'child startup watchdog changed');
  s=s.replace(watchdog,'},30000)})();</script>');
  const loaderTag='<h1 class="island-loader-title">小岛正在醒来</h1>';
  assert.ok(s.includes(loaderTag),'child startup loader changed');
  s=s.replace(loaderTag,loaderTag+'<script>setTimeout(function(){var el=document.getElementById("island-loader");if(el&&!el.classList.contains("is-ready")){var note=el.querySelector(".island-loader-sub");if(note)note.textContent="正在连接小岛，网络较慢时可能需要多一点时间…"}},9000)</script>');
  // Loaded after upgrade.js/child-dialogs.js so their legacy completion callbacks
  // are overridden only in the isolated child page, never on production.
  assert.ok(s.includes('</body>'),'staging child page has no closing body');
  s=s.replace('</body>','<script src="kaixin-stage-child-actions.js?v=20261110-child-v2a"></script>\n</body>');
 }
 write(page,s);
}
let demo=read('demo-core.js');
const familyMarker="const FAMILY_CODE=ISLAND_PREVIEW?'PREVIEW':'KAIXIN';";
assert.ok(demo.includes(familyMarker),'demo-core family fixture changed - review required');
demo=demo.replace(familyMarker,"const FAMILY_CODE=ISLAND_PREVIEW?'PREVIEW':'KAIXIN_STAGE_QA';");
const migration="if(!d&&!ISLAND_PREVIEW&&FAMILY_CODE&&!localStorage.getItem('homework_island_family_migrated_v1'))";
assert.ok(demo.includes(migration),'legacy migration changed - fail closed');
demo=demo.replace(migration,"if(false&&!d&&!ISLAND_PREVIEW&&FAMILY_CODE&&!localStorage.getItem('homework_island_family_migrated_v1'))");
write('demo-core.js',demo);
const sourceHub=read('kaixin-staging-onboarding.html');
const links='<section aria-label="进入完整页面测试"><h2>打开全量 KAIXIN 测试版</h2><p class="help">只有已经获得测试角色授权的账号才可以访问。家长和孩子请使用不同的浏览器或设备。</p><div class="stack"><a href="./parent.html" style="color:#38834c;font-weight:bold">家长端完整页面</a><a href="./child.html" style="color:#38834c;font-weight:bold">儿童端完整页面</a></div></section>';
assert.ok(sourceHub.includes('<div id="feedback"'));
assert.ok(sourceHub.includes('id="reset-password"'),'staging login must offer recovery');
assert.ok(sourceHub.includes('id="password-help"'),'staging signup must explain 8-char requirement');
assert.ok(sourceHub.includes('历史开发测试记录'),'device history must be explained');
const onboardingUI=read('kaixin-staging-onboarding-ui.js');
assert.ok(onboardingUI.includes('HISTORICAL_QA_IDS')&&onboardingUI.includes('设备识别码'),'new devices must be separated and identifiable');
assert.ok(!/id="password"[^>]*minlength="8"/.test(sourceHub),'existing six-char password must not be blocked at login');
const authFlow=read('kaixin-staging-onboarding-flow.js');
assert.ok(authFlow.includes('resetPasswordForEmail') && authFlow.includes('updateUser({password})'),'password recovery must be implemented');
write('index.html',sourceHub.replace('<div id="feedback"',links+'\n<div id="feedback"'));
write('manifest.json',JSON.stringify({name:'KAIXIN V2 独立测试',short_name:'KAIXIN TEST',start_url:'./index.html',display:'standalone',background_color:'#f6f3e9',theme_color:'#a1c994'},null,2));
write('KAIXIN_STAGE_NOT_PRODUCTION.txt',[
 'KAIXIN V2 单家庭独立测试包',
 'DO NOT deploy on the existing production GitHub Pages project.',
 'Backend: https://tgnznizqhheiwgdhvwdc.supabase.co (synthetic data only)',
 'Password/email onboarding requires HTTPS hosting plus Auth Redirect URL allowlist.',
 'Child-side writes are deliberately blocked until safe operation API is verified.',
 'Do not import any real family backups into this staging site.',
 'Original UI and assets: snapshot of main; legacy cloud-sync/family-code scripts removed.'
].join('\n')+'\n');
const prohibited=['syqcpfjudjniripzcjdq','homework_island_family_code_v1'];
const violations=[];
function walk(folder){
 for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  const abs=path.join(folder,entry.name);
  if(entry.isDirectory())walk(abs);
  else if(/\.(?:js|html|css|json|mjs)$/i.test(entry.name)){
   const str=fs.readFileSync(abs,'utf8');
   for(const marker of prohibited)if(str.includes(marker))violations.push(path.relative(target,abs)+':'+marker);
  }
 }
}
walk(target);
assert.deepEqual(violations,[],'staging build must not include production endpoint/family-code credential');
for(const page of ['child.html','parent.html']){
 const s=read(page);
 assert.ok(s.includes('kaixin-stage-sync.js'));
 if(page==='child.html')assert.ok(s.includes('kaixin-stage-child-actions.js'));
 assert.ok(!s.includes('src="cloud-sync.js')&&!s.includes('src="family-access.js')&&!s.includes('src="realtime-signal.js'));
}
console.log('PASS KAIXIN staging build, isolated Auth/CAS, identical original pages and assets; no production endpoint or family-code gate');
console.log('OUTPUT '+target);
