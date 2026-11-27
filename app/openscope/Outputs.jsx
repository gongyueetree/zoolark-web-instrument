'use client';
import {useEffect,useState} from 'react';
import Quantity,{frequencyUnits,voltageUnits} from './Quantity';
import OutputPreview from './OutputPreview';
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
  const [units,setUnits]=useState({hz:'Hz',amp:'V',offset:'V',mv:'V'});
  const [pending,setPending]=useState(false);
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
  async function command(action){
    if(pending||!board)return;
    setPending(true);
    try{await run(async()=>{
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
    });}finally{setPending(false);}
  }
  function number(key,title,min,max,step){
    return <label>{title}<input type="number" min={min} max={max} step={step} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
  }
  const renderDisplay=body=>displayHost?createPortal(body,displayHost):body;
  function readout(key,value){
    const unit=units[key],factor=(key==='hz'?frequencyUnits:voltageUnits)[unit];
    return Number((value/factor).toPrecision(10))+' '+unit+(key==='amp'?'pp':'');
  }
  function quantity(key,title,type,min,max,step){
    return <Quantity title={title} type={type} value={draft[key]} min={min} max={max} step={step} unit={units[key]} onUnitChange={unit=>setUnits(old=>({...old,[key]:unit}))}
      onChange={value=>setDraft(old=>({...old,[key]:value}))}/>;
  }
  return <><h2>{names[kind]}</h2><p className="muted">{kind==='wav'?'J1-11 · WAV_OUT，相邻 J1-12 接地。幅度按峰峰值设置，叠加偏置后波峰和波谷须在 ±4 V 内。':kind==='pwm'?'J1-9 · PWM_OUT，相邻 J1-10 接地。占空比支持 0% 和 100%。':'J1-13 · DC_PWM，相邻 J1-14 接地。设定范围 −4 至 +4 V，板端提供未校准的反馈电压。'}</p>
    <fieldset disabled={busy||pending}><form onSubmit={e=>{e.preventDefault();command('apply');}}>
      <div className="form-grid">
        {kind==='wav'&&<label>波形<select value={draft.wave} onChange={e=>setDraft({...draft,wave:Number(e.target.value)})}>{waves.map((w,i)=><option key={w} value={i}>{w}</option>)}</select></label>}
        {kind!=='dc'&&quantity('hz','频率','frequency',kind==='wav'?1000:1,kind==='pwm'?1000000:Number(draft.wave)===3?10000:500000,kind==='wav'?100:1)}
        {kind==='wav'&&<>{quantity('amp','幅度','voltage',0,8,.1)}{quantity('offset','偏置','voltage',-2,2,.1)}{Number(draft.wave)===3&&number('peak','峰值位置 / %',0,100,1)}</>}
        {kind==='pwm'&&number('duty','占空比 / %',0,100,1)}
        {kind==='dc'&&quantity('mv','目标电压','voltage',-4,4,.001)}
      </div>{kind==='wav'&&Number(draft.hz)>(Number(draft.wave)===3?10000:500000)&&<p className="range-hint" role="alert">此波形的板端频率上限为 {readout('hz',Number(draft.wave)===3?10000:500000)}。</p>}
      <button className="primary" disabled={!actual}>写入参数并核对</button>
    </form><div className="row"><button disabled={!board} onClick={()=>command('read')}>读取板端设置</button><button disabled={!actual || !!actual.on} onClick={()=>command('on')}>开启板端输出</button><button disabled={!board} onClick={()=>command('off')}>关闭板端输出</button></div></fieldset>
    {renderDisplay(<>{kind!=='dc'&&<OutputPreview kind={kind} draft={draft} referenceHz={actual?.hz} voltageUnit={units.amp} frequencyUnit={units.hz}/>}<div className="board-card readback"><h2>{names[kind]}</h2><h3>板端回读 {time && <small>{time}</small>}</h3>{!actual?'尚无有效读回':<><strong>{actual.on?'输出已开启':'输出已关闭'}{actual.fault?' · 故障 '+actual.fault:''}</strong><p>
      {kind==='wav'&&[waves[actual.wave],readout('hz',actual.hz),readout('amp',actual.amp/10),'偏置 '+readout('offset',actual.offset/10),...(actual.wave===3?['峰位 '+actual.peak+' %']:[])].join(' · ')}
      {kind==='pwm'&&readout('hz',actual.hz)+' · 占空比 '+actual.duty+' %'}
      {kind==='dc'&&'设定 '+readout('mv',actual.mv/1000)+' · 反馈 '+(actual.feedback===null?'暂无有效值':readout('mv',actual.feedback/1000))+' · '+actual.state}
    </p></>}</div></>)} </>;
}
