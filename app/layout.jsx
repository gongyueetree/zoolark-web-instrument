import Script from 'next/script';

export const metadata = {
  title: 'ZooLark Web Instrument — RP2350 USB Lab',
  description: '示波器、频谱、VNA、信号/PWM、直流电源、电池、8通道逻辑分析、JTAG/FPGA 的 WebUSB 上位机',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        {children}
        <Script src="/device/device-stack.js" strategy="afterInteractive" />
        <Script src="/device/firmware-installer.js" strategy="afterInteractive" />
        <Script src="/device/runtime-ui-sync.js" strategy="afterInteractive" />
        <Script src="/app_extended.js" strategy="afterInteractive" />
        <Script src="/device/device-bridge.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
