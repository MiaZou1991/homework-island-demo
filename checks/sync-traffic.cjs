const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../dist/cloud-sync.js','utf8');
function setup(status=200){let now=1000000,reads=0,writes=0,next=0;const timers=new Map(),events={},store=new Map();const doc={hidden:false,addEventListener:(n,f)=>events[n]=f};const nav={onLine:true};
const c={document:doc,navigator:nav,Date:{now:()=>now},window:{addEventListener:(n,f)=>events[n]=f,dispatchEvent(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},activeStorageKey:()=> 'data',Event:class{},CustomEvent:class{},AbortController,console:{warn(){}},setTimeout:(fn,delay)=>{timers.set(++next,{fn,at:now+delay});return next},clearTimeout:id=>timers.delete(id),fetch:async(url)=>{url.endsWith('family_load')?reads++:writes++;return{ok:status===200,status,json:async()=>({ok:true,exists:true,payload:{homework:[{id:'old'}],points:8}})}}};vm.runInNewContext(source,c);
return{sync:c.window.IslandSync,doc,nav,events,counts:()=>({reads,writes}),async advance(ms){const until=now+ms;while(true){const entry=[...timers].filter(([id,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;timers.delete(entry[0]);await entry[1].fn();await Promise.resolve();}now=until;},async settle(){for(let i=0;i<15;i++)await Promise.resolve()}}}
(async()=>{
let t=setup();await t.sync.start();await t.advance(3600000);assert.equal(t.counts().reads,61);
t.doc.hidden=true;t.events.visibilitychange();await t.advance(3600000);assert.equal(t.counts().reads,61);
t.doc.hidden=false;t.events.visibilitychange();t.events.focus();await t.settle();assert.equal(t.counts().reads,62);t.events.focus();await t.settle();assert.equal(t.counts().reads,62);
t.nav.onLine=false;t.events.offline();await t.advance(3600000);assert.equal(t.counts().reads,62);t.nav.onLine=true;t.events.online();await t.settle();assert.equal(t.counts().reads,63);
t.sync.schedulePush({homework:[{id:'edited'}]});await t.advance(450);assert.equal(t.counts().writes,1);
t=setup(402);await t.sync.start();await t.advance(29*60000);assert.equal(t.counts().reads,1);await t.advance(60000);assert.equal(t.counts().reads,2);
t=setup(500);await t.sync.start();await t.advance(60000);assert.equal(t.counts().reads,2);await t.advance(60000);assert.equal(t.counts().reads,2);await t.advance(60000);assert.equal(t.counts().reads,3);
console.log('PASS foreground rate, hidden/offline suspension, event deduplication, prompt saves, 402 cooldown and exponential backoff');
})();
