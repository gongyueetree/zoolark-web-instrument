(function () {
  'use strict';
  const UF2 = '/firmware/zoolark-rp2350b-v0.4.2-live-io.uf2';
  const UF2_NAME = 'zoolark-rp2350b-v0.4.2-live-io.uf2';

  function setStatus(title, detail, badgeText, badgeClass) {
    const badge = document.getElementById('zl-usb-state-badge');
    const titleEl = document.getElementById('zl-usb-state-title');
    const detailEl = document.getElementById('zl-usb-state-detail');
    const progress = document.getElementById('zl-fw-progress');
    if (badge) { badge.className = `zl-usb-badge ${badgeClass || 'boot'}`; badge.textContent = badgeText || 'BOOTSEL'; }
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
    if (progress) progress.style.display = 'none';
  }
  function downloadUf2() {
    const a = document.createElement('a'); a.href = UF2; a.download = UF2_NAME;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function patchOnce() {
    const install = document.getElementById('zl-install-uf2');
    if (install && !install.dataset.safeManualPatched) {
      install.dataset.safeManualPatched = '1'; install.textContent = '下载 v0.4.2 Live-I/O UF2';
      install.title = 'GPIO47 ADC7 + GPIO22/23 Logic + GPIO25 heartbeat';
    }
    const help = document.querySelector('.zl-usb-help');
    if (help && !help.dataset.safeManualPatched) {
      help.dataset.safeManualPatched = '1';
      help.innerHTML = '<b>Live-I/O 测试：</b>下载 <code>0.4.2-live-io</code> 并手工拖到 RP2350 盘。GPIO25 每秒短闪；示波器 CH1=GPIO47/ADC7（仅 0–3.3V）；Logic D0=GPIO22、D1=GPIO23。';
    }
  }
  document.addEventListener('click', function (event) {
    const install = event.target.closest?.('#zl-install-uf2'); if (!install) return;
    event.preventDefault(); event.stopImmediatePropagation(); downloadUf2();
    setStatus('Live-I/O UF2 已开始下载', `请把 ${UF2_NAME} 拖到 Finder 的 RP2350 盘。盘消失且 GPIO25 开始心跳后，再点“连接 Runtime”。`, 'MANUAL', 'boot');
  }, true);
  function start() {
    patchOnce(); let tries = 0;
    const timer = setInterval(() => { patchOnce(); if (++tries >= 80 || document.getElementById('zl-install-uf2')) clearInterval(timer); }, 50);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
