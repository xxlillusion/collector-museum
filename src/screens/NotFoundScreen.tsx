import { Link, useLocation } from 'wouter';
import PageShell from './PageShell';
import { useTheme } from '../components/themeKit';
import { LcdDialog } from '../components/lcdKit';

/** Catch-all for unknown URLs — the root path still renders App (routes.tsx). */
export default function NotFoundScreen() {
  const t = useTheme();
  const [, navigate] = useLocation();
  return (
    <PageShell title="Not on Display" eyebrow="GALLERY 404">
      {t.id === 'handheld' ? (
        <div style={{ maxWidth: 460, margin: '0 auto' }}>
          <LcdDialog
            cursor
            choices={[
              { label: 'GO HOME', onClick: () => navigate('/'), primary: true },
              { label: 'BROWSE SHOWS', onClick: () => navigate('/shows') },
            ]}
          >
            A WILD 404 APPEARED! THIS PAGE ISN'T IN THE MUSEUM — MAYBE IT WAS
            NEVER HUNG AT ALL!
          </LcdDialog>
        </div>
      ) : (
        <>
          <p style={{ ...t.note, fontSize: 17, lineHeight: 1.7, textAlign: 'center' }}>
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
            <Link href="/" style={{ ...t.ghostButton, textDecoration: 'none', display: 'inline-block' }}>
              RETURN TO THE MUSEUM →
            </Link>
            <Link href="/shows" style={{ ...t.ghostButton, textDecoration: 'none', display: 'inline-block' }}>
              BROWSE CARD SHOWS →
            </Link>
          </div>
          <p style={{ marginTop: 34, textAlign: 'center' }}>
            <Link href="/vendors" style={{ color: t.accent, fontSize: 14, fontFamily: t.fontMono, letterSpacing: '0.08em' }}>
              Vendor directory →
            </Link>
          </p>
        </>
      )}
    </PageShell>
  );
}
