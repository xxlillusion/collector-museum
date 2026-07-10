import type { TablePlacement } from '../lib/vendorPlan';

// Hall atmosphere seam — Stream B1 fills this in (hanging banners, columns,
// signage, floor decals, dust… whatever sells the convention hall). Mounted
// by VendorScene inside the same Suspense boundary as the tables.
//
// PERF BUDGET (non-negotiable, see CLAUDE.md "Perf rules for the hall"):
// - Instanced meshes only — anything per-table multiplies draw calls by
//   table count, and the reflector renders the scene TWICE.
// - NO new lights, ever mounted or conditional (gotcha 11: a light-count
//   change recompiles every material in the scene). Glow comes from emissive
//   materials picked up by bloom.

export interface HallAtmosphereProps {
  /** Hall dimensions in meters (planToLayout's clamped hall). */
  width: number;
  depth: number;
  height: number;
  /** All table placements — positions/yaw/stretch for decoration anchoring. */
  tables: TablePlacement[];
}

export default function HallAtmosphere(_props: HallAtmosphereProps) {
  return <group />;
}
