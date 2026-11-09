/* KAIXIN private household V2 identity client. Not loaded by production pages.
 * Exactly one household and one child's profile. Parents enrol one child device
 * with an expiring invitation; there is no create-family/switch-family API.
 * Delegates long-lived Auth token persistence/refresh to official Supabase client.
 */
(() => {
  'use strict';
  function issue(code) { const error=new Error(code);error.code=code;return error; }
  function create({supabaseClient,onEvent}={}) {
    if (!supabaseClient || typeof supabaseClient.rpc !== 'function')
      throw issue('auth_client_required');
    const emit=(name,metadata={})=>{
      // No invite token, access/refresh token, real names or homework content.
      try { onEvent?.({name,at:Date.now(),...metadata}); } catch (_) {}
    };
    async function call(name,parameters) {
      let reply;
      try { reply=await supabaseClient.rpc(name,parameters); }
      catch (_) { emit('rpc_network_error',{method:name}); throw issue('network_failure'); }
      if(reply?.error) {
        const code=reply.error.status===401||reply.error.status===403
          ? 'unauthorized':'rpc_failed';
        emit('rpc_error',{method:name,code});
        throw issue(code);
      }
      const data=reply?.data;
      if(!data || data.ok!==true) {
        const code=['unauthorized','invalid_invite','already_bound'].includes(data?.error)
          ? data.error:'rpc_rejected';
        emit('rpc_rejected',{method:name,code});
        throw issue(code);
      }
      return data;
    }
    async function whoAmI() {
      const data=await call('kaixin_identity');
      if(data.family!=='KAIXIN'||!['parent','child'].includes(data.role))throw issue('invalid_identity');
      emit('identity_confirmed',{role:data.role});
      return {family:'KAIXIN',role:data.role};
    }
    async function createChildInvite() {
      const current=await whoAmI();
      if(current.role!=='parent')throw issue('parent_required');
      const data=await call('kaixin_create_child_invite');
      if(!/^[0-9a-f]{64}$/.test(data.token||''))throw issue('invalid_invite_response');
      emit('child_invite_created',{expiresAt:String(data.expires_at)});
      // Caller displays once; do not save in URL, logs, analytics or localStorage.
      return {token:data.token,expiresAt:data.expires_at};
    }
    async function redeemChildInvite(code) {
      if(typeof code!=='string'||!/^[0-9a-f]{64}$/.test(code.trim()))
        throw issue('invalid_invite');
      const data=await call('kaixin_redeem_child_invite',{p_token:code.trim()});
      if(data.family!=='KAIXIN'||data.role!=='child')throw issue('invalid_identity');
      emit('child_device_bound');
      return {family:'KAIXIN',role:'child'};
    }
    async function revokeChildDevice(authUserId) {
      const current=await whoAmI();
      if(current.role!=='parent')throw issue('parent_required');
      if(typeof authUserId!=='string'
        || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(authUserId))
        throw issue('invalid_device_id');
      const data=await call('kaixin_revoke_child_device',{p_user_id:authUserId});
      emit('child_device_revoked',{revoked:!!data.revoked});
      return !!data.revoked;
    }
    return Object.freeze({whoAmI,createChildInvite,redeemChildInvite,revokeChildDevice});
  }
  const api=Object.freeze({create,family:'KAIXIN'});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.KaixinFamilyBinding=api;
})();
