(() => {
'use strict';
const $=id=>document.getElementById(id), M=window.FamilyTreeModel;
if(!M)throw Error('家庭树数据规则尚未加载');

if(/(^|\.)githack\.com$/i.test(location.hostname)){
  // Third-party HTML previews can time out loading large background images.
  // Reuse the same approved public artwork from the published Pages asset host.
  const base='https://miazou1991.github.io/homework-island-demo/assets/';
  const style=document.createElement('style');
  style.textContent=
    '.ft-hero-picture{background-image:url("'+base+'our-island-v1/map.webp")!important}'+
    '.ft-hero-plaque,.ft-editor h2{background-image:url("'+base+'hd/dialogs-v3/plaque.webp")!important}'+
    '.ft-paper,.ft-editor{border-image-source:url("'+base+'hd/dialogs-v3/panel.webp")!important}';
  document.head.append(style);
}

const PUB='kaixin_family_tree_public_preview_v1', PRIV='kaixin_family_tree_private_preview_v1';
const names=Object.fromEntries(M.members.map(x=>[x.id,x.name]));
const kinds=Object.fromEntries(M.types.map(x=>[x.id,x.name]));
let actor='kid',section='stories',recordFilter='all',heartView='received',editing=null,publicData,privateData;
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function today(offset=0){const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function read(key,normalize){try{return normalize(JSON.parse(localStorage.getItem(key)||'null'));}catch(_){return normalize(null);}}
function sample(){return {version:1,moments:[
{id:'sample-growth',author:'kid',day:today(),category:'growth',text:'今天我敢把头埋进水里啦！',createdAt:new Date().toISOString()},
{id:'sample-together',author:'mom',day:today(-1),category:'together',text:'我们在海边散步，发现了漂亮的小贝壳。',createdAt:new Date(Date.now()-86400000).toISOString()}
],notes:[{id:'sample-note',author:'kid',text:'今天我敢把头埋进水里啦！',createdAt:new Date().toISOString()}],
replies:[{id:'sample-reply',noteId:'sample-note',author:'dad',text:'周末教教我吧。',createdAt:new Date().toISOString()}]};}
function load(){
const old=localStorage.getItem(PUB);
publicData=old===null?sample():read(PUB,M.publicState);
privateData=read(PRIV,M.privateState);
if(old===null)localStorage.setItem(PUB,JSON.stringify(publicData));
$('previewNotice').hidden=false;
}
function feedback(v){$('feedback').textContent=v||'';}
function savePublic(action){
publicData=M.applyPublic(read(PUB,M.publicState),actor,action);
localStorage.setItem(PUB,JSON.stringify(publicData));render();
}
function savePrivate(action){
privateData=M.applyPrivate(read(PRIV,M.privateState),actor,action);
localStorage.setItem(PRIV,JSON.stringify(privateData));render();
}
function perform(action,privateAction=false,message='已保存到体验记录'){
try{(privateAction?savePrivate:savePublic)(action);feedback(message);return true;}
catch(e){feedback(e.message||'操作未成功');return false;}
}
function actions(type,item){
if(item.author!==actor)return '';
return '<div class="ft-paper-tools"><button type="button" class="ft-text-button" data-edit="'+type+'" data-id="'+esc(item.id)+'">修改</button>'+
'<button type="button" class="ft-text-button danger" data-delete="'+type+'" data-id="'+esc(item.id)+'">删除</button></div>';
}
function renderReplyThread(recordType,recordId) {
const replies=publicData.replies.filter(x=>
 (x.targetType===recordType&&x.targetId===recordId) ||
 (recordType==='moment'?x.momentId===recordId:x.noteId===recordId)
).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''));
const html=replies.map(reply=>
 '<div class="ft-reply" data-reply="'+esc(reply.id)+'"><span class="ft-reply-name">'+esc(names[reply.author]||'家人')+'：</span>'+
 '<span class="ft-reply-content">'+esc(reply.text)+'</span>'+
 (reply.author===actor?'<span class="ft-reply-tools">'+
 '<button type="button" class="ft-text-button" data-edit="reply" data-id="'+esc(reply.id)+'">改</button>'+
 '<button type="button" class="ft-text-button danger" data-delete="reply" data-id="'+esc(reply.id)+'">删</button></span>':'')+
 '</div>'
).join('');
return '<div class="ft-replies" aria-label="家人回复">'+html+
'<form class="ft-reply-form" data-record-type="'+recordType+'" data-record-id="'+esc(recordId)+'">'+
'<input name="reply" type="text" maxlength="120" placeholder="回复这条家庭记录…" required aria-label="写一条回复">'+
'<button type="submit">回复</button></form></div>';
}
function renderStories() {
const entries=[
...publicData.moments.map(item=>({...item,recordType:'moment',sortDay:item.day||item.createdAt?.slice(0,10)||''})),
...publicData.notes.map(item=>({...item,recordType:'note',sortDay:item.createdAt?.slice(0,10)||''}))
].filter(item=>recordFilter==='all'||item.recordType===recordFilter)
.sort((a,b)=>(b.sortDay||'').localeCompare(a.sortDay||'')||
 (b.createdAt||'').localeCompare(a.createdAt||''));
$('storiesList').innerHTML=entries.length?entries.map(item=>{
const moment=item.recordType==='moment';
const typeLabel=moment?'成长回忆':'家庭便签';
const day=item.sortDay;
return '<article class="ft-paper ft-story-item '+(moment?'is-moment':'is-note')+'" data-'+(moment?'moment':'note')+'="'+esc(item.id)+'">'+
'<div class="ft-paper-head"><span class="ft-category '+(moment?'ft-category-moment':'ft-category-note')+'">'+
typeLabel+'</span><span>'+esc(day)+' · '+esc(names[item.author]||'家人')+'</span></div>'+
'<div class="ft-paper-copy">'+esc(item.text)+'</div>'+
actions(item.recordType,item)+renderReplyThread(item.recordType,item.id)+'</article>';
}).join(''):
'<div class="ft-empty"><b>树下还没有记录</b>写下成长的小事，或留一句话给家人吧。</div>';
}
function refreshRecipients(){
$('heartTo').innerHTML=M.members.filter(m=>m.id!==actor).map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('');
}
function renderHearts(){
const entries=M.visibleHearts(privateData,actor).filter(x=>heartView==='received'?x.to===actor:x.from===actor)
.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
$('heartsList').innerHTML=entries.length?entries.map(item=>
'<article class="ft-paper ft-heart-line" data-heart="'+esc(item.id)+'"><div class="ft-paper-head"><span>'+
(heartView==='received'?'来自 '+esc(names[item.from]||'家人'):'送给 '+esc(names[item.to]||'家人'))+'</span><span>'+
esc((item.createdAt||'').slice(0,10))+'</span></div><div class="ft-heart-message">'+esc(item.text)+'</div>'+
(heartView==='received'?'<div class="ft-paper-tools">'+(item.readAt?
'<span class="ft-meta">已收到这份心意 ♡</span>':'<button type="button" class="ft-text-button" data-read="'+esc(item.id)+'">♡ 收到了</button>')+'</div>':
'<span class="ft-meta">'+(item.readAt?'对方已收到':'爱心已送出')+'</span>')+'</article>'
).join(''):'<div class="ft-empty"><b>'+(heartView==='received'?'还没有收到爱心':'还没有送出爱心')+'</b>一封小小的信，也会让家人开心。</div>';
}
function render(){
$('activeMember').value=actor;
document.querySelectorAll('.ft-tabs button').forEach(b=>b.setAttribute('aria-current',b.dataset.section===section?'page':'false'));
document.querySelectorAll('.ft-page').forEach(el=>el.hidden=el.dataset.page!==section);
document.querySelectorAll('[data-heart-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.heartView===heartView)));
refreshRecipients();renderStories();renderHearts();
document.querySelectorAll('[data-filter]').forEach(button=>{
button.setAttribute('aria-pressed',String(button.dataset.filter===recordFilter));
});
const growth=M.treeGrowth(privateData);
$('treeHeartCount').textContent=growth.count;
$('treeStage').textContent=growth.name;
$('treeGrowthProgress').setAttribute('aria-valuenow',String(growth.stage));
$('treeNext').textContent=growth.next===null?'满树都是爱，继续分享暖心时刻':
 '再送出 '+(growth.next-growth.count)+' 份爱心，解锁下一阶段';
const hero=document.querySelector('.ft-hero');
hero.dataset.growthStage=String(growth.stage);
hero.style.setProperty('--growth-progress',String((growth.stage+1)/4));
}
function findEntry(type,id){const list=type==='moment'?publicData.moments:type==='note'?publicData.notes:publicData.replies;return list.find(x=>x.id===id);}
function drawEditorExtra() {
const kind=editing.kind;
$('editorTitle').textContent=editing.id?'修改家庭记录':'写一条家庭记录';
$('editorText').maxLength=kind==='moment'?300:kind==='note'?180:120;
$('editorText').placeholder=kind==='moment'?'今天有什么值得记下来的成长小事？':
kind==='note'?'写给全家的一句话……':'回复这条家庭记录……';
$('editorExtra').replaceChildren();
if(kind==='moment'){
const dateLabel=document.createElement('label'),date=document.createElement('input');
dateLabel.textContent='哪一天';date.type='date';date.name='day';date.required=true;
date.value=editing.day||today();dateLabel.append(date);
const catLabel=document.createElement('label'),cat=document.createElement('select');
catLabel.textContent='回忆类别';cat.name='category';M.types.forEach(t=>cat.add(new Option(t.name,t.id)));
cat.value=editing.category||'growth';catLabel.append(cat);
$('editorExtra').append(dateLabel,catLabel);
}
}
function openEditor(kind,item=null){
const chosen=kind==='story'?(recordFilter==='note'?'note':'moment'):kind;
editing={kind:chosen,id:item?.id||null,day:item?.day||today(),category:item?.category||'growth'};
$('editorKind').value=chosen==='reply'?'note':chosen;
$('editorTypeWrap').hidden=!!item||chosen==='reply';
$('editorText').value=item?.text||'';
drawEditorExtra();
$('editor').showModal();$('editorText').focus();
}
function closeEditor(){if($('editor').open)$('editor').close();editing=null;}
document.querySelector('.ft-tabs').addEventListener('click',event=>{
const b=event.target.closest('button[data-section]');if(!b)return;section=b.dataset.section;feedback('');render();});
$('activeMember').addEventListener('change',e=>{actor=e.target.value;heartView='received';feedback('');render();});
document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openEditor(b.dataset.open)));
$('cancelEditor').addEventListener('click',closeEditor);
$('editorKind').addEventListener('change',event=>{
if(!editing||editing.id)return;
const oldText=$('editorText').value;
editing.kind=event.target.value;
drawEditorExtra();
$('editorText').value=oldText;
});
$('editor').addEventListener('close',()=>{editing=null;});
$('editorForm').addEventListener('submit',e=>{
e.preventDefault();if(!editing)return;const value=$('editorText').value;
const a=editing.kind==='moment'?{type:editing.id?'editMoment':'addMoment',id:editing.id,
text:value,day:$('editorForm').elements.day.value,category:$('editorForm').elements.category.value}:
editing.kind==='note'?{type:editing.id?'editNote':'addNote',id:editing.id,text:value}:
{type:'editReply',id:editing.id,text:value};
if(perform(a))closeEditor();
});
$('storiesList').addEventListener('submit',e=>{
const form=e.target.closest('form[data-record-id]');
if(!form)return;
e.preventDefault();
const id=form.dataset.recordId,recordType=form.dataset.recordType;
const action={type:'addReply',targetType:recordType,targetId:id,text:form.elements.reply.value};
if(recordType==='moment')action.momentId=id;
else action.noteId=id;
if(perform(action,false,'回复已保存'))form.reset();
});
document.querySelector('.ft-story-filters').addEventListener('click',event=>{
const b=event.target.closest('button[data-filter]');
if(!b)return;
recordFilter=b.dataset.filter;
render();
});
document.querySelector('.ft-content').addEventListener('click',event=>{
const edit=event.target.closest('[data-edit]');
if(edit){openEditor(edit.dataset.edit,findEntry(edit.dataset.edit,edit.dataset.id));return;}
const del=event.target.closest('[data-delete]');
if(del){
const kind={moment:'deleteMoment',note:'deleteNote',reply:'deleteReply'}[del.dataset.delete];
if(!kind||!confirm('确定删除吗？'+(kind==='deleteNote'?'该便签的回复也将删除。':'')))return;
perform({type:kind,id:del.dataset.id},false,'已删除');return;
}
const read=event.target.closest('[data-read]');
if(read)perform({type:'readHeart',id:read.dataset.read},true,'已确认收到爱心');
});
$('heartForm').addEventListener('submit',event=>{
event.preventDefault();
if(perform({type:'sendHeart',to:$('heartTo').value,text:$('heartText').value},true,'爱心已送出（测试记录）')){
$('heartForm').reset();heartView='sent';render();
}});
document.querySelector('.ft-heart-tabs').addEventListener('click',event=>{
const b=event.target.closest('button[data-heart-view]');if(!b)return;heartView=b.dataset.heartView;render();});
$('backIsland').addEventListener('click',event=>{
if(window.parent!==window){event.preventDefault();window.parent.postMessage({type:'kaixin-family-tree-close'},window.location.origin);}
});
window.addEventListener('storage',event=>{
if(event.key===PUB||event.key===PRIV){
publicData=read(PUB,M.publicState);privateData=read(PRIV,M.privateState);render();
}});
load();render();
window.FamilyTreePreview={get actor(){return actor;},get publicData(){return JSON.parse(JSON.stringify(publicData));},
get privateData(){return JSON.parse(JSON.stringify(privateData));},secureMode:false};
})();