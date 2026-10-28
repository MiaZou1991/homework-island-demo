/* Reuse the illustrated dialog shell for the older child editors as well. */
(() => {
  if (document.body.dataset.mode !== 'child') return;
  let titleNumber = 0;
  function matchHomeTitle() {
    const title = document.querySelector('.tf-card-head h1');
    const phone = document.querySelector('.phone');
    const size = title ? getComputedStyle(title).fontSize : phone ? (phone.clientWidth * .048) + 'px' : '18px';
    document.body.style.setProperty('--island-title-font-size', size);
  }
  function decorate(panel) {
    if (panel.classList.contains('island-dialog')) return;
    const title = panel.querySelector('.sheet-head h2,.hw-editor-head h3,.confirm-body h3,h2,h3');
    if (!title) return;
    panel.classList.add('island-dialog', 'island-legacy-dialog');
    if (panel.classList.contains('family-access-card')) panel.classList.add('island-family-dialog');
    const oldHead = panel.querySelector('.sheet-head,.hw-editor-head');
    const oldClose = panel.querySelector('.x,.hw-editor-close');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'up-close';
    close.textContent = '×';
    close.setAttribute('aria-label', '关闭弹层');
    close.onclick = () => {
      if (oldClose) oldClose.click();
      else if (panel.id === 'confirm-sheet') closeConfirm();
      else {
        const gate = panel.closest('.family-access-backdrop');
        if (gate) gate.style.display = 'none';
      }
    };
    title.classList.add('island-dialog-title');
    title.id ||= 'island-legacy-title-' + (++titleNumber);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', title.id);
    const header = document.createElement('div');
    header.className = 'up-dialog-header';
    header.append(title);
    oldHead?.remove();
    panel.querySelector('.sheet-grip')?.remove();
    const body = document.createElement('div');
    body.className = 'up-dialog-body';
    while (panel.firstChild) body.append(panel.firstChild);
    const surface = document.createElement('div');
    surface.className = 'island-dialog-surface';
    surface.append(header, body, close);
    panel.append(surface);
  }
  function scan() {
    matchHomeTitle();
    document.querySelectorAll('.ovl>.sheet,.hw-editor,.family-access-card').forEach(decorate);
  }
  scan();
  const phone = document.querySelector('.phone');
  if (phone) new ResizeObserver(matchHomeTitle).observe(phone);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
