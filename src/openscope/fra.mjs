// R144/R149 reject a frequency error above 1% and evaluate both ADC lanes twice.
const reasons={
  WEAK_SIGNAL:'信号幅度过小，请检查 A1 输入和 A2 输出接线及示波器量程',
  CLIPPED:'输入削顶，请增大量程或减小激励幅度',
  NOT_SINE:'波形偏离正弦，请检查激励波形和被测电路是否失真',
  INSUFFICIENT_CYCLES:'参考周期不足，请检查 A1 是否接入 1–20 kHz 正弦波',
  UNSTABLE:'两次采样不一致，请待信号稳定后重测',
  OUT_OF_BAND:'频率超过板端测量范围（1–20 kHz）',
};
const hzText=hz=>Number(hz.toFixed(2)).toLocaleString('en-US')+' Hz';

export class InvalidFraPoint extends Error {
  constructor(state,target,actual){
    let message=reasons[state]||('板端状态 '+state);
    if(state==='FREQUENCY_MISMATCH'){
      message='目标 '+hzText(target)+'，'+(actual?'A1 实测 '+hzText(actual):'A1 未返回有效频率')+'，超出 1% 容差。';
      message+=actual&&(actual<1000||actual>20000)?'请将正弦源调至 1–20 kHz。':'请核对激励频率及 A1 参考接线。';
    }
    super(message);
    this.state=state;
    this.actual=actual;
  }
}

export function checkFraHz(hz,onboard=false){
  if(!Number.isInteger(hz)||hz<1000||hz>20000)throw new Error('测量频率须为 1,000–20,000 Hz 的整数');
  if(onboard&&hz%100!==0)throw new Error('板载 WAV 频率步进为 100 Hz');
  return hz;
}

export function sweepTargets(start,stop,points){
  checkFraHz(start,true);checkFraHz(stop,true);
  if(start>=stop||!Number.isInteger(points)||points<2||points>32)throw new Error('起始频率须小于终止频率，频点数为 2–32');
  const mapped=Array.from({length:points},(_,i)=>100*Math.round(start*(stop/start)**(i/(points-1))/100));
  return [...new Set(mapped)];
}

export async function externalPoint(board,hz,automatic,signal){
  const probe=automatic?10000:checkFraHz(hz);
  try{
    return await board.fra(probe,signal);
  }catch(e){
    if(!automatic||!(e instanceof InvalidFraPoint)||e.state!=='FREQUENCY_MISMATCH'||!e.actual)throw e;
    // Clamp to a supported endpoint only inside the firmware's own tolerance.
    const detected=Math.max(1000,Math.min(20000,Math.round(e.actual)));
    if(Math.abs(e.actual/detected-1)>.01||detected===probe)throw e;
    signal.throwIfAborted();
    return board.fra(detected,signal);
  }
}

export async function measureWithWav(board,targets,signal,onPoint,onTarget){
  for(const hz of targets)checkFraHz(hz,true);
  const old=await board.readOutput('wav');
  if(old.fault)throw new Error('板载 WAV 有故障，请先检查信号发生器');
  if(old.hz<1000||old.hz%100!==0)throw new Error('当前 WAV 使用本地低频档，网页无法恢复该档位。请改用外部源，或先在仪器上切回常规档位。');
  // Establish that FRA is accessible before touching an existing output.
  const fraPage=6;
  const wav=(action,values)=>board.output('wav',action,values,fraPage);
  await board.page(fraPage);
  signal.throwIfAborted();
  try{
    if(old.on)await wav('off');
    for(const [i,hz] of targets.entries()){
      signal.throwIfAborted();onTarget(hz,i);
      const applied=await wav('apply',{wave:2,amp:10,offset:0,hz,peak:old.peak});
      signal.throwIfAborted();
      if(!applied.on)await wav('on');
      signal.throwIfAborted();
      try{onPoint(await board.fra(hz,signal));}
      catch(e){
        if(!(e instanceof InvalidFraPoint))throw e;
        onPoint({target:hz,hz:e.actual,gain:null,phase:null,reason:e.message});
        if(targets.length===1)throw e;
      }
    }
  }finally{
    // Disconnect/navigation waits for this shutdown and readback while CDC is available.
    try{
      await board.query('FUNC:OUTPUT OFF','OK FUNC:');
      const off=await board.readOutput('wav');
      if(off.on)throw new Error('输出仍开启');
      await wav('apply',old);
      if(old.on)await wav('on');
    }catch(e){throw new Error('WAV 原状态恢复未确认，请在仪器上检查输出。'+e.message);}
  }
}
