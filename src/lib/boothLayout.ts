/**
 * Per-store booth layout config (F4) — pure helpers. Stored on the
 * vendor-owned row (`vendors.booth_layout` jsonb / `VendorRecord.boothLayout`)
 * because booth rows are organizer-owned under RLS AND delete+reinserted on
 * every organizer save — vendor config can never live there.
 *
 * Deliberately minimal: where binders sit across the table depth, how many
 * items per binder (smaller = MORE binders; fewer/smaller binders never hide
 * items), and the arrangement style. Consumed by computeBinderPoses +
 * OpenHallBinder (VendorHallBinders.tsx) and previewed by BoothLayoutEditor —
 * both must call THESE functions so the preview can't lie.
 */

export type BoothPlacement = 'front' | 'center' | 'back';
export type BoothArrangement = 'casual' | 'aligned';
/** Multiples of a double-sided sheet stack (18/sheet): 2, 3 or 5 sheets. */
export type BinderCapacity = 36 | 54 | 90;

export const BINDER_CAPACITIES: readonly BinderCapacity[] = [36, 54, 90];

export interface BoothLayoutConfig {
  /** Where binders sit across the table depth. Default 'center' (today). */
  placement?: BoothPlacement;
  /** Items per binder. Default 90 (today); binderCount = ceil(count / this). */
  itemsPerBinder?: BinderCapacity;
  /** 'casual' = today's alternating ±0.1 rad skew; 'aligned' = square. */
  arrangement?: BoothArrangement;
}

export const DEFAULT_BOOTH_LAYOUT: Required<BoothLayoutConfig> = {
  placement: 'center',
  itemsPerBinder: 90,
  arrangement: 'casual',
};

export function itemsPerBinderOf(cfg?: BoothLayoutConfig | null): number {
  const v = cfg?.itemsPerBinder;
  return v && (BINDER_CAPACITIES as readonly number[]).includes(v)
    ? v
    : DEFAULT_BOOTH_LAYOUT.itemsPerBinder;
}

export function placementOf(cfg?: BoothLayoutConfig | null): BoothPlacement {
  const v = cfg?.placement;
  return v === 'front' || v === 'back' ? v : 'center';
}

export function arrangementOf(cfg?: BoothLayoutConfig | null): BoothArrangement {
  return cfg?.arrangement === 'aligned' ? 'aligned' : 'casual';
}

/**
 * Signed offset along the table's LOCAL depth axis (+Z = the aisle-facing
 * front drape). 'front' pushes binders toward the front edge, 'back' toward
 * the back; a 6 cm margin keeps covers off the drape roll.
 */
export function placementZOffset(
  cfg: BoothLayoutConfig | null | undefined,
  tableDepth: number,
  binderDepth: number,
): number {
  const placement = placementOf(cfg);
  if (placement === 'center') return 0;
  const travel = Math.max(0, tableDepth / 2 - binderDepth / 2 - 0.06);
  return placement === 'front' ? travel : -travel;
}

/** Validate untrusted jsonb into a config; undefined = nothing stored /
 *  nothing valid (renders as defaults). */
export function normalizeBoothLayout(raw: unknown): BoothLayoutConfig | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: BoothLayoutConfig = {};
  if (r.placement === 'front' || r.placement === 'center' || r.placement === 'back') {
    out.placement = r.placement;
  }
  if (
    typeof r.itemsPerBinder === 'number' &&
    (BINDER_CAPACITIES as readonly number[]).includes(r.itemsPerBinder)
  ) {
    out.itemsPerBinder = r.itemsPerBinder as BinderCapacity;
  }
  if (r.arrangement === 'casual' || r.arrangement === 'aligned') {
    out.arrangement = r.arrangement;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
