(function (global) {
  'use strict';

  const OSC_CAPTURE = 0x0101;
  const OSC_READ_CH1 = 0x0102;
  const OSC_READ_CH2 = 0x0103;
  const EXPECTED_FW = '0.4.5-dual-adc-dim';
  const ADC_FS_VOLTS = 3.3;
  const ADC_MAX = 4095;
  const state = { client: null, oscBusy: false, logicBusy: false, timer: null, lastError: '', deviceInfo: null };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function waitForStack() { for (let i=0;i<200&&!global.WFL2;i++) await sleep(20); return global.WFL2; }

  function showFirmwareMismatch(actual) {
    let e=document.getElementById('zl-fw-mismatch-banner');
    if(!e){e=document.createElement('div');e.id='zl-fw-mismatch-banner';Object.assign(e.style,{position:'fixed',left:'50%',top:'72px',transform:'translateX(-50%)',zIndex:'10000',padding:'12px 18px',borderRadius:'8px',background:'#3a1218',border:'1px solid #d84b5b',color:'#ffd9de',font:'600 13px system-ui',boxShadow:'0 8px 30px #0008'});document.body.appendChild(e);}
    e.innerHTML=`固件版本不匹配：板上 <b>${actual||'unknown'}</b>，网页需要 <b>${EXPECTED_FW}</b>。已停止 Live ADC，请重新刷入 v0.4.5 UF2。`;
  }
  function clearFirmwareMismatch(){document.getElementById('zl-fw-mismatch-banner')?.remove();}

  function installClientHook(WFL2) {
    if (global.__ZL_LIVE_IO_CLIENT_HOOK__) return;
    const Base = WFL2.DeviceClient;
    class LiveDeviceClient extends Base {
      async connect(options) {
        const info = await super.connect(options);
        if (info?.kind === 'webusb') {
          let devInfo = null;
          try { devInfo = await this.getDeviceInfo(); } catch (err) { updateLiveStatus(`设备信息读取失败: ${err.message||err}`, true); }
          state.deviceInfo = devInfo;
          const actual = devInfo?.firmwareVersion || 'unknown';
          if (actual !== EXPECTED_FW) {
            state.client = null;
            showLiveBadges(false);
            showFirmwareMismatch(actual);
            updateLiveStatus(`固件不匹配 · ${actual} → 需要 ${EXPECTED_FW}`, true);
            return { ...info, deviceInfo: devInfo, firmwareMismatch: true };
          }
          clearFirmwareMismatch();
          state.client = this;
          startPolling();
          showLiveBadges(true);
          updateLiveStatus(`FW ${actual} · Dual ADC ready`);
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

  function u32Payload(a,b,c){const n=c===undefined?8:12;const x=new Uint8Array(n),dv=new DataView(x.buffer);dv.setUint32(0,a>>>0,true);dv.setUint32(4,b>>>0,true);if(c!==undefined)dv.setUint32(8,c>>>0,true);return x;}

  async function readChannel(op,id,count){const samples=new Uint16Array(count);let off=0;while(off<count){const ask=Math.min(512,count-off);const raw=await state.client.request(op,u32Payload(id,off,ask),{timeout:2500});const r=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);const got=r.getUint32(8,true);for(let i=0;i<got;i++)samples[off+i]=r.getUint16(12+i*2,true);if(!got)break;off+=got;}return Array.from(samples,v=>v*ADC_FS_VOLTS/ADC_MAX);}

  async function captureOsc(){if(!state.client?.connected||state.oscBusy)return;state.oscBusy=true;try{const metaRaw=await state.client.request(OSC_CAPTURE,u32Payload(100000,512),{timeout:3500});const meta=new DataView(metaRaw.buffer,metaRaw.byteOffset,metaRaw.byteLength);const id=meta.getUint32(0,true),rate=meta.getUint32(4,true),count=meta.getUint32(8,true);const m={rate,count,ch1gpio:meta.getUint16(12,true),ch1adc:meta.getUint16(14,true),ch2gpio:meta.getUint16(16,true),ch2adc:meta.getUint16(18,true)};const ch1=await readChannel(OSC_READ_CH1,id,count);const ch2=await readChannel(OSC_READ_CH2,id,count);drawOsc(ch1,ch2,m);state.lastError='';}catch(err){state.lastError=err?.message||String(err);updateLiveStatus(`ADC读取失败: ${state.lastError}`,true);}finally{state.oscBusy=false;}}

  async function captureLogic(){if(!state.client?.connected||state.logicBusy||!global.WFL2?.LogicAnalyzerService)return;state.logicBusy=true;try{const service=new global.WFL2.LogicAnalyzerService(state.client);const cap=await service.capture({sampleRate:2000000,sampleCount:4096,enabledMask:0x03,triggerChannel:0,triggerEdge:1,pretriggerPermille:0,thresholdMv:1650});drawLogic(cap.channels?.[0]||[],cap.channels?.[1]||[],cap.sampleRate||2000000);state.lastError='';}catch(err){state.lastError=err?.message||String(err);updateLiveStatus(`Logic读取失败: ${state.lastError}`,true);}finally{state.logicBusy=false;}}

  function ensureOverlay(baseId,overlayId){const base=document.getElementById(baseId);if(!base)return null;const parent=base.parentElement;if(!parent)return null;if(getComputedStyle(parent).position==='static')parent.style.position='relative';let c=document.getElementById(overlayId);if(!c){c=document.createElement('canvas');c.id=overlayId;Object.assign(c.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'6',pointerEvents:'none'});parent.appendChild(c);}const w=Math.max(2,parent.clientWidth),h=Math.max(2,parent.clientHeight);if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;c.style.display='block';return c;}
  function grid(ctx,w,h){ctx.fillStyle='#030919';ctx.fillRect(0,0,w,h);ctx.lineWidth=1;ctx.strokeStyle='#102640';for(let i=0;i<=10;i++){const x=i*w/10;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let i=0;i<=8;i++){const y=i*h/8;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}}
  function stats(v){const min=Math.min(...v),max=Math.max(...v),avg=v.reduce((a,b)=>a+b,0)/Math.max(1,v.length);return{min,max,avg,vpp:max-min};}
  function estimateFreq(v,rate){if(v.length<8)return 0;const s=stats(v),mid=s.avg;let crossings=[];for(let i=1;i<v.length;i++)if(v[i-1]<mid&&v[i]>=mid)crossings.push(i);if(crossings.length<2)return 0;let total=0;for(let i=1;i<crossings.length;i++)total+=crossings[i]-crossings[i-1];return rate/(total/(crossings.length-1));}
  function drawWave(ctx,v,w,h,color){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.shadowColor=color;ctx.shadowBlur=5;ctx.beginPath();for(let i=0;i<v.length;i++){const x=i*(w-1)/Math.max(1,v.length-1),y=h-(v[i]/3.3)*h;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();ctx.shadowBlur=0;}
  function drawOsc(ch1,ch2,m){const c=ensureOverlay('waveform-canvas','zl-live-osc-canvas');if(!c)return;const ctx=c.getContext('2d'),w=c.width,h=c.height;grid(ctx,w,h);drawWave(ctx,ch1,w,h,'#ffc107');drawWave(ctx,ch2,w,h,'#00d9ff');const a=stats(ch1),b=stats(ch2),f=estimateFreq(ch2,m.rate);ctx.font='12px ui-monospace,SFMono-Regular,Menlo,monospace';ctx.fillStyle='#ffc107';ctx.fillText(`CH1 GPIO${m.ch1gpio}/ADC${m.ch1adc} avg ${a.avg.toFixed(3)}V Vpp ${a.vpp.toFixed(3)}V`,14,22);ctx.fillStyle='#00d9ff';ctx.fillText(`CH2 GPIO${m.ch2gpio}/ADC${m.ch2adc} avg ${b.avg.toFixed(3)}V Vpp ${b.vpp.toFixed(3)}V  f≈${f?f.toFixed(0):'--'}Hz`,14,42);ctx.fillStyle='#9fb5ce';ctx.fillText(`DUAL LIVE ${(m.rate/1000).toFixed(0)} kS/s/ch · direct ADC 0–3.3V · FW ${EXPECTED_FW}`,14,62);updateLiveStatus(`Dual ADC LIVE · CH2 ${b.vpp.toFixed(3)}Vpp · ${f?f.toFixed(0)+'Hz':'--'}`);}
  function drawDigitalTrace(ctx,data,yHigh,yLow,w){ctx.beginPath();const n=Math.max(1,data.length);let last=data[0]?yHigh:yLow;ctx.moveTo(0,last);for(let i=1;i<n;i++){const x=i*(w-1)/(n-1),y=data[i]?yHigh:yLow;ctx.lineTo(x,last);if(y!==last)ctx.lineTo(x,y);last=y;}ctx.stroke();}
  function drawLogic(d0,d1,rate){const c=ensureOverlay('logic-canvas','zl-live-logic-canvas');if(!c)return;const ctx=c.getContext('2d'),w=c.width,h=c.height;grid(ctx,w,h);const band=h/3;ctx.lineWidth=1.7;ctx.strokeStyle='#00e5ff';drawDigitalTrace(ctx,d0,band*.55,band*.85,w);ctx.strokeStyle='#ffc107';drawDigitalTrace(ctx,d1,band*1.55,band*1.85,w);ctx.font='12px ui-monospace,SFMono-Regular,Menlo,monospace';ctx.fillStyle='#00e5ff';ctx.fillText('D0 GPIO22 SDA',14,20);ctx.fillStyle='#ffc107';ctx.fillText('D1 GPIO23 SCL',14,band+20);}
  function hideOverlays(){for(const id of['zl-live-osc-canvas','zl-live-logic-canvas']){const e=document.getElementById(id);if(e)e.style.display='none';}}
  function showLiveBadges(on){let b=document.getElementById('zl-live-io-badge');if(!b){b=document.createElement('div');b.id='zl-live-io-badge';Object.assign(b.style,{position:'fixed',right:'14px',bottom:'14px',zIndex:'9999',padding:'7px 10px',borderRadius:'7px',font:'11px ui-monospace,monospace',background:'#092018',border:'1px solid #1c7953',color:'#69efae'});document.body.appendChild(b);}b.style.display=on?'block':'none';b.textContent=`LIVE I/O · FW ${EXPECTED_FW}`;}
  function updateLiveStatus(text,error=false){let e=document.getElementById('zl-live-io-status');if(!e){const host=document.querySelector('.display-info')||document.body;e=document.createElement('span');e.id='zl-live-io-status';e.style.cssText='margin-left:12px;font:11px ui-monospace,monospace;color:#65e6aa';host.appendChild(e);}e.style.color=error?'#ff7070':'#65e6aa';e.textContent=text;}
  async function pollingLoop(){while(state.client?.connected){const instrument=global.AppState?.currentInstrument;if(instrument==='oscilloscope')await captureOsc();else if(instrument==='logic-analyzer')await captureLogic();await sleep(instrument==='oscilloscope'?100:350);}state.timer=null;}
  function startPolling(){if(state.timer)return;state.timer=true;pollingLoop();}

  waitForStack().then(W=>{if(W)installClientHook(W);});
})(window);
