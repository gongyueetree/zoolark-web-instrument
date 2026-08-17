import { legacyBodyHtml } from '../src/legacy-body';

export const dynamic = 'force-static';

export default function HomePage() {
  return <main dangerouslySetInnerHTML={{ __html: legacyBodyHtml }} />;
}
