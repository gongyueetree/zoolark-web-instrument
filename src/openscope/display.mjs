// Quantile bounds keep isolated spikes on an idle ADC from winning AUTO.
// The inputs are calibrated voltages from an 8-bit ADC.
function signalRange(data) {
  const {min,max}=stats(data);
  if(max===min)return {low:min,high:max};
  const bins=new Uint32Array(256),step=(max-min)/255;
  for(const v of data)bins[Math.min(255,Math.round((v-min)/step))]++;
  const tail=Math.floor(data.length*.01);
  let lo=0,hi=255,a=0,b=0;
  while(a+bins[lo]<=tail)a+=bins[lo++];
  while(b+bins[hi]<=tail)b+=bins[hi--];
  return {low:min+lo*step,high:min+hi*step};
}

// Record the interpolated crossing at the requested level, then require an
// excursion through the hysteresis band before accepting it.
function edgeWindow(frame,channel,edge,level,band,span) {
  const data=frame.channels[channel],sign=edge==='rise'?1:-1;
  const first=Math.max(...frame.skew);
  const last=Math.min(...frame.channels.map((ch,i)=>(ch.length-1)/frame.rate+frame.skew[i]));
  const pre=span/4;
  let armed=false,crossing=null,prev=sign*(data[0]-level);
  for(let i=1;i<data.length;i++){
    if(prev<=-band)armed=true;
    const value=sign*(data[i]-level);
    if(armed && prev<0 && value>=0){
      crossing=(i-1-prev/(value-prev))/frame.rate+frame.skew[channel];
    }
    if(armed && value>=band && crossing!==null){
      const start=crossing-pre;
      if(start>=first && start+span<=last)return start;
      armed=false;crossing=null;
    }
    prev=value;
  }
  return null;
}

export function scopeTrigger(frame,settings,span,previousChannel) {
  if(settings.source==='free')return null;
  const follow=settings.source==='board';
  const fixed=follow?frame.boardSource:Number(settings.source);
  const candidates=(fixed===0?[1,2]:[fixed]).map(source=>{
    const {low,high}=signalRange(frame.channels[source-1]);
    return {source,amplitude:high-low,midpoint:(high+low)/2};
  });
  if(fixed===0){
    // Prefer the previous channel when both amplitudes are comparable.
    const weight=c=>c.amplitude*(c.source===previousChannel?1.25:1);
    candidates.sort((a,b)=>weight(b)-weight(a));
  }
  for(const {source,amplitude,midpoint} of candidates){
    if(follow && amplitude<8*frame.voltsPerCode)continue;
    const level=follow?midpoint:Number(settings.level);
    if(!Number.isFinite(level) || (!follow && settings.level.trim()===''))return null;
    const band=Math.max(frame.voltsPerCode*(follow?2:0.5),amplitude*.04);
    const start=edgeWindow(frame,source-1,settings.edge,level,band,span);
    if(start!==null)return {source,level,start,position:span/4};
  }
  return null;
}

// Average only complete, trigger-aligned windows. Keep each channel on its own
// acquisition clock when interpolating onto the common display time grid.
export function averageWindows(previous,frame,limit) {
  const n=Math.floor(frame.rate*frame.span)+1;
  const prior=previous && previous.count<limit && previous.rate===frame.rate &&
    previous.source===frame.trigger.source && previous.span===frame.span ? previous : null;
  const count=(prior?.count||0)+1;
  const channels=frame.channels.map((samples,ch)=>{
    const result=new Float32Array(n);
    const offset=(frame.start-frame.skew[ch])*frame.rate;
    for(let i=0;i<n;i++){
      const at=Math.min(samples.length-1,Math.max(0,i+offset)),left=Math.floor(at);
      const sample=samples[left]+(samples[Math.min(left+1,samples.length-1)]-samples[left])*(at-left);
      result[i]=prior?prior.channels[ch][i]+(sample-prior.channels[ch][i])/count:sample;
    }
    return result;
  });
  return {channels,count,span:frame.span,rate:frame.rate,source:frame.trigger.source};
}

export function stats(data,rate) {
  let min=Infinity,max=-Infinity,sum=0,squares=0;
  for(const y of data){min=Math.min(min,y);max=Math.max(max,y);sum+=y;squares+=y*y;}
  const mid=(min+max)/2,band=(max-min)*.1;
  let armed=false,first=0,last=0,count=0;
  if(rate && max>min)for(let i=1;i<data.length;i++){
    if(data[i-1]<mid-band)armed=true;
    if(armed && data[i-1]<mid && data[i]>=mid){
      last=i-1+(mid-data[i-1])/(data[i]-data[i-1]);
      if(count++===0)first=last;
      armed=false;
    }
  }
  return {min,max,mean:sum/data.length,rms:Math.sqrt(squares/data.length),hz:count>1?(count-1)*rate/(last-first):null};
}
// Single-sided Hann-window FFT in V peak. A power-of-two excerpt avoids zero-padding a partial capture.
export function spectrum(samples,rate) {
  const n=2**Math.floor(Math.log2(Math.min(8192,samples.length)));
  if(n<4)return null;
  const re=new Float64Array(n), im=new Float64Array(n);
  let sum=0;
  for(let i=0;i<n;i++) {
    const w=.5-.5*Math.cos(2*Math.PI*i/(n-1));
    re[i]=samples[i]*w; sum+=w;
  }
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;
    for(;j&bit;bit>>=1)j^=bit;
    j^=bit;
    if(i<j)[re[i],re[j]]=[re[j],re[i]];
  }
  for(let len=2;len<=n;len*=2) {
    for(let k=0;k<len/2;k++){
      const angle=-2*Math.PI*k/len,c=Math.cos(angle),s=Math.sin(angle);
      for(let a=k;a<n;a+=len){
        const b=a+len/2, x=c*re[b]-s*im[b], y=c*im[b]+s*re[b];
        re[b]=re[a]-x; im[b]=im[a]-y; re[a]+=x; im[a]+=y;
      }
    }
  }
  const bins=Float32Array.from(re.subarray(0,n/2+1),(x,i)=>Math.hypot(x,im[i])*(i===0||i===n/2?1:2)/sum);
  return {bins,step:rate/n};
}
