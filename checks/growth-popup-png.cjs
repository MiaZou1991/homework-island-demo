/* Regression check for the first five transparent PNG components. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../dist');
const assets={
 'popup_bg.png':[825,1251],
 'popup_title_bar.png':[707,269],
 'card_mood_bg.png':[512,426],
 'card_task_bg.png':[502,426],
 'card_habit_bg.png':[509,426]
};
for(const [name,[width,height]] of Object.entries(assets)){
 const file=path.join(root,'assets/hd/growth-calendar/popup-png',name);
 assert.ok(fs.existsSync(file),'Missing PNG asset: '+name);
 const buf=fs.readFileSync(file);
 assert.ok(buf.length>5000,'Suspiciously small asset: '+name);
 assert.equal(buf.subarray(0,8).toString('hex'),'89504e470d0a1a0a',name+' PNG signature');
 assert.equal(buf.readUInt32BE(16),width,name+' width');
 assert.equal(buf.readUInt32BE(20),height,name+' height');
 assert.equal(buf[25],6,name+' must retain RGBA transparency');
}
const html=fs.readFileSync(path.join(root,'child.html'),'utf8');
const css=fs.readFileSync(path.join(root,'growth-popup-png.css'),'utf8');
const js=fs.readFileSync(path.join(root,'growth-popup-png.js'),'utf8');
assert.match(html,/growth-popup-png\.css/,'PNG stylesheet loaded in child page');
assert.match(html,/growth-popup-png\.js/,'PNG loader loaded in child page');
assert.match(css,/border-image-slice:207 70 131 70 fill/,'9-slice must preserve popup corners and meadow');
for(const name of Object.keys(assets)){
 assert.match(js,new RegExp(name.replace('.','\\.')),'PNG preload list must include '+name);
 assert.match(css,new RegExp(name.replace('.','\\.')),'PNG CSS must reference '+name);
}
assert.match(js,/result\.every\(Boolean\)/,'new style enabled only after all five PNGs load');
assert.match(css,/html\.gc-png-ready/,'fallback style must remain available without assets');
console.log('PASS: five transparent PNGs, dimensions, HTML integration, nine-slice, and fallback');
