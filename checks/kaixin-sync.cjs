const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../dist/cloud-sync.js','utf8');
async function test(fail=false){
const old={homework:[],points:0},remote={homework:[{id:'historic'}],points:777,unknown:{keep:true},rewardsUnlocked:['rabbit']};
const store=new Map([['data',JSON.stringify(old)],['homework_island_family_code_v1','WRONG']]);let writes=0;
const c={document:{hidden:false,addEventListener(){}},navigator:{onLine:true},window:{addEventListener(){},dispatchEvent(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},activeStorageKey:()=> 'data',Event:class{},CustomEvent:class{},console:{warn(){}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,AbortController,fetch:async(url,o)=>{const body=JSON.parse(o.body);assert.equal(body.p_family_code,'KAIXIN');if(fail)throw Error('offline');if(url.endsWith('family_save'))writes++;return{ok:true,json:async()=>({ok:true,exists:true,payload:remote})}}};
vm.runInNewContext(source,c);await c.window.IslandSync.start();assert.equal(writes,0);assert.equal(c.window.IslandSync.getCode(),'KAIXIN');
if(!fail){assert.deepEqual(JSON.parse(store.get('data')),remote);assert.deepEqual(JSON.parse(store.get('homework_island_before_kaixin_repair_v1')),old)}else{await assert.rejects(c.window.IslandSync.push(old));assert.deepEqual(JSON.parse(store.get('data')),old)}
}
(async()=>{await test();await test(true);console.log('PASS fixed family, full payload restore, local backup and failed-read write protection')})();
