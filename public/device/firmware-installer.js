(function (global) {
  'use strict';

  const USB = Object.freeze({
    runtime: Object.freeze({ vendorId: 0xcafe, productId: 0x401f }),
    bootloader: Object.freeze({ vendorId: 0x2e8a, productId: 0x000f }),
  });
  const MANIFEST_URL = '/firmware/manifest.json';
  const DEFAULT_UF2 = '/firmware/zoolark-rp2350b-v0.4.0-test.uf2';
  const state = { selectedRuntime: null, selectedBootloader: null, manifest: null };

  global.ZooLarkUSB = USB;

  function hex4(v) { return `0x${Number(v || 0).toString(16).toUpperCase().padStart(4, '0')}`; }
  function same(device, id) { return !!device && device.vendorId === id.vendorId && device.productId === id.productId; }
  function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function patchRuntimeTransport() {
    if (!global.WFL2?.WebUSBTransport || global.__ZL_RUNTIME_USB_PATCHED__) return false;
    const Base = global.WFL2.WebUSBTransport;
    global.WFL2.WebUSBTransport = class ZooLarkRuntimeWebUSBTransport extends Base {
      constructor(options = {}) {
        super({ ...options, filters: [{ vendorId: USB.runtime.vendorId, productId: USB.runtime.productId }] });
      }
      async connect(options = {}) {
        const device = options?.device || global.__ZL_SELECTED_RUNTIME_DEVICE || null;
        global.__ZL_SELECTED_RUNTIME_DEVICE = null;
        return super.connect({ ...options, device });
      }
    };
    global.__ZL_RUNTIME_USB_PATCHED__ = true;
    return true;
  }

  async function loadManifest() {
    if (state.manifest) return state.manifest;
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`无法读取固件清单 (${res.status})`);
    state.manifest = await res.json();
    return state.manifest;
  }

  async function sha256Hex(buffer) {
    if (!global.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }

  function ui() {
    return {
      panel: document.getElementById('zl-usb-setup'),
      badge: document.getElementById('zl-usb-state-badge'),
      title: document.getElementById('zl-usb-state-title'),
      detail: document.getElementById('zl-usb-state-detail'),
      progress: document.getElementById('zl-fw-progress'),
      progressFill: document.getElementById('zl-fw-progress-fill'),
      progressText: document.getElementById('zl-fw-progress-text'),
      install: document.getElementById('zl-install-uf2'),
      connect: document.getElementById('zl-connect-runtime'),
      detect: document.getElementById('zl-detect-usb'),
      download: document.getElementById('zl-download-uf2'),
      version: document.getElementById('zl-fw-version'),
    };
  }

  function setStatus(kind, title, detail) {
    const el = ui();
    if (!el.badge) return;
    el.badge.className = `zl-usb-badge ${kind}`;
    el.badge.textContent = kind === 'runtime' ? 'RUNTIME' : kind === 'boot' ? 'BOOTSEL' : kind === 'busy' ? 'WORKING' : 'NO DEVICE';
    el.title.textContent = title;
    el.detail.textContent = detail;
    el.install.disabled = kind === 'busy';
    el.detect.disabled = kind === 'busy';
    el.connect.disabled = kind === 'busy';
  }

  function setProgress(percent, text) {
    const el = ui();
    if (!el.progress) return;
    el.progress.style.display = 'block';
    el.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    el.progressText.textContent = text || `${percent}%`;
  }

  function hideProgress() {
    const el = ui();
    if (el.progress) el.progress.style.display = 'none';
  }

  async function classifyAuthorizedDevices() {
    if (!navigator.usb) return { runtime: null, bootloader: null };
    const devices = await navigator.usb.getDevices();
    const runtime = devices.find(d => same(d, USB.runtime)) || null;
    const bootloader = devices.find(d => same(d, USB.bootloader)) || null;
    state.selectedRuntime = runtime;
    state.selectedBootloader = bootloader;
    if (runtime) global.__ZL_SELECTED_RUNTIME_DEVICE = runtime;
    return { runtime, bootloader };
  }

  async function refreshStatus() {
    if (!navigator.usb) {
      setStatus('none', '浏览器不支持 WebUSB', '请使用桌面版 Chrome 或 Edge。UF2 仍可下载并手工拖入 RP2350 盘。');
      return;
    }
    try {
      const { runtime, bootloader } = await classifyAuthorizedDevices();
      if (runtime) {
        setStatus('runtime', '检测到 ZooLark Runtime', `${runtime.productName || 'ZooLark RP2350'} · ${hex4(runtime.vendorId)}:${hex4(runtime.productId)} · 可以连接仪器`);
      } else if (bootloader) {
        setStatus('boot', '检测到 RP2350 BOOTSEL', `RP2350 ROM Bootloader · ${hex4(bootloader.vendorId)}:${hex4(bootloader.productId)} · 可以安装 UF2`);
      } else {
        setStatus('none', '尚未获得设备授权', '如果 Finder 已出现“RP2350”盘，可直接点“安装 UF2 到 RP2350 盘”，或先点“检测 USB 状态”。');
      }
    } catch (err) {
      setStatus('none', 'USB 状态读取失败', err.message || String(err));
    }
  }

  async function requestEitherDevice() {
    if (!navigator.usb) throw new Error('当前浏览器不支持 WebUSB');
    const device = await navigator.usb.requestDevice({ filters: [USB.runtime, USB.bootloader] });
    if (same(device, USB.runtime)) {
      state.selectedRuntime = device;
      global.__ZL_SELECTED_RUNTIME_DEVICE = device;
      setStatus('runtime', '检测到 ZooLark Runtime', `${device.productName || 'ZooLark RP2350'} · ${hex4(device.vendorId)}:${hex4(device.productId)} · 点击“连接 Runtime”开始工作`);
    } else if (same(device, USB.bootloader)) {
      state.selectedBootloader = device;
      setStatus('boot', '检测到 RP2350 BOOTSEL', `ROM Bootloader · ${hex4(device.vendorId)}:${hex4(device.productId)} · 点击“安装 UF2 到 RP2350 盘”`);
    }
    return device;
  }

  async function loadFirmwareBytes() {
    setProgress(5, '读取固件清单…');
    const manifest = await loadManifest();
    const file = manifest.file || DEFAULT_UF2;
    const res = await fetch(file, { cache: 'no-store' });
    if (!res.ok) throw new Error(`UF2 下载失败 (${res.status})`);
    const buffer = await res.arrayBuffer();
    if (manifest.size && Number(manifest.size) !== buffer.byteLength) throw new Error(`UF2 大小校验失败：${buffer.byteLength} != ${manifest.size}`);
    setProgress(20, '校验 UF2…');
    if (manifest.sha256) {
      const actual = await sha256Hex(buffer);
      if (actual && actual.toLowerCase() !== String(manifest.sha256).toLowerCase()) throw new Error('UF2 SHA-256 校验失败');
    }
    return { manifest, buffer };
  }

  async function looksLikeRp2350Volume(dir) {
    for (const name of ['INFO_UF2.TXT', 'INDEX.HTM']) {
      try { await dir.getFileHandle(name); return true; } catch (_) {}
    }
    return false;
  }

  async function installUf2ToMountedVolume() {
    if (!global.showDirectoryPicker) {
      triggerDownload();
      throw new Error('当前 Chrome 未提供目录写入 API，已改为下载 UF2；请手工拖到 RP2350 盘。');
    }
    setStatus('busy', '准备安装 ZooLark 固件', '下一步请选择 Finder 里已经挂载的“RP2350”盘。');
    const { manifest, buffer } = await loadFirmwareBytes();
    setProgress(25, '请选择 RP2350 盘…');
    const dir = await global.showDirectoryPicker({ mode: 'readwrite' });
    const valid = await looksLikeRp2350Volume(dir);
    if (!valid) throw new Error('选择的目录不像 RP2350 BOOTSEL 盘：没有找到 INFO_UF2.TXT / INDEX.HTM');

    const filename = (manifest.file || DEFAULT_UF2).split('/').pop();
    setProgress(35, `写入 ${filename}…`);
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    let payloadWritten = false;
    try {
      await writable.write(buffer);
      payloadWritten = true;
      setProgress(90, 'UF2 已写入，等待 RP2350 重启…');
      await writable.close();
    } catch (err) {
      // BOOTSEL volume may disappear immediately after a successful UF2 copy.
      if (!payloadWritten) throw err;
    }

    setProgress(100, '安装完成，RP2350 正在重启');
    setStatus('boot', 'UF2 已写入', 'RP2350 会自动退出 BOOTSEL 并启动 ZooLark Runtime。稍等 2–3 秒后点击“连接 Runtime”。');
    await delay(2200);
    await refreshStatus();
  }

  function triggerDownload() {
    const link = document.createElement('a');
    link.href = state.manifest?.file || DEFAULT_UF2;
    link.download = (state.manifest?.file || DEFAULT_UF2).split('/').pop();
    document.body.appendChild(link); link.click(); link.remove();
  }

  function connectRuntime() {
    const scan = document.getElementById('scan-usb');
    if (!scan) {
      setStatus('none', '连接按钮尚未就绪', '请关闭弹窗后重新打开“连接真机”。');
      return;
    }
    if (state.selectedRuntime) global.__ZL_SELECTED_RUNTIME_DEVICE = state.selectedRuntime;
    scan.click();
  }

  function injectStyles() {
    if (document.getElementById('zl-firmware-installer-style')) return;
    const style = document.createElement('style');
    style.id = 'zl-firmware-installer-style';
    style.textContent = `
      #zl-usb-setup{margin:10px 0 12px;padding:12px;border:1px solid #263a52;border-radius:10px;background:linear-gradient(145deg,#101b2a,#11152a);color:#dce8f7;font:12px/1.45 system-ui,-apple-system,sans-serif}
      .zl-usb-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.zl-usb-head b{font-size:13px;color:#f2f7ff}.zl-usb-badge{font-size:10px;font-weight:800;letter-spacing:.05em;padding:3px 7px;border-radius:999px;background:#263041;color:#9fb0c3}.zl-usb-badge.runtime{background:#123a2c;color:#70e6a7}.zl-usb-badge.boot{background:#3b3212;color:#ffd66b}.zl-usb-badge.busy{background:#17395a;color:#6bd4ff}
      .zl-usb-state{padding:9px 10px;background:#0b1220;border:1px solid #20324a;border-radius:8px}.zl-usb-state strong{display:block;color:#eef6ff;margin-bottom:2px}.zl-usb-state span{display:block;color:#91a5bc;font-size:11px}
      .zl-usb-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.zl-usb-actions button,.zl-usb-actions a{min-height:34px;box-sizing:border-box;border-radius:7px;border:1px solid #30445e;background:#172236;color:#dbe9fa;padding:7px 9px;text-align:center;text-decoration:none;cursor:pointer;font:600 11px/1.2 system-ui}.zl-usb-actions .primary{background:#0b88c9;border-color:#22b8ef;color:#fff}.zl-usb-actions .install{background:#155d43;border-color:#27a979;color:#ecfff7}.zl-usb-actions button:disabled{opacity:.45;cursor:not-allowed}
      .zl-fw-meta{display:flex;justify-content:space-between;gap:8px;margin-top:9px;color:#8094ab;font-size:10px}.zl-fw-progress{display:none;margin-top:9px}.zl-fw-track{height:5px;background:#0a0f18;border-radius:99px;overflow:hidden}.zl-fw-fill{height:100%;width:0;background:#20b7ee;transition:width .2s}.zl-fw-progress-text{margin-top:4px;color:#9db1c8;font-size:10px}.zl-usb-help{margin-top:8px;padding-top:8px;border-top:1px solid #223047;color:#7f93aa;font-size:10px}.zl-usb-help b{color:#adc0d6}
    `;
    document.head.appendChild(style);
  }

  async function injectPanel() {
    const usbCfg = document.getElementById('usb-config');
    if (!usbCfg || document.getElementById('zl-usb-setup')) return false;
    injectStyles();
    const panel = document.createElement('div');
    panel.id = 'zl-usb-setup';
    panel.innerHTML = `
      <div class="zl-usb-head"><b>ZooLark 真机 / 固件</b><span id="zl-usb-state-badge" class="zl-usb-badge">NO DEVICE</span></div>
      <div class="zl-usb-state"><strong id="zl-usb-state-title">检查 USB 状态…</strong><span id="zl-usb-state-detail">Runtime 与 Bootloader 会自动区分</span></div>
      <div class="zl-usb-actions">
        <button id="zl-detect-usb" type="button">检测 USB 状态</button>
        <button id="zl-connect-runtime" class="primary" type="button">连接 Runtime</button>
        <button id="zl-install-uf2" class="install" type="button">安装 UF2 到 RP2350 盘</button>
        <a id="zl-download-uf2" href="${DEFAULT_UF2}" download>下载 UF2</a>
      </div>
      <div id="zl-fw-progress" class="zl-fw-progress"><div class="zl-fw-track"><div id="zl-fw-progress-fill" class="zl-fw-fill"></div></div><div id="zl-fw-progress-text" class="zl-fw-progress-text">准备中…</div></div>
      <div class="zl-fw-meta"><span>Runtime: CAFE:401F</span><span>BOOTSEL: 2E8A:000F</span><span id="zl-fw-version">FW …</span></div>
      <div class="zl-usb-help"><b>首次使用：</b>按住 BOOTSEL 插入 USB；Finder 出现“RP2350”后点“安装 UF2 到 RP2350 盘”，选择该盘即可。写完后板子会自动重启，再点“连接 Runtime”。</div>`;
    usbCfg.prepend(panel);

    document.getElementById('zl-detect-usb').addEventListener('click', async () => {
      try { hideProgress(); await requestEitherDevice(); } catch (err) { if (err?.name !== 'NotFoundError') setStatus('none', '检测失败', err.message || String(err)); }
    });
    document.getElementById('zl-connect-runtime').addEventListener('click', connectRuntime);
    document.getElementById('zl-install-uf2').addEventListener('click', async () => {
      try { await installUf2ToMountedVolume(); } catch (err) { hideProgress(); setStatus('none', '固件安装未完成', err.message || String(err)); }
    });
    document.getElementById('zl-download-uf2').addEventListener('click', async () => {
      try { state.manifest = await loadManifest(); } catch (_) {}
    });

    const oldScan = document.getElementById('scan-usb');
    if (oldScan) { oldScan.textContent = '连接 Runtime'; oldScan.title = '连接 ZooLark Runtime WebUSB (CAFE:401F)'; }

    try {
      const manifest = await loadManifest();
      const ver = document.getElementById('zl-fw-version');
      if (ver) ver.textContent = `FW ${manifest.version || '?'}`;
      const dl = document.getElementById('zl-download-uf2');
      if (dl && manifest.file) { dl.href = manifest.file; dl.download = manifest.file.split('/').pop(); }
    } catch (_) {}

    // Remove the older bridge hint once it appears; this panel supersedes it.
    const observer = new MutationObserver(() => usbCfg.querySelectorAll('.wfl-usb-note').forEach(n => n.remove()));
    observer.observe(usbCfg, { childList: true, subtree: false });
    usbCfg.querySelectorAll('.wfl-usb-note').forEach(n => n.remove());

    await refreshStatus();
    return true;
  }

  function start() {
    let tries = 0;
    const patchTimer = setInterval(() => { tries++; if (patchRuntimeTransport() || tries > 160) clearInterval(patchTimer); }, 25);
    let domTries = 0;
    const domTimer = setInterval(async () => { domTries++; if (await injectPanel() || domTries > 160) clearInterval(domTimer); }, 25);
    navigator.usb?.addEventListener?.('connect', () => setTimeout(refreshStatus, 150));
    navigator.usb?.addEventListener?.('disconnect', () => setTimeout(refreshStatus, 250));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(window);
