const assert=require('node:assert/strict');
const qa=require('../dist/kaixin-staging-onboarding-flow.js');
assert.equal(qa.family,'KAIXIN');
let role=null,user=null,deviceList=[],invites=0,signups=0,loginCount=0,logoutCount=0,childCreated=0,revokeCount=0;
const calls=[],token='f'.repeat(64);
const client={
 auth:{
  async getUser(){return {data:{user},error:null};},
  async signUp({email,password,options}){
   signups++;assert.equal(email,'parent@example.test');assert.equal(password,'TEST_PASSWORD_ONLY');
   assert.equal(options?.emailRedirectTo,'https://qa-preview.example.test/kaixin-staging-onboarding.html');
   return {data:{user:{id:'11111111-1111-4111-8111-111111111111'},session:null},error:null};
  },
  async signInWithPassword({email,password}){
   loginCount++;assert.equal(email,'parent@example.test');assert.equal(password,'TEST_PASSWORD_ONLY');
   user={id:'11111111-1111-4111-8111-111111111111',is_anonymous:false};
   return {data:{user},error:null};
  },
  async signInAnonymously(){
   childCreated++;
   user={id:'22222222-2222-4222-8222-222222222222',is_anonymous:true};
   return{data:{user},error:null};
  },
  async signOut(){logoutCount++;user=null;role=null;return {error:null};}
 },
 async rpc(name,args){
  calls.push({name,args});
  if(name==='kaixin_identity') {
   if(!role)return{data:{ok:false,error:'unauthorized'},error:null};
   return{data:{ok:true,family:'KAIXIN',role},error:null};
  }
  if(name==='kaixin_create_child_invite'){
   assert.equal(role,'parent');
   invites++;return{data:{ok:true,token,expires_at:'2026-11-11T09:00:00Z'},error:null};
  }
  if(name==='kaixin_redeem_child_invite'){
   assert.equal(args.p_token,token);assert.equal(role,null);
   role='child';return{data:{ok:true,family:'KAIXIN',role:'child'},error:null};
  }
  if(name==='kaixin_list_child_devices') {
   return{data:{ok:true,family:'KAIXIN',devices:deviceList},error:null};
  }
  if(name==='kaixin_revoke_child_device'){
   assert.equal(args.p_user_id,'22222222-2222-4222-8222-222222222222');
   revokeCount++;return{data:{ok:true,revoked:true},error:null};
  }
  throw Error('unexpected remote RPC '+name);
 }
};
(async()=>{
 const flow=qa.create(client,{redirectTo:'https://qa-preview.example.test/kaixin-staging-onboarding.html'});
 assert.deepEqual(await flow.current(),{kind:'signed_out'});
 const registered=await flow.signupParent(' parent@example.test ','TEST_PASSWORD_ONLY');
 assert.equal(registered.kind,'verification_required');
 await assert.rejects(qa.create(client).signupParent('parent@example.test','TEST_PASSWORD_ONLY'),e=>e.code==='verified_https_redirect_required');
 await assert.rejects(qa.create(client,{redirectTo:'http://localhost:3000/'}).signupParent('parent@example.test','TEST_PASSWORD_ONLY'),e=>e.code==='verified_https_redirect_required');
 assert.equal(signups,1);assert.deepEqual(await flow.current(),{kind:'signed_out'},'Signup must not create parent authorization');
 let state=await flow.loginParent(' parent@example.test ','TEST_PASSWORD_ONLY');
 assert.equal(loginCount,1);assert.equal(state.kind,'unbound');
 assert.equal(state.anonymous,false,'verified account pending admin enrollment');
 await assert.rejects(flow.createInvite(),e=>e.code==='parent_only');
 await assert.rejects(flow.createGuest(),e=>e.code==='sign_out_before_new_device');
 role='parent';state=await flow.current();assert.equal(state.kind,'parent');
 assert.equal(state.userId,'11111111-1111-4111-8111-111111111111');
 const invite=await flow.createInvite();
 assert.equal(invite.token,token);assert.equal(invites,1);
 deviceList=[{id:'22222222-2222-4222-8222-222222222222'}];
 assert.deepEqual(await flow.childDevices(),deviceList);
 assert.equal(await flow.revokeDevice(deviceList[0].id),true);
 assert.equal(revokeCount,1);
 await assert.rejects(flow.revokeDevice('bad-id'),e=>e.code==='invalid_device_id');
 assert.deepEqual(await flow.logout(),{kind:'signed_out'});
 assert.equal(logoutCount,1);
 state=await flow.createGuest();assert.equal(state.kind,'unbound');
 assert.equal(state.anonymous,true);
 assert.equal(childCreated,1);
 await assert.rejects(flow.childDevices(),e=>e.code==='parent_only');
 await assert.rejects(flow.redeemInvite('KAIXIN'),e=>e.code==='invalid_invite');
 await assert.rejects(flow.redeemInvite('a'.repeat(63)),e=>e.code==='invalid_invite');
 const bound=await flow.redeemInvite(' '+token+' ');
 assert.equal(bound.kind,'child');assert.equal(bound.anonymous,true);
 await assert.rejects(flow.redeemInvite(token),e=>e.code==='need_unbound_child_session');
 await assert.rejects(flow.createInvite(),e=>e.code==='parent_only');
 assert.deepEqual(await flow.logout(),{kind:'signed_out'});
 // Role must come from server RPC, NEVER from user-editable metadata.
 user={id:'33333333-3333-4333-8333-333333333333',is_anonymous:false,
   user_metadata:{member_role:'parent',family:'KAIXIN'}};
 const forged=await flow.current();
 assert.equal(forged.kind,'unbound');
 role='child';
 assert.equal((await flow.current()).kind,'child');
 const rpcNames=calls.map(x=>x.name);
 assert.ok(rpcNames.every(x=>x.startsWith('kaixin_')&&x!=='kaixin_create_family'&&x!=='kaixin_switch_family'));
 assert.equal(JSON.stringify(calls).includes('family_id'),false,'family UUID must never be chosen by client');
 assert.throws(()=>qa.create({auth:{}}),/missing_supabase_client/);
 console.log('PASS KAIXIN onboarding flow: email signup cannot self-claim parent, live server role only, 1 child, device list/revoke, anonymous pairing, secret shape, no family switching');
})().catch(e=>{console.error(e);process.exitCode=1});
