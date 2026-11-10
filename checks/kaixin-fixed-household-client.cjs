const assert = require('node:assert/strict');
const binding=require('../dist/kaixin-family-binding.js');
const token='a'.repeat(64);
assert.equal(binding.family,'KAIXIN');
function client(role='parent') {
 const calls=[],events=[],responses=[];
 const mocked={rpc:async(method,arg)=>{
   calls.push({method,arg});
   if(responses.length)return {data:responses.shift()};
   if(method==='kaixin_identity')return {data:{ok:true,family:'KAIXIN',role}};
   if(method==='kaixin_create_child_invite')return {data:{ok:true,token,expires_at:'2026-11-10T01:00:00Z'}};
   if(method==='kaixin_redeem_child_invite')return {data:{ok:true,family:'KAIXIN',role:'child'}};
   if(method==='kaixin_revoke_child_device')return {data:{ok:true,revoked:true}};
   throw Error('unexpected method '+method);
 }};
 return {instance:binding.create({supabaseClient:mocked,onEvent:e=>events.push(e)}),calls,events,responses};
}
(async()=>{
 const p=client();
 assert.deepEqual(await p.instance.whoAmI(),{family:'KAIXIN',role:'parent'});
 const code=await p.instance.createChildInvite();
 assert.equal(code.token,token);
 assert.equal(code.expiresAt,'2026-11-10T01:00:00Z');
 assert.deepEqual(p.calls.map(x=>x.method),['kaixin_identity','kaixin_identity','kaixin_create_child_invite']);
 assert.ok(p.calls.every(x=>!x.arg||!Object.hasOwn(x.arg,'family_id')),'no family switch parameter may appear');
 const c=client('child');
 assert.deepEqual(await c.instance.redeemChildInvite(' '+token+' '),{family:'KAIXIN',role:'child'});
 assert.equal(c.calls[0].arg.p_token,token);
 await assert.rejects(c.instance.createChildInvite(),e=>e.code==='parent_required');
 await assert.rejects(c.instance.redeemChildInvite('KAIXIN'),e=>e.code==='invalid_invite');
 assert.equal(c.calls.length,2,'invalid token rejected before request');
 const device='12345678-1234-4123-8123-123456789abc';
 assert.equal(await p.instance.revokeChildDevice(device),true);
 assert.deepEqual(p.calls[p.calls.length-1],{method:'kaixin_revoke_child_device',arg:{p_user_id:device}});
 await assert.rejects(p.instance.revokeChildDevice('not-an-uuid'),e=>e.code==='invalid_device_id');
 assert.equal(JSON.stringify(p.events).includes(token),false,'secret must never be logged');
 assert.equal(JSON.stringify(c.events).includes(token),false);
 const strange=client();strange.responses.push({ok:true,family:'ANOTHER',role:'parent'});
 await assert.rejects(strange.instance.whoAmI(),e=>e.code==='invalid_identity');
 const denied=client();denied.responses.push({ok:false,error:'unauthorized'});
 await assert.rejects(denied.instance.whoAmI(),e=>e.code==='unauthorized');
 assert.equal(JSON.stringify(denied.events).includes(token),false);
 const rejected=client();rejected.responses.push({ok:true,family:'KAIXIN',role:'parent'},{ok:false,error:'already_bound'});
 await assert.rejects(rejected.instance.createChildInvite(),e=>e.code==='already_bound');
 assert.throws(()=>binding.create({}),/auth_client_required/);
 console.log('PASS KAIXIN-only binding: parent/child role guard, no household switch, one-time token validation, no secrets in logs, revocation and server errors');
})().catch(e=>{console.error(e);process.exitCode=1});
