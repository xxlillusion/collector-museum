import { useState } from 'react';
import { useLocation } from 'wouter';
import SearchBox from './SearchBox';
import SiteFooter from './SiteFooter';
import { Ornament, QuickAction, useTheme } from './themeKit';
import { LCD, LcdCss, LcdCursor, LcdDialog, lcdImg, lcdMenuBox, lcdMenuRow, lcdScreenFrame } from './lcdKit';
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
  const t = useTheme();
  const night = t.id === 'night';
  const lcd = t.id === 'handheld';
  // Handheld title-screen menu: which row the cursor is on (hover/focus moves
  // it; first row starts selected). State lives here so hooks stay
  // unconditional — the other themes simply never read it.
  const [selRow, setSelRow] = useState(0);

  // ------------------------------------------------------------ THE HANDHELD
  // #6a — the logged-out landing as a game TITLE SCREEN, per the design
  // mockup: © line at the top, the logo + tagline in one dialog frame, two
  // framed stills with short captions, and a tight three-row menu (NEW GAME /
  // CONTINUE / DEMO) with inline "— HINT" text. Motto line closes the screen —
  // no search box, no extra nav rows, no footer links (legal pages stay
  // linked from every routed page).
  if (lcd) {
    const menuRows = [
      { label: 'NEW GAME', hint: 'CREATE ACCOUNT', to: '/signup' },
      { label: 'CONTINUE', hint: 'SIGN IN', to: '/login' },
      { label: 'DEMO', hint: 'WALK A SHOW, NO ACCOUNT', to: '/demo' },
    ] as const;
    return (
      <div style={{ height: '100vh', overflowY: 'auto', boxSizing: 'border-box', background: t.pageBg, color: t.text, fontFamily: t.fontBody }}>
        <LcdCss />
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 12px 48px' }}>
          <div style={{ ...lcdScreenFrame, padding: 'clamp(16px, 5vw, 36px) clamp(12px, 4vw, 32px) clamp(20px, 5vw, 36px)', textAlign: 'center' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.14em', color: t.muted, marginBottom: 16, textTransform: 'uppercase' }}>
              ©2026 A PERSONAL PROJECT · BUILT WITH CARE
            </div>

            {/* The logo cartridge — stacked wordmark + tagline in one frame. */}
            <LcdDialog style={{ textAlign: 'center', marginBottom: 22, padding: '20px 16px 18px' }}>
              <h1 style={{
                margin: '0 auto', width: 'min-content', fontFamily: t.fontDisplay,
                fontSize: 'clamp(22px, 7vw, 30px)', fontWeight: 700,
                letterSpacing: '0.1em', lineHeight: 1.3,
                color: t.text, textTransform: 'uppercase',
              }}>
                VENDOR MUSEUM
              </h1>
              <div style={{ fontSize: 9.5, marginTop: 12, letterSpacing: '0.12em', color: LCD.muted }}>
                CARD SHOWS &amp; COLLECTIONS · IN 3D
              </div>
            </LcdDialog>

            {/* In-engine stills — pixelated onto the LCD, in ink frames. */}
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 26 }}>
              {([
                [heroGallery, 'The private gallery — six framed cards under warm spotlights', 'YOUR GALLERY'],
                [heroHall, 'A convention hall of red-clothed vendor tables with lettered drapes', 'A SHOW FLOOR'],
              ] as const).map(([src, alt, caption]) => (
                <figure key={caption} style={{ margin: 0, flex: '1 1 180px', maxWidth: 250 }}>
                  <div style={{ border: `3px solid ${LCD.ink}`, background: LCD.screen, padding: 3 }}>
                    <img src={src} alt={alt} style={{ display: 'block', width: '100%', ...lcdImg }} />
                  </div>
                  <figcaption style={{ marginTop: 7, fontSize: 9, letterSpacing: '0.1em', color: t.muted, textTransform: 'uppercase' }}>
                    {caption}
                  </figcaption>
                </figure>
              ))}
            </div>

            {/* THE MENU — three rows, hint inline after an em-dash; the ▶
                cursor moves on hover/focus and the hot row inverts whole. */}
            <div style={{ ...lcdMenuBox, maxWidth: 400, margin: '0 auto', textAlign: 'left' }}>
              {menuRows.map((r, i) => {
                const sel = selRow === i;
                return (
                  <button
                    key={r.label}
                    onClick={() => navigate(r.to)}
                    onMouseEnter={() => setSelRow(i)}
                    onFocus={() => setSelRow(i)}
                    style={{
                      width: '100%', textAlign: 'left', border: 'none', background: 'none',
                      cursor: 'pointer', outline: 'none',
                      ...lcdMenuRow(sel),
                      padding: '11px 14px',
                      ...(i === menuRows.length - 1 ? { borderBottom: 'none' } : {}),
                    }}
                  >
                    <LcdCursor active={sel} />
                    <span style={{ fontWeight: 700 }}>{r.label}</span>
                    <span style={{ fontSize: 8.5, letterSpacing: '0.06em', fontWeight: 400, color: sel ? LCD.screen : LCD.muted, whiteSpace: 'nowrap' }}>
                      — {r.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            <footer style={{ marginTop: 32 }}>
              <p style={{ margin: 0, fontSize: 9, letterSpacing: '0.14em', color: t.muted, textTransform: 'uppercase' }}>
                SHOWS ARE PUBLIC · COLLECTIONS ARE YOURS
              </p>
            </footer>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', overflowY: 'auto', boxSizing: 'border-box', background: t.pageBg, color: t.text, fontFamily: t.fontBody }}>
      {/* night-only ticker strip — poster energy above the hero. */}
      {night && (
        <div
          style={{
            background: t.accent,
            color: t.accentContrast,
            fontFamily: t.fontDisplay,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            padding: '7px 0',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
        >
          CARD SHOWS ★ VENDOR BOOTHS ★ COLLECTIONS ★ WALK IT IN 3D ★ CARD SHOWS ★ VENDOR BOOTHS ★ COLLECTIONS ★ WALK IT IN 3D
        </div>
      )}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '96px 28px 80px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.4em', color: t.muted, marginBottom: 14, fontFamily: t.id === 'refined' ? undefined : t.fontMono }}>
          EST. 2026 · CARD SHOWS &amp; COLLECTIONS
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: t.fontDisplay,
            fontSize: night ? 'clamp(40px, 12vw, 64px)' : 'clamp(30px, 10vw, 48px)',
            fontWeight: t.displayWeight,
            letterSpacing: night ? '0.05em' : '0.18em',
            lineHeight: night ? 0.95 : undefined,
            color: t.accent,
            textTransform: t.displayTransform,
            textShadow: t.heroGlow,
          }}
        >
          VENDOR MUSEUM
        </h1>
        <div style={{ margin: '20px 0' }}>
          <Ornament />
        </div>
        <p style={{ ...t.note, margin: '0 auto', maxWidth: 520, fontSize: 15.5, lineHeight: 1.75 }}>
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
              <div style={{ border: `${t.borderWidth}px solid ${t.border}`, background: t.panel, borderRadius: 2, padding: 7 }}>
                <img src={src} alt={alt} style={{ display: 'block', width: '100%', borderRadius: 1 }} />
              </div>
              <figcaption style={{ ...t.note, marginTop: 9, fontSize: 12.5, lineHeight: undefined, letterSpacing: '0.04em' }}>
                {caption}
              </figcaption>
            </figure>
          ))}
        </div>

        {/* The wow path — see it move before committing to anything. */}
        <div style={{ marginTop: 34 }}>
          <button
            onClick={() => navigate('/demo')}
            style={{ ...t.ghostButton, border: `${t.borderWidth}px solid ${t.accent}`, padding: '14px 40px', fontSize: 13.5 }}
          >
            ◈ WALK A DEMO SHOW →
          </button>
          <p style={{ ...t.note, margin: '10px 0 0', fontSize: 12.5, lineHeight: undefined }}>
            a sample hall with four vendors and browsable binders — no account, nothing to install
          </p>
        </div>

        <div style={{ marginTop: 26, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/signup')} style={{ ...t.primaryButton, padding: '15px 42px', fontSize: 14 }}>
            CREATE AN ACCOUNT →
          </button>
          <button onClick={() => navigate('/login')} style={{ ...t.ghostButton, padding: '15px 34px' }}>
            SIGN IN
          </button>
        </div>

        <div style={{ margin: '46px 0 0' }}>
          <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${t.border}, transparent)`, marginBottom: 34 }} />
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
            <SearchBox />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'stretch' }}>
            <QuickAction
              label={'EXPLORE CARD SHOWS →'}
              sub="browse published shows by location and walk them"
              onClick={() => navigate('/shows')}
            />
            <QuickAction
              label={'VENDOR DIRECTORY →'}
              sub="registered vendors across the platform"
              onClick={() => navigate('/vendors')}
            />
            <QuickAction
              label={'TRY IT NOW →'}
              sub="everything works in your browser — no account"
              onClick={() => navigate('/sandbox')}
            />
          </div>
        </div>

        <footer style={{ marginTop: 84 }}>
          <div style={{ marginBottom: 14 }}>
            <Ornament width={40} />
          </div>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.2em', color: t.muted, fontFamily: t.id === 'refined' ? undefined : t.fontMono }}>
            SHOWS ARE PUBLIC · COLLECTIONS ARE YOURS
          </p>
          <SiteFooter />
        </footer>
      </div>
    </div>
  );
}
