'use client';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
const names={wav:'波形输出',pwm:'PWM 输出',dc:'直流输出'};
const waves=['三角波','方波','正弦波','锯齿波'];
const defaults={wav:{wave:2,hz:1000,amp:1,offset:0,peak:50},pwm:{hz:1000,duty:50},dc:{mv:0}};
function formValues(kind,s){
  if(kind==='wav')return {wave:s.wave,hz:s.hz,amp:s.amp/10,offset:s.offset/10,peak:s.peak};
  return kind==='pwm'?{hz:s.hz,duty:s.duty}:{mv:s.mv/1000};
}
function wireValues(draft){
  const result={};
  for(const [key,val] of Object.entries(draft)){
    if(String(val).trim()==='')throw new Error('请填写完整输出参数');
    const scale=key==='mv'?1000:['amp','offset'].includes(key)?10:1;
    const n=Number(val)*scale;
    if(!Number.isFinite(n) || Math.abs(n-Math.round(n))>1e-8)throw new Error('参数超出设置精度');
    result[key]=Math.round(n);
  }
  return result;
}
export default function Outputs({kind,board,run,busy,displayHost}){
  const [draft,setDraft]=useState(defaults[kind]),[actual,setActual]=useState(null);
  const [time,setTime]=useState('');
  function publish(s,copy=false){setActual(s);setTime(new Date().toLocaleTimeString());if(copy)setDraft(formValues(kind,s));}
  useEffect(()=>{
    let alive=true;
    if(board) run(async()=>{
      const s=await board.output(kind,'read');
      if(alive)publish(s,true);
    });
    return ()=>{alive=false;};
  },[board,kind]); // remounted per output and connection
  function command(action){
    run(async()=>{
      try{
        const s=await board.output(kind,action,action==='apply'?wireValues(draft):{});
        publish(s,action==='read'||action==='apply');
      } catch(e) {
        setActual(null);
        if(!board.link.closed){
          try {publish(await board.output(kind,'read'));}catch{}
        }
        throw e;
      }
    });
  }
  function number(key,title,min,max,step){
    return <label>{title}<input type="number" min={min} max={max} step={step} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
  }
  return <><h2>{names[kind]}</h2><p className="muted">{kind==='wav'?'J1-11 · WAV_OUT，相邻 J1-12 接地。幅度单位 Vpp，设置幅度与偏置后的名义端点须在 ±4 V 内。':kind==='pwm'?'J1-9 · PWM_OUT，相邻 J1-10 接地。占空比支持 0% 和 100%。':'J1-13 · DC_PWM，相邻 J1-14 接地。设定范围 −4 至 +4 V，板端提供未校准的反馈电压。'}</p>
    <fieldset disabled={!board||busy}><form onSubmit={e=>{e.preventDefault();command('apply');}}>
      <div className="form-grid">
        {kind==='wav'&&<label>波形<select value={draft.wave} onChange={e=>setDraft({...draft,wave:Number(e.target.value)})}>{waves.map((w,i)=><option key={w} value={i}>{w}</option>)}</select></label>}
        {kind!=='dc'&&number('hz','频率 / Hz',kind==='wav'?1000:1,kind==='pwm'?1000000:Number(draft.wave)===3?10000:500000,kind==='wav'?100:1)}
        {kind==='wav'&&<>{number('amp','幅度 / Vpp',0,8,.1)}{number('offset','偏置 / V',-2,2,.1)}{Number(draft.wave)===3&&number('peak','峰值位置 / %',0,100,1)}</>}
        {kind==='pwm'&&number('duty','占空比 / %',0,100,1)}
        {kind==='dc'&&number('mv','目标电压 / V',-4,4,.001)}
      </div><button className="primary" disabled={!actual}>写入参数并核对</button>
    </form><div className="row"><button onClick={()=>command('read')}>读取板端设置</button><button disabled={!actual || !!actual.on} onClick={()=>command('on')}>开启板端输出</button><button onClick={()=>command('off')}>关闭板端输出</button></div></fieldset>
    {createPortal(<div className="board-card readback"><h2>{names[kind]}</h2><h3>板端回读 {time && <small>{time}</small>}</h3>{!actual?'尚无有效读回':<><strong>{actual.on?'输出已开启':'输出已关闭'}{actual.fault?' · 故障 '+actual.fault:''}</strong><p>
      {kind==='wav'&&[waves[actual.wave],actual.hz+' Hz',actual.amp/10+' Vpp','偏置 '+actual.offset/10+' V',...(actual.wave===3?['峰位 '+actual.peak+' %']:[])].join(' · ')}
      {kind==='pwm'&&actual.hz+' Hz · 占空比 '+actual.duty+' %'}
      {kind==='dc'&&'设定 '+actual.mv/1000+' V · 反馈 '+(actual.feedback===null?'暂无有效值':actual.feedback/1000+' V')+' · '+actual.state}
    </p></>}</div>,displayHost)}</>;
}
