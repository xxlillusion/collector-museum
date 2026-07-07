import type { ReactNode } from 'react';
import { Link } from 'wouter';

/**
 * Shared chrome for the DOM-only platform pages (auth, shows directory,
 * vendor profiles). Matches the museum-refined home aesthetic. Owns its own
 * scrolling — html/body/#root keep overflow hidden for the canvases.
 */
export default function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        height: '100vh',
        overflowY: 'auto',
        background: 'radial-gradient(ellipse at 50% -20%, #2a2620 0%, #14120e 55%, #0b0a08 100%)',
        color: '#e8e0d0',
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link
          href="/"
          style={{ color: '#d4af37', textDecoration: 'none', fontSize: 14, letterSpacing: 1 }}
        >
          ← VENDOR MUSEUM
        </Link>
        <h1
          style={{
            margin: '28px 0 6px',
            fontWeight: 400,
            fontSize: 34,
            letterSpacing: 2,
            color: '#f0e6ce',
          }}
        >
          {title}
        </h1>
        <div style={{ width: 64, height: 2, background: '#d4af37', margin: '14px 0 30px' }} />
        {children}
      </div>
    </div>
  );
}

/** Placeholder body for routes whose workstream hasn't landed yet. */
export function ComingSoon({ note }: { note: string }) {
  return (
    <p style={{ fontSize: 17, lineHeight: 1.7, color: '#b7ad98', fontStyle: 'italic' }}>{note}</p>
  );
}
