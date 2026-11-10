/* 开心岛 · 成长日历：周课表和月成长手账，只读投影现有作业/课程/心情。 */
(function(root){
'use strict';
const DAYS=['一','二','三','四','五','六','日'];
const MOOD_LABEL={happy:'开心',calm:'平静',excited:'期待',tired:'有点累',sad:'有点难过',angry:'有点生气'};
const SUBJECT_ICON={'语文':'语','数学':'数','英语':'英','音乐':'音','科学':'科','美术':'美','体育':'体'};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function dt(day){return new Date(day+'T12:00:00');}
function iso(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function plus(day,n){const d=dt(day);d.setDate(d.getDate()+n);return iso(d);}
function monday(day){const d=dt(day);d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d);}
function mood(ctx,day){return (ctx.data.journalEntries||[]).find(x=>x.date===day)||null;}
function habits(ctx){return (ctx.data.growthHabits||[]).filter(h=>h&&h.active!==false);}
function checked(h,day){return Array.isArray(h.completedDates)&&h.completedDates.includes(day);}
function moments(ctx,day){return (ctx.data.growthMoments||[]).filter(m=>m.date===day);}
function items(ctx,day){return (ctx.dayItems(ctx.data,day)||[]).filter(x=>!root.FamilySchedule||root.FamilySchedule.visible(x,ctx.familyMember||'all'));}
function hwItems(ctx,day){return (ctx.dayItems(ctx.data,day)||[]).filter(x=>x.kind==='homework');}
function complete(ctx,day){const x=hwItems(ctx,day);return x.length>0&&x.every(it=>it.done===true||it.hw&&it.hw.done===true);}
function marks(ctx,day){
 const a=[],j=mood(ctx,day),base='assets/hd/growth-calendar/';
 if(j&&j.mood)a.push({kind:'mood',text:MOOD_LABEL[j.mood]||'心情',icon:'<img src="'+(j.mood==='happy'?'assets/hd/growth-calendar/mood-happy-cat.svg':'assets/hd/moods/'+esc(j.mood)+'.svg')+'" alt="">'}); 
 if(complete(ctx,day))a.push({kind:'done',text:'任务完成',icon:'<img src="'+base+'star.svg" alt="">'}); 
 if(habits(ctx).some(h=>checked(h,day)))a.push({kind:'habit',text:'习惯打卡',icon:'<img src="'+base+'leaf.svg" alt="">'}); 
 if(moments(ctx,day).length)a.push({kind:'moment',text:'特别时刻',icon:'<img src="'+base+'flower.svg" alt="">'}); 
 return a;
}
function badge(m){return '<span class="gc-mark gc-mark-'+m.kind+'" title="'+esc(m.text)+'" aria-label="'+esc(m.text)+'">'+m.icon+'</span>';}
function marksInline(a){return '<span class="gc-markers">'+a.slice(0,2).map(badge).join('')+(a.length>2?'<span class="gc-more">+'+(a.length-2)+'</span>':'')+'</span>';}
function weekday(day){const d=dt(day);return DAYS[(d.getDay()+6)%7];}
function kind(it){if(it.kind==='homework')return 'homework';if(it.kind==='class')return 'class';return 'event';}
function label(it){return it.kind==='homework'?it.hw.content:it.kind==='class'?it.cls.name:it.ev.title;}
function when(it){return it.kind==='class'?it.cls.start||'':it.kind==='event'?it.ev.start||'':'';}
function period(it){
 const clock=when(it),h=Number(String(clock).slice(0,2));
 if(!clock||!Number.isFinite(h))return it.kind==='homework'?'pm':'all';
 return h<12?'am':h<18?'pm':'night';
}
function tile(it){
 const k=kind(it),subject=it.kind==='homework'?it.hw.subject:label(it),names={'语文':'chinese','数学':'math','英语':'english','音乐':'music','钢琴':'music','科学':'science','美术':'art','体育':'sports','足球':'sports','游泳':'sports'};
 const found=Object.keys(names).find(x=>String(subject).includes(x));
 const art=found?'assets/hd/subjects-v12/'+names[found]+'.png':k==='event'?'assets/hd/course/calendar-clock.png':'assets/hd/today-icons/course-v1.webp';
 return '<div class="gc-tile gc-tile-'+k+'" title="'+esc(label(it))+'"><span class="gc-tile-icon"><img src="'+art+'" alt="" loading="lazy" decoding="async"></span><b>'+esc(label(it))+'</b>'+(when(it)?'<small>'+esc(when(it))+'</small>':'')+'</div>';
}
function familyFilters(ctx){const labels=[['all','全家'],['child','开心'],['dad','爸爸'],['mom','妈妈']];return '<div class="gc-family" aria-label="家庭成员筛选">'+labels.map(([id,name])=>'<button type="button" data-up="family-filter" data-member="'+id+'" aria-pressed="'+(ctx.familyMember===id)+'">'+name+'</button>').join('')+'</div>';}
function controls(ctx,month,dates){
 const d=dt(ctx.date),value=month?d.getFullYear()+'年'+(d.getMonth()+1)+'月':Number(dates[0].slice(5,7))+'月'+Number(dates[0].slice(8,10))+'日 — '+Number(dates[6].slice(5,7))+'月'+Number(dates[6].slice(8,10))+'日';
 return '<header class="gc-top"><div class="gc-top-row"><h1>成长日历</h1><div class="gc-switch" role="group" aria-label="日历视图">'+
 '<button type="button" data-up="plan-range" data-range="week" aria-pressed="'+(!month)+'">周视图</button>'+
 '<button type="button" data-up="plan-range" data-range="month" aria-pressed="'+month+'">月视图</button></div></div>'+
 '<div class="gc-range"><button type="button" data-up="prev" aria-label="上一个日期区间">‹</button><strong><span class="gc-range-ico" aria-hidden="true"><img src="assets/hd/growth-calendar/calendar.svg" alt=""></span> '+value+'</strong><button type="button" data-up="next" aria-label="下一个日期区间">›</button></div></header>'+(month?'':familyFilters(ctx));
}
function week(ctx){
 const start=monday(ctx.date),days=DAYS.map((_,i)=>plus(start,i)),periods=[['am','☀','上午'],['pm','🌤','下午'],['night','☾','晚上']],dayItems=days.map(day=>items(ctx,day));
 const head='<div class="gc-week-head"><span class="gc-timehead">时段</span>'+days.map((day,i)=>'<button type="button" data-up="growth-day" data-date="'+day+'" class="'+(day===ctx.date?'selected':'')+'"><small>周'+DAYS[i]+'</small><b>'+Number(day.slice(-2))+'</b>'+marksInline(marks(ctx,day))+'</button>').join('')+'</div>';
 const rows=periods.map(([p,ico,name])=>'<div class="gc-week-row"><div class="gc-period"><span>'+ico+'</span><b>'+name+'</b></div>'+days.map((day,i)=>{
  const cell=dayItems[i].filter(it=>period(it)===p||(p==='pm'&&period(it)==='all')),shown=cell.slice(0,2);
  return '<button type="button" data-up="growth-day" data-date="'+day+'" aria-label="'+esc(day)+' '+name+'，'+cell.length+'项安排" class="gc-week-cell">'+shown.map(tile).join('')+(cell.length>2?'<small class="gc-overflow">+'+(cell.length-2)+' 项</small>':'')+'</button>';
 }).join('')+'</div>').join('');
 const active=habits(ctx),record=active.map(h=>{
  const count=(h.completedDates||[]).length,goal=Math.max(1,Number(h.goal)||21);
  return '<div class="gc-habit-mini"><b>❧ '+esc(h.title)+'</b><span>'+count+'/'+goal+'天</span><div class="gc-progress"><i style="width:'+Math.min(100,count/goal*100)+'%"></i></div></div>';
 }).join('');
 return '<div class="gc-page gc-week">'+controls(ctx,false,days)+
 '<div class="gc-week-dates">'+days.map((day,i)=>'<button type="button" data-up="growth-day" data-date="'+day+'" class="'+(day===ctx.date?'selected':'')+'"><small>周'+DAYS[i]+'</small><b>'+Number(day.slice(-2))+'</b></button>').join('')+'</div>'+
 '<section class="gc-panel gc-timetable"><div class="gc-section-title"><h2>一周小课表 <small>点日期查看详情</small></h2><button type="button" data-up="add-menu">＋ 记一件事</button></div>'+head+rows+'</section>'+
 '<section class="gc-panel gc-goals"><div class="gc-section-title"><h2>本周小目标</h2><button type="button" data-up="growth-habit-new">＋ 21天挑战</button></div>'+
 (record||'<p class="gc-muted">还没有习惯挑战，给自己选一个轻松的小目标吧。</p>')+'</section>'+
 '<div class="gc-companion"><span class="gc-companion-art">'+ctx.buddy(ctx.data,'gc-buddy')+'</span><p>安排好这一周，<br>每天都能留下小故事！</p></div></div>';
}
function month(ctx){
 const d=dt(ctx.date),y=d.getFullYear(),m=d.getMonth(),first=new Date(y,m,1),lead=(first.getDay()+6)%7,last=new Date(y,m+1,0).getDate(),count=Math.ceil((lead+last)/7)*7;
 let cells='';
 for(let i=0;i<count;i++){
  const n=i-lead+1;
  if(n<1||n>last){cells+='<span class="gc-month-blank" aria-hidden="true"></span>';continue;}
  const day=iso(new Date(y,m,n)),a=marks(ctx,day);
  cells+='<button type="button" data-up="growth-day" data-date="'+day+'" class="gc-month-day '+(ctx.date===day?'selected':'')+'" aria-label="'+y+'年'+(m+1)+'月'+n+'日，'+a.map(x=>x.text).join('、')+'"><b>'+n+'</b>'+marksInline(a)+'</button>';
 }
 const ym=iso(first).slice(0,7),monthJ=(ctx.data.journalEntries||[]).filter(x=>x.date&&x.date.startsWith(ym));
 const lastNote=[...monthJ].filter(x=>x.text).sort((a,b)=>b.date.localeCompare(a.date))[0],progress=habits(ctx)[0];
 const countDone=progress?(progress.completedDates||[]).length:0,goal=progress?Math.max(1,Number(progress.goal)||21):21;
 const stamps=progress?Array.from({length:Math.min(goal,21)},(_,i)=>'<span class="gc-stamp '+(i<countDone?'on':'')+'" aria-label="第'+(i+1)+'天'+(i<countDone?'已打卡':'未打卡')+'">'+(i<countDone?'✓':'✿')+'</span>').join(''):'';
 const notebook='<div class="gc-memory-book"><span class="gc-spiral" aria-hidden="true"></span><div class="gc-memory-photo"><img src="assets/hd/growth-calendar/memory-autumn.svg" alt="秋天的小岛风景"></div><div class="gc-memory-copy"><p>'+esc(lastNote?.text||'每一天的心情和成长，都会变成值得收藏的小故事。')+'</p><small>本月记录心情 '+monthJ.filter(j=>j.mood).length+' 天</small></div><span class="gc-memory-pencil" aria-hidden="true">✎</span></div>';
 return '<div class="gc-page gc-month">'+controls(ctx,true,[])+
 '<section class="gc-panel gc-month-paper"><div class="gc-month-head">'+DAYS.map(x=>'<span>周'+x+'</span>').join('')+'</div><div class="gc-month-grid">'+cells+'</div>'+
 '<div class="gc-legend">'+[['mood','心情记录'],['done','任务完成'],['habit','习惯打卡'],['moment','特别时刻']].map(([k,t])=>'<span><img src="assets/hd/growth-calendar/'+(k==='mood'?'heart':k==='done'?'star':k==='habit'?'leaf':'flower')+'.svg" alt="">'+t+'</span>').join('')+'</div></section>'+
 '<section class="gc-journal-card"><div class="gc-wood-heading"><h2>'+(m+1)+'月 · 我的手账</h2><button type="button" data-up="growth-day" data-date="'+ctx.date+'" aria-label="翻开成长手账">›</button></div>'+notebook+'</section>'+
 '<section class="gc-panel gc-challenge"><div class="gc-wood-heading gc-goal-heading"><h2>21天习惯挑战</h2><button type="button" data-up="growth-habit-new" aria-label="新建习惯挑战">›</button></div>'+
 (progress?'<div class="gc-challenge-inner"><div class="gc-challenge-info"><b>'+esc(progress.title)+'</b><strong>'+countDone+' / '+goal+' 天</strong></div><div class="gc-progress"><i style="width:'+Math.min(100,countDone/goal*100)+'%"></i></div><div class="gc-stamps">'+stamps+'</div></div>':
 '<div class="gc-challenge-inner gc-challenge-empty"><p>选一个想坚持的小习惯，慢慢点亮成长印章。</p><button type="button" data-up="growth-habit-new">＋ 开始21天挑战</button></div>')+
 '</section></div>';
}
function detail(ctx,day){
 const j=mood(ctx,day),a=marks(ctx,day),h=hwItems(ctx,day),done=h.filter(it=>it.done===true||it.hw&&it.hw.done).length,hs=habits(ctx),ms=moments(ctx,day),daySchedule=items(ctx,day);
 const date=dt(day),past=day<=iso(new Date()),classes=daySchedule.filter(it=>it.kind==='class'),events=daySchedule.filter(it=>it.kind==='event');
 const pack=root.FamilySchedule?.packingItems?.(daySchedule)||[];
 const recordedMood=j?.mood?'<img src="'+(j.mood==='happy'?'assets/hd/growth-calendar/mood-happy-cat.svg':'assets/hd/moods/'+esc(j.mood)+'.svg')+'" alt="">':'<img src="assets/hd/growth-calendar/mood-empty.svg" alt="">';
 const moodName=MOOD_LABEL[j?.mood]||'未记录';
 const stats='<div class="gc-detail-quick">'+
 '<div class="gc-detail-stat mood">'+recordedMood+'<b>'+esc(moodName)+'</b></div>'+
 '<div class="gc-detail-stat done"><img src="assets/hd/growth-calendar/star.svg" alt=""><b>'+ (h.length&&done===h.length?'任务完成':done+' / '+h.length+'项')+'</b></div>'+
 '<div class="gc-detail-stat habit"><img src="assets/hd/growth-calendar/leaf.svg" alt=""><b>'+hs.filter(x=>checked(x,day)).length+'项习惯</b></div></div>';
 const note='<section class="gc-detail-section gc-diary"><h2><img class="gc-detail-section-icon" src="assets/hd/growth-calendar/journal.svg" alt=""> 我的小记录</h2><div class="gc-diary-paper"><p class="gc-handwriting">'+esc(j?.text||'今天还没有留下小记录。')+'</p><button type="button" data-up="journal-edit" data-date="'+day+'" aria-label="记录或修改这一天的心情与短句">✎</button></div></section>';
 const arrangement='<section class="gc-detail-section gc-arrangement"><h2><img class="gc-detail-section-icon" src="assets/hd/growth-calendar/tasks.svg" alt=""> 当天安排</h2>'+
 '<div class="gc-detail-list"><div><b>作业（'+h.length+'项）</b><span>'+ (h.length?done+' / '+h.length+'项完成':'暂无作业')+'</span></div>'+
 '<div><b>课程（'+classes.length+'项）</b><span>仅提醒</span></div>'+
 '<div><b>携带物品（'+pack.length+'件）</b><span>仅提示</span></div>'+
 (events.length?'<div><b>其他活动（'+events.length+'项）</b><span>'+esc(events[0].ev.title)+'</span></div>':'')+'</div>'+
 '<p class="gc-note">课程和携带物品只作提醒，不需要打卡。</p>'+
 '<button type="button" data-up="add-menu" class="gc-detail-add">＋ 记一件事</button></section>';
 const habitsHtml='<section class="gc-detail-section gc-habit-detail"><h2><img src="assets/hd/growth-calendar/leaf.svg" alt=""> 习惯打卡</h2>'+
 (hs.length?hs.map(habit=>'<div class="gc-detail-habit"><span>'+esc(habit.title)+'</span><button type="button" data-up="growth-habit-check" data-id="'+esc(habit.id)+'" data-date="'+day+'" '+(!past?'disabled':'')+'>'+ (checked(habit,day)?'✓ 已打卡':'○ 记一次')+'</button></div>').join(''):'<p class="gc-empty-note">这一天还没有习惯挑战。</p>')+
 '<button type="button" data-up="growth-habit-new" class="gc-inline-add">＋ 新建挑战</button></section>';
 const momentHtml='<section class="gc-detail-section gc-moments"><h2><img src="assets/hd/growth-calendar/flower.svg" alt=""> 特别时刻</h2>'+
 (ms.map(x=>'<p class="gc-moment-item">✿ '+esc(x.text)+'</p>').join('')||'<p class="gc-empty-note">有值得纪念的小事，可以写在这里。</p>')+
 '<button type="button" data-up="growth-moment-new" data-date="'+day+'" class="gc-inline-add">＋ 添加特别时刻</button></section>';
 return '<div class="gc-detail"><h1>'+(date.getMonth()+1)+'月'+date.getDate()+'日 · 周'+weekday(day)+'</h1>'+
 stats+note+arrangement+habitsHtml+momentHtml+'<div class="gc-detail-meadow" aria-hidden="true"></div></div>';
}
function habitForm(){return '<div class="gc-detail"><h1>开启21天习惯挑战</h1><p>坚持是慢慢积累的，不需要每天连续完成。</p><label for="gc-habit-name">想培养什么小习惯？</label><input id="gc-habit-name" maxlength="24" placeholder="例如：每天阅读20分钟"><p id="gc-growth-error" role="status"></p><button type="button" data-up="growth-habit-save">开始挑战</button></div>';}
function momentForm(day){return '<div class="gc-detail"><h1>收藏特别时刻</h1><p>'+esc(day)+' · 留下一件值得纪念的小事</p><label for="gc-moment-text">想记录什么？</label><textarea id="gc-moment-text" maxlength="80" rows="3" placeholder="例如：第一次独立完成了画作"></textarea><input type="hidden" id="gc-moment-date" value="'+esc(day)+'"><p id="gc-growth-error" role="status"></p><button type="button" data-up="growth-moment-save">收藏这一天</button></div>';}
root.GrowthCalendar={render:function(ctx){return ctx.range==='month'?month(ctx):week(ctx);},detail:detail,habitForm:habitForm,momentForm:momentForm,marks:marks};
})(window);
