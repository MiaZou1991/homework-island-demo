// Companion v7: exact 16 assets, stable legacy records and transparent format.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'../dist');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/characters/companions-v7.json'),'utf8'));
assert.equal(manifest.version,'v7');
assert.equal(manifest.characters.length,16);
assert.equal(new Set(manifest.characters.map(x=>x.id)).size,16);
const legacy=['🐻','🐰','🐺','🐱','🐶','🐼','🐦','🐿️','🐯','🐴'];
const ids=['bear','rabbit','fox','cat','dog','panda','owl','squirrel','lion','unicorn'];
ids.forEach((id,i)=>assert.equal(manifest.characters.find(x=>x.id===id)?.legacyEmoji,legacy[i]));
for(const m of manifest.characters){
 assert.equal(m.src,`assets/characters/companion-${m.id}-v7.png`);
 const b=fs.readFileSync(path.join(root,m.src));
 assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a',m.id);
 assert.equal(b.readUInt32BE(16),512,m.id+' width');
 assert.equal(b.readUInt32BE(20),512,m.id+' height');
 assert.equal(b[25],6,m.id+' RGBA');
}
const mem=new Map(),listeners={};
const doc={addEventListener:(n,f)=>{(listeners[n] ||= []).push(f);},body:{getAttribute:()=> 'parent'},querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null};
const ctx={document:doc,window:{addEventListener(){},__ISLAND_ERRORS__:[]},localStorage:{getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)},sessionStorage:{getItem:()=>null,setItem(){}},location:{search:'',reload(){}},URLSearchParams,Date,Math,console,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame(){}};
vm.createContext(ctx);
for(const file of ['app.js','demo-core.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
const run=s=>vm.runInContext(s,ctx);
assert.equal(run('DemoCore.companions.length'),16);
assert.equal(run('DemoCore.companions.every(m=>m.src==="assets/characters/companion-"+m.id+"-v7.png")'),true);
assert.equal(run('getData().rewardItems.filter(x=>x.type==="mate").length'),10);
assert.equal(run('findMateItem({rewardItems:[]},"🦊").name'),'小狐');
run('var saved=DemoCore.seed(); saved.familyEdition="kaixin-v1"; saved.rewardsUnlocked=["🐻","🦌"]; saved.todayMate="🦌"; saved.mateDate=todayStr();var economy=JSON.stringify([saved.points,saved.materials,saved.demoGrowth,saved.redemptions]);saveData(saved)');
assert.equal(run('getTodayMate(getData()).name'),'小鹿');
assert.equal(run('getUnlockedRewards(getData()).length'),2);
assert.equal(run('JSON.stringify([getData().points,getData().materials,getData().demoGrowth,getData().redemptions])'),run('economy'));
for(const p of ['child.html','parent.html']){
 const html=fs.readFileSync(path.join(root,p),'utf8');assert.ok(html.includes('demo-core.js?v=20261110-performance1'),'cache-bust '+p);
}
console.log('PASS companion v7: 16 transparent RGBA PNGs, IDs, historical economy & cached paths');