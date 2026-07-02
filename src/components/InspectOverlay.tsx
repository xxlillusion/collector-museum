import { useEffect } from 'react';

interface InspectOverlayProps {
  imageUrl: string;
  onClose: () => void;
}

export default function InspectOverlay({ imageUrl, onClose }: InspectOverlayProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <img
        src={imageUrl}
        alt="Pokemon card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: '90vh',
          maxWidth: '90vw',
          borderRadius: '8px',
          boxShadow: '0 0 60px rgba(0,0,0,0.8)',
          animation: 'scaleIn 0.2s ease',
          objectFit: 'contain',
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '20px',
          right: '24px',
          background: 'none',
          border: '2px solid rgba(255,255,255,0.6)',
          color: 'white',
          fontSize: '18px',
          padding: '4px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontFamily: 'sans-serif',
        }}
      >
        ✕ Close
      </button>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { transform: scale(0.85) } to { transform: scale(1) } }
      `}</style>
    </div>
  );
}
