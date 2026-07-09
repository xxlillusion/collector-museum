import type { CSSProperties } from 'react';

// In-hall vendor directory (DOM overlay, VendorScene owns open state).
// Opening unlocks the pointer and freezes controls — the binder-open pattern.
// Selecting a vendor highlights their booth(s) on the minimap, which stays
// visible top-right while the panel is up.

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

const GOLD = '#d4af37';
const SERIF = "Georgia, 'Times New Roman', serif";

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(212,175,55,0.14)',
  padding: '11px 10px',
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.88)',
};

export default function HallDirectory({
  vendors,
  highlightId,
  onHighlight,
  starredIds,
  onToggleStar,
  onClose,
}: HallDirectoryProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 76,
        left: 16,
        width: 300,
        maxHeight: 'calc(100vh - 140px)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(10,8,6,0.88)',
        border: '1px solid rgba(212,175,55,0.35)',
        borderRadius: 8,
        backdropFilter: 'blur(6px)',
        zIndex: 20,
        pointerEvents: 'auto',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 12px',
          borderBottom: '1px solid rgba(212,175,55,0.3)',
        }}
      >
        <span
          style={{
            fontFamily: SERIF,
            fontSize: 13,
            letterSpacing: '0.22em',
            color: GOLD,
          }}
        >
          VENDORS AT THIS SHOW
        </span>
        <button
          onClick={onClose}
          title="Close (M or Esc)"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 15,
            cursor: 'pointer',
            padding: '2px 4px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: '4px 8px 8px' }}>
        {vendors.length === 0 ? (
          <p
            style={{
              fontFamily: SERIF,
              fontStyle: 'italic',
              fontSize: 13.5,
              color: 'rgba(255,255,255,0.55)',
              padding: '12px 10px',
              margin: 0,
            }}
          >
            No vendors assigned to booths in this show.
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
                onClick={() => onHighlight(active ? null : v.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onHighlight(active ? null : v.id);
                }}
                style={{
                  ...rowStyle,
                  alignItems: 'center',
                  background: active ? 'rgba(212,175,55,0.14)' : 'transparent',
                  borderLeft: active ? `2px solid ${GOLD}` : '2px solid transparent',
                }}
              >
                {onToggleStar && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(v.id);
                    }}
                    title={starredRow ? 'Unstar this vendor' : 'Star — glow on the map'}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 15,
                      lineHeight: 1,
                      padding: 0,
                      color: starredRow ? GOLD : 'rgba(212,175,55,0.35)',
                    }}
                  >
                    {starredRow ? '★' : '☆'}
                  </button>
                )}
                <span
                  style={{
                    fontFamily: SERIF,
                    fontSize: 14.5,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: active ? GOLD : 'rgba(255,255,255,0.88)',
                  }}
                >
                  {v.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.5)',
                    whiteSpace: 'nowrap',
                    fontFamily: 'sans-serif',
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
          borderTop: '1px solid rgba(212,175,55,0.2)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.45)',
          fontFamily: 'sans-serif',
          letterSpacing: '0.04em',
        }}
      >
        Select a vendor to spot their booth on the map
      </div>
    </div>
  );
}
