# GitHub + Vercel 部署

## GitHub

```bash
git init
git add -A
git commit -m "feat: add WFL2 WebUSB logic analyzer and JTAG FPGA"
git branch -M main
git remote add origin <your-repository-url>
git push -u origin main
```

## Vercel

1. Vercel → Add New → Project
2. Import GitHub repository
3. Framework 自动识别 Next.js
4. Root Directory 使用仓库根目录
5. Build Command / Output Directory 保持默认
6. Deploy

生产站点默认 HTTPS，满足 WebUSB secure-context 要求。真机连接请使用桌面 Chrome/Edge。

## 演示模式

无硬件时页面自动连 `MockTransport`：

- 8 路逻辑分析可执行完整 capture/download 流程
- JTAG Scan 返回 demo chain
- 上传 BIT/BIN/SVF/XSVF/JED 可执行分块编程进度演示

因此 Vercel URL 可以直接用于产品展示。
