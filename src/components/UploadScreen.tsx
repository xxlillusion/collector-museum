import { useCallback, useState } from 'react';
import type { CardWithUrl } from '../lib/useCards';

interface UploadScreenProps {
  cards: CardWithUrl[];
  loading: boolean;
  onAdd: (file: File) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onEnter: () => void;
}

export default function UploadScreen({ cards, loading, onAdd, onRemove, onEnter }: UploadScreenProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        await onAdd(file);
      }
    }
    setUploading(false);
  }, [onAdd]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1a1614',
      color: '#e8e4dc',
      fontFamily: 'Georgia, serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 24px',
    }}>
      <h1 style={{ fontSize: '2rem', letterSpacing: '0.12em', marginBottom: '4px', color: '#d4af37' }}>
        VENDOR MUSEUM
      </h1>
      <p style={{ color: '#888', marginBottom: '32px', fontSize: '14px', letterSpacing: '0.08em' }}>
        YOUR PRIVATE POKEMON CARD GALLERY
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById('file-input')?.click()}
        style={{
          width: '100%',
          maxWidth: '560px',
          border: `2px dashed ${dragging ? '#d4af37' : '#555'}`,
          borderRadius: '12px',
          padding: '40px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'rgba(212,175,55,0.05)' : 'rgba(255,255,255,0.03)',
          transition: 'all 0.2s',
          marginBottom: '32px',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🃏</div>
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>
          {uploading ? 'Adding cards...' : 'Drop card images here'}
        </div>
        <div style={{ fontSize: '13px', color: '#666' }}>
          or click to browse — PNG, JPG, WebP supported
        </div>
        <input
          id="file-input"
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Card grid */}
      {!loading && cards.length > 0 && (
        <>
          <div style={{
            width: '100%',
            maxWidth: '800px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '12px',
            marginBottom: '32px',
          }}>
            {cards.map((card) => (
              <div key={card.id} style={{ position: 'relative' }}>
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  style={{
                    width: '100%',
                    aspectRatio: '2.5/3.5',
                    objectFit: 'cover',
                    borderRadius: '6px',
                    display: 'block',
                    border: '1px solid #333',
                  }}
                />
                <button
                  onClick={() => onRemove(card.id)}
                  title="Remove card"
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: 'rgba(0,0,0,0.75)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '22px',
                    height: '22px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    lineHeight: '22px',
                    textAlign: 'center',
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && cards.length === 0 && (
        <p style={{ color: '#555', fontSize: '14px', marginBottom: '32px' }}>
          No cards yet. Add some above.
        </p>
      )}

      {/* Enter museum button */}
      <button
        onClick={onEnter}
        disabled={cards.length === 0}
        style={{
          background: cards.length > 0 ? '#d4af37' : '#333',
          color: cards.length > 0 ? '#1a1614' : '#666',
          border: 'none',
          padding: '14px 40px',
          fontSize: '16px',
          letterSpacing: '0.1em',
          borderRadius: '8px',
          cursor: cards.length > 0 ? 'pointer' : 'not-allowed',
          fontFamily: 'Georgia, serif',
          transition: 'all 0.2s',
        }}
      >
        ENTER MUSEUM →
      </button>
      {cards.length === 0 && (
        <p style={{ color: '#555', fontSize: '12px', marginTop: '8px' }}>
          Add at least one card to enter
        </p>
      )}
    </div>
  );
}
