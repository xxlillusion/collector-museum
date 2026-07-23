import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { LCD, PIXEL_FONT, LCD_BLINK_CSS } from './lcdKit';

/**
 * themeKit — museumKit.tsx generalized into a runtime-switchable theme system.
 *
 * Four themes for the beta:
 *   'refined'  — the current "Museum Refined" look (museumKit values, unchanged)
 *   'night'    — "Show Floor, Night" (design canvas 3a / 4a–4c)
 *   'lobby'    — "Charcoal Lobby"    (design canvas 3b / 4d–4f)
 *   'handheld' — "The Handheld"      (beta_huge_redesign/handoff/HANDHELD.md):
 *                1999 LCD-handheld chrome. Token-level styling lives here;
 *                the signature moves (screen frame, dialog boxes, menu rows,
 *                blink) live in lcdKit.tsx and are rendered inside
 *                `t.id === 'handheld'` branches per screen.
 *
 * Usage:
 *   <ThemeProvider>…</ThemeProvider>       // once, above the DOM screens
 *   const t = useTheme();                  // in any screen
 *   <h1 style={{ fontFamily: t.fontDisplay, color: t.text }}>…</h1>
 *   <button style={t.primaryButton}>WALK →</button>
 *
 * Migration from museumKit constants:
 *   GOLD → t.accent · BG → t.bg · PANEL → t.panel · HAIRLINE → t.border
 *   TEXT → t.text · MUTED → t.muted · ERROR → t.error
 *   SERIF → t.fontDisplay (headings) / t.fontMono (small-caps meta, labels,
 *   letterspaced pills) — NEVER t.fontBody (refined's body font is sans)
 *   SANS → t.fontBody · PAGE_BG → t.pageBg · museumHoverCss → t.hoverCss
 *   primaryButtonStyle → t.primaryButton · ghostButtonStyle → t.ghostButton
 *   subtleButtonStyle → t.subtleButton
 *   primaryButtonDisabledStyle → t.primaryButtonDisabled
 *   inputStyle → t.input · labelStyle → t.label · panelStyle → t.panelStyle
 *   panelTitleStyle → t.panelTitle · noteStyle → t.note
 *   errorTextStyle → t.errorText
 *   Ornament / Section / QuickAction → same names, exported from here (themed)
 *   1px borders built from HAIRLINE → `${t.borderWidth}px solid ${t.border}`
 *   rgba(212,175,55,α) accent tints → withAlpha(t.accent, α)
 *
 * The 3D canvases (Scene/VendorScene) are untouched — themes only restyle the
 * DOM chrome and overlays (HUD, minimap frame, InspectOverlay placard).
 */

export type ThemeId = 'refined' | 'night' | 'lobby' | 'handheld';

export interface Theme {
  id: ThemeId;
  /** Human-readable theme name (the field-label recipe is `label` below). */
  name: string;
  // -------------------------------------------------- palette
  bg: string;
  pageBg: string;          // full-page background (gradient ok)
  panel: string;           // raised panel surface
  surface: string;         // inputs / wells (darker than panel)
  text: string;
  muted: string;
  accent: string;          // the ONE brand accent (gold / red / oxblood)
  accentContrast: string;  // text color on top of accent
  accent2: string;         // secondary accent (night only: blue) — falls back to accent
  border: string;          // hairline / border color
  borderWidth: number;     // 1 (hairlines) or 2 (poster borders)
  error: string;
  ok: string;              // "done" green for checklists
  // -------------------------------------------------- type
  fontDisplay: string;     // headlines
  fontBody: string;        // running copy / UI
  fontMono: string;        // labels, meta, small caps rows
  displayTransform: 'uppercase' | 'none';
  displayWeight: number;   // font-weight for display headings
  heroGlow: string;        // text-shadow for hero headlines ('none' except night)
  radius: number;
  // -------------------------------------------------- recipes
  primaryButton: CSSProperties;
  primaryButtonDisabled: CSSProperties;
  ghostButton: CSSProperties;
  subtleButton: CSSProperties;
  input: CSSProperties;
  label: CSSProperties;    // small-caps field label
  panelStyle: CSSProperties;
  panelTitle: CSSProperties;
  note: CSSProperties;     // italic/muted commentary
  errorText: CSSProperties;
  chip: CSSProperties;     // price / status / count chips
  hoverCss: string;
  /** Card-image frame (collection grids). */
  cardFrame: CSSProperties;
  /** CSS filter applied to floor-plan images so plans sit in the theme. */
  planFilter: string;
  /** Booth-dot color on plans/minimap ('' = keep the gold dots). */
  boothDot: string;
}

