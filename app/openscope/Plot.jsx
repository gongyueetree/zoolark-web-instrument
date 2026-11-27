'use client';
import {useEffect,useRef,useMemo} from 'react';
import {spectrum,stats} from '../../src/openscope/display.mjs';
export const colors=['#5fe4cc','#f4bc68','#93adff','#ed9fce'];
export const format=(v,d=3)=>Number(v.toPrecision(d)).toLocaleString('en-US',{maximumFractionDigits:8});
export const timeLabel=s=>s<.001?format(s*1e6)+' µs':s<1?format(s*1e3)+' ms':format(s)+' s';

export default function Plot({frame,fft}) {
  const ref=useRef(null);
  const names=frame?.group==='LA'?['D0','D1','D2','D3']:frame?.group==='A34'?['A3','A4']:['A1','A2'];
  const specs=useMemo(()=>fft && frame ? frame.channels.map(ch=>spectrum(ch,frame.rate)):null,[frame,fft]);
  const metrics=useMemo(()=>frame?.channels.map(stats),[frame]);
  useEffect(()=>{
    const canvas=ref.current;
    function draw(){
      const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
      const w=r.width,h=r.height;
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
      const left=54,right=w-15,top=16,bottom=h-32,pw=right-left,ph=bottom-top;
      const digital=frame?.group==='LA', aux=frame?.group==='A34';
      let ymax=frame?.vdiv?4*frame.vdiv/1000:3.3,ymin=aux?0:-ymax;
      if(fft){ymin=0;ymax=Math.max(.001,...(specs||[]).map(s=>s?stats(s.bins).max:0))*1.05;}
      const span=fft?(frame?.rate||2)/2:(frame?.span||1),start=fft?0:frame?.start||0;
      ctx.font='11px ui-monospace,monospace';
      for(let i=0;i<=8;i++){
        const y=top+ph*i/8;ctx.strokeStyle=i===4?'#486066':'#23383d';
        ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
        if(frame && !digital && !(i%2)){ctx.fillStyle='#abbdc0';ctx.textAlign='right';ctx.fillText(format(ymax-(ymax-ymin)*i/8),left-7,y+4);}
      }
      for(let i=0;i<=4;i++){
        const x=left+pw*i/4;ctx.strokeStyle='#2b4044';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();
        if(frame){ctx.fillStyle='#abbdc0';ctx.textAlign=i===4?'right':'left';ctx.fillText(fft?format(span*i/4)+' Hz':timeLabel(span*i/4),x,bottom+21);}
      }
      if(!frame)return;
      frame.channels.forEach((samples,ch)=>{
        const values=fft?specs[ch]?.bins:samples;if(!values)return;
        const step=fft?specs[ch].step:1/frame.rate, skew=fft?0:frame.skew[ch];
        const x=i=>left+pw*(i*step+skew-start)/span;
        const y=v=>digital?top+ph*(ch+.72-.44*v)/4:bottom-ph*(v-ymin)/(ymax-ymin);
        if(digital){ctx.textAlign='right';ctx.fillStyle=colors[ch];ctx.fillText('D'+ch,left-8,y(1)+5);}
        ctx.save();ctx.beginPath();ctx.rect(left,top,pw,ph);ctx.clip();
        ctx.strokeStyle=colors[ch];ctx.lineWidth=1.5;ctx.beginPath();
        const first=Math.max(0,Math.floor((start-skew)/step)),last=Math.min(values.length,Math.ceil((start+span-skew)/step)+1);
        // Preserve narrow pulses and extrema when more than one sample falls in a pixel.
        for(let i=first;i<last;){
          const stop=Math.min(last,Math.max(i+1,Math.floor((Math.floor(x(i))+1-left)*span/(pw*step)+(start-skew)/step)));
          if(i===first)ctx.moveTo(x(i),y(values[i]));
          else if(digital)ctx.lineTo(x(i),y(values[i-1]));
          ctx.lineTo(x(i),y(values[i]));
          if(stop>i+1){
            let lo=values[i],hi=lo;for(let j=i+1;j<stop;j++){lo=Math.min(lo,values[j]);hi=Math.max(hi,values[j]);}
            ctx.lineTo(x(i),y(lo));ctx.lineTo(x(i),y(hi));ctx.lineTo(x(stop-1),y(values[stop-1]));
          }
          i=stop;
        }
        ctx.stroke();ctx.restore();
      });
    }
    const observer=new ResizeObserver(draw);observer.observe(canvas);draw();return ()=>observer.disconnect();
  },[frame,fft,specs]);
  return <><div className="plot-wrap"><canvas ref={ref} aria-label={fft?'采集数据频谱':'实际采样波形'}/>{!frame && <div className="plot-empty">等待采集</div>}</div>
    {frame && <div className="measure"><div><small>实际采样率 / 通道</small><b>{format(frame.rate)} S/s</b></div><div><small>帧内样点 / 通道</small><b>{frame.channels[0].length.toLocaleString()}</b></div>
    {metrics.map((m,i)=><div key={i}><small style={{color:colors[i]}}>{names[i]} · {frame.group==='LA'?'高电平占比':'峰峰值'}</small><b>{frame.group==='LA'?format(m.mean*100)+' %':format(m.max-m.min)+' Vpp'}</b></div>)}</div>}
  </>;
}
