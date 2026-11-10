const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root={FamilySchedule:{visible:()=>true}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/growth-calendar.js'),'utf8'),{window:root,Date});
const Growth=root.GrowthCalendar;
const date='2026-11-09';
const data={
 journalEntries:[{date,mood:'happy',text:'今天超开心！'}],
 growthHabits:[{id:'h1',title:'每天阅读20分钟',goal:21,startDate:date,active:true,completedDates:[date]},{id:'h2',title:'整理书包',goal:21,startDate:date,active:true,completedDates:[date]}],
 growthMoments:[{id:'m1',date,text:'第一次自己整理书桌'}]
};
const allItems=[
 {kind:'homework',done:true,hw:{subject:'数学',content:'口算10题'}},
 {kind:'class',done:false,cls:{name:'钢琴课',start:'16:30',bring:['水杯']}},
 {kind:'event',done:false,ev:{title:'家庭散步',start:'19:00',members:['all']}}
];
const ctx={date,range:'month',data,familyMember:'all',dayItems:(_d,day)=>day===date?allItems:[],buddy:()=>'<img src="test.png" alt="伙伴">'};
assert.deepEqual(Array.from(Growth.marks(ctx,date),x=>x.kind),['mood','done','habit','moment'],
 'four categories can coexist; two habits make one leaf');
const calendar=Growth.render(ctx);
assert.match(calendar,/成长日历/);
assert.equal((calendar.match(/class="gc-month-day /g)||[]).length,30);
assert.match(calendar,/gc-more">\+2/,'a date shows up to two primary marks and +2');
assert.match(calendar,/月视图/);
assert.match(calendar,/gc-range-ico[^>]*><img src="assets\/hd\/growth-calendar\/calendar\.svg"/,'date navigation icon is a proper illustrated asset');
assert.doesNotMatch(calendar,/cp-page gc-page/,'remove the legacy calendar CSS class');
assert.doesNotMatch(calendar,/>▣</,'no square placeholder for calendar icon');
assert.match(calendar,/mood-happy-cat\.svg/,'happy mood is represented with the illustrated sticker');
assert.match(calendar,/gc-memory-book/,'month view uses illustrated paper notebook');
assert.match(calendar,/gc-stamps/,'habit progress displays day-by-day stamp cells');
assert.doesNotMatch(calendar,/gc-family/,'month does not show the family filter bar');
assert.match(calendar,/assets\/hd\/growth-calendar\/star\.svg/,'task star uses dedicated artwork');
assert.match(calendar,/assets\/hd\/growth-calendar\/flower\.svg/,'special moments use dedicated artwork');
for(const name of ['star','heart','leaf','flower','memory-autumn','calendar','journal','tasks','mood-empty','mood-happy-cat','meadow-footer']){
 assert.ok(fs.existsSync(path.join(__dirname,'../dist/assets/hd/growth-calendar',name+'.svg')),name+' artwork must be packaged');
}

const week=Growth.render({...ctx,range:'week'});
assert.equal((week.match(/class="gc-week-row"/g)||[]).length,3);
assert.match(week,/钢琴课/);
assert.match(week,/口算10题/);
assert.match(week,/家庭成员筛选/);
assert.match(week,/记一件事/);
const detail=Growth.detail(ctx,date);
assert.match(detail,/今天超开心/);
assert.match(detail,/每天阅读20分钟/);
assert.match(detail,/第一次自己整理书桌/);
assert.match(detail,/课程和携带物品只作提醒/);
assert.match(detail,/gc-detail-meadow/,'rounded meadow finishes the scrapbook');
assert.equal((detail.match(/gc-detail-ribbon gc-ribbon-/g)||[]).length,4,'four scrapbook sections each have reusable illustrated ribbons');
assert.equal((detail.match(/gc-detail-list-row/g)||[]).length,4,'real schedule uses four illustrated rows with event');
assert.match(detail,/gc-paper-raised/,'material panels are image-backed');
assert.match(detail,/assets\/hd\/ui\/backpack\.png/,'packing illustration comes from existing art library');
assert.match(detail,/assets\/hd\/today-icons\/homework-v1\.webp/,'diary illustration comes from existing art library');
assert.match(detail,/课程和携带物品只作提醒，不需要打卡/);

assert.equal((detail.match(/class="gc-detail-stat /g)||[]).length,3,'date details have 3 pastel summary badges');

const other='2026-11-10';
assert.equal(Growth.marks(ctx,other).length,0,'no fake record for an unrecorded date');
const onlyClass={...ctx,dayItems:()=>[{kind:'class',cls:{name:'数学课'},done:false}]};
assert.equal(Growth.marks(onlyClass,date).some(x=>x.kind==='done'),false,'classes do not award completion stars');
const unfinished={...ctx,dayItems:()=>[{kind:'homework',hw:{content:'没完成'},done:false}]};
assert.equal(Growth.marks(unfinished,date).some(x=>x.kind==='done'),false,'unfinished homework never displays completion star');
const noMood={...ctx,data:{...data,journalEntries:[]}};
assert.equal(Growth.marks(noMood,date).some(x=>x.kind==='mood'),false,'emotions are never inferred');
console.log('PASS growth calendar: 7-day timetable, month cells, markers, mood sync, habit aggregation, and read-only course reminders');
