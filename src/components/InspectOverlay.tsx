import { useEffect } from 'react';

interface InspectOverlayProps {
  imageUrl: string;
  /** Shown beneath the image — inventory items carry vendor captions. */
  caption?: string;
  /** `relock` is true when closed by click — the caller may resume pointer lock */
  onClose: (relock: boolean) => void;
}

export default function InspectOverlay({ imageUrl, caption, onClose }: InspectOverlayProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Enforce "no pointer lock while open". The click that opens the overlay can
  // also trigger the canvas's click-to-lock, and the lock lands *after* our
  // exitPointerLock — leaving the pointer captured so overlay clicks never fire.
  useEffect(() => {
    const exit = () => {
      if (document.pointerLockElement) document.exitPointerLock();
    };
    exit();
    document.addEventListener('pointerlockchange', exit);
    return () => document.removeEventListener('pointerlockchange', exit);
  }, []);

  return (
    <div
      onClick={() => onClose(true)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        animation: 'fadeIn 0.15s ease',
        cursor: 'pointer',
        gap: '16px',
      }}
    >
      <img
        src={imageUrl}
        alt="Card"
        draggable={false}
        style={{
          maxHeight: '86vh',
          maxWidth: '90vw',
          borderRadius: '8px',
          boxShadow: '0 0 60px rgba(0,0,0,0.8)',
          animation: 'scaleIn 0.2s ease',
          objectFit: 'contain',
          userSelect: 'none',
        }}
      />
      {caption && (
        <div style={{
          color: 'rgba(255,255,255,0.85)',
          fontSize: '16px',
          fontFamily: 'Georgia, serif',
          fontStyle: 'italic',
          letterSpacing: '0.04em',
          maxWidth: '80vw',
          textAlign: 'center',
          userSelect: 'none',
        }}>
          {caption}
        </div>
      )}
      <div style={{
        color: 'rgba(255,255,255,0.45)',
        fontSize: '13px',
        fontFamily: 'Georgia, serif',
        letterSpacing: '0.08em',
        userSelect: 'none',
      }}>
        click anywhere to return to the room
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { transform: scale(0.85) } to { transform: scale(1) } }
      `}</style>
    </div>
  );
}