/** '#rrggbb' + alpha → 'rgba(…)'. For tints/glows derived from theme colors. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ============================================================ refined
// Values copied verbatim from museumKit.tsx — the control group.

const refined: Theme = (() => {
  const GOLD = '#d4af37', BG = '#171310', PANEL = '#1e1915';
  const HAIRLINE = 'rgba(212,175,55,0.28)', TEXT = '#e8e4dc', MUTED = '#9a8f7d';
  const SERIF = 'Georgia, "Times New Roman", serif';
  const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const primaryButton: CSSProperties = { background: GOLD, color: '#1a1614', border: 'none', padding: '13px 34px', fontSize: 13, letterSpacing: '0.16em', fontFamily: SERIF, cursor: 'pointer', borderRadius: 2 };
  return {
    id: 'refined', name: 'Museum Refined',
    bg: BG, pageBg: `radial-gradient(ellipse at 50% -20%, #2a2620 0%, ${BG} 55%, #0b0a08 100%)`,
    panel: PANEL, surface: '#0d0b0a', text: TEXT, muted: MUTED,
    accent: GOLD, accentContrast: '#1a1614', accent2: GOLD,
    border: HAIRLINE, borderWidth: 1, error: '#e0967e', ok: GOLD,
    fontDisplay: SERIF, fontBody: SANS, fontMono: SERIF, displayTransform: 'none',
    displayWeight: 400, heroGlow: 'none',
    radius: 2,
    primaryButton,
    primaryButtonDisabled: { ...primaryButton, background: '#332b1e', color: '#7a6c50', cursor: 'not-allowed' },
    ghostButton: { background: 'transparent', color: GOLD, border: `1px solid ${HAIRLINE}`, padding: '11px 22px', fontSize: 12, letterSpacing: '0.16em', fontFamily: SERIF, cursor: 'pointer', borderRadius: 2 },
    subtleButton: { background: 'transparent', color: MUTED, border: 'none', padding: '8px 12px', fontSize: 12.5, letterSpacing: '0.08em', fontFamily: SERIF, cursor: 'pointer' },
    input: { display: 'block', width: '100%', boxSizing: 'border-box', background: '#0d0b0a', color: TEXT, border: `1px solid ${HAIRLINE}`, borderRadius: 2, padding: '10px 12px', fontSize: 14, fontFamily: SERIF, letterSpacing: '0.03em', colorScheme: 'dark' },
    label: { display: 'block', margin: '0 0 7px', fontSize: 11, letterSpacing: '0.2em', color: MUTED },
    panelStyle: { border: `1px solid ${HAIRLINE}`, borderRadius: 4, background: PANEL, padding: '24px 26px', marginBottom: 28 },
    panelTitle: { margin: '0 0 18px', fontSize: 13, fontWeight: 400, letterSpacing: '0.22em', color: GOLD, fontFamily: SERIF },
    note: { fontSize: 14.5, lineHeight: 1.65, color: MUTED, fontStyle: 'italic', fontFamily: SERIF },
    errorText: { color: '#e0967e', fontSize: 13.5, fontFamily: SERIF },
    chip: { fontFamily: SERIF, fontSize: 10, letterSpacing: '0.2em', color: GOLD, border: `1px solid ${HAIRLINE}`, borderRadius: 2, padding: '2px 8px' },
    hoverCss: `
      .museum-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
      .museum-lift:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.45); }
      .museum-row { transition: background 0.15s ease; }
      .museum-row:hover { background: rgba(212,175,55,0.06); }
    `,
    cardFrame: { borderRadius: 2, border: '3px solid #3a2f1e', outline: `1px solid ${HAIRLINE}`, outlineOffset: 3, boxSizing: 'border-box' },
    planFilter: 'none', boothDot: '',
  };
})();

// ============================================================ night
// "Show Floor, Night" — poster energy on warm ink black. Canvas 3a / 4a–4c.
// Fonts: Barlow Condensed 600–800 (display), Archivo 400–900 (body),
// IBM Plex Mono 400–600 (labels). Load via <link> in index.html — see THEMES.md.

const night: Theme = (() => {
  const BG = '#171411', PANEL = '#201b15', SURFACE = '#241f18';
  const CREAM = '#f2ecdf', MUTED = '#a39a89', RED = '#e0563c', BLUE = '#7096e6';
  const CONDENSED = "'Barlow Condensed', 'Arial Narrow', sans-serif";
  const BODY = "Archivo, system-ui, sans-serif";
  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  const primaryButton: CSSProperties = { background: RED, color: BG, border: 'none', padding: '14px 28px', fontFamily: BODY, fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', cursor: 'pointer', borderRadius: 3, boxShadow: `4px 4px 0 ${CREAM}` };
  return {
    id: 'night', name: 'Show Floor · Night',
    bg: BG, pageBg: BG,
    panel: PANEL, surface: SURFACE, text: CREAM, muted: MUTED,
    accent: RED, accentContrast: BG, accent2: BLUE,
    border: 'rgba(242,236,223,0.35)', borderWidth: 2, error: '#e0563c', ok: '#57b878',
    fontDisplay: CONDENSED, fontBody: BODY, fontMono: MONO, displayTransform: 'uppercase',
    displayWeight: 800, heroGlow: '0 0 34px rgba(224,86,60,0.3)',
    radius: 3,
    // Solid red block with the cream offset shadow — the signature move.
    primaryButton,
    primaryButtonDisabled: { ...primaryButton, background: '#3a332b', color: '#7d7466', boxShadow: 'none', cursor: 'not-allowed' },
    ghostButton: { background: 'transparent', color: CREAM, border: `2px solid ${CREAM}`, padding: '13px 22px', fontFamily: BODY, fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', cursor: 'pointer', borderRadius: 3 },
    subtleButton: { background: 'transparent', color: MUTED, border: 'none', padding: '8px 12px', fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.08em', cursor: 'pointer' },
    input: { display: 'block', width: '100%', boxSizing: 'border-box', background: BG, color: CREAM, border: '2px solid rgba(242,236,223,0.35)', borderRadius: 3, padding: '11px 12px', fontSize: 13, fontFamily: BODY, fontWeight: 600, colorScheme: 'dark' },
    label: { display: 'block', margin: '0 0 7px', fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', color: MUTED },
    panelStyle: { border: '2px solid rgba(242,236,223,0.35)', borderRadius: 6, background: PANEL, padding: '20px 22px', marginBottom: 24 },
    panelTitle: { margin: '0 0 14px', fontFamily: MONO, fontSize: 11, fontWeight: 400, letterSpacing: '0.2em', color: MUTED },
    note: { fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: MUTED },
    errorText: { color: '#e0563c', fontSize: 12.5, fontFamily: BODY, fontWeight: 600 },
    chip: { background: RED, color: BG, fontFamily: MONO, fontSize: 10.5, fontWeight: 600, borderRadius: 3, padding: '2px 7px' },
    hoverCss: `
      .museum-lift { transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .museum-lift:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 rgba(224,86,60,0.9); }
      .museum-row { transition: background 0.15s ease; }
      .museum-row:hover { background: rgba(224,86,60,0.08); }
    `,
    cardFrame: { borderRadius: 4, border: `2px solid ${CREAM}`, boxSizing: 'border-box' },
    planFilter: 'invert(0.92) hue-rotate(180deg) saturate(0.4)',
    boothDot: RED,
  };
})();

// ============================================================ lobby
// "Charcoal Lobby" — wayfinding signage on warm charcoal, oxblood accent,
// ivory enamel signs. Canvas 3b / 4d–4f.
// Fonts: DM Serif Display (display), IBM Plex Mono 400–600 (everything else).

const lobby: Theme = (() => {
  const IVORY = '#efeae0', MUTED = '#9b948a', OX = '#a84b36';
  const BOARD = '#100e0d';
  const SERIF = "'DM Serif Display', Georgia, serif";
  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  const primaryButton: CSSProperties = { background: OX, color: IVORY, border: 'none', padding: '13px 28px', fontFamily: MONO, fontWeight: 600, fontSize: 12, letterSpacing: '0.12em', cursor: 'pointer', borderRadius: 2 };
  return {
    id: 'lobby', name: 'Charcoal Lobby',
    bg: '#161414', pageBg: 'linear-gradient(180deg, #1b1918 0%, #161414 60%, #121010 100%)',
    panel: 'rgba(10,9,8,0.5)', surface: BOARD, text: IVORY, muted: MUTED,
    accent: OX, accentContrast: IVORY, accent2: OX,
    border: 'rgba(239,234,224,0.22)', borderWidth: 1, error: '#c76a55', ok: OX,
    fontDisplay: SERIF, fontBody: MONO, fontMono: MONO, displayTransform: 'none',
    displayWeight: 400, heroGlow: 'none',
    radius: 2,
    primaryButton,
    primaryButtonDisabled: { ...primaryButton, background: '#463029', color: '#9b948a', cursor: 'not-allowed' },
    ghostButton: { background: 'transparent', color: IVORY, border: '1px solid rgba(239,234,224,0.4)', padding: '13px 22px', fontFamily: MONO, fontWeight: 600, fontSize: 12, letterSpacing: '0.12em', cursor: 'pointer', borderRadius: 2 },
    subtleButton: { background: 'transparent', color: MUTED, border: 'none', padding: '8px 12px', fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', cursor: 'pointer' },
    input: { display: 'block', width: '100%', boxSizing: 'border-box', background: BOARD, color: IVORY, border: '1px solid rgba(239,234,224,0.3)', borderRadius: 2, padding: '10px 12px', fontSize: 12, fontFamily: MONO, colorScheme: 'dark' },
    label: { display: 'block', margin: '0 0 7px', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.24em', color: MUTED },
    panelStyle: { border: '1px solid rgba(239,234,224,0.22)', borderRadius: 6, background: BOARD, padding: '20px 22px', marginBottom: 24 },
    panelTitle: { margin: '0 0 14px', fontFamily: MONO, fontSize: 10.5, fontWeight: 400, letterSpacing: '0.3em', color: MUTED },
    note: { fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: MUTED, letterSpacing: '0.04em' },
    errorText: { color: '#c76a55', fontSize: 12, fontFamily: MONO },
    chip: { border: `1px solid ${OX}`, color: OX, fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', borderRadius: 2, padding: '2px 8px' },
    hoverCss: `
      .museum-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
      .museum-lift:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.55); }
      .museum-row { transition: background 0.15s ease; }
      .museum-row:hover { background: rgba(168,75,54,0.08); }
    `,
    cardFrame: { borderRadius: 2, border: '3px solid #2e2a26', outline: '1px solid rgba(239,234,224,0.25)', outlineOffset: 3, boxSizing: 'border-box' },
    planFilter: 'invert(0.9) sepia(0.25) saturate(0.6)',
    boothDot: OX,
  };
})();

// ============================================================ handheld
// "The Handheld" — full 1999 LCD-handheld nostalgia (HANDHELD.md). The first
// LIGHT theme: four green LCD shades + ink. No gold/red/blue anywhere —
// accent IS ink, so accent-background elements render as the inversion idiom
// (ink box, screen text) and accent-colored text renders as ink. States are
// inversion / weight / ▶ / blink, never hue. Silkscreen for everything.

const handheld: Theme = (() => {
  const primaryButton: CSSProperties = {
    background: LCD.ink, color: LCD.screen, border: 'none', padding: '12px 22px',
    fontFamily: PIXEL_FONT, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em',
    cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase',
  };
  return {
    id: 'handheld', name: 'The Handheld',
    bg: LCD.screen, pageBg: LCD.shell,
    panel: LCD.panel, surface: LCD.mid, text: LCD.ink, muted: LCD.muted,
    accent: LCD.ink, accentContrast: LCD.screen, accent2: LCD.ink,
    border: LCD.ink, borderWidth: 2, error: LCD.ink, ok: LCD.ink,
    fontDisplay: PIXEL_FONT, fontBody: PIXEL_FONT, fontMono: PIXEL_FONT,
    displayTransform: 'uppercase', displayWeight: 700, heroGlow: 'none',
    radius: 0,
    primaryButton,
    primaryButtonDisabled: { ...primaryButton, background: LCD.mid, color: LCD.muted, cursor: 'not-allowed' },
    ghostButton: { background: LCD.panel, color: LCD.ink, border: `3px solid ${LCD.ink}`, padding: '10px 18px', fontFamily: PIXEL_FONT, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.08em', cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase' },
    subtleButton: { background: 'transparent', color: LCD.muted, border: 'none', padding: '8px 12px', fontFamily: PIXEL_FONT, fontSize: 10, letterSpacing: '0.06em', cursor: 'pointer', textTransform: 'uppercase' },
    input: { display: 'block', width: '100%', boxSizing: 'border-box', background: LCD.screen, color: LCD.ink, border: `3px solid ${LCD.ink}`, borderRadius: 0, padding: '9px 10px', fontSize: 11, fontFamily: PIXEL_FONT, letterSpacing: '0.04em', textTransform: 'uppercase', colorScheme: 'light' },
    label: { display: 'block', margin: '0 0 7px', fontFamily: PIXEL_FONT, fontSize: 9, letterSpacing: '0.1em', color: LCD.muted, textTransform: 'uppercase' },
    panelStyle: { border: `3px solid ${LCD.ink}`, borderRadius: 0, background: LCD.panel, padding: '16px 18px', marginBottom: 24 },
    panelTitle: { margin: '0 0 14px', fontFamily: PIXEL_FONT, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: LCD.ink, textTransform: 'uppercase' },
    note: { fontFamily: PIXEL_FONT, fontSize: 10, lineHeight: 1.9, color: LCD.muted, letterSpacing: '0.04em', textTransform: 'uppercase' },
    // Errors are inverted boxes with a "!" prefix (streams add the prefix).
    errorText: { display: 'inline-block', background: LCD.ink, color: LCD.screen, fontFamily: PIXEL_FONT, fontSize: 10, fontWeight: 700, padding: '4px 8px', letterSpacing: '0.06em', textTransform: 'uppercase' },
    chip: { background: LCD.panel, color: LCD.ink, border: `2px solid ${LCD.ink}`, borderRadius: 0, fontFamily: PIXEL_FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 6px', textTransform: 'uppercase' },
    hoverCss: `
      .museum-lift { transition: none; }
      .museum-lift:hover { transform: translate(1px, 1px); box-shadow: none; }
      .museum-row { transition: none; }
      .museum-row:hover { background: ${LCD.mid}; }
      ${LCD_BLINK_CSS}
    `,
    cardFrame: { borderRadius: 0, border: `3px solid ${LCD.ink}`, background: LCD.screen, padding: 3, boxSizing: 'border-box', imageRendering: 'pixelated', filter: 'saturate(0.75) contrast(1.05)' },
    planFilter: 'grayscale(1) sepia(0.4) hue-rotate(50deg) saturate(1.6) brightness(1.05) contrast(0.95)',
    boothDot: LCD.ink,
  };
})();

// ============================================================ provider

export const THEMES: Record<ThemeId, Theme> = { refined, night, lobby, handheld };

const STORAGE_KEY = 'vendor-museum:theme';

function readStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'refined' || v === 'night' || v === 'lobby' || v === 'handheld') return v;
  } catch { /* private mode */ }
  return 'refined';
}

