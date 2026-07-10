import { Link, useLocation } from 'wouter';
import SearchBox from './SearchBox';
import SiteFooter from './SiteFooter';
import {
  GOLD, HAIRLINE, TEXT, MUTED, SERIF, SANS, PAGE_BG,
  Ornament, QuickAction, primaryButtonStyle, ghostButtonStyle,
} from './museumKit';

/**
 * The logged-out home: a museum-styled landing page. No local-collection
 * sections here — the guest experience lives at /sandbox; accounts get the
 * full home. Anyone (signed in or not) can browse published shows.
 */
export default function LandingScreen() {
  const [, navigate] = useLocation();
  return (
    <div style={{ height: '100vh', overflowY: 'auto', boxSizing: 'border-box', background: PAGE_BG, color: TEXT, fontFamily: SANS }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '96px 28px 80px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.4em', color: MUTED, marginBottom: 14 }}>
          EST. 2026 · CARD SHOWS &amp; COLLECTIONS
        </div>
        <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(30px, 10vw, 48px)', fontWeight: 400, letterSpacing: '0.18em', color: GOLD }}>
          VENDOR MUSEUM
        </h1>
        <div style={{ margin: '20px 0' }}>
          <Ornament />
        </div>
        <p style={{ margin: '0 auto', maxWidth: 520, fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.75, color: MUTED, fontStyle: 'italic' }}>
          Walk real card shows in first person, browse vendor tables and their
          binders, and hang your own collection as framed, spotlit art in a
          private 3D gallery.
        </p>

        <div style={{ marginTop: 40, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/signup')} style={{ ...primaryButtonStyle, padding: '15px 42px', fontSize: 14 }}>
            CREATE AN ACCOUNT →
          </button>
          <button onClick={() => navigate('/login')} style={{ ...ghostButtonStyle, padding: '15px 34px' }}>
            SIGN IN
          </button>
        </div>

        <div style={{ margin: '46px 0 0' }}>
          <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${HAIRLINE}, transparent)`, marginBottom: 34 }} />
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
            <SearchBox />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'stretch' }}>
            <QuickAction
              label="EXPLORE CARD SHOWS →"
              sub="browse published shows by location and walk them"
              onClick={() => navigate('/shows')}
            />
            <QuickAction
              label="VENDOR DIRECTORY →"
              sub="registered vendors across the platform"
              onClick={() => navigate('/vendors')}
            />
          </div>
          <p style={{ margin: '30px 0 0', fontSize: 13, color: MUTED, fontFamily: SERIF, fontStyle: 'italic' }}>
            No account? Everything still works in your browser —{' '}
            <Link href="/sandbox" style={{ color: GOLD }}>
              try the local sandbox →
            </Link>
          </p>
        </div>

        <footer style={{ marginTop: 84 }}>
          <div style={{ marginBottom: 14 }}>
            <Ornament width={40} />
          </div>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.2em', color: MUTED }}>
            SHOWS ARE PUBLIC · COLLECTIONS ARE YOURS
          </p>
          <SiteFooter />
        </footer>
      </div>
    </div>
  );
}
