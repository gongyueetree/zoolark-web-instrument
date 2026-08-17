(function () {
  'use strict';

  const state = {
    mode: 'demo', client: null, transport: null, logic: null, jtag: null,
    usbInfo: null, deviceInfo: null, selectedFile: null, lastCapture: null,
  };

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(fn, 0), { once: true });
    else setTimeout(fn, 0);
  }

  ready(async () => {
    for (let i = 0; i < 100 && !window.WFL2; i++) await new Promise(r => setTimeout(r, 25));
    if (!window.WFL2) return console.error('WFL2 device stack not loaded');
    injectStyles(); injectPages(); injectTransportBadge(); wireNavigation(); wireTransport(); wireLogic(); wireJtag(); wireBattery();
    await connectDemo();
  });

  async function connectDemo() {
    await disconnectCurrent(false);
    state.mode = 'demo'; state.transport = new WFL2.MockTransport(); state.client = new WFL2.DeviceClient(state.transport);
    state.logic = new WFL2.LogicAnalyzerService(state.client); state.jtag = new WFL2.JtagService(state.client);
    state.usbInfo = await state.client.connect(); state.deviceInfo = await state.client.getDeviceInfo();
    setConnectedUI(true); updateTransportBadge(); updateDeviceSummary();
  }

  async function connectWebUSB(device = null) {
    await disconnectCurrent(false);
    state.mode = 'webusb'; state.transport = new WFL2.WebUSBTransport({ filters: [{ vendorId: 0x2e8a }] });
    state.client = new WFL2.DeviceClient(state.transport); state.logic = new WFL2.LogicAnalyzerService(state.client); state.jtag = new WFL2.JtagService(state.client);
    try {
      state.usbInfo = await state.client.connect({ device });
      state.deviceInfo = await state.client.getDeviceInfo();
      setConnectedUI(true); updateTransportBadge(); updateDeviceSummary(); toast('WebUSB 真机已连接', 'ok');
    } catch (err) {
      toast(err.message || String(err), 'error'); await connectDemo(); throw err;
    }
  }

  async function disconnectCurrent(update = true) {
    if (state.client?.connected) { try { await state.client.disconnect(); } catch (_) {} }
    state.client = null; state.transport = null; state.logic = null; state.jtag = null;
    if (update) { setConnectedUI(false); updateTransportBadge(); }
  }

  function setConnectedUI(connected) {
    const realConnected = connected && state.mode === 'webusb';
    if (window.AppState) { AppState.isConnected = realConnected; AppState.isRunning = connected; }
    const dot = document.querySelector('.connection-status .status-indicator-dot'); dot?.classList.toggle('connected', realConnected);
    const text = document.getElementById('connection-status-text');
    if (text) text.textContent = realConnected ? '已连接 (WebUSB)' : (connected ? 'Demo 模式' : '未连接');
    const btn = document.getElementById('connect-btn'); if (btn) btn.innerHTML = realConnected ? '<span class="status-indicator"></span>断开真机' : '<span class="status-indicator"></span>连接真机';
  }

  function injectTransportBadge() {
    const headerActions = document.querySelector('.header-actions'); if (!headerActions) return;
    const el = document.createElement('div'); el.id = 'wfl-transport-badge'; el.className = 'wfl-transport-badge'; headerActions.prepend(el); updateTransportBadge();
  }
  function updateTransportBadge() {
    const el = document.getElementById('wfl-transport-badge'); if (!el) return;
    const webusb = !!navigator.usb;
    el.innerHTML = `<span class="wfl-mode-dot ${state.mode === 'webusb' ? 'real' : 'demo'}"></span><strong>${state.mode === 'webusb' ? 'RP2350' : 'DEMO'}</strong><span>${state.mode === 'webusb' ? 'WebUSB Bulk' : 'Mock Transport'}</span><span class="wfl-api-pill ${webusb ? 'ok' : 'bad'}">WebUSB ${webusb ? '✓' : '×'}</span>`;
  }

  function wireTransport() {
    // Override only the USB scan action; serial/wifi legacy paths stay available.
    document.addEventListener('click', async (e) => {
      const directConnect = e.target.closest?.('#connect-device');
      if (directConnect && window.AppState?.serialConfig?.type === 'usb' && state.mode !== 'webusb') {
        e.preventDefault(); e.stopImmediatePropagation();
        document.getElementById('serial-config-modal')?.classList.add('hidden');
        try { await connectWebUSB(); } catch (_) {}
        return;
      }
      const scan = e.target.closest?.('#scan-usb');
      if (scan) {
        e.preventDefault(); e.stopImmediatePropagation();
        try { await connectWebUSB(); document.getElementById('serial-config-modal')?.classList.add('hidden'); } catch (_) {}
        return;
      }
      const connect = e.target.closest?.('#connect-btn');
      if (connect && state.mode === 'webusb' && state.client?.connected) {
        e.preventDefault(); e.stopImmediatePropagation(); await connectDemo(); toast('已断开真机，回到 Demo 模式'); return;
      }
      const demo = e.target.closest?.('#wfl-use-demo');
      if (demo) { e.preventDefault(); await connectDemo(); toast('已切换到 Demo 模式'); }
    }, true);

    const usbCfg = document.getElementById('usb-config');
    if (usbCfg) {
      const note = document.createElement('div'); note.className = 'wfl-usb-note';
      note.innerHTML = `<strong>推荐：</strong>RP2350 Vendor-specific Bulk interface。原生 USB 为 Full-Speed 12 Mb/s，因此逻辑分析仪采用“本地捕获 → 分块上传”。<button id="wfl-use-demo" class="btn btn-secondary" type="button">使用 Demo</button>`;
      usbCfg.appendChild(note);
    }
  }

  function injectPages() {
    const nav = document.querySelector('.nav-menu');
    if (nav) {
      nav.insertAdjacentHTML('beforeend', `
        <button class="nav-btn" data-instrument="battery-monitor" id="nav-battery-monitor"><span class="wfl-nav-icon">▱</span>电池</button>
        <button class="nav-btn" data-instrument="jtag-fpga" id="nav-jtag-fpga"><span class="wfl-nav-icon">⌁</span>JTAG/FPGA</button>`);
    }
    const controlsHost = document.querySelector('.control-panel .controls-content') || document.querySelector('.control-panel');
    if (controlsHost) {
      controlsHost.insertAdjacentHTML('beforeend', `
        <div class="instrument-controls hidden" id="battery-monitor-controls">
          <div class="control-group"><label>电池监控</label><div class="wfl-kv"><span>刷新周期</span><b>1 s</b></div><div class="wfl-kv"><span>保护</span><b class="ok-text">正常</b></div></div>
          <div class="control-actions"><button class="btn btn-secondary" id="battery-refresh">立即刷新</button></div>
        </div>
        <div class="instrument-controls hidden" id="jtag-fpga-controls">
          <div class="control-group"><label>JTAG 时钟</label><select class="control-select" id="jtag-clock"><option value="1000000">1 MHz</option><option value="5000000">5 MHz</option><option value="10000000" selected>10 MHz</option><option value="20000000">20 MHz</option></select></div>
          <div class="control-group"><label>I/O 电压</label><select class="control-select" id="jtag-voltage"><option value="1800">1.8 V</option><option value="2500">2.5 V</option><option value="3300" selected>3.3 V</option></select></div>
          <div class="control-actions"><button class="btn btn-primary" id="jtag-scan">扫描 JTAG Chain</button><button class="btn btn-secondary" id="jtag-reset">TAP Reset</button></div>
          <div class="control-group"><label>FPGA / CPLD 文件</label><input type="file" id="fpga-file" class="wfl-file" accept=".bit,.bin,.svf,.xsvf,.jed"><div class="small-label" id="fpga-file-meta">支持 BIT / BIN / SVF / XSVF / JED</div></div>
          <div class="control-group"><label>目标器件</label><select class="control-select" id="fpga-target"><option value="0">请先扫描 JTAG Chain</option></select></div>
          <div class="wfl-checks"><label><input type="checkbox" id="fpga-erase" checked> 擦除</label><label><input type="checkbox" id="fpga-verify" checked> 校验</label><label><input type="checkbox" id="fpga-run" checked> 编程后运行</label></div>
          <div class="control-actions"><button class="btn btn-primary" id="fpga-program" disabled>开始编程</button></div>
        </div>`);
    }
    const displayHost = document.querySelector('.display-area') || document.querySelector('.main-display') || document.querySelector('.display-panel');
    const fallbackHost = document.getElementById('oscilloscope-display')?.parentElement;
    const host = displayHost || fallbackHost;
    if (host) {
      host.insertAdjacentHTML('beforeend', `
        <div class="canvas-container hidden" id="battery-monitor-display">
          <div class="wfl-battery-page">
            <div class="wfl-battery-pack"><div class="wfl-battery-fill" id="battery-fill"></div><span id="battery-percent">75%</span></div>
            <div class="wfl-metric-grid"><div><span>电压</span><b id="battery-voltage">3.85 V</b></div><div><span>电流</span><b id="battery-current">-0.56 A</b></div><div><span>温度</span><b id="battery-temp">31.2 °C</b></div><div><span>SOH</span><b id="battery-soh">92%</b></div><div><span>剩余容量</span><b id="battery-capacity">2.85 Ah</b></div><div><span>预计时间</span><b id="battery-time">02:15:30</b></div></div>
          </div>
        </div>
        <div class="canvas-container hidden" id="jtag-fpga-display">
          <div class="wfl-jtag-page">
            <div class="wfl-card wfl-chain-card"><div class="wfl-card-title"><span>JTAG Chain</span><span id="jtag-chain-status" class="wfl-tag">未扫描</span></div><div id="jtag-chain-table" class="wfl-chain-empty">点击左侧“扫描 JTAG Chain”识别器件</div></div>
            <div class="wfl-card wfl-program-card"><div class="wfl-card-title"><span>FPGA Programmer</span><span id="fpga-program-state" class="wfl-tag">IDLE</span></div><div class="wfl-program-file" id="fpga-program-file">尚未选择文件</div><div class="wfl-progress"><div id="fpga-progress-fill"></div></div><div class="wfl-progress-label"><span id="fpga-progress-phase">等待操作</span><b id="fpga-progress-value">0%</b></div><pre id="jtag-log" class="wfl-terminal">[system] WFL2 JTAG/FPGA service ready\n</pre></div>
          </div>
        </div>`);
    }

    const logicControls = document.getElementById('logic-analyzer-controls');
    if (logicControls) logicControls.insertAdjacentHTML('beforeend', `
      <div class="wfl-divider"></div>
      <div class="control-group"><label>硬件捕获</label><div class="wfl-grid2"><select id="logic-trigger-channel" class="control-select"><option value="0">D0</option><option value="1">D1</option><option value="2">D2</option><option value="3">D3</option><option value="4">D4</option><option value="5">D5</option><option value="6">D6</option><option value="7">D7</option></select><select id="logic-trigger-edge" class="control-select"><option value="1">上升沿</option><option value="2">下降沿</option><option value="3">双边沿</option></select></div></div>
      <div class="control-group"><label>预触发 <span id="logic-pretrigger-value">20%</span></label><input type="range" id="logic-pretrigger" min="0" max="90" value="20" class="control-slider"></div>
      <div class="control-group"><label>协议解码</label><select id="logic-protocol" class="control-select"><option>I2C</option><option>SPI</option><option>UART</option><option>CAN</option><option>LIN</option><option>None</option></select></div>
      <div class="control-actions"><button class="btn btn-primary" id="logic-hw-capture">单次硬件捕获</button></div>
      <div class="wfl-capture-status" id="logic-capture-status">Demo Transport 已就绪</div>`);
    const logicDisplay = document.getElementById('logic-analyzer-display');
    if (logicDisplay) logicDisplay.insertAdjacentHTML('beforeend', `<div class="wfl-decode-strip" id="logic-decode-strip"><span class="proto">I2C</span><span>S</span><span>0x50</span><span>W</span><span>ACK</span><span>0x00</span><span>ACK</span><span>0xAB</span><span>ACK</span><span>P</span></div>`);
  }

  function wireNavigation() {
    for (const id of ['nav-battery-monitor', 'nav-jtag-fpga']) {
      document.getElementById(id)?.addEventListener('click', e => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); e.currentTarget.classList.add('active');
        const instrument = e.currentTarget.dataset.instrument;
        if (window.AppState) AppState.currentInstrument = instrument;
        window.switchInstrument?.(instrument);
      });
    }
  }

  function wireLogic() {
    const pre = document.getElementById('logic-pretrigger'); pre?.addEventListener('input', () => document.getElementById('logic-pretrigger-value').textContent = `${pre.value}%`);
    document.getElementById('logic-hw-capture')?.addEventListener('click', async () => {
      const btn = document.getElementById('logic-hw-capture'); const status = document.getElementById('logic-capture-status');
      try {
        btn.disabled = true; status.textContent = '配置采样与触发…';
        const sampleRate = parseRate(document.getElementById('logic-sample-rate')?.value || '25 MHz');
        const sampleCount = parseDepth(document.getElementById('logic-depth')?.value || '8K');
        let mask = 0; for (let i = 0; i < 8; i++) if (document.getElementById(`logic-ch${i}`)?.checked) mask |= 1 << i;
        const capture = await state.logic.capture({ sampleRate, sampleCount, enabledMask: mask, triggerChannel: Number(document.getElementById('logic-trigger-channel').value), triggerEdge: Number(document.getElementById('logic-trigger-edge').value), pretriggerPermille: Number(pre.value) * 10, thresholdMv: 1650 }, p => {
          status.textContent = p.phase === 'capture' ? `等待触发 / 捕获中… ${p.progress}%` : `USB 分块读取… ${p.progress}%`;
        });
        state.lastCapture = capture;
        if (window.AppState) {
          AppState.logicAnalyzer.sampleRate = capture.sampleRate; AppState.logicAnalyzer.depth = capture.sampleCount;
          AppState.logicAnalyzer.data = capture.channels.map(ch => Array.from(ch)); AppState.logicAnalyzer.cachedData = AppState.logicAnalyzer.data.map(ch => ch.slice()); AppState.logicAnalyzer.isRunning = false;
        }
        status.textContent = `完成：${capture.sampleCount.toLocaleString()} samples @ ${formatRate(capture.sampleRate)}，每个 sample = D7…D0 1 byte`;
        updateDecodeStrip(document.getElementById('logic-protocol')?.value || 'I2C'); toast('8 通道逻辑捕获完成', 'ok');
      } catch (err) { status.textContent = `捕获失败：${err.message}`; toast(err.message, 'error'); }
      finally { btn.disabled = false; }
    });
  }

  function wireJtag() {
    const log = msg => { const el = document.getElementById('jtag-log'); if (el) { el.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`; el.scrollTop = el.scrollHeight; } };
    document.getElementById('jtag-scan')?.addEventListener('click', async () => {
      try {
        const tckHz = Number(document.getElementById('jtag-clock').value); const ioVoltageMv = Number(document.getElementById('jtag-voltage').value);
        await state.jtag.configure({ tckHz, ioVoltageMv }); log(`JTAG config ${formatRate(tckHz)}, I/O ${(ioVoltageMv/1000).toFixed(1)} V`);
        const devices = await state.jtag.scan(); renderJtagChain(devices); log(`Scan complete: ${devices.length} device(s)`); toast(`发现 ${devices.length} 个 JTAG 器件`, 'ok');
      } catch (err) { log(`ERROR: ${err.message}`); toast(err.message, 'error'); }
    });
    document.getElementById('jtag-reset')?.addEventListener('click', async () => { try { await state.jtag.tapReset(); log('TAP reset complete'); } catch (err) { log(`ERROR: ${err.message}`); } });
    document.getElementById('fpga-file')?.addEventListener('change', e => {
      state.selectedFile = e.target.files?.[0] || null;
      const meta = document.getElementById('fpga-file-meta'); const fileBox = document.getElementById('fpga-program-file'); const program = document.getElementById('fpga-program');
      if (state.selectedFile) { const text = `${state.selectedFile.name} · ${formatBytes(state.selectedFile.size)}`; meta.textContent = text; fileBox.textContent = text; program.disabled = false; log(`Selected ${text}`); }
    });
    document.getElementById('fpga-program')?.addEventListener('click', async () => {
      if (!state.selectedFile) return;
      const btn = document.getElementById('fpga-program'); const fill = document.getElementById('fpga-progress-fill'); const val = document.getElementById('fpga-progress-value'); const phase = document.getElementById('fpga-progress-phase'); const badge = document.getElementById('fpga-program-state');
      try {
        btn.disabled = true; badge.textContent = 'PROGRAM'; badge.classList.add('active'); log(`Program start: ${state.selectedFile.name}`);
        const result = await state.jtag.programFile(state.selectedFile, { targetIndex: Number(document.getElementById('fpga-target').value || 0), erase: document.getElementById('fpga-erase').checked, verify: document.getElementById('fpga-verify').checked, runAfter: document.getElementById('fpga-run').checked, onProgress: p => { fill.style.width = `${p.progress}%`; val.textContent = `${p.progress}%`; phase.textContent = p.phase === 'done' ? '编程 + 校验完成' : `上传 / 编程 ${formatBytes(p.offset || 0)} / ${formatBytes(p.total || state.selectedFile.size)}`; } });
        badge.textContent = 'DONE'; log(`Programming successful, ${formatBytes(result.bytes)}, verify=${result.verified}`); toast('FPGA 编程成功', 'ok');
      } catch (err) { badge.textContent = 'ERROR'; log(`ERROR: ${err.message}`); toast(err.message, 'error'); }
      finally { badge.classList.remove('active'); btn.disabled = false; }
    });
  }

  function renderJtagChain(devices) {
    const table = document.getElementById('jtag-chain-table'); const status = document.getElementById('jtag-chain-status'); const target = document.getElementById('fpga-target');
    status.textContent = `${devices.length} Device${devices.length === 1 ? '' : 's'}`; status.classList.add('ok');
    table.className = 'wfl-chain-table'; table.innerHTML = `<div class="head"><span>#</span><span>IDCODE</span><span>IR</span><span>器件</span></div>` + devices.map(d => `<div><span>${d.index + 1}</span><code>0x${d.idcode.toString(16).padStart(8, '0').toUpperCase()}</code><span>${d.irLength}</span><b>${escapeHtml(d.name)}</b></div>`).join('');
    target.innerHTML = devices.map(d => `<option value="${d.index}">${d.index + 1}. ${escapeHtml(d.name)}</option>`).join('') || '<option value="0">未发现器件</option>';
  }

  function wireBattery() {
    const refresh = () => {
      const t = Date.now() / 1000; const pct = Math.round(72 + 4 * Math.sin(t / 19)); const v = 3.78 + pct / 100 * .18; const i = -.42 + .09 * Math.sin(t / 5); const temp = 30.8 + .7 * Math.sin(t / 13);
      setText('battery-percent', `${pct}%`); setText('battery-voltage', `${v.toFixed(2)} V`); setText('battery-current', `${i.toFixed(2)} A`); setText('battery-temp', `${temp.toFixed(1)} °C`); document.getElementById('battery-fill')?.style.setProperty('width', `${pct}%`);
    };
    document.getElementById('battery-refresh')?.addEventListener('click', refresh); refresh(); setInterval(refresh, 1000);
  }

  function updateDeviceSummary() {
    let el = document.getElementById('wfl-device-summary');
    if (!el) { el = document.createElement('div'); el.id = 'wfl-device-summary'; el.className = 'wfl-device-summary'; document.body.appendChild(el); }
    const d = state.deviceInfo || {}, u = state.usbInfo || {};
    el.innerHTML = `<span>${escapeHtml(d.productName || u.productName || 'Instrument')}</span><span>FW ${escapeHtml(d.firmwareVersion || '—')}</span><span>${escapeHtml(d.usbMode || (state.mode === 'demo' ? 'Mock' : 'USB FS'))}</span><span>${escapeHtml(d.serialNumber || u.serialNumber || '—')}</span><span class="wfl-live-dot"></span><b>${state.mode === 'webusb' ? 'LIVE' : 'DEMO'}</b>`;
  }

  function updateDecodeStrip(proto) {
    const el = document.getElementById('logic-decode-strip'); if (!el) return;
    const examples = { I2C: ['I2C','S','0x50','W','ACK','0x00','ACK','0xAB','ACK','P'], SPI: ['SPI','CS↓','0x9F','→','0xEF','0x40','0x18','CS↑'], UART: ['UART','115200','0x48','H','0x65','e','0x6C','l','0x6C','l','0x6F','o'], CAN: ['CAN','0x123','DLC 8','11','22','33','44','55','66','77','88'], LIN: ['LIN','BREAK','SYNC 0x55','PID 0x12','A4','09','3C'], None: ['RAW','D0…D7'] };
    el.innerHTML = examples[proto].map((x, i) => `<span class="${i === 0 ? 'proto' : ''}">${x}</span>`).join('');
  }

  function injectStyles() {
    const style = document.createElement('style'); style.textContent = `
      .nav-menu{overflow-x:auto;scrollbar-width:none}.nav-menu::-webkit-scrollbar{display:none}.nav-btn{white-space:nowrap}.wfl-nav-icon{font:700 18px/1 monospace;color:#60a5fa}
      .wfl-transport-badge{display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid #273244;background:#0b111c;border-radius:8px;font-size:11px;color:#8fa4bf}.wfl-transport-badge strong{color:#e5f0ff}.wfl-mode-dot,.wfl-live-dot{width:7px;height:7px;border-radius:50%;background:#f59e0b;box-shadow:0 0 8px currentColor}.wfl-mode-dot.real,.wfl-live-dot{background:#22c55e}.wfl-api-pill{border:1px solid #334155;padding:1px 5px;border-radius:999px}.wfl-api-pill.ok{color:#86efac}.wfl-api-pill.bad{color:#fda4af}
      .wfl-usb-note{margin-top:12px;padding:10px;background:#0b1524;border:1px solid #1e3a5f;border-radius:8px;color:#9db2ca;font-size:12px;line-height:1.55}.wfl-usb-note .btn{margin-top:8px;width:100%}
      .wfl-divider{height:1px;background:#283244;margin:12px 0}.wfl-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}.wfl-checks{display:flex;flex-wrap:wrap;gap:10px;color:#aebed1;font-size:12px;margin:8px 0}.wfl-file{width:100%;font-size:11px;color:#cbd5e1;background:#0d1624;border:1px solid #334155;padding:6px;border-radius:6px}.wfl-capture-status{margin-top:8px;padding:7px;border-radius:6px;background:#08121f;border:1px solid #22334a;color:#7dd3fc;font:11px/1.4 monospace}
      .wfl-decode-strip{position:absolute;left:56px;right:12px;bottom:8px;display:flex;gap:4px;align-items:center;overflow:hidden;z-index:5;pointer-events:none}.wfl-decode-strip span{background:#07111bdb;border:1px solid #14532d;color:#86efac;border-radius:4px;padding:2px 7px;font:10px monospace;white-space:nowrap}.wfl-decode-strip .proto{background:#063c2c;color:#d1fae5}
      .wfl-battery-page{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;background:radial-gradient(circle at 50% 20%,#13263a 0,#07101c 58%,#050a11 100%)}.wfl-battery-pack{width:260px;height:124px;border:4px solid #8293aa;border-radius:18px;padding:7px;position:relative;background:#071019;box-shadow:inset 0 0 0 2px #0c1d2d,0 12px 40px #0007}.wfl-battery-pack:after{content:'';position:absolute;right:-18px;top:35px;width:14px;height:48px;border:3px solid #8293aa;border-left:0;border-radius:0 7px 7px 0}.wfl-battery-fill{height:100%;width:75%;border-radius:9px;background:linear-gradient(90deg,#16a34a,#73d13d);box-shadow:0 0 22px #22c55e66}.wfl-battery-pack span{position:absolute;inset:0;display:grid;place-items:center;font:700 36px monospace;color:white;text-shadow:0 2px 10px #000}.wfl-metric-grid{display:grid;grid-template-columns:repeat(3,minmax(140px,1fr));gap:12px;width:min(720px,90%)}.wfl-metric-grid div{padding:14px 16px;border:1px solid #20334a;border-radius:10px;background:#0b1523}.wfl-metric-grid span{display:block;color:#7e93aa;font-size:12px}.wfl-metric-grid b{font:600 22px monospace;color:#dbeafe}
      .wfl-jtag-page{width:100%;height:100%;display:grid;grid-template-columns:minmax(320px,.9fr) minmax(420px,1.2fr);gap:12px;padding:12px;background:#07101a}.wfl-card{background:#0c1623;border:1px solid #22344a;border-radius:10px;overflow:hidden;min-height:0}.wfl-card-title{height:42px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #203044;font-weight:700}.wfl-tag{font:10px monospace;border:1px solid #334155;border-radius:999px;padding:3px 8px;color:#94a3b8}.wfl-tag.ok{color:#86efac;border-color:#166534}.wfl-tag.active{color:#93c5fd;border-color:#1d4ed8}.wfl-chain-empty{display:grid;place-items:center;height:calc(100% - 42px);color:#64748b}.wfl-chain-table{padding:8px 12px}.wfl-chain-table>div{display:grid;grid-template-columns:32px 120px 40px 1fr;gap:8px;align-items:center;padding:9px 6px;border-bottom:1px solid #172437;color:#9fb1c6;font-size:12px}.wfl-chain-table .head{color:#5f7894;text-transform:uppercase;font-size:10px}.wfl-chain-table code{color:#67e8f9}.wfl-chain-table b{color:#dbeafe;font-weight:600}.wfl-program-card{padding-bottom:10px}.wfl-program-file{margin:14px;padding:10px;border:1px dashed #35506d;border-radius:7px;color:#9fb6cc;font:12px monospace}.wfl-progress{height:12px;margin:0 14px;border:1px solid #29415b;border-radius:999px;overflow:hidden;background:#07101b}.wfl-progress div{height:100%;width:0;background:linear-gradient(90deg,#1d4ed8,#22c55e);transition:width .12s}.wfl-progress-label{display:flex;justify-content:space-between;margin:7px 14px;color:#8298b0;font-size:11px}.wfl-terminal{margin:10px 14px 0;height:calc(100% - 150px);min-height:150px;overflow:auto;background:#040a10;border:1px solid #1b2c3e;border-radius:7px;padding:10px;color:#6ee7b7;font:11px/1.5 ui-monospace,monospace}.wfl-kv{display:flex;justify-content:space-between;padding:6px 0;color:#9fb1c6}.ok-text{color:#4ade80}
      .wfl-device-summary{position:fixed;left:12px;right:12px;bottom:8px;height:26px;z-index:500;display:flex;gap:16px;align-items:center;padding:0 12px;background:#07101be8;border:1px solid #20334a;border-radius:7px;color:#7890aa;font:10px monospace;pointer-events:none;backdrop-filter:blur(8px)}.wfl-device-summary span:first-child{color:#d6e5f7}.wfl-device-summary b{color:#86efac}.wfl-live-dot{margin-left:auto}
      .wfl-toast{position:fixed;right:18px;top:78px;z-index:9999;padding:10px 14px;border-radius:8px;background:#122033;border:1px solid #334e68;color:#dbeafe;box-shadow:0 12px 28px #0008;font-size:12px}.wfl-toast.ok{border-color:#166534;color:#bbf7d0}.wfl-toast.error{border-color:#7f1d1d;color:#fecaca}
      @media(max-width:900px){.wfl-jtag-page{grid-template-columns:1fr}.wfl-metric-grid{grid-template-columns:repeat(2,1fr)}.wfl-transport-badge span:not(.wfl-mode-dot):not(.wfl-api-pill){display:none}}
    `; document.head.appendChild(style);
  }

  function parseRate(text) { const m = String(text).match(/([\d.]+)\s*(k|m|g)?hz/i); if (!m) return Number(text) || 25e6; const mult = ({k:1e3,m:1e6,g:1e9})[(m[2]||'').toLowerCase()] || 1; return Math.round(Number(m[1]) * mult); }
  function parseDepth(text) { const m = String(text).match(/([\d.]+)\s*([km])?/i); if (!m) return Number(text) || 8192; return Math.round(Number(m[1]) * (m[2]?.toLowerCase()==='m'?1e6:m[2]?.toLowerCase()==='k'?1024:1)); }
  function formatRate(v) { if (v >= 1e6) return `${(v/1e6).toFixed(v%1e6?1:0)} MHz`; if (v >= 1e3) return `${(v/1e3).toFixed(1)} kHz`; return `${v} Hz`; }
  function formatBytes(v) { if (v >= 1024*1024) return `${(v/1024/1024).toFixed(2)} MB`; if (v >= 1024) return `${(v/1024).toFixed(1)} KB`; return `${v} B`; }
  function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function toast(message, kind='') { const el=document.createElement('div'); el.className=`wfl-toast ${kind}`; el.textContent=message; document.body.appendChild(el); setTimeout(()=>el.remove(),2600); }

  window.WFLDeviceBridge = { state, connectDemo, connectWebUSB, disconnectCurrent };
})();
