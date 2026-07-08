import { Link } from 'wouter';
import PageShell from './PageShell';
import { GOLD, SERIF, noteStyle, ghostButtonStyle } from '../components/museumKit';

/** Catch-all for unknown URLs — the root path still renders App (routes.tsx). */
export default function NotFoundScreen() {
  return (
    <PageShell title="Not on Display" eyebrow="GALLERY 404">
      <p style={{ ...noteStyle, fontSize: 17, lineHeight: 1.7, textAlign: 'center' }}>
        The page you're looking for isn't part of the collection — it may have
        been moved, unpublished, or never hung at all.
      </p>
      <div
        style={{
          display: 'flex',
          gap: 16,
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginTop: 36,
        }}
      >
        <Link href="/" style={{ ...ghostButtonStyle, textDecoration: 'none', display: 'inline-block' }}>
          RETURN TO THE MUSEUM →
        </Link>
        <Link href="/shows" style={{ ...ghostButtonStyle, textDecoration: 'none', display: 'inline-block' }}>
          BROWSE CARD SHOWS →
        </Link>
      </div>
      <p style={{ marginTop: 34, textAlign: 'center' }}>
        <Link href="/vendors" style={{ color: GOLD, fontSize: 14, fontFamily: SERIF, letterSpacing: '0.08em' }}>
          Vendor directory →
        </Link>
      </p>
    </PageShell>
  );
}
