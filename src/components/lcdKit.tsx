import type { CSSProperties, ReactNode } from 'react';

/**
 * lcdKit — shared recipes for the 'handheld' theme ("THE HANDHELD",
 * beta_huge_redesign/handoff/HANDHELD.md). 1999 LCD-handheld chrome:
 * four green shades + ink, Silkscreen pixel font, states expressed with
 * inversion / weight / ▶ cursors / blink — never hue.
 *
 * Everything here is handheld-only: components and style objects assume the
 * LCD palette and are meant to be rendered inside `t.id === 'handheld'`
 * branches. The other themes never import different values from here — they
 * simply never render these.
 *
 * themeKit's handheld theme maps the same palette onto the Theme interface
 * (token-level styling comes free via useTheme()); this file carries the
 * signature moves that tokens can't express: the screen frame, the dialog
 * box, menu rows, the SOLD stamp, and the blink keyframes.
 */

export const LCD = {
  shell: '#8b9a63',   // page/desk background around the "screen"
  screen: '#c5cfa1',  // main surface
  panel: '#d3dbb4',   // raised boxes, dialogs, menus
  mid: '#b4bf8c',     // wells: binder pages, map fields, avatar boxes
  ink: '#2b331f',     // ALL text, borders, fills
  muted: '#5c6844',   // secondary text (dimmer ink)
  shadowA: '#a8b380', // screen inner bevel
  shadowB: 'rgba(43,51,31,0.35)', // drop shadow for the screen frame
} as const;

export const PIXEL_FONT = "'Silkscreen', monospace";

/** Blink keyframes + reduced-motion guard. Baked into the handheld theme's
 *  hoverCss; overlays that don't inject t.hoverCss can mount <LcdCss/>. */
export const LCD_BLINK_CSS = `
  @keyframes lcd-blink { 50% { opacity: 0; } }
  .lcd-blink { animation: lcd-blink 1s steps(1) infinite; }
  @media (prefers-reduced-motion: reduce) { .lcd-blink { animation: none; } }
`;

/** For components outside PageShell-style chrome (3D overlays) that need the
 *  blink class without a t.hoverCss <style> nearby. Duplicate mounts are
 *  harmless — the rules are idempotent. */
export function LcdCss() {
  return <style>{LCD_BLINK_CSS}</style>;
}

// ------------------------------------------------------------- screen frame

/** THE SCREEN — one per page, wraps all page content (PageShell owns it for
 *  routed pages; standalone screens like HomeScreen wrap themselves).
 *  Page body behind it paints LCD.shell (= t.pageBg). */
export const lcdScreenFrame: CSSProperties = {
  background: LCD.screen,
  border: `4px solid ${LCD.ink}`,
  borderRadius: 6,
  boxShadow: `inset 0 0 0 2px ${LCD.shadowA}, 8px 8px 0 ${LCD.shadowB}`,
};

// ------------------------------------------------------------- dialog box

/** The signature double-border dialog box. Use for every empty state,
 *  confirmation, error, onboarding step and toast. */
export const lcdDialogBox: CSSProperties = {
  position: 'relative',
  border: `3px solid ${LCD.ink}`,
  background: LCD.panel,
  boxShadow: `inset 0 0 0 2px ${LCD.screen}, inset 0 0 0 5px ${LCD.ink}`,
  padding: '12px 16px',
  color: LCD.ink,
  fontFamily: PIXEL_FONT,
  fontSize: 10.5,
  lineHeight: 2,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

export interface LcdChoice {
  label: string;
  onClick: () => void;
  /** The active/affirmative choice: bold + visible ▶. Idle choices are muted. */
  primary?: boolean;
  disabled?: boolean;
}

/** Game-dialog box: copy + optional inline choices ("▶ YES, SHARE   NOT YET")
 *  + optional blinking ▼ (bottom-right, "awaiting input"). */
export function LcdDialog({ children, choices, cursor = false, style }: {
  children: ReactNode;
  choices?: LcdChoice[];
  cursor?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div style={{ ...lcdDialogBox, ...style }}>
      {children}
      {choices && choices.length > 0 && (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 6, alignItems: 'baseline' }}>
          {choices.map((c) => (
            <button
              key={c.label}
              onClick={c.onClick}
              disabled={c.disabled}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: c.disabled ? 'not-allowed' : 'pointer',
                fontFamily: PIXEL_FONT,
                fontSize: 10.5,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                lineHeight: 2,
                color: c.primary ? LCD.ink : LCD.muted,
                fontWeight: c.primary ? 700 : 400,
                opacity: c.disabled ? 0.55 : 1,
              }}
            >
              <LcdCursor active={!!c.primary} />
              {c.label}
            </button>
          ))}
        </div>
      )}
      {cursor && (
        <span
          aria-hidden
          className="lcd-blink"
          style={{ position: 'absolute', right: 9, bottom: 5, fontSize: 9, color: LCD.ink, lineHeight: 1 }}
        >
          ▼
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------- menus / rows

/** Menu/list container: 3px ink border on panel. Rows via lcdMenuRow(). */
export const lcdMenuBox: CSSProperties = {
  border: `3px solid ${LCD.ink}`,
  background: LCD.panel,
};

/** Menu row: selected = inverted (ink bg, screen text) with leading ▶;
 *  unselected rows keep the ▶ slot so text aligns (render <LcdCursor/>). */
export function lcdMenuRow(selected: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 12px',
    borderBottom: `2px solid ${LCD.mid}`,
    fontFamily: PIXEL_FONT,
    fontSize: 10.5,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    ...(selected
      ? { background: LCD.ink, color: LCD.screen, fontWeight: 700 }
      : { color: LCD.ink }),
  };
}

/** Leading cursor glyph — space-reserving when idle so menu rows align. */
export function LcdCursor({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: '1.2em',
        display: 'inline-block',
        fontWeight: 700,
        visibility: active ? 'visible' : 'hidden',
      }}
    >
      ▶
    </span>
  );
}

// ------------------------------------------------------------- wells & images

/** Recessed well (binder grids, map fields, avatar boxes). */
export const lcdWell: CSSProperties = {
  background: LCD.mid,
  border: `3px solid ${LCD.ink}`,
  padding: '10px 12px',
};

/** Card images on the LCD: pixelated + desaturated. Grids/tiles only —
 *  InspectOverlay stays full-res/unfiltered (inspection is where fidelity wins). */
export const LCD_IMG_FILTER = 'saturate(0.75) contrast(1.05)';
export const lcdImg: CSSProperties = {
  imageRendering: 'pixelated',
  filter: LCD_IMG_FILTER,
};

/** Inverted, tilted "SOLD!" chip — position inside a relative parent over a
 *  0.5-saturation image (`filter: saturate(0.5)` on the img). */
export const lcdSoldStamp: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%) rotate(-8deg)',
  background: LCD.ink,
  color: LCD.screen,
  fontFamily: PIXEL_FONT,
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '0.08em',
  padding: '3px 10px',
  textTransform: 'uppercase',
};
