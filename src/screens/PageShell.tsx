import type { ReactNode } from 'react';
import { Link } from 'wouter';
import type { Session } from '@supabase/supabase-js';
import { useAuth } from '../lib/auth';
import { useMyProfile } from '../lib/useMyProfile';
import SiteFooter from '../components/SiteFooter';
import {
  GOLD, HAIRLINE, TEXT, MUTED, SERIF, SANS, PAGE_BG,
  Ornament, museumHoverCss, noteStyle,
} from '../components/museumKit';

/**
 * Shared chrome for the DOM-only platform pages (auth, shows directory,
 * vendor profiles, organizer). Museum-refined masthead: small-caps eyebrow,
 * serif letterspaced title, ornament rule — matching the home page. Owns its
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
  return (
    <div
      style={{
        height: '100vh',
        overflowY: 'auto',
        background: PAGE_BG,
        color: TEXT,
        fontFamily: SANS,
        position: 'relative',
      }}
    >
      <style>{museumHoverCss}</style>
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
          fontFamily: SERIF,
          fontSize: 12,
          letterSpacing: '0.12em',
          zIndex: 2,
        }}
      >
        <Link
          href="/wants"
          style={{
            color: GOLD,
            textDecoration: 'none',
            border: `1px solid ${HAIRLINE}`,
            borderRadius: 999,
            padding: '7px 14px',
            whiteSpace: 'nowrap',
          }}
        >
          ♥ WANTS
        </Link>
        {configured && (
          <Link
            href={session ? '/account' : '/login'}
            style={{
              color: GOLD,
              textDecoration: 'none',
              border: `1px solid ${HAIRLINE}`,
              borderRadius: 999,
              padding: '7px 14px',
              whiteSpace: 'nowrap',
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
          style={{ color: GOLD, textDecoration: 'none', fontFamily: SERIF, fontSize: 12, letterSpacing: '0.22em' }}
        >
          ← VENDOR MUSEUM
        </Link>
        <header style={{ textAlign: 'center', margin: '30px 0 40px' }}>
          {eyebrow && (
            <div style={{ fontSize: 11, letterSpacing: '0.4em', color: MUTED, marginBottom: 12 }}>
              {eyebrow}
            </div>
          )}
          <h1
            style={{
              margin: 0,
              fontFamily: SERIF,
              fontWeight: 400,
              fontSize: 'clamp(24px, 7vw, 34px)',
              letterSpacing: '0.16em',
              color: GOLD,
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
  return <p style={{ ...noteStyle, fontSize: 17, lineHeight: 1.7 }}>{note}</p>;
}
