/* 开心岛家庭树：纯业务规则。不读取生产家庭 JSON，不触碰同步/积分。 */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FamilyTreeModel=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const members=[
    {id:"kid",name:"开心"},{id:"mom",name:"妈妈"},{id:"dad",name:"爸爸"}
  ];
  const types=[{id:"growth",name:"新本领"},{id:"together",name:"一起经历"},{id:"happy",name:"开心瞬间"}];
  // Visual growth only: no points, rewards or settlement. Production needs a
  // trusted aggregated counter, never private letter contents or recipient data.
  const growthStages=[
    {at:0,name:"小树萌芽",hint:"给家人送出第一封爱心吧"},
    {at:3,name:"枝叶舒展",hint:"每份心意，都在陪它成长"},
    {at:8,name:"开花结果",hint:"家人的温暖长成了花和果实"},
    {at:16,name:"繁茂大树",hint:"爱一直都在，树会继续陪伴家人"}
  ];
  function treeGrowth(heartsOrCount){
    const count=typeof heartsOrCount==="number"?
      Math.max(0,Math.floor(Number.isFinite(heartsOrCount)?heartsOrCount:0)):
      privateState(heartsOrCount).hearts.length;
    let stage=0;
    for(let i=0;i<growthStages.length;i++)if(count>=growthStages[i].at)stage=i;
    const next=growthStages[stage+1]?.at??null;
    return {count,stage,name:growthStages[stage].name,hint:growthStages[stage].hint,next,levels:growthStages.map(x=>x.at)};
  }
  const validMember=id=>members.some(m=>m.id===id);
  const text=(value,limit)=>{
    const s=String(value==null?"":value).trim();
    if(!s||s.length>limit)throw new Error("请填写1～"+limit+"字的内容");
    return s;
  };
  const date=value=>{
    const s=String(value||"");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error("日期格式不正确");
    const d=new Date(s+"T12:00:00");
    if(!Number.isFinite(d.getTime())||[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")!==s)throw new Error("日期无效");
    return s;
  };
  function publicState(obj){
    const x=obj&&typeof obj==="object"?obj:{};
    return {version:1,moments:Array.isArray(x.moments)?x.moments:[],
      notes:Array.isArray(x.notes)?x.notes:[],
      replies:Array.isArray(x.replies)?x.replies:[]};
  }
  function privateState(obj){
    const x=obj&&typeof obj==="object"?obj:{};
    return {version:1,hearts:Array.isArray(x.hearts)?x.hearts:[]};
  }
  const copy=x=>JSON.parse(JSON.stringify(x));
  const record=(now,id)=>({
    id:String(id||("ft_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,9))),
    createdAt:String(now||new Date().toISOString())
  });
  const own=(entry,actor)=>{if(!entry||entry.author!==actor)throw new Error("只能修改自己的记录");};
  function applyPublic(previous,actor,action,now,id){
    if(!validMember(actor))throw new Error("请先验证家庭成员身份");
    if(!action||typeof action!=="object")throw new Error("操作无效");
    const state=copy(publicState(previous));
    const meta=record(now,id),find=(list)=>list.find(x=>x.id===action.id);
    let item;
    switch(action.type){
      case "addMoment":{
        if(state.moments.length>=500)throw new Error("家庭树记录已达上限");
        if(!types.some(t=>t.id===action.category))throw new Error("请选择记录类别");
        item={...meta,author:actor,day:date(action.day),category:action.category,
          text:text(action.text,300)};
        state.moments.push(item);break;
      }
      case "editMoment":{
        item=find(state.moments);own(item,actor);
        item.text=text(action.text,300);
        item.day=date(action.day);
        if(!types.some(t=>t.id===action.category))throw new Error("请选择记录类别");
        item.category=action.category;item.updatedAt=meta.createdAt;break;
      }
      case "deleteMoment":{
        own(find(state.moments),actor);
        state.moments=state.moments.filter(x=>x.id!==action.id);
        state.replies=state.replies.filter(x=>x.momentId!==action.id && !(x.targetType==="moment"&&x.targetId===action.id));break;
      }
      case "addNote":{
        if(state.notes.length>=300)throw new Error("家庭便签已达上限");
        item={...meta,author:actor,text:text(action.text,180)};
        state.notes.push(item);break;
      }
      case "editNote":{
        item=find(state.notes);own(item,actor);
        item.text=text(action.text,180);item.updatedAt=meta.createdAt;break;
      }
      case "deleteNote":{
        own(find(state.notes),actor);
        state.notes=state.notes.filter(x=>x.id!==action.id);
        state.replies=state.replies.filter(x=>x.noteId!==action.id && !(x.targetType==="note"&&x.targetId===action.id));break;
      }
      case "addReply":{
        const targetType=action.targetType==="moment"||action.momentId?"moment":"note";
        const targetId=targetType==="moment"?String(action.momentId||action.targetId||""):String(action.noteId||action.targetId||"");
        const targets=targetType==="moment"?state.moments:state.notes;
        if(!targets.some(x=>x.id===targetId))throw new Error("这条故事已不存在");
        if(state.replies.length>=1200)throw new Error("回复数量已达上限");
        item={...meta,author:actor,targetType,targetId,
          ...(targetType==="moment"?{momentId:targetId}:{noteId:targetId}),
          text:text(action.text,120)};
        state.replies.push(item);break;
      }
      case "editReply":{
        item=find(state.replies);own(item,actor);
        item.text=text(action.text,120);item.updatedAt=meta.createdAt;break;
      }
      case "deleteReply":{
        own(find(state.replies),actor);
        state.replies=state.replies.filter(x=>x.id!==action.id);break;
      }
      default:throw new Error("不支持的家庭树操作");
    }
    return state;
  }
  function applyPrivate(previous,actor,action,now,id){
    if(!validMember(actor))throw new Error("请先验证家庭成员身份");
    if(!action||typeof action!=="object")throw new Error("操作无效");
    const state=copy(privateState(previous));
    const meta=record(now,id);
    if(action.type==="sendHeart"){
      if(!validMember(action.to)||action.to===actor)throw new Error("请选择要送达的家人");
      if(state.hearts.length>=500)throw new Error("私密爱心记录已达上限");
      state.hearts.push({...meta,from:actor,to:action.to,text:text(action.text,120),readAt:null});
    }else if(action.type==="readHeart"){
      const item=state.hearts.find(x=>x.id===action.id);
      if(!item||item.to!==actor)throw new Error("只有收信人可以确认收到");
      item.readAt=meta.createdAt;
    }else throw new Error("不支持的爱心操作");
    return state;
  }
  function visibleHearts(previous,actor){
    if(!validMember(actor))return [];
    return privateState(previous).hearts.filter(x=>x.from===actor||x.to===actor).map(copy);
  }
  return {members,types,growthStages,treeGrowth,validMember,publicState,privateState,applyPublic,applyPrivate,visibleHearts};
});
