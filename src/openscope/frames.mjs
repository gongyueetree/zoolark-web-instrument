// R149 wire formats emitted by usb_cdc_send_raw2_packet, adc34_usb_emit and la_usb_snapshot.
export const TIME_US = [1,2,5,10,20,50,100,200,500,1000,2000,5000,10000,20000,50000,100000,200000,500000,1000000,2000000,5000000,10000000,20000000];
export const VDIV_MV = [10,50,100,500,1000,2000,5000,200];
export function requireWire(condition, message) {
  if (!condition) throw new Error(message);
}
export function fields(line, prefix, separator = '|') {
  requireWire(line.startsWith(prefix), '回读类型错误 · ' + line.slice(0, 80));
  const values = Object.create(null);
  for (const part of line.slice(prefix.length).split(separator)) {
    const eq = part.indexOf('=');
    requireWire(eq > 0 && eq < part.length - 1, '回读字段不完整');
    const key = part.slice(0, eq);
    requireWire(!(key in values), '回读字段重复 · ' + key);
    values[key] = part.slice(eq + 1);
  }
  return values;
}
export function integer(value, min, max) {
  const n = Number(value);
  requireWire(/^-?\d+$/.test(value) && Number.isSafeInteger(n) && n >= min && n <= max, '无效整数 · ' + value);
  return n;
}
export function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; ++i) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

export function rawFrame(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = at => view.getUint16(at, true);
  const u32 = at => view.getUint32(at, true);
  requireWire(bytes.length >= 64 && bytes[4] === 1 && bytes[5] === 64 && bytes[6] === 1 && bytes[36] === 8 && bytes[37] === 10, 'ZP23 帧头无效');
  const flags = bytes[7], count = u16(30), rawRate = u32(20), effective = u32(24);
  requireWire((flags & 11) === 1, 'ZP23 非实采、无效或溢出');
  requireWire(count && count === u16(32) + u16(34) && bytes.length === 64 + count * 2, 'ZP23 长度错误');
  requireWire(rawRate && effective && u16(28) && Math.floor(rawRate / u16(28)) === effective, 'ZP23 采样率错误');
  const channels = [[], []];
  for (let i = 64; i < bytes.length; i += 2) {
    const word = u16(i);
    requireWire(word <= 1023, 'ZP23 数据位错误');
    channels[word >>> 9].push(word & 255);
  }
  requireWire(channels.every((ch,i) => ch.length && ch.length === u16(32 + 2*i)), 'ZP23 通道标记与计数不符');
  requireWire(u32(44) === u32(48) && VDIV_MV.includes(u32(44) / 1000) && TIME_US.includes(u32(40)), 'ZP23 量程或时基未知');
  const first = (u16(64) >>> 9);
  return {group:'A12', seq:u32(8), rate:effective / 2, rawRate, channels, skew:[first / rawRate, (1-first) / rawRate],
    tdiv:u32(40), vdiv:u32(44) / 1000};
}

export class WireDecoder {
  constructor() { this.tail = new Uint8Array(); }
  feed(chunk, emit) {
    const data = new Uint8Array(this.tail.length + chunk.length);
    data.set(this.tail); data.set(chunk, this.tail.length);
    let pos = 0;
    while (pos < data.length) {
      const left = data.length - pos;
      if (data[pos] === 90 && left < 4) break;
      if (data[pos] === 90 && data[pos+1] === 80 && data[pos+2] === 50 && data[pos+3] === 51) {
        if (left < 64) break;
        requireWire(data[pos+4] === 1 && data[pos+5] === 64, '损坏的 ZP23 帧头');
        const size = 64 + 2 * (data[pos+30] + 256 * data[pos+31]);
        if (left < size) break;
        emit(data.subarray(pos,pos+size)); pos += size;
      } else if (data[pos]===90 && data[pos+1]===67 && data[pos+2]===48 && data[pos+3]===49) {
        if (left<32) break;
        const size = data[pos+6] + 256*data[pos+7];
        requireWire((data[pos+4]===1 && size>0 && size<=4096 && size%2===0) || (data[pos+4]===2 && size===20), 'ZC01 数据长度错误');
        if (left<32+size) break;
        emit(data.subarray(pos,pos+32+size)); pos+=32+size;
      } else {
        const end = data.indexOf(10,pos);
        requireWire((end < 0 ? data.length : end) - pos < 8192, '串口回复超出长度');
        if (end < 0) break;
        const line = new TextDecoder().decode(data.subarray(pos,end)).trim();
        if (line) emit(line);
        pos = end+1;
      }
    }
    this.tail = data.slice(pos);
  }
}

