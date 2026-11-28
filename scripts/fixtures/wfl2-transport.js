// Firmware protocol fixture loaded only by the Node smoke test.
(function(global){
  const {ByteWriter,ByteReader,FrameCodec,FRAME_TYPE,STATUS,OP}=global.WFL2;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function decodeLogicConfig(payload) {
    const r = new ByteReader(payload); return { sampleRate: r.u32(), sampleCount: r.u32(), enabledMask: r.u8(), triggerChannel: r.u8(), triggerEdge: r.u8(), reserved: r.u8(), pretriggerPermille: r.u16(), thresholdMv: r.u16(), flags: r.u32() };
  }
  function splitAndFeed(bytes, fn) {
    let off = 0;
    while (off < bytes.length) { const n = Math.min(bytes.length - off, 7 + Math.floor(Math.random() * 57)); fn(bytes.slice(off, off + n)); off += n; }
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

  global.MockTransport=MockTransport;
})(globalThis);
