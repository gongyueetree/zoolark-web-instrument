# ZooLark View · Zoolark Pro 口袋仪器上位机

首页 `/` 和 `/openscope` 均直接打开 OpenScope RP2350B 实板工作台。使用桌面 Chrome 或 Edge 访问 HTTPS 或 localhost，连接运行 HW2.1 R144 或 R149 固件的仪器，点击 **连接 USB 仪器** 并选中串口。顶部显示 **Zoolark Pro 已连接** 后，在示波器页点击 **运行** 或 **单次** 采集波形。

工作台支持 A1/A2 和 A3/A4 示波器、频谱、四路逻辑分析、频响测量、WAV / PWM / DC 输出、电池监测及自定义仪表板。采样和测量来自 USB CDC 连接的设备。信号发生器及 PWM 的参数预览用于编辑波形。接线、量程与回环验收方法见[实板使用说明](docs/OPENSCOPE_R149.md)。

## 开发

```bash
npm install
npm test
npm run dev
```

访问 `http://localhost:3000`。

## Vercel

把仓库 push 到 GitHub，Vercel Import Project 即可。`vercel.json` 已配置 `Permissions-Policy: usb=(self), serial=(self)`。

## 关键目录

- `app/openscope/` 包含实板仪器界面。
- `src/openscope/` 包含 USB CDC 通信、采集与测量逻辑。
- `firmware/rp2350/` 和 `docs/PROTOCOL_V2.md` 提供独立 WFL2 实验固件工程与协议资料。
