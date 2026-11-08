(()=>{'use strict';
const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d'),W=1536,H=1024;
const state={x:768,y:925,dir:0,overview:false,ready:false},keys=new Set(),axis={x:0,y:0};let pointer=null,last=0,frame=0,camera={x:0,y:0},vw=0,vh=0,scale=1;
const images={};const tree={x:768,y:555};
const polygons=[[[692,817],[850,817],[956,1010],[556,1010]],[[687,817],[850,817],[835,620],[665,620]],[[515,465],[598,421],[918,421],[1017,476],[1000,560],[902,617],[650,617],[530,564]],[[718,421],[816,421],[800,290],[733,290]],[[990,486],[1115,467],[1258,436],[1280,465],[1135,515],[1000,541]],[[532,487],[445,470],[409,447],[368,471],[445,521],[529,540]]];
function inside(x,y,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
function walkable(x,y){return polygons.some(p=>inside(x,y,p))&&Math.hypot((x-tree.x)/1.3,y-tree.y)>32}
function stop(){keys.clear();axis.x=axis.y=0;pointer=null;$('knob').style.transform='';}
function resize(){vw=canvas.clientWidth;vh=canvas.clientHeight;const d=Math.min(devicePixelRatio||1,2);canvas.width=vw*d;canvas.height=vh*d;ctx.setTransform(d,0,0,d,0,0);scale=state.overview?Math.min(vw/W,vh/H):Math.max(vh/H,vw/W,.9);}
function drawPerson(t,moving){let col=state.dir%4,row=state.dir>=4?1:0;if(moving)col+=Math.floor(t/190)%2;const iw=images.girl.width/4,ih=images.girl.height/2;ctx.save();ctx.fillStyle='#57432238';ctx.beginPath();ctx.ellipse(state.x,state.y-2,22,7,0,0,Math.PI*2);ctx.fill();ctx.drawImage(images.girl,col*iw,row*ih,iw,ih,state.x-50,state.y-124,100,133);ctx.restore()}
function draw(t){frame=requestAnimationFrame(draw);const dt=Math.min((t-last)/1000||0,.035);last=t;if(!state.ready)return;const active=!$('closeup').open&&!document.hidden;let dx=active?(axis.x+(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0)):0,dy=active?(axis.y+(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0)):0;const n=Math.hypot(dx,dy);if(n>1){dx/=n;dy/=n}if(n){state.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?4:6):(dy<0?0:2);const nx=state.x+dx*155*dt,ny=state.y+dy*155*dt;if(walkable(nx,state.y))state.x=nx;if(walkable(state.x,ny))state.y=ny;}
const target=state.overview?{x:(W-vw/scale)/2,y:(H-vh/scale)/2}:{x:Math.max(0,Math.min(W-vw/scale,state.x-vw/scale/2)),y:Math.max(0,Math.min(H-vh/scale,state.y-vh/scale*.62))};const k=matchMedia('(prefers-reduced-motion:reduce)').matches?1:1-Math.exp(-dt*9);camera.x+=(target.x-camera.x)*k;camera.y+=(target.y-camera.y)*k;
ctx.clearRect(0,0,vw,vh);ctx.save();ctx.scale(scale,scale);ctx.translate(-camera.x,-camera.y);ctx.drawImage(images.map,0,0,W,H);if(state.y<tree.y)drawPerson(t,n>0);ctx.drawImage(images.tree,tree.x-72,tree.y-210,144,216);if(state.y>=tree.y)drawPerson(t,n>0);
if(state.overview){ctx.font='bold 19px system-ui';ctx.textAlign='center';for(const [s,x,y] of [['森林书屋',770,278],['我的小屋',1280,450],['花园',260,443],['家庭树',768,335],['码头',768,840]]){ctx.fillStyle='#fff3d9';ctx.fillRect(x-58,y-24,116,32);ctx.fillStyle='#633b20';ctx.fillText(s,x,y)}}ctx.restore();$('visit').hidden=Math.hypot(state.x-tree.x,state.y-tree.y)>145||$('closeup').open;
}
$('stick').addEventListener('pointerdown',e=>{if(pointer!==null)return;pointer=e.pointerId;$('stick').setPointerCapture(pointer);move(e)});function move(e){if(e.pointerId!==pointer)return;const r=$('stick').getBoundingClientRect();let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,n=Math.hypot(x,y);const f=Math.min(n,36)/(n||1);x*=f;y*=f;axis.x=n<9?0:x/36;axis.y=n<9?0:y/36;$('knob').style.transform=`translate(${x}px,${y}px)`} $('stick').addEventListener('pointermove',move);for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('stick').addEventListener(ev,stop);
window.addEventListener('keydown',e=>{if($('closeup').open||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){e.preventDefault();keys.add(e.key)}});window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',stop);document.addEventListener('visibilitychange',stop);window.addEventListener('pagehide',()=>{stop();cancelAnimationFrame(frame)});
$('visit').onclick=()=>{stop();$('closeup').showModal();$('back').focus()};$('back').onclick=()=>$('closeup').close();$('closeup').addEventListener('close',()=>{stop();$('visit').focus()});$('home').onclick=()=>{stop();state.x=768;state.y=925};$('mapToggle').onclick=()=>{stop();state.overview=!state.overview;$('mapToggle').textContent=state.overview?'继续漫步':'看看地图';resize()};new ResizeObserver(resize).observe(canvas);
let loadingAttempt=0;
async function loadIsland(){
 const attempt=++loadingAttempt,box=$('loading');box.hidden=false;
 const names=['map','girl','tree'];let complete=names.filter(n=>images[n]).length;
 const progress=()=>{box.textContent=`正在加载小岛画面 ${complete}/3…`;};progress();
 try{
  await Promise.all(names.map(name=>images[name]?Promise.resolve():new Promise((resolve,reject)=>{
   const im=new Image();let finished=false;
   const timer=setTimeout(()=>finish(new Error('timeout')),12000);
   function finish(error){if(finished)return;finished=true;clearTimeout(timer);im.onload=im.onerror=null;
    if(error){im.src='';reject(error);return;}
    if(attempt===loadingAttempt){images[name]=im;complete++;progress();}resolve();}
   im.onload=()=>finish();im.onerror=()=>finish(new Error('image'));im.src=`assets/our-island-v1/${name}.png`;
  })));
  if(attempt!==loadingAttempt)return;
  state.ready=true;resize();camera.x=Math.max(0,Math.min(W-vw/scale,state.x-vw/scale/2));camera.y=Math.max(0,H-vh/scale);box.hidden=true;cancelAnimationFrame(frame);draw(0);
 }catch(_){if(attempt!==loadingAttempt)return;loadingAttempt++;box.replaceChildren();
  const panel=document.createElement('div'),message=document.createElement('p'),retry=document.createElement('button'),back=document.createElement('a');
  message.textContent='小岛画面加载较慢或未成功，你的记录没有改变。';retry.textContent='重试加载';retry.onclick=loadIsland;
  back.textContent='返回今日任务';back.href='child.html';back.style.cssText='display:block;margin-top:20px;color:inherit';panel.style.cssText='padding:24px;text-align:center';panel.append(message,retry,back);box.append(panel);
 }
}
loadIsland();
window.IslandWalk={state,walkable,polygons,stop};
})();
