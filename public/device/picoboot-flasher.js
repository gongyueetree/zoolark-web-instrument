(function () {
  'use strict';

  // Browser-side subset of Raspberry Pi PICOBOOT, intentionally limited to
  // flashing the ZooLark RP2350 test UF2. Protocol layout mirrors boot/picoboot.h.
  const BOOT = Object.freeze({ vendorId: 0x2e8a, productId: 0x000f });
  const RUNTIME = Object.freeze({ vendorId: 0xcafe, productId: 0x401f });
  const MANIFEST_URL = '/firmware/manifest.json';
  const DEFAULT_UF2 = '/firmware/zoolark-rp2350b-v0.4.0-test.uf2';

  const PICOBOOT_MAGIC = 0x431fd10b;
  const PC_EXCLUSIVE_ACCESS = 0x01;
  const PC_FLASH_ERASE = 0x03;
  const PC_WRITE = 0x05;
  const PC_EXIT_XIP = 0x06;
  const PC_REBOOT2 = 0x0a;
  const EXCLUSIVE_AND_EJECT = 2;
  const REBOOT2_FLAG_REBOOT_TYPE_FLASH_UPDATE = 0x04;
  const PICOBOOT_IF_RESET = 0x41;
  const PICOBOOT_IF_CMD_STATUS = 0x42;

  const UF2_MAGIC0 = 0x0a324655;
  const UF2_MAGIC1 = 0x9e5d5157;
  const UF2_MAGIC_END = 0x0ab16f30;
  const FLASH_BASE = 0x10000000;
  const FLASH_SECTOR = 4096;

  let token = 1;
  let flashing = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function setStatus(kind, title, detail) {
    const badge = document.getElementById('zl-usb-state-badge');
    const t = document.getElementById('zl-usb-state-title');
    const d = document.getElementById('zl-usb-state-detail');
    if (badge) {
      badge.className = `zl-usb-badge ${kind}`;
      badge.textContent = kind === 'runtime' ? 'RUNTIME' : kind === 'boot' ? 'BOOTSEL' : kind === 'busy' ? 'FLASHING' : 'READY';
    }
    if (t) t.textContent = title;
    if (d) d.textContent = detail;
  }

  function setProgress(pct, text, visible = true) {
    const box = document.getElementById('zl-fw-progress');
    const fill = document.getElementById('zl-fw-progress-fill');
    const label = document.getElementById('zl-fw-progress-text');
    if (box) box.style.display = visible ? 'block' : 'none';
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    if (label) label.textContent = text || `${Math.round(pct)}%`;
  }

  function setButtons(busy) {
    for (const id of ['zl-install-uf2', 'zl-detect-usb', 'zl-connect-runtime']) {
      const el = document.getElementById(id);
      if (el) el.disabled = busy;
    }
  }

  async function sha256Hex(buffer) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }

  async function loadUf2() {
    setProgress(3, '读取固件清单…');
    const mr = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!mr.ok) throw new Error(`manifest 读取失败 (${mr.status})`);
    const manifest = await mr.json();
    const url = manifest.file || DEFAULT_UF2;
    setProgress(7, '下载 UF2…');
    const fr = await fetch(url, { cache: 'no-store' });
    if (!fr.ok) throw new Error(`UF2 下载失败 (${fr.status})`);
    const buffer = await fr.arrayBuffer();
    if (manifest.size && Number(manifest.size) !== buffer.byteLength) {
      throw new Error(`UF2 大小不匹配：${buffer.byteLength} != ${manifest.size}`);
    }
    if (manifest.sha256) {
      setProgress(10, '校验 UF2 SHA-256…');
      const actual = await sha256Hex(buffer);
      if (actual.toLowerCase() !== String(manifest.sha256).toLowerCase()) throw new Error('UF2 SHA-256 校验失败');
    }
    return { manifest, buffer };
  }

  function parseUf2(buffer) {
    if (buffer.byteLength % 512 !== 0) throw new Error('UF2 文件长度不是 512 bytes 的整数倍');
    const bytes = new Uint8Array(buffer);
    const blocks = [];
    let minAddr = 0xffffffff;
    let maxAddr = 0;
    for (let off = 0; off < bytes.length; off += 512) {
      const dv = new DataView(buffer, off, 512);
      if (dv.getUint32(0, true) !== UF2_MAGIC0 || dv.getUint32(4, true) !== UF2_MAGIC1 || dv.getUint32(508, true) !== UF2_MAGIC_END) {
        throw new Error(`UF2 block ${off / 512} magic 无效`);
      }
      const targetAddr = dv.getUint32(12, true);
      const payloadSize = dv.getUint32(16, true);
      if (!payloadSize || payloadSize > 476) throw new Error(`UF2 block ${off / 512} payload size 无效`);
      // This installer is deliberately restricted to normal RP2350 XIP flash UF2s.
      if (targetAddr < FLASH_BASE || targetAddr >= 0x11000000) continue;
      const data = bytes.slice(off + 32, off + 32 + payloadSize);
      blocks.push({ addr: targetAddr >>> 0, data });
      minAddr = Math.min(minAddr, targetAddr >>> 0);
      maxAddr = Math.max(maxAddr, (targetAddr + payloadSize) >>> 0);
    }
    if (!blocks.length) throw new Error('UF2 中没有找到 RP2350 Flash 数据块');
    blocks.sort((a, b) => a.addr - b.addr);
    return { blocks, minAddr: minAddr >>> 0, maxAddr: maxAddr >>> 0 };
  }

  function findPicobootInterface(device) {
    const cfg = device.configuration;
    if (!cfg) throw new Error('BOOTSEL USB configuration 不存在');
    // picotool selects the vendor-specific PICOBOOT interface; on the normal
    // two-interface BOOTSEL configuration it is interface 1, while MSD is class 0x08.
    for (const iface of cfg.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass !== 0xff) continue;
        const inEp = alt.endpoints.find(e => e.type === 'bulk' && e.direction === 'in');
        const outEp = alt.endpoints.find(e => e.type === 'bulk' && e.direction === 'out');
        if (inEp && outEp) return {
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alt.alternateSetting,
          inEndpoint: inEp.endpointNumber,
          outEndpoint: outEp.endpointNumber,
        };
      }
    }
    throw new Error('没有找到 RP2350 PICOBOOT Vendor Bulk interface');
  }

  function makeCmd(cmdId, cmdSize, transferLength, fillArgs) {
    const out = new Uint8Array(32);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, PICOBOOT_MAGIC, true);
    dv.setUint32(4, token++ >>> 0, true);
    out[8] = cmdId & 0xff;
    out[9] = cmdSize & 0xff;
    dv.setUint16(10, 0, true);
    dv.setUint32(12, transferLength >>> 0, true);
    if (fillArgs) fillArgs(dv, out.subarray(16));
    return out;
  }

  async function commandStatus(device, interfaceNumber) {
    try {
      const r = await device.controlTransferIn({
        requestType: 'vendor', recipient: 'interface', request: PICOBOOT_IF_CMD_STATUS,
        value: 0, index: interfaceNumber,
      }, 16);
      if (r.status !== 'ok' || !r.data || r.data.byteLength < 16) return null;
      const dv = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
      return { token: dv.getUint32(0, true), status: dv.getUint32(4, true), cmd: dv.getUint8(8), inProgress: dv.getUint8(9) };
    } catch (_) { return null; }
  }

  async function pbCommand(ctx, cmdId, cmdSize, transferLength = 0, dataOut = null, fillArgs = null, ignoreAckError = false) {
    const { device, inEndpoint, outEndpoint, interfaceNumber } = ctx;
    const cmd = makeCmd(cmdId, cmdSize, transferLength, fillArgs);
    let r = await device.transferOut(outEndpoint, cmd);
    if (r.status !== 'ok') throw new Error(`PICOBOOT command 0x${cmdId.toString(16)} header OUT: ${r.status}`);

    if (transferLength) {
      if (cmdId & 0x80) {
        const input = await device.transferIn(inEndpoint, transferLength);
        if (input.status !== 'ok') throw new Error(`PICOBOOT data IN: ${input.status}`);
        // IN commands require a zero-length OUT ACK. Not used by flashing path today.
        await device.transferOut(outEndpoint, new Uint8Array(0));
        return input.data ? new Uint8Array(input.data.buffer, input.data.byteOffset, input.data.byteLength) : new Uint8Array(0);
      }
      r = await device.transferOut(outEndpoint, dataOut);
      if (r.status !== 'ok') {
        const st = await commandStatus(device, interfaceNumber);
        throw new Error(`PICOBOOT data OUT: ${r.status}${st ? ` (status ${st.status})` : ''}`);
      }
    }

    // OUT/no-data commands are acknowledged by a zero-length packet on IN.
    try {
      const ack = await device.transferIn(inEndpoint, 1);
      if (ack.status === 'stall') {
        const st = await commandStatus(device, interfaceNumber);
        try { await device.clearHalt('in', inEndpoint); } catch (_) {}
        throw new Error(`PICOBOOT 0x${cmdId.toString(16)} failed${st ? `: status ${st.status}` : ''}`);
      }
      if (ack.status !== 'ok' && !ignoreAckError) throw new Error(`PICOBOOT ACK: ${ack.status}`);
    } catch (err) {
      if (!ignoreAckError) throw err;
    }
    return null;
  }

  async function openBootloader() {
    if (!navigator.usb) throw new Error('当前浏览器不支持 WebUSB');
    let device = (await navigator.usb.getDevices()).find(d => d.vendorId === BOOT.vendorId && d.productId === BOOT.productId);
    if (!device) {
      device = await navigator.usb.requestDevice({ filters: [BOOT] });
    }
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);
    const iface = findPicobootInterface(device);
    await device.claimInterface(iface.interfaceNumber);
    if (iface.alternateSetting) await device.selectAlternateInterface(iface.interfaceNumber, iface.alternateSetting);

    // Reset any stale PICOBOOT endpoint state. This is the same vendor-interface reset
    // request used by picotool before issuing commands.
    try {
      await device.controlTransferOut({
        requestType: 'vendor', recipient: 'interface', request: PICOBOOT_IF_RESET,
        value: 0, index: iface.interfaceNumber,
      });
    } catch (_) {}
    return { device, ...iface };
  }

  async function flashUf2ViaPicoboot() {
    if (flashing) return;
    flashing = true;
    setButtons(true);
    try {
      setStatus('busy', '准备 PICOBOOT 直刷', '不再经过 Finder 文件系统，浏览器将直接写 RP2350 Flash。');
      const [{ manifest }, parsed, ctx] = await (async () => {
        const fw = await loadUf2();
        const p = parseUf2(fw.buffer);
        setProgress(12, `UF2 已解析：${p.blocks.length} blocks`);
        const c = await openBootloader();
        return [fw, p, c];
      })();

      setProgress(15, '锁定 PICOBOOT，弹出 RP2350 磁盘…');
      await pbCommand(ctx, PC_EXCLUSIVE_ACCESS, 1, 0, null, (dv, args) => { args[0] = EXCLUSIVE_AND_EJECT; });

      setProgress(18, '退出 XIP 模式…');
      await pbCommand(ctx, PC_EXIT_XIP, 0);

      const sectors = [];
      const seen = new Set();
      for (const b of parsed.blocks) {
        const base = b.addr & ~(FLASH_SECTOR - 1);
        if (!seen.has(base)) { seen.add(base); sectors.push(base >>> 0); }
      }
      sectors.sort((a, b) => a - b);

      for (let i = 0; i < sectors.length; i++) {
        const addr = sectors[i];
        const pct = 20 + (i / Math.max(1, sectors.length)) * 20;
        setProgress(pct, `擦除 Flash ${i + 1}/${sectors.length} · 0x${addr.toString(16).toUpperCase()}`);
        await pbCommand(ctx, PC_FLASH_ERASE, 8, 0, null, dv => {
          dv.setUint32(16, addr >>> 0, true);
          dv.setUint32(20, FLASH_SECTOR, true);
        });
      }

      for (let i = 0; i < parsed.blocks.length; i++) {
        const b = parsed.blocks[i];
        const pct = 42 + (i / Math.max(1, parsed.blocks.length)) * 50;
        setProgress(pct, `写入 Flash ${i + 1}/${parsed.blocks.length} · 0x${b.addr.toString(16).toUpperCase()}`);
        await pbCommand(ctx, PC_WRITE, 8, b.data.length, b.data, dv => {
          dv.setUint32(16, b.addr >>> 0, true);
          dv.setUint32(20, b.data.length >>> 0, true);
        });
      }

      setProgress(94, 'Flash 写入完成，发送 RP2350 REBOOT2…');
      setStatus('busy', '固件已写入，正在启动 ZooLark', `${manifest.version || '0.4.0-test'} · PICOBOOT REBOOT2`);

      // RP2350 may disappear before ACK because reboot has already been scheduled.
      await pbCommand(ctx, PC_REBOOT2, 16, 0, null, dv => {
        dv.setUint32(16, REBOOT2_FLAG_REBOOT_TYPE_FLASH_UPDATE, true);
        dv.setUint32(20, 250, true);
        dv.setUint32(24, parsed.minAddr >>> 0, true);
        dv.setUint32(28, 0, true);
      }, true);

      setProgress(100, 'PICOBOOT 刷写完成；等待 ZooLark Runtime 枚举…');
      try { await ctx.device.close(); } catch (_) {}
      await sleep(900);
      setStatus('runtime', 'ZooLark 固件已刷入', 'BOOTSEL 已结束。点击“连接 Runtime”，首次会弹出 CAFE:401F WebUSB 授权窗口。');
      const install = document.getElementById('zl-install-uf2');
      if (install) install.textContent = '重新刷写固件';
      const connect = document.getElementById('zl-connect-runtime');
      if (connect) { connect.disabled = false; connect.textContent = '连接 Runtime'; }
      const legacyText = Array.from(document.querySelectorAll('#usb-config div,#usb-config span,#usb-config p,#usb-config strong')).find(el => el.children.length === 0 && el.textContent?.trim() === '未检测到设备');
      if (legacyText) legacyText.textContent = '等待 Runtime WebUSB 授权';
    } finally {
      flashing = false;
      setButtons(false);
    }
  }

  function patchUi() {
    const install = document.getElementById('zl-install-uf2');
    if (install) {
      install.textContent = 'PICOBOOT 一键刷入 UF2';
      install.title = '直接通过 RP2350 PICOBOOT WebUSB 写 Flash，不使用 Finder 文件系统';
    }
    const help = document.querySelector('.zl-usb-help');
    if (help) help.innerHTML = '<b>首次使用：</b>按住 BOOTSEL 插入 USB，点击“PICOBOOT 一键刷入 UF2”。浏览器会直接通过 Boot ROM 的 Vendor USB 接口擦写 Flash 并重启；“下载 UF2”仅作为手工拖盘兜底。';
  }

  document.addEventListener('click', async event => {
    const install = event.target.closest?.('#zl-install-uf2');
    if (!install) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      await flashUf2ViaPicoboot();
    } catch (err) {
      console.error('[PICOBOOT]', err);
      setButtons(false);
      setProgress(0, '', false);
      if (err?.name === 'NotFoundError') {
        setStatus('boot', '未选择 RP2350 BOOTSEL', '请确认板子处于 BOOTSEL，再点击“一键刷入 UF2”。');
      } else {
        setStatus('boot', 'PICOBOOT 刷写失败', err?.message || String(err));
      }
    }
  }, true);

  const obs = new MutationObserver(patchUi);
  function start() {
    patchUi();
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.ZooLarkPicoBoot = { flashUf2ViaPicoboot, parseUf2 };
})();
