# WFL → Next.js / Vercel 迁移说明

## 已完成

- 将旧版纯 HTML/CSS/JavaScript 上位机包装为 Next.js App Router 工程。
- 保留原 UI DOM、Canvas 绘图与仪器控制逻辑，避免一次性 React 重写引入回归。
- 将浏览器仪器逻辑放入 `public/app_extended.js`，确保 Vercel SSR/构建阶段不访问 `navigator.usb` / `navigator.serial`。
- 修改旧脚本启动方式，兼容普通 HTML 的 `DOMContentLoaded` 与 Next.js 客户端加载。
- 增加 Vercel `Permissions-Policy`：`usb=(self), serial=(self)`。
- 增加 `/api/health`，为未来 AI/API 功能提供服务端入口。
- 保留原设计、协议和固件快速入门文档。

## 代码审查时发现的现状

当前旧版的“USB/Serial 连接”仍主要是 UI/模拟层：

- Web Serial 的“扫描”调用 `navigator.serial.requestPort()`，但没有持久保存并 `port.open()`；
- WebUSB 的“扫描”调用 `navigator.usb.requestDevice()`，但没有执行 `device.open()`、`selectConfiguration()`、`claimInterface()`、`transferIn()` / `transferOut()`；
- 点击“连接设备”最终调用的是 `toggleConnection()`，目前主要切换 UI 状态；
- 示波器/逻辑分析/频谱等数据目前主要由模拟数据生成器驱动。

因此：**本迁移包解决的是 Vercel / Next.js 部署和浏览器运行架构，不等于已经完成 RP2350 的真实 USB2.0 数据链路。**

## 下一阶段建议

### P0 — 真正接上硬件

建立 `device/transport` 层：

- `WebSerialTransport`
- `WebUSBTransport`
- `MockTransport`
- WFL Packet Parser / CRC / framing
- connect / disconnect / reconnect
- streaming read loop
- command queue + timeout

### P1 — 高速仪器数据

- 二进制帧替代 JSON；
- Web Worker 做包解析与 DSP；
- Canvas / OffscreenCanvas 做高频波形渲染；
- USB2.0 bulk endpoint 用于示波器/逻辑分析数据流；
- control/bulk OUT 用于参数和 AWG/PWM/DC/JTAG 指令。

### P2 — 新增 JTAG/FPGA

把 JTAG/FPGA 下载调试作为独立模块：

- Chain scan / IDCODE；
- `.bit/.bin/.svf/.xsvf` 文件加载；
- program / verify / readback；
- 实时进度与日志；
- 与 8 通道逻辑分析仪联动。
