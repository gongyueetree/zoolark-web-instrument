'use client';
import {useState} from 'react';

export const frequencyUnits={Hz:1,kHz:1e3,MHz:1e6};
export const voltageUnits={V:1,mV:1e-3};
const rounded=n=>Number(n.toPrecision(12));

// The parent stores Hz or volts. Changing the unit only changes the editor.
export default function Quantity({title,type='voltage',value,onChange,min,max,step='any',unit:chosenUnit,onUnitChange}){
  const units=type==='frequency'?frequencyUnits:voltageUnits;
  const [localUnit,setUnit]=useState(Object.keys(units)[0]);
  const unit=chosenUnit||localUnit;
  const factor=units[unit];
  return <div className="quantity"><label>{title} / {unit}{title==='幅度'?'pp':''}
    <input type="number" value={value===''?'':rounded(Number(value)/factor)}
      min={min==null?undefined:rounded(min/factor)} max={max==null?undefined:rounded(max/factor)}
      step={step==='any'?step:rounded(step/factor)}
      onChange={e=>onChange(e.target.value===''?'':rounded(Number(e.target.value)*factor))}/></label>
    <select aria-label={title+'单位'} value={unit} onChange={e=>(onUnitChange||setUnit)(e.target.value)}>{Object.keys(units).map(u=><option key={u}>{u}</option>)}</select>
  </div>;
}
