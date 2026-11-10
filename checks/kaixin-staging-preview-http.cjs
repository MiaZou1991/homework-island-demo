// Fails closed: Supabase's shared-domain Edge Functions CANNOT render HTML.
// Verify the abandoned staging preview stays HTTP 410 and cannot capture
// email/password in an accidental login form. No production network requests.
const assert=require('node:assert/strict');
const url='https://tgnznizqhheiwgdhvwdc.supabase.co/functions/v1/kaixin-onboarding-preview/';
(async()=>{
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
  for(const method of ['GET','HEAD','POST']){
   const response=await fetch(url,{method,redirect:'manual',signal:ctrl.signal});
   assert.equal(response.status,410,'Unsupported Edge HTML host must stay disabled');
   assert.match(response.headers.get('cache-control')||'',/no-store/i);
   assert.match(response.headers.get('content-type')||'',/text\/plain/i);
   if(method==='GET'){
    const body=await response.text();
    assert.ok(body.includes('disabled'));
    assert.ok(!body.includes('<form')&&!body.includes('type="password"'));
   }
  }
  console.log('PASS KAIXIN stage-only Edge HTML experiment disabled safely with 410; frontend requires a separate approved HTTPS static host');
 }finally{clearTimeout(timer);}
})().catch(e=>{
 console.error('STAGING_PREVIEW_NOT_SAFELY_DISABLED '+String(e?.message||'unknown').replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,100));
 process.exitCode=1;
});
