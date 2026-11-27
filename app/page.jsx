import Script from 'next/script';
import { legacyBodyHtml } from '../src/legacy-body';

export const dynamic = 'force-static';

export default function HomePage() {
  return <><link rel="stylesheet" href="/styles.css" /><main dangerouslySetInnerHTML={{ __html: legacyBodyHtml }} />
    <Script src="/device/device-stack.js" strategy="afterInteractive" />
    <Script src="/device/firmware-installer.js" strategy="afterInteractive" />
    <Script src="/device/manual-uf2-safe.js" strategy="afterInteractive" />
    <Script src="/app_extended.js" strategy="afterInteractive" />
    <Script src="/device/live-io-bridge.js" strategy="afterInteractive" />
    <Script src="/device/kxtj3-bridge.js" strategy="afterInteractive" />
    <Script src="/device/device-bridge.js" strategy="afterInteractive" />
  </>;
}
