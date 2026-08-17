(function (global) {
  'use strict';

  const MAGIC = new Uint8Array([0x57, 0x46, 0x4c, 0x32]); // "WFL2"
  const VERSION = 1;
  const HEADER_SIZE = 24;
  const FRAME_TYPE = Object.freeze({ COMMAND: 0, RESPONSE: 1, EVENT: 2, DATA: 3 });
  const STATUS = Object.freeze({ OK: 0, ERROR: 1, BAD_CRC: 2, BAD_COMMAND: 3, BUSY: 4, TIMEOUT: 5, RANGE: 6 });
  const FLAGS = Object.freeze({ NONE: 0, MORE: 1 << 0, COMPRESSED_RLE: 1 << 1 });

  const OP = Object.freeze({
    PING: 0x0001,
    GET_DEVICE_INFO: 0x0002,

    LOGIC_CONFIG: 0x1001,
    LOGIC_ARM: 0x1002,
    LOGIC_STATUS: 0x1003,
    LOGIC_READ: 0x1004,
    LOGIC_STOP: 0x1005,

    JTAG_CONFIG: 0x2001,
    JTAG_SCAN: 0x2002,
    JTAG_TAP_RESET: 0x2003,

    FPGA_PROGRAM_BEGIN: 0x2101,
    FPGA_PROGRAM_CHUNK: 0x2102,
    FPGA_PROGRAM_END: 0x2103,
    FPGA_PROGRAM_ABORT: 0x2104,

    EVENT_LOGIC_DONE: 0x1080,
    EVENT_FPGA_PROGRESS: 0x2180,
  });

  class ByteWriter {
    constructor(size = 64) { this.buf = new Uint8Array(size); this.off = 0; }
    ensure(n) {
      if (this.off + n <= this.buf.length) return;
      let size = this.buf.length;
      while (size < this.off + n) size *= 2;
      const next = new Uint8Array(size); next.set(this.buf); this.buf = next;
    }
    u8(v) { this.ensure(1); this.buf[this.off++] = v & 0xff; return this; }
    u16(v) { this.ensure(2); new DataView(this.buf.buffer).setUint16(this.off, v, true); this.off += 2; return this; }
    u32(v) { this.ensure(4); new DataView(this.buf.buffer).setUint32(this.off, v >>> 0, true); this.off += 4; return this; }
    bytes(v) { v = toU8(v); this.ensure(v.length); this.buf.set(v, this.off); this.off += v.length; return this; }
    string8(text) { const b = new TextEncoder().encode(text || ''); this.u8(Math.min(255, b.length)); this.bytes(b.subarray(0, 255)); return this; }
    finish() { return this.buf.slice(0, this.off); }
  }

  class ByteReader {
    constructor(buf) { this.buf = toU8(buf); this.dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength); this.off = 0; }
    need(n) { if (this.off + n > this.buf.length) throw new Error('Protocol payload truncated'); }
    u8() { this.need(1); return this.buf[this.off++]; }
    u16() { this.need(2); const v = this.dv.getUint16(this.off, true); this.off += 2; return v; }
    u32() { this.need(4); const v = this.dv.getUint32(this.off, true); this.off += 4; return v; }
    bytes(n) { this.need(n); const v = this.buf.slice(this.off, this.off + n); this.off += n; return v; }
    string8() { return new TextDecoder().decode(this.bytes(this.u8())); }
    remaining() { return this.buf.length - this.off; }
  }

  function toU8(data) {
    if (!data) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return Uint8Array.from(data);
  }

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32Parts(parts) {
    let c = 0xffffffff;
    for (const part of parts) {
      const b = toU8(part);
      for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const FrameCodec = {
    encode({ type = FRAME_TYPE.COMMAND, opcode = 0, sequence = 0, flags = 0, status = 0, payload = new Uint8Array(0) }) {
      payload = toU8(payload);
      const out = new Uint8Array(HEADER_SIZE + payload.length);
      const dv = new DataView(out.buffer);
      out.set(MAGIC, 0);
      out[4] = VERSION;
      out[5] = type;
      dv.setUint16(6, opcode, true);
      dv.setUint32(8, sequence >>> 0, true);
      dv.setUint32(12, payload.length >>> 0, true);
      dv.setUint16(16, flags, true);
      dv.setUint16(18, status, true);
      dv.setUint32(20, 0, true);
      out.set(payload, HEADER_SIZE);
      const crc = crc32Parts([out.subarray(0, 20), payload]);
      dv.setUint32(20, crc, true);
      return out;
    },
    decode(frame) {
      const b = toU8(frame);
      if (b.length < HEADER_SIZE) throw new Error('Frame too short');
      for (let i = 0; i < 4; i++) if (b[i] !== MAGIC[i]) throw new Error('Bad frame magic');
      if (b[4] !== VERSION) throw new Error(`Unsupported protocol version ${b[4]}`);
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const payloadLength = dv.getUint32(12, true);
      if (b.length !== HEADER_SIZE + payloadLength) throw new Error('Frame length mismatch');
      const payload = b.slice(HEADER_SIZE);
      const expected = dv.getUint32(20, true);
      const actual = crc32Parts([b.subarray(0, 20), payload]);
      if (expected !== actual) throw new Error(`CRC mismatch: expected ${expected.toString(16)} got ${actual.toString(16)}`);
      return {
        type: b[5], opcode: dv.getUint16(6, true), sequence: dv.getUint32(8, true),
        payloadLength, flags: dv.getUint16(16, true), status: dv.getUint16(18, true), payload,
      };
    },
  };

  class FrameStreamParser {
    constructor(onFrame) { this.onFrame = onFrame; this.buffer = new Uint8Array(0); }
    push(chunk) {
      chunk = toU8(chunk);
      if (!chunk.length) return;
      const merged = new Uint8Array(this.buffer.length + chunk.length);
      merged.set(this.buffer); merged.set(chunk, this.buffer.length); this.buffer = merged;
      for (;;) {
        if (this.buffer.length < HEADER_SIZE) return;
        let start = 0;
        while (start + 4 <= this.buffer.length && !MAGIC.every((m, i) => this.buffer[start + i] === m)) start++;
        if (start) this.buffer = this.buffer.slice(start);
        if (this.buffer.length < HEADER_SIZE) return;
        const len = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength).getUint32(12, true);
        const total = HEADER_SIZE + len;
        if (total > 16 * 1024 * 1024) { this.buffer = this.buffer.slice(4); continue; }
        if (this.buffer.length < total) return;
        const raw = this.buffer.slice(0, total); this.buffer = this.buffer.slice(total);
        try { this.onFrame(FrameCodec.decode(raw)); } catch (err) { console.warn('[WFL2] dropped frame:', err); }
      }
    }
  }

  class WebUSBTransport {
    constructor(options = {}) {
      this.options = Object.assign({
        filters: [{ vendorId: 0x2e8a }], configurationValue: 1,
        interfaceNumber: null, inEndpoint: null, outEndpoint: null,
        readSize: 16 * 1024,
      }, options);
      this.device = null; this.connected = false; this.onData = null; this.onDisconnect = null;
      this.interfaceNumber = null; this.inEndpoint = null; this.outEndpoint = null; this._readLoop = null;
    }
    isSupported() { return typeof navigator !== 'undefined' && !!navigator.usb; }
    async connect({ device = null } = {}) {
      if (!this.isSupported()) throw new Error('当前浏览器不支持 WebUSB，请使用桌面版 Chrome/Edge。');
      this.device = device || await navigator.usb.requestDevice({ filters: this.options.filters });
      await this.device.open();
      if (!this.device.configuration) await this.device.selectConfiguration(this.options.configurationValue);
      const picked = this._findBulkInterface();
      this.interfaceNumber = this.options.interfaceNumber ?? picked.interfaceNumber;
      this.inEndpoint = this.options.inEndpoint ?? picked.inEndpoint;
      this.outEndpoint = this.options.outEndpoint ?? picked.outEndpoint;
      await this.device.claimInterface(this.interfaceNumber);
      this.connected = true;
      navigator.usb.addEventListener?.('disconnect', this._usbDisconnectHandler = (event) => {
        if (event.device === this.device) this._handleDisconnect();
      });
      this._readLoop = this._runReadLoop();
      return this.info();
    }
    _findBulkInterface() {
      const cfg = this.device.configuration;
      for (const iface of cfg.interfaces) {
        for (const alt of iface.alternates) {
          const ins = alt.endpoints.filter(e => e.direction === 'in' && e.type === 'bulk');
          const outs = alt.endpoints.filter(e => e.direction === 'out' && e.type === 'bulk');
          if (ins.length && outs.length) return { interfaceNumber: iface.interfaceNumber, inEndpoint: ins[0].endpointNumber, outEndpoint: outs[0].endpointNumber };
        }
      }
      throw new Error('设备没有找到可用的 Bulk IN/OUT interface。请检查 RP2350 USB descriptor。');
    }
    async _runReadLoop() {
      while (this.connected && this.device?.opened) {
        try {
          const result = await this.device.transferIn(this.inEndpoint, this.options.readSize);
          if (result.status === 'ok' && result.data?.byteLength) this.onData?.(new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength));
          else if (result.status === 'stall') await this.device.clearHalt('in', this.inEndpoint);
        } catch (err) {
          if (this.connected) console.warn('[WebUSB] read loop stopped:', err);
          break;
        }
      }
      if (this.connected) this._handleDisconnect();
    }
    async write(data) {
      if (!this.connected || !this.device?.opened) throw new Error('WebUSB device is not connected');
      const result = await this.device.transferOut(this.outEndpoint, toU8(data));
      if (result.status !== 'ok') throw new Error(`USB OUT failed: ${result.status}`);
    }
    async disconnect() {
      this.connected = false;
      try { if (this.device?.opened && this.interfaceNumber !== null) await this.device.releaseInterface(this.interfaceNumber); } catch (_) {}
      try { if (this.device?.opened) await this.device.close(); } catch (_) {}
      if (this._usbDisconnectHandler) navigator.usb?.removeEventListener?.('disconnect', this._usbDisconnectHandler);
      this.device = null;
    }
    _handleDisconnect() { this.connected = false; this.onDisconnect?.(); }
    info() { return { kind: 'webusb', productName: this.device?.productName || 'RP2350 Instrument', manufacturerName: this.device?.manufacturerName || '', serialNumber: this.device?.serialNumber || '', vendorId: this.device?.vendorId, productId: this.device?.productId, interfaceNumber: this.interfaceNumber, inEndpoint: this.inEndpoint, outEndpoint: this.outEndpoint }; }
  }

  class MockTransport {
    constructor() { this.connected = false; this.onData = null; this.onDisconnect = null; this.logicConfig = null; this.capture = null; this.captureId = 100; this.program = null; }
    async connect() { this.connected = true; await wait(40); return this.info(); }
    async disconnect() { this.connected = false; this.onDisconnect?.(); }
    info() { return { kind: 'mock', productName: 'ZooLark RP2350 (Demo)', manufacturerName: 'EETree', serialNumber: 'DEMO-2350-0001', vendorId: 0x2e8a, productId: 0x000a, interfaceNumber: 2, inEndpoint: 1, outEndpoint: 1 }; }
    async write(raw) {
      if (!this.connected) throw new Error('Mock device is not connected');
      const req = FrameCodec.decode(raw);
      const { status, payload } = await this._handle(req);
      await wait(10 + Math.random() * 20);
      const response = FrameCodec.encode({ type: FRAME_TYPE.RESPONSE, opcode: req.opcode, sequence: req.sequence, status, payload });
      splitAndFeed(response, chunk => this.onData?.(chunk));
    }
    async _handle(req) {
      try {
        switch (req.opcode) {
          case OP.PING: return { status: STATUS.OK, payload: req.payload };
          case OP.GET_DEVICE_INFO: return { status: STATUS.OK, payload: this._deviceInfo() };
          case OP.LOGIC_CONFIG: this.logicConfig = decodeLogicConfig(req.payload); return { status: STATUS.OK, payload: new Uint8Array(0) };
          case OP.LOGIC_ARM: return { status: STATUS.OK, payload: this._armLogic() };
          case OP.LOGIC_STATUS: return { status: STATUS.OK, payload: this._logicStatus() };
          case OP.LOGIC_READ: return { status: STATUS.OK, payload: this._logicRead(req.payload) };
          case OP.LOGIC_STOP: return { status: STATUS.OK, payload: new Uint8Array(0) };
          case OP.JTAG_CONFIG: return { status: STATUS.OK, payload: new Uint8Array(0) };
          case OP.JTAG_TAP_RESET: return { status: STATUS.OK, payload: new Uint8Array(0) };
          case OP.JTAG_SCAN: return { status: STATUS.OK, payload: this._jtagScan() };
          case OP.FPGA_PROGRAM_BEGIN: return { status: STATUS.OK, payload: this._programBegin(req.payload) };
          case OP.FPGA_PROGRAM_CHUNK: return { status: STATUS.OK, payload: this._programChunk(req.payload) };
          case OP.FPGA_PROGRAM_END: return { status: STATUS.OK, payload: this._programEnd(req.payload) };
          case OP.FPGA_PROGRAM_ABORT: this.program = null; return { status: STATUS.OK, payload: new Uint8Array(0) };
          default: return { status: STATUS.BAD_COMMAND, payload: new TextEncoder().encode('unsupported mock opcode') };
        }
      } catch (err) {
        return { status: STATUS.ERROR, payload: new TextEncoder().encode(err.message) };
      }
    }
    _deviceInfo() {
      const w = new ByteWriter();
      const fields = [
        [1, 'ZooLark RP2350 Web Instrument'], [2, '0.3.0-demo'], [3, 'DEMO-2350-0001'],
        [4, 'USB Full-Speed 12 Mb/s'], [5, 'OSC,FFT,VNA,GEN,PWM,DC,BATT,LA8,JTAG'],
      ];
      for (const [type, text] of fields) { const b = new TextEncoder().encode(text); w.u8(type).u16(b.length).bytes(b); }
      return w.finish();
    }
    _armLogic() {
      const cfg = this.logicConfig || { sampleRate: 24e6, sampleCount: 8192, enabledMask: 0xff, triggerChannel: 0, triggerEdge: 1, pretriggerPermille: 200, thresholdMv: 1650 };
      const n = Math.max(256, Math.min(2_000_000, cfg.sampleCount));
      const data = new Uint8Array(n);
      // deterministic-looking digital traffic: clock, counters, UART-like and I2C-like patterns
      for (let i = 0; i < n; i++) {
        let v = 0;
        v |= ((i >> 2) & 1) << 0;          // D0 fast clock
        v |= ((i >> 5) & 1) << 1;          // D1 slow clock
        v |= ((i % 97) < 48 ? 1 : 0) << 2;
        v |= ((i % 211) > 35 && (i % 211) < 170 ? 1 : 0) << 3;
        v |= ((Math.floor(i / 13) ^ Math.floor(i / 31)) & 1) << 4;
        v |= ((i >> 7) & 1) << 5;
        v |= ((i >> 8) & 1) << 6;
        v |= ((i % 503) < 410 ? 1 : 0) << 7;
        data[i] = v & cfg.enabledMask;
      }
      this.capture = { id: ++this.captureId, data, sampleRate: cfg.sampleRate, doneAt: performance.now() + 120 };
      const w = new ByteWriter(8); w.u32(this.capture.id).u32(n); return w.finish();
    }
    _logicStatus() {
      const done = this.capture && performance.now() >= this.capture.doneAt;
      const w = new ByteWriter(16); w.u8(done ? 2 : 1).u8(0).u16(0).u32(this.capture?.id || 0).u32(this.capture?.data.length || 0).u32(this.capture?.sampleRate || 0); return w.finish();
    }
    _logicRead(payload) {
      const r = new ByteReader(payload); const id = r.u32(); const offset = r.u32(); const maxCount = r.u32();
      if (!this.capture || id !== this.capture.id) throw new Error('Unknown capture id');
      const end = Math.min(this.capture.data.length, offset + Math.max(1, maxCount));
      const slice = this.capture.data.slice(offset, end);
      return new ByteWriter(12 + slice.length).u32(id).u32(offset).u32(slice.length).bytes(slice).finish();
    }
    _jtagScan() {
      const devices = [
        { idcode: 0x4ba00477, ir: 4, flags: 1, name: 'ARM Debug Port (demo)' },
        { idcode: 0x01234567, ir: 8, flags: 0, name: 'FPGA TAP (demo)' },
      ];
      const w = new ByteWriter(); w.u8(devices.length);
      for (const d of devices) w.u32(d.idcode).u8(d.ir).u8(d.flags).string8(d.name);
      return w.finish();
    }
    _programBegin(payload) {
      const r = new ByteReader(payload); const target = r.u8(); const fileType = r.u8(); const flags = r.u16(); const total = r.u32(); const crc = r.u32(); const name = r.string8();
      this.program = { session: 0x9001, target, fileType, flags, total, crc, name, received: 0, runningCrc: 0 };
      return new ByteWriter(12).u32(this.program.session).u32(4096).u32(total).finish();
    }
    _programChunk(payload) {
      const r = new ByteReader(payload); const session = r.u32(); const offset = r.u32(); const len = r.u16(); r.u16(); const data = r.bytes(len);
      if (!this.program || session !== this.program.session) throw new Error('Unknown program session');
      if (offset !== this.program.received) throw new Error(`Unexpected chunk offset ${offset}`);
      this.program.received += data.length;
      return new ByteWriter(12).u32(session).u32(this.program.received).u32(this.program.total).finish();
    }
    _programEnd(payload) {
      const r = new ByteReader(payload); const session = r.u32();
      if (!this.program || session !== this.program.session) throw new Error('Unknown program session');
      const ok = this.program.received === this.program.total;
      const out = new ByteWriter(8).u32(session).u8(ok ? 1 : 0).u8(ok ? 1 : 0).u16(0).finish(); this.program = null; return out;
    }
  }

  class DeviceClient {
    constructor(transport) {
      this.transport = transport; this.sequence = 1; this.pending = new Map(); this.events = new Map(); this.connected = false;
      this.parser = new FrameStreamParser(frame => this._onFrame(frame));
      this.transport.onData = chunk => this.parser.push(chunk);
      this.transport.onDisconnect = () => { this.connected = false; this._rejectAll(new Error('Device disconnected')); this.emit('disconnect'); };
    }
    async connect(options) { const info = await this.transport.connect(options); this.connected = true; this.emit('connect', info); return info; }
    async disconnect() { this._rejectAll(new Error('Device disconnected')); await this.transport.disconnect(); this.connected = false; this.emit('disconnect'); }
    on(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); return () => this.events.get(name)?.delete(fn); }
    emit(name, data) { for (const fn of this.events.get(name) || []) { try { fn(data); } catch (e) { console.error(e); } } }
    async request(opcode, payload = new Uint8Array(0), { timeout = 5000 } = {}) {
      if (!this.connected) throw new Error('Device is not connected');
      const seq = this.sequence++ >>> 0;
      const frame = FrameCodec.encode({ type: FRAME_TYPE.COMMAND, opcode, sequence: seq, payload });
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(seq); reject(new Error(`Command 0x${opcode.toString(16)} timeout`)); }, timeout);
        this.pending.set(seq, { resolve, reject, timer, opcode });
      });
      try { await this.transport.write(frame); } catch (err) { const p = this.pending.get(seq); if (p) { clearTimeout(p.timer); this.pending.delete(seq); p.reject(err); } }
      return promise;
    }
    _onFrame(frame) {
      if (frame.type === FRAME_TYPE.RESPONSE) {
        const p = this.pending.get(frame.sequence); if (!p) return;
        clearTimeout(p.timer); this.pending.delete(frame.sequence);
        if (frame.status === STATUS.OK) p.resolve(frame.payload);
        else p.reject(new Error(decodeErrorPayload(frame.payload) || `Device error status ${frame.status}`));
      } else {
        this.emit('frame', frame); this.emit(`opcode:${frame.opcode}`, frame);
      }
    }
    _rejectAll(err) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(err); } this.pending.clear(); }
    async getDeviceInfo() { return decodeDeviceInfo(await this.request(OP.GET_DEVICE_INFO)); }
  }

  function encodeLogicConfig(c) {
    return new ByteWriter(24)
      .u32(c.sampleRate >>> 0).u32(c.sampleCount >>> 0).u8(c.enabledMask ?? 0xff)
      .u8(c.triggerChannel ?? 0).u8(c.triggerEdge ?? 1).u8(0)
      .u16(c.pretriggerPermille ?? 200).u16(c.thresholdMv ?? 1650).u32(c.flags ?? 0).finish();
  }
  function decodeLogicConfig(payload) {
    const r = new ByteReader(payload); return { sampleRate: r.u32(), sampleCount: r.u32(), enabledMask: r.u8(), triggerChannel: r.u8(), triggerEdge: r.u8(), reserved: r.u8(), pretriggerPermille: r.u16(), thresholdMv: r.u16(), flags: r.u32() };
  }
  function decodeDeviceInfo(payload) {
    const names = { 1: 'productName', 2: 'firmwareVersion', 3: 'serialNumber', 4: 'usbMode', 5: 'capabilities' };
    const r = new ByteReader(payload); const out = {};
    while (r.remaining() >= 3) { const type = r.u8(); const len = r.u16(); const text = new TextDecoder().decode(r.bytes(len)); out[names[type] || `field${type}`] = text; }
    return out;
  }
  function decodeErrorPayload(payload) { try { return new TextDecoder().decode(payload); } catch (_) { return ''; } }

  class LogicAnalyzerService {
    constructor(client) { this.client = client; }
    async capture(config, onProgress = () => {}) {
      const normalized = Object.assign({ sampleRate: 24e6, sampleCount: 8192, enabledMask: 0xff, triggerChannel: 0, triggerEdge: 1, pretriggerPermille: 200, thresholdMv: 1650, flags: 0 }, config);
      await this.client.request(OP.LOGIC_CONFIG, encodeLogicConfig(normalized));
      const arm = new ByteReader(await this.client.request(OP.LOGIC_ARM));
      const captureId = arm.u32(); const total = arm.u32();
      let status = null;
      for (let i = 0; i < 100; i++) {
        await wait(i ? 30 : 10);
        const r = new ByteReader(await this.client.request(OP.LOGIC_STATUS));
        status = { state: r.u8(), error: r.u8(), reserved: r.u16(), captureId: r.u32(), sampleCount: r.u32(), sampleRate: r.u32() };
        onProgress({ phase: 'capture', progress: status.state === 2 ? 25 : Math.min(20, i + 1), status });
        if (status.state === 2) break;
        if (status.state === 3) throw new Error(`Logic capture error ${status.error}`);
      }
      if (!status || status.state !== 2) throw new Error('Logic capture did not complete');
      const packed = new Uint8Array(total); const chunkSamples = 8192;
      for (let offset = 0; offset < total;) {
        const req = new ByteWriter(12).u32(captureId).u32(offset).u32(Math.min(chunkSamples, total - offset)).finish();
        const r = new ByteReader(await this.client.request(OP.LOGIC_READ, req, { timeout: 10000 }));
        const id = r.u32(); const returnedOffset = r.u32(); const count = r.u32(); const data = r.bytes(count);
        if (id !== captureId || returnedOffset !== offset) throw new Error('Logic capture chunk out of sequence');
        packed.set(data, offset); offset += count;
        onProgress({ phase: 'download', progress: 25 + Math.round(offset / total * 75), offset, total });
      }
      return { captureId, sampleRate: status.sampleRate || normalized.sampleRate, sampleCount: total, packed, channels: unpackLogicChannels(packed) };
    }
  }

  class JtagService {
    constructor(client) { this.client = client; }
    async configure({ tckHz = 10_000_000, ioVoltageMv = 3300 } = {}) {
      return this.client.request(OP.JTAG_CONFIG, new ByteWriter(8).u32(tckHz).u16(ioVoltageMv).u16(0).finish());
    }
    async tapReset() { return this.client.request(OP.JTAG_TAP_RESET); }
    async scan() {
      const r = new ByteReader(await this.client.request(OP.JTAG_SCAN, new Uint8Array(0), { timeout: 5000 }));
      const count = r.u8(); const devices = [];
      for (let i = 0; i < count; i++) devices.push({ index: i, idcode: r.u32(), irLength: r.u8(), flags: r.u8(), name: r.string8() });
      return devices;
    }
    async programFile(file, { targetIndex = 0, fileType = null, verify = true, erase = true, runAfter = true, onProgress = () => {} } = {}) {
      const bytes = toU8(file instanceof Uint8Array ? file : await file.arrayBuffer());
      const name = file?.name || 'bitstream.bin';
      const type = fileType ?? fileTypeFromName(name);
      const flags = (verify ? 1 : 0) | (erase ? 2 : 0) | (runAfter ? 4 : 0);
      const fileCrc = crc32Parts([bytes]);
      const beginPayload = new ByteWriter(32).u8(targetIndex).u8(type).u16(flags).u32(bytes.length).u32(fileCrc).string8(name).finish();
      const begin = new ByteReader(await this.client.request(OP.FPGA_PROGRAM_BEGIN, beginPayload, { timeout: 10000 }));
      const sessionId = begin.u32(); const maxChunk = Math.max(64, Math.min(16384, begin.u32())); begin.u32();
      let offset = 0;
      try {
        while (offset < bytes.length) {
          const chunk = bytes.slice(offset, offset + maxChunk);
          const payload = new ByteWriter(12 + chunk.length).u32(sessionId).u32(offset).u16(chunk.length).u16(0).bytes(chunk).finish();
          const ack = new ByteReader(await this.client.request(OP.FPGA_PROGRAM_CHUNK, payload, { timeout: 15000 }));
          ack.u32(); const received = ack.u32(); ack.u32();
          if (received < offset + chunk.length) throw new Error('FPGA programmer acknowledged fewer bytes than sent');
          offset += chunk.length;
          onProgress({ phase: 'upload', progress: Math.round(offset / bytes.length * 95), offset, total: bytes.length });
        }
        const end = new ByteReader(await this.client.request(OP.FPGA_PROGRAM_END, new ByteWriter(4).u32(sessionId).finish(), { timeout: 30000 }));
        end.u32(); const programmed = !!end.u8(); const verified = !!end.u8(); end.u16();
        onProgress({ phase: 'done', progress: 100, programmed, verified });
        if (!programmed || (verify && !verified)) throw new Error('FPGA programming or verification failed');
        return { sessionId, bytes: bytes.length, programmed, verified };
      } catch (err) {
        try { await this.client.request(OP.FPGA_PROGRAM_ABORT, new ByteWriter(4).u32(sessionId).finish(), { timeout: 2000 }); } catch (_) {}
        throw err;
      }
    }
  }

  function fileTypeFromName(name) {
    const ext = String(name).toLowerCase().split('.').pop();
    return ({ bit: 1, bin: 2, svf: 3, xsvf: 4, jed: 5 })[ext] || 2;
  }
  function unpackLogicChannels(packed) {
    const channels = Array.from({ length: 8 }, () => new Uint8Array(packed.length));
    for (let i = 0; i < packed.length; i++) for (let ch = 0; ch < 8; ch++) channels[ch][i] = (packed[i] >> ch) & 1;
    return channels;
  }
  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function splitAndFeed(bytes, fn) {
    let off = 0;
    while (off < bytes.length) { const n = Math.min(bytes.length - off, 7 + Math.floor(Math.random() * 57)); fn(bytes.slice(off, off + n)); off += n; }
  }

  global.WFL2 = { MAGIC, VERSION, HEADER_SIZE, FRAME_TYPE, STATUS, FLAGS, OP, ByteWriter, ByteReader, FrameCodec, FrameStreamParser, WebUSBTransport, MockTransport, DeviceClient, LogicAnalyzerService, JtagService, crc32Parts, unpackLogicChannels, fileTypeFromName };
})(window);
