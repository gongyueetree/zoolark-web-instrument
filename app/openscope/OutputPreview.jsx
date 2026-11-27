'use client';
import {useState} from 'react';
import {format,timeLabel} from './Plot';
import {frequencyUnits,voltageUnits} from './Quantity';

function sample(wave,p,peak){
  if(wave===2)return Math.sin(2*Math.PI*p);
  if(wave===1)return p<.5?1:-1;
  if(wave===0)return 1-4*Math.abs(p-.5);
  if(peak===0)return 1-2*p;
  if(peak===1)return 2*p-1;
  return p<peak?2*p/peak-1:1-2*(p-peak)/(1-peak);
}
export default function OutputPreview({kind,draft,referenceHz,voltageUnit,frequencyUnit}){
  const [fit,setFit]=useState(null);
  const pwm=kind==='pwm',hz=Number(draft.hz),amplitude=pwm?3.3:Number(draft.amp),offset=pwm?0:Number(draft.offset);
  const valid=draft.hz!==''&&hz>0&&Number.isFinite(hz)&&(pwm?draft.duty!=='':draft.amp!==''&&draft.offset!=='');
  // Keep the time axis fixed for small edits. Follow the frequency by decades
  // when an edit would crowd the screen or show only a fraction of a cycle.
  const reference=fit||referenceHz||1000;
  const decade=valid?Math.round(Math.log10(hz/reference)):0;
  const span=3/(reference*10**decade),cycles=span*hz;
  const left=58,right=782,top=18,bottom=182;
  const y=v=>pwm?bottom-(v+.4)/4.1*(bottom-top):bottom-(v+4.5)/9*(bottom-top);
  const x=t=>left+(right-left)*t;
  const duty=Number(draft.duty)/100,peak=Number(draft.peak)/100;
  let path='';
  if(valid){
    const vertex=(t,v)=>{path+=(path?'L':'M')+x(t).toFixed(2)+' '+y(v).toFixed(2);};
    if(pwm||draft.wave===1){
      const high=pwm?3.3:offset+amplitude/2,low=pwm?0:offset-amplitude/2,frac=pwm?duty:.5;
      vertex(0,frac>0?high:low);
      if(frac>0&&frac<1)for(let i=0;i<cycles;i++){
        for(const [phase,before,after] of [[i+frac,high,low],[i+1,low,high]]){
          if(phase>cycles)break;
          vertex(phase/cycles,before);vertex(phase/cycles,after);
        }
      }
      vertex(1,frac===1||cycles%1<frac?high:low);
    }else{
      const count=Math.max(640,Math.ceil(cycles*32));
      for(let i=0;i<=count;i++)vertex(i/count,offset+amplitude/2*sample(draft.wave,(cycles*i/count)%1,peak));
    }
  }
  return <div className="output-preview"><div className="preview-head"><strong>{pwm?'PWM':'WAV'} 波形预览</strong>
    <span>{valid?format(hz/frequencyUnits[frequencyUnit])+' '+frequencyUnit+' · 周期 '+timeLabel(1/hz):'请填写完整参数'}</span>
    <button type="button" disabled={!valid} onClick={()=>setFit(hz)}>适配周期</button></div>
    <svg viewBox="0 0 800 216" role="img" aria-label={pwm?'PWM 参数预览':'WAV 参数预览'}>
      {Array.from({length:7},(_,i)=><g key={i}><line x1={x(i/6)} y1={top} x2={x(i/6)} y2={bottom}/><text x={x(i/6)} y="204" textAnchor={i===0?'start':i===6?'end':'middle'}>{timeLabel(span*i/6)}</text></g>)}
      {(pwm?[0,1.65,3.3]:[-4,-2,0,2,4]).map(v=><g key={v}><line x1={left} y1={y(v)} x2={right} y2={y(v)}/><text x={left-8} y={y(v)+4} textAnchor="end">{format(v/voltageUnits[voltageUnit])} {voltageUnit}</text></g>)}
      {valid&&<path d={path}/>}
    </svg></div>;
}
