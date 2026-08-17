(function(){'use strict';
const EXPECTED='0.4.5-dual-adc-dim';
const MANIFEST='/firmware/manifest.json';
function status(title,detail){const t=document.getElementById('zl-usb-state-title'),d=document.getElementById('zl-usb-state-detail');if(t)t.textContent=title;if(d)d.textContent=detail;}
async function latest(){const r=await fetch(MANIFEST,{cache:'no-store'});if(!r.ok)throw new Error('固件清单读取失败');return r.json();}
async function dl(){const m=await latest();if(m.version!==EXPECTED){status('新版 UF2 仍在发布中',`当前服务器固件是 ${m.version||'unknown'}，需要 ${EXPECTED}。请稍后刷新，不下载旧固件。`);return;}const a=document.createElement('a');a.href=m.file;a.download=m.file.split('/').pop();document.body.appendChild(a);a.click();a.remove();status(`已开始下载 ${EXPECTED}`,`请把 ${a.download} 拖到 RP2350 盘，盘消失后重新连接 Runtime。`);}
function patch(){const b=document.getElementById('zl-install-uf2');if(b){b.textContent='下载 v0.4.5 Dual-ADC Dim UF2';b.title='CH1 GPIO47/ADC7 + CH2 GPIO45/ADC5 + WS2812 5%';}const v=document.getElementById('zl-fw-version');if(v)v.textContent='FW 0.4.5 required';const h=document.querySelector('.zl-usb-help');if(h)h.innerHTML='<b>版本锁定：</b>双通道网页只和 <code>0.4.5-dual-adc-dim</code> 配套。刷入后 GPIO25 心跳，CH1=GPIO47/ADC7，CH2=GPIO45/ADC5，WS2812≈5% 亮度。';}
document.addEventListener('click',e=>{const b=e.target.closest?.('#zl-install-uf2');if(!b)return;e.preventDefault();e.stopImmediatePropagation();dl().catch(err=>status('下载失败',err.message||String(err)));},true);
function start(){patch();let n=0;const t=setInterval(()=>{patch();if(++n>80||document.getElementById('zl-install-uf2'))clearInterval(t);},50);}document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();})();
