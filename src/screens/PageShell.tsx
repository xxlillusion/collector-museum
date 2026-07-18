import type { ReactNode } from 'react';
import { Link } from 'wouter';
import type { Session } from '@supabase/supabase-js';
import { useAuth } from '../lib/auth';
import { useMyProfile } from '../lib/useMyProfile';
import SiteFooter from '../components/SiteFooter';
import { Ornament, useTheme } from '../components/themeKit';
import { LcdDialog, lcdScreenFrame } from '../components/lcdKit';

/**
 * Shared chrome for the DOM-only platform pages (auth, shows directory,
 * vendor profiles, organizer). Themed masthead: small-caps eyebrow,
 * letterspaced display title, ornament rule — matching the home page. Owns its
 * own scrolling — html/body/#root keep overflow hidden for the canvases.
 *
 * THE HANDHELD: the page body paints the device shell (t.pageBg) and every
 * routed page's content lives inside the LCD screen frame. Per the design
 * mockups (#6b–#6d) the header is a single compact row — title left, nav
 * right (◀ HOME · ♥ WANTS · inverted account chip) — over a 4px double rule.
 * Detail pages replace the nav with page meta via the `aside` prop
 * ("AUG 02 · SEATTLE, WA", contact chips). No centered masthead, no eyebrow.
 */
/** Signup writes display_name into auth metadata (lib/auth.tsx), so it's
 *  available synchronously while the profile row is still loading. */
