'use client';
import {memo,useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {DashboardSampler} from '../../src/openscope/dashboard-capture.mjs';
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
// Only traces subscribe to new samples. An oscilloscope frame should never
// cause an unchanged generator editor or its SVG preview to render.
class FrameFeed {
  frames={};
  listeners=new Set();
  received=0;
  painted=0;
  subscribe=fn=>{this.listeners.add(fn);return ()=>this.listeners.delete(fn);};
  publish(updates){
    Object.assign(this.frames,updates);
    for(const notify of this.listeners)notify();
  }
  countPaint=frame=>{
    if(frame===this.frames.A12&&frame!==this.lastPaint){this.lastPaint=frame;this.painted++;}
  };
}
const visibility={both:[true,true],1:[true,false],2:[false,true]};
const DashboardTrace=memo(function DashboardTrace({feed,panel,emptyText}){
  const kind=panel.kind==='FFT'?'A12':panel.kind;
  const frame=useSyncExternalStore(feed.subscribe,()=>feed.frames[kind]||null,()=>null);
  return <Plot frame={frame} scopeGroup={isScope(panel.kind)?panel.kind:undefined} fft={panel.kind==='FFT'} hideMetrics deferOffscreen
    visible={visibility[panel.channel]} viewScales={isScope(panel.kind)?panel.scales||defaultScales:undefined}
    zoom={isScope(panel.kind)?panel.zoom||1:1} onPaint={kind==='A12'?feed.countPaint:undefined} emptyText={emptyText}/>;
});
function FrameRates({feed}){
  const [rates,setRates]=useState(null);
  useEffect(()=>{
    let at=performance.now(),rx=feed.received,draw=feed.painted;
    const timer=setInterval(()=>{
      const now=performance.now(),seconds=(now-at)/1000;
      setRates([Math.round((feed.received-rx)/seconds),Math.round((feed.painted-draw)/seconds)]);
      at=now;rx=feed.received;draw=feed.painted;
    },1000);
    return ()=>clearInterval(timer);
  },[feed]);
  return <small>A1/A2 接收 {rates?.[0]??'—'} 帧/s · 绘制 {rates?.[1]??'—'} 帧/s</small>;
}
export default function Dashboard({toolbarHost,board,run,td,vd,trigger,onBoardScale,onVerified,cancelRef}){
  const [panels,setPanels]=useState(loadLayout),[add,setAdd]=useState('A12');
  const [captureMode,setCaptureMode]=useState('idle'),[battery,setBattery]=useState(null);
  const [feed]=useState(()=>new FrameFeed());
  const sampler=useMemo(()=>board&&new DashboardSampler(board),[board]);
  const turn=useRef(null);
  const capturing=captureMode!=='idle';
  const widths=panelWidths(panels);
  const queue=useRef(Promise.resolve()),alive=useRef(true),controller=useRef(null);
  const dragged=useRef(null),nextId=useRef(Math.max(0,...panels.map(p=>p.id))+1);
  const context=useRef(null);context.current={run,trigger,onVerified};
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
    if(output)turn.current?.abort();
    const task=queue.current.then(async()=>{
      if(!alive.current)return false;
      if(output&&sampler)sampler.settings=null;
      return context.current.run(job);
    });
    queue.current=task.catch(()=>{});
    return task;
  },[sampler]);
  const outputRun=useCallback(job=>enqueue(job,true),[enqueue]);
  const primary=panels.some(p=>p.kind==='A12'||p.kind==='FFT');
  const aux=panels.some(p=>p.kind==='A34'),logic=panels.some(p=>p.kind==='LA'),batteryPanel=panels.some(p=>p.kind==='battery');
  const secondary=useMemo(()=>{
    const groups=[];
    if(aux)groups.push('A34');
    if(logic)groups.push('LA');
    if(batteryPanel)groups.push('battery');
    return groups;
  },[aux,logic,batteryPanel]);
  const hasInput=primary||secondary.length>0;
  useEffect(()=>{
    if(captureMode==='idle'||!sampler)return;
    if(!hasInput){setCaptureMode('idle');return;}
    const session=new AbortController();controller.current=session;
    const continuous=captureMode==='continuous';
    let pending={},paint=0,wake;
    function publish(){
      paint=0;
      if(session.signal.aborted)return;
      const f=pending.A12;
      if(f){
        f.span=TIME_US[td]*4/1e6;
        f.trigger=scopeTrigger(f,context.current.trigger,f.span);
        f.start=f.trigger?.start||0;
      }
      feed.publish(pending);pending={};
    }
    function onFrame(f){
      if(session.signal.aborted)return;
      if(f.group==='A12')feed.received++;
      else f.span=f.channels[0].length/f.rate;
      pending[f.group]=f;
      if(!continuous)publish();
      else if(!paint)paint=requestAnimationFrame(publish);
    }
    async function refresh(){
      do{
        // Register before enqueue: an output click can interrupt a turn that
        // is still in the queue as well as one already receiving frames.
        const batch=new AbortController();turn.current=batch;
        let delay=0;
        const success=await enqueue(async()=>{
          if(batch.signal.aborted||session.signal.aborted)return;
          delay=await sampler.capture({primary,secondary,continuous,td,vd,source:context.current.trigger.source},
            batch.signal,{onFrame,onBattery:setBattery,onSettings:state=>context.current.onVerified(state)});
        });
        if(turn.current===batch)turn.current=null;
        if(session.signal.aborted)return;
        if(!success||(!continuous&&!batch.signal.aborted)){setCaptureMode('idle');return;}
        if(delay>0)await new Promise(resolve=>{
          const timer=setTimeout(resolve,delay);
          wake=()=>{clearTimeout(timer);resolve();};
        });
      }while(!session.signal.aborted);
    }
    const stop=()=>{turn.current?.abort();if(paint)cancelAnimationFrame(paint);wake?.();};
    session.signal.addEventListener('abort',stop,{once:true});
    void refresh();
    return ()=>{session.abort();if(controller.current===session)controller.current=null;};
  },[captureMode,sampler,td,vd,primary,secondary,hasInput,enqueue,feed]);

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
    feed.publish({A12:null});
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
    {createPortal(<div className="dashbar" role="group" aria-label="仪表板工具"><b>自定义仪表板</b><label>添加仪器 <select value={add} onChange={e=>setAdd(e.target.value)}>{Object.entries(names).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>
      <button disabled={['wav','pwm','dc','battery'].includes(add)&&panels.some(p=>p.kind===add)} onClick={()=>setPanels(old=>[...old,{id:nextId.current++,kind:add,wide:false,channel:'both'}])}>添加面板</button>
      {acquisitionButtons(false)}
      {captureMode==='continuous'&&primary&&<FrameRates feed={feed}/>}
    </div>,toolbarHost)}
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
          <DashboardTrace feed={feed} panel={p} emptyText={!board?'请先连接 USB 仪器':capturing?'正在等待采集数据…':isScope(p.kind)?'点击「开始采集」查看波形':'点击「连续刷新」采集数据'}/>
        </>}
    </article>)}</div>
  </section>;
}
