(function () {
  'use strict';

  const RUNTIME = { vendorId: 0xcafe, productId: 0x401f };
  const MANIFEST = '/firmware/manifest.json';
  const FALLBACK_UF2 = '/firmware/zoolark-rp2350b-v0.4.0-test.uf2';

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function status(kind, title, detail) {
    const badge = document.getElementById('zl-usb-state-badge');
    const titleEl = document.getElementById('zl-usb-state-title');
    const detailEl = document.getElementById('zl-usb-state-detail');
    if (badge) {
      badge.className = `zl-usb-badge ${kind}`;
      badge.textContent = kind === 'runtime' ? 'RUNTIME' : kind === 'busy' ? 'WORKING' : kind === 'boot' ? 'BOOTSEL' : 'READY';
    }
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
  }

  function progress(percent, text, visible = true) {
    const box = document.getElementById('zl-fw-progress');
    const fill = document.getElementById('zl-fw-progress-fill');
    const label = document.getElementById('zl-fw-progress-text');
    if (box) box.style.display = visible ? 'block' : 'none';
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (label) label.textContent = text || `${percent}%`;
  }

  function enableActions() {
    for (const id of ['zl-install-uf2', 'zl-detect-usb', 'zl-connect-runtime']) {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    }
  }

  async function looksLikeRp2350Volume(dir) {
    for (const name of ['INFO_UF2.TXT', 'INDEX.HTM']) {
      try { await dir.getFileHandle(name); return true; } catch (_) {}
    }
    return false;
  }

  async function sha256Hex(buffer) {
    if (!crypto?.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }

  async function loadFirmware() {
    const manifestRes = await fetch(MANIFEST, { cache: 'no-store' });
    if (!manifestRes.ok) throw new Error(`manifest 读取失败 (${manifestRes.status})`);
    const manifest = await manifestRes.json();
    const url = manifest.file || FALLBACK_UF2;
    const fwRes = await fetch(url, { cache: 'no-store' });
    if (!fwRes.ok) throw new Error(`UF2 下载失败 (${fwRes.status})`);
    const buffer = await fwRes.arrayBuffer();
    if (manifest.size && Number(manifest.size) !== buffer.byteLength) {
      throw new Error(`UF2 大小校验失败：${buffer.byteLength} != ${manifest.size}`);
    }
    if (manifest.sha256) {
      const actual = await sha256Hex(buffer);
      if (actual && actual.toLowerCase() !== String(manifest.sha256).toLowerCase()) {
        throw new Error('UF2 SHA-256 校验失败');
      }
    }
    return { manifest, buffer, url };
  }

  async function guardedInstall() {
    if (!window.showDirectoryPicker) {
      status('none', '当前浏览器不能直接写 RP2350 盘', '请点击“下载 UF2”，然后手工拖到 Finder 里的 RP2350 盘。');
      progress(0, '', false);
      return;
    }

    status('busy', '选择 RP2350 BOOTSEL 盘', '请选择 Finder 左侧已经挂载的“RP2350”卷。');
    progress(5, '等待选择 RP2350 盘…');

    // Must be invoked immediately from the user's click so Chrome keeps transient activation.
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (!await looksLikeRp2350Volume(dir)) {
      throw new Error('选择的目录不是 RP2350 BOOTSEL 盘：未找到 INFO_UF2.TXT / INDEX.HTM');
    }

    progress(15, '下载并校验 UF2…');
    const { manifest, buffer, url } = await loadFirmware();
    const filename = url.split('/').pop();

    status('busy', '正在写入 ZooLark 固件', `${filename} · ${(buffer.byteLength / 1024).toFixed(1)} KiB`);
    progress(35, '打开 RP2350 写入流…');

    const handle = await dir.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(buffer);
    progress(90, 'UF2 数据已提交，等待磁盘弹出/设备重启…');

    // RP2350 normally ejects the mass-storage volume immediately after a valid UF2 is committed.
    // On macOS/Chrome the promise returned by close() can remain pending because the target volume
    // disappears while Chromium is finalising the write. Never let that UI state block forever.
    const closeResult = await Promise.race([
      writable.close().then(() => 'closed').catch(() => 'ejected'),
      sleep(1800).then(() => 'timeout')
    ]);

    progress(100, closeResult === 'timeout' ? 'UF2 已提交；不再等待文件系统 close()' : 'UF2 写入完成');
    status('runtime', 'UF2 已提交，下一步连接 Runtime', '如果 Finder 里的 RP2350 盘已经消失，板子已经重启。首次 Runtime 连接需要重新授权 CAFE:401F。');
    enableActions();

    // Do not wait forever for getDevices(): BOOTSEL and Runtime have different VID/PID and
    // WebUSB permission is paired to the device identity, so Runtime usually needs requestDevice().
    await sleep(900);
    progress(100, '请点击“连接 Runtime”完成首次 WebUSB 授权');

    const connect = document.getElementById('zl-connect-runtime');
    if (connect) {
      connect.disabled = false;
      connect.textContent = '连接 Runtime';
    }

    const install = document.getElementById('zl-install-uf2');
    if (install) install.textContent = '重新安装 UF2';

    const legacy = document.querySelector('#usb-config');
    if (legacy) {
      for (const el of legacy.querySelectorAll('div,span,p,strong')) {
        if (el.children.length === 0 && el.textContent?.trim() === '未检测到设备') {
          el.textContent = '等待 Runtime WebUSB 授权';
        }
      }
    }
  }

  async function directRuntimeConnect() {
    if (!navigator.usb) throw new Error('当前浏览器不支持 WebUSB');
    status('busy', '选择 ZooLark Runtime', 'Chrome 将弹出设备列表，请选择 ZooLark RP2350 Web Instrument。');
    progress(0, '', false);
    const device = await navigator.usb.requestDevice({ filters: [RUNTIME] });
    window.__ZL_SELECTED_RUNTIME_DEVICE = device;
    status('runtime', '已授权 ZooLark Runtime', `${device.productName || 'ZooLark RP2350 Web Instrument'} · CAFE:401F · 正在建立 WFL2 连接…`);
    const scan = document.getElementById('scan-usb');
    if (!scan) throw new Error('Runtime 连接入口尚未就绪，请关闭弹窗后重试');
    scan.click();
  }

  document.addEventListener('click', async event => {
    const install = event.target.closest?.('#zl-install-uf2');
    if (install) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        install.disabled = true;
        await guardedInstall();
      } catch (err) {
        enableActions();
        progress(0, '', false);
        if (err?.name === 'AbortError') {
          status('none', '已取消固件安装', '没有修改 RP2350。');
        } else {
          status('none', '固件安装未完成', err?.message || String(err));
        }
      }
      return;
    }

    const connect = event.target.closest?.('#zl-connect-runtime');
    if (connect) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        connect.disabled = true;
        await directRuntimeConnect();
      } catch (err) {
        enableActions();
        if (err?.name !== 'NotFoundError') status('none', 'Runtime 连接失败', err?.message || String(err));
      }
    }
  }, true);
})();
