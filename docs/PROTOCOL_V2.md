# WFL2 二进制协议 v1

WFL2 用于 **浏览器 WebUSB ↔ RP2350**。目标是让波形 UI、逻辑分析、JTAG/FPGA 与硬件实现解耦。

## 1. USB 传输

- Device mode：Vendor-specific interface
- Endpoint：Bulk OUT + Bulk IN
- RP2350 原生 USB：Full-Speed 12 Mb/s
- 浏览器：`open → selectConfiguration → claimInterface → transferOut/transferIn`
- 逻辑分析仪不依赖持续 25/50 MHz USB streaming；采样在 RP2350 本地完成，再分块上传。

## 2. Frame Header（24 bytes, little-endian）

| Offset | Size | 字段 | 说明 |
|---:|---:|---|---|
| 0 | 4 | magic | ASCII `WFL2` |
| 4 | 1 | version | `1` |
| 5 | 1 | type | 0 command / 1 response / 2 event / 3 data |
| 6 | 2 | opcode | 命令编号 |
| 8 | 4 | sequence | 请求序列号 |
| 12 | 4 | payloadLength | payload 字节数 |
| 16 | 2 | flags | bit0 MORE, bit1 RLE |
| 18 | 2 | status | response status |
| 20 | 4 | crc32 | CRC32(header[0..19] + payload) |

## 3. Opcodes

### 通用
- `0x0001 PING`
- `0x0002 GET_DEVICE_INFO`

### 8 通道逻辑分析仪
- `0x1001 LOGIC_CONFIG`
- `0x1002 LOGIC_ARM`
- `0x1003 LOGIC_STATUS`
- `0x1004 LOGIC_READ`
- `0x1005 LOGIC_STOP`

采样数据采用 **1 byte / sample**：bit0=D0 … bit7=D7。这样 8 路无需解包位流，浏览器也能快速索引。

`LOGIC_CONFIG` payload：

```c
struct logic_config {
    uint32_t sample_rate_hz;
    uint32_t sample_count;
    uint8_t  enabled_mask;
    uint8_t  trigger_channel;
    uint8_t  trigger_edge;       // 0 none, 1 rising, 2 falling, 3 both
    uint8_t  reserved;
    uint16_t pretrigger_permille;
    uint16_t threshold_mv;
    uint32_t flags;
};
```

`LOGIC_READ` response payload：`capture_id:u32 + offset:u32 + count:u32 + packed[count]`。

### JTAG / FPGA
- `0x2001 JTAG_CONFIG`
- `0x2002 JTAG_SCAN`
- `0x2003 JTAG_TAP_RESET`
- `0x2101 FPGA_PROGRAM_BEGIN`
- `0x2102 FPGA_PROGRAM_CHUNK`
- `0x2103 FPGA_PROGRAM_END`
- `0x2104 FPGA_PROGRAM_ABORT`

JTAG 的 TCK/TMS/TDI/TDO 时序必须由 RP2350 PIO/本地状态机执行；浏览器只发送高层操作，避免 JS 调度抖动污染时序。

文件类型：1 BIT / 2 BIN / 3 SVF / 4 XSVF / 5 JED。`BEGIN` 返回 `session_id` 和固件允许的 `max_chunk`；浏览器按该大小分块发送。

## 4. 错误处理

每个 command 必须得到相同 `sequence` 的 response。status 非 0 时，payload 可携带 UTF-8 错误文本。浏览器默认超时 5 s；编程 END 可放宽到 30 s。

## 5. 向后兼容

旧版 `AA55...55AA` 串口协议继续保留为 Legacy UART 模式；WebUSB 新开发统一使用 WFL2，避免两边协议混用。
