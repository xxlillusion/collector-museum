import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useProvider } from '../lib/provider/context';
import {
  BINDER_CAPACITIES,
  DEFAULT_BOOTH_LAYOUT,
  arrangementOf,
  itemsPerBinderOf,
  placementOf,
  placementZOffset,
} from '../lib/boothLayout';
import type {
  BinderCapacity,
  BoothArrangement,
  BoothLayoutConfig,
  BoothPlacement,
} from '../lib/boothLayout';
import type { VendorSummary } from '../lib/useVendors';
import { useTheme } from './themeKit';
import { LCD, PIXEL_FONT, lcdWell } from './lcdKit';

// Per-store booth layout editor (F4): binder placement / items-per-binder /
// arrangement, persisted on the vendor record through the provider seam and
// consumed by computeBinderPoses in every hall the store appears in. The SVG
// preview and the engine share the SAME math — placementZOffset /
// itemsPerBinderOf / arrangementOf from lib/boothLayout plus spreadOffX and
// BINDER_FOOTPRINT_DEPTH below — so what the preview shows is what the hall
// lays out.

/**
 * The closed shell's lie-flat footprint along table-local Z — Binder.tsx's
 * COVER_H. Mirrored as a literal because importing Binder here would pull
 * three.js into the DOM entry chunk (code-splitting rule); VendorHallBinders
 * imports THIS constant (single source for the pose math) and warns loudly if
 * it ever drifts from COVER_H.
 */
export const BINDER_FOOTPRINT_DEPTH = 0.36;

/**
 * Where binder i sits along its table's long axis: binders 0..lastIdx-1 rest
 * centered on their own tables; extras spread across the last table. Shared
 * verbatim by computeBinderPoses (hall) and the preview below — the offsets
 * the preview draws are the offsets the hall uses.
 */
export function spreadOffX(
  i: number,
  lastIdx: number,
  extrasOnLast: number,
  tableWidth: number,
): number {
  if (i < lastIdx || extrasOnLast <= 1) return 0;
  const j = i - lastIdx;
  const pitch = Math.min(0.42, (tableWidth * 0.8) / extrasOnLast);
  return (j - (extrasOnLast - 1) / 2) * pitch;
}

/** Show-standard 6 ft table dims (TABLE in Room.tsx — mirrored; Room pulls
 *  three.js). Preview-only. */
const PREVIEW_TABLE_W = 1.83;
const PREVIEW_TABLE_D = 0.76;

/** Closed shell's reach along world X around its pose origin in the lie-flat
 *  pose (covers extend to −0.30, spine overhangs +0.022 — binderShellAssets
 *  dims). Cosmetic — rect shape only; positions come from the shared math. */
const SHELL_X_MIN = -0.3;
const SHELL_X_MAX = 0.022;

/**
 * Small segmented control in the panel idiom: active option renders as the
 * accent inversion (under the handheld theme accent = ink, so this is the LCD
 * inversion automatically). Also used by the per-item display toggles in
 * VendorManagementPanel (`compact`).
 */
