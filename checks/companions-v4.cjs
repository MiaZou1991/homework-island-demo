// Full companion v4 asset and historical-data contract (isolated, no production writes).
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'../dist');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/characters/companions-v4.json'),'utf8'));
assert.equal(manifest.characters.length,16);
assert.equal(new Set(manifest.characters.map(x=>x.id)).size,16);
const oldIds=['bear','rabbit','fox','cat','dog','panda','owl','squirrel','lion','unicorn'];
const oldEmoji=['🐻','🐰','🐺','🐱','🐶','🐼','🐦','🐿️','🐯','🐴'];
oldIds.forEach((id,i)=>assert.equal(manifest.characters.find(x=>x.id===id)?.legacyEmoji,oldEmoji[i]));
for(const m of manifest.characters){
 const png=fs.readFileSync(path.join(root,m.src));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a',m.id);
 assert.equal(png.readUInt32BE(16),m.width,m.id+' width');
 assert.equal(png.readUInt32BE(20),m.height,m.id+' height');
 assert.equal(png[25],6,m.id+' RGBA');
}
const mem=new Map(),listeners={};
const doc={addEventListener:(n,fn)=>{(listeners[n] ||= []).push(fn);},body:{getAttribute:()=> 'parent'},querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null};
const ctx={document:doc,window:{addEventListener(){},__ISLAND_ERRORS__:[]},localStorage:{getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)},sessionStorage:{getItem:()=>null,setItem(){}},location:{search:'',reload(){}},URLSearchParams,Date,Math,console,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame(){}};
vm.createContext(ctx);
for(const file of ['app.js','demo-core.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
const run=s=>vm.runInContext(s,ctx);
assert.equal(run('DemoCore.companions.length'),16);
assert.equal(run('new Set(DemoCore.companions.map(m=>m.id)).size'),16);
assert.equal(run('getData().rewardItems.filter(x=>x.type==="mate").length'),10,'original reward rows stay unchanged');
assert.equal(run('DemoCore.companions.every(m=>m.src==="assets/characters/companion-"+m.id+(m.id==="rabbit"?"-v5.png":"-v4.png"))'),true);
assert.equal(run('findMateItem({rewardItems:[]}, "🦌").name'),'小鹿');
assert.equal(run('findMateItem({rewardItems:[]}, "🦊").name'),'小狐');
run('var saved=DemoCore.seed();saved.familyEdition="kaixin-v1";saved.rewardsUnlocked=["🐻","🦌"];saved.todayMate="🦌";saved.mateDate=todayStr();var before=JSON.stringify([saved.points,saved.materials,saved.demoGrowth,saved.redemptions]);saveData(saved)');
assert.equal(run('getTodayMate(getData()).name'),'小鹿');
assert.equal(run('getUnlockedRewards(getData()).length'),2);
assert.equal(run('JSON.stringify([getData().points,getData().materials,getData().demoGrowth,getData().redemptions])'),run('before'));
const upgrade=fs.readFileSync(path.join(root,'upgrade.js'),'utf8');
assert.ok(upgrade.includes('const items=DemoCore.companions.filter'));
assert.ok(upgrade.includes("if(a==='choose-mate')"));
assert.ok(!upgrade.includes('用积分解锁新伙伴'),'gallery has no points redemption');
// Regression: the former rabbit asset had opaque cream card at the gap between ears.
const rabbitSrc=manifest.characters.find(x=>x.id==='rabbit').src;
assert.equal(rabbitSrc,'assets/characters/companion-rabbit-v5.png');
const parent=fs.readFileSync(path.join(root,'parent.html'),'utf8');
assert.ok(parent.includes('rabbitmatte-v5'),'parent should bust old companion cache');
const html=fs.readFileSync(path.join(root,'child.html'),'utf8');
assert.ok(html.includes('companiongallery-v4'),'Safari asset cache should update');
console.log('PASS companion v4: 16 PNGs, catalog mappings, old data, free choice, cache version');
