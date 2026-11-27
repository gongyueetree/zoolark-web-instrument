import test from 'node:test';
import assert from 'node:assert/strict';
import { WireDecoder,crc32,rawFrame,rollWindow,snapshot } from '../src/openscope/frames.mjs';
import { Instrument,BUILD } from '../src/openscope/instrument.mjs';
import { SerialLink } from '../src/openscope/serial.mjs';
import { scopeTrigger,averageWindows,spectrum } from '../src/openscope/display.mjs';

const encode=s=>new TextEncoder().encode(s);
function serial(reply){
  let controller; const log=[];
  const port={open:async()=>{},close:async()=>{},setSignals:async s=>assert.ok(s.dataTerminalReady),
    readable:new ReadableStream({start(c){controller=c;}}),
    writable:new WritableStream({write(b){
      const cmd=new TextDecoder().decode(b).trim();log.push(cmd);
      for(const chunk of reply(cmd)||[])controller.enqueue(typeof chunk==='string'?encode(chunk):chunk);
    }})};
  return {link:new SerialLink(port),log};
}
const line=s=>[s+'\r\n'];
const state=page=>'LINK|PAGE='+page+'|TDIV=6|VDIV=4|TDIV_US=100|VIEW_MV=1000|SD_ACTIVE=0|SCOPE_RUN=1|CHANNELS=3';
const identity=cmd=>({'*IDN?':'ZoolarkPro,ODK_SPILCD_RP2350_V2.1,HW21_R01_BRINGUP,0.1','DBG?':'DBG|STATUS|FW_BUILD='+BUILD+'|ADC=REAL|INPUT=REAL','LINK:STATE?':state(0)})[cmd];
function zp(){
  const a=new Uint8Array(72),v=new DataView(a.buffer);a.set(encode('ZP23'));a.set([1,64,1,5],4);
  [[20,200000],[24,200000],[40,100],[44,1000000],[48,1000000]].forEach(([p,n])=>v.setUint32(p,n,true));
  [[28,1],[30,4],[32,2],[34,2],[64,512+110],[66,144],[68,512+120],[70,98]].forEach(([p,n])=>v.setUint16(p,n,true));
  a[36]=8;a[37]=10;return a;
}
test('fragmented CDC command, binary capture, stop and voltage polarity',async()=>{
  const raw=zp(),{link,log}=serial(cmd=>{
    if(cmd==='RAW2:START')return ['OK RAW2 STARTED\r\nZ',raw.slice(1,33),raw.slice(33)];
    return line(identity(cmd)||({'RAW2:STOP':'OK RAW2 STOPPED','RAW2:DECIM 1':'OK RAW2:DECIM=1','AZ?':'AZ|VERSION=BOOT_AZ_R01|STATUS=NOT_RUN|VALID=0|RANGES=7'})[cmd]);
  });
  await link.open();const board=new Instrument(link);
  await board.identify();await board.scopeSettings(6,4);
  const frame=await board.captureScope(6,4);
  assert.equal(frame.rate,100000);assert.deepEqual(frame.skew,[1/200000,0]);
  assert.ok(Math.abs(frame.channels[0][0]+.64)<1e-6);
  assert.equal(log.at(-1),'RAW2:STOP');await link.close();
});
test('reject synthetic data, wrong count and corrupt ADC rate',()=>{
  for(const [offset,value] of [[7,9],[32,1],[24,17]]){
    const data=zp();data[offset]=value;assert.throws(()=>rawFrame(data));
  }
});
const r144='HW21_R144_USB_BOOT_20261124';
for (const [build,release] of [[r144,'R144'],[BUILD,'R149']]) {
  test(release+' connects using FW_BUILD and reads WAV settings without enabling output',async()=>{
    const {link,log}=serial(cmd=>line(({
      'DBG?':'DBG|STATUS|ENABLED=0|INPUT=REAL|ADC=REAL|BUILD=HW21_R108_SD_RATES_20261111|FW_BUILD='+build+'|UI_BUILD='+r144,
      'LINK:STATE?':'LINK|PAGE=2|TDIV=8|VDIV=7|TDIV_US=500|VIEW_MV=200|SCOPE_RUN=0|SD_ACTIVE=0|RUN=0|ANIM=0|SD_RATE=500000|SD_PAIRS=0|CHANNELS=3',
      'FUNC:PARAMS?':'FUNC:WAVE=2;AMP_DV=40;FREQ_TKHZ=100;FREQ_HZ=10000;OFFSET_DV=0',
      'FUNC:STATUS?':'FUNC:ACTIVE=1;FAULT=0;HZ=10000.000;BIT_HZ=60000000;PEAK_PCT=50',
    })[cmd]||identity(cmd)));
    await link.open();
    try{
      const board=new Instrument(link);
      const info=await board.identify();
      assert.equal(info.build,build);assert.equal(info.release,release);assert.equal(info.state.VDIV,'7');
      assert.deepEqual(await board.output('wav','read'),{wave:2,hz:10000,amp:40,offset:0,peak:50,on:1,fault:0});
      assert.deepEqual(log,['*IDN?','DBG?','LINK:STATE?','FUNC:PARAMS?','FUNC:STATUS?']);
    }finally{await link.close();}
  });
}
test('a familiar UI_BUILD cannot authorize an unknown FW_BUILD or synthetic ADC',async()=>{
  for (const [build,adc,expected] of [['HW21_R144_CUSTOM','REAL',/HW21_R144_CUSTOM/],[r144,'SYNTHETIC',/SYNTHETIC/]]) {
    const {link,log}=serial(cmd=>line(cmd==='DBG?'?'DBG|STATUS|FW_BUILD='+build+'|UI_BUILD='+r144+'|ADC='+adc+'|INPUT=REAL':identity(cmd)));
    await link.open();const board=new Instrument(link);
    try{
      await assert.rejects(board.identify(),expected);
      await assert.rejects(board.output('dc','on'));assert.deepEqual(log,['*IDN?','DBG?']);
    }finally{await link.close();}
  }
});
test('timed out command closes the session and releases both streams',async()=>{
  const {link}=serial(()=>[]);await link.open();await assert.rejects(link.query('PING','PONG',20),/超时/);
  await link.close();assert.ok(!link.port.writable.locked && !link.port.readable.locked);
  await assert.rejects(link.query('DC:ON','DC|'));
});
test('logic connector order, little endian CRC and chunk sequence',()=>{
  // GPIO17 only. This is J1-16 (D1), despite being the first capture bit.
  const bytes=new Uint8Array(16).fill(0x11);
  const h='LA|V=3|STATUS=OK|SEQ=9|SAMPLES=32|SYS_HZ=180000000|DIV256=23040|ACTUAL_DIV256=23040|CYCLES=2|RAW_GPIO=17,18,19,20|LA_GPIO=18,17,20,19|PACK=LSB_FIRST|PIO=2|DMA_ERRORS=0|CRC32='+crc32(bytes).toString(16).padStart(8,'0');
  const row='LAD|0|'+'11111111'.repeat(4);
  const result=snapshot([h,row,'LAEND'],'LA');assert.equal(result.rate,1e6);
  assert.deepEqual(result.channels.map(ch=>ch[31]),[0,1,0,0]);
  assert.throws(()=>snapshot([h,row.replace('|0|','|1|'),'LAEND'],'LA'));
  assert.throws(()=>snapshot([h,row.slice(0,-1)+'3','LAEND'],'LA'),/CRC/);
});
test('ADC34 V2 timing, CRC and physical A3 before A4',()=>{
  const bytes=new Uint8Array(128);for(let i=0;i<128;i+=4){bytes[i]=1;bytes[i+3]=8;}
  const h='A34|V=2|FIRST=4|CHANNELS=A3,A4|PHYSICAL_ADC=4,3|STATUS=OK|SEQ=1|PAIRS=32|ADC_HZ=48000000|PERIOD256=122880|DIV256=122624|BITS=12|VREF_NOMINAL_MV=3300|ZERO=NOMINAL_NONE|ERRORS=0|OVERFLOW=0|DMA_ERRORS=0|CRC32='+crc32(bytes).toString(16).padStart(8,'0');
  const rows=[h,'A34D|0|'+'00010800'.repeat(32),'A34END'];
  const f=snapshot(rows,'A34');assert.equal(f.rate,50000);assert.equal(f.skew[1],.00001);
  assert.deepEqual(f.channels.map(c=>c[0]),[1,2048]);assert.throws(()=>snapshot([h.replace('FIRST=4','FIRST=3'),...rows.slice(1)],'A34'));
});
test('DC write is acknowledged, read back, and mismatch is surfaced',async()=>{
  let page=0, target=0;const {link,log}=serial(cmd=>{
    if(cmd==='LINK:STATE?')return line(state(page));
    if(cmd==='LINK:PAGE 9'){page=9;return line('LINK|OK=PAGE|PAGE=9');}
    if(cmd.startsWith('DC:SET'))target=Number(cmd.split(' ')[1]);
    if(cmd.startsWith('DC:'))return line('DC|STATE=ZERO_STANDBY|FB_VALID=0|SET_MV='+target+'|FAULT=0');
    return line(identity(cmd));
  });
  const board=new Instrument(link);await link.open();await board.identify();
  await assert.rejects(board.output('dc','apply',{mv:4001}));assert.ok(!log.includes('LINK:PAGE 9'));
  const s=await board.output('dc','apply',{mv:-1250});assert.equal(s.mv,-1250);assert.equal(s.feedback,null);
  assert.equal(log.at(-1),'DC:STATUS?');await assert.rejects(board.output('dc','on'),/状态不符/);await link.close();
});
test('RAW2 follows the board channel and locks a 10 kHz sine despite changing capture phase',()=>{
  const span=.0004,rate=3410000;
  for(const source of [0,1,2]){
    const raw=zp();raw[52]=source;assert.equal(rawFrame(raw).boardSource,source);
    for(const phase of [0,.4,1.9,4.6]){
      const signal=Float32Array.from({length:4096},(_,i)=>.2+1.94*Math.sin(2*Math.PI*10000*i/rate+phase));
      const noise=signal.map((_,i)=>.04*((i%3)-1));
      const f={channels:source===2?[noise,signal]:[signal,noise],boardSource:source,skew:[0,.5/rate],rate,voltsPerCode:.04};
      for(const edge of ['rise','fall']){
        const lock=scopeTrigger(f,{source:'board',edge,level:'0'},span);
        assert.equal(lock.source,source===2?2:1);assert.ok(Math.abs(lock.level-.2)<.02);
        const angle=2*Math.PI*10000*(lock.start+span/4-f.skew[lock.source-1])+phase;
        assert.ok(Math.abs(Math.sin(angle))<.011);assert.equal(Math.cos(angle)>0,edge==='rise');
        assert.ok(lock.start>=Math.max(...f.skew) && lock.start+span<4096/rate);
      }
    }
  }
});
test('manual trigger rejects a partial window and preserves the common start and A2 aperture',()=>{
  const f={channels:[[-1,-1,-1,1,1,1,1,1],[-1,-1,1,1,1,1,1,1]],rate:1000,skew:[0,.0005],voltsPerCode:.04};
  const manual={source:'1',edge:'rise',level:'0'};
  assert.equal(scopeTrigger(f,manual,.004).start,.0015);
  assert.equal(scopeTrigger(f,{...manual,source:'2'},.004).start,.001);
  assert.equal(scopeTrigger(f,manual,.007),null);
  assert.equal(scopeTrigger(f,{...manual,level:'5'},.004),null);
  assert.equal(scopeTrigger(f,{source:'free'},.004),null);
});
test('known sine has expected FFT amplitude',()=>{
  const sine=Array.from({length:1024},(_,i)=>2*Math.sin(2*Math.PI*50*i/1024));
  const s=spectrum(sine,1024);assert.equal(s.step,1);assert.ok(Math.abs(s.bins[50]-2)<.001);
});
function zc(kind,body,index=0){
  const b=new Uint8Array(32+body.length),v=new DataView(b.buffer);
  b.set(encode('ZC01'));b[4]=kind;v.setUint16(6,body.length,true);v.setUint32(8,10,true);
  v.setBigUint64(12,BigInt(index),true);if(kind===2)v.setBigUint64(20,500n,true);b.set(body,32);
  const covered=new Uint8Array(28+body.length);covered.set(b.subarray(0,28));covered.set(body,28);v.setUint32(28,crc32(covered),true);
  return b;
}
test('ZC01 fragmented epochs, gaps, CRC, common window length',()=>{
  const b=new Uint8Array(20),v=new DataView(b.buffer);
  [[0,10000],[4,1000000],[12,500000],[16,10000]].forEach(([p,n])=>v.setUint32(p,n,true));
  const metadata=zc(2,b), block=zc(1,new Uint8Array(1024));
  const grab=rollWindow(10000,1000),dec=new WireDecoder();let frame;
  for(const byte of [...metadata,...block])dec.feed(Uint8Array.of(byte),event=>{frame=grab(event);});
  assert.equal(frame.channels[1].length,400);
  const invalid=rollWindow(10000,1000);invalid(metadata);assert.throws(()=>invalid(zc(1,new Uint8Array(1024),1)),/缺口/);
  block[98]^=5;assert.throws(()=>invalid(block),/校验/);
});

