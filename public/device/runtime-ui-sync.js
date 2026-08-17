(function () {
  'use strict';

  function syncRuntimeUi() {
    const badge = document.getElementById('zl-usb-state-badge');
    if (!badge || badge.textContent?.trim() !== 'RUNTIME') return;

    const progress = document.getElementById('zl-fw-progress');
    if (progress) progress.style.display = 'none';

    const install = document.getElementById('zl-install-uf2');
    if (install) {
      install.disabled = false;
      install.textContent = '重新安装 UF2';
    }

    const connect = document.getElementById('zl-connect-runtime');
    if (connect) {
      connect.disabled = false;
      connect.textContent = '连接 Runtime';
    }

    const usbCfg = document.getElementById('usb-config');
    if (usbCfg) {
      const candidates = usbCfg.querySelectorAll('div, span, p, strong');
      for (const el of candidates) {
        if (el.children.length === 0 && el.textContent?.trim() === '未检测到设备') {
          el.textContent = 'ZooLark RP2350 Web Instrument';
        }
      }
    }

    const legacyScan = document.getElementById('scan-usb');
    if (legacyScan) legacyScan.textContent = '连接 Runtime';
  }

  const observer = new MutationObserver(syncRuntimeUi);

  function start() {
    syncRuntimeUi();
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class']
    });
    navigator.usb?.addEventListener?.('connect', () => setTimeout(syncRuntimeUi, 200));
    navigator.usb?.addEventListener?.('disconnect', () => setTimeout(syncRuntimeUi, 200));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
