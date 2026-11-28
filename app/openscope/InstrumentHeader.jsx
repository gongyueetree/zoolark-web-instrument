const instruments=[
  {id:'oscilloscope',mode:'A12',label:'示波器',icon:<path d="M3 12 L6 6 L9 18 L12 9 L15 15 L18 3 L21 12" strokeWidth="2"/>},
  {id:'spectrum-analyzer',mode:'FFT',label:'频谱分析',icon:<>
      <rect x="3" y="18" width="3" height="3" fill="currentColor"/>
      <rect x="7" y="14" width="3" height="7" fill="currentColor"/>
      <rect x="11" y="8" width="3" height="13" fill="currentColor"/>
      <rect x="15" y="12" width="3" height="9" fill="currentColor"/>
      <rect x="19" y="6" width="3" height="15" fill="currentColor"/>
    </>},
  {id:'waveform-generator',mode:'wav',label:'信号发生器',icon:<path d="M3 12 Q6 6 9 12 T15 12 Q18 18 21 12" strokeWidth="2"/>},
  {id:'pwm-generator',mode:'pwm',label:'PWM发生器',icon:<path d="M3 12 L3 4 L9 4 L9 20 L15 20 L15 4 L21 4 L21 12" strokeWidth="2"/>},
  {id:'logic-analyzer',mode:'LA',label:'逻辑分析仪',icon:<>
      <rect x="3" y="6" width="4" height="12" strokeWidth="2"/>
      <rect x="10" y="3" width="4" height="12" strokeWidth="2"/>
      <rect x="17" y="9" width="4" height="12" strokeWidth="2"/>
    </>},
  {id:'power-supply',mode:'dc',label:'电源',icon:<path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" strokeWidth="2"/>},
  {id:'network-analyzer',mode:'FRA',label:'网络分析仪',icon:<>
      <path d="M3 20 Q8 15 12 20 T21 20" strokeWidth="2"/>
      <path d="M3 12 L21 12" strokeWidth="1" strokeDasharray="2,2"/>
      <path d="M3 15 L6 12 L9 8 L12 10 L15 6 L18 9 L21 7" strokeWidth="2"/>
    </>},
  {id:'custom-dashboard',mode:'dashboard',label:'自定义仪表板',icon:<>
      <rect x="3" y="3" width="7" height="7" strokeWidth="2"/>
      <rect x="14" y="3" width="7" height="7" strokeWidth="2"/>
      <rect x="3" y="14" width="7" height="7" strokeWidth="2"/>
      <rect x="14" y="14" width="7" height="7" strokeWidth="2"/>
    </>},
  {id:'battery-monitor',mode:'battery',label:'电池',icon:<path d="M3 7h16v10H3zM21 10v4" strokeWidth="2"/>}
];

export function InstrumentHeader({mode,onSelect,children}){
  return <header className="header">
    <div className="logo">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <path d="M5 20 L10 10 L15 25 L20 15 L25 22 L30 8 L35 20" stroke="#00d4ff" strokeWidth="2" fill="none"/>
        <circle cx="20" cy="20" r="18" stroke="#00d4ff" strokeWidth="2" fill="none"/>
      </svg>
      <span className="logo-text">ZooLark View</span>
    </div>
    <nav className="nav-menu" aria-label="仪器">
      {instruments.map(item=>{
        const selected=item.mode===mode||(item.mode==='A12'&&mode==='A34');
        return <button key={item.id} type="button" className={'nav-btn'+(selected?' active':'')}
          data-instrument={item.id} aria-pressed={selected} onClick={()=>onSelect(selected?mode:item.mode)}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">{item.icon}</svg>
          {item.label}
        </button>;
      })}
    </nav>
    <div className="header-actions"><div id="board-header">{children}</div></div>
  </header>;
}

export function DisplayActions({onDownload,onFullscreen}){
  return <div className="display-actions">
    <button className="icon-btn" id="screenshot-btn" onClick={()=>onDownload(true)} title="截图">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2"/>
        <circle cx="12" cy="12" r="4" strokeWidth="2"/>
      </svg>
    </button>
    <button className="icon-btn" id="export-btn" onClick={()=>onDownload(false)} title="导出数据">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeWidth="2"/>
      </svg>
    </button>
    <button className="icon-btn" id="fullscreen-btn" onClick={onFullscreen} title="全屏">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" strokeWidth="2"/>
      </svg>
    </button>
  </div>;
}
