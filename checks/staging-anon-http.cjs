// Stage-only real HTTP anonymous access smoke tests. No credentials or family data.
// Only the TEST Supabase ref is allowed. This script never writes actual family records.
const assert=require('node:assert/strict');
const url='https://tgnznizqhheiwgdhvwdc.supabase.co';
const key=process.env.KAIXIN_STAGE_PUBLIC_KEY;
if(!key||(!key.startsWith('sb_publishable_')&&!key.startsWith('eyJ'))) {
 console.error('BLOCKED: missing staging publishable key; no HTTP calls made');
 process.exit(2);
}
const family='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // synthetic staging family
const requests=[
 ['anon_load_v2','POST','/rest/v1/rpc/family_load_v2',{p_family_id:family}],
 ['anon_save_v2','POST','/rest/v1/rpc/family_save_v2',{p_family_id:family,p_payload:{homework:[{id:'qa-unauthorized'}]},p_expected_revision:1,p_operation_id:'10000000-0000-4000-8000-000000000001'}],
 ['anon_direct_family_read','GET','/rest/v1/family_cloud_data_v2?select=revision&limit=1'],
 ['anon_signal_read','GET','/rest/v1/kaixin_sync_signal_v2?select=revision&limit=1']
];
(async()=>{
 const report={environment:'ISOLATED_STAGING_HTTP_ONLY',checks:[]};
 for(const [name,method,path,body] of requests){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
   let res;
   try{
     res=await fetch(url+path,{method,headers:{apikey:key,'Content-Type':'application/json'},
       body:body?JSON.stringify(body):undefined,signal:controller.signal});
     // HTTP 200 with false OK is also a legitimate deliberate denial by guarded RPC,
     // but cannot count a leaked payload as safe.
     const obj=await res.json().catch(()=>({}));
     const denied=!res.ok||(obj&&obj.ok===false&&obj.error==='unauthorized');
     assert.equal(denied,true,name+' unexpectedly allowed access');
     if(Array.isArray(obj))assert.equal(obj.length,0,name+' leaked rows');
     else assert.equal(obj?.payload,undefined,name+' leaked family content');
     report.checks.push({name,status:res.status,denied:true});
   } finally {clearTimeout(timer)}
 }
 // Read-only Auth provider capability check. No signup, no PII and no secret output.
 const settingsResponse=await fetch(url+'/auth/v1/settings',{headers:{apikey:key}});
 const settings=await settingsResponse.json().catch(()=>({}));
 report.authCapabilities={
   settingsHttpStatus:settingsResponse.status,
   anonymousProviderEnabled:!!(settings.external?.anonymous || settings.external?.anonymous_signup || settings.enable_anonymous_sign_ins),
   emailAutoConfirm:!!settings.mailer_autoconfirm
 };
 console.log(JSON.stringify({...report,conclusion:'PASS'},null,2));
})().catch(e=>{console.error('FAILED '+String(e?.message||'unknown').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,120));process.exitCode=1});
