# RP2350 固件架构建议

## Core 分工

- Core 0：USB device / WFL2 parser / command dispatcher / UI control commands
- Core 1：logic capture、DSP、JTAG/FPGA executor
- DMA：PIO logic RX → SRAM ring/capture buffer
- PIO0：8-bit logic analyzer sampler
- PIO1：JTAG master（TCK/TMS/TDI，TDO input）

## 8 通道逻辑分析仪

建议 GPIO 连续映射 D0..D7，使 PIO `in pins, 8` 每拍收 1 byte。采样率由 PIO clock divider 控制。触发策略：

1. DMA 环形写入 pre-trigger buffer；
2. PIO/CPU 检查简单 edge/pattern trigger；
3. 触发后继续采集 post-trigger；
4. 固化 capture；
5. USB `LOGIC_READ` 分块上传。

RP2350 内部 SRAM 容量有限，首版建议深度档位 8K / 32K / 128K / 256K；如产品要求百万点深度，增加外部 PSRAM/HyperRAM 或做 RLE 压缩。

## JTAG

不要从浏览器逐 bit 驱动 JTAG。固件实现 TAP state machine：

- tap_reset
- goto_state
- shift_ir
- shift_dr
- read_idcode_chain
- execute_svf/xsvf
- vendor programmer plugin（ECP5 / Xilinx / Intel / Gowin 等）

浏览器仅上传配置、文件和高层命令。

## USB interface

建议 TinyUSB composite device：

- Interface A：CDC ACM（日志/维护，可选）
- Interface B：Vendor Bulk IN/OUT（WFL2 主数据通道）

Web 端优先 Vendor Bulk；CDC 作为开发时 fallback。
