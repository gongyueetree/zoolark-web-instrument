// One trigger position for both analog channels, expressed on the sample clock.
export function triggerStart(frame, source, edge, level, span) {
  if (!source) return 0;
  const ch=source-1, data=frame.channels[ch], count=Math.max(2,Math.round(span*frame.rate));
  const pre=Math.min(Math.floor(count/4),Math.floor(data.length/4));
  for(let i=Math.max(1,pre);i<data.length;i++) {
    const crosses=edge==='rise'?data[i-1]<level && data[i]>=level:data[i-1]>level && data[i]<=level;
    if(crosses) return (i-1+(level-data[i-1])/(data[i]-data[i-1])-pre)/frame.rate + frame.skew[ch];
  }
  return null;
}
export function stats(data) {
  let min=Infinity,max=-Infinity,sum=0;
  for(const y of data){min=Math.min(min,y);max=Math.max(max,y);sum+=y;}
  return {min,max,mean:sum/data.length};
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
