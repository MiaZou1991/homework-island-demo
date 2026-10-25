/* V2 reminders have no completion or reward state. Historical checkins stay in backups. */
const IslandReminders=(()=>{
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function details(it){const v=it.kind==='class'?it.cls:it.ev;return {name:v.name||v.title||'日程',start:v.start||'',end:v.end||'',place:v.place||'',owner:it.kind==='class'?'家长安排':v.owner==='child'?'我自己加的':'家长安排',note:v.note||'',bring:it.kind==='class'?(v.bring||[]):(v.checklist||[]).map(x=>x.name),departure:v.departure||''};}
 function status(it,day,now=new Date()){
  const v=details(it),today=dateStr(now);if(day!==today)return day<today?'历史安排':'即将到来';
  const mins=now.getHours()*60+now.getMinutes(),start=timeToMin(v.start),end=timeToMin(v.end);
  if(end!=null&&mins>=end)return '已结束';
  if(start!=null&&mins>=start)return end==null?'已到开始时间':'进行中';
  return '待开始';
 }
 function next(items,day,now=new Date()){return items.filter(x=>x.kind!=='homework'&&status(x,day,now)!=='已结束').sort((a,b)=>(a.time??99999)-(b.time??99999))[0]||null;}
 function card(it,day){const v=details(it);return `<section class="v2-reminder"><p class="up-eyebrow">${escape(v.owner)} · ${escape(status(it,day))}</p><p><b>${escape(v.start||'时间待定')}${v.end?'–'+escape(v.end):''}</b></p>${v.place?`<p>地点：${escape(v.place)}</p>`:''}<h2>需要携带</h2><ul class="v2-bring">${v.bring.length?v.bring.map(x=>`<li>${escape(x)}</li>`).join(''):'<li>无需携带额外物品</li>'}</ul>${v.note?`<p>${escape(v.note)}</p>`:''}<p class="up-muted">按安排查看提醒即可，无需打卡。</p></section>`;}
 return {details,status,next,card};
})();
const buildTimelineV1=buildDayTimeline;
buildDayTimeline=function(d,day){const t=buildTimelineV1(d,day);t.items=t.items.map(x=>x.kind==='homework'?x:{...x,done:false});return t;};
renderTlClass=function(it){return IslandReminders.card({...it,kind:'class'},it.date||todayStr());};
renderTlEvent=function(it){return IslandReminders.card({...it,kind:'event'},it.date||todayStr());};
toggleBringItem=toggleEventItem=toggleEventDone=function(){showToast('课程和携带物品只作提醒，无需勾选。');return false;};
