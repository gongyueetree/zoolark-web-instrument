'use client';
import {useState,useRef,useEffect,useCallback} from 'react';
import {InstrumentHeader,DisplayActions} from './InstrumentHeader';
import {Instrument,USB} from '../../src/openscope/instrument.mjs';
import {SerialLink} from '../../src/openscope/serial.mjs';
import {TIME_US,VDIV_MV} from '../../src/openscope/frames.mjs';
import {scopeTrigger,averageWindows,stats} from '../../src/openscope/display.mjs';
import Plot,{timeLabel,format} from './Plot';
import Outputs from './Outputs';
import {FraControls,FraResults,downloadFra} from './FrequencyResponse';
import {checkFraHz,externalPoint,InvalidFraPoint,measureWithWav,sweepTargets} from '../../src/openscope/fra.mjs';
import Quantity from './Quantity';
import Dashboard from './Dashboard';
import {BoardScales,DisplayScales} from './ScopeScales';
import './scope.css';

const modes={dashboard:'自定义仪表板',A12:'示波器 A1/A2',A34:'示波器 A3/A4',FFT:'频谱',LA:'逻辑分析',FRA:'频响',wav:'WAV',pwm:'PWM',dc:'DC',battery:'电池'};
const traces=['A12','A34','FFT','LA'];
export default function Bench(){
  const [screen,setScreen]=useState(null),[toolbar,setToolbar]=useState(null),[measureHost,setMeasureHost]=useState(null);
  const displayArea=useRef(null);
  const [visible,setVisible]=useState([true,true]),[sideFFT,setSideFFT]=useState(false);
  const nextMode=useRef(null),dashboardCancel=useRef(null);
  const [board,setBoard]=useState(null),[identity,setIdentity]=useState(null),[msg,setMsg]=useState(''),[error,setError]=useState(false);
  const [connection,setConnection]=useState({text:'',failed:false});
  const [busy,setBusy]=useState(false),[acquiring,setAcquiring]=useState(false),[mode,setMode]=useState('A12');
  const [td,setTd]=useState(6),[vd,setVd]=useState(4),[rate,setRate]=useState(50000),[laRate,setLaRate]=useState(1000000);
  const [auxScales,setAuxScales]=useState([0,0]),[auxZoom,setAuxZoom]=useState(1);
  const auxMode=mode==='A34';
  const [fps,setFps]=useState(null);
  const cadence=useRef(null);
  const countPaint=useCallback(()=>{
    const meter=cadence.current;
    if(!meter)return;
    meter.frames++;
    const now=performance.now();
    if(now-meter.since>=1000){
      setFps(Math.round(meter.frames*1000/(now-meter.since)));
      cadence.current={frames:0,since:now};
    }
  },[]);
  const scaleRequest=useRef({td,vd}),segment=useRef(null);
  function requestScale(nextTd,nextVd){
    scaleRequest.current={td:nextTd,vd:nextVd};
    setTd(nextTd);setVd(nextVd);setFrame(null);setTriggerStatus('');
    segment.current?.abort();
  }
  const [trigger,setTrigger]=useState({source:'board',edge:'rise',level:'0',average:1});
  const [triggerStatus,setTriggerStatus]=useState('');
  const triggerRef=useRef(trigger);
  const [frame,setFrame]=useState(null),[battery,setBattery]=useState(null),[fraSource,setFraSource]=useState('auto'),[fra,setFra]=useState([]);
  const owner=useRef(null),lock=useRef(false),generation=useRef(0),active=useRef(null);
  const fraJob=useRef(null);
  const plot=traces.includes(mode), primary=mode==='A12'||mode==='FFT';
  function message(text,isError=false){setMsg(text);setError(isError);}
  function clearDevice(){setBoard(null);setIdentity(null);setFrame(null);setBattery(null);setFra([]);setTriggerStatus('');}
  function drop(text,isError){
    if(fraJob.current){
      fraJob.current.controller.abort();
      if(isError&&fraJob.current.wav)text+='。USB 已中断，请在仪器上确认 WAV 输出状态。';
      fraJob.current=null;
    }
    generation.current++;active.current?.abort();active.current=null;nextMode.current=null;lock.current=false;
    setBusy(false);setAcquiring(false);clearDevice();message('');setConnection({text,failed:isError});
  }
  async function disconnect(){
    const link=owner.current;
    const job=fraJob.current;
    if(job){job.controller.abort();await job.done;}
    if(link!==owner.current)return;
    drop('连接已断开。重新连接后将再次读取板端状态。',false);
    if(link){lock.current=true;setBusy(true);await link.close();if(owner.current===link){owner.current=null;lock.current=false;setBusy(false);}}
  }
  useEffect(()=>{
    const unload=()=>{fraJob.current?.controller.abort();active.current?.abort();void owner.current?.close();};
    window.addEventListener('pagehide',unload);
    return ()=>{window.removeEventListener('pagehide',unload);generation.current++;unload();};
  },[]);
  async function run(job){
    if(lock.current)return;
    const gen=generation.current;
    lock.current=true;setBusy(true);message('正在与仪器通信…');
    try{await job();if(gen===generation.current)message('操作完成');return gen===generation.current;}
    catch(e){if(gen===generation.current)message(e.message||String(e),true);}
    finally{if(gen===generation.current){lock.current=false;setBusy(false);
      if(!active.current && nextMode.current){setMode(nextMode.current);nextMode.current=null;setFrame(null);message('');}
    }}
  }
  async function connect(){
    if(lock.current)return;
    const generationAtOpen=generation.current;
    let link,ready=false,stage='';
    const report=text=>{
      stage=text;
      if(generationAtOpen===generation.current)setConnection({text,failed:false});
    };
    lock.current=true;setBusy(true);message('');
    try{
      report('选择 USB 仪器串口');
      if(!window.isSecureContext || !navigator.serial)throw new Error('请在桌面 Chrome 或 Edge 中，通过 HTTPS 或 localhost 打开此页。');
      let port;
      try {port=await navigator.serial.requestPort({filters:[USB]});}
      catch(e){if(e.name==='NotFoundError')throw new Error('未选择仪器。请确认使用 USB 数据线，并在仪器完成启动后重试。');throw e;}
      if(generationAtOpen!==generation.current)return;
      report('打开 USB 串口');
      link=new SerialLink(port,e=>{
        if(ready && owner.current===link)drop('串口中断 · '+e.message,true);
      });
      owner.current=link;
      const device=new Instrument(link);
      await link.open();
      const info=await device.identify(report);
      if(generationAtOpen!==generation.current)return;
      ready=true;
      setIdentity(info);setBoard(device);requestScale(+info.state.TDIV,+info.state.VDIV);
      setConnection({text:'',failed:false});
    }catch(e){
      if(generationAtOpen===generation.current)setConnection({text:stage+' · '+(e.message||String(e)),failed:true});
    }finally{
      if(link && !ready){
        await link.close();
        if(owner.current===link)owner.current=null;
      }
      if(generationAtOpen===generation.current){lock.current=false;setBusy(false);}
    }
  }
  function changeMode(next){
    if(mode===next)return;
    if(fraJob.current){nextMode.current=next;fraJob.current.controller.abort();return;}
    if(active.current){nextMode.current=next;active.current.abort();return;}
    if(lock.current){if(mode==='dashboard'){nextMode.current=next;dashboardCancel.current?.();}return;}
    setMode(next);setFrame(null);setTriggerStatus('');message('');
  }
  async function startFra({freq,low,high,count,sweep=false}){
    if(!board||lock.current)return;
    const wav=fraSource==='wav',controller=new AbortController(),signal=controller.signal;
    const job={controller,wav},gen=generation.current;
    fraJob.current=job;
    const save=p=>{
      if(gen!==generation.current||signal.aborted)return;
      setFra(previous=>[...previous.filter(row=>row.target!==p.target),p].sort((a,b)=>a.target-b.target));
    };
    job.done=run(async()=>{
      try{
        if(wav){
          const targets=sweep?sweepTargets(Number(low),Number(high),Number(count)):[checkFraHz(Number(freq),true)];
          if(sweep)setFra([]);
          let valid=0;
          await measureWithWav(board,targets,signal,p=>{save(p);if(p.gain!=null)valid++;},
            (hz,i)=>message('正在测量 '+(i+1)+' / '+targets.length+' · '+hz+' Hz'));
          if(!valid)throw new Error('没有有效频点，请查看各点的板端测量结果');
        }else{
          const auto=fraSource==='auto';
          message(auto?'正在识别 A1 参考频率…':'正在采集指定频点…');
          try{save(await externalPoint(board,Number(freq),auto,signal));}
          catch(e){
            if(!auto&&e instanceof InvalidFraPoint)save({target:Number(freq),hz:e.actual,gain:null,phase:null,reason:e.message});
            throw e;
          }
        }
      }catch(e){
        if(e.name==='AbortError')throw new Error('测量已停止');
        throw e;
      }finally{if(fraJob.current===job)fraJob.current=null;}
    });
    await job.done;
  }
  function changeTrigger(key,value){
    const next={...triggerRef.current,[key]:value};
    triggerRef.current=next;setTrigger(next);setTriggerStatus('');setFrame(null);
  }
  async function acquire(continuous){
    if(lock.current||!board)return;
    const gen=generation.current, abort=new AbortController();
    active.current=abort;setAcquiring(true);setFrame(null);setTriggerStatus('');
    await run(async()=>{
      let previousChannel,previousSettings,average;
      cadence.current={frames:0,since:performance.now()};
      setFps(null);
      function publish(f,config){
        if(abort.signal.aborted || gen!==generation.current || (primary&&scaleRequest.current!==config))return false;
        const settings=triggerRef.current;
        if(settings!==previousSettings){previousChannel=undefined;average=null;previousSettings=settings;}
        f.span=primary?4*TIME_US[config.td]/1e6:f.channels[0].length/f.rate;
        if(mode==='A12'){
          const follow=settings.source==='board',modeLabel=follow?'板端 '+['AUTO','A1','A2'][f.boardSource]:'手动 A'+settings.source;
          if(follow&&f.boardSource==null)return false;
          f.trigger=scopeTrigger(f,settings,f.span,previousChannel);
          if(f.trigger){
            previousChannel=f.trigger.source;f.start=f.trigger.start;
            let status=modeLabel+' · 已触发 A'+f.trigger.source+' '+(settings.edge==='rise'?'↑':'↓')+' '+format(f.trigger.level)+' V';
            if(settings.average>1){
              average=averageWindows(average,f,settings.average);
              status+=' · 平均 '+average.count+'/'+settings.average;
              f.channels=average.channels;f.start=0;f.skew=[0,0];
              setTriggerStatus(status);
              if(!continuous&&average.count<settings.average)return false;
            }else setTriggerStatus(status);
          }else if(settings.source==='free')setTriggerStatus('自由运行');
          else{
            average=null;
            const free=follow&&continuous;
            setTriggerStatus(modeLabel+(free?' · 未触发，自由刷新':' · 等待触发'));
            if(!free)return false;
          }
        }
        setFrame(f);
        return true;
      }
      let applied;
      do{
        const config=scaleRequest.current;
        const batch=new AbortController();segment.current=batch;
        const cancel=()=>batch.abort();
        abort.signal.addEventListener('abort',cancel,{once:true});
        try{
          if(primary && applied!==config){
            const state=await board.scopeSettings(config.td,config.vd);
            if(gen!==generation.current || batch.signal.aborted)continue;
            setIdentity(old=>old&&({...old,state}));applied=config;average=null;previousChannel=undefined;
          }
          if(batch.signal.aborted)continue;
          message('正在采集…');
          const source=mode==='A12'?triggerRef.current.source:'free';
          const streaming=primary && continuous && TIME_US[config.td]<=5000;
          const result=primary?await board.captureScope(config.td,config.vd,fraction=>{
            if(!batch.signal.aborted)message('连续采集 '+Math.floor(fraction*100)+'%');
          },batch.signal,source,streaming?f=>publish(f,config):undefined)
            :await board.captureGroup(mode,mode==='LA'?laRate:rate);
          if(result && !batch.signal.aborted && publish(result,config) && !continuous)break;
        }finally{
          abort.signal.removeEventListener('abort',cancel);if(segment.current===batch)segment.current=null;
        }
      }while(!abort.signal.aborted && gen===generation.current);
    });
    if(gen===generation.current){
      cadence.current=null;active.current=null;setAcquiring(false);
      if(nextMode.current){setMode(nextMode.current);nextMode.current=null;setFrame(null);setTriggerStatus('');message('');}
    }
  }
  async function updateScope(){
    await run(async()=>{
      const actual=await board.scopeSettings(td,vd);setFrame(null);setIdentity(prev=>({...prev,state:actual}));
    });
  }
  async function autoScale(){
    if(!frame)return;
    const peaks=frame.channels.filter((_,i)=>visible[i]).map(ch=>{const {min,max}=stats(ch);return Math.max(Math.abs(min),Math.abs(max));});
    if(!peaks.length)return;
    const range=[0,1,2,7,3,4,5,6].find(i=>VDIV_MV[i]>=Math.max(...peaks)*1000/3.5)??6;
    requestScale(td,range);
    if(active.current)return;
    await run(async()=>{
      const actual=await board.scopeSettings(td,range);
      setVd(+actual.VDIV);setIdentity(prev=>({...prev,state:actual}));setFrame(null);setTriggerStatus('');
    });
  }
  async function readScope(){
    await run(async()=>{const s=await board.state();requestScale(+s.TDIV,+s.VDIV);setIdentity(prev=>({...prev,state:s}));setFrame(null);});
  }
  function select(title,value,set,options){
    return <label>{title}<select value={value} onChange={e=>{set(Number(e.target.value));setFrame(null);}}>{options.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>;
  }
  async function toggleFullscreen(){
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await displayArea.current.requestFullscreen();
    }catch{message('浏览器未能切换全屏。',true);}
  }
  function download(asImage){
    if(mode==='FRA'){
      try{downloadFra(fra,screen.querySelector('.fra-chart'),asImage);}
      catch(e){message(e.message,true);}
      return;
    }
    if(!frame||!plot){message('请先采集一帧数据。');return;}
    const a=document.createElement('a');
    if(asImage){
      a.href=screen.querySelector('canvas').toDataURL('image/png');a.download=mode+'-capture.png';
    }else{
      const parts=['channel,time_s,'+(mode==='LA'?'logic':'volts')+'\n'];
      frame.channels.forEach((ch,i)=>{
        const name=mode==='LA'?'D'+i:'A'+(i+(mode==='A34'?3:1));
        for(let start=0;start<ch.length;start+=4096){
          const lines=[];
          for(let j=start;j<Math.min(start+4096,ch.length);j++)lines.push([name,j/frame.rate+frame.skew[i],ch[j]].join(','));
          parts.push(lines.join('\n')+'\n');
        }
      });
      a.href=URL.createObjectURL(new Blob(parts,{type:'text/csv'}));a.download=mode+'-samples.csv';
    }
    a.click();if(!asImage)setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  const scopeControls=<>
      {(mode==='A12'||mode==='A34')&&<label>输入通道组<select value={mode} onChange={e=>changeMode(e.target.value)}><option value="A12">A1 / A2 · MAX1193</option><option value="A34">A3 / A4 · ADC</option></select></label>}
      {mode!=='LA'&&<div className="channel-controls">{visible.map((v,i)=><label key={i} style={{color:i?'#00d4ff':'#ffc107'}}><input type="checkbox" checked={v} onChange={()=>setVisible(visible.map((x,j)=>j===i?!x:x))}/> CH{i+1+(mode==='A34'?2:0)}</label>)}</div>}
      <fieldset disabled={!board||(busy&&!(primary&&acquiring))}><div className="form-grid">
        {primary?<BoardScales td={td} vd={vd} onChange={requestScale}/>:select('请求采样率 / 通道',mode==='LA'?laRate:rate,mode==='LA'?setLaRate:setRate,(mode==='LA'?[100000,250000,1000000]:[10000,50000,100000,250000]).map(v=>[v,v/1000+' kS/s']))}
      </div></fieldset>
      {auxMode&&<div className="form-grid aux-scales">
        <DisplayScales aux scales={auxScales} zoom={auxZoom} onScales={setAuxScales} onZoom={setAuxZoom}/>
      </div>}
      {mode==='A12'&&<fieldset disabled={!board||(busy&&!acquiring)}><div className="form-grid">
        <div className="trigger-row">
          <label>触发源<select aria-label="软件触发源" value={trigger.source} onChange={e=>changeTrigger('source',e.target.value)}>
            <option value="board" title="跟随板端触发源，自动计算电平">跟随板端</option><option value="1">A1</option><option value="2">A2</option><option value="free">自由运行</option>
          </select></label>
          {trigger.source!=='free'&&<label>边沿<select value={trigger.edge} onChange={e=>changeTrigger('edge',e.target.value)}><option value="rise">上升沿</option><option value="fall">下降沿</option></select></label>}
          {['1','2'].includes(trigger.source)&&<Quantity title="电平" value={trigger.level} onChange={v=>changeTrigger('level',String(v))}/>}
        </div>
        {trigger.source!=='free'&&<label>平均次数<select value={trigger.average} onChange={e=>changeTrigger('average',Number(e.target.value))}>{[1,2,4,8,16,32].map(n=><option key={n} value={n}>{n===1?'关闭':n+' 次'}</option>)}</select></label>}
      </div></fieldset>}
      <div className="row">{acquiring?<button onClick={()=>active.current?.abort()}>停止采集</button>:<>
        <button className="primary" disabled={!board||busy} onClick={()=>acquire(true)}>运行</button>
        <button disabled={!board||busy} onClick={()=>acquire(false)}>单次</button></>}
        {primary&&<><button disabled={!board||(busy&&!acquiring)||!frame||!visible.some(Boolean)} onClick={autoScale}>自动缩放</button><button disabled={!board||busy} onClick={updateScope}>写入时基与量程</button><button disabled={!board||busy} onClick={readScope}>读取板端参数</button></>}
      </div></>;
  const scopeScreen=<>
    <Plot frame={frame} scopeGroup={mode==='A12'||auxMode?mode:undefined} onPaint={countPaint} fft={mode==='FFT'} viewScales={auxMode?auxScales:undefined} zoom={auxMode?auxZoom:1} visible={visible} emptyText={board?(acquiring?'正在等待实板采集…':'点击左侧「运行」或「单次」开始采集'):'连接 USB 仪器后可采集波形'} measureHost={measureHost}/>
    {mode==='A12'&&<div className="fft-container"><label>FFT 频谱分析 <input type="checkbox" checked={sideFFT} onChange={e=>setSideFFT(e.target.checked)}/></label>{sideFFT&&<Plot frame={frame} fft visible={visible} hideMetrics/>}</div>}
  </>;
  const otherControls=mode==='dashboard'?<p>在同一屏添加仪器。示波器和频谱共用一帧采样。</p>:mode==='FRA'?<FraControls
    source={fraSource} onSource={value=>{setFraSource(value);setFra([]);message('');}} board={board} busy={busy}
    running={!!fraJob.current} start={startFra} stop={()=>fraJob.current?.controller.abort()}/>
    :mode==='battery'?<button className="primary" disabled={!board||busy} onClick={()=>run(async()=>setBattery(await board.battery()))}>读取电池</button>
    :<Outputs key={mode+String(!!board)} kind={mode} board={board} run={run} busy={busy} displayHost={screen}/>;
  return <div className="container">
    <InstrumentHeader mode={mode} onSelect={changeMode}>
      <span className="board-link-state" title={board?identity.release:undefined}>{board?'Zoolark Pro 已连接':busy?'连接中…':'未连接'}</span>
      <button className="connect-btn" disabled={!board&&busy} onClick={board?disconnect:connect}>{board?'断开 USB':'连接 USB 仪器'}</button>
    </InstrumentHeader>
    <main className="main-content">
      <aside className="control-panel"><div id="board-controls">
        <div className="panel-section board-ui"><h3 className="panel-title">控制</h3>
          {plot?scopeControls:otherControls}
          {connection.text&&<div role="alert" className={'notice '+(connection.failed?'error':'')}>{connection.text}</div>}
          {msg&&<div role="status" className={'notice '+(error?'error':'')}>{msg}</div>}
        </div>
        {plot&&<div className="panel-section"><h3 className="panel-title">测量</h3><div className="board-metrics" ref={setMeasureHost}/></div>}
      </div></aside>
      <section className="display-area" ref={displayArea}>
        <div className="display-header">
          <div className="display-info"><div id="board-scale" ref={setToolbar}>
            {mode!=='dashboard'&&<>{plot&&primary?<><span className="channel-indicator ch1">CH1 · {identity?.state.VIEW_MV||VDIV_MV[vd]} mV/div</span><span className="channel-indicator ch2">CH2 · {identity?.state.VIEW_MV||VDIV_MV[vd]} mV/div</span><span>时基 {timeLabel((identity?.state.TDIV_US||TIME_US[td])/1e6)}/div</span></>:<b>{modes[mode]}</b>}
              {mode==='A12'&&<span>{triggerStatus}</span>}</>}
          </div></div>
          <DisplayActions onDownload={download} onFullscreen={toggleFullscreen}/>
        </div>
        <div id="board-screen" ref={setScreen}>
          {plot?scopeScreen:mode==='dashboard'&&toolbar?<Dashboard key={String(!!board)} toolbarHost={toolbar} board={board} run={run} td={td} vd={vd} trigger={trigger} onBoardScale={requestScale} onVerified={state=>setIdentity(old=>old&&({...old,state}))} cancelRef={dashboardCancel}/>:mode==='FRA'?<FraResults rows={fra}/>
            :mode==='battery'?<div className="board-card"><h2>电池监测</h2><p>{battery?battery.mv/1000+' V · '+battery.level+' / 4 格':'等待读取电池'}</p></div>:null}
        </div>
      </section>
    </main>
    <footer className="status-bar"><div id="board-footer">
      <b>OpenScope RP2350B</b><span>USB CDC</span>{frame&&<span>{format(frame.rate)} S/s</span>}<span>{frame?.quality}</span>{plot&&acquiring&&fps!==null&&<span>显示 {fps} 帧/s</span>}
    </div></footer>
  </div>;
}
