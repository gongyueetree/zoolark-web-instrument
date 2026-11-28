import {TIME_US} from './frames.mjs';

// The firmware accepts snapshot commands only between streams. Keep RAW2 open
// while the output panels and FFT are only displaying local data.
const intervalMs={A34:250,LA:250,battery:2000};
export class DashboardSampler {
  constructor(board,now=()=>performance.now()){
    this.board=board;
    this.now=now;
    this.due={A34:0,LA:0,battery:0};
    this.settings=null;
  }
  async capture({primary,secondary,continuous,td,vd,source},signal,{onFrame,onBattery,onSettings}){
    if(signal.aborted)return;
    if(primary){
      if(this.settings!==td+'/'+vd){
        // A scale change can reach the board before a fast second edit cancels
        // this turn. The old setting must not authorize the next capture.
        this.settings=null;
        const state=await this.board.scopeSettings(td,vd);
        if(signal.aborted)return;
        this.settings=td+'/'+vd;
        onSettings(state);
      }
      if(continuous&&TIME_US[td]<=5000){
        const stream=new AbortController();
        const stop=()=>stream.abort();
        signal.addEventListener('abort',stop,{once:true});
        try{
          await this.board.captureScope(td,vd,undefined,stream.signal,source,frame=>{
            if(stream.signal.aborted)return;
            onFrame(frame);
            if(secondary.some(k=>this.now()>=this.due[k]))stop();
          });
        }finally{signal.removeEventListener('abort',stop);}
      }else{
        const frame=await this.board.captureScope(td,vd,undefined,signal,source);
        if(frame&&!signal.aborted)onFrame(frame);
      }
    }
    for(const kind of secondary){
      if(signal.aborted)return;
      if(continuous&&this.now()<this.due[kind])continue;
      if(kind==='battery'){
        const battery=await this.board.battery();
        if(!signal.aborted)onBattery(battery);
      }else{
        const frame=await this.board.captureGroup(kind,kind==='LA'?1000000:50000);
        if(!signal.aborted)onFrame(frame);
      }
      this.due[kind]=this.now()+intervalMs[kind];
    }
    // A primary acquisition already waited on hardware. Snapshot-only layouts
    // can sleep until the next requested instrument is due.
    if(!primary&&continuous)return Math.max(0,Math.min(...secondary.map(k=>this.due[k]))-this.now());
  }
}
