import { fields, integer, rawFrame, requireWire, rollWindow, snapshot, TIME_US, VDIV_MV } from './frames.mjs';
import { DeviceRefusal } from './serial.mjs';

export const BUILD = 'HW21_R149_USB_HANDOFF_RECONNECT_20261125';
const releases = new Map([
  ['HW21_R144_USB_BOOT_20261124', 'R144'],
  [BUILD, 'R149'],
]);
export const USB = {usbVendorId:0xcafe,usbProductId:0x4001};
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const pageFor = {wav:2,pwm:3,dc:9};
const nominal = [.002,.004,.010,.020,.040,.100,.200];

function checkState(line) {
  const h = fields(line,'LINK|');
  const td=integer(h.TDIV,0,TIME_US.length-1), vd=integer(h.VDIV,0,7);
  requireWire(TIME_US[td]===Number(h.TDIV_US) && VDIV_MV[vd]===Number(h.VIEW_MV), '板端量程与索引不符');
  integer(h.PAGE,0,12); integer(h.SD_ACTIVE,0,1);
  return h;
}

export class Instrument {
  constructor(link) {
    this.link=link;
    this.calibration=nominal.map(g=>({gain:g,zero:[128,128],boot:false}));
  }
  query(cmd,prefix) { return this.link.query(cmd,prefix); }
  async state() { return checkState(await this.query('LINK:STATE?','LINK|')); }
  async identify(report=()=>{}) {
    this.verified=false;
    report('读取板型（*IDN?）');
    const id=await this.query('*IDN?','ZoolarkPro,');
    requireWire(id.split(',')[1]==='ODK_SPILCD_RP2350_V2.1','设备型号不匹配 · '+id);
    report('读取固件（DBG?）');
    const dbg=fields(await this.query('DBG?','DBG|STATUS|'),'DBG|STATUS|');
    const release=releases.get(dbg.FW_BUILD);
    requireWire(release,'板端 FW_BUILD 为 '+(dbg.FW_BUILD||'未知')+'，此工作台支持 HW2.1 R144 和 R149 的交付版本');
    requireWire(dbg.ADC==='REAL' && dbg.INPUT==='REAL',release+' 板端未处于实采模式 · INPUT='+dbg.INPUT+'，ADC='+dbg.ADC);
    report(release+' 读取板端状态（LINK:STATE?）');
    const state=await this.state();
    this.verified=true;
    return {id,build:dbg.FW_BUILD,release,state};
  }
  async page(page) {
    requireWire(this.verified,'设备身份尚未验证');
    let s=await this.state();
    requireWire(s.SD_ACTIVE==='0','板端正在录制，结束后可操作');
    if (+s.PAGE===7) throw new Error('板端逻辑监视器独占采集，请在仪器上退出 Logic 页');
    if (+s.PAGE===page) return s;
    for (let attempt=0; ; attempt++) {
      try {
        const ack=fields(await this.query('LINK:PAGE '+page,'LINK|'),'LINK|');
        requireWire(ack.OK==='PAGE' && +ack.PAGE===page,'板端未确认页面切换');
        break;
      } catch(e) {
        if (attempt>=5 || !e.message.includes('PAGE_TRANSITION_BUSY')) throw e;
        await delay(80);
      }
    }
    s=await this.state();
    requireWire(+s.PAGE===page && s.SD_ACTIVE==='0','板端页面已改变');
    return s;
  }
  async calibrationFor(vd) {
    const hardware=vd===7 ? 3 : vd;
    const meta=fields(await this.query('AZ?','AZ|'),'AZ|');
    if(meta.STATUS!=='PASS' || meta.VALID!=='1' || meta.VERSION!=='BOOT_AZ_R01' || meta.RANGES!=='7') return;
    const h=fields(await this.query('AZ? '+hardware,'AZ|'),'AZ|');
    const zero=[+h.Z1,+h.Z2], gain=+h.G;
    if (+h.I===hardware && h.VALID==='1' && gain>0 && gain<1 && zero.every(z=>z>0 && z<255) &&
        [h.N1,h.N2].every(n=>+n>=0 && +n<=5) && [h.D1,h.D2].every(d=>+d>=0 && +d<=2)) {
      this.calibration[hardware]={gain,zero,boot:true};
    }
  }
  async scopeSettings(td,vd) {
    integer(td,0,TIME_US.length-1); integer(vd,0,7);
    const s=await this.page(0);
    if (+s.TDIV!==td) await this.query('SCOPE:TDIV '+td,'OK SCOPE:TDIV='+td);
    if (+s.VDIV!==vd) await this.query('SCOPE:VDIV '+vd,'OK SCOPE:VDIV='+vd);
    const actual=await this.state();
    requireWire(+actual.TDIV===td && +actual.VDIV===vd && actual.PAGE==='0','板端时基或量程回读不符');
    await this.calibrationFor(vd);
    return actual;
  }
  async captureScope(td,vd,progress,signal,source='free') {
    const us=TIME_US[td], mv=VDIV_MV[vd], rolling=us>5000;
    const triggered=source!=='free';
    let boardSource;
    if(rolling && source==='board'){
      // ZC01 omits the source that RAW2 embeds. Read it before opening the stream.
      const status=await this.query('STATUS','MODE:OSC;');
      const match=status.match(/;\s*TRIG:(A1|A2|AUTO);/);
      requireWire(match,'板端未返回有效触发源');
      boardSource={AUTO:0,A1:1,A2:2}[match[1]];
    }
    let started=false;
    let frame;
    try {
      if (!rolling) await this.query('RAW2:DECIM 1','OK RAW2:DECIM=1');
      const collect=rolling ? rollWindow(us,mv,progress,triggered) : rawFrame;
      const command=rolling ? 'CS:START 10000' : 'RAW2:START';
      for(let i=0; ; i++) {
        try {
          frame=await this.link.exchange(command,event=>{
            if (typeof event==='string') {
              if (rolling ? event.startsWith('CS|START|') : event==='OK RAW2 STARTED') started=true;
            } else if (started && event[1]===(rolling ? 67 : 80)) return signal?.aborted ? null : collect(event);
          },Math.max(6000,us*(rolling&&triggered?6:4)/1000+5000));
          break;
        } catch(e) {
          if (!(e instanceof DeviceRefusal) || !e.message.includes('CAPTURE_BUSY_RETRY') || i>=12) throw e;
          await delay(60);
        }
      }
    } finally {
      if (started && !this.link.closed) await this.query(rolling?'CS:STOP':'RAW2:STOP',rolling?'CS|STOP|':'OK RAW2 STOPPED');
    }
    if (!frame) return null;
    requireWire(frame.tdiv===us && frame.vdiv===mv,'量程或时基已在板端改变，请刷新参数');
    const cal=this.calibration[vd===7?3:vd];
    if(rolling)frame.boardSource=boardSource;
    frame.voltsPerCode=cal.gain;
    frame.channels=frame.channels.map((ch,i)=>Float32Array.from(ch,code=>(cal.zero[i]-code)*cal.gain));
    frame.quality=cal.boot?'本机开机校零 · 标称增益':'标称零点与增益';
    return frame;
  }
  async captureGroup(group,rate) {
    const s=await this.page(0);
    const aux=group==='A34';
    integer(rate,aux?10000:100000,aux?250000:1000000);
    const command=aux?'ADC34:CAP '+rate+' 1024':'LA:CAP '+rate+' 4096';
    const prefix=aux?'A34':'LA';
    // When the local Scope owns ADC34, use its coherent published snapshot.
    const shared=aux && s.SCOPE_RUN==='1' && (+s.CHANNELS&12)!==0;
    const request=shared?'SCOPE:AUX?':command;
    let frame;
    for(let attempt=0;attempt<12;attempt++) {
      const lines=[];
      try {
        frame=await this.link.exchange(request,line=>{
          if(typeof line!=='string')return;
          if(line.startsWith(prefix+'|') || (lines.length && (line.startsWith(prefix+'D|') || line===prefix+'END'))) lines.push(line);
          requireWire(lines.length<=68,'快照超长');
          if(line===prefix+'END')return snapshot(lines,group);
        },5000);
        if(!shared || frame.seq!==this.lastAux)break;
      } catch(e) {
        if(!shared || !(e instanceof DeviceRefusal) || !e.message.includes('STATUS=WAITING'))throw e;
      }
      frame=null; await delay(60);
    }
    requireWire(frame,'等待板端新快照超时');
    if(aux){
      this.lastAux=frame.seq;
      frame.channels=frame.channels.map(ch=>Float32Array.from(ch,v=>v*3.3/4096));
      frame.quality='标称 3.3 V 参考'+(shared?' · 采样率由板端 Scope 时基决定':'');
    }
    return frame;
  }
  async readOutput(kind) {
    if(kind==='wav'){
      const cfg=fields(await this.query('FUNC:PARAMS?','FUNC:'),'FUNC:',';');
      const st=fields(await this.query('FUNC:STATUS?','FUNC:'),'FUNC:',';');
      return {wave:integer(cfg.WAVE,0,3),hz:integer(cfg.FREQ_HZ,1,500000),amp:integer(cfg.AMP_DV,0,80),
        offset:integer(cfg.OFFSET_DV,-20,20),peak:integer(st.PEAK_PCT,0,100),on:integer(st.ACTIVE,0,1),fault:integer(st.FAULT,0,0xffffffff)};
    }
    if(kind==='pwm'){
      const cfg=fields(await this.query('PWM:CFG?','PWM|'),'PWM|');
      const rt=fields(await this.query('RUNTIME?','RUNTIME|'),'RUNTIME|');
      return {hz:integer(cfg.FREQ_HZ,1,1000000),duty:integer(cfg.DUTY,0,100),on:integer(rt.PWM,0,1),fault:0};
    }
    requireWire(kind==='dc','未知输出');
    const st=fields(await this.query('DC:STATUS?','DC|'),'DC|');
    requireWire(['ON','FAULT','DISARMED','ZERO_STANDBY'].includes(st.STATE),'DC 状态未知');
    return {mv:integer(st.SET_MV,-4000,4000),feedback:integer(st.FB_VALID,0,1)?integer(st.FB_MV,-2147483648,2147483647):null,
      state:st.STATE,on:Number(st.STATE==='ON'),fault:integer(st.FAULT,0,0xffffffff)};
  }
  async output(kind,action,values={}) {
    requireWire(this.verified && Object.hasOwn(pageFor,kind),'输出不可用');
    if(action==='read')return this.readOutput(kind);
    const {hz,wave,amp,offset,peak,duty,mv}=values;
    if(action==='apply'){
      if(kind==='wav'){
        integer(wave,0,3); integer(amp,0,80); integer(offset,-20,20); integer(peak,0,100);
        integer(hz,1000,wave===3?10000:500000);
        requireWire(hz%100===0 && fits(wave,amp,offset),'WAV 须为 100 Hz 步进，峰值在 ±4 V 内，锯齿波偏置为零');
      } else if(kind==='pwm'){ integer(hz,1,1000000); integer(duty,0,100); }
      else integer(mv,-4000,4000);
    }
    await this.page(pageFor[kind]);
    if(action==='apply'){
      if(kind==='wav'){
        const old=await this.readOutput(kind);
        const set=()=>this.query(wave===3?'FUNC:SAW_HZ '+[peak,amp,hz].join(' '):'FUNC:SET_HZ '+[wave,amp,hz].join(' '),'OK FUNC:');
        const bias=v=>this.query('FUNC:OFFSET '+v,'OK FUNC:');
        if(fits(wave,amp,old.offset)){await set(); if(offset!==old.offset)await bias(offset);}
        else if(fits(old.wave,old.amp,offset)){await bias(offset); await set();}
        else {
          requireWire(!old.on,'请先关闭 WAV，再调整这组幅度与偏置');
          await bias(0); await set(); if(offset)await bias(offset);
        }
      } else if(kind==='pwm') await this.query('PWM:CFG '+hz+' '+duty,'PWM|');
      else await this.query('DC:SET '+mv,'DC|');
    } else {
      requireWire(action==='on' || action==='off','未知输出操作');
      const cmd={wav:'FUNC:OUTPUT ',pwm:'PWM:OUTPUT ',dc:'DC:'}[kind]+action.toUpperCase();
      await this.query(cmd,{wav:'OK FUNC:',pwm:'PWM|',dc:'DC|'}[kind]);
    }
    // DC feedback/fault detection begins after the firmware's 250 ms settling interval.
    if(kind==='dc' && action!=='off')await delay(350);
    const actual=await this.readOutput(kind);
    if(action==='apply'){
      const keys=kind==='wav'?['wave','hz','amp','offset',...(wave===3?['peak']:[])]:kind==='pwm'?['hz','duty']:['mv'];
      requireWire(keys.every(k=>actual[k]===values[k]),'设置与板端回读不一致，请刷新');
    } else requireWire(actual.on===Number(action==='on'),'板端开关状态不符，请检查板端本地输出');
    requireWire(!actual.fault,'板端输出故障 '+actual.fault);
    return actual;
  }
  async battery(){
    const h=fields(await this.query('BAT?','BAT|'),'BAT|');
    requireWire(h.VALID==='1' && h.GPIO==='47' && h.ADC==='7','电池 ADC 尚无有效读数');
    return {mv:integer(h.MV,0,10000),level:integer(h.LEVEL,0,4),cal:h.CAL};
  }
  async fra(hz) {
    integer(hz,1000,20000);
    await this.page(6);
    const last=hz===20000, range=last?[1000,hz]:[hz,20000];
    await this.query('FRA:CFG '+range.join(' ')+' 2 100 1','FRA|OK=CFG');
    await this.query('FRA:POINT '+Number(last),'FRA|OK=POINT');
    const status=async()=>fields(await this.query('FRA:UI?','FRA|'),'FRA|');
    const before=await status();
    await this.query('FRA:CAP','FRA|OK=PENDING');
    try {
      for(let i=0;i<60;i++){
        await delay(100); const h=await status();
        if(h.PENDING==='1' || before.SEQ===h.SEQ)continue;
        requireWire(h.VALID==='1' && +h.POINT===Number(last) && h.SOURCE==='EXTERNAL','测量无效 · '+h.STATE);
        const gain=+h.GAIN_DB, actual=+h.ACTUAL_HZ;
        requireWire(Number.isFinite(gain) && actual>0 && Number.isFinite(actual),'频响结果无效');
        return {hz:actual,gain};
      }
      throw new Error('等待频响测量超时');
    } finally { if(!this.link.closed)await this.query('FRA:CANCEL','FRA|OK=CANCEL'); }
  }
}
function fits(wave,amp,offset) { return amp + 2*Math.abs(offset)<=80 && (wave!==3 || offset===0); }
