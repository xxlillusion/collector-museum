// Vendor View data model + pure layout math (no three.js imports so this is
// trivially unit-testable and usable from workers if ever needed).

/** A table box drawn/detected on the floor plan, in stored-image pixels. */
export interface VendorRect {
  id: string;
  x: number; // left
  y: number; // top
  w: number;
  h: number;
}

export interface VendorPlanMeta {
  rects: VendorRect[];
  pxPerMeter: number;
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
}

// Standard 6 ft folding table — must match TABLE in Room.tsx
export const TABLE_W = 1.83;
export const TABLE_D = 0.76;

const HALL_MARGIN = 2;    // clear space between plan extent and hall walls
const HALL_HEIGHT = 6;    // convention-hall ceiling
const HALL_MIN = 8;       // sane hall size clamp, meters per axis
const HALL_MAX = 80;

/** How many 6ft tables a run of `lengthM` meters holds (sloppy-box tolerant). */
export function tablesInLength(lengthM: number): number {
  return Math.max(1, Math.floor(lengthM / TABLE_W + 0.25));
}

/**
 * Convert the edited plan into hall dimensions + world-space table placements.
 * Image x → world X, image y (down) → world Z, both centered on the origin,
 * so walking the hall matches reading the map top-down.
 */
export function planToLayout(meta: VendorPlanMeta): {
  hall: HallDims;
  tables: TablePlacement[];
} {
  const { imgW, imgH, rects } = meta;

  // Clamp the scale so degenerate inference can't produce an absurd hall
  let pxPerMeter = meta.pxPerMeter;
  const rawW = imgW / pxPerMeter;
  const rawH = imgH / pxPerMeter;
  const longest = Math.max(rawW, rawH);
  if (longest > HALL_MAX) pxPerMeter = Math.max(imgW, imgH) / HALL_MAX;
  if (longest < HALL_MIN) pxPerMeter = Math.max(imgW, imgH) / HALL_MIN;

  const planW = imgW / pxPerMeter;
  const planD = imgH / pxPerMeter;
  const hall: HallDims = {
    width: planW + HALL_MARGIN * 2,
    depth: planD + HALL_MARGIN * 2,
    height: HALL_HEIGHT,
  };

  const toWorldX = (px: number) => px / pxPerMeter - planW / 2;
  const toWorldZ = (py: number) => py / pxPerMeter - planD / 2;

  const tables: TablePlacement[] = [];
  for (const r of rects) {
    const rw = r.w / pxPerMeter;
    const rd = r.h / pxPerMeter;
    const cx = toWorldX(r.x + r.w / 2);
    const cz = toWorldZ(r.y + r.h / 2);
    const alongX = rw >= rd;
    const long = alongX ? rw : rd;
    const k = tablesInLength(long);
    const run = k * TABLE_W;

    // Front drape faces the hall centerline: tables on the far half along
    // their short axis get flipped so their fronts look inward.
    for (let i = 0; i < k; i++) {
      const offset = -run / 2 + (i + 0.5) * TABLE_W;
      if (alongX) {
        const rotationY = cz > 0 ? Math.PI : 0;
        tables.push({ position: [cx + offset, 0, cz], rotationY });
      } else {
        const rotationY = cx > 0 ? -Math.PI / 2 : Math.PI / 2;
        tables.push({ position: [cx, 0, cz + offset], rotationY });
      }
    }
  }

  return { hall, tables };
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
