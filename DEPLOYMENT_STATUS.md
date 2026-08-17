# Deployment readiness

## 已验证

- `device-stack.js`：Node 语法检查通过
- `device-bridge.js`：Node 语法检查通过
- 旧版 `app_extended.js`：Node 语法检查通过
- WFL2 Mock 端到端：通过
  - device info
  - 8-channel logic capture: 8192 samples
  - JTAG chain scan: 2 demo devices
  - FPGA upload/program/verify: 13,000 bytes
- `package.json` / `vercel.json`：JSON 解析通过
- GitHub Actions CI 已加入：`npm install → check:device → next build`

## 需要 GitHub / Vercel 在线环境验证

当前执行环境无法稳定访问 npm registry，因此没有在本地完成真实 `npm install && next build`。仓库推送后 GitHub Actions 会自动执行完整构建；Vercel 也会运行 Next.js production build。

## 真机验证待办

真机需要 RP2350 firmware 实现：

1. Vendor Bulk IN/OUT USB descriptor
2. WFL2 PING / INFO
3. Logic CONFIG / ARM / STATUS / READ
4. JTAG TAP reset / chain scan
5. FPGA/SVF/XSVF programmer