export function snapshot(lines, group) {
  const aux = group === 'A34', prefix = aux ? 'A34' : 'LA';
  const h = fields(lines[0], prefix + '|');
  requireWire(h.STATUS === 'OK' && lines.at(-1) === prefix+'END', '快照未完成');
  const count = integer(aux ? h.PAIRS : h.SAMPLES, 32, aux ? 1024 : 4096);
  const wordBytes = aux ? 2 : 4, words = aux ? 2*count : count/8;
  let rate;
  if (aux) {
    requireWire(h.V==='2' && h.FIRST==='4' && h.CHANNELS==='A3,A4' && h.PHYSICAL_ADC==='4,3' && h.BITS==='12' && h.VREF_NOMINAL_MV==='3300' && h.ZERO==='NOMINAL_NONE', 'ADC34 通道身份错误');
    const period = integer(h.PERIOD256,96*256,0x1000000);
    const divider = integer(h.DIV256,0,0xffffff);
    requireWire(h.ADC_HZ==='48000000' && (period===divider+256 || (divider===0 && period===96*256)) && h.ERRORS==='0' && h.OVERFLOW==='0', 'ADC34 时钟或状态错误');
    rate = 48000000*256/(2*period);
  } else {
    requireWire(h.V==='3' && h.RAW_GPIO==='17,18,19,20' && h.LA_GPIO==='18,17,20,19' && h.PACK==='LSB_FIRST' && h.CYCLES==='2' && h.PIO==='2' && !(count%8), 'LA 通道映射错误');
    requireWire(h.DIV256===h.ACTUAL_DIV256, 'LA 分频器回读不符');
    rate = integer(h.SYS_HZ,1,500000000)*256/(2*integer(h.DIV256,256,0xffffff));
  }
  requireWire(h.DMA_ERRORS === '0', 'DMA 采集错误');
  const bytes = new Uint8Array(words*wordBytes), view = new DataView(bytes.buffer);
  const channels = aux ? [[],[]] : [[],[],[],[]];
  let offset = 0;
  for (const row of lines.slice(1,-1)) {
    const parts = row.split('|'), hex = parts[2];
    requireWire(parts.length===3 && parts[0]===prefix+'D' && String(offset)===parts[1] && /^[\da-f]+$/i.test(hex) && !(hex.length%(2*wordBytes)), '采集块顺序或编码错误');
    for (let i=0;i<hex.length;i+=2*wordBytes) {
      requireWire(offset < words, '采集数据过长');
      const word = parseInt(hex.slice(i,i+2*wordBytes),16);
      if (aux) {
        requireWire(word <= 4095, 'ADC34 转换错误');
        view.setUint16(2*offset,word,true);
        channels[offset%2].push(word);
      } else {
        view.setUint32(4*offset,word,true);
        for (let n=0;n<8;n++) {
          const raw = word >>> (4*n);
          [1,0,3,2].forEach((bit,ch) => channels[ch].push((raw >>> bit)&1));
        }
      }
      offset++;
    }
  }
  requireWire(offset===words && /^[\da-f]{8}$/i.test(h.CRC32) && crc32(bytes)===parseInt(h.CRC32,16), '采样长度或 CRC32 错误');
  return {group, seq:integer(h.SEQ,0,0xffffffff), rate, channels, skew:aux ? [0,0.5/rate] : [0,0,0,0]};
}

// Collect one four-division window in a single clock epoch. Never interpolate across gaps.
export function rollWindow(tdiv, vdiv, notify) {
  let epoch, expected = 0, frame, seen = 0;
  return bytes => {
    const v = new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
    const crcInput = new Uint8Array(bytes.length-4);
    crcInput.set(bytes.subarray(0,28)); crcInput.set(bytes.subarray(32),28);
    requireWire(crc32(crcInput)===v.getUint32(28,true) && bytes[5]===0, 'ZC01 校验失败或板端丢样');
    const id = v.getUint32(8,true), index = Number(v.getBigUint64(12,true));
    if (bytes[4]===2) {
      const rate=v.getUint32(32,true), raw=v.getUint32(44,true);
      requireWire(epoch===undefined && index===0 && v.getBigUint64(20,true)>0n && bytes[43]===0 && bytes[42]<=1 && rate>0 && rate<=500000 && raw>=rate && raw%rate===0, '连续采集时钟或起点无效');
      requireWire(v.getUint32(36,true)===vdiv*1000 && v.getUint32(48,true)===tdiv, '采集中板端量程或时基改变');
      const n=Math.ceil(4*tdiv*rate/1e6);
      requireWire(n>0 && n<=1000000, '连续采集窗口超长');
      epoch=id;
      frame={group:'A12',seq:id,rate,tdiv,vdiv,skew:[0,0],channels:[new Uint8Array(n),new Uint8Array(n)]};
      return;
    }
    requireWire(frame && id===epoch && index===expected, '连续采集有缺口或时钟已重置');
    const total=frame.channels[0].length;
    for(let i=32;i<bytes.length && seen<total;i+=2,seen++){
      frame.channels[0][seen]=bytes[i]; frame.channels[1][seen]=bytes[i+1];
    }
    expected+=(bytes.length-32)/2;
    notify?.(seen/total);
    if(seen===total)return frame;
  };
}
