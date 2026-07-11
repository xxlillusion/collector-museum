// Lighting / exposure / post-processing tuning constants for the two frozen
// scene hosts (Scene.tsx = museum, VendorScene.tsx = hall). DATA ONLY — no
// imports, no three objects. Stream B1 tunes atmosphere by editing values
// here without touching the frozen scene files; the scenes consume these via
// imports, and the extraction is value-identical to the literals it replaced.
//
// NOT here (lives in files with their own owners / outside this wave):
// museum base hemisphere/ambient + bench key light (Room.tsx), hall base
// hemisphere/ambient (VendorRoom.tsx — B1-owned, tune in place), reflector
// and material parameters (Room/VendorRoom/tableGeometry/CardFrame/Table).

// ---------------------------------------------------------------------------
// Museum (Scene.tsx)
// ---------------------------------------------------------------------------

/** Canvas gl toneMappingExposure (ACES).
 *  1.15 → 1.08 (2026-07-10 close-range washout pass): cards were blowing out
 *  to flat cream when inspected from ~1 m; the spawn look barely shifts. */
export const MUSEUM_EXPOSURE = 1.08;

/** Warm track spotlight painting each frame cluster (WallSpot).
 *  intensity 60 → 48, penumbra 0.85 → 0.95 (same washout pass): softer,
 *  ~20% dimmer pools keep the passe-partout off full white up close while
 *  the pooled-light look at spawn distance is preserved. */
export const MUSEUM_WALL_SPOT = {
  intensity: 48,
  angle: 0.7,
  penumbra: 0.95,
  decay: 2,
  distance: 11,
  color: '#ffe6bd',
} as const;

/** Emissive lens on the WallSpot fixture head (bloom pickup). */
export const MUSEUM_SPOT_LENS_EMISSIVE = 6;

/** Local env-map Lightformers (no network fetch — keep it that way). */
export const MUSEUM_ENV_TOP = { intensity: 1.4, color: '#fff2dc' } as const;
export const MUSEUM_ENV_SIDE = { intensity: 0.5, color: '#e8dfd0' } as const;

/** Post-processing (desktop only). */
export const MUSEUM_BLOOM = { luminanceThreshold: 1.2, intensity: 0.35 } as const;
export const MUSEUM_VIGNETTE = { offset: 0.18, darkness: 0.55 } as const;

// ---------------------------------------------------------------------------
// Convention hall (VendorScene.tsx)
// ---------------------------------------------------------------------------

/** Canvas gl toneMappingExposure (ACES). */
export const HALL_EXPOSURE = 1.15;

/** Warm aisle spotlights (≤6 total — the hall's forward-light budget).
 *  `distanceFactor` multiplies the hall height (distance = height × factor). */
export const HALL_AISLE_SPOT = {
  intensity: 55,
  angle: 0.95,
  penumbra: 1,
  decay: 2,
  distanceFactor: 2.6,
  color: '#ffe6bd',
} as const;

/** Emissive lens on the AisleSpot fixture head (bloom pickup). */
export const HALL_SPOT_LENS_EMISSIVE = 6;

/** Emissive ceiling panels — visual density via bloom, zero light cost. */
export const HALL_CEILING_PANEL_EMISSIVE = 2.2;

/** The hall's single shadow-casting light (skylight banks directional). */
export const HALL_SHADOW_DIRECTIONAL = { intensity: 1.1, color: '#fff4e0' } as const;

/** Local env-map Lightformers (no network fetch — keep it that way). */
export const HALL_ENV_TOP = { intensity: 1.2, color: '#fff2dc' } as const;
export const HALL_ENV_SIDE = { intensity: 0.4, color: '#e8dfd0' } as const;

/** Post-processing (desktop only). */
export const HALL_BLOOM = { luminanceThreshold: 1.2, intensity: 0.35 } as const;
export const HALL_VIGNETTE = { offset: 0.18, darkness: 0.55 } as const;
