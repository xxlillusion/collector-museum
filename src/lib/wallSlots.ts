/**
 * Slot-based wall arrangement for the museum room (F1). Pure math, no
 * three.js (the vendorPlan.ts idiom) — Scene consumes it, tests could too.
 *
 * The grid mirrors Scene.tsx's wall descriptors exactly (walls N→S→E→W,
 * frames on the wall plane ∓0.12, S/W mirrored so column order reads
 * left-to-right when *facing* the wall), so slot placements land on the same
 * planes, at the same hang heights, as the legacy packed layout.
 *
 * Slot ids are stable strings `"{wall}:{row}:{col}"` (e.g. "N:0:3") persisted
 * per card (metadata jsonb) / per inventory item (wall_slot column). Anything
 * malformed, out of range or double-booked demotes to auto-fill at render
 * time — dangling pins never crash and are never written back.
 */

export type WallId = 'N' | 'S' | 'E' | 'W';

/** Slot pitch along each wall. Tunable — but changing it re-derives every
 *  wall's column count, which invalidates stored ids on shrunken walls
 *  (they demote to auto-fill, by design). */
export const SLOT_PITCH = 2.2;

// These must match Scene.tsx (ROW_CENTERS, WALL_MARGIN, FRAME_GAP,
// MAX_CONTENT_H/W) and CardFrame.tsx (FRAME_EXTRA). Duplicated here so the
// module stays dependency-free; Scene asserts nothing — the values are part
// of the frozen slot-id semantics.
export const SLOT_ROW_CENTERS: readonly number[] = [3.15, 1.5];
const WALL_MARGIN = 1.2;
const FRAME_GAP = 0.45;
const FRAME_EXTRA = 0.32; // (MAT_BORDER + FRAME_BORDER) * 2
const MAX_CONTENT_H = 1.25;
const MAX_CONTENT_W = 2.1;

/** Widest image content a single slot hosts without crowding its neighbour:
 *  pitch minus breathing gap minus frame surround. Wider content (up to the
 *  2.1 panorama cap) claims the slot AND its right neighbour (span 2). */
export const SLOT_SINGLE_CONTENT_W = SLOT_PITCH - FRAME_GAP - FRAME_EXTRA; // 1.43

/** Same sizing rule as Scene's sizeFor: fixed target height, capped width. */
export function sizeForAspect(aspect: number): { w: number; h: number } {
  let h = MAX_CONTENT_H;
  let w = h * aspect;
  if (w > MAX_CONTENT_W) {
    w = MAX_CONTENT_W;
    h = w / aspect;
  }
  return { w, h };
}

/** 1 = fits a single slot; 2 = claims the slot + its right neighbour. */
export function spanFor(aspect: number): 1 | 2 {
  return sizeForAspect(aspect).w > SLOT_SINGLE_CONTENT_W + 1e-9 ? 2 : 1;
}

export interface SlotWallSpec {
  wall: WallId;
  /** Packing-axis wall length (room width for N/S, depth for E/W). */
  length: number;
  cols: number;
  rotY: number;
  /** Negates the packing coordinate so facing-order col 0 is leftmost. */
  mirror: boolean;
  place: (lateral: number, rowY: number) => [number, number, number];
}

export interface SlotGridSpec {
  pitch: number;
  /** Hang heights (frame centers), row 0 = upper. */
  rows: readonly number[];
  walls: SlotWallSpec[];
  totalSlots: number;
}

