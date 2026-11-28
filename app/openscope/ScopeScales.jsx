'use client';
import {TIME_US,VDIV_MV} from '../../src/openscope/frames.mjs';
import {timeLabel} from './Plot';

export const displayMillivolts=[10,20,50,100,200,500,1000,2000,5000];
export const zoomOptions=[1,2,5,10];
const voltLabel=mv=>mv<1000?mv+' mV':mv/1000+' V';

export function BoardScales({td,vd,onChange,disabled=false}){
  return <>
    <label>板端时基 / 格<select aria-label="板端时基 / 格" disabled={disabled} value={td} onChange={e=>onChange(Number(e.target.value),vd)}>
      {TIME_US.map((us,i)=><option key={i} value={i}>{timeLabel(us/1e6)}</option>)}
    </select></label>
    <label>板端量程 / 格<select aria-label="板端量程 / 格" disabled={disabled} value={vd} onChange={e=>onChange(td,Number(e.target.value))}>
      {[0,1,2,7,3,4,5,6].map(i=><option key={i} value={i}>{voltLabel(VDIV_MV[i])}{i===7?'（500 mV 档放大）':''}</option>)}
    </select></label>
  </>;
}

export function DisplayScales({aux,channel='both',scales,zoom,onScales,onZoom}){
  return <>
    {scales.map((scale,i)=>(channel==='both'||channel===String(i+1))&&<label key={i}>
      CH{i+(aux?3:1)} 显示 / 格<select aria-label={'CH'+(i+(aux?3:1))+' 显示 / 格'} value={scale} onChange={e=>onScales(scales.map((v,j)=>j===i?Number(e.target.value):v))}>
        <option value={0}>{aux?'满量程（0–3.3 V）':'随板端量程'}</option>
        {displayMillivolts.map(mv=><option key={mv} value={mv}>{voltLabel(mv)}</option>)}
      </select></label>)}
    <label>水平放大<select aria-label="水平放大" value={zoom} onChange={e=>onZoom(Number(e.target.value))}>
      {zoomOptions.map(z=><option key={z} value={z}>{z}×</option>)}
    </select></label>
  </>;
}
