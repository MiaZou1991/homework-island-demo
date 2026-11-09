/* Family calendar helpers: metadata never grants editing permission. */
(function(root){
 const labels={all:'全家',child:'开心',dad:'爸爸',mom:'妈妈'};
 function members(v){return Array.isArray(v.members)&&v.members.length?v.members:['child'];}
 function visible(it,member){return member==='all'||it.kind!=='event'&&member==='child'||it.kind==='event'&&(members(it.ev).includes('all')||members(it.ev).includes(member));}
 function number(s){if(/^\d+$/.test(s))return +s;const n={'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};if(s==='十')return 10;if(s.includes('十')){const [a,b]=s.split('十');return (a?n[a]:1)*10+(b?n[b]:0);}return n[s];}
 function parse(text,defaults){
  const out={title:text.trim(),date:defaults.date,start:'',members:[defaults.member||'all']};
  let inferred=[];if(/全家|一家/.test(text))inferred=['all'];else{if(/开心|孩子/.test(text))inferred.push('child');if(/爸爸/.test(text))inferred.push('dad');if(/妈妈/.test(text))inferred.push('mom');}if(inferred.length)out.members=inferred;
  const match=text.match(/(上午|早上|中午|下午|晚上)?\s*([零一二两三四五六七八九十\d]{1,3})(?:[:：]([0-5]\d)|[点时](半|一刻|三刻|[零一二两三四五六七八九十\d]{1,3}分?)?)/);
  if(match){let h=number(match[2]),min=match[3]!==undefined?+match[3]:match[4]==='半'?30:match[4]==='一刻'?15:match[4]==='三刻'?45:match[4]?number(match[4].replace('分','')):0;if(['下午','晚上','中午'].includes(match[1])&&h<12)h+=12;if(['上午','早上'].includes(match[1])&&h===12)h=0;if(h>=0&&h<24&&min>=0&&min<60){out.start=String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');out.title=out.title.replace(match[0],'').trim();}}
  out.title=out.title.replace(/^[，,\s]+/,'')||text.trim();return out;
 }
 // Recompute from the currently visible day's classes and event preparation lists.
 // No completion flag is written: carrying items are read-only reminders.
 function packingItems(items){
  const seen=new Set();
  for(const it of Array.isArray(items)?items:[]){
   const source=it?.kind==='class'?it.cls?.bring:it?.kind==='event'?it.ev?.checklist:null;
   for(const value of Array.isArray(source)?source:[]){
    const raw=typeof value==='string'?value:value?.name;
    if(typeof raw!=='string')continue;
    const name=raw.trim();
    if(name)seen.add(name);
   }
  }
  return [...seen];
 }
 function art(title){return /游泳|泳/.test(title)?'assets/hd/ui/item-swim-cap.png':/读|书|阅读/.test(title)?'assets/characters/icon_book.png':/公园|散步|外婆|骑/.test(title)?'assets/hd/nature-tree-branch.png':'assets/hd/course/calendar-clock.png';}
 root.FamilySchedule={labels,members,visible,parse,art,packingItems};
 if(typeof module!=='undefined')module.exports=root.FamilySchedule;
})(typeof window!=='undefined'?window:globalThis);
