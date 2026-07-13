import type { ReactNode } from 'react';
import { Link } from 'wouter';
import type { Session } from '@supabase/supabase-js';
import { useAuth } from '../lib/auth';
import { useMyProfile } from '../lib/useMyProfile';
import SiteFooter from '../components/SiteFooter';
import { Ornament, useTheme } from '../components/themeKit';

/**
 * Shared chrome for the DOM-only platform pages (auth, shows directory,
 * vendor profiles, organizer). Themed masthead: small-caps eyebrow,
 * letterspaced display title, ornament rule — matching the home page. Owns its
 * own scrolling — html/body/#root keep overflow hidden for the canvases.
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

export default function PageShell({ title, eyebrow, wide, children }: {
  title: string;
  /** Small-caps line above the title, e.g. "PUBLIC DIRECTORY". */
  eyebrow?: string;
  /** Widens the content column (plan editors need the room). */
  wide?: boolean;
  children: ReactNode;
}) {
  const { configured, session } = useAuth();
  const { profile } = useMyProfile();
  const t = useTheme();
  const night = t.id === 'night';
  const cornerPill = {
    color: t.accent,
    textDecoration: 'none',
    border: `${t.borderWidth}px solid ${t.border}`,
    borderRadius: 999,
    padding: '7px 14px',
    whiteSpace: 'nowrap',
  } as const;
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
  return <p style={{ ...t.note, fontSize: 17, lineHeight: 1.7 }}>{note}</p>;
}
