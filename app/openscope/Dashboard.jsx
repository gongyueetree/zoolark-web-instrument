'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {TIME_US} from '../../src/openscope/frames.mjs';
import {scopeTrigger} from '../../src/openscope/display.mjs';
import Outputs from './Outputs';
import Plot,{format} from './Plot';
import {BoardScales,DisplayScales,displayMillivolts,zoomOptions} from './ScopeScales';

const names={A12:'示波器 A1/A2',FFT:'频谱',A34:'示波器 A3/A4',LA:'逻辑分析',wav:'信号发生器',pwm:'PWM',dc:'直流输出',battery:'电池'};
const legacy={'oscilloscope':'A12','spectrum-analyzer':'FFT','logic-analyzer':'LA','waveform-generator':'wav','pwm-generator':'pwm','power-supply':'dc'};
const storageKey='zoolark.live.dashboard.v1';
const isScope=kind=>kind==='A12'||kind==='A34';
const defaultScales=[0,0];
function panelWidths(panels){
  // Pair adjacent cards in their saved order. A scope gets two thirds of a
  // mixed row. Equally important instruments split the row evenly.
  const widths=[];
  for(let i=0;i<panels.length;i++){
    const left=panels[i],right=panels[i+1];
    if(left.wide||!right||right.wide){widths.push(6);continue;}
    const a=isScope(left.kind),b=isScope(right.kind);
    widths.push(a===b?3:a?4:2,a===b?3:b?4:2);
    i++;
  }
  return widths;
}
const initial=['A12','wav','FFT'].map((kind,id)=>({id,kind,wide:false,channel:'both'}));
function loadLayout(){
  try{
    const stored=localStorage.getItem(storageKey);
    const list=stored?JSON.parse(stored):JSON.parse(localStorage.getItem('wfl_dashboard_config')||'null')?.panels;
    if(!Array.isArray(list))return initial;
    let single=0;
    return list.map((p,i)=>({id:i,kind:stored?p.kind:legacy[p.type],wide:stored?!!p.wide:p.size==='large',
      zoom:zoomOptions.includes(p.zoom)?p.zoom:1,
      scales:defaultScales.map((_,ch)=>displayMillivolts.includes(p.scales?.[ch])?p.scales[ch]:0),
      channel:stored?(['1','2'].includes(p.channel)?p.channel:'both'):p.channelMode==='single'?String(single++%2+1):'both'}))
      .filter(p=>Object.hasOwn(names,p.kind));
  }catch{return initial;}
}
export default function Dashboard({board,run,td,vd,trigger,onBoardScale,onVerified,cancelRef}){
  const [panels,setPanels]=useState(loadLayout),[add,setAdd]=useState('A12');
  const [captureMode,setCaptureMode]=useState('idle'),[frames,setFrames]=useState({}),[battery,setBattery]=useState(null);
  const capturing=captureMode!=='idle';
  const widths=panelWidths(panels);
  const queue=useRef(Promise.resolve()),alive=useRef(true),controller=useRef(null);
  const configured=useRef(''),dragged=useRef(null),nextId=useRef(Math.max(0,...panels.map(p=>p.id))+1);
  const context=useRef(null);context.current={run,panels,td,vd,trigger,onVerified};
  useEffect(()=>{
    alive.current=true;
    const cancel=()=>{controller.current?.abort();setCaptureMode('idle');};
    cancelRef.current=cancel;
    return ()=>{alive.current=false;controller.current?.abort();if(cancelRef.current===cancel)cancelRef.current=null;};
  },[cancelRef]);
  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(panels));}catch{}},[panels]);
  // One transaction owns CDC, including its reply. A panel write may switch
  // board pages, so the next scope capture must revalidate the hardware state.
  const enqueue=useCallback((job,output=false)=>{
    const task=queue.current.then(async()=>{
      if(!alive.current)return false;
      if(output)configured.current='';
      return context.current.run(job);
    });
    queue.current=task.catch(()=>{});
    return task;
  },[]);
  const outputRun=useCallback(job=>enqueue(job,true),[enqueue]);
  const sample=useCallback(async(signal)=>{
    const {panels,td,vd,trigger}=context.current;
    const kinds=new Set(panels.map(p=>p.kind));
    const next={};
    if(kinds.has('A12')||kinds.has('FFT')){
      const key=td+'/'+vd;
      if(configured.current!==key){
        const actual=await board.scopeSettings(td,vd);
        configured.current=key;
        if(!signal.aborted)context.current.onVerified(actual);
      }
      if(signal.aborted)return;
      const frame=await board.captureScope(td,vd,undefined,signal,trigger.source);
      if(!frame||signal.aborted)return;
      frame.span=TIME_US[td]*4/1e6;frame.trigger=scopeTrigger(frame,trigger,frame.span);
      frame.start=frame.trigger?.start||0;next.A12=frame;next.FFT=frame;
    }
    for(const group of ['A34','LA']){
      if(signal.aborted)return;
      if(kinds.has(group)){
        const f=await board.captureGroup(group,group==='LA'?1000000:50000);
        f.span=f.channels[0].length/f.rate;next[group]=f;
      }
    }
    if(signal.aborted)return;
    if(kinds.has('battery')){
      const b=await board.battery();if(!signal.aborted)setBattery(b);
    }
    if(!signal.aborted)setFrames(old=>({...old,...next}));
  },[board]);
  const hasInput=panels.some(p=>['A12','FFT','A34','LA','battery'].includes(p.kind));
  useEffect(()=>{
    if(captureMode==='idle'||!board)return;
    if(!hasInput){setCaptureMode('idle');return;}
    const c=new AbortController();controller.current=c;
    async function refresh(){
      do{
        const success=await enqueue(()=>c.signal.aborted?undefined:sample(c.signal));
        if(c.signal.aborted)return;
        if(!success||captureMode==='once'){setCaptureMode('idle');return;}
        await new Promise(resolve=>setTimeout(resolve,16));
      }while(!c.signal.aborted);
    }
    void refresh();
    return ()=>{c.abort();if(controller.current===c)controller.current=null;};
  },[captureMode,td,vd,board,hasInput,enqueue,sample]);

  function acquisitionButtons(inScope){
    const available=Boolean(board)&&hasInput;
    return <>
      <button type="button" className={inScope?'scope-run':undefined} disabled={!available}
        onClick={()=>{if(capturing)controller.current?.abort();setCaptureMode(capturing?'idle':'continuous');}}>
        {inScope?(capturing?'停止采集':'开始采集'):(capturing?'停止刷新':'连续刷新')}
      </button>
      <button type="button" disabled={!available||capturing} onClick={()=>setCaptureMode('once')}>
        {inScope?'单次采集':'单次刷新'}
      </button>
    </>;
  }
  function changeBoardScale(nextTd,nextVd){
    controller.current?.abort();
    setFrames(old=>({...old,A12:null,FFT:null}));
    onBoardScale(nextTd,nextVd);
    // A held display needs one new measurement at the new hardware settings.
    // A running display restarts its loop after the old transaction releases CDC.
    if(board&&captureMode==='idle')setCaptureMode('once');
  }
  function reorder(from,to){
    setPanels(old=>{const list=[...old],index=list.findIndex(p=>p.id===from),at=list.findIndex(p=>p.id===to);
      if(index<0||at<0)return old;list.splice(at,0,list.splice(index,1)[0]);return list;});
  }
  function update(id,patch){setPanels(old=>old.map(p=>p.id===id?{...p,...patch}:p));}
  return <section className="live-dashboard">
    <div className="dashbar"><label>添加仪器 <select value={add} onChange={e=>setAdd(e.target.value)}>{Object.entries(names).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>
      <button disabled={['wav','pwm','dc','battery'].includes(add)&&panels.some(p=>p.kind===add)} onClick={()=>setPanels(old=>[...old,{id:nextId.current++,kind:add,wide:false,channel:'both'}])}>添加面板</button>
      {acquisitionButtons(false)}
    </div>
    {!panels.length&&<p>请选择仪器并添加面板。</p>}
    <div className="live-grid">{panels.map((p,index)=><article key={p.id} className={isScope(p.kind)?'scope-card':''} style={{'--panel-span':widths[index]}} aria-label={names[p.kind]+'面板'}
      onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();reorder(dragged.current,p.id);dragged.current=null;}}>
      <header draggable onDragStart={e=>{dragged.current=p.id;e.dataTransfer.setData('text/plain',String(p.id));}}>
        <strong>{names[p.kind]}</strong>
        {isScope(p.kind)&&<div className="scope-actions" role="group" aria-label="示波器采集">{acquisitionButtons(true)}</div>}
        <div className="panel-tools">
          <button title="前移" disabled={!index} onClick={()=>reorder(p.id,panels[index-1].id)}>←</button>
          <button title="后移" disabled={index===panels.length-1} onClick={()=>reorder(p.id,panels[index+1].id)}>→</button>
          <button onClick={()=>update(p.id,{wide:!p.wide})}>{p.wide?'并排':'全宽'}</button>
          <button aria-label={'移除'+names[p.kind]} onClick={()=>setPanels(old=>old.filter(item=>item.id!==p.id))}>×</button>
        </div>
      </header>
      {['wav','pwm','dc'].includes(p.kind)?<div className="board-ui dash-output"><Outputs kind={p.kind} board={board} run={outputRun}/></div>:
        p.kind==='battery'?<p>{battery?format(battery.mv/1000)+' V · '+battery.level+' / 4 格':'等待读取电池'}</p>:<>
          {p.kind!=='LA'&&<div className="dash-scales">
            <label>通道<select aria-label="面板通道" value={p.channel} onChange={e=>update(p.id,{channel:e.target.value})}>
              <option value="both">双通道</option><option value="1">{p.kind==='A34'?'A3':'A1'}</option><option value="2">{p.kind==='A34'?'A4':'A2'}</option>
            </select></label>
            {p.kind==='A12'&&<BoardScales td={td} vd={vd} disabled={!board} onChange={changeBoardScale}/>}
            {isScope(p.kind)&&<DisplayScales aux={p.kind==='A34'} channel={p.channel} scales={p.scales||defaultScales} zoom={p.zoom||1}
              onScales={scales=>update(p.id,{scales})} onZoom={zoom=>update(p.id,{zoom})}/>}
          </div>}
          <Plot frame={frames[p.kind]} fft={p.kind==='FFT'} hideMetrics visible={[p.channel!=='2',p.channel!=='1']}
            viewScales={isScope(p.kind)?p.scales||defaultScales:undefined} zoom={isScope(p.kind)?p.zoom||1:1} emptyText={!board?'请先连接 USB 仪器':capturing?'正在等待采集数据…':isScope(p.kind)?'点击「开始采集」查看波形':'点击「连续刷新」采集数据'}/>
        </>}
    </article>)}</div>
  </section>;
}