/** Build the slot grid for a room (pass Room.tsx's ROOM dims). */
export function buildSlotGrid(room: {
  width: number;
  height: number;
  depth: number;
}): SlotGridSpec {
  const walls: SlotWallSpec[] = [
    {
      wall: 'N', length: room.width, cols: 0, rotY: 0, mirror: false,
      place: (x, rowY) => [x, rowY, -(room.depth / 2) + 0.12],
    },
    {
      wall: 'S', length: room.width, cols: 0, rotY: Math.PI, mirror: true,
      place: (x, rowY) => [x, rowY, (room.depth / 2) - 0.12],
    },
    {
      wall: 'E', length: room.depth, cols: 0, rotY: -Math.PI / 2, mirror: false,
      place: (z, rowY) => [(room.width / 2) - 0.12, rowY, z],
    },
    {
      wall: 'W', length: room.depth, cols: 0, rotY: Math.PI / 2, mirror: true,
      place: (z, rowY) => [-(room.width / 2) + 0.12, rowY, z],
    },
  ];
  let totalSlots = 0;
  for (const w of walls) {
    w.cols = Math.max(0, Math.floor((w.length - WALL_MARGIN * 2) / SLOT_PITCH));
    totalSlots += w.cols * SLOT_ROW_CENTERS.length;
  }
  return { pitch: SLOT_PITCH, rows: SLOT_ROW_CENTERS, walls, totalSlots };
}

export interface ParsedSlotId {
  wall: WallId;
  row: number;
  col: number;
}

/** Strict parse — null for anything malformed or outside the grid. */
export function parseSlotId(grid: SlotGridSpec, id: string): ParsedSlotId | null {
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  const wall = parts[0] as WallId;
  const spec = grid.walls.find((w) => w.wall === wall);
  if (!spec) return null;
  const row = Number(parts[1]);
  const col = Number(parts[2]);
  if (!Number.isInteger(row) || row < 0 || row >= grid.rows.length) return null;
  if (!Number.isInteger(col) || col < 0 || col >= spec.cols) return null;
  return { wall, row, col };
}

export function makeSlotId(wall: WallId, row: number, col: number): string {
  return `${wall}:${row}:${col}`;
}

/** Facing-order slot-center coordinate along the wall's packing axis. For a
 *  span-2 claim the anchor is the LEFT slot; the frame centers on the shared
 *  edge between the two columns. */
function lateralFor(spec: SlotWallSpec, col: number, span: 1 | 2): number {
  const runStart = -(spec.cols * SLOT_PITCH) / 2;
  const centerAlong =
    span === 2 ? runStart + (col + 1) * SLOT_PITCH : runStart + (col + 0.5) * SLOT_PITCH;
  return spec.mirror ? -centerAlong : centerAlong;
}

/** World transform for a slot id (span 2 needs a right neighbour). */
export function slotWorld(
  grid: SlotGridSpec,
  id: string,
  span: 1 | 2 = 1,
): { position: [number, number, number]; rotation: [number, number, number] } | null {
  const parsed = parseSlotId(grid, id);
  if (!parsed) return null;
  const spec = grid.walls.find((w) => w.wall === parsed.wall)!;
  if (span === 2 && parsed.col + 1 >= spec.cols) return null;
  return {
    position: spec.place(lateralFor(spec, parsed.col, span), grid.rows[parsed.row]),
    rotation: [0, spec.rotY, 0],
  };
}

/** Reading-order sort key: walls N→S→E→W, row 0 before row 1, cols ascending
 *  (matches computeLayout's fill order). Invalid ids sort last. */
export function slotOrderKey(grid: SlotGridSpec, id: string): number {
  const parsed = parseSlotId(grid, id);
  if (!parsed) return Number.MAX_SAFE_INTEGER;
  const wallIdx = grid.walls.findIndex((w) => w.wall === parsed.wall);
  return wallIdx * 10000 + parsed.row * 1000 + parsed.col;
}

export interface SlotInfo {
  id: string;
  wall: WallId;
  row: number;
  col: number;
  position: [number, number, number];
  rotation: [number, number, number];
}

/** Every slot in reading order — the marker mesh's data source. */
export function allSlots(grid: SlotGridSpec): SlotInfo[] {
  const out: SlotInfo[] = [];
  for (const spec of grid.walls) {
    for (let row = 0; row < grid.rows.length; row++) {
      for (let col = 0; col < spec.cols; col++) {
        out.push({
          id: makeSlotId(spec.wall, row, col),
          wall: spec.wall,
          row,
          col,
          position: spec.place(lateralFor(spec, col, 1), grid.rows[row]),
          rotation: [0, spec.rotY, 0],
        });
      }
    }
  }
  return out;
}

