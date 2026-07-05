// Vendor View data model + pure layout math (no three.js imports so this is
// trivially unit-testable and usable from workers if ever needed).

/** A table box drawn/detected on the floor plan, in stored-image pixels. */
export interface VendorRect {
  id: string;
  x: number; // left (of the unrotated footprint)
  y: number; // top
  w: number;
  h: number;
  // SVG rotate() convention: degrees clockwise on the y-down image, about the
  // rect center. Absent/0 = axis-aligned (all detected rects).
  rotationDeg?: number;
  // Per-vendor banner (settings slot `vendorBanner:<id>`); absent = global banner
  bannerId?: string;
}

export interface VendorPlanMeta {
  rects: VendorRect[];
  pxPerMeter: number;
  // 'manual' = user calibrated; Re-detect must not overwrite it
  pxPerMeterSource?: 'inferred' | 'manual';
  // Player start position in stored-image px; absent = default spawn
  startPx?: { x: number; y: number };
  // Standard vendor table length for this show; absent = 6 ft
  tableLengthFt?: 6 | 8;
  imgW: number;
  imgH: number;
  updatedAt: number;
}

export interface HallDims {
  width: number;  // world X
  depth: number;  // world Z
  height: number; // world Y
}

export interface TablePlacement {
  position: [number, number, number];
  rotationY: number;
  bannerId?: string;
  /** Stretch along the table's local width (long axis); absent = 1. */
  sx?: number;
  /** Stretch along the table's local depth (short axis); absent = 1. */
  sz?: number;
}

// Standard 6 ft folding table — must match TABLE in Room.tsx. The rendered
// geometry is always this size; other show standards (8 ft) render as a
// per-table stretch (TablePlacement.sx).
export const TABLE_W = 1.83;
export const TABLE_D = 0.76;

/** The show's standard table length in meters (default 6 ft). */
export function standardTableW(ft?: 6 | 8): number {
  return (ft ?? 6) * 0.3048;
}

const HALL_MARGIN = 2;    // clear space between plan extent and hall walls
const HALL_HEIGHT = 6;    // convention-hall ceiling
const HALL_MIN = 8;       // sane hall size clamp, meters per axis
const HALL_MAX = 80;
// Walking comfort: booth positions (and the hall) spread by this factor while
// each booth keeps its true footprint — aisles get wider, tables don't inflate.
// The returned pxPerMeter/planW/planD already include it, so the minimap and
// spawn mapping stay consistent for free.
const AISLE_SCALE = 1.2;

export interface BoxGrid {
  cols: number; // tables along the box's long axis
  rows: number; // rows along the box's short axis
  sx: number;   // per-table stretch along the long axis
  sz: number;   // per-table stretch along the short axis
}

// Stretch clamp: within this range the grid spans the box exactly; beyond it
// (degenerate boxes) tables stay near-standard and leave a residual gap.
const STRETCH_MIN = 0.6;
const STRETCH_MAX = 1.4;

/**
 * Subdivide a box footprint (meters, long/short axis) into a grid of
 * standard tables stretched so the grid spans the box edge-to-edge.
 * `tableW` is the show's standard slot length; `sx` stays normalized to the
 * rendered 1.83 m geometry, so an exact 8 ft slot is one table at sx ≈ 1.33.
 * Shared by planToLayout and the 2D editor preview so they can't disagree.
 */
export function boxGrid(longM: number, shortM: number, tableW: number = TABLE_W): BoxGrid {
  const cols = Math.max(1, Math.round(longM / tableW));
  const rows = Math.max(1, Math.round(shortM / TABLE_D));
  const k = tableW / TABLE_W; // clamp window follows the show standard
  const clampX = (v: number) => Math.min(STRETCH_MAX * k, Math.max(STRETCH_MIN * k, v));
  const clampZ = (v: number) => Math.min(STRETCH_MAX, Math.max(STRETCH_MIN, v));
  return {
    cols,
    rows,
    sx: clampX(longM / (cols * TABLE_W)),
    sz: clampZ(shortM / (rows * TABLE_D)),
  };
}

/**
 * Convert the edited plan into hall dimensions + world-space table placements.
 * Image x → world X, image y (down) → world Z, both centered on the origin,
 * so walking the hall matches reading the map top-down.
 */
