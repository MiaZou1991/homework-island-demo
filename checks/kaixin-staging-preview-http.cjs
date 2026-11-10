// Verifies the independent staging HTTPS landing and read-only asset host.
// Runs from CI. No Auth credentials, parent email, child data or production calls.
const assert=require('node:assert/strict');
const base='https://tgnznizqhheiwgdhvwdc.supabase.co/functions/v1/kaixin-onboarding-preview/';
const timeout=15000;
async function check(name,url,init={}) {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try {
  const res=await fetch(url,{...init,signal:controller.signal,redirect:'manual'});
  return res;
 }finally {clearTimeout(timer);}
}
(async()=>{
 const htmlResponse=await check('page',base);
 assert.equal(htmlResponse.status,200,'staging HTML should load anonymously');
 assert.match(htmlResponse.headers.get('content-type')||'',/text\/html/i);
 assert.match(htmlResponse.headers.get('cache-control')||'',/no-store/i);
 assert.match(htmlResponse.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
 assert.match(htmlResponse.headers.get('x-robots-tag')||'',/noindex/);
 const html=await htmlResponse.text();
 assert.ok(html.includes('KAIXIN 家庭'));
 assert.ok(html.includes('仅连接独立测试项目'));
 assert.ok(html.includes('@supabase/supabase-js@2.119.0'));
 assert.ok(!html.includes('syqcpfjudjniripzcjdq'),'production URL must not be included');
 for(const [suffix,fragment] of [
  ['kaixin-staging-onboarding-flow.js','KaixinStagingOnboarding'],
  ['kaixin-staging-onboarding-ui.js','kaixin_staging_auth_preview_v1']
 ]) {
  const r=await check('asset',base+suffix);
  assert.equal(r.status,200,'staging script '+suffix+' missing');
  assert.match(r.headers.get('content-type')||'',/(java|ecma)script/);
  const js=await r.text();
  assert.ok(js.includes(fragment));
  assert.ok(!js.includes('syqcpfjudjniripzcjdq'),'production database must not appear');
 }
 const post=await check('post-blocked',base,{method:'POST'});
 assert.equal(post.status,405,'static staging function must not process POST');
 const notfound=await check('unknown-path',base+'not-a-valid-script');
 assert.equal(notfound.status,404);
 const jsdelivr=await check('pinned-sdk','https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js',{method:'HEAD'});
 assert.equal(jsdelivr.status,200,'pinned browser SDK CDN asset missing');
 console.log('PASS KAIXIN staging HTTPS static UI: GET page/assets 200, security headers, no production URL, non-GET blocked, pinned Supabase JS served');
})().catch(error=>{
 // Do not print raw response content, tokens or request payloads.
 console.error('STAGING_PREVIEW_CHECK_FAILED '+String(error?.message||'unknown').replace(/[^a-zA-Z0-9_. -]/g,'').slice(0,120));
 process.exitCode=1;
});
