import '../public/styles.css';
export const metadata = { title: 'ZooLark Web Instrument', description: 'Zoolark Pro · OpenScope RP2350B USB 实板仪器工作台' };
export default function RootLayout({ children }) {
  return <html lang="zh-CN"><body className="board-live">{children}</body></html>;
}
