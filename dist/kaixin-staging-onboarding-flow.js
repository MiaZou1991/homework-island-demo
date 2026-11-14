/* KAIXIN-only staging onboarding flow.
 * This file is NOT imported by the production child/parent pages.
 * The "KAIXIN" label is not a credential; all access is authorized by
 * Supabase Auth UID + server-side member-role checks.
 */
(function (root, factory) {
  'use strict';
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  if (root) root.KaixinStagingOnboarding=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const CODE=/^[0-9a-f]{64}$/;
  function fail(code) {const error=new Error(code);error.code=code;return error;}
  function create(client,{redirectTo}={}) {
    if (!client?.auth?.getSession || !client?.auth?.getUser || typeof client.rpc!=='function')throw fail('missing_supabase_client');
    async function call(name,args) {
      const {data,error}=await client.rpc(name,args||{});
      if(error)throw fail('server_unavailable');
      if(!data||data.ok!==true)throw fail(['unauthorized','invalid_invite','already_bound'].includes(data?.error)?data.error:'server_rejected');
      return data;
    }
    async function current() {
      // Supabase getUser() returns AuthSessionMissingError when a new child's
      // browser has no session. That is expected, not an authentication failure.
      const sessionResult=await client.auth.getSession();
      if(sessionResult.error)throw fail('session_error');
      if(!sessionResult.data?.session)return {kind:'signed_out'};
      const {data,error}=await client.auth.getUser();
      if(error)throw fail('session_error');
      const user=data?.user;
      if(!user)return {kind:'signed_out'};
      try {
        const result=await call('kaixin_identity');
        if(result.family!=='KAIXIN'||!['parent','child'].includes(result.role))throw fail('invalid_family_identity');
        return {kind:result.role,userId:user.id,anonymous:!!user.is_anonymous};
      }catch(error) {
        if(error.code==='unauthorized')return {kind:'unbound',userId:user.id,
          anonymous:!!user.is_anonymous};
        throw error;
      }
    }
    async function signupParent(email,password) {
      if(!email?.trim()||!password)throw fail('email_and_password_required');
      if(password.length<8)throw fail('signup_password_too_short');
      if(!redirectTo || !/^https:\/\//.test(redirectTo))throw fail('verified_https_redirect_required');
      const {data,error}=await client.auth.signUp({
        email:email.trim(),password,
        options:{emailRedirectTo:redirectTo}
      });
      if(error)throw fail('signup_failed');
      // A successful signup does not grant parent access; an authorized
      // administrator still must enroll the VERIFIED parent Auth UID.
      return {kind:'verification_required',userId:data?.user?.id||null};
    }
    async function requestPasswordReset(email) {
      if(!email?.trim())throw fail('email_required');
      if(!redirectTo || !redirectTo.startsWith('https://'))throw fail('verified_https_redirect_required');
      const {error}=await client.auth.resetPasswordForEmail(email.trim(),{redirectTo});
      if(error)throw fail('password_reset_request_failed');
      return {kind:'reset_requested'};
    }
    async function updatePassword(password) {
      if(typeof password!=='string'||password.length<8)throw fail('signup_password_too_short');
      const {data,error}=await client.auth.getUser();
      if(error||!data?.user)throw fail('password_recovery_session_required');
      const result=await client.auth.updateUser({password});
      if(result.error)throw fail('password_update_failed');
      return {kind:'password_updated'};
    }
    async function loginParent(email,password) {
      if(!email?.trim()||!password)throw fail('email_and_password_required');
      const {error}=await client.auth.signInWithPassword({email:email.trim(),password});
      if(error)throw fail('invalid_credentials');
      return current();
    }
    async function createGuest() {
      const state=await current();
      if(state.kind!=='signed_out')throw fail('sign_out_before_new_device');
      const {error}=await client.auth.signInAnonymously();
      if(error)throw fail('guest_login_failed');
      return current();
    }
    async function createInvite() {
      const identity=await current();
      if(identity.kind!=='parent')throw fail('parent_only');
      const data=await call('kaixin_create_child_invite');
      if(!CODE.test(data.token||''))throw fail('invalid_invite_response');
      return {token:data.token,expiresAt:data.expires_at};
    }
    async function redeemInvite(secret) {
      if(!CODE.test(String(secret||'').trim()))throw fail('invalid_invite');
      const identity=await current();
      if(identity.kind!=='unbound')throw fail('need_unbound_child_session');
      const data=await call('kaixin_redeem_child_invite',{p_token:secret.trim()});
      if(data.family!=='KAIXIN'||data.role!=='child')throw fail('invalid_family_identity');
      return current();
    }
    async function childDevices() {
      const state=await current();
      if(state.kind!=='parent')throw fail('parent_only');
      const data=await call('kaixin_list_child_devices');
      if(!Array.isArray(data.devices)||data.family!=='KAIXIN'
        ||data.devices.some(d=>!UUID.test(d?.id||'')))throw fail('invalid_devices_response');
      return data.devices.map(d=>({id:d.id}));
    }
    async function revokeDevice(userId) {
      if(!UUID.test(String(userId||'')))throw fail('invalid_device_id');
      const state=await current();
      if(state.kind!=='parent')throw fail('parent_only');
      const data=await call('kaixin_revoke_child_device',{p_user_id:userId});
      return !!data.revoked;
    }
    async function logout() {
      const {error}=await client.auth.signOut();
      if(error)throw fail('signout_failed');
      return {kind:'signed_out'};
    }
    return Object.freeze({
      current,signupParent,loginParent,requestPasswordReset,updatePassword,createGuest,createInvite,
      redeemInvite,childDevices,revokeDevice,logout
    });
  }
  return Object.freeze({create,family:'KAIXIN'});
});