test('slow timebase reads board source before CS and leaves overcapture for a full aligned window',async()=>{
  const body=new Uint8Array(20),v=new DataView(body.buffer);
  for(const [i,n] of [[0,10000],[4,1000000],[12,500000],[16,10000]])v.setUint32(i,n,true);
  const data=new Uint8Array(800);
  for(let i=0;i<data.length;i+=2){data[i]=128;data[i+1]=128+Math.round(45*Math.sin(i*Math.PI/80));}
  const {link,log}=serial(cmd=>{
    if(cmd==='STATUS')return line('MODE:OSC; USB:OK; TRIG:A2; STREAM:OFF; SEQ:0; RAW2:OFF; RAW2_SEQ:0; FW:DAY28_PAIRED_RAW_STREAM');
    if(cmd==='CS:START 10000')return ['CS|START|RATE=10000\r\n',zc(2,body),zc(1,data),zc(1,data,400)];
    if(cmd==='CS:STOP')return line('CS|STOP|OK=1');
    return line(identity(cmd));
  });
  await link.open();const board=new Instrument(link);
  try{
    await board.identify();const f=await board.captureScope(12,4,undefined,undefined,'board');
    assert.equal(f.channels[0].length,602);assert.equal(f.boardSource,2);
    assert.equal(scopeTrigger(f,{source:'board',edge:'rise'},.04).source,2);
    assert.deepEqual(log.slice(-3),['STATUS','CS:START 10000','CS:STOP']);
  }finally{await link.close();}
});
test('averaged traces are interpolated at the same trigger phase across captures',()=>{
  const make=(shift,source=1)=>({rate:1000,span:.004,start:.002+shift/1000,skew:[0,.0005],
    trigger:{source},channels:[0,.5].map(skew=>Float32Array.from({length:12},(_,i)=>i+skew-shift))});
  const a=averageWindows(null,make(0),2),b=averageWindows(a,make(.5),2);
  assert.equal(b.count,2);assert.deepEqual([...b.channels[0]],[2,3,4,5,6]);
  assert.deepEqual([...b.channels[0]],[...b.channels[1]]);
  assert.equal(averageWindows(b,make(0),2).count,1);
  assert.equal(averageWindows(a,make(0,2),2).count,1);
});
test('continuous RAW2 uses one START for multiple frames and waits for STOP before the next query',async()=>{
  const c=new AbortController(),seen=[];
  const {link,log}=serial(cmd=>{
    if(cmd==='RAW2:START')return ['OK RAW2 STARTED\n',zp(),zp(),zp()];
    if(cmd==='RAW2:STOP')return ['OK RAW2 STOPPED\n'];
    if(cmd==='RAW2:DECIM 1')return ['OK RAW2:DECIM=1\n'];
    return line(identity(cmd));
  });
  await link.open();const board=new Instrument(link);
  try{
    await board.identify();
    await board.captureScope(6,4,undefined,c.signal,'board',f=>{
      seen.push(f);if(seen.length===2)c.abort();
    });
    await board.state();
    assert.equal(seen.length,2);assert.equal(seen[0].rate,100000);
    assert.deepEqual(log.slice(-4),['RAW2:DECIM 1','RAW2:START','RAW2:STOP','LINK:STATE?']);
  }finally{await link.close();}
});
test('decoder retains fragmented binary payloads after the receive buffer is reused',()=>{
  const decoder=new WireDecoder(),received=[];
  const one=zp(),two=zp();two[8]=7;
  for(const b of [...one,...two])decoder.feed(Uint8Array.of(b),e=>received.push(e));
  assert.deepEqual(received,[one,two]);assert.equal(decoder.tail.length,0);
});
