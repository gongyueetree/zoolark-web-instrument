import Script from 'next/script';
import Bench from './openscope/Bench';
import { legacyBodyHtml } from '../src/legacy-body';


export default function ZooLarkView({initialLive=false}) {
  return <><link rel="stylesheet" href="/styles.css" /><main dangerouslySetInnerHTML={{ __html: legacyBodyHtml }} />
    <Bench initialLive={initialLive}/>
    <Script src="/device/device-stack.js" strategy="afterInteractive" />
    <Script src="/device/firmware-installer.js" strategy="afterInteractive" />
    <Script src="/device/manual-uf2-safe.js" strategy="afterInteractive" />
    <Script src="/app_extended.js" strategy="afterInteractive" />
    <Script src="/device/live-io-bridge.js" strategy="afterInteractive" />
    <Script src="/device/kxtj3-bridge.js" strategy="afterInteractive" />
    <Script src="/device/device-bridge.js" strategy="afterInteractive" />
  </>;
}
