'use client';
import {useState,useRef,useEffect} from 'react';
import {Instrument,USB} from '../../src/openscope/instrument.mjs';
import {SerialLink} from '../../src/openscope/serial.mjs';
import {TIME_US,VDIV_MV} from '../../src/openscope/frames.mjs';
import {triggerStart} from '../../src/openscope/display.mjs';
import Plot,{timeLabel,format} from './Plot';
import Outputs from './Outputs';
import './scope.css';

const modes={A12:'示波器 A1/A2',A34:'示波器 A3/A4',FFT:'频谱',LA:'逻辑分析',FRA:'频响',wav:'WAV',pwm:'PWM',dc:'DC',battery:'电池'};
const traces=['A12','A34','FFT','LA'];
const pinout=[
  ['1 / 3','A1 / A2','MAX1193 · 8 位双通道','2 / 4'],
  ['5 / 7','A3 / A4','GPIO44 / 43 · ADC4 / ADC3','6 / 8'],
  ['9 / 11 / 13','PWM / WAV / DC','三路独立输出','10 / 12 / 14'],
  ['15 / 16 / 17 / 18','D0 / D1 / D2 / D3','GPIO18 / 17 / 20 / 19','20'],
];
export default function OpenScope(){
  const [board,setBoard]=useState(null),[identity,setIdentity]=useState(null),[msg,setMsg]=useState(''),[error,setError]=useState(false);
  const [connection,setConnection]=useState({text:'',failed:false});
  const [busy,setBusy]=useState(false),[acquiring,setAcquiring]=useState(false),[mode,setMode]=useState('A12');
  const [td,setTd]=useState(6),[vd,setVd]=useState(4),[rate,setRate]=useState(50000),[laRate,setLaRate]=useState(1000000);
  const [source,setSource]=useState(0),[edge,setEdge]=useState('rise'),[level,setLevel]=useState('0');
  const [frame,setFrame]=useState(null),[battery,setBattery]=useState(null),[freq,setFreq]=useState('1000'),[fra,setFra]=useState([]);
  const owner=useRef(null),lock=useRef(false),generation=useRef(0),active=useRef(null);
  const plot=traces.includes(mode), primary=mode==='A12'||mode==='FFT';
  function message(text,isError=false){setMsg(text);setError(isError);}
  function clearDevice(){setBoard(null);setIdentity(null);setFrame(null);setBattery(null);setFra([]);}
  function drop(text,isError){
    generation.current++;active.current?.abort();active.current=null;lock.current=false;
    setBusy(false);setAcquiring(false);clearDevice();message('');setConnection({text,failed:isError});
  }
  async function disconnect(){
    const link=owner.current;
    drop('连接已断开。重新连接后将再次读取板端状态。',false);
    if(link){lock.current=true;setBusy(true);await link.close();if(owner.current===link){owner.current=null;lock.current=false;setBusy(false);}}
  }
  useEffect(()=>{
    const unload=()=>{active.current?.abort();void owner.current?.close();};
    window.addEventListener('pagehide',unload);
    return ()=>{window.removeEventListener('pagehide',unload);generation.current++;unload();};
  },[]);
  async function run(job){
    if(lock.current)return;
    const gen=generation.current;
    lock.current=true;setBusy(true);message('正在与仪器通信…');
    try{await job();if(gen===generation.current)message('操作完成');}
    catch(e){if(gen===generation.current)message(e.message||String(e),true);}
    finally{if(gen===generation.current){lock.current=false;setBusy(false);}}
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
      setIdentity(info);setBoard(device);setTd(+info.state.TDIV);setVd(+info.state.VDIV);
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
    if(busy || mode===next)return;
    setMode(next);setFrame(null);message('');
  }
  async function acquire(continuous){
    if(lock.current||!board)return;
    const gen=generation.current, abort=new AbortController();
    active.current=abort;setAcquiring(true);setFrame(null);
    await run(async()=>{
      if(primary){
        const state=await board.scopeSettings(td,vd);
        if(gen===generation.current)setIdentity(old=>old && ({...old,state}));
      }
      let lastPercent=-1;
      do{
        if(abort.signal.aborted)break;
        message(primary && TIME_US[td]>5000?'连续采集中…':'正在采集…');
        const f=primary?await board.captureScope(td,vd,fraction=>{
          const n=Math.floor(fraction*100);if(n!==lastPercent && gen===generation.current){lastPercent=n;message('连续采集 '+n+'%');}
        },abort.signal):await board.captureGroup(mode,mode==='LA'?laRate:rate);
        if(!f || abort.signal.aborted || gen!==generation.current)break;
        f.span=primary?4*TIME_US[td]/1e6:f.channels[0].length/f.rate;
        f.start=primary && mode!=='FFT'?triggerStart(f,source,edge,Number(level),f.span):0;
        if(f.start===null)message('等待所选通道越过触发电平…');
        else {setFrame(f);if(!continuous)break;}
        await new Promise(r=>setTimeout(r,100));
      }while(!abort.signal.aborted);
    });
    if(gen===generation.current){active.current=null;setAcquiring(false);}
  }
  async function updateScope(){
    await run(async()=>{
      const actual=await board.scopeSettings(td,vd);setFrame(null);setIdentity(prev=>({...prev,state:actual}));
    });
  }
  async function readScope(){
    await run(async()=>{const s=await board.state();setTd(+s.TDIV);setVd(+s.VDIV);setIdentity(prev=>({...prev,state:s}));setFrame(null);});
  }
  function select(title,value,set,options){
    return <label>{title}<select value={value} onChange={e=>{set(Number(e.target.value));setFrame(null);}}>{options.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>;
  }
  return <main className="openscope">
    <header className="os-header"><div><a href="/" className="back">ZooLark View</a><h1>OpenScope <span>RP2350B</span></h1></div>
      <div className="connection"><span className={board?'online':''}>{board?identity.release+' 已连接':busy?'连接中…':'未连接'}</span><button className="primary" disabled={!board&&busy} onClick={board?disconnect:connect}>{board?'断开 USB':'连接 USB 仪器'}</button></div></header>
    {connection.text&&<div aria-live="polite" className={'notice mono '+(connection.failed?'error':'')}>{connection.text}</div>}
    <div className="bench"><aside><h2>仪器</h2><nav aria-label="实板功能">{Object.entries(modes).map(([id,name])=><button key={id} aria-pressed={mode===id} disabled={busy} onClick={()=>changeMode(id)}>{name}</button>)}</nav></aside>
    <section className="work" aria-label={modes[mode]}>
    {plot?<><div className="title"><h2>{modes[mode]}</h2><small>{mode==='LA'?'J1 · 15–18':mode==='A34'?'J1 · 5 / 7':'J1 · 1 / 3'}</small></div>
      <Plot frame={frame} fft={mode==='FFT'}/>
      <p className="hint">{frame?[frame.quality,mode==='FFT'?'Hann 窗 · 单边线性幅值 / V peak':mode==='LA'?'数字电平':'纵轴 / V','采集序号 '+frame.seq].filter(Boolean).join(' · '):mode==='LA'?'D0–D3 对应 J1 的 15–18 脚，共地使用 0–3.3 V 逻辑。':mode==='A34'?'A3/A4 为交替采样的 12 位单端输入，0–3.3 V。':'A1/A2 共用时基与前端量程。横轴由每帧的实际采样率计算。'}</p>
      <fieldset disabled={!board||busy}><div className="form-grid">
        {primary?<>{select('板端时基 / 格',td,setTd,TIME_US.map((t,i)=>[i,timeLabel(t/1e6)]))}
          {select('板端量程 / 格',vd,setVd,[0,1,2,7,3,4,5,6].map(i=>[i,VDIV_MV[i]+' mV'+(i===7?'（500 mV 档放大）':'')]))}</>:select('请求采样率 / 通道',mode==='LA'?laRate:rate,mode==='LA'?setLaRate:setRate,(mode==='LA'?[100000,250000,1000000]:[10000,50000,100000,250000]).map(v=>[v,v/1000+' kS/s']))}
        {mode==='A12'&&<>{select('软件触发源',source,setSource,[[0,'自由运行'],[1,'A1'],[2,'A2']])}
          {source!==0&&<><label>边沿<select value={edge} onChange={e=>setEdge(e.target.value)}><option value="rise">上升沿</option><option value="fall">下降沿</option></select></label>
          <label>电平 / V<input type="number" step="any" value={level} onChange={e=>setLevel(e.target.value)}/></label></>}</>}
      </div></fieldset>
      <div className="row">{acquiring?<button onClick={()=>active.current?.abort()}>停止采集</button>:<>
        <button className="primary" disabled={!board||busy||(source!==0 && mode==='A12' && level.trim()==='')} onClick={()=>acquire(true)}>连续刷新</button>
        <button disabled={!board||busy||(source!==0 && mode==='A12' && level.trim()==='')} onClick={()=>acquire(false)}>单次采集</button></>}
        {primary&&<><button disabled={!board||busy} onClick={updateScope}>写入时基与量程</button><button disabled={!board||busy} onClick={readScope}>读取板端参数</button></>}
      </div>{primary && identity && <small>最近回读 · {timeLabel(+identity.state.TDIV_US/1e6)}/格 · {identity.state.VIEW_MV} mV/格</small>}</>
    :mode==='FRA'?<><h2>频响测量</h2><p className="muted">将外部正弦源接至被测电路输入，A1 测参考，A2 测响应。每次调好外部源后采集一个频点，使用相同的前端量程。</p>
      <fieldset disabled={!board||busy}><label>外部源频率 / Hz<input type="number" min="1000" max="20000" value={freq} onChange={e=>setFreq(e.target.value)}/></label>
      <button className="primary" onClick={()=>run(async()=>{const point=await board.fra(Number(freq));setFra(old=>[...old.filter(p=>p.request!==Number(freq)),{...point,request:Number(freq)}].sort((a,b)=>a.request-b.request));})}>采集频点</button></fieldset>
      {fra.length>0&&<table><thead><tr><th>设定频率</th><th>实测频率</th><th>A2/A1 增益（未校准）</th></tr></thead><tbody>{fra.map(p=><tr key={p.request}><td>{p.request} Hz</td><td>{format(p.hz)} Hz</td><td>{format(p.gain)} dB</td></tr>)}</tbody></table>}</>
    :mode==='battery'?<><h2>电池监测</h2><p className="muted">读取 GPIO47 / ADC7 的板端分压采样与电量档位。</p><button className="primary" disabled={!board||busy} onClick={()=>run(async()=>setBattery(await board.battery()))}>读取电池</button>
      {battery&&<div className="readback"><h3>板端电池读数</h3><b>{battery.mv/1000} V · {battery.level} / 4 格</b><p>{battery.cal}</p></div>}</>
    :<Outputs key={mode+String(!!board)} kind={mode} board={board} run={run} busy={busy}/>}
    {msg&&<div role="status" className={'notice '+(error?'error':'')}>{msg}</div>}</section></div>
    <details className="pins"><summary>接线与设备身份</summary><p>使用 USB 数据线连接 J3，关闭占用串口的桌面上位机。支持 HW2.1 R144 和 R149 固件。</p>
      <table><thead><tr><th>J1 引脚</th><th>信号</th><th>硬件路径</th><th>J1 地线</th></tr></thead><tbody>{pinout.map(r=><tr key={r[0]}>{r.map(v=><td key={v}>{v}</td>)}</tr>)}</tbody></table>
      {identity&&<p className="mono">{identity.id}<br/>{identity.build}</p>}</details>
  </main>;
}
