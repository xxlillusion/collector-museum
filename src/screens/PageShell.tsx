import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { useAuth } from '../lib/auth';
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
export default function PageShell({ title, eyebrow, wide, children }: {
  title: string;
  /** Small-caps line above the title, e.g. "PUBLIC DIRECTORY". */
  eyebrow?: string;
  /** Widens the content column (plan editors need the room). */
  wide?: boolean;
  children: ReactNode;
}) {
  const { configured, session } = useAuth();
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
      {configured && (
        <div style={{ position: 'absolute', top: 18, right: 22, fontFamily: SERIF, fontSize: 12, letterSpacing: '0.12em' }}>
          <Link
            href={session ? '/account' : '/login'}
            style={{ color: GOLD, textDecoration: 'none', border: `1px solid ${HAIRLINE}`, borderRadius: 999, padding: '8px 18px' }}
          >
            {session ? (session.user.email ?? 'MY ACCOUNT') : 'SIGN IN'}
          </Link>
        </div>
      )}
      <div style={{ maxWidth: wide ? 1100 : 880, margin: '0 auto', padding: '48px 24px 80px' }}>
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
              fontSize: 34,
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
      </div>
    </div>
  );
}

/** Placeholder body for routes whose workstream hasn't landed yet. */
export function ComingSoon({ note }: { note: string }) {
  return <p style={{ ...noteStyle, fontSize: 17, lineHeight: 1.7 }}>{note}</p>;
}
