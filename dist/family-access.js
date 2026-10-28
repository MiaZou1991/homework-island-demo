/* 家庭码用于云端家庭数据分区；同一家庭的成员共享同一份数据。 */
(() => {
  if(typeof ISLAND_PREVIEW!=='undefined'&&ISLAND_PREVIEW)return;
  const CODE_KEY='homework_island_family_code_v1';
  const cleanCode=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
  const style=document.createElement('style');
  style.textContent=`
    .family-access-backdrop{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;padding:20px;background:#243b3688;backdrop-filter:blur(5px);font-family:inherit}
    .family-access-card{width:min(420px,100%);padding:25px 22px;border-radius:25px;background:#fffaf0;color:#604731;box-shadow:0 20px 65px #182d2940}
    .family-access-card h2{margin:3px 0 8px;font-size:23px}
    .family-access-card p{margin:8px 0;color:#8a795c;font-size:13px;line-height:1.7}
    .family-access-card input{width:100%;height:48px;padding:0 14px;border:1px solid #e7dcc4;border-radius:13px;background:#fffdf8;font:inherit;font-size:17px;color:#604731}
    .family-access-actions{display:flex;gap:10px;margin-top:15px}
    .family-access-actions button{flex:1;min-height:46px;border:0;border-radius:14px;background:#87bb62;color:white;font:inherit;font-weight:800}
    .family-access-error{min-height:20px;color:#c85d51!important}
    .family-code-current{padding:8px 10px;border-radius:12px;background:#f2ead7;font-size:12px!important}
    .family-math{font-size:31px;font-weight:850;letter-spacing:1px;color:#8b6b32}
    .up-family-switch{margin-right:10px;cursor:pointer;border:0;background:transparent;font:inherit}
  `;
  document.head.appendChild(style);
  const root=document.createElement('div');
  root.innerHTML=`
    <div class="family-access-backdrop" id="family-code-gate" role="dialog" aria-modal="true" aria-labelledby="family-code-title">
      <form class="family-access-card" id="family-code-form">
        <div style="font-size:32px">🏝️</div><h2 id="family-code-title">进入家庭小岛</h2>
        <p>输入 4–8 位字母或数字家庭码。第一次使用时自设一个；家长端和儿童端输入同一码，就会使用同一份家庭记录。</p>
        <p>家庭码会区分不同家庭的记录。家庭数据会保存到云端，同一家庭的成员可以在不同设备上同步。</p>
        <p class="family-code-current" id="family-code-current" hidden></p>
        <input id="family-code-input" inputmode="text" autocapitalize="characters" autocomplete="off" maxlength="8" placeholder="例如：KAIXIN" aria-label="4到8位字母或数字家庭码">
        <p class="family-access-error" id="family-code-error" aria-live="polite"></p>
        <div class="family-access-actions"><button type="submit">进入小岛</button></div>
      </form>
    </div>
    <div class="family-access-backdrop" id="parent-math-gate" role="dialog" aria-modal="true" aria-labelledby="parent-math-title">
      <form class="family-access-card" id="parent-math-form">
        <div style="font-size:31px">🧩</div><h2 id="parent-math-title">家长身份验证</h2>
        <p>答对这道两位数算术题，进入家长管理端。</p>
        <div class="family-math" id="parent-math-question"></div>
        <input id="parent-math-answer" inputmode="numeric" autocomplete="off" placeholder="请输入答案" aria-label="算术题答案">
        <p class="family-access-error" id="parent-math-error" aria-live="polite"></p>
        <div class="family-access-actions"><button type="submit">验证进入</button></div>
      </form>
    </div>`;
  document.body.appendChild(root);
  let activeCode=cleanCode(localStorage.getItem(CODE_KEY))||'KAIXIN',expected=0; localStorage.setItem(CODE_KEY,activeCode);
  const codeGate=document.getElementById('family-code-gate'),mathGate=document.getElementById('parent-math-gate');
  const codeInput=document.getElementById('family-code-input'),mathInput=document.getElementById('parent-math-answer');
  function openFamilyCodeDialog(){
    codeInput.value=activeCode;
    document.getElementById('family-code-current').hidden=!activeCode;
    document.getElementById('family-code-current').textContent=activeCode?'当前家庭码：'+activeCode:'';
    document.getElementById('family-code-error').textContent='';
    codeGate.style.display='flex';
    codeInput.focus();
  }
  function makeQuestion(){
    const a=10+Math.floor(Math.random()*90),b=10+Math.floor(Math.random()*90);
    expected=a+b;
    document.getElementById('parent-math-question').textContent=a+' + '+b+' = ?';
    mathInput.value='';
    mathInput.focus();
  }
  function openParentMathGate(){document.getElementById('parent-math-error').textContent='';makeQuestion();mathGate.style.display='flex';}
  document.getElementById('family-code-form').addEventListener('submit',event=>{
    event.preventDefault();
    const code=cleanCode(codeInput.value);
    if(code.length<4){document.getElementById('family-code-error').textContent='请输入 4–8 位字母或数字家庭码';return;}
    if(code===activeCode){codeGate.style.display='none';return;}
    localStorage.setItem(CODE_KEY,code);
    location.reload();
  });
  document.getElementById('parent-math-form').addEventListener('submit',event=>{
    event.preventDefault();
    if(Number(mathInput.value)!==expected){document.getElementById('parent-math-error').textContent='答案不正确，请重新计算';makeQuestion();return;}
    mathGate.style.display='none';
    document.body.classList.add('parent-access-verified');
  });
  window.openFamilyCodeDialog=openFamilyCodeDialog;
  window.openSyncPanel=openFamilyCodeDialog;
  if(!activeCode)openFamilyCodeDialog();
  else if(document.body.dataset.mode==='parent')openParentMathGate();
})();