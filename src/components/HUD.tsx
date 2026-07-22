import type { CSSProperties } from 'react';
import { isTouchDevice } from './GalleryControls';
import { useTheme, withAlpha } from './themeKit';
import { LCD, PIXEL_FONT, lcdDialogBox, LcdCss } from './lcdKit';

interface HUDProps {
  locked: boolean;
  onUpload: () => void;
  /** show the proximity "Press F" pill (desktop) */
  binderPrompt: boolean;
  /** binder is open or animating — swaps hints, shows mobile controls */
  binderOpen: boolean;
  /** an inspect overlay is mounted on top — suppress every hint pill
   *  (control hints, binder prompt); the buttons stay */
  overlayOpen?: boolean;
  /** top-right button label; defaults to the museum's card manager */
  uploadLabel?: string;
  /** Hall only: opens the vendor directory (button top-left, M shortcut). */
  onDirectory?: () => void;
  /** Museum only (F1): the arrange-walls toggle (button + R shortcut hint).
   *  Accepted at scaffold time; the arrangement stream renders it. */
  arrange?: { active: boolean; onToggle: () => void };
}

export default function HUD({
  locked,
  onUpload,
  binderPrompt,
  binderOpen,
  overlayOpen = false,
  uploadLabel = '⬆ Manage Cards',
  onDirectory,
}: HUDProps) {
  const t = useTheme();
  // 'refined' keeps the legacy literals below pixel-identical (the HUD was
  // never museumKit-styled — plain black/white pills are its refined look).
  const themed = t.id !== 'refined';
  // 'handheld' swaps every pill/button for opaque LCD chrome (lcdKit) — the
  // photoreal canvas shows through the gaps, never through the panels.
  // Positions and pointerEvents stay EXACTLY as the other themes.
  const lcd = t.id === 'handheld';
  const pillBase: CSSProperties = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    maxWidth: '90vw',
    boxSizing: 'border-box',
    textAlign: 'center',
  };
  const pillStyle: CSSProperties = lcd
    ? {
        // Small LCD dialog box (lcdKit recipe): opaque panel, 3px ink
        // border + double inner border, pixel font, no radius, no blur.
        ...pillBase,
        ...lcdDialogBox,
        position: 'absolute',
        padding: '6px 12px',
        fontSize: 10,
        lineHeight: 1.9,
      }
    : {
        ...pillBase,
        background: themed ? withAlpha(t.bg, 0.85) : 'rgba(0,0,0,0.65)',
        color: themed ? t.text : 'white',
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '13px',
        fontFamily: themed ? t.fontMono : undefined,
        border: themed
          ? `${t.borderWidth}px solid ${t.border}`
          : '1px solid rgba(255,255,255,0.2)',
      };
  // Top chrome buttons (Manage Cards / ☰ Vendors): LCD chips under handheld
  // (panel bg, 2px ink), the legacy translucent-black pills everywhere else.
  const chromeBtn: CSSProperties = lcd
    ? {
        background: LCD.panel,
        color: LCD.ink,
        border: `2px solid ${LCD.ink}`,
        borderRadius: 0,
        padding: '8px 14px',
        fontSize: 10,
        fontWeight: 700,
        fontFamily: PIXEL_FONT,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }
    : {
        background: 'rgba(0,0,0,0.65)',
        color: 'white',
        border: '1px solid rgba(255,255,255,0.3)',
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '14px',
        cursor: 'pointer',
        backdropFilter: 'blur(4px)',
      };
  const mobileBtnStyle: CSSProperties = lcd
    ? {
        position: 'absolute',
        pointerEvents: 'auto',
        background: LCD.panel,
        color: LCD.ink,
        border: `3px solid ${LCD.ink}`,
        borderRadius: 0,
        width: '48px',
        height: '48px',
        boxSizing: 'border-box',
        fontSize: '20px',
        fontWeight: 700,
        fontFamily: PIXEL_FONT,
        lineHeight: '40px',
        textAlign: 'center',
        cursor: 'pointer',
        padding: 0,
      }
    : mobileBtn;
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, fontFamily: 'sans-serif' }}>
      {lcd && <LcdCss />}
      {/* Controls prompt — no hints while an inspect overlay covers the scene.
          Touch hint sits at the BOTTOM (above the joystick zone) so it never
          collides with the top chrome (☰ Vendors / Floor Plan / minimap). */}
      {!overlayOpen && (isTouchDevice ? (
        !binderOpen && (
          <div style={{ ...pillStyle, bottom: '132px', maxWidth: 'calc(100vw - 24px)' }}>
            Joystick to move · Drag to look · Tap a card or the binder
          </div>
        )
      ) : binderOpen ? (
        // bottom 56 (was 40): the floating theme-switcher bar docks at bottom
        // center (bottom 10, ~30px tall) — keep the hint pills clear of it.
        <div style={{ ...pillStyle, bottom: '56px', ...(lcd ? null : { fontSize: '14px', padding: '10px 22px' }) }}>
          ← → flip pages &nbsp;·&nbsp; Click a card to inspect &nbsp;·&nbsp; F or Esc to close
        </div>
      ) : !locked && (
        <div style={{ ...pillStyle, bottom: '56px', ...(lcd ? null : { fontSize: '15px', letterSpacing: '0.03em', padding: '10px 22px' }) }}>
          Click to explore &nbsp;·&nbsp; WASD to move &nbsp;·&nbsp; Mouse to look &nbsp;·&nbsp; Esc to unlock
          {onDirectory && <> &nbsp;·&nbsp; M for vendors</>}
        </div>
      ))}

      {/* Binder proximity prompt — handheld renders THE game dialog box at
          the bottom instead (display-only: F/tap handling lives in the scene;
          the choices are spans, not buttons, and the whole HUD layer is
          pointerEvents none anyway). Vendor name isn't in the props, so the
          copy uses the generic "THE VENDOR". Desktop bottom 56 is free while
          locked (unlock hint needs !locked, theme bar hides under pointer
          lock); touch stacks above the bottom-132 hint pill. */}
      {!overlayOpen && binderPrompt && (lcd ? (
        <div style={{
          ...lcdDialogBox,
          position: 'absolute',
          bottom: isTouchDevice ? '200px' : '56px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(560px, calc(100vw - 24px))',
          boxSizing: 'border-box',
          textAlign: 'left',
        }}>
          THE VENDOR IS MINDING THE TABLE.
          {isTouchDevice ? (
            <> TAP THE BINDER TO BROWSE!</>
          ) : (
            <>
              {' '}BROWSE THEIR BINDER?
              <div style={{ display: 'flex', gap: 18, marginTop: 2 }}>
                <span style={{ fontWeight: 700 }}>▶ YES [F]</span>
                <span style={{ color: LCD.muted }}>WALK ON</span>
              </div>
            </>
          )}
          <span
            aria-hidden
            className="lcd-blink"
            style={{ position: 'absolute', right: 9, bottom: 5, fontSize: 9, lineHeight: 1 }}
          >
            ▼
          </span>
        </div>
      ) : (
        <div style={{
          position: 'absolute',
          top: '58%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: themed ? withAlpha(t.bg, 0.85) : 'rgba(0,0,0,0.7)',
          color: themed ? t.text : 'white',
          padding: '8px 18px',
          borderRadius: '8px',
          fontSize: '14px',
          fontFamily: themed ? t.fontMono : undefined,
          border: themed
            ? `${t.borderWidth}px solid ${t.border}`
            : '1px solid rgba(255,255,255,0.25)',
          maxWidth: '90vw',
          boxSizing: 'border-box',
          textAlign: 'center',
        }}>
          {isTouchDevice ? <>Tap the binder to open it</> : <>Press <b>F</b> to open the binder</>}
        </div>
      ))}

      {/* Crosshair */}
      {locked && !binderOpen && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'rgba(255,255,255,0.7)',
          fontSize: '20px',
          lineHeight: 1,
          userSelect: 'none',
        }}>+</div>
      )}

      {/* Upload button */}
      {!binderOpen && (
        <button
          onClick={onUpload}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            pointerEvents: 'auto',
            ...chromeBtn,
          }}
        >
          {uploadLabel}
        </button>
      )}

      {/* Vendor directory button (hall only) */}
      {onDirectory && !binderOpen && (
        <button
          onClick={onDirectory}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            pointerEvents: 'auto',
            ...chromeBtn,
          }}
        >
          ☰ Vendors
        </button>
      )}

      {/* Mobile binder controls — page arrows + close (keyboardless) */}
      {binderOpen && isTouchDevice && (
        <>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('binder-close'))}
            style={{ ...mobileBtnStyle, top: '16px', right: '16px' }}
          >
            ✕
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('binder-flip', { detail: -1 }))}
            style={{ ...mobileBtnStyle, bottom: '32px', left: '24px' }}
          >
            ‹
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('binder-flip', { detail: 1 }))}
            style={{ ...mobileBtnStyle, bottom: '32px', right: '24px' }}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

const mobileBtn: CSSProperties = {
  position: 'absolute',
  pointerEvents: 'auto',
  background: 'rgba(0,0,0,0.65)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '50%',
  width: '48px',
  height: '48px',
  fontSize: '22px',
  lineHeight: '44px',
  textAlign: 'center',
  cursor: 'pointer',
  padding: 0,
};