function metadataDisplayName(session: Session): string | null {
  const raw: unknown = session.user.user_metadata?.display_name;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** Corner-pill label: profile display name → signup metadata → email. */
export function accountLabel(
  session: Session,
  profileName: string | null | undefined,
): string {
  return (
    (profileName ?? '').trim()
    || metadataDisplayName(session)
    || session.user.email
    || 'MY ACCOUNT'
  );
}

export default function PageShell({ title, eyebrow, wide, aside, children }: {
  title: string;
  /** Small-caps line above the title, e.g. "PUBLIC DIRECTORY". */
  eyebrow?: string;
  /** Widens the content column (plan editors need the room). */
  wide?: boolean;
  /** THE HANDHELD only: right side of the LCD title row — page meta that
   *  replaces the default ◀ HOME / ♥ WANTS / account nav (mockups #6c/#6d
   *  show "AUG 02 · SEATTLE, WA" and "WEB ↗ / MAIL ✉" there). Ignored by
   *  every other theme. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const { configured, session } = useAuth();
  const { profile } = useMyProfile();
  const t = useTheme();
  const night = t.id === 'night';
  const lcd = t.id === 'handheld';
  const cornerPill = {
    color: t.accent,
    textDecoration: 'none',
    border: `${t.borderWidth}px solid ${t.border}`,
    borderRadius: 999,
    padding: '7px 14px',
    whiteSpace: 'nowrap',
  } as const;

  // ------------------------------------------------------------ THE HANDHELD
  if (lcd) {
    const navLink = {
      color: t.muted,
      textDecoration: 'none',
      fontWeight: 700,
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    } as const;
    const lcdNav = (
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          fontFamily: t.fontMono,
          fontSize: 9.5,
          letterSpacing: '0.06em',
          minWidth: 0,
        }}
      >
        <Link href="/" style={{ ...navLink, color: t.text }}>
          ◀ HOME
        </Link>
        <Link href="/wants" style={navLink}>
          ♥ WANTS
        </Link>
        {configured && (
          <Link
            href={session ? '/account' : '/login'}
            style={{
              ...navLink,
              background: t.accent,
              color: t.accentContrast,
              padding: '3px 7px',
              maxWidth: 'min(34vw, 200px)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session ? accountLabel(session, profile?.displayName) : 'SIGN IN'}
          </Link>
        )}
      </nav>
    );
    return (
      <div
        style={{
          height: '100vh',
          overflowY: 'auto',
          background: t.pageBg,
          color: t.text,
          fontFamily: t.fontBody,
          position: 'relative',
        }}
      >
        <style>{t.hoverCss}</style>
        <div
          style={{
            maxWidth: wide ? 1100 : 980,
            margin: '0 auto',
            // Sides go near-full-bleed on mobile while leaving room for the
            // frame's drop shadow.
            padding: '26px clamp(10px, 2.5vw, 24px) 44px',
          }}
        >
          <div style={{ ...lcdScreenFrame, padding: 'clamp(16px, 3.5vw, 24px)' }}>
            {/* The mockup header row: compact title left, nav/meta right. */}
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                borderBottom: `4px double ${t.border}`,
                padding: '2px 2px 10px',
                marginBottom: 20,
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontFamily: t.fontDisplay,
                  fontWeight: 700,
                  fontSize: 'clamp(13px, 3.6vw, 16px)',
                  letterSpacing: '0.08em',
                  color: t.text,
                  textTransform: 'uppercase',
                  minWidth: 0,
                }}
              >
                {title}
              </h1>
              {aside ?? lcdNav}
            </header>
            {children}
            <SiteFooter />
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------- refined / night / lobby
  return (
    <div
      style={{
        height: '100vh',
        overflowY: 'auto',
        background: t.pageBg,
        color: t.text,
        fontFamily: t.fontBody,
        position: 'relative',
      }}
    >
      <style>{t.hoverCss}</style>
      {/* Corner chrome: sized to clear the "← VENDOR MUSEUM" back link at
          375px — single row, ellipsized account label, bottom above y=48. */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 22,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: 'calc(100vw - 44px)',
          fontFamily: t.fontMono,
          fontSize: 12,
          letterSpacing: '0.12em',
          zIndex: 2,
        }}
      >
        <Link href="/wants" style={cornerPill}>
          ♥ WANTS
        </Link>
        {configured && (
          <Link
            href={session ? '/account' : '/login'}
            style={{
              ...cornerPill,
              maxWidth: 'min(40vw, 240px)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session ? accountLabel(session, profile?.displayName) : 'SIGN IN'}
          </Link>
        )}
      </div>
      <div style={{ maxWidth: wide ? 1100 : 880, margin: '0 auto', padding: '48px clamp(16px, 4vw, 24px) 80px' }}>
        <Link
          href="/"
          style={{ color: t.accent, textDecoration: 'none', fontFamily: t.fontMono, fontSize: 12, letterSpacing: '0.22em' }}
        >
          ← VENDOR MUSEUM
        </Link>
        <header style={{ textAlign: 'center', margin: '30px 0 40px' }}>
          {eyebrow && (
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.4em',
                color: t.muted,
                marginBottom: 12,
                fontFamily: t.id === 'refined' ? undefined : t.fontMono,
              }}
            >
              {eyebrow}
            </div>
          )}
          <h1
            style={{
              margin: 0,
              fontFamily: t.fontDisplay,
              fontWeight: t.displayWeight,
              fontSize: night ? 'clamp(30px, 8vw, 44px)' : 'clamp(24px, 7vw, 34px)',
              letterSpacing: night ? '0.05em' : '0.16em',
              lineHeight: night ? 0.98 : undefined,
              color: t.accent,
              textTransform: 'uppercase',
            }}
          >
            {title}
          </h1>
          <div style={{ marginTop: 16 }}>
            <Ornament width={46} />
          </div>
        </header>
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}

/** Placeholder body for routes whose workstream hasn't landed yet. */
export function ComingSoon({ note }: { note: string }) {
  const t = useTheme();
  return t.id === 'handheld' ? (
    <div style={{ maxWidth: 460, margin: '0 auto' }}>
      <LcdDialog cursor>{note}</LcdDialog>
    </div>
  ) : (
    <p style={{ ...t.note, fontSize: 17, lineHeight: 1.7 }}>{note}</p>
  );
}
