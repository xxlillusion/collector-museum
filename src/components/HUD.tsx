import type { CSSProperties } from 'react';
import { isTouchDevice } from './GalleryControls';

interface HUDProps {
  locked: boolean;
  onUpload: () => void;
  /** show the proximity "Press F" pill (desktop) */
  binderPrompt: boolean;
  /** binder is open or animating — swaps hints, shows mobile controls */
  binderOpen: boolean;
}

const pillStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.65)',
  color: 'white',
  padding: '8px 16px',
  borderRadius: '8px',
  fontSize: '13px',
  whiteSpace: 'nowrap',
  border: '1px solid rgba(255,255,255,0.2)',
};

export default function HUD({ locked, onUpload, binderPrompt, binderOpen }: HUDProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, fontFamily: 'sans-serif' }}>
      {/* Controls prompt */}
      {isTouchDevice ? (
        !binderOpen && (
          <div style={{ ...pillStyle, top: '16px' }}>
            Joystick to move · Drag to look · Tap a card or the binder
          </div>
        )
      ) : binderOpen ? (
        <div style={{ ...pillStyle, bottom: '40px', fontSize: '14px', padding: '10px 22px' }}>
          ← → flip pages &nbsp;·&nbsp; Click a card to inspect &nbsp;·&nbsp; F or Esc to close
        </div>
      ) : !locked && (
        <div style={{ ...pillStyle, bottom: '40px', fontSize: '15px', letterSpacing: '0.03em', padding: '10px 22px' }}>
          Click to explore &nbsp;·&nbsp; WASD to move &nbsp;·&nbsp; Mouse to look &nbsp;·&nbsp; Esc to unlock
        </div>
      )}

      {/* Binder proximity prompt */}
      {binderPrompt && (
        <div style={{
          position: 'absolute',
          top: '58%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '8px 18px',
          borderRadius: '8px',
          fontSize: '14px',
          border: '1px solid rgba(255,255,255,0.25)',
          whiteSpace: 'nowrap',
        }}>
          Press <b>F</b> to open the binder
        </div>
      )}

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
            background: 'rgba(0,0,0,0.65)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.3)',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
        >
          ⬆ Manage Cards
        </button>
      )}

      {/* Mobile binder controls — page arrows + close (keyboardless) */}
      {binderOpen && isTouchDevice && (
        <>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('binder-close'))}
            style={{ ...mobileBtn, top: '16px', right: '16px' }}
          >
            ✕
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('binder-flip', { detail: -1 }))}
            style={{ ...mobileBtn, bottom: '32px', left: '24px' }}
          >
            ‹
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('binder-flip', { detail: 1 }))}
            style={{ ...mobileBtn, bottom: '32px', right: '24px' }}
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
