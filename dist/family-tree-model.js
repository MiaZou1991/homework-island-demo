/* 开心岛家庭树｜V2.1 纯业务规则。
 * 生产环境须由服务端身份、家庭时区、并发事务与幂等唯一键兜底。
 * 此模块不调用同步接口、不读取生产家庭 JSON。 */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 root.FamilyTreeModel=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const members=[{id:"kid",name:"开心"},{id:"mom",name:"妈妈"},{id:"dad",name:"爸爸"}];
 const types=[{id:"growth",name:"新本领"},{id:"together",name:"一起经历"},{id:"happy",name:"开心瞬间"}];
 const growthStages=[
  {months:0,name:"初芽树",capacity:2},{months:6,name:"幼树",capacity:3},
  {months:18,name:"成长树",capacity:4},{months:30,name:"开花树",capacity:5},
  {months:42,name:"繁盛树",capacity:6},{months:60,name:"家庭大树",capacity:8}
 ];
 const decorationMilestones=[1,10,30,60,120,240,400,650,1000];
 const validMember=id=>members.some(x=>x.id===id);
 const copy=x=>JSON.parse(JSON.stringify(x));
 const clean=(value,limit)=>{
  const t=String(value==null?"":value).trim();
  if(!t||t.length>limit)throw Error("请填写1～"+limit+"字的内容");
  return t;
 };
 const validDate=value=>{
  const t=String(value||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(t))throw Error("日期格式不正确");
  const [y,m,d]=t.split("-").map(Number);
  const date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw Error("日期无效");
  return t;
 };
 function dateInZone(iso,zone="Asia/Shanghai"){
  // Preview-only formatter: production MUST provide a server-authoritative date.
  const d=new Date(iso||new Date().toISOString());
  if(!Number.isFinite(d.getTime()))throw Error("时间无效");
  let parts;
  try{
   parts=new Intl.DateTimeFormat("en-US",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  }catch(_){throw Error("家庭时区无效");}
  const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return v.year+"-"+v.month+"-"+v.day;
 }
 const addMonths=(origin,months)=>{
  const [y,m,d]=validDate(origin).split("-").map(Number);
  const first=new Date(Date.UTC(y,m-1+months,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return first.getUTCFullYear()+"-"+String(first.getUTCMonth()+1).padStart(2,"0")+"-"+String(Math.min(d,last)).padStart(2,"0");
 };
 function publicState(x){
  const a=x&&typeof x==="object"?x:{};
  return {version:1,moments:Array.isArray(a.moments)?a.moments:[],
   notes:Array.isArray(a.notes)?a.notes:[],replies:Array.isArray(a.replies)?a.replies:[]};
 }
 function privateState(x){
  const a=x&&typeof x==="object"?x:{};
  return {version:2,hearts:Array.isArray(a.hearts)?a.hearts:[],
   reactions:Array.isArray(a.reactions)?a.reactions:[]};
 }
 function treeGrowth(value,opts={}){
  const activation=validDate(opts.activationDate||"2026-11-10");
  const current=validDate(opts.today||dateInZone(null,opts.timeZone||"Asia/Shanghai"));
  const count=typeof value==="number"?Math.max(0,Math.floor(Number.isFinite(value)?value:0)):
   privateState(value).hearts.length+privateState(value).reactions.length;
  if(current<activation) return growthSummary(0,0,activation,current,count);
  let elapsed=0;
  while(elapsed<60 && addMonths(activation,elapsed+1)<=current)elapsed++;
  const stageIndex=growthStages.reduce((last,entry,i)=>elapsed>=entry.months?i:last,0);
  return growthSummary(stageIndex,elapsed,activation,current,count);
 }
 function growthSummary(stage,elapsed,activation,current,count){
  const next=growthStages[stage+1]||null,stageDef=growthStages[stage];
  const nextOn=next?addMonths(activation,next.months):null;
  const unlocked=decorationMilestones.filter(n=>count>=n).length;
  const decorationCount=Math.min(stageDef.capacity,unlocked);
  return {
   stage,name:stageDef.name,elapsedMonths:elapsed,years:Math.floor(elapsed/12),
   months:elapsed%12,activationDate:activation,today:current,nextOn,
   monthsToNext:next?Math.max(0,next.months-elapsed):0,
   count,decorationCount,decorationCapacity:stageDef.capacity,decorationMilestones,
   levels:growthStages.map(x=>x.months),stageCount:growthStages.length
  };
 }
 const meta=(now,id)=>({
  id:String(id||("ft_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,9))),
  createdAt:String(now||new Date().toISOString())
 });
 const own=(entry,actor)=>{if(!entry||entry.author!==actor)throw Error("只能修改自己的记录");};
 function applyPublic(previous,actor,action,now,id){
  if(!validMember(actor))throw Error("请先验证家庭成员身份");
  if(!action||typeof action!=="object")throw Error("操作无效");
  const state=copy(publicState(previous)),m=meta(now,id),find=list=>list.find(x=>x.id===action.id);
  let item;
  switch(action.type){
   case "addMoment":
    if(state.moments.length>=500)throw Error("家庭树记录已达上限");
    if(!types.some(x=>x.id===action.category))throw Error("请选择记录类别");
    state.moments.push({...m,author:actor,day:validDate(action.day),category:action.category,
     text:clean(action.text,300)});break;
   case "editMoment":
    item=find(state.moments);own(item,actor);
    item.text=clean(action.text,300);item.day=validDate(action.day);
    if(!types.some(x=>x.id===action.category))throw Error("请选择记录类别");
    item.category=action.category;item.updatedAt=m.createdAt;break;
   case "deleteMoment":
    own(find(state.moments),actor);state.moments=state.moments.filter(x=>x.id!==action.id);
    state.replies=state.replies.filter(x=>x.momentId!==action.id &&
     !(x.targetType==="moment"&&x.targetId===action.id));break;
   case "addNote":
    if(state.notes.length>=300)throw Error("家庭便签已达上限");
    state.notes.push({...m,author:actor,text:clean(action.text,180)});break;
   case "editNote":
    item=find(state.notes);own(item,actor);item.text=clean(action.text,180);
    item.updatedAt=m.createdAt;break;
   case "deleteNote":
    own(find(state.notes),actor);state.notes=state.notes.filter(x=>x.id!==action.id);
    state.replies=state.replies.filter(x=>x.noteId!==action.id &&
     !(x.targetType==="note"&&x.targetId===action.id));break;
   case "addReply":{
    const kind=action.targetType==="moment"||action.momentId?"moment":"note";
    const targetId=String(kind==="moment"?action.momentId||action.targetId||"":action.noteId||action.targetId||"");
    if(!(kind==="moment"?state.moments:state.notes).some(x=>x.id===targetId))throw Error("这条记录已不存在");
    if(state.replies.length>=1200)throw Error("回复数量已达上限");
    state.replies.push({...m,author:actor,targetType:kind,targetId,
     ...(kind==="moment"?{momentId:targetId}:{noteId:targetId}),text:clean(action.text,120)});break;
   }
   case "editReply":
    item=find(state.replies);own(item,actor);item.text=clean(action.text,120);
    item.updatedAt=m.createdAt;break;
   case "deleteReply":
    own(find(state.replies),actor);state.replies=state.replies.filter(x=>x.id!==action.id);break;
   default:throw Error("不支持的家庭树操作");
  }
  return state;
 }
 function dailyUsage(state,actor,day){
  if(!validMember(actor))return 0;
  return privateState(state).hearts.filter(x=>x.from===actor&&x.day===day).length+
   privateState(state).reactions.filter(x=>x.from===actor&&x.day===day).length;
 }
 function applyPrivate(previous,actor,action,now,id,options={}){
  if(!validMember(actor))throw Error("请先验证家庭成员身份");
  if(!action||typeof action!=="object")throw Error("操作无效");
  const state=copy(privateState(previous)),m=meta(now,id);
  const day=options.serverDay?validDate(options.serverDay):dateInZone(m.createdAt,options.timeZone||"Asia/Shanghai");
  if(action.type==="sendHeart"||action.type==="reactRecord"){
   // Idempotent replay: return existing state instead of charging twice.
   if(state.hearts.some(x=>x.id===m.id)||state.reactions.some(x=>x.id===m.id))return state;
   if(dailyUsage(state,actor,day)>=2)throw Error("今天的爱心已送完啦，明天再来");
   if(action.type==="sendHeart"){
    if(!validMember(action.to)||action.to===actor)throw Error("请选择要送达的家人");
    if(state.hearts.length>=5000)throw Error("爱心记录已达上限");
    state.hearts.push({...m,day,from:actor,to:action.to,text:clean(action.text,120),readAt:null});
   }else{
    const type=action.recordType,idText=String(action.recordId||"");
    if(!["moment","note"].includes(type)||!idText)throw Error("请选择家庭记录");
    if(!validMember(action.targetAuthor)||action.targetAuthor===actor)throw Error("不能给自己的记录送心");
    if(state.reactions.some(x=>x.from===actor&&x.recordType===type&&x.recordId===idText))
     throw Error("这条记录已经送过爱心啦");
    state.reactions.push({...m,day,from:actor,to:action.targetAuthor,recordType:type,recordId:idText});
   }
  }else if(action.type==="readHeart"){
   const item=state.hearts.find(x=>x.id===action.id);
   if(!item||item.to!==actor)throw Error("只有收信人可以确认收到");
   if(!item.readAt)item.readAt=m.createdAt;
  }else throw Error("不支持的爱心操作");
  return state;
 }
 function visibleHearts(previous,actor){
  if(!validMember(actor))return [];
  return privateState(previous).hearts.filter(x=>x.from===actor||x.to===actor).map(copy);
 }
 return {members,types,growthStages,decorationMilestones,validMember,dateInZone,addMonths,
  publicState,privateState,treeGrowth,dailyUsage,applyPublic,applyPrivate,visibleHearts};
});