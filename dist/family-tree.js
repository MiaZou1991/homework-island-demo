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
 // Illustrated preview only: order and story subjects match the approved
 // three photo cards (swimming / seashell / basketball). Never writes to
 // household production records or overwrites an existing preview key.
 const day=nowDay(),yesterday=M.dateInZone(new Date(Date.now()-86400000).toISOString(),ZONE),
 twoDaysAgo=M.dateInZone(new Date(Date.now()-2*86400000).toISOString(),ZONE);
 return {version:1,moments:[
 {id:"sample-growth",author:"kid",day,category:"growth",text:"今天我敢把头埋进水里啦！",createdAt:iso()},
 {id:"sample-basketball",author:"kid",day:twoDaysAgo,category:"growth",text:"我学会了新的篮球动作！",createdAt:new Date(Date.now()-2*86400000).toISOString()}
 ],notes:[{id:"sample-note",author:"mom",text:"周末我们一起去海边散步吧！看看有没有新的小贝壳。",createdAt:new Date(Date.now()-86400000).toISOString()}],
 replies:[{id:"sample-reply",noteId:"sample-note",author:"dad",text:"好呀，一起去！",createdAt:new Date(Date.now()-86400000).toISOString()}]};
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
// Original vector pictograms matching the approved pop-up atlas: glossy heart,
// lock, growing tree, disposal basket, cloud and letter. No rasterized words.
function popupIllustration(kind){
 const paths={
  success:'<path d="M60 95C47 83 17 66 15 43 12 21 33 11 49 22l11 10 11-10c16-11 37-1 34 21-2 23-32 40-45 52Z" fill="url(#coral)" stroke="#b84d56" stroke-width="4"/><path d="M30 39C35 24 48 26 50 31" fill="none" stroke="#fff8e3" stroke-width="7" stroke-linecap="round"/><g fill="#ffd763"><path d="M13 14l3 9 9 3-9 3-3 9-3-9-9-3 9-3z"/><path d="M109 16l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/></g>',
  quota:'<path d="M57 95C44 84 16 66 14 44 12 20 34 13 48 24l12 10 11-10c16-12 37-2 35 20-2 22-29 40-45 51Z" fill="url(#coral)" stroke="#ae525b" stroke-width="4"/><rect x="64" y="55" width="39" height="32" rx="7" fill="url(#gold)" stroke="#ab772e" stroke-width="3"/><path d="M73 56v-9a11 11 0 0122 0v9" fill="none" stroke="#bf8b35" stroke-width="6"/><circle cx="83" cy="68" r="4" fill="#7d6437"/><path d="M83 70v7" stroke="#7d6437" stroke-width="4" stroke-linecap="round"/>',
  growth:'<ellipse cx="61" cy="92" rx="38" ry="8" fill="#cadc9f"/><path d="M50 85C55 71 57 51 57 32L70 32C67 54 71 68 78 85Z" fill="url(#trunk)" stroke="#a57842" stroke-width="3"/><circle cx="45" cy="41" r="24" fill="#b4d36a"/><circle cx="76" cy="39" r="26" fill="#8db957"/><circle cx="60" cy="27" r="24" fill="#d0dd75"/><path d="M31 50q13-13 27 1M65 50q16-12 31 1" fill="none" stroke="#719c4e" stroke-width="4"/><circle cx="53" cy="33" r="7" fill="#fff9e6"/><circle cx="77" cy="28" r="6" fill="#fff9e6"/><circle cx="63" cy="45" r="8" fill="#ffd77c"/>',
  delete:'<rect x="30" y="36" width="62" height="55" rx="9" fill="url(#gold)" stroke="#bd8747" stroke-width="4"/><path d="M32 46h58M48 47v39M63 47v39M78 47v39" stroke="#c49050" stroke-width="3"/><path d="M28 36l23-19h19l24 19" fill="none" stroke="#bb8040" stroke-width="9" stroke-linecap="round"/><path d="M58 30c-14-9-13-20 2-23 9 7 8 16-2 23Z" fill="#8fbd64"/><path d="M61 30c8-13 18-13 23-3-5 9-13 11-23 3Z" fill="#b2d86d"/>',
  error:'<path d="M30 76C15 76 8 64 14 51c5-10 14-14 25-10 0-20 16-31 33-25 13 5 19 18 18 30 17-4 29 11 23 24-3 6-8 9-18 9Z" fill="url(#sky)" stroke="#6fadd7" stroke-width="4"/><path d="M46 85q16-16 31 0M54 94q8-7 16 0" fill="none" stroke="#cf747a" stroke-width="5" stroke-linecap="round"/><circle cx="62" cy="102" r="3" fill="#cf747a"/>',
  help:'<rect x="25" y="25" width="73" height="67" rx="13" fill="#fff4d7" stroke="#cea26b" stroke-width="4"/><path d="M38 47h47M38 59h44M38 71h31" stroke="#d2b487" stroke-width="5" stroke-linecap="round"/><path d="M78 15c10-8 22-3 19 9-2 8-12 13-21 15" stroke="#8eae61" stroke-width="6" fill="none"/>'
 };
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112" role="presentation" focusable="false" aria-hidden="true"><defs>'+
 '<linearGradient id="coral" x1="0" x2=".8" y1="0" y2="1"><stop stop-color="#ffc0ad"/><stop offset=".48" stop-color="#f27b83"/><stop offset="1" stop-color="#d35065"/></linearGradient>'+
 '<linearGradient id="gold" x1="0" x2=".8" y1="0" y2="1"><stop stop-color="#ffe4a3"/><stop offset="1" stop-color="#db9f48"/></linearGradient>'+
 '<linearGradient id="trunk" x1="0" x2="1"><stop stop-color="#b67d43"/><stop offset=".5" stop-color="#dfb46b"/><stop offset="1" stop-color="#9e6638"/></linearGradient>'+
 '<linearGradient id="sky" x1="0" x2=".8" y1="0" y2="1"><stop stop-color="#ddf7ff"/><stop offset="1" stop-color="#83c9ec"/></linearGradient></defs>'+
 (paths[kind]||paths.help)+'</svg>';
}
function dismissPopup(){if($("ftModal").open)$("ftModal").close();}
function showPopup(kind,title,body,actions){
 const dlg=$("ftModal");dismissPopup();
 $("ftModalIcon").innerHTML=popupIllustration(kind);
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
 const reactions=privateData.reactions||[];
 const own=item.author===actor;
 const mine=reactions.some(r=>r.from===actor&&r.recordType===item.recordType&&r.recordId===item.id);
 const count=reactions.filter(r=>r.recordType===item.recordType&&r.recordId===item.id).length;
 const total=count?'<span class="ft-react-count" aria-label="本记录累计'+count+'颗爱心">♥ '+count+'</span>':"";
 if(own)return '<span class="ft-heart-status is-own" aria-label="自己的家庭记录不能送爱心">♡ 自己的记录</span>'+total;
 if(mine)return '<span class="ft-heart-status is-sent" aria-label="已经给这条记录送过爱心">♥ 已送心</span>'+total;
 const exhausted=remaining()===0;
 return '<button type="button" class="ft-story-heart'+(exhausted?' is-exhausted':'')+
 '" data-react="'+esc(item.recordType)+'" data-id="'+esc(item.id)+
 '" aria-label="'+(exhausted?'今天的爱心已送完，查看额度说明':'送爱心给这条记录')+'">'+
 (exhausted?'♡ 今日已送完':'♡ 送爱心')+'</button>'+total;
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
  // Artwork is tied to the actual demo story, never the card's list position:
  // filtering/reordering must not make a child's picture belong to another entry.
  const previewArt={"sample-growth":"swimming","sample-note":"seashell","sample-basketball":"basketball"};
  const art=previewArt[x.id]||"";
  return '<article class="ft-paper ft-story-item '+(isMoment?"is-moment":"is-note")+
  '" data-'+(isMoment?"moment":"note")+'="'+esc(x.id)+'"'+
  (art?' data-art="'+art+'"':"")+'>'+
  '<div class="ft-paper-head"><span class="ft-category '+(isMoment?"ft-category-moment":"ft-category-note")+
  '">'+(isMoment?"成长回忆":"家庭便签")+'</span><span>'+esc(x.sortDay)+" · "+esc(names[x.author]||"家人")+
  '</span></div>'+
  '<div class="ft-story-row"><div class="ft-paper-copy">'+esc(x.text)+'</div>'+
  '<div class="ft-story-stamp '+(isMoment?'ft-stamp-leaf':'ft-stamp-letter')+'" aria-hidden="true">'+
  (isMoment?'✿':'✉')+'</div></div>'+
  '<div class="ft-record-controls">'+storyHearts(x)+
  '<button type="button" class="ft-text-button ft-story-comments" data-view="'+x.recordType+'" data-id="'+esc(x.id)+'" aria-label="查看记录详情与家人留言">✉ 留言 '+publicData.replies.filter(r=>r.targetId===x.id||r.noteId===x.id||r.momentId===x.id).length+'</button>'+
  (x.author===actor?'<button type="button" class="ft-more" data-more="'+x.recordType+'" data-id="'+esc(x.id)+'" aria-label="管理这条记录">···</button>':'')+
  '</div></article>';
 }).join(""):'<div class="ft-empty"><b>树下还没有记录</b>写下成长的小事，或留句话给家人吧。</div>';
 const pinned=all.slice(0,3);
 // Rope is part of the image, so leave its upper part empty and keep each
 // two-line excerpt short enough for the handmade tag, even on 320px phones.
 const pinnedExcerpt=value=>{
  // Hanging paper labels are not full text cards. Prefer a short first phrase
  // without a dangling ellipsis; the full content is available on tap/ARIA.
  const first=String(value??"").trim().split(/[。！？!?\n]/u)[0].trim();
  return Array.from(first).slice(0,11).join("");
 };
 $("treeTags").innerHTML=pinned.length?pinned.map(x=>
  '<button type="button" class="ft-tree-tag" data-view="'+x.recordType+'" data-id="'+esc(x.id)+'"'+
  ' aria-label="'+esc((names[x.author]||"家人")+"："+x.text)+'">'+
  '<b>'+esc(names[x.author]||"家人")+'：</b><span>'+esc(pinnedExcerpt(x.text))+'</span></button>'
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
 // Island-scene preview reads only this public aggregate, never private letters.
 // Production replaces it with a server-authorized numeric aggregate.
 try{localStorage.setItem("kaixin_family_tree_aggregate_preview_v21",JSON.stringify({
  count:g.count,stage:g.stage,name:g.name,activationDate:activatedOn,
  years:g.years,months:g.months,updatedAt:iso()
 }));}catch(_){}
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
function detailMarkup(kind,x){
 return '<div class="ft-detail-meta">'+esc(names[x.author]||"家人")+
 " · "+esc(x.day||(x.createdAt||"").slice(0,10))+"</div>"+
 '<p class="ft-detail-text">'+esc(x.text)+'</p>'+actions(kind,x)+thread(kind,x.id);
}
function openDetail(kind,id){
 const x=findEntry(kind,id);if(!x)return;
 $("storyDetailTitle").textContent=kind==="moment"?"成长回忆":"家庭便签";
 $("storyDetailContent").innerHTML=detailMarkup(kind,x);
 $("storyDetail").showModal();
}
function editorControls(){
 if(!editing)return;
 const kind=editing.kind;
 $("editorTitle").textContent=editing.id?"修改家庭记录":kind==="reply"?"修改回复":"写一条记录";
 document.querySelectorAll("[data-kind-choice]").forEach(btn=>{
  btn.setAttribute("aria-pressed",String(btn.dataset.kindChoice===kind));
 });
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
 $("photoPreview").replaceChildren();
 $("photoPreview").hidden=true;
 $("removePhoto").hidden=true;
 $("photoStatus").textContent="当前只支持本地图片预览，尚未接入私密上传服务。";
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
 const action={type:"sendHeart",to:$("heartTo").value,text:$("heartText").value};
 heartBusy=true;render();
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
 const more=event.target.closest("[data-more]");
 if(more){
  const kind=more.dataset.more,id=more.dataset.id;
  const item=findEntry(kind,id);
  if(!item||item.author!==actor)return;
  showPopup("help","这条记录",'<p>想修改这段回忆，还是把它从家庭树取下来？</p>',[
   {text:"返回",close:true},
   {text:"编辑记录",kind:"primary",onClick:()=>openEditor(kind,item)},
   {text:"删除记录",kind:"danger",onClick:()=>confirmDelete(kind,id)}
  ]);
  return;
 }
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
 $("storyDetailContent").innerHTML=detailMarkup(kind,x);
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
document.querySelector(".ft-kind-pills").addEventListener("click",event=>{
 const btn=event.target.closest("button[data-kind-choice]");
 if(!btn||!editing||editing.id)return;
 $("editorKind").value=btn.dataset.kindChoice;
 $("editorKind").dispatchEvent(new Event("change",{bubbles:true}));
});
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
 $("photoPreview").replaceChildren();
 photoUrls.forEach((url,i)=>{
  const image=document.createElement("img");image.src=url;image.alt="照片 "+(i+1)+" 预览";
  image.loading="lazy";$("photoPreview").append(image);
 });
 $("photoPreview").hidden=!selected.length;
 $("removePhoto").hidden=!selected.length;
 $("photoStatus").textContent=selected.length?
 "已选择 "+selected.length+" 张照片：当前仅预览，尚未上传；可移除后继续发表文字。":"未选择照片";
});
function clearPhotosExceptInput(){
 for(const url of photoUrls)URL.revokeObjectURL(url);
 photoUrls=[];$("photoPreview").replaceChildren();
 $("photoPreview").hidden=true;$("removePhoto").hidden=true;
}
$("removePhoto").addEventListener("click",clearPhotos);
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