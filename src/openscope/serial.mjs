import { WireDecoder } from './frames.mjs';

const encoder = new TextEncoder();
export class DeviceRefusal extends Error {}
// One reader for the lifetime of the port, and one reply owner at a time.
// A timeout invalidates the session: a late ACK cannot satisfy a later write.
export class SerialLink {
  constructor(port, onLost) {
    this.port = port;
    this.onLost = onLost;
    this.decoder = new WireDecoder();
  }
  async open() {
    await this.port.open({baudRate:1152000, dataBits:8, stopBits:1, parity:'none', flowControl:'none', bufferSize:65536});
    this.opened = true;
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.pump = this.readLoop();
    await this.port.setSignals({dataTerminalReady:true});
  }
  async readLoop() {
    try {
      while (!this.closed) {
        const {done,value} = await this.reader.read();
        if (done) throw new Error('串口已断开');
        this.decoder.feed(value, event => this.pending?.receive(event));
      }
    } catch (e) { if (!this.closed) this.fail(e); }
    finally { this.reader.releaseLock(); }
  }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    this.pending?.finish(error);
    this.onLost?.(error);
    void this.close();
  }
  exchange(command, accept, timeout=3500, signal) {
    if(signal?.aborted)return Promise.resolve(null);
    if (this.closed || !this.writer) return Promise.reject(new Error('仪器未连接'));
    if (this.pending) return Promise.reject(new Error('串口正在处理上一请求'));
    return new Promise((resolve,reject) => {
      let timer;
      const cancel=()=>finish(null,null);
      const touch=()=>{
        clearTimeout(timer);
        timer=setTimeout(()=>this.fail(new Error(command+' 超时，请重新连接')),timeout);
      };
      const finish = (error,value) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort',cancel);
        this.pending = null;
        if (error) reject(error); else resolve(value);
      };
      touch();
      signal?.addEventListener('abort',cancel,{once:true});
      this.pending = {finish,receive:event => {
        try {
          if (typeof event === 'string' && (/^ERR|\|ERROR=|^SD\|STATUS=BUSY|^(?:LA|A34)\|STATUS=(?!OK)/.test(event))) {
            throw new DeviceRefusal(event);
          }
          const result = accept(event,touch);
          if (result !== undefined) finish(null,result);
        } catch (e) {
          if (e instanceof DeviceRefusal) finish(e); else this.fail(e);
        }
      }};
      this.writer.write(encoder.encode(command+'\n')).catch(e => this.fail(e));
    });
  }
  query(command,prefix,timeout) {
    return this.exchange(command,e => typeof e==='string' && e.startsWith(prefix) ? e : undefined,timeout);
  }
  close() {
    if (this.closing) return this.closing;
    this.closed = true;
    this.pending?.finish(new Error('连接已关闭'));
    this.closing = (async () => {
      if (this.reader) await this.reader.cancel().catch(()=>{});
      await this.pump;
      if (this.writer) {
        await this.writer.abort().catch(()=>{});
        this.writer.releaseLock();
      }
      if (this.opened) await this.port.close().catch(()=>{});
    })();
    return this.closing;
  }
}
