import type { CSSProperties, ReactNode } from 'react';

/**
 * The "Museum Refined" design language, extracted from HomeScreen so every
 * DOM page (auth, shows, organizer, vendor directory, sandbox) shares one
 * aesthetic. Import from here — never re-declare these colors per screen.
 */

export const GOLD = '#d4af37';
export const BG = '#171310';
export const PANEL = '#1e1915';
export const HAIRLINE = 'rgba(212,175,55,0.28)';
export const TEXT = '#e8e4dc';
export const MUTED = '#9a8f7d';
export const ERROR = '#e0967e';
export const SERIF = 'Georgia, "Times New Roman", serif';
export const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Page background — subtle radial vignette over the museum brown. */
export const PAGE_BG =
  `radial-gradient(ellipse at 50% -20%, #2a2620 0%, ${BG} 55%, #0b0a08 100%)`;

// ---------------------------------------------------------------- elements

export function Ornament({ width = 60 }: { width?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
      <div style={{ width, height: 1, background: HAIRLINE }} />
      <span style={{ color: GOLD, fontSize: 11 }}>❖</span>
      <div style={{ width, height: 1, background: HAIRLINE }} />
    </div>
  );
}

/** Numbered gallery section — the roman-numeral headers from the home page. */
export function Section({ numeral, title, children }: {
  numeral?: string; title: string; children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
        {numeral && (
          <span style={{ fontFamily: SERIF, fontSize: 13, color: GOLD, letterSpacing: '0.1em' }}>
            {numeral}
          </span>
        )}
        <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 19, fontWeight: 500, letterSpacing: '0.14em', color: TEXT }}>
          {title}
        </h2>
      </div>
      <div style={{ height: 1, background: `linear-gradient(90deg, ${HAIRLINE}, transparent)`, marginBottom: 20 }} />
      {children}
    </section>
  );
}

/** Outlined CTA with an optional italic sub-line (home-page quick actions). */
export function QuickAction({ label, sub, onClick }: {
  label: string; sub?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{ ...ghostButtonStyle, maxWidth: 230, textAlign: 'center', padding: '11px 22px' }}>
      {label}
      {sub && (
        <span style={{
          display: 'block', marginTop: 5, fontSize: 10.5, letterSpacing: '0.05em',
          color: MUTED, fontStyle: 'italic', textTransform: 'none',
        }}>
          {sub}
        </span>
      )}
    </button>
  );
}

// ------------------------------------------------------------------ styles

/** Solid gold primary action. */
export const primaryButtonStyle: CSSProperties = {
  background: GOLD,
  color: '#1a1614',
  border: 'none',
  padding: '13px 34px',
  fontSize: 13,
  letterSpacing: '0.16em',
  fontFamily: SERIF,
  cursor: 'pointer',
  borderRadius: 2,
};

/** Disabled twin of primaryButtonStyle. */
export const primaryButtonDisabledStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: '#332b1e',
  color: '#7a6c50',
  cursor: 'not-allowed',
};

/** Outlined gold secondary action. */
export const ghostButtonStyle: CSSProperties = {
  background: 'transparent',
  color: GOLD,
  border: `1px solid ${HAIRLINE}`,
  padding: '11px 22px',
  fontSize: 12,
  letterSpacing: '0.16em',
  fontFamily: SERIF,
  cursor: 'pointer',
  borderRadius: 2,
};

/** Low-emphasis text button (cancel / back rows). */
export const subtleButtonStyle: CSSProperties = {
  background: 'transparent',
  color: MUTED,
  border: 'none',
  padding: '8px 12px',
  fontSize: 12.5,
  letterSpacing: '0.08em',
  fontFamily: SERIF,
  cursor: 'pointer',
};

/** Form field — inputs, selects, textareas. */
export const inputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  background: '#0d0b0a',
  color: TEXT,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 2,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: SERIF,
  letterSpacing: '0.03em',
  colorScheme: 'dark',
};

/** Small-caps field label. */
export const labelStyle: CSSProperties = {
  display: 'block',
  margin: '0 0 7px',
  fontSize: 11,
  letterSpacing: '0.2em',
  color: MUTED,
};

/** Hairline-bordered content card (account sections, list panels). */
export const panelStyle: CSSProperties = {
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 4,
  background: PANEL,
  padding: '24px 26px',
  marginBottom: 28,
};

/** Gold small-caps panel heading. */
export const panelTitleStyle: CSSProperties = {
  margin: '0 0 18px',
  fontSize: 13,
  fontWeight: 400,
  letterSpacing: '0.22em',
  color: GOLD,
  fontFamily: SERIF,
};

/** Italic serif commentary. */
export const noteStyle: CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.65,
  color: MUTED,
  fontStyle: 'italic',
  fontFamily: SERIF,
};

export const errorTextStyle: CSSProperties = {
  color: ERROR,
  fontSize: 13.5,
  fontFamily: SERIF,
};

/** Hover helpers shared by list rows / lifted cards. Render once per page:
 *  <style>{museumHoverCss}</style> */
export const museumHoverCss = `
  .museum-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .museum-lift:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.45); }
  .museum-row { transition: background 0.15s ease; }
  .museum-row:hover { background: rgba(212,175,55,0.06); }
`;