export interface SlotItem {
  id: string;
  aspect: number;
  /** Persisted pin — validated at resolve time, never trusted blindly. */
  wallSlot?: string;
}

export interface SlotPlacement {
  itemId: string;
  /** Anchor slot id (left slot for span-2 claims). */
  slotId: string;
  span: 1 | 2;
  /** True when the item's stored pin was honoured (vs auto-filled). */
  pinned: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  /** Image content dims (frame surround added by CardFrame). */
  width: number;
  height: number;
}

/**
 * Deterministic two-pass resolution. `items` must already be in curation
 * order (callers pass orderForWalls(wallEligible(...)) output — or plain
 * upload order for uncurated vendor museums).
 *
 *  1. Pin pass: items with a valid, unclaimed `wallSlot` land exactly there.
 *     Earlier-in-order wins conflicts; invalid/conflicted pins demote to
 *     auto-fill for this render (nothing is written back).
 *  2. Auto-fill pass: remaining items take the first free slot in reading
 *     order (span-2 items the first free adjacent pair). Items that fit
 *     nowhere land in `overflow` (binder-only, mirroring the packed layout's
 *     silent overflow).
 *
 * Placements are returned in reading order so wall inspect navigation walks
 * the room naturally.
 */
export function resolveSlotLayout(
  items: SlotItem[],
  grid: SlotGridSpec,
): { placements: SlotPlacement[]; overflow: string[] } {
  const occupied = new Set<string>();
  const placements: SlotPlacement[] = [];
  const overflow: string[] = [];
  const unplaced: { item: SlotItem; span: 1 | 2 }[] = [];

  const cellsFor = (parsed: ParsedSlotId, span: 1 | 2): string[] | null => {
    const spec = grid.walls.find((w) => w.wall === parsed.wall)!;
    if (span === 2 && parsed.col + 1 >= spec.cols) return null;
    const cells = [makeSlotId(parsed.wall, parsed.row, parsed.col)];
    if (span === 2) cells.push(makeSlotId(parsed.wall, parsed.row, parsed.col + 1));
    return cells;
  };

  const placeAt = (item: SlotItem, parsed: ParsedSlotId, span: 1 | 2, pinned: boolean) => {
    const anchor = makeSlotId(parsed.wall, parsed.row, parsed.col);
    const world = slotWorld(grid, anchor, span)!;
    const { w, h } = sizeForAspect(item.aspect);
    placements.push({
      itemId: item.id,
      slotId: anchor,
      span,
      pinned,
      position: world.position,
      rotation: world.rotation,
      width: w,
      height: h,
    });
  };

  // Pass 1 — pins.
  for (const item of items) {
    const span = spanFor(item.aspect);
    const parsed = item.wallSlot ? parseSlotId(grid, item.wallSlot) : null;
    const cells = parsed ? cellsFor(parsed, span) : null;
    if (!parsed || !cells || cells.some((c) => occupied.has(c))) {
      unplaced.push({ item, span });
      continue;
    }
    cells.forEach((c) => occupied.add(c));
    placeAt(item, parsed, span, true);
  }

  // Pass 2 — auto-fill in reading order.
  const slots = allSlots(grid);
  for (const { item, span } of unplaced) {
    let done = false;
    for (const slot of slots) {
      const parsed = { wall: slot.wall, row: slot.row, col: slot.col };
      const cells = cellsFor(parsed, span);
      if (!cells || cells.some((c) => occupied.has(c))) continue;
      cells.forEach((c) => occupied.add(c));
      placeAt(item, parsed, span, false);
      done = true;
      break;
    }
    if (!done) overflow.push(item.id);
  }

  placements.sort((a, b) => slotOrderKey(grid, a.slotId) - slotOrderKey(grid, b.slotId));
  return { placements, overflow };
}
