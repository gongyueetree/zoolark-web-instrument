(function () {
  'use strict';

  function patchTransport() {
    if (!window.WFL2?.WebUSBTransport || window.__ZL_TEST_PATCHED__) return false;
    const Base = window.WFL2.WebUSBTransport;
    window.WFL2.WebUSBTransport = class ZooLarkTestWebUSBTransport extends Base {
      constructor(options = {}) {
        const passed = Array.isArray(options.filters) ? options.filters : [];
        const filters = [...passed];
        if (!filters.some(f => f.vendorId === 0xcafe)) filters.push({ vendorId: 0xcafe, productId: 0x401f });
        super({ ...options, filters });
      }
    };
    window.__ZL_TEST_PATCHED__ = true;
    return true;
  }

  function injectFirmwareCard() {
    if (document.getElementById('zl-firmware-test-card')) return;
    const card = document.createElement('div');
    card.id = 'zl-firmware-test-card';
    card.style.cssText = 'position:fixed;right:18px;bottom:52px;z-index:9999;width:330px;background:#10151d;border:1px solid #2d3b4e;border-radius:12px;padding:14px;color:#eaf2ff;box-shadow:0 12px 36px #0008;font:13px/1.45 system-ui';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>RP2350 真机测试固件</b><span style="color:#67e8a5">v0.4.0-test</span></div>
      <div style="color:#9fb0c3;margin-bottom:10px">GPIO0–7：8CH Logic · GPIO10–13：JTAG · GPIO25：LED</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="/firmware/zoolark-rp2350b-v0.4.0-test.uf2" download style="background:#1473e6;color:white;text-decoration:none;padding:7px 10px;border-radius:7px">下载 UF2</a>
        <a href="/firmware/manifest.json" target="_blank" style="background:#202a36;color:#d8e5f3;text-decoration:none;padding:7px 10px;border-radius:7px">Manifest</a>
        <button id="zl-fw-card-close" style="background:#202a36;color:#d8e5f3;border:0;padding:7px 10px;border-radius:7px;cursor:pointer">关闭</button>
      </div>
      <div style="margin-top:9px;color:#8295aa">烧录后点页面里的“连接真机”。测试 VID/PID：CAFE:401F。</div>`;
    document.body.appendChild(card);
    document.getElementById('zl-fw-card-close')?.addEventListener('click', () => card.remove());
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    if (patchTransport() || tries > 120) clearInterval(timer);
  }, 25);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectFirmwareCard, { once: true });
  else injectFirmwareCard();
})();
