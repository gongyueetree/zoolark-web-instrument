(function () {
  'use strict';

  const UF2 = '/firmware/zoolark-rp2350b-v0.4.1-heartbeat.uf2';
  const UF2_NAME = 'zoolark-rp2350b-v0.4.1-heartbeat.uf2';

  function setStatus(title, detail, badgeText, badgeClass) {
    const badge = document.getElementById('zl-usb-state-badge');
    const titleEl = document.getElementById('zl-usb-state-title');
    const detailEl = document.getElementById('zl-usb-state-detail');
    const progress = document.getElementById('zl-fw-progress');
    if (badge) {
      badge.className = `zl-usb-badge ${badgeClass || 'boot'}`;
      badge.textContent = badgeText || 'BOOTSEL';
    }
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
    if (progress) progress.style.display = 'none';
  }

  function downloadUf2() {
    const a = document.createElement('a');
    a.href = UF2;
    a.download = UF2_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function patchOnce() {
    const install = document.getElementById('zl-install-uf2');
    if (install && !install.dataset.safeManualPatched) {
      install.dataset.safeManualPatched = '1';
      install.textContent = '下载心跳 UF2（手工刷入）';
      install.title = 'GPIO25 每秒闪一次：下载 UF2 后手工拖到 Finder 的 RP2350 盘';
    }

    const help = document.querySelector('.zl-usb-help');
    if (help && !help.dataset.safeManualPatched) {
      help.dataset.safeManualPatched = '1';
      help.innerHTML = '<b>心跳测试：</b>按住 BOOTSEL 插入 USB，下载 <code>0.4.1-heartbeat</code> UF2 并拖到 RP2350 盘。盘自动消失后，GPIO25 应每秒亮 100ms、灭 900ms；看到心跳即可确认应用固件已经运行。';
    }
  }

  document.addEventListener('click', function (event) {
    const install = event.target.closest?.('#zl-install-uf2');
    if (!install) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    downloadUf2();
    setStatus(
      '心跳 UF2 已开始下载',
      `请把 ${UF2_NAME} 手工拖到 Finder 的 RP2350 盘。盘消失后观察 GPIO25：每秒应短亮一次。`,
      'MANUAL',
      'boot'
    );
  }, true);

  function start() {
    patchOnce();
    let tries = 0;
    const timer = setInterval(() => {
      patchOnce();
      if (++tries >= 80 || document.getElementById('zl-install-uf2')) clearInterval(timer);
    }, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
