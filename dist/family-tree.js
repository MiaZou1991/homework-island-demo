(() => {
"use strict";
const $=id=>document.getElementById(id), M=window.FamilyTreeModel;
if(!M)throw Error("家庭树规则未加载");
const PUB="kaixin_family_tree_public_preview_v1",PRIV="kaixin_family_tree_private_preview_v1";
const META="kaixin_family_tree_meta_preview_v21";
const ZONE="Asia/Shanghai"; // preview only; production reads the household's fixed zone from authenticated backend
const names=Object.fromEntries(M.members.map(x=>[x.id,x.name]));
const kinds=Object.fromEntries(M.types.map(x=>[x.id,x.name]));
let actor="kid",section="stories",recordFilter="all",heartView="received";
let editing=null,publicData,privateData,activatedOn,pendingHeartId=null,heartBusy=false;
let photoUrls=[],lastGrowthStage=0;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const iso=()=>new Date().toISOString();
const nowDay=()=>M.dateInZone(iso(),ZONE);
const localRead=(key,parse)=>{
 try{return parse(JSON.parse(localStorage.getItem(key)||"null"));}
 catch(_){return parse(null);}
};
const makeID=()=>("pv_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,11));
function sample(){
 const day=nowDay();
 return {version:1,moments:[
 {id:"sample-growth",author:"kid",day,category:"growth",text:"今天我敢把头埋进水里啦！",createdAt:iso()},
 {id:"sample-together",author:"mom",day,category:"together",text:"我们在海边散步，发现了漂亮的小贝壳。",createdAt:new Date(Date.now()-86400000).toISOString()}
 ],notes:[{id:"sample-note",author:"kid",text:"今天我敢把头埋进水里啦！",createdAt:iso()}],
 replies:[{id:"sample-reply",noteId:"sample-note",author:"dad",text:"周末教教我吧。",createdAt:iso()}]};
}
function load(){
 const existing=localStorage.getItem(PUB);
 publicData=existing===null?sample():localRead(PUB,M.publicState);
 privateData=localRead(PRIV,M.privateState);
 if(existing===null)localStorage.setItem(PUB,JSON.stringify(publicData));
 let meta=localRead(META,x=>x&&typeof x==="object"?x:{});
 if(!meta.activatedOn||!/^\d{4}-\d{2}-\d{2}$/.test(meta.activatedOn)){
  meta={activatedOn:nowDay(),lastStage:0};localStorage.setItem(META,JSON.stringify(meta));
 }
 activatedOn=meta.activatedOn;
 lastGrowthStage=Number(meta.lastStage)||0;
 $("previewNotice").hidden=false;
}
function growth(){
 const param=new URLSearchParams(location.search);
 const day=param.get("preview")==="1"&&/^\d{4}-\d{2}-\d{2}$/.test(param.get("treeDate")||"")?
 param.get("treeDate"):nowDay();
 return M.treeGrowth(privateData,{activationDate:activatedOn,today:day});
}
function remaining(){return Math.max(0,2-M.dailyUsage(privateData,actor,nowDay()));}
function feedback(v){$("feedback").textContent=v||"";}
function savePublic(action){
 const updated=M.applyPublic(localRead(PUB,M.publicState),actor,action,iso(),action.operationId||makeID());
 localStorage.setItem(PUB,JSON.stringify(updated));
 publicData=updated;render();
}
function savePrivate(action,id){
 const requestId=id||action.operationId||makeID();
 const updated=M.applyPrivate(localRead(PRIV,M.privateState),actor,action,iso(),requestId,{timeZone:ZONE});
 localStorage.setItem(PRIV,JSON.stringify(updated));
 privateData=updated;render();
 return requestId;
}
function perform(action,isPrivate=false,message="已保存到体验记录",id=null){
 try{
  if(isPrivate)savePrivate(action,id);else savePublic(action);
  feedback(message);return true;
 }catch(e){
  const msg=e&&e.message||"暂时保存失败，请稍后重试";
  feedback(msg);
  if(isPrivate||/QuotaExceededError|配额|失败/.test(msg))showPopup("error","操作没有成功",
    "<p>"+esc(msg)+"</p><p>内容仍保留在当前输入框，请检查后重试。</p>",
    [{text:"返回检查",close:true}]);
  return false;
 }
}
function dismissPopup(){if($("ftModal").open)$("ftModal").close();}
function showPopup(kind,title,body,actions){
 const dlg=$("ftModal");dismissPopup();
 $("ftModalIcon").textContent={success:"♥",quota:"♡",growth:"🌱",delete:"🍃",error:"☁",help:"📜"}[kind]||"♡";
 $("ftModalTitle").textContent=title;
 $("ftModalBody").innerHTML=body;
 $("ftModalActions").replaceChildren();
 for(const item of actions||[{text:"知道了",close:true}]){
  const button=document.createElement("button");
  button.type="button";button.textContent=item.text;
  button.className=item.kind==="danger"?"ft-danger":item.kind==="primary"?"ft-primary":"ft-secondary";
  button.addEventListener("click",()=>{if(item.close!==false)dismissPopup();if(item.onClick)item.onClick();});
  $("ftModalActions").append(button);
 }
 dlg.dataset.kind=kind;dlg.showModal();
}
function quotaPopup(){
 showPopup("quota","今日的爱心已送达",
  "<p>你今天已经送出了 2 颗爱心。</p><p>明天又能继续给家人送心意啦，不需要连续打卡。</p>");
}
function listStories(){
 return [
  ...publicData.moments.map(x=>({...x,recordType:"moment",sortDay:x.day||x.createdAt?.slice(0,10)||""})),
  ...publicData.notes.map(x=>({...x,recordType:"note",sortDay:x.createdAt?.slice(0,10)||""}))
 ].sort((a,b)=>(b.sortDay||"").localeCompare(a.sortDay||"")||
 (b.createdAt||"").localeCompare(a.createdAt||""));
}
function findEntry(type,id){
 const a=type==="moment"?publicData.moments:type==="note"?publicData.notes:publicData.replies;
 return a.find(x=>x.id===id);
}
function storyHearts(item){
 const list=privateData.reactions||[];
 const mine=list.some(r=>r.from===actor&&r.recordType===item.recordType&&r.recordId===item.id);
 const count=list.filter(r=>r.recordType===item.recordType&&r.recordId===item.id).length;
 const self=item.author===actor,can=!self&&!mine&&remaining()>0;
 return '<button type="button" class="ft-story-heart" data-react="'+esc(item.recordType)+'" data-id="'+esc(item.id)+
 '" '+(can?"":"disabled")+' aria-label="送爱心给这条记录">'+
 (mine?"♥ 已送心":"♡ 送爱心")+(count?" · "+count:"")+'</button>';
}
function actions(kind,item){
 if(item.author!==actor)return "";
 return '<div class="ft-paper-tools"><button type="button" class="ft-text-button" data-edit="'+kind+'" data-id="'+esc(item.id)+'">修改</button>'+
 '<button type="button" class="ft-text-button danger" data-delete="'+kind+'" data-id="'+esc(item.id)+'">删除</button></div>';
}
function thread(kind,id){
 const replies=publicData.replies.filter(x=>(x.targetType===kind&&x.targetId===id)||
 (kind==="moment"?x.momentId===id:x.noteId===id))
 .sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
 return '<div class="ft-replies" aria-label="家人回复">'+replies.map(x=>
 '<div class="ft-reply" data-reply="'+esc(x.id)+'"><span class="ft-reply-name">'+esc(names[x.author]||"家人")+'：</span>'+
 '<span class="ft-reply-content">'+esc(x.text)+'</span>'+
 (x.author===actor?'<span class="ft-reply-tools"><button type="button" class="ft-text-button" data-edit="reply" data-id="'+esc(x.id)+'">改</button>'+
 '<button type="button" class="ft-text-button danger" data-delete="reply" data-id="'+esc(x.id)+'">删</button></span>':"")+
 '</div>').join("")+
 '<form class="ft-reply-form" data-record-type="'+kind+'" data-record-id="'+esc(id)+'">'+
 '<input name="reply" type="text" maxlength="120" placeholder="回复这条家庭记录…" required aria-label="写一条回复">'+
 '<button type="submit">回复</button></form></div>';
}
function renderStories(){
 const all=listStories();
 const shown=all.filter(x=>recordFilter==="all"||x.recordType===recordFilter);
 $("storiesList").innerHTML=shown.length?shown.map(x=>{
  const isMoment=x.recordType==="moment";
  return '<article class="ft-paper ft-story-item '+(isMoment?"is-moment":"is-note")+
  '" data-'+(isMoment?"moment":"note")+'="'+esc(x.id)+'">'+
  '<div class="ft-paper-head"><span class="ft-category '+(isMoment?"ft-category-moment":"ft-category-note")+
  '">'+(isMoment?"成长回忆":"家庭便签")+'</span><span>'+esc(x.sortDay)+" · "+esc(names[x.author]||"家人")+
  '</span></div><div class="ft-paper-copy">'+esc(x.text)+'</div>'+
  '<div class="ft-record-controls">'+storyHearts(x)+
  '<button type="button" class="ft-text-button" data-view="'+x.recordType+'" data-id="'+esc(x.id)+'">查看详情</button></div>'+
  actions(x.recordType,x)+thread(x.recordType,x.id)+'</article>';
 }).join(""):'<div class="ft-empty"><b>树下还没有记录</b>写下成长的小事，或留句话给家人吧。</div>';
 const pinned=all.slice(0,3);
 $("treeTags").innerHTML=pinned.length?pinned.map((x,i)=>
  '<button type="button" class="ft-tree-tag" data-view="'+x.recordType+'" data-id="'+esc(x.id)+'">'+
  '<b>'+esc(names[x.author]||"家人")+'：</b><span>'+esc(x.text.length>16?x.text.slice(0,16)+"…":x.text)+'</span></button>'
 ).join(""):'<button type="button" class="ft-tree-tag" data-open="story">写第一条家庭记录 ✎</button>';
}
function renderHearts(){
 const entries=M.visibleHearts(privateData,actor).filter(x=>heartView==="received"?x.to===actor:x.from===actor)
 .sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
 $("heartsList").innerHTML=entries.length?entries.map(x=>
  '<article class="ft-paper ft-heart-line" data-heart="'+esc(x.id)+'">'+
  '<div class="ft-paper-head"><span>'+(heartView==="received"?"来自 "+esc(names[x.from]):"送给 "+esc(names[x.to]))+
  '</span><span>'+esc((x.createdAt||"").slice(0,10))+'</span></div>'+
  '<div class="ft-heart-message">'+esc(x.text)+'</div>'+
  (heartView==="received"?'<div class="ft-paper-tools">'+(x.readAt?
   '<span class="ft-meta">已收到这份心意 ♡</span>':
   '<button type="button" class="ft-text-button" data-read="'+esc(x.id)+'">♡ 收到了</button>')+
   '</div>':'<span class="ft-meta">'+(x.readAt?"对方已收到":"爱心已送出")+'</span>')+'</article>'
 ).join(""):'<div class="ft-empty"><b>'+(heartView==="received"?"还没有收到爱心":"还没有送出爱心")+
 '</b>每一封心意，都值得珍藏。</div>';
}
function render(){
 $("activeMember").value=actor;
 document.querySelectorAll(".ft-tabs button").forEach(b=>b.setAttribute("aria-current",b.dataset.section===section?"page":"false"));
 document.querySelectorAll(".ft-page").forEach(x=>x.hidden=x.dataset.page!==section);
 document.querySelectorAll("[data-filter]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.filter===recordFilter)));
 document.querySelectorAll("[data-heart-view]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.heartView===heartView)));
 $("heartTo").innerHTML=M.members.filter(x=>x.id!==actor).map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join("");
 renderStories();renderHearts();
 const left=remaining(),used=2-left;
 $("heartRemaining").textContent="今天已送出 "+used+" / 2 颗爱心，"+(left?"还能送 "+left+" 颗":"今天的心意已送达");
 $("heartQuota").textContent=left?"今天还能送出 "+left+" / 2 颗爱心":"今日额度 2 / 2 已送完";
 $("heartSubmit").disabled=left===0||heartBusy;
 $("heartSubmit").textContent=heartBusy?"正在寄出……":left===0?"今天已送完":"♡ 送出爱心";
 const g=growth();
 $("treeHeartCount").textContent=String(g.count);
 $("treeStage").textContent=g.name;
 $("treeAge").textContent="已陪伴 "+g.years+"年"+g.months+"个月";
 $("treeNext").textContent=g.nextOn?"下阶段 "+g.nextOn+" 解锁":"五周年已到，小树长成大树";
 $("treeGrowthProgress").setAttribute("aria-valuenow",String(g.stage));
 document.querySelector(".ft-hero").dataset.growthStage=String(g.stage);
 document.querySelector(".ft-hero").dataset.decoration=String(g.decorationCount);
}
function growthPopup(){
 const g=growth(),list=M.growthStages.map((item,i)=>{
  const unlocked=i<=g.stage;
  return '<li class="'+(unlocked?"ft-unlocked":"")+'">'+
   '<span>'+(unlocked?"🌿":"♡")+"</span><strong>"+esc(item.name)+"</strong>"+
   '<small>第 '+(item.months/12).toFixed(item.months%12?1:0)+' 年 · '+esc(M.addMonths(activatedOn,item.months))+
   '</small></li>';
 }).join("");
 showPopup("growth","小树的五年成长旅程",
  "<p>已陪伴 "+g.years+"年"+g.months+"个月，家人累计送出 "+g.count+
  " 颗爱心。爱心能增添花叶心灯，但不能提前跨越五年的成长时间。</p>"+
  '<ul class="ft-growth-list">'+list+"</ul>"+
  "<p>当前阶段已展现 "+g.decorationCount+" / "+g.decorationCapacity+
  " 处装饰。五周年后树体不再继续放大。</p>",[{text:"回到家庭树",close:true,kind:"primary"}]);
}
function openDetail(kind,id){
 const x=findEntry(kind,id);if(!x)return;
 $("storyDetailTitle").textContent=kind==="moment"?"成长回忆":"家庭便签";
 $("storyDetailContent").innerHTML=
  '<div class="ft-detail-meta">'+esc(names[x.author]||"家人")+
  " · "+esc(x.day||(x.createdAt||"").slice(0,10))+"</div>"+
  '<p class="ft-detail-text">'+esc(x.text)+'</p>'+thread(kind,id);
 $("storyDetail").showModal();
}
function editorControls(){
 if(!editing)return;
 const kind=editing.kind;
 $("editorTitle").textContent=editing.id?"修改家庭记录":kind==="reply"?"修改回复":"写一条家庭记录";
 $("editorTypeWrap").hidden=!!editing.id||kind==="reply";
 $("editorText").maxLength=kind==="moment"?300:kind==="note"?180:120;
 $("editorText").placeholder=kind==="moment"?"今天有什么值得记下来的成长小事？":
 kind==="note"?"写一句话挂在家庭树上……":"写给家人的回复……";
 $("editorExtra").replaceChildren();
 if(kind==="moment"){
  const dateLabel=document.createElement("label"),input=document.createElement("input");
  dateLabel.textContent="哪一天";input.type="date";input.name="day";input.required=true;
  input.value=editing.day||nowDay();dateLabel.append(input);
  const cat=document.createElement("select"),label=document.createElement("label");
  label.textContent="回忆类别";cat.name="category";
  M.types.forEach(x=>cat.add(new Option(x.name,x.id)));
  cat.value=editing.category||"growth";label.append(cat);
  $("editorExtra").append(dateLabel,label);
 }
 $("photoPicker").hidden=kind==="reply";
}
function clearPhotos(){
 for(const url of photoUrls)URL.revokeObjectURL(url);
 photoUrls=[];
 $("editorPhoto").value="";
 $("photoStatus").textContent="图片仅预览，尚未接入安全上传服务。";
}
function openEditor(kind,item){
 const selected=kind==="story"?(recordFilter==="note"?"note":"moment"):kind;
 editing={kind:selected,id:item?.id||null,day:item?.day||nowDay(),
  category:item?.category||"growth",initial:item?.text||""};
 $("editorKind").value=selected==="reply"?"note":selected;
 $("editorText").value=item?.text||"";
 clearPhotos();editorControls();
 if($("storyDetail").open)$("storyDetail").close();
 $("editor").showModal();$("editorText").focus();
}
function forceCloseEditor(){if($("editor").open)$("editor").close();editing=null;clearPhotos();}
function closeEditor(){
 if(editing&&($("editorText").value.trim()!==editing.initial||photoUrls.length)){
  showPopup("help","放弃这条草稿吗？",
   "<p>这次填写的内容还没有发布，直接关闭会失去未保存的修改。</p>",[
   {text:"继续编辑",close:true},{text:"放弃草稿",kind:"danger",onClick:forceCloseEditor}
  ]);
 }else forceCloseEditor();
}
function openHeart(){
 if(remaining()===0){quotaPopup();return;}
 pendingHeartId=null;
 $("heartForm").reset();
 render();
 $("heartComposer").showModal();$("heartText").focus();
}
function closeHeart(){
 if($("heartComposer").open)$("heartComposer").close();
 pendingHeartId=null;heartBusy=false;
}
function sendHeart(event){
 event.preventDefault();
 if(heartBusy)return;
 if(remaining()===0){quotaPopup();return;}
 heartBusy=true;render();
 const action={type:"sendHeart",to:$("heartTo").value,text:$("heartText").value};
 pendingHeartId=pendingHeartId||makeID();
 const ok=perform(action,true,"心意已送出（本地体验）",pendingHeartId);
 heartBusy=false;render();
 if(ok){
  closeHeart();heartView="sent";render();
  showPopup("success","爱心送出成功！",
   "<p>这颗心意已经飞向家人，家庭树的爱心数也增加啦。</p><p>今天还剩 "+
   remaining()+" 颗心可以送出。</p>",[{text:"知道啦",kind:"primary"}]);
 }
}
function react(kind,id){
 const entry=findEntry(kind,id);if(!entry)return;
 if(entry.author===actor){showPopup("help","自己也值得被爱","<p>这条记录是你发布的，可以把爱心送给其他家人的记录。</p>");return;}
 if(remaining()===0){quotaPopup();return;}
 const ok=perform({type:"reactRecord",recordType:kind,recordId:id,targetAuthor:entry.author},true,
  "已为家庭记录送出一颗爱心",makeID());
 if(ok)showPopup("success","爱心送达啦！","<p>家人的故事收到了一份温暖，家庭树也多了一份爱心。</p>",
  [{text:"知道啦",kind:"primary"}]);
}
function confirmDelete(type,id){
 const label=type==="reply"?"这条回复":"这条记录";
 showPopup("delete","确认删除"+label+"吗？",
  "<p>删除后无法恢复。"+(type==="reply"?"":"这条记录的相关回复也会一起删除。")+
  "</p><p>此前已成功送出的爱心不会因此退回。</p>",[
  {text:"取消",close:true},{text:"确认删除",kind:"danger",onClick:()=>{
   const action={type:{moment:"deleteMoment",note:"deleteNote",reply:"deleteReply"}[type],id};
   if(perform(action,false,"记录已删除")&&$("storyDetail").open)$("storyDetail").close();
  }}
 ]);
}
function handleRecordClick(event){
 const view=event.target.closest("[data-view]");
 if(view){openDetail(view.dataset.view,view.dataset.id);return;}
 const add=event.target.closest("[data-open]");
 if(add){openEditor("story");return;}
 const reactButton=event.target.closest("[data-react]");
 if(reactButton){react(reactButton.dataset.react,reactButton.dataset.id);return;}
 const edit=event.target.closest("[data-edit]");
 if(edit){openEditor(edit.dataset.edit,findEntry(edit.dataset.edit,edit.dataset.id));return;}
 const del=event.target.closest("[data-delete]");
 if(del){confirmDelete(del.dataset.delete,del.dataset.id);return;}
 const read=event.target.closest("[data-read]");
 if(read)perform({type:"readHeart",id:read.dataset.read},true,"已确认收到爱心");
}
function handleReplySubmit(event){
 const form=event.target.closest("form[data-record-id]");
 if(!form)return;
 event.preventDefault();
 const id=form.dataset.recordId,kind=form.dataset.recordType;
 const action={type:"addReply",targetType:kind,targetId:id,text:form.elements.reply.value};
 action[kind==="moment"?"momentId":"noteId"]=id;
 if(perform(action,false,"回复已保存")){
  form.reset();
  if($("storyDetail").open)openDetailRefresh(kind,id);
 }
}
function openDetailRefresh(kind,id){
 const x=findEntry(kind,id);if(!x)return;
 $("storyDetailContent").innerHTML='<div class="ft-detail-meta">'+esc(names[x.author]||"家人")+
 " · "+esc(x.day||(x.createdAt||"").slice(0,10))+'</div>'+
 '<p class="ft-detail-text">'+esc(x.text)+'</p>'+thread(kind,id);
}
function maybeCelebrate(){
 const g=growth();
 if(g.stage>lastGrowthStage){
  showPopup("growth","小树又长大啦！",
   "<p>陪伴已经到了第 "+(g.stage+1)+" 个阶段：「"+esc(g.name)+"」。</p>"+
   "<p>谢谢每一次记录与爱心，继续慢慢长成家庭大树吧。</p>",[
    {text:"看看成长旅程",kind:"primary",onClick:growthPopup},{text:"稍后再看"}
   ]);
 }
 localStorage.setItem(META,JSON.stringify({activatedOn,lastStage:g.stage}));
}
document.querySelector(".ft-tabs").addEventListener("click",event=>{
 const b=event.target.closest("button[data-section]");
 if(!b)return;
 section=b.dataset.section;feedback("");render();
 if(section==="hearts"&&remaining()>0)openHeart();
});
$("activeMember").addEventListener("change",event=>{actor=event.target.value;heartView="received";feedback("");render();});
document.querySelector(".ft-story-filters").addEventListener("click",event=>{
 const b=event.target.closest("button[data-filter]");
 if(b){recordFilter=b.dataset.filter;render();}
});
document.querySelector(".ft-heart-tabs").addEventListener("click",event=>{
 const b=event.target.closest("button[data-heart-view]");if(b){heartView=b.dataset.heartView;render();}
});
document.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openEditor("story")));
$("storiesList").addEventListener("click",handleRecordClick);
$("treeTags").addEventListener("click",handleRecordClick);
$("storyDetail").addEventListener("click",handleRecordClick);
$("heartsList").addEventListener("click",handleRecordClick);
$("storiesList").addEventListener("submit",handleReplySubmit);
$("storyDetail").addEventListener("submit",handleReplySubmit);
$("storyDetailClose").addEventListener("click",()=>$("storyDetail").close());
$("storyDetailReturn").addEventListener("click",()=>$("storyDetail").close());
$("openHeartComposer").addEventListener("click",openHeart);
$("heartCancel").addEventListener("click",closeHeart);
$("heartComposerClose").addEventListener("click",closeHeart);
$("heartForm").addEventListener("submit",sendHeart);
$("ftModalClose").addEventListener("click",dismissPopup);
$("viewTreeGrowth").addEventListener("click",growthPopup);
$("cancelEditor").addEventListener("click",closeEditor);
$("editorKind").addEventListener("change",event=>{
 if(!editing||editing.id)return;
 const value=$("editorText").value;
 editing.kind=event.target.value;editorControls();$("editorText").value=value;
});
$("editorForm").addEventListener("submit",event=>{
 event.preventDefault();if(!editing)return;
 if(photoUrls.length){
  showPopup("error","照片尚未保存",
   "<p>当前预览还没有完成家庭照片的私密上传权限。请先移除照片，可以继续保存纯文字记录。</p>");
  return;
 }
 const value=$("editorText").value,kind=editing.kind;
 let action;
 if(kind==="moment")action={type:editing.id?"editMoment":"addMoment",id:editing.id,
  day:$("editorForm").elements.day.value,category:$("editorForm").elements.category.value,text:value};
 else if(kind==="note")action={type:editing.id?"editNote":"addNote",id:editing.id,text:value};
 else action={type:"editReply",id:editing.id,text:value};
 if(perform(action)){forceCloseEditor();}
});
$("editorPhoto").addEventListener("change",()=>{
 clearPhotosExceptInput();
 const selected=Array.from($("editorPhoto").files||[]);
 if(selected.length>3||selected.some(x=>x.size>3*1024*1024||!/image\/(jpeg|png|webp)/.test(x.type))){
  $("photoStatus").textContent="最多选择 3 张，每张小于 3MB，支持 JPG/PNG/WebP。";
  $("editorPhoto").value="";
  return;
 }
 photoUrls=selected.map(x=>URL.createObjectURL(x));
 $("photoStatus").textContent=selected.length?
 "已选择 "+selected.length+" 张照片：当前仅预览，正式上传需安全服务；可移除后继续保存文字。":"未选择照片";
});
function clearPhotosExceptInput(){for(const url of photoUrls)URL.revokeObjectURL(url);photoUrls=[];}
$("backIsland").addEventListener("click",event=>{
 if(window.parent!==window){
  event.preventDefault();
  window.parent.postMessage({type:"kaixin-family-tree-close"},window.location.origin);
 }
});
window.addEventListener("storage",event=>{
 if(event.key===PUB||event.key===PRIV){
  publicData=localRead(PUB,M.publicState);
  privateData=localRead(PRIV,M.privateState);render();
 }
});
load();render();maybeCelebrate();
window.FamilyTreePreview={
 get actor(){return actor;},
 get publicData(){return JSON.parse(JSON.stringify(publicData));},
 get privateData(){return JSON.parse(JSON.stringify(privateData));},
 get activationDate(){return activatedOn;},
 get growth(){return growth();},
 get remaining(){return remaining();},
 secureMode:false
};
})();