interface ThemeContextValue {
  theme: Theme;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: refined,
  themeId: 'refined',
  setThemeId: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(readStoredTheme);
  const setThemeId = (id: ThemeId) => {
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
    setThemeIdState(id);
  };
  // Keep the document background in sync so overscroll doesn't flash.
  useEffect(() => {
    document.documentElement.style.background = THEMES[themeId].bg;
  }, [themeId]);
  const value = useMemo(
    () => ({ theme: THEMES[themeId], themeId, setThemeId }),
    [themeId],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The active theme's tokens + recipes. */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** For the switcher UI. */
export function useThemeSwitch(): ThemeContextValue {
  return useContext(ThemeContext);
}

// ============================================================ elements
// Themed twins of museumKit's shared elements — same props, same markup,
// pixel-identical under 'refined'.

export function Ornament({ width = 60 }: { width?: number }) {
  const t = useTheme();
  const glyph = t.id === 'night' ? '★' : t.id === 'lobby' ? '◆' : t.id === 'handheld' ? '■' : '❖';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
      <div style={{ width, height: t.borderWidth, background: t.border }} />
      <span style={{ color: t.accent, fontSize: 11 }}>{glyph}</span>
      <div style={{ width, height: t.borderWidth, background: t.border }} />
    </div>
  );
}

/** Numbered gallery section — the roman-numeral headers from the home page. */
export function Section({ numeral, title, children }: {
  numeral?: string; title: string; children: ReactNode;
}) {
  const t = useTheme();
  const night = t.id === 'night';
  return (
    <section style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
        {numeral && (
          <span style={{ fontFamily: t.fontDisplay, fontSize: t.id === 'lobby' ? 17 : 13, color: t.accent, letterSpacing: '0.1em' }}>
            {numeral}
          </span>
        )}
        <h2 style={{
          margin: 0, fontFamily: t.fontDisplay,
          fontSize: night ? 23 : t.id === 'handheld' ? 13 : 19,
          fontWeight: night || t.id === 'handheld' ? 700 : 500,
          letterSpacing: night ? '0.05em' : t.id === 'handheld' ? '0.08em' : '0.14em',
          color: t.text, textTransform: t.displayTransform,
        }}>
          {title}
        </h2>
      </div>
      <div style={{ height: 1, background: `linear-gradient(90deg, ${t.border}, transparent)`, marginBottom: 20 }} />
      {children}
    </section>
  );
}

/** Outlined CTA with an optional italic sub-line (home-page quick actions). */
export function QuickAction({ label, sub, onClick }: {
  label: string; sub?: string; onClick: () => void;
}) {
  const t = useTheme();
  return (
    <button onClick={onClick} style={{ ...t.ghostButton, maxWidth: 230, textAlign: 'center', padding: '11px 22px' }}>
      {label}
      {sub && (
        <span style={{
          display: 'block', marginTop: 5, fontSize: 10.5, letterSpacing: '0.05em',
          color: t.muted, fontStyle: t.id === 'refined' ? 'italic' : 'normal',
          fontFamily: t.id === 'refined' ? undefined : t.fontMono,
          fontWeight: 400, textTransform: 'none',
        }}>
          {sub}
        </span>
      )}
    </button>
  );
}
