import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { InventoryStatus } from '../lib/db';
import { formatPrice } from '../lib/price';

/** Sale metadata shown on the placard under an inventory item (0005). */
export interface InspectSale {
  price?: number;
  status?: InventoryStatus;
  condition?: string;
}

interface InspectOverlayProps {
  imageUrl: string;
  /** Shown beneath the image — inventory items carry vendor captions. */
  caption?: string;
  /** Smaller line under the caption — card metadata ("Base Set · #4/102 · PSA 9"). */
  details?: string;
  /** Price / condition / sold state — inventory items only. */
  sale?: InspectSale;
  /** Want-list heart ("I'm interested") — host owns state + persistence. */
  want?: { wanted: boolean; onToggle: () => void };
  /** Prev/next paging through the host's current list (wall order / binder
   *  slice) — ‹ › buttons, an "n of N" counter, and ←/→ arrow keys. */
  nav?: { index: number; total: number; onPrev: () => void; onNext: () => void };
  /** Whose item this is (hall binders) — optionally linked to their page. */
  vendor?: { name: string; href?: string };
  /** Own-collection museums: opens the card's metadata editor. Rendered only
   *  while the card has no caption and no details line yet. */
  onAddDetails?: () => void;
  /** `relock` is true when closed by click — the caller may resume pointer lock */
  onClose: (relock: boolean) => void;
}

export default function InspectOverlay({ imageUrl, caption, details, sale, want, nav, vendor, onAddDetails, onClose }: InspectOverlayProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Arrow-key paging — a separate listener so the Esc-to-close handler above
  // stays untouched. Hosts freeze movement / suspend the binder while the
  // overlay is up, so the arrows reach only us.
  const onPrev = nav?.onPrev;
  const onNext = nav?.onNext;
  useEffect(() => {
    if (!onPrev || !onNext) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') onPrev();
      else if (e.code === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPrev, onNext]);

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
      {details && (
        <div style={{
          color: 'rgba(255,255,255,0.6)',
          fontSize: '13.5px',
          fontFamily: 'Georgia, serif',
          letterSpacing: '0.06em',
          maxWidth: '80vw',
          textAlign: 'center',
          userSelect: 'none',
          marginTop: caption ? '-8px' : 0,
        }}>
          {details}
        </div>
      )}
      {sale && (sale.price !== undefined || sale.condition || (sale.status && sale.status !== 'forSale')) && (
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '14px',
          fontFamily: 'Georgia, serif',
          letterSpacing: '0.08em',
          userSelect: 'none',
          marginTop: caption ? '-6px' : 0,
        }}>
          {sale.price !== undefined && (
            <span style={{
              color: sale.status === 'sold' ? 'rgba(255,255,255,0.4)' : '#d4af37',
              fontSize: '19px',
              textDecoration: sale.status === 'sold' ? 'line-through' : 'none',
            }}>
              {formatPrice(sale.price)}
            </span>
          )}
          {sale.condition && (
            <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '14px' }}>
              {sale.condition}
            </span>
          )}
          {sale.status === 'sold' && (
            <span style={{ color: '#c9776b', fontSize: '13px', letterSpacing: '0.24em' }}>
              SOLD
            </span>
          )}
          {sale.status === 'display' && (
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontStyle: 'italic' }}>
              display only
            </span>
          )}
        </div>
      )}
      {vendor && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            color: 'rgba(255,255,255,0.55)',
            fontSize: '12.5px',
            fontFamily: 'Georgia, serif',
            letterSpacing: '0.1em',
            userSelect: 'none',
            cursor: 'default',
          }}
        >
          from{' '}
          {vendor.href ? (
            <a
              href={vendor.href}
              onClick={(e) => e.stopPropagation()}
              style={{ color: '#d4af37', textDecoration: 'underline' }}
            >
              {vendor.name}
            </a>
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.8)' }}>{vendor.name}</span>
          )}
        </div>
      )}
      {want && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            want.onToggle();
          }}
          style={{
            background: want.wanted ? 'rgba(212,175,55,0.18)' : 'rgba(0,0,0,0.5)',
            color: want.wanted ? '#d4af37' : 'rgba(255,255,255,0.75)',
            border: `1px solid ${want.wanted ? '#d4af37' : 'rgba(255,255,255,0.3)'}`,
            borderRadius: '20px',
            padding: '8px 20px',
            fontSize: '12.5px',
            fontFamily: 'Georgia, serif',
            letterSpacing: '0.14em',
            cursor: 'pointer',
          }}
        >
          {want.wanted ? '♥ ON MY WANT LIST' : "♡ I'M INTERESTED"}
        </button>
      )}
      {onAddDetails && !caption && !details && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddDetails();
          }}
          style={{
            background: 'rgba(0,0,0,0.5)',
            color: 'rgba(255,255,255,0.75)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '20px',
            padding: '8px 20px',
            fontSize: '12.5px',
            fontFamily: 'Georgia, serif',
            letterSpacing: '0.14em',
            cursor: 'pointer',
          }}
        >
          ✎ add details
        </button>
      )}
      {nav && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            userSelect: 'none',
            cursor: 'default',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              nav.onPrev();
            }}
            aria-label="Previous card"
            style={navBtnStyle}
          >
            ‹
          </button>
          <span style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: '12.5px',
            fontFamily: 'Georgia, serif',
            letterSpacing: '0.14em',
          }}>
            {nav.index + 1} of {nav.total}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              nav.onNext();
            }}
            aria-label="Next card"
            style={navBtnStyle}
          >
            ›
          </button>
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

const navBtnStyle: CSSProperties = {
  background: 'rgba(0,0,0,0.5)',
  color: 'rgba(255,255,255,0.85)',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '50%',
  width: '38px',
  height: '38px',
  fontSize: '20px',
  lineHeight: '34px',
  textAlign: 'center',
  padding: 0,
  cursor: 'pointer',
};
