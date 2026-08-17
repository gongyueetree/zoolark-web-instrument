export async function GET() {
  return Response.json({
    name: 'WFL2',
    version: 1,
    transport: 'WebUSB vendor-specific Bulk IN/OUT',
    rp2350Usb: 'USB 2.0-compatible Full-Speed (12 Mb/s)',
    logicAnalyzer: { channels: 8, packing: '1 byte/sample, D7..D0', mode: 'capture locally then chunk upload' },
    jtag: { timing: 'executed locally on RP2350', fileTypes: ['bit', 'bin', 'svf', 'xsvf', 'jed'] },
  });
}
