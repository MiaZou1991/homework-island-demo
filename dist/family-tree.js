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
    '.ft-primary{background-image:url("'+base+'hd/dialogs-v3/button-primary.webp")!important}'+
    '.ft-paper,.ft-editor{border-image-source:url("'+base+'hd/dialogs-v3/panel.webp")!important}';
  document.head.append(style);
}

const PUB='kaixin_family_tree_public_preview_v1', PRIV='kaixin_family_tree_private_preview_v1';
const names=Object.fromEntries(M.members.map(x=>[x.id,x.name]));
const kinds=Object.fromEntries(M.types.map(x=>[x.id,x.name]));
let actor='kid',section='moments',heartView='received',editing=null,publicData,privateData;
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
function renderMoments(){
const entries=[...publicData.moments].sort((a,b)=>(b.day||'').localeCompare(a.day||'')||(b.createdAt||'').localeCompare(a.createdAt||''));
$('momentsList').innerHTML=entries.length?entries.map(item=>
'<article class="ft-paper" data-moment="'+esc(item.id)+'">'+
'<div class="ft-paper-head"><span class="ft-category">'+esc(kinds[item.category]||'成长回忆')+'</span>'+
'<span>'+esc(item.day)+' · '+esc(names[item.author]||'家人')+'</span></div>'+
'<div class="ft-paper-copy">'+esc(item.text)+'</div>'+actions('moment',item)+'</article>'
).join(''):'<div class="ft-empty"><b>小树还在等第一个故事</b>记下一件小事，让它慢慢长大。</div>';
}
function renderNotes(){
const notes=[...publicData.notes].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
$('notesList').innerHTML=notes.length?notes.map(note=>{
const replies=publicData.replies.filter(x=>x.noteId===note.id).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''));
const replyHtml=replies.map(reply=>
'<div class="ft-reply" data-reply="'+esc(reply.id)+'"><span class="ft-reply-name">'+esc(names[reply.author]||'家人')+'：</span>'+
'<span class="ft-reply-content">'+esc(reply.text)+'</span>'+
(reply.author===actor?'<span class="ft-reply-tools"><button type="button" class="ft-text-button" data-edit="reply" data-id="'+esc(reply.id)+'">改</button>'+
'<button type="button" class="ft-text-button danger" data-delete="reply" data-id="'+esc(reply.id)+'">删</button></span>':'')+'</div>'
).join('');
return '<article class="ft-paper" data-note="'+esc(note.id)+'"><div class="ft-paper-head"><span>挂在家庭树上的便签</span><span>'+
esc(names[note.author]||'家人')+'</span></div><div class="ft-paper-copy">'+esc(note.text)+'</div><div class="ft-meta">'+
esc((note.createdAt||'').slice(0,10))+'</div>'+actions('note',note)+
'<div class="ft-replies" aria-label="便签回复">'+replyHtml+
'<form class="ft-reply-form" data-note-id="'+esc(note.id)+'"><input name="reply" type="text" maxlength="120" placeholder="回复这张便签…" required aria-label="写一条回复"><button type="submit">回复</button></form></div></article>';
}).join(''):'<div class="ft-empty"><b>暂时没有家庭便签</b>写一句温暖的话，家人都能看见并回复。</div>';
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
refreshRecipients();renderMoments();renderNotes();renderHearts();
}
function findEntry(type,id){const list=type==='moment'?publicData.moments:type==='note'?publicData.notes:publicData.replies;return list.find(x=>x.id===id);}
function openEditor(kind,item=null){
editing={kind,id:item?.id||null};
$('editorTitle').textContent=(item?'修改':'')+({moment:'留下回忆',note:'写给全家',reply:'回复'}[kind]);
$('editorText').maxLength=kind==='moment'?300:kind==='reply'?120:180;
$('editorText').value=item?.text||'';
$('editorText').placeholder=kind==='moment'?'今天有什么值得记下来的事？':kind==='note'?'写一段话，挂到家庭树上……':'说一句话……';
$('editorExtra').replaceChildren();
if(kind==='moment'){
const dateLabel=document.createElement('label'),date=document.createElement('input');
dateLabel.textContent='哪一天';date.type='date';date.name='day';date.required=true;date.value=item?.day||today();dateLabel.append(date);
const catLabel=document.createElement('label'),cat=document.createElement('select');
catLabel.textContent='回忆类别';cat.name='category';M.types.forEach(t=>cat.add(new Option(t.name,t.id)));cat.value=item?.category||'growth';catLabel.append(cat);
$('editorExtra').append(dateLabel,catLabel);
}
$('editor').showModal();$('editorText').focus();
}
function closeEditor(){if($('editor').open)$('editor').close();editing=null;}
document.querySelector('.ft-tabs').addEventListener('click',event=>{
const b=event.target.closest('button[data-section]');if(!b)return;section=b.dataset.section;feedback('');render();});
$('activeMember').addEventListener('change',e=>{actor=e.target.value;heartView='received';feedback('');render();});
document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openEditor(b.dataset.open)));
$('cancelEditor').addEventListener('click',closeEditor);
$('editor').addEventListener('close',()=>{editing=null;});
$('editorForm').addEventListener('submit',e=>{
e.preventDefault();if(!editing)return;const value=$('editorText').value;
const a=editing.kind==='moment'?{type:editing.id?'editMoment':'addMoment',id:editing.id,
text:value,day:$('editorForm').elements.day.value,category:$('editorForm').elements.category.value}:
editing.kind==='note'?{type:editing.id?'editNote':'addNote',id:editing.id,text:value}:
{type:'editReply',id:editing.id,text:value};
if(perform(a))closeEditor();
});
$('notesList').addEventListener('submit',e=>{
const form=e.target.closest('form[data-note-id]');if(!form)return;e.preventDefault();
if(perform({type:'addReply',noteId:form.dataset.noteId,text:form.elements.reply.value},false,'已回复家庭便签'))form.reset();
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