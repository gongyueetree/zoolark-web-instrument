(function () {
  'use strict';

  const UF2 = '/firmware/zoolark-rp2350b-v0.4.0-test.uf2';

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
    a.download = 'zoolark-rp2350b-v0.4.0-test.uf2';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function patchOnce() {
    const install = document.getElementById('zl-install-uf2');
    if (install && !install.dataset.safeManualPatched) {
      install.dataset.safeManualPatched = '1';
      install.textContent = '下载 UF2（手工刷入）';
      install.title = '稳定模式：下载 UF2 后手工拖到 Finder 的 RP2350 盘';
    }

    const help = document.querySelector('.zl-usb-help');
    if (help && !help.dataset.safeManualPatched) {
      help.dataset.safeManualPatched = '1';
      help.innerHTML = '<b>稳定测试流程：</b>按住 BOOTSEL 插入 USB，Finder 出现“RP2350”后，点击“下载 UF2（手工刷入）”，再把下载的 .uf2 文件拖到 RP2350 盘。RP2350 盘自动消失后，点击“连接 Runtime”。';
    }
  }

  document.addEventListener('click', function (event) {
    const install = event.target.closest?.('#zl-install-uf2');
    if (!install) return;

    // Capture phase deliberately blocks the older direct-to-mounted-volume handler.
    event.preventDefault();
    event.stopImmediatePropagation();
    downloadUf2();
    setStatus(
      'UF2 已开始下载',
      '请把 zoolark-rp2350b-v0.4.0-test.uf2 手工拖到 Finder 左侧的 RP2350 盘。盘自动消失后，再点“连接 Runtime”。',
      'MANUAL',
      'boot'
    );
  }, true);

  function start() {
    patchOnce();
    // Only retry a few times while the legacy modal is being created. No MutationObserver.
    let tries = 0;
    const timer = setInterval(() => {
      patchOnce();
      if (++tries >= 80 || document.getElementById('zl-install-uf2')) clearInterval(timer);
    }, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
