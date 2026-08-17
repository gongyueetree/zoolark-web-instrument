(function (global) {
  'use strict';

  const OSC_CAPTURE = 0x0101;
  const OSC_READ = 0x0102;
  const ADC_FS_VOLTS = 3.3;
  const ADC_MAX = 4095;
  const state = { client: null, oscBusy: false, logicBusy: false, timer: null, oscCanvas: null, logicCanvas: null, lastError: '' };

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function waitForStack() {
    for (let i = 0; i < 200 && !global.WFL2; i++) await sleep(20);
    return global.WFL2;
  }

  function installClientHook(WFL2) {
    if (global.__ZL_LIVE_IO_CLIENT_HOOK__) return;
    const Base = WFL2.DeviceClient;
    class LiveDeviceClient extends Base {
      async connect(options) {
        const info = await super.connect(options);
        if (info?.kind === 'webusb') {
          state.client = this;
          startPolling();
          showLiveBadges(true);
        }
        return info;
      }
      async disconnect() {
        if (state.client === this) { state.client = null; showLiveBadges(false); hideOverlays(); }
        return super.disconnect();
      }
    }
    WFL2.DeviceClient = LiveDeviceClient;
    global.__ZL_LIVE_IO_CLIENT_HOOK__ = true;
  }

  function u32Payload(a, b, c) {
    const n = c === undefined ? 8 : 12;
    const x = new Uint8Array(n), dv = new DataView(x.buffer);
    dv.setUint32(0, a >>> 0, true); dv.setUint32(4, b >>> 0, true);
    if (c !== undefined) dv.setUint32(8, c >>> 0, true);
    return x;
  }

  async function captureOsc() {
    if (!state.client?.connected || state.oscBusy) return;
    state.oscBusy = true;
    try {
      const metaRaw = await state.client.request(OSC_CAPTURE, u32Payload(20000, 256), { timeout: 2500 });
      const meta = new DataView(metaRaw.buffer, metaRaw.byteOffset, metaRaw.byteLength);
      const id = meta.getUint32(0, true), sampleRate = meta.getUint32(4, true), count = meta.getUint32(8, true);
      const gpio = meta.getUint16(12, true), adc = meta.getUint16(14, true);
      const samples = new Uint16Array(count);
      let off = 0;
      while (off < count) {
        const ask = Math.min(512, count - off);
        const raw = await state.client.request(OSC_READ, u32Payload(id, off, ask), { timeout: 2500 });
        const r = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        const got = r.getUint32(8, true);
        for (let i = 0; i < got; i++) samples[off + i] = r.getUint16(12 + i * 2, true);
        if (!got) break; off += got;
      }
      const volts = Array.from(samples, v => v * ADC_FS_VOLTS / ADC_MAX);
      drawOsc(volts, { sampleRate, gpio, adc });
      state.lastError = '';
    } catch (err) {
      state.lastError = err?.message || String(err);
      updateLiveStatus(`ADC读取失败: ${state.lastError}`, true);
    } finally { state.oscBusy = false; }
  }

  async function captureLogic() {
    if (!state.client?.connected || state.logicBusy || !global.WFL2?.LogicAnalyzerService) return;
    state.logicBusy = true;
    try {
      const service = new global.WFL2.LogicAnalyzerService(state.client);
      const cap = await service.capture({
        sampleRate: 2000000,
        sampleCount: 4096,
        enabledMask: 0x03,
        triggerChannel: 0,
        triggerEdge: 1,
        pretriggerPermille: 0,
        thresholdMv: 1650,
      });
      drawLogic(cap.channels?.[0] || [], cap.channels?.[1] || [], cap.sampleRate || 2000000);
      if (global.AppState?.logicAnalyzer) {
        AppState.logicAnalyzer.sampleRate = cap.sampleRate;
        AppState.logicAnalyzer.depth = cap.sampleCount;
        AppState.logicAnalyzer.data[0] = Array.from(cap.channels[0] || []);
        AppState.logicAnalyzer.data[1] = Array.from(cap.channels[1] || []);
      }
      state.lastError = '';
    } catch (err) {
      state.lastError = err?.message || String(err);
      updateLiveStatus(`Logic读取失败: ${state.lastError}`, true);
    } finally { state.logicBusy = false; }
  }

  function ensureOverlay(baseId, overlayId) {
    const base = document.getElementById(baseId); if (!base) return null;
    const parent = base.parentElement; if (!parent) return null;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    let canvas = document.getElementById(overlayId);
    if (!canvas) {
      canvas = document.createElement('canvas'); canvas.id = overlayId;
      Object.assign(canvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', zIndex:'6', pointerEvents:'none' });
      parent.appendChild(canvas);
    }
    const w = Math.max(2, parent.clientWidth), h = Math.max(2, parent.clientHeight);
    if (canvas.width !== w) canvas.width = w; if (canvas.height !== h) canvas.height = h;
    canvas.style.display = 'block'; return canvas;
  }

  function grid(ctx, w, h) {
    ctx.fillStyle = '#030919'; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1; ctx.strokeStyle = '#102640';
    for (let i = 0; i <= 10; i++) { const x = i*w/10; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let i = 0; i <= 8; i++) { const y = i*h/8; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  }

  function drawOsc(v, meta) {
    const c = ensureOverlay('waveform-canvas', 'zl-live-osc-canvas'); if (!c) return;
    state.oscCanvas = c; const ctx = c.getContext('2d'), w=c.width, h=c.height; grid(ctx,w,h);
    const min = Math.min(...v), max = Math.max(...v), avg = v.reduce((a,b)=>a+b,0)/Math.max(1,v.length);
    const scaleMax = 3.3;
    ctx.strokeStyle = '#ffc107'; ctx.lineWidth = 2; ctx.shadowColor = '#ffc107'; ctx.shadowBlur = 6; ctx.beginPath();
    for (let i=0;i<v.length;i++) { const x=i*(w-1)/Math.max(1,v.length-1); const y=h-(v[i]/scaleMax)*h; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle='#9fb5ce'; ctx.font='12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`LIVE CH1 GPIO${meta.gpio}/ADC${meta.adc}  ${(meta.sampleRate/1000).toFixed(1)} kS/s  0–3.3V`, 14, 22);
    ctx.fillStyle='#ffc107'; ctx.fillText(`min ${min.toFixed(3)}V   avg ${avg.toFixed(3)}V   max ${max.toFixed(3)}V   Vpp ${(max-min).toFixed(3)}V`,14,42);
    updateLiveStatus(`示波器 LIVE · GPIO${meta.gpio}/ADC${meta.adc} · ${avg.toFixed(3)} V`);
  }

  function drawDigitalTrace(ctx, data, yHigh, yLow, w) {
    ctx.beginPath();
    const n = Math.max(1, data.length);
    let last = data[0] ? yHigh : yLow; ctx.moveTo(0,last);
    for (let i=1;i<n;i++) { const x=i*(w-1)/(n-1); const y=data[i]?yHigh:yLow; ctx.lineTo(x,last); if(y!==last)ctx.lineTo(x,y); last=y; }
    ctx.stroke();
  }

  function drawLogic(d0,d1,rate) {
    const c=ensureOverlay('logic-canvas','zl-live-logic-canvas'); if(!c)return;
    state.logicCanvas=c; const ctx=c.getContext('2d'),w=c.width,h=c.height; grid(ctx,w,h);
    const band=h/3;
    ctx.lineWidth=1.7; ctx.strokeStyle='#00e5ff'; drawDigitalTrace(ctx,d0,band*.55,band*.85,w);
    ctx.strokeStyle='#ffc107'; drawDigitalTrace(ctx,d1,band*1.55,band*1.85,w);
    ctx.font='12px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.fillStyle='#00e5ff'; ctx.fillText('D0  GPIO22  SDA',14,20);
    ctx.fillStyle='#ffc107'; ctx.fillText('D1  GPIO23  SCL',14,band+20);
    ctx.fillStyle='#91a7bf'; ctx.fillText(`LIVE  ${(rate/1e6).toFixed(1)} MS/s · ${d0.length} samples`,14,h-16);
    updateLiveStatus(`Logic LIVE · D0 GPIO22 / D1 GPIO23 · ${(rate/1e6).toFixed(1)} MS/s`);
  }

  function hideOverlays() {
    for (const id of ['zl-live-osc-canvas','zl-live-logic-canvas']) { const e=document.getElementById(id); if(e)e.style.display='none'; }
  }

  function showLiveBadges(on) {
    let b=document.getElementById('zl-live-io-badge');
    if(!b) { b=document.createElement('div'); b.id='zl-live-io-badge'; Object.assign(b.style,{position:'fixed',right:'14px',bottom:'14px',zIndex:'9999',padding:'7px 10px',borderRadius:'7px',font:'11px ui-monospace,monospace',background:'#092018',border:'1px solid #1c7953',color:'#69efae',boxShadow:'0 4px 18px #0008'}); document.body.appendChild(b); }
    b.style.display=on?'block':'none'; b.textContent='LIVE I/O · ADC47 + GPIO22/23';
  }

  function updateLiveStatus(text,error=false) {
    let e=document.getElementById('zl-live-io-status');
    if(!e) { const host=document.querySelector('.display-info')||document.body; e=document.createElement('span'); e.id='zl-live-io-status'; e.style.cssText='margin-left:12px;font:11px ui-monospace,monospace;color:#65e6aa'; host.appendChild(e); }
    e.style.color=error?'#ff7070':'#65e6aa'; e.textContent=text;
  }

  function patchLogicUi() {
    const controls=document.getElementById('logic-analyzer-controls');
    if(controls && !document.getElementById('zl-live-logic-note')) {
      const note=document.createElement('div'); note.id='zl-live-logic-note'; note.style.cssText='margin:8px 0;padding:8px;border:1px solid #21445b;border-radius:6px;color:#9fc5df;font-size:11px';
      note.innerHTML='<b style="color:#00e5ff">LIVE pin map</b><br>D0 = GPIO22 / SDA<br>D1 = GPIO23 / SCL<br>D2–D7 disabled in v0.4.2'; controls.prepend(note);
      for(let i=2;i<8;i++){const cb=document.getElementById(`logic-ch${i}`);if(cb){cb.checked=false;cb.disabled=true;}}
      for(let i=0;i<2;i++){const cb=document.getElementById(`logic-ch${i}`);if(cb){cb.checked=true;cb.disabled=false;}}
      const trig=document.getElementById('logic-trigger-channel'); if(trig) Array.from(trig.options).forEach(o=>o.disabled=Number(o.value)>1);
    }
  }

  async function pollingLoop() {
    while (state.client?.connected) {
      patchLogicUi();
      const instrument=global.AppState?.currentInstrument;
      if(instrument==='oscilloscope') await captureOsc();
      else if(instrument==='logic-analyzer') await captureLogic();
      await sleep(instrument==='oscilloscope'?100:350);
    }
  }
  function startPolling() { if(state.timer)return; state.timer=true; pollingLoop().finally(()=>{state.timer=null;}); }

  waitForStack().then(WFL2=>{ if(!WFL2)return; installClientHook(WFL2); patchLogicUi(); });
})(window);
