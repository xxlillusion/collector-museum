import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { InventoryStatus } from '../lib/db';
import { formatPrice } from '../lib/price';
import { useTheme, withAlpha } from './themeKit';

// Styling: under 'refined' every value below renders pixel-identical to the
// pre-theme overlay — gold literals became t.accent (same hex) and the serif
// became t.fontMono (refined's mono IS the serif); values that differ from
// refined tokens branch on `themed` and keep the legacy literal.

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
  const t = useTheme();
  const themed = t.id !== 'refined';

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

  const showSale =
    sale && (sale.price !== undefined || sale.condition || (sale.status && sale.status !== 'forSale'));

  // Accent-on-dark hairline circles — vertically centered beside the card
  // (fixed) on wide viewports; the inline pair lives in the placard.
  const navBtnBase: CSSProperties = {
    background: 'rgba(10,8,6,0.6)',
    color: t.accent,
    border: themed
      ? `${t.borderWidth}px solid ${t.border}`
      : '1px solid rgba(212,175,55,0.45)',
    borderRadius: '50%',
    fontFamily: t.fontMono,
    textAlign: 'center',
    padding: 0,
    cursor: 'pointer',
    userSelect: 'none',
  };

  const sideNavStyle: CSSProperties = {
    ...navBtnBase,
    position: 'fixed',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '46px',
    height: '46px',
    fontSize: '26px',
    lineHeight: '42px',
    zIndex: 2,
  };

  const inlineNavStyle: CSSProperties = {
    ...navBtnBase,
    width: '36px',
    height: '36px',
    fontSize: '20px',
    lineHeight: '32px',
  };

  /** Ghost pill (want heart / add details) — dark, hairline, small-caps. */
  const ghostPillStyle: CSSProperties = {
    background: 'rgba(10,8,6,0.55)',
    color: 'rgba(255,255,255,0.78)',
    border: themed
      ? `${t.borderWidth}px solid ${t.border}`
      : '1px solid rgba(255,255,255,0.28)',
    borderRadius: '20px',
    padding: '8px 20px',
    fontSize: '12.5px',
    fontFamily: t.fontMono,
    letterSpacing: '0.14em',
    cursor: 'pointer',
  };

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
        gap: '14px',
        // The column must never push the placard past the viewport: the
        // image is the only shrinkable row (flex 0 1 auto + minHeight 0);
        // everything below it is flexShrink 0 and stays fully visible.
        maxHeight: '100vh',
        boxSizing: 'border-box',
        padding: '18px 12px',
        overflow: 'hidden',
      }}
    >
      <img
        src={imageUrl}
        alt="Card"
        draggable={false}
        className="inspect-card-img"
        style={{
          flex: '0 1 auto',
          minHeight: 0,
          maxHeight: '82vh',
          borderRadius: '8px',
          boxShadow: '0 0 60px rgba(0,0,0,0.8)',
          animation: 'scaleIn 0.2s ease',
          objectFit: 'contain',
          userSelect: 'none',
        }}
      />

      {/* ‹ › flanking the card — wide viewports only (the media query swaps
          them into the placard row on narrow screens so they never cover
          the card). */}
      {nav && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              nav.onPrev();
            }}
            aria-label="Previous card"
            className="inspect-nav-btn inspect-nav-side"
            style={{ ...sideNavStyle, left: '26px' }}
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              nav.onNext();
            }}
            aria-label="Next card"
            className="inspect-nav-btn inspect-nav-side"
            style={{ ...sideNavStyle, right: '26px' }}
          >
            ›
          </button>
        </>
      )}

      {/* Placard — never clipped (flexShrink 0); the image absorbs the squeeze. */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          maxWidth: '92vw',
        }}
      >
        {caption && (
          <div style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: '16px',
            fontFamily: t.fontMono,
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
            fontFamily: t.fontMono,
            letterSpacing: '0.06em',
            maxWidth: '80vw',
            textAlign: 'center',
            userSelect: 'none',
          }}>
            {details}
          </div>
        )}
        {showSale && sale && (
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '14px',
            fontFamily: t.fontMono,
            letterSpacing: '0.08em',
            userSelect: 'none',
          }}>
            {sale.price !== undefined && (
              <span style={{
                color: sale.status === 'sold'
                  ? (themed ? t.muted : 'rgba(255,255,255,0.4)')
                  : t.accent,
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
              <span style={{ color: themed ? t.accent : '#c9776b', fontSize: '13px', letterSpacing: '0.24em' }}>
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
              display: 'flex',
              alignItems: 'baseline',
              gap: '16px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              fontFamily: t.fontMono,
              userSelect: 'none',
              cursor: 'default',
            }}
          >
            <span style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: '14px',
              fontStyle: 'italic',
              letterSpacing: '0.04em',
            }}>
              from <span style={{ color: 'rgba(255,255,255,0.92)' }}>{vendor.name}</span>
            </span>
            {vendor.href && (
              <a
                href={vendor.href}
                onClick={(e) => e.stopPropagation()}
                style={{
                  color: t.accent,
                  fontSize: '11.5px',
                  letterSpacing: '0.18em',
                  textDecoration: 'none',
                  borderBottom: `1px solid ${withAlpha(t.accent, 0.45)}`,
                  paddingBottom: '1px',
                  whiteSpace: 'nowrap',
                }}
              >
                VISIT VENDOR PAGE →
              </a>
            )}
          </div>
        )}
        {(want || (onAddDetails && !caption && !details)) && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {want && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  want.onToggle();
                }}
                className="inspect-pill"
                style={{
                  ...ghostPillStyle,
                  ...(want.wanted
                    ? {
                        background: withAlpha(t.accent, 0.16),
                        color: t.accent,
                        border: `${themed ? t.borderWidth : 1}px solid ${t.accent}`,
                      }
                    : null),
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
                className="inspect-pill"
                style={ghostPillStyle}
              >
                ✎ add details
              </button>
            )}
          </div>
        )}
        {nav && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
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
              className="inspect-nav-btn inspect-nav-inline"
              style={inlineNavStyle}
            >
              ‹
            </button>
            <span style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: '13px',
              fontFamily: t.fontMono,
              fontVariant: 'small-caps',
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
              className="inspect-nav-btn inspect-nav-inline"
              style={inlineNavStyle}
            >
              ›
            </button>
          </div>
        )}
        <div style={{
          color: 'rgba(255,255,255,0.45)',
          fontSize: '13px',
          fontFamily: t.fontMono,
          letterSpacing: '0.08em',
          userSelect: 'none',
          textAlign: 'center',
        }}>
          click anywhere to return to the room
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { transform: scale(0.85) } to { transform: scale(1) } }
        .inspect-card-img { max-width: 90vw; }
        .inspect-nav-side { display: none; }
        .inspect-nav-inline { display: inline-block; }
        @media (min-width: 641px) {
          /* Keep a gutter for the side arrows so they never cover the card */
          .inspect-card-img { max-width: min(90vw, calc(100vw - 176px)); }
          .inspect-nav-side { display: block; }
          .inspect-nav-inline { display: none; }
        }
        .inspect-nav-btn { transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease; }
        .inspect-nav-btn:hover {
          ${themed
            ? `color: ${t.text};
          border-color: ${t.accent};
          background: ${withAlpha(t.bg, 0.85)};`
            : `color: #f4d97a;
          border-color: rgba(212, 175, 55, 0.9);
          background: rgba(28, 22, 14, 0.85);`}
        }
        .inspect-pill { transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease; }
        .inspect-pill:hover { ${themed
          ? `border-color: ${withAlpha(t.accent, 0.75)}; color: ${t.text};`
          : 'border-color: rgba(212, 175, 55, 0.75); color: #e8e4dc;'} }
      `}</style>
    </div>
  );
}
