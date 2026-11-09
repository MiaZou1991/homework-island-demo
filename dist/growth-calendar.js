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
 const a=[],j=mood(ctx,day);
 if(j&&j.mood)a.push({kind:'mood',text:MOOD_LABEL[j.mood]||'心情',icon:'<img src="assets/hd/moods/'+esc(j.mood)+'.svg" alt="">'}); 
 if(complete(ctx,day))a.push({kind:'done',text:'任务完成',icon:'★'});
 if(habits(ctx).some(h=>checked(h,day)))a.push({kind:'habit',text:'习惯打卡',icon:'❧'});
 if(moments(ctx,day).length)a.push({kind:'moment',text:'特别时刻',icon:'✿'});
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
function tile(it){const k=kind(it),info=k==='homework'?(SUBJECT_ICON[it.hw.subject]||'作'):k==='class'?'课':'事';
 return '<div class="gc-tile gc-tile-'+k+'" title="'+esc(label(it))+'"><span class="gc-tile-icon">'+info+'</span><b>'+esc(label(it))+'</b>'+(when(it)?'<small>'+esc(when(it))+'</small>':'')+'</div>';
}
function controls(ctx,month,dates){
 const value=month?dt(ctx.date).getFullYear()+'年'+(dt(ctx.date).getMonth()+1)+'月':Number(dates[0].slice(5,7))+'月'+Number(dates[0].slice(8,10))+'日 — '+Number(dates[6].slice(5,7))+'月'+Number(dates[6].slice(8,10))+'日';
 return '<header class="gc-top"><div class="gc-top-row"><h1>成长日历</h1><div class="gc-switch" role="group" aria-label="日历视图">'+
 '<button type="button" data-up="plan-range" data-range="week" aria-pressed="'+(!month)+'">周视图</button>'+
 '<button type="button" data-up="plan-range" data-range="month" aria-pressed="'+month+'">月视图</button></div></div>'+
 '<div class="gc-range"><button type="button" data-up="prev" aria-label="上一个日期区间">‹</button><strong>'+value+'</strong><button type="button" data-up="next" aria-label="下一个日期区间">›</button></div></header>';
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
 return '<div class="cp-page gc-page gc-week">'+controls(ctx,false,days)+
 '<div class="gc-week-dates">'+days.map((day,i)=>'<button type="button" data-up="growth-day" data-date="'+day+'" class="'+(day===ctx.date?'selected':'')+'"><small>周'+DAYS[i]+'</small><b>'+Number(day.slice(-2))+'</b></button>').join('')+'</div>'+
 '<section class="gc-panel gc-timetable"><h2>一周小课表 <small>点日期看看当天的故事</small></h2>'+head+rows+'</section>'+
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
 const monthJ=(ctx.data.journalEntries||[]).filter(x=>x.date&&x.date.startsWith(iso(first).slice(0,7))),lastNote=[...monthJ].filter(x=>x.text).sort((a,b)=>b.date.localeCompare(a.date))[0],progress=habits(ctx)[0];
 return '<div class="cp-page gc-page gc-month">'+controls(ctx,true,[])+
 '<section class="gc-panel gc-month-paper"><div class="gc-month-head">'+DAYS.map(x=>'<span>周'+x+'</span>').join('')+'</div><div class="gc-month-grid">'+cells+'</div>'+
 '<div class="gc-legend">'+[['mood','心情'],['done','任务完成'],['habit','习惯打卡'],['moment','特别时刻']].map(([k,t])=>'<span><i class="gc-legend-'+k+'">'+(k==='mood'?'♥':k==='done'?'★':k==='habit'?'❧':'✿')+'</i>'+t+'</span>').join('')+'</div></section>'+
 '<section class="gc-panel gc-journal-card"><div class="gc-section-title"><h2>✿ '+(m+1)+'月 · 我的手账</h2><button type="button" data-up="growth-day" data-date="'+ctx.date+'">翻开当天 ›</button></div>'+
 '<p>'+(lastNote?esc(lastNote.text):'这个月的心情、小故事和成长印章，会慢慢留在这里。')+'</p><small>本月已记录心情 '+monthJ.filter(j=>j.mood).length+' 天</small></section>'+
 '<section class="gc-panel gc-challenge"><div class="gc-section-title"><h2>❧ 21天习惯挑战</h2><button type="button" data-up="growth-habit-new">＋ 新建挑战</button></div>'+
 (progress?'<b>'+esc(progress.title)+'</b><p>已打卡 '+(progress.completedDates||[]).length+' / '+(Number(progress.goal)||21)+' 天 · 不必连续完成</p><div class="gc-progress"><i style="width:'+Math.min(100,(progress.completedDates||[]).length/(Number(progress.goal)||21)*100)+'%"></i></div>':'<p>选择一个喜欢的小习惯，开始记录每一天。</p>')+
 '</section></div>';
}
function detail(ctx,day){
 const j=mood(ctx,day),a=marks(ctx,day),h=hwItems(ctx,day),done=h.filter(it=>it.done===true||it.hw&&it.hw.done).length,hs=habits(ctx),ms=moments(ctx,day),daySchedule=items(ctx,day);
 const date=dt(day),past=day<=iso(new Date());
 return '<div class="gc-detail"><div class="gc-detail-date">'+(date.getMonth()+1)+'月'+date.getDate()+'日 · 周'+weekday(day)+'</div>'+
 '<h1>这一天的成长手账</h1><div class="gc-detail-marks">'+(a.map(x=>'<span>'+badge(x)+' '+esc(x.text)+'</span>').join('')||'<p>这一天还没有留下记录。</p>')+'</div>'+
 '<section><h2>今天的心情</h2><p>'+(j&&j.mood?esc(MOOD_LABEL[j.mood]||'今天的心情'):'还没有记录心情')+'</p><p class="gc-handwriting">'+(j&&j.text?esc(j.text):'可以写几个字，记住这一天。')+'</p><button type="button" data-up="journal-edit" data-date="'+day+'">'+(j?'修改心情与短句':'记录心情与短句')+'</button></section>'+
 '<section><h2>任务与日程</h2><p>作业完成 '+done+' / '+h.length+' 项；课程和携带物品只作提醒。</p>'+
 (daySchedule.length?'<ul>'+daySchedule.slice(0,8).map(it=>'<li>'+esc(when(it)?when(it)+' · ':'')+esc(label(it))+'</li>').join('')+'</ul>':'<p>这一天还没有安排。</p>')+'</section>'+
 '<section><h2>习惯打卡</h2>'+(hs.length?hs.map(h=>'<div class="gc-detail-habit"><span>'+esc(h.title)+'</span><button type="button" data-up="growth-habit-check" data-id="'+esc(h.id)+'" data-date="'+day+'" '+(!past?'disabled':'')+'>'+ (checked(h,day)?'✓ 已打卡':'○ 记一次')+'</button></div>').join(''):'<p>还没有正在进行的21天挑战。</p>')+
 '<button type="button" data-up="growth-habit-new">＋ 创建习惯挑战</button></section>'+
 '<section><h2>特别时刻</h2>'+(ms.map(x=>'<p>✿ '+esc(x.text)+'</p>').join('')||'<p>有值得纪念的小事，可以写在这里。</p>')+
 '<button type="button" data-up="growth-moment-new" data-date="'+day+'">＋ 添加特别时刻</button></section></div>';
}
function habitForm(){return '<div class="gc-detail"><h1>开启21天习惯挑战</h1><p>坚持是慢慢积累的，不需要每天连续完成。</p><label for="gc-habit-name">想培养什么小习惯？</label><input id="gc-habit-name" maxlength="24" placeholder="例如：每天阅读20分钟"><p id="gc-growth-error" role="status"></p><button type="button" data-up="growth-habit-save">开始挑战</button></div>';}
function momentForm(day){return '<div class="gc-detail"><h1>收藏特别时刻</h1><p>'+esc(day)+' · 留下一件值得纪念的小事</p><label for="gc-moment-text">想记录什么？</label><textarea id="gc-moment-text" maxlength="80" rows="3" placeholder="例如：第一次独立完成了画作"></textarea><input type="hidden" id="gc-moment-date" value="'+esc(day)+'"><p id="gc-growth-error" role="status"></p><button type="button" data-up="growth-moment-save">收藏这一天</button></div>';}
root.GrowthCalendar={render:function(ctx){return ctx.range==='month'?month(ctx):week(ctx);},detail:detail,habitForm:habitForm,momentForm:momentForm,marks:marks};
})(window);
