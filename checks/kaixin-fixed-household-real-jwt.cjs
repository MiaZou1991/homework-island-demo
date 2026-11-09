// KAIXIN-only identity pairing: real Supabase Auth/JWT and HTTP on isolated staging.
// Never logs JWT, pairing tokens or full response payloads. No production access.
// A staging administrator manually enrols the freshly-created QA parent and
// QA outsider into synthetic households; never self-claims a real household.
const assert=require('node:assert/strict');
const STAGE='https://tgnznizqhheiwgdhvwdc.supabase.co';
const KEY=process.env.KAIXIN_STAGE_PUBLIC_KEY;
if(!KEY?.startsWith('sb_publishable_')){console.error('BLOCKED: staging public key missing');process.exit(2);}
const users={};
const slots=['parent','child','outsider','other_child'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(path,body=null,accessToken='') {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try {
  const response=await fetch(STAGE+path,{
   method:body===null?'GET':'POST',
   headers:{apikey:KEY,'Content-Type':'application/json',
    ...(accessToken?{Authorization:'Bearer '+accessToken}:{})},
   body:body===null?undefined:JSON.stringify(body),signal:controller.signal
  });
  let json={};try{json=await response.json()}catch(_){}
  return{status:response.status,ok:response.ok,data:json};
 }finally{clearTimeout(timer);}
}
async function register(slot){
 const response=await request('/auth/v1/signup',{
  data:{kaixin_qa_suite:'kaixin_one_family_20261110',kaixin_qa_slot:slot},
  gotrue_meta_security:{captcha_token:null}
 });
 if(!response.ok||!response.data?.access_token||!response.data?.user?.id)throw Error('auth_registration_'+slot+'_status_'+response.status);
 const session={id:response.data.user.id,token:response.data.access_token};
 const checked=await request('/auth/v1/user',null,session.token);
 assert.equal(checked.status,200,'JWT must represent real Auth user');
 assert.equal(checked.data?.id,session.id);
 users[slot]=session;
 console.log('STAGING_QA_AUTH role='+slot+' id='+session.id); // synthetic UUID only
}
async function rpc(role,name,body={}){
 const token=role?users[role].token:'';
 const r=await request('/rest/v1/rpc/'+name,body,token);
 if(!r.ok && ![401,403].includes(r.status))throw Error('unexpected_http_'+name+'_'+r.status);
 return r;
}
function failure(result,kind){
 assert.equal(result.data?.ok,false,'expected business refusal');
 assert.equal(result.data?.error,kind,'wrong denial classification');
}
async function main(){
 for(const slot of slots)await register(slot);
 console.log('STAGING_QA_PARENT_ENROLLMENT_REQUIRED; no email/phone credentials exposed');
 let admitted=false;
 for(let n=0;n<180;n++){
  const result=await rpc('parent','kaixin_identity');
  if(result.data?.ok===true && result.data.role==='parent'){admitted=true;break;}
  await sleep(2000);
 }
 if(!admitted)throw Error('parent_identity_not_enrolled');
 console.log('STAGING_QA_PARENT_ENROLLED');
 const report=[];function pass(name,category){report.push({check:name,outcome:'PASS',category});}
 let result=await rpc(null,'kaixin_identity');assert.equal(result.status,401);pass('anonymous_http_denied','security');
 result=await rpc('outsider','kaixin_identity');failure(result,'unauthorized');pass('other_household_no_kaixin_identity','security');
 result=await rpc('child','kaixin_identity');failure(result,'unauthorized');pass('unbound_child_rejected','security');
 result=await rpc('child','kaixin_create_child_invite');failure(result,'unauthorized');pass('child_cannot_issue_invite','security');
 result=await rpc('outsider','kaixin_create_child_invite');failure(result,'unauthorized');pass('other_household_cannot_issue_invite','security');

 const first=await rpc('parent','kaixin_create_child_invite');
 assert.equal(first.data?.ok,true);assert.match(first.data.token,/^[0-9a-f]{64}$/);
 assert.ok(new Date(first.data.expires_at).getTime()>Date.now());
 pass('parent_issues_expiring_invite','invite');
 const second=await rpc('parent','kaixin_create_child_invite');
 assert.equal(second.data?.ok,true);assert.notEqual(second.data.token,first.data.token);
 pass('new_invite_revokes_old','invite');
 result=await rpc('child','kaixin_redeem_child_invite',{p_token:first.data.token});
 failure(result,'invalid_invite');pass('revoked_token_cannot_bind','security');
 result=await rpc('child','kaixin_redeem_child_invite',{p_token:'f'.repeat(64)});
 failure(result,'invalid_invite');pass('invented_token_cannot_bind','security');
 result=await rpc('outsider','kaixin_redeem_child_invite',{p_token:second.data.token});
 failure(result,'already_bound');pass('already_other_household_cannot_switch','security');

 result=await rpc('child','kaixin_redeem_child_invite',{p_token:second.data.token});
 assert.equal(result.data?.ok,true);assert.equal(result.data.role,'child');pass('child_device_pairing_succeeds','functional');
 result=await rpc('child','kaixin_identity');
 assert.equal(result.data?.role,'child');assert.equal(result.data?.family,'KAIXIN');pass('child_identity_confirmed','functional');
 result=await rpc('other_child','kaixin_redeem_child_invite',{p_token:second.data.token});
 failure(result,'invalid_invite');pass('same_token_cannot_pair_second_device','security');
 result=await rpc('child','kaixin_create_child_invite');failure(result,'unauthorized');
 pass('bound_child_cannot_create_invites','security');
 result=await rpc('child','kaixin_revoke_child_device',{p_user_id:users.parent.id});
 failure(result,'unauthorized');pass('child_cannot_revoke_parent','security');
 result=await rpc('parent','kaixin_revoke_child_device',{p_user_id:users.parent.id});
 assert.equal(result.data?.revoked,false);pass('parent_cannot_revoke_parent','security');
 result=await rpc('parent','kaixin_revoke_child_device',{p_user_id:users.child.id});
 assert.equal(result.data?.revoked,true);pass('parent_revokes_child_device','functional');
 result=await rpc('child','kaixin_identity');failure(result,'unauthorized');
 pass('revoked_child_loses_access','security');

 // After revocation the JWT still exists, but no KAIXIN family data is visible.
 result=await rpc('child','family_load_v2',{p_family_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 failure(result,'unauthorized');pass('revoked_child_cannot_read_family_data','security');

 console.log(JSON.stringify({test:'KAIXIN_SINGLE_FAMILY_REAL_JWT_HTTP',result:'PASS',
   passCount:report.length,checks:report,note:'Staging synthetic UUIDs, not a live parent email login or physical iPhone'}));
}
main().catch(e=>{
 console.error('KAIXIN_STAGING_BINDING_FAILED '+String(e?.message||'unknown').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,120));
 process.exitCode=1;
});