export function planToLayout(meta: VendorPlanMeta): {
  hall: HallDims;
  tables: TablePlacement[];
  /** The clamped scale/extents actually used — the px↔world mapping basis. */
  pxPerMeter: number;
  planW: number;
  planD: number;
} {
  const { imgW, imgH, rects } = meta;

  // Clamp the scale so degenerate inference can't produce an absurd hall
  // (the clamp bounds the aisle-spread extent, keeping the 8–80 m guarantee)
  let pxPerMeter = meta.pxPerMeter;
  const rawW = (imgW / pxPerMeter) * AISLE_SCALE;
  const rawH = (imgH / pxPerMeter) * AISLE_SCALE;
  const longest = Math.max(rawW, rawH);
  if (longest > HALL_MAX) pxPerMeter = (Math.max(imgW, imgH) * AISLE_SCALE) / HALL_MAX;
  if (longest < HALL_MIN) pxPerMeter = (Math.max(imgW, imgH) * AISLE_SCALE) / HALL_MIN;

  // Positions and hall extents use the spread scale; box footprints (which
  // size the tables via boxGrid) keep the true scale below.
  const posPpm = pxPerMeter / AISLE_SCALE;
  const planW = imgW / posPpm;
  const planD = imgH / posPpm;
  const hall: HallDims = {
    width: planW + HALL_MARGIN * 2,
    depth: planD + HALL_MARGIN * 2,
    height: HALL_HEIGHT,
  };

  const toWorldX = (px: number) => px / posPpm - planW / 2;
  const toWorldZ = (py: number) => py / posPpm - planD / 2;

  const tables: TablePlacement[] = [];
  for (const r of rects) {
    const rw = r.w / pxPerMeter;
    const rd = r.h / pxPerMeter;
    const cx = toWorldX(r.x + r.w / 2);
    const cz = toWorldZ(r.y + r.h / 2);
    const alongX = rw >= rd;
    const long = alongX ? rw : rd;
    const short = alongX ? rd : rw;
    const { cols, rows, sx, sz } = boxGrid(long, short, standardTableW(meta.tableLengthFt));
    const pitchL = sx * TABLE_W; // cell pitch along the box long axis
    const pitchS = sz * TABLE_D; // cell pitch along the box short axis

    // Image-space rotate(d) (clockwise, y-down) equals world rotationY of
    // −d: both maps agree on cos and differ in sin sign (X↔image x, Z↔image y)
    const theta = -((r.rotationDeg ?? 0) * Math.PI) / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Facing: a single row keeps the original heuristic — the front drape
    // faces the hall centerline (rect center is rotation-invariant, so it
    // ignores theta). Multi-row booths face back-to-back outward from the
    // booth's own center; an exact middle row falls back to the heuristic.
    for (let j = 0; j < rows; j++) {
      const offS = (-rows / 2 + j + 0.5) * pitchS;
      const outward = Math.abs(offS) < 1e-6 ? 0 : Math.sign(offS);
      for (let i = 0; i < cols; i++) {
        const offL = (-cols / 2 + i + 0.5) * pitchL;
        // Local offsets in the unrotated image-aligned frame + base heading.
        // rotY 0 faces +Z, π faces −Z, ±π/2 face ±X.
        const [ox, oz, baseRotY] = alongX
          ? [offL, offS, outward !== 0 ? (outward > 0 ? 0 : Math.PI) : cz > 0 ? Math.PI : 0]
          : [offS, offL, outward !== 0 ? (outward > 0 ? Math.PI / 2 : -Math.PI / 2) : cx > 0 ? -Math.PI / 2 : Math.PI / 2];
        const table: TablePlacement = {
          position:
            theta === 0
              ? [cx + ox, 0, cz + oz]
              : [cx + ox * cosT + oz * sinT, 0, cz - ox * sinT + oz * cosT],
          rotationY: baseRotY + theta,
          bannerId: r.bannerId,
        };
        if (sx !== 1) table.sx = sx;
        if (sz !== 1) table.sz = sz;
        tables.push(table);
      }
    }
  }

  // posPpm is the world-mapping basis (minimap, spawn), not the true scale
  return { hall, tables, pxPerMeter: posPpm, planW, planD };
}

/** Parse + validate a stored meta blob; undefined when missing/corrupt. */
export async function parsePlanMeta(blob: Blob | undefined): Promise<VendorPlanMeta | undefined> {
  if (!blob) return undefined;
  try {
    const meta = JSON.parse(await blob.text()) as VendorPlanMeta;
    if (
      !Array.isArray(meta.rects) ||
      typeof meta.pxPerMeter !== 'number' ||
      !(meta.pxPerMeter > 0) ||
      typeof meta.imgW !== 'number' ||
      typeof meta.imgH !== 'number'
    ) {
      return undefined;
    }
    return meta;
  } catch {
    return undefined;
  }
}
