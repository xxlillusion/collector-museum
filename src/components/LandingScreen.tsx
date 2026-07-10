import { useLocation } from 'wouter';
import SearchBox from './SearchBox';
import SiteFooter from './SiteFooter';
import {
  GOLD, HAIRLINE, TEXT, MUTED, PANEL, SERIF, SANS, PAGE_BG,
  Ornament, QuickAction, primaryButtonStyle, ghostButtonStyle,
} from './museumKit';
// Hero stills captured in-app (sandbox gallery + the /demo hall).
// TODO: re-capture on a real GPU (SwiftShader stills — software GL flattens
// the warm spot pools and tablecloth sheen).
import heroGallery from '../assets/hero-gallery.webp';
import heroHall from '../assets/hero-hall.webp';

/**
 * The logged-out home: a museum-styled landing page. No local-collection
 * sections here — the guest experience lives at /sandbox; accounts get the
 * full home. Anyone (signed in or not) can browse published shows or walk
 * the bundled demo hall at /demo.
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

        {/* In-engine stills, hung museum-plaque style. */}
        <div style={{ marginTop: 42, display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
          {([
            [heroGallery, 'The private gallery — six framed cards under warm spotlights', 'The gallery — your collection, spotlit'],
            [heroHall, 'A convention hall of red-clothed vendor tables with lettered drapes', 'A show floor, walkable before you go'],
          ] as const).map(([src, alt, caption]) => (
            <figure key={caption} style={{ margin: 0, flex: '1 1 300px', maxWidth: 356 }}>
              <div style={{ border: `1px solid ${HAIRLINE}`, background: PANEL, borderRadius: 2, padding: 7 }}>
                <img src={src} alt={alt} style={{ display: 'block', width: '100%', borderRadius: 1 }} />
              </div>
              <figcaption style={{ marginTop: 9, fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, color: MUTED, letterSpacing: '0.04em' }}>
                {caption}
              </figcaption>
            </figure>
          ))}
        </div>

        {/* The wow path — see it move before committing to anything. */}
        <div style={{ marginTop: 34 }}>
          <button
            onClick={() => navigate('/demo')}
            style={{ ...ghostButtonStyle, border: `1px solid ${GOLD}`, padding: '14px 40px', fontSize: 13.5 }}
          >
            ◈ WALK A DEMO SHOW →
          </button>
          <p style={{ margin: '10px 0 0', fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, color: MUTED }}>
            a sample hall with four vendors and browsable binders — no account, nothing to install
          </p>
        </div>

        <div style={{ marginTop: 26, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/signup')} style={{ ...primaryButtonStyle, padding: '15px 42px', fontSize: 14 }}>
            CREATE AN ACCOUNT →
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
              label={'EXPLORE CARD SHOWS →'}
              sub="browse published shows by location and walk them"
              onClick={() => navigate('/shows')}
            />
            <QuickAction
              label={'VENDOR DIRECTORY →'}
              sub="registered vendors across the platform"
              onClick={() => navigate('/vendors')}
            />
            <QuickAction
              label={'TRY IT NOW →'}
              sub="everything works in your browser — no account"
              onClick={() => navigate('/sandbox')}
            />
          </div>
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
