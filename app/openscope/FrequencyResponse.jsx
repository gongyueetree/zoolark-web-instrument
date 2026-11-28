'use client';
import {useState} from 'react';
import Quantity from './Quantity';

const hzLabel=hz=>(hz/1000).toLocaleString('zh-CN',{maximumFractionDigits:4})+' kHz';
const print=(value,digits)=>value==null?'—':value.toFixed(digits);

export function FraControls({source,onSource,board,busy,running,start,stop}){
  const [freq,setFreq]=useState(1000),[low,setLow]=useState(1000),[high,setHigh]=useState(20000),[count,setCount]=useState(12);
  const wav=source==='wav';
  return <>
    <fieldset className="form-grid" disabled={!board||busy}>
      <label>激励源<select aria-label="激励源" value={source} onChange={e=>onSource(e.target.value)}>
        <option value="auto">外部正弦源 · 自动识别 A1</option>
        <option value="fixed">外部正弦源 · 指定频率</option>
        <option value="wav">板载 WAV · 正弦激励</option>
      </select></label>
      <p>{wav?'WAV_OUT（J1-11）接被测电路输入。':'外部正弦源接被测电路输入。'}A1 接输入，A2 接输出，共地。频段 1–20 kHz。</p>
      {source!=='auto'&&<Quantity title="测量频率" type="frequency" value={freq} onChange={setFreq} min={1000} max={20000} step={wav?100:1}/>}
      {wav&&<p>测量时输出 1 Vpp、零偏置。结束后恢复 WAV 原设置。</p>}
      <button className="primary" onClick={()=>start({freq})}>{wav?'激励并采集频点':'采集频点'}</button>
      {wav&&<>
        <Quantity title="扫频起点" type="frequency" value={low} onChange={setLow} min={1000} max={20000} step={100}/>
        <Quantity title="扫频终点" type="frequency" value={high} onChange={setHigh} min={1000} max={20000} step={100}/>
        <label>频点数<input type="number" min="2" max="32" value={count} onChange={e=>setCount(e.target.value)}/></label>
        <button onClick={()=>start({low,high,count,sweep:true})}>开始对数扫频</button>
      </>}
    </fieldset>
    {running&&<button onClick={stop}>停止测量</button>}
  </>;
}

function GainPlot({rows}){
  const valid=rows.filter(p=>p.gain!=null);
  if(!valid.length)return null;
  const low=Math.min(0,...valid.map(p=>p.gain)),high=Math.max(0,...valid.map(p=>p.gain));
  const step=Math.pow(10,Math.floor(Math.log10(Math.max(2,high-low))))/2;
  const min=Math.floor((low-0.5)/step)*step,max=Math.ceil((high+0.5)/step)*step;
  const x=p=>60+680*Math.log10((p.hz||p.target)/1000)/Math.log10(20),y=g=>22+150*(max-g)/(max-min);
  let path='',move=true;
  for(const p of rows){
    if(p.gain==null){move=true;continue;}
    path+=(move?'M':'L')+x(p)+' '+y(p.gain)+' ';move=false;
  }
  return <svg xmlns="http://www.w3.org/2000/svg" className="fra-chart" fill="#a8b8d0" fontFamily="monospace" fontSize="12" viewBox="0 0 775 209" role="img" aria-label="A2/A1 幅频响应，对数频率轴">
    <rect width="775" height="209" fill="#080d1d"/>
    {[max,(max+min)/2,min].map(g=><g key={g}><line stroke="#233348" x1="60" x2="740" y1={y(g)} y2={y(g)}/><text x="53" y={y(g)+4} textAnchor="end">{Number(g.toFixed(2))}</text></g>)}
    <text x="15" y="15">dB</text>
    {[1,2,5,10,20].map(k=><g key={k}><line stroke="#233348" x1={x({hz:k*1000})} x2={x({hz:k*1000})} y1="22" y2="172"/><text x={x({hz:k*1000})} y="195" textAnchor="middle">{k} kHz</text></g>)}
    <path d={path} fill="none" stroke="#00d4ff" strokeWidth="2"/>
    {valid.map(p=><circle key={p.target} cx={x(p)} cy={y(p.gain)} r="3.5" fill="#00d4ff"><title>{hzLabel(p.hz)} · {print(p.gain,2)} dB</title></circle>)}
  </svg>;
}

export function FraResults({rows}){
  return <section className="board-card fra-results"><h2>频响测量</h2>
    {rows.length?<><GainPlot rows={rows}/><table><thead><tr><th>目标频点</th><th>A1 实测</th><th>A2/A1 增益</th><th>相位差（未校准）</th></tr></thead>
      <tbody>{rows.map(p=><tr key={p.target}><td>{hzLabel(p.target)}</td><td>{p.hz?hzLabel(p.hz):'—'}</td>
        {p.reason?<td colSpan="2">{p.reason}</td>:<><td>{print(p.gain,2)} dB</td><td>{p.phase==null?'—':print(p.phase,1)+'°'}</td></>}</tr>)}</tbody></table></>:
      <p>等待采集频点</p>}
  </section>;
}

export function downloadFra(rows,chart,asChart){
  if(!rows.length)throw new Error('请先采集频点');
  if(asChart&&!chart)throw new Error('请先取得一个有效的增益测量值');
  const columns=['target_hz','measured_hz','gain_db','phase_uncal_deg','reason'];
  const csv=()=>[columns,...rows.map(p=>[p.target,p.hz,p.gain,p.phase,p.reason])]
    .map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  const blob=asChart?new Blob([new XMLSerializer().serializeToString(chart)],{type:'image/svg+xml'}):
    new Blob(['\uFEFF',csv()],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=asChart?'FRA-response.svg':'FRA-points.csv';
  a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