export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  compact = false,
  title,
}: {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  /** Tile-sized variant (per-item display toggles). */
  compact?: boolean;
  title?: string;
}) {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  return (
    <div title={title} style={{ display: 'inline-flex', flexWrap: 'wrap', gap: compact ? 3 : 5 }}>
      {options.map((o) => {
        const active = o.value === value;
        const style: CSSProperties = {
          background: active ? t.accent : 'transparent',
          color: active ? t.accentContrast : t.muted,
          border: `${t.borderWidth}px solid ${active ? t.accent : t.border}`,
          borderRadius: lcd ? 0 : 3,
          padding: compact ? '2px 6px' : '6px 13px',
          fontSize: compact ? 8.5 : 10.5,
          letterSpacing: '0.07em',
          fontFamily: lcd ? PIXEL_FONT : t.id === 'refined' ? undefined : t.fontMono,
          fontWeight: lcd ? 700 : active ? 600 : 400,
          textTransform: 'uppercase',
          cursor: active ? 'default' : 'pointer',
        };
        return (
          <button
            key={String(o.value)}
            onClick={() => {
              if (!active) onChange(o.value);
            }}
            style={style}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const PLACEMENT_OPTIONS: readonly { value: BoothPlacement; label: string }[] = [
  { value: 'front', label: 'Front edge' },
  { value: 'center', label: 'Centered' },
  { value: 'back', label: 'Back edge' },
];

const ARRANGEMENT_OPTIONS: readonly { value: BoothArrangement; label: string }[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'aligned', label: 'Aligned' },
];

const CAPACITY_OPTIONS: readonly { value: BinderCapacity; label: string }[] =
  BINDER_CAPACITIES.map((c) => ({ value: c, label: String(c) }));

/** Full config from a maybe-partial stored one, via the REAL normalize fns. */
function fullConfig(cfg?: BoothLayoutConfig): Required<BoothLayoutConfig> {
  return {
    placement: placementOf(cfg),
    itemsPerBinder: itemsPerBinderOf(cfg) as BinderCapacity,
    arrangement: arrangementOf(cfg),
  };
}

/**
 * Top-down preview of a representative 2-table booth (one row of a 1×2
 * boxGrid booth at rotY 0, front/aisle toward the bottom). Binder positions
 * come from the same functions the hall uses; the rects' shape mirrors the
 * closed-shell footprint.
 */
function BoothPreview({ cfg, count }: { cfg: Required<BoothLayoutConfig>; count: number }) {
  const t = useTheme();
  const lcd = t.id === 'handheld';
  const S = 82; // svg px per meter
  const W = 340;
  const H = 134;
  const cx = W / 2;
  const cy = 56; // svg y of world z = 0 (table band center)

  const tableXs = [-PREVIEW_TABLE_W / 2, PREVIEW_TABLE_W / 2];
  const lastIdx = tableXs.length - 1;
  const binderCount = Math.max(1, Math.ceil(count / cfg.itemsPerBinder));
  const extrasOnLast = Math.max(1, binderCount - lastIdx);
  const offZ = placementZOffset(cfg, PREVIEW_TABLE_D, BINDER_FOOTPRINT_DEPTH);
  const aligned = cfg.arrangement === 'aligned';

  const binders: { x: number; z: number; skewDeg: number }[] = [];
  for (let i = 0; i < binderCount; i++) {
    binders.push({
      x: tableXs[Math.min(i, lastIdx)] + spreadOffX(i, lastIdx, extrasOnLast, PREVIEW_TABLE_W),
      z: offZ,
      skewDeg: aligned ? 0 : ((i % 2 === 0 ? 1 : -1) * 0.1 * 180) / Math.PI,
    });
  }

  const labelStyle: CSSProperties = {
    fontSize: 8.5,
    letterSpacing: '0.18em',
    fill: t.muted,
    fontFamily: lcd ? PIXEL_FONT : t.fontMono,
  };
  const tableFill = lcd ? LCD.mid : '#6b1d1d'; // the hall's tablecloth burgundy
  const tableStroke = lcd ? LCD.ink : 'rgba(0,0,0,0.45)';
  const binderFill = lcd ? LCD.ink : '#33261a'; // shell leather
  const binderStroke = lcd ? LCD.ink : 'rgba(214,180,140,0.4)';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', maxWidth: 420, display: 'block' }}
      aria-label="Booth layout preview"
    >
      <text x={cx} y={13} textAnchor="middle" style={labelStyle}>
        BACK
      </text>
      {tableXs.map((tx) => (
        <rect
          key={tx}
          x={cx + (tx - PREVIEW_TABLE_W / 2) * S}
          y={cy - (PREVIEW_TABLE_D / 2) * S}
          width={PREVIEW_TABLE_W * S}
          height={PREVIEW_TABLE_D * S}
          fill={tableFill}
          stroke={tableStroke}
          strokeWidth={lcd ? 2 : 1}
          rx={lcd ? 0 : 2}
        />
      ))}
      {binders.map((b, i) => {
        const px = cx + b.x * S;
        const py = cy + b.z * S;
        const x0 = cx + (b.x + SHELL_X_MIN) * S;
        const y0 = cy + (b.z - BINDER_FOOTPRINT_DEPTH / 2) * S;
        const w = (SHELL_X_MAX - SHELL_X_MIN) * S;
        const h = BINDER_FOOTPRINT_DEPTH * S;
        return (
          <g key={i} transform={`rotate(${b.skewDeg} ${px} ${py})`}>
            <rect
              x={x0}
              y={y0}
              width={w}
              height={h}
              fill={binderFill}
              stroke={binderStroke}
              strokeWidth={1}
              rx={lcd ? 0 : 1.5}
            />
            <line
              x1={x0 + w - 3}
              y1={y0 + 2}
              x2={x0 + w - 3}
              y2={y0 + h - 2}
              stroke={lcd ? LCD.screen : 'rgba(214,180,140,0.5)'}
              strokeWidth={1.2}
            />
          </g>
        );
      })}
      <line
        x1={20}
        y1={101}
        x2={W - 20}
        y2={101}
        stroke={lcd ? LCD.ink : t.border}
        strokeWidth={1}
        strokeDasharray="5 5"
      />
      <text x={cx} y={118} textAnchor="middle" style={labelStyle}>
        FRONT OF BOOTH · AISLE
      </text>
    </svg>
  );
}

/**
 * The BOOTH DISPLAY section of VendorManagementPanel. Choices persist
 * immediately (no save button); a default-equivalent choice clears the stored
 * config (`boothLayout: undefined` — the local record drops to absent-like,
 * remote.ts nulls the column), keeping default stores on the classic path.
 */
export default function BoothLayoutEditor({
  vendor,
  onSaved,
}: {
  vendor: VendorSummary;
  /** Persisted — hosts reload summaries so future walks read the new config. */
  onSaved: () => void;
}) {
  const provider = useProvider();
  const t = useTheme();
  const lcd = t.id === 'handheld';
  const [cfg, setCfg] = useState<Required<BoothLayoutConfig>>(() => fullConfig(vendor.boothLayout));
  const [error, setError] = useState<string | null>(null);

  // Reset only on vendor switch. Persisted echoes (summary reload after save)
  // always match local state; re-syncing on them could clobber a newer click.
  useEffect(() => {
    setCfg(fullConfig(vendor.boothLayout));
    setError(null);
  }, [vendor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (patch: Partial<Required<BoothLayoutConfig>>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    // Persist OUTSIDE any state updater (StrictMode double-invoke gotcha).
    const isDefault =
      next.placement === DEFAULT_BOOTH_LAYOUT.placement &&
      next.itemsPerBinder === DEFAULT_BOOTH_LAYOUT.itemsPerBinder &&
      next.arrangement === DEFAULT_BOOTH_LAYOUT.arrangement;
    provider
      .updateVendor(vendor.id, { boothLayout: isDefault ? undefined : next })
      .then(() => {
        setError(null);
        onSaved();
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  // Binder-eligible count when the store has items; a sample stack otherwise.
  const realCount = vendor.binderCount ?? vendor.inventoryCount;
  const sample = realCount === 0;
  const previewCount = sample ? 90 : realCount;
  const previewBinders = Math.max(1, Math.ceil(previewCount / cfg.itemsPerBinder));

  const rowLabel: CSSProperties = { ...t.label, marginBottom: 6 };
  const previewWrap: CSSProperties = lcd
    ? { ...lcdWell, padding: 8, maxWidth: 436 }
    : {
        background: t.bg,
        border: `${t.borderWidth}px solid ${t.border}`,
        borderRadius: t.radius,
        padding: 8,
        maxWidth: 436,
      };

  return (
    <div style={t.panelStyle}>
      <div style={t.panelTitle}>BOOTH DISPLAY</div>
      <div style={{ ...t.note, fontSize: 12.5, marginBottom: 14 }}>
        How your binders sit on your tables in every 3D show you appear in.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={rowLabel}>BINDER PLACEMENT</div>
          <Segmented
            options={PLACEMENT_OPTIONS}
            value={cfg.placement}
            onChange={(v) => apply({ placement: v })}
            title="Where binders sit across the table depth"
          />
        </div>
        <div>
          <div style={rowLabel}>ITEMS PER BINDER</div>
          <Segmented
            options={CAPACITY_OPTIONS}
            value={cfg.itemsPerBinder}
            onChange={(v) => apply({ itemsPerBinder: v })}
            title="Binder capacity — smaller binders = more binders on the table"
          />
          <div style={{ ...t.note, fontSize: 11.5, marginTop: 6 }}>
            Smaller binders = more binders on the table. Nothing is hidden — binders are added
            until every item fits.
          </div>
        </div>
        <div>
          <div style={rowLabel}>ARRANGEMENT</div>
          <Segmented
            options={ARRANGEMENT_OPTIONS}
            value={cfg.arrangement}
            onChange={(v) => apply({ arrangement: v })}
            title="Casual = slight alternating skew · Aligned = squared to the table"
          />
        </div>
        <div>
          <div style={rowLabel}>BOOTH PREVIEW</div>
          <div style={previewWrap}>
            <BoothPreview cfg={cfg} count={previewCount} />
          </div>
          <div style={{ ...t.note, fontSize: 11.5, marginTop: 8 }}>
            {sample
              ? 'Previewing a sample 90 items'
              : `Previewing your ${realCount} item${realCount === 1 ? '' : 's'}`}
            {' → '}
            {previewBinders} binder{previewBinders === 1 ? '' : 's'}. Every show arranges your
            booth this way, adapted to its real tables.
          </div>
        </div>
        {error && <p style={{ ...t.errorText, margin: 0 }}>{error}</p>}
      </div>
    </div>
  );
}
