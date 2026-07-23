import type { CSSProperties } from 'react';
import { useTheme, withAlpha } from './themeKit';
import { LCD, PIXEL_FONT, lcdMenuBox, lcdMenuRow, LcdCursor } from './lcdKit';

// In-hall vendor directory (DOM overlay, VendorScene owns open state).
// Opening unlocks the pointer and freezes controls — the binder-open pattern.
// Selecting a vendor highlights their booth(s) on the minimap, which stays
// visible top-right while the panel is up.
//
// Styling: 'refined' keeps the legacy literals pixel-identical — gold/serif
// values that already equal refined tokens read the token directly; the rest
// branch on `themed`.

export interface DirectoryVendor {
  id: string;
  name: string;
  boothCount: number;
  inventoryCount: number;
}

interface HallDirectoryProps {
  vendors: DirectoryVendor[];
  highlightId: string | null;
  onHighlight: (id: string | null) => void;
  /** Route planning (public show walks) — absent in sandbox walks. */
  starredIds?: Set<string>;
  onToggleStar?: (id: string) => void;
  onClose: () => void;
}

export default function HallDirectory({
  vendors,
  highlightId,
  onHighlight,
  starredIds,
  onToggleStar,
  onClose,
}: HallDirectoryProps) {
  const t = useTheme();
  const themed = t.id !== 'refined';
  // 'handheld': the panel becomes an opaque LCD MENU (lcdKit) — hard ink
  // border, offset shadow, inverted-row selection with ▶ cursors. All open/
  // close/highlight/star wiring is shared and untouched.
  const lcd = t.id === 'handheld';
  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    borderBottom: themed
      ? `1px solid ${withAlpha(t.text, 0.14)}`
      : '1px solid rgba(212,175,55,0.14)',
    padding: '11px 10px',
    cursor: 'pointer',
    color: themed ? t.text : 'rgba(255,255,255,0.88)',
  };
  return (
    <div
      style={{
        position: 'fixed',
        top: 76,
        left: 16,
        width: 'min(300px, calc(100vw - 32px))',
        maxHeight: 'calc(100vh - 140px)',
        display: 'flex',
        flexDirection: 'column',
        ...(lcd
          ? {
              // Opaque LCD menu box — no smoked glass over the photoreal hall.
              ...lcdMenuBox,
              borderRadius: 0,
              boxShadow: `4px 4px 0 ${LCD.shadowB}`,
            }
          : {
              background: themed ? withAlpha(t.bg, 0.88) : 'rgba(10,8,6,0.88)',
              border: themed
                ? `${t.borderWidth}px solid ${t.border}`
                : '1px solid rgba(212,175,55,0.35)',
              borderRadius: 8,
              backdropFilter: 'blur(6px)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
            }),
        zIndex: 20,
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
    >
      {lcd && (
        <style>{`
          .lcd-dir-row:hover { background: ${LCD.ink} !important; color: ${LCD.screen} !important; }
          .lcd-dir-row:hover .lcd-dir-name { color: ${LCD.screen} !important; }
          .lcd-dir-row:hover .lcd-dir-meta { color: ${LCD.screen} !important; }
          .lcd-dir-row:hover .lcd-dir-cur span { visibility: visible !important; }
        `}</style>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: lcd ? '10px 12px 8px' : '14px 16px 12px',
          borderBottom: lcd
            ? `4px double ${LCD.ink}`
            : themed ? `1px solid ${t.border}` : '1px solid rgba(212,175,55,0.3)',
        }}
      >
        <span
          style={{
            fontFamily: t.fontMono,
            fontSize: lcd ? 12 : 13,
            fontWeight: lcd ? 700 : undefined,
            letterSpacing: lcd ? '0.1em' : '0.22em',
            color: t.accent,
          }}
        >
          {lcd ? 'VENDORS' : 'VENDORS AT THIS SHOW'}
        </span>
        <button
          onClick={onClose}
          title="Close (M or Esc)"
          style={{
            background: 'transparent',
            border: 'none',
            color: lcd ? LCD.ink : themed ? t.muted : 'rgba(255,255,255,0.7)',
            fontSize: lcd ? 13 : 15,
            fontWeight: lcd ? 700 : undefined,
            fontFamily: lcd ? PIXEL_FONT : undefined,
            cursor: 'pointer',
            padding: '2px 4px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: lcd ? 0 : '4px 8px 8px' }}>
        {vendors.length === 0 ? (
          <p
            style={lcd ? {
              fontFamily: PIXEL_FONT,
              fontSize: 10,
              lineHeight: 2,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: LCD.muted,
              padding: '12px 12px',
              margin: 0,
            } : {
              fontFamily: t.fontMono,
              fontStyle: 'italic',
              fontSize: 13.5,
              color: themed ? t.muted : 'rgba(255,255,255,0.55)',
              padding: '12px 10px',
              margin: 0,
            }}
          >
            {lcd ? 'NO VENDORS AT THE TABLES YET!' : 'No vendors assigned to booths in this show.'}
          </p>
        ) : (
          vendors.map((v) => {
            const active = v.id === highlightId;
            const starredRow = starredIds?.has(v.id) ?? false;
            return (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                className={lcd ? 'lcd-dir-row' : undefined}
                onClick={() => onHighlight(active ? null : v.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onHighlight(active ? null : v.id);
                }}
                style={lcd ? {
                  // lcdKit menu row: selected = inverted (ink bg, screen text)
                  // with a leading ▶; hover inverts via the style block above.
                  ...lcdMenuRow(active),
                  width: '100%',
                  boxSizing: 'border-box',
                  textAlign: 'left',
                  cursor: 'pointer',
                  gap: 8,
                } : {
                  ...rowStyle,
                  alignItems: 'center',
                  background: active ? withAlpha(t.accent, 0.14) : 'transparent',
                  borderLeft: active ? `2px solid ${t.accent}` : '2px solid transparent',
                }}
              >
                {lcd && (
                  <span className="lcd-dir-cur" style={{ display: 'inline-flex' }}>
                    <LcdCursor active={active} />
                  </span>
                )}
                {onToggleStar && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(v.id);
                    }}
                    title={starredRow ? 'Unstar this vendor' : 'Star — glow on the map'}
                    style={lcd ? {
                      background: starredRow ? LCD.ink : LCD.panel,
                      color: starredRow ? LCD.screen : LCD.ink,
                      border: `2px solid ${LCD.ink}`,
                      borderRadius: 0,
                      cursor: 'pointer',
                      fontSize: 10,
                      lineHeight: 1.2,
                      padding: '1px 4px',
                      fontFamily: PIXEL_FONT,
                    } : {
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 15,
                      lineHeight: 1,
                      padding: 0,
                      color: starredRow ? t.accent : withAlpha(t.accent, 0.35),
                    }}
                  >
                    {starredRow ? '★' : '☆'}
                  </button>
                )}
                <span
                  className={lcd ? 'lcd-dir-name' : undefined}
                  style={{
                    fontFamily: t.fontMono,
                    fontSize: lcd ? 10.5 : 14.5,
                    fontWeight: lcd ? 700 : undefined,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: lcd
                      ? (active ? LCD.screen : LCD.ink)
                      : active ? t.accent : (themed ? t.text : 'rgba(255,255,255,0.88)'),
                  }}
                >
                  {v.name}
                </span>
                <span
                  className={lcd ? 'lcd-dir-meta' : undefined}
                  style={{
                    fontSize: lcd ? 9 : 11,
                    color: lcd
                      ? (active ? LCD.screen : LCD.muted)
                      : themed ? t.muted : 'rgba(255,255,255,0.5)',
                    whiteSpace: 'nowrap',
                    fontFamily: themed ? t.fontMono : 'sans-serif',
                  }}
                >
                  {v.boothCount} {v.boothCount === 1 ? 'booth' : 'booths'}
                  {v.inventoryCount > 0 ? ` · ${v.inventoryCount} items` : ''}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div
        style={{
          padding: '9px 16px 11px',
          borderTop: lcd
            ? `2px solid ${LCD.mid}`
            : themed ? `1px solid ${t.border}` : '1px solid rgba(212,175,55,0.2)',
          fontSize: lcd ? 9 : 11,
          color: lcd ? LCD.muted : themed ? t.muted : 'rgba(255,255,255,0.45)',
          fontFamily: themed ? t.fontMono : 'sans-serif',
          letterSpacing: lcd ? '0.06em' : '0.04em',
          textTransform: lcd ? 'uppercase' : undefined,
        }}
      >
        Select a vendor to spot their booth on the map
      </div>
    </div>
  );
}
