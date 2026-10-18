/* Integrated local demo. Never uses the production storage key, family code or cloud SDK. */
const DEMO_KEY='homework_island_integrated_demo_v2';
const DemoCore=(()=>{
 const clone=x=>JSON.parse(JSON.stringify(x));
 const date=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 function seed(){const d=createDefaultData(),now=new Date().toISOString(),day=date(0);return {...d,kidName:'小满',points:128,totalCompleted:7,currentStreak:2,lastCompletedDate:date(-1),rewardsUnlocked:['🐻'],todayMate:'🐻',mateDate:day,materials:{wood:3,shell:2,flower:1,fish:1},homework:[
 {id:'demo_math',subject:'数学',content:'练习册第 3 页，完成后检查一遍',deadline:day+'T20:30:00',duration:20,points:10,done:false,createdAt:now,attachments:[]},
 {id:'demo_cn',subject:'语文',content:'朗读课文两遍，选一句喜欢的话读给家人听',deadline:day+'T20:00:00',duration:15,points:7,done:false,createdAt:now,attachments:[]},
 {id:'demo_en',subject:'英语',content:'复习 Unit 3 的单词',deadline:day+'T19:30:00',duration:10,points:5,done:true,completedAt:now,earnedPoints:9,createdAt:now,attachments:[]},
 {id:'demo_tomorrow',subject:'数学',content:'口算练习 10 道',deadline:date(1)+'T20:00:00',duration:10,points:5,done:false,createdAt:now,attachments:[]}],
 recurringTasks:[{id:'demo_reading',subject:'语文',content:'读一本自己喜欢的书，记录一句话',frequency:'daily',duration:15,points:5,active:true,createdAt:now,attachments:[]}],
 classes:[{id:'demo_swim',name:'游泳课',emoji:'🏊',days:[new Date().getDay()],start:'17:30',end:'18:30',place:'区游泳馆',bring:['泳衣','泳镜','毛巾'],wear:'出门前换好泳衣',points:10,active:true}],
 events:[{id:'demo_event',owner:'child',title:'睡前看绘本',emoji:'📚',date:day,start:'20:30',end:'20:50',checklist:[{name:'选一本喜欢的绘本',done:false}],note:'留一点时间给自己',done:false,createdAt:now}],
 rewardItems:d.rewardItems.concat([{id:'demo_movie',type:'prize',emoji:'🎬',name:'家庭电影夜',points:80,desc:'和家人一起选一部电影',repeatable:true,active:true}])};}
 function ensure(d){d.journalEntries ||= [];if(!d.demoGrowth){d.demoGrowth={version:1,construction:10,buildings:[],room:{},receipts:{},archives:[],pointDebt:0,reviewDefault:false};for(const h of d.homework||[])if(h.done)d.demoGrowth.receipts['homework|'+h.id]={historical:true,points:h.earnedPoints??h.points??0,drops:[],construction:0};}const g=d.demoGrowth;g.receipts ||= {};g.room ||= {};g.buildings ||= [];g.archives ||= [];g.pointDebt ||=0;return d;}
 function init(){let d;try{d=JSON.parse(localStorage.getItem(DEMO_KEY)||'null');}catch{}if(!d||!Array.isArray(d.homework))d=seed();ensure(d);localStorage.setItem(DEMO_KEY,JSON.stringify(d));}
 const journalMoods=[{id:'happy',emoji:'😊',name:'开心'},{id:'calm',emoji:'😌',name:'平静'},{id:'excited',emoji:'🤩',name:'期待'},{id:'tired',emoji:'😴',name:'有点累'},{id:'sad',emoji:'🌧️',name:'有点难过'},{id:'angry',emoji:'😤',name:'有点生气'}];
 function saveJournal(d,{day=date(0),mood='',text=''}){
  ensure(d);
  const parsed=new Date(day+'T12:00:00');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(parsed.getTime())||dateStr(parsed)!==day)throw Error('记录日期不正确');
  if(mood&&!journalMoods.some(m=>m.id===mood))throw Error('请选择一种心情');
  text=String(text).trim().slice(0,500);
  if(!mood&&!text)throw Error('选一个心情，或写一句话再保存吧');
  const now=new Date().toISOString();
  let entry=d.journalEntries.find(x=>x.date===day);
  if(entry)Object.assign(entry,{mood,text,updatedAt:now});
  else {entry={id:'journal|'+day,date:day,mood,text,createdAt:now,updatedAt:now};d.journalEntries.push(entry);}
  return entry;
 }
 function credit(d,n){let debt=Math.min(d.demoGrowth.pointDebt||0,n);d.demoGrowth.pointDebt-=debt;d.points=(Number(d.points)||0)+n-debt;}
 function debit(d,n){let available=Number(d.points)||0;d.points=Math.max(0,available-n);d.demoGrowth.pointDebt=(d.demoGrowth.pointDebt||0)+Math.max(0,n-available);}
 function finish(d,id,kind='homework',day=date(0)){
  ensure(d);let item=kind==='homework'?d.homework.find(h=>h.id===id):(d.classes||[]).find(c=>c.id===id);if(!item)return null;
  const key=kind==='homework'?'homework|'+id:'class|'+day+'|'+id,g=d.demoGrowth;
  const target=kind==='homework'?item:((d.classCheckins ||= {})[day+'|'+id] ||= {items:{}});if(target.done)return null;
  target.done=true;target.completedAt=new Date().toISOString();target.pendingApproval=false;
  let r=g.receipts[key];
  if(r){if(r.reversed){credit(d,r.points||0);r.reversed=false;}if(kind==='homework'){item.earnedPoints=r.points||0;d.totalCompleted=(d.totalCompleted||0)+1;}else target.pointsAwarded=r.points||0;return {...r,replayed:true,title:kind==='homework'?item.content:item.name};}
  let base=Number.isFinite(Number(item.points))?Number(item.points):(kind==='class'?10:0),bonus=0;
  if(kind==='homework'){const today=date(0);if(d.lastCompletedDate!==today){d.currentStreak=d.lastCompletedDate===date(-1)?(d.currentStreak||0)+1:1;d.lastCompletedDate=today;}bonus=Math.min((d.currentStreak||1)*2,20);d.totalCompleted=(d.totalCompleted||0)+1;}
  const drops=grantMaterialRewards(d).map(m=>m.id),construction=kind==='homework'?10:0;
  r={id:key,points:base+bonus,base,bonus,drops,construction,at:target.completedAt,reversed:false};g.receipts[key]=r;credit(d,r.points);g.construction+=construction;
  if(kind==='homework')item.earnedPoints=r.points;else target.pointsAwarded=r.points;
  return {...r,title:kind==='homework'?item.content:item.name};
 }
 function undo(d,id,kind='homework',day=date(0)){ensure(d);const target=kind==='homework'?d.homework.find(h=>h.id===id):(d.classCheckins||{})[day+'|'+id];if(!target?.done)return false;const key=kind==='homework'?'homework|'+id:'class|'+day+'|'+id;let r=d.demoGrowth.receipts[key];if(!r)r=d.demoGrowth.receipts[key]={historical:true,points:target.earnedPoints??target.pointsAwarded??target.points??0,drops:[],construction:0};if(!r.reversed){debit(d,r.points||0);r.reversed=true;}target.done=false;target.completedAt=null;if(kind==='homework'){target.earnedPoints=0;d.totalCompleted=Math.max(0,(d.totalCompleted||0)-1);}else target.pointsAwarded=0;return true;}
 function validate(value){let d=value;if(!Array.isArray(d?.homework)&&Array.isArray(d?.data?.homework))d=d.data;if(!d||typeof d!=='object'||Array.isArray(d)||!Array.isArray(d.homework))throw Error('请选择作业岛导出的 JSON 备份。');for(const k of ['homework','recurringTasks','classes','events','rewardItems','redemptions','journalEntries'])if(d[k]!==undefined&&!Array.isArray(d[k]))throw Error(k+' 字段格式不正确');for(const k of ['homework','recurringTasks','classes','events','rewardItems','redemptions','journalEntries']){const ids=(d[k]||[]).map(x=>x?.id);if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw Error(k+' 中存在缺失或重复 ID');}if(!Number.isFinite(Number(d.points??0))||Number(d.points??0)<0)throw Error('积分数据不正确');return clone(d);}
 function importData(value){let d=ensure({...createDefaultData(),...validate(value)});localStorage.setItem(DEMO_KEY,JSON.stringify(d));return d;}
 function homeworkProgress(d,day=date(0)){
  const tasks=buildDayTimeline(d,day).items.filter(x=>x.kind==='homework').map(x=>x.hw);
  const remaining=tasks.filter(h=>!h.done);
  return {total:tasks.length,remaining:remaining.length,waiting:remaining.filter(h=>h.pendingApproval).length,next:remaining.find(h=>!h.pendingApproval)||null,complete:remaining.length===0};
 }
 const companions=[
  ['🐻','bear','小熊','慢慢来，我就在这里陪你。','companion-bear-v3.png'],
  ['🐰','rabbit','小兔','先做好眼前这一小步。','companion-rabbit-v3.png'],
  ['🐺','fox','小狐','一起试试，总会找到办法。','companion-fox-v3.png'],
  ['🐱','cat','小猫','按自己的节奏来，每一点努力都算数。','char_cat.png'],
  ['🐶','dog','小狗','写完这一件，我们一起去看看小岛。','char_dog.png'],
  ['🐼','panda','熊猫','累了就伸个懒腰，我会陪你。','companion-panda-v3.png'],
  ['🐦','owl','猫头鹰','认真想一想，答案会慢慢出现。','companion-owl-v3.png'],
  ['🐿️','squirrel','小松鼠','今天的努力，会变成明天的小惊喜。','char_squirrel.png'],
  ['🐯','lion','小狮子','你已经迈出勇敢的一步。','companion-lion-v3.png'],
  ['🐴','unicorn','独角兽','每一点进步，都有自己的光。','companion-unicorn-v3.png']
 ].map(([emoji,id,name,line,file])=>({emoji,id,name,line,src:'assets/characters/'+file}));
 const roomSlots=[{id:'0',zone:'desk',name:'书桌左侧',x:22,y:43},{id:'2',zone:'window',name:'窗边',x:22,y:36},{id:'desk-2',zone:'desk',name:'书桌右侧',x:34,y:42}];
 for(let row=0;row<3;row++)for(let col=0;col<4;col++)roomSlots.push({id:row===0&&col===0?'1':`shelf-${row*4+col+1}`,zone:'shelf',name:`展示架第 ${row+1} 层 · ${col+1} 号`,x:52+col*11,y:22+row*10});
 function roomUsage(d,item){return Object.values(ensure(d).demoGrowth.room).filter(x=>x===item).length;}
 function editRoom(d,action,slot,item){
  ensure(d);const room=d.demoGrowth.room;
  if(!homeworkProgress(d).complete)return {ok:false,message:'先完成今日作业，再布置房间。'};
  if(!roomSlots.some(s=>s.id===String(slot)))return {ok:false,message:'请选择房间里的一个位置。'};
  slot=String(slot);
  if(action==='remove'){delete room[slot];return {ok:true,message:'已收回收藏，可以重新摆放。'};}
  if(action==='move'){
   const from=String(item);if(!roomSlots.some(s=>s.id===from)||!room[from])return {ok:false,message:'先选一件已经摆好的收藏。'};
   const old=room[slot];room[slot]=room[from];if(old)room[from]=old;else delete room[from];
   return {ok:true,message:old&&from!==slot?'两件收藏已交换位置。':'收藏已经换了一个位置。'};
  }
  if(action!=='place'||!(Number(d.materials?.[item])>0))return {ok:false,message:'先从收藏里选择一件物品。'};
  if(room[slot]===item)return {ok:true,message:'这件收藏已经摆在这里了。'};
  if(roomUsage(d,item)>=Number(d.materials[item]))return {ok:false,message:'这件收藏已全部摆好，可以用「移动摆件」换位置。'};
  const replaced=!!room[slot];room[slot]=item;
  return {ok:true,message:replaced?'已替换，原来的收藏已收回。':'收藏摆好了。'};
 }
 return {init,ensure,seed,finish,undo,validate,importData,homeworkProgress,journalMoods,saveJournal,companions,roomSlots,roomUsage,editRoom,date,key:DEMO_KEY};
})();
DemoCore.init();
const IslandSync={start:async()=>{},schedulePush(){},pull:async()=>null,push:async()=>{},getCode:()=> '本机 Demo',setCode(){},openPanel(){showToast('这是隔离 Demo，记录仅保存在本机，不连接线上家庭。');}};
startIslandEvents=function(){};
