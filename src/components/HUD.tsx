import { isTouchDevice } from './GalleryControls';

interface HUDProps {
  locked: boolean;
  onUpload: () => void;
}

export default function HUD({ locked, onUpload }: HUDProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, fontFamily: 'sans-serif' }}>
      {/* Controls prompt */}
      {isTouchDevice ? (
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.65)',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          whiteSpace: 'nowrap',
          border: '1px solid rgba(255,255,255,0.2)',
        }}>
          Joystick to move · Drag to look · Tap a card to inspect
        </div>
      ) : !locked && (
        <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.65)',
          color: 'white',
          padding: '10px 22px',
          borderRadius: '8px',
          fontSize: '15px',
          letterSpacing: '0.03em',
          border: '1px solid rgba(255,255,255,0.2)',
        }}>
          Click to explore &nbsp;·&nbsp; WASD to move &nbsp;·&nbsp; Mouse to look &nbsp;·&nbsp; Esc to unlock
        </div>
      )}

      {/* Crosshair */}
      {locked && (
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
    </div>
  );
}
