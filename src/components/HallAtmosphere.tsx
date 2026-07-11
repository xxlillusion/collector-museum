import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TABLE } from './Room';
import type { TablePlacement } from '../lib/vendorPlan';
import {
  getAtmosphereAssets,
  getEntranceGeometries,
  BANNER_ASPECT,
  HEADER_ASPECT,
} from './hallAtmosphereAssets';

// Convention-hall set dressing: wall signage, entrance doors, ceiling truss
// grid, hanging banners and aisle carpet runners. Everything below obeys the
// hall perf rules — ZERO lights (the ENTRANCE sign is an emissive lozenge the
// bloom pass picks up, exactly like the ceiling panels), and one instanced /
// merged draw per unique material:
//   banners (walls + hanging) · header · trusses · carpets · doors · frame ·
//   sign  =  7 draws for the whole hall, independent of table count.

export interface HallAtmosphereProps {
  /** Hall dimensions in meters (planToLayout's clamped hall). */
  width: number;
  depth: number;
  height: number;
  /** All table placements — positions/yaw/stretch for decoration anchoring. */
  tables: TablePlacement[];
}

const CARPET_FIELD = '#4e1616'; // deep show-red, darker than the tablecloth
const CARPET_BORDER = '#54431f'; // muted gold trim

/** Walkable x-gaps between the tables' x-extents — the hall's main aisles. */
function findAisles(width: number, tables: TablePlacement[]): { x: number; w: number }[] {
  const spans: [number, number][] = tables
    .map((t) => {
      const hx = ((t.sx ?? 1) * TABLE.topW) / 2;
      const hz = ((t.sz ?? 1) * TABLE.topD) / 2;
      // exact x-extent of the yawed table footprint
      const ex = Math.abs(Math.cos(t.rotationY)) * hx + Math.abs(Math.sin(t.rotationY)) * hz;
      return [t.position[0] - ex, t.position[0] + ex] as [number, number];
    })
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1] + 0.35) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  const lo = -width / 2 + 1.2;
  const hi = width / 2 - 1.2;
  const gaps: { x: number; w: number }[] = [];
  let cursor = lo;
  for (const [a, b] of merged) {
    const end = Math.min(a, hi);
    if (end > cursor + 0.01) gaps.push({ x: (cursor + end) / 2, w: end - cursor });
    cursor = Math.max(cursor, b);
    if (cursor >= hi) break;
  }
  if (cursor < hi - 0.01) gaps.push({ x: (cursor + hi) / 2, w: hi - cursor });
  return gaps
    .filter((g) => g.w >= 1.3)
    .sort((a, b) => b.w - Math.abs(b.x) * 0.02 - (a.w - Math.abs(a.x) * 0.02))
    .slice(0, 3)
    .sort((a, b) => a.x - b.x);
}

const composeM = (
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.Matrix4 => {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.scale(new THREE.Vector3(sx, sy, sz));
  m.setPosition(x, y, z);
  return m;
};

interface Layout {
  header: { y: number; w: number; h: number } | null;
  bannerMatrices: THREE.Matrix4[];
  trussMatrices: THREE.Matrix4[];
  carpetMatrices: THREE.Matrix4[];
  carpetColors: THREE.Color[];
}

function computeLayout(
  width: number,
  depth: number,
  height: number,
  tables: TablePlacement[],
): Layout {
  // --- North header banner --------------------------------------------------
  let headerH = Math.min(Math.max(width * 0.5, 5) * HEADER_ASPECT, height * 0.36);
  headerH = Math.min(headerH, 2.6);
  const headerW = headerH / HEADER_ASPECT;
  const header = { y: height - 0.45 - headerH / 2, w: headerW, h: headerH };

  // --- Cloth banners ---------------------------------------------------------
  const banners: THREE.Matrix4[] = [];
  const wallW = 1.5;
  const wallH = wallW * BANNER_ASPECT;
  const wallY = Math.min(height * 0.58, height - 0.9 - wallH / 2);
  // E/W walls, spread along z
  const perWall = Math.max(1, Math.min(6, Math.floor((depth - 6) / 7)));
  for (let k = 0; k < perWall; k++) {
    const z = ((k + 0.5) / perWall) * (depth - 6) - (depth - 6) / 2;
    banners.push(
      composeM(width / 2 - 0.06, wallY, z, 0, -Math.PI / 2, 0, wallW, wallH, 1),
      composeM(-width / 2 + 0.06, wallY, z, 0, Math.PI / 2, 0, wallW, wallH, 1),
    );
  }
  // South wall — a pair flanking the entrance
  const flankX = Math.min(Math.max(width * 0.2, 3), 9);
  banners.push(
    composeM(flankX, wallY, depth / 2 - 0.06, 0, Math.PI, 0, wallW, wallH, 1),
    composeM(-flankX, wallY, depth / 2 - 0.06, 0, Math.PI, 0, wallW, wallH, 1),
  );
  // North wall — flank the header on wide halls
  if (width >= 22) {
    const nx = header.w / 2 + 2.4;
    banners.push(
      composeM(nx, wallY, -depth / 2 + 0.06, 0, 0, 0, wallW, wallH, 1),
      composeM(-nx, wallY, -depth / 2 + 0.06, 0, 0, 0, wallW, wallH, 1),
    );
  }

  // --- Ceiling trusses (aligned with the CeilingPanels 6 m row grid) ---------
  const truss: THREE.Matrix4[] = [];
  const nz = Math.max(1, Math.floor(depth / 6));
  const span = width - 0.8;
  const topY = height - 0.3;
  const botY = height - 0.72;
  const web = topY - botY;
  for (let j = 0; j < nz; j++) {
    const z = (j + 0.5) * (depth / nz) - depth / 2;
    truss.push(
      composeM(0, topY, z, 0, 0, 0, span, 0.09, 0.09),
      composeM(0, botY, z, 0, 0, 0, span, 0.07, 0.07),
    );
    // zigzag web members
    const n = Math.max(4, Math.round(span / 1.4));
    const dx = span / n;
    const dLen = Math.hypot(dx, web);
    const ang = Math.atan2(web, dx);
    for (let i = 0; i < n; i++) {
      const cx = -span / 2 + (i + 0.5) * dx;
      truss.push(
        composeM(cx, (topY + botY) / 2, z, 0, 0, i % 2 === 0 ? ang : -ang, dLen, 0.05, 0.05),
      );
    }
    // end posts + ceiling drop rods
    truss.push(
      composeM(-span / 2, (topY + botY) / 2, z, 0, 0, 0, 0.07, web + 0.09, 0.07),
      composeM(span / 2, (topY + botY) / 2, z, 0, 0, 0, 0.07, web + 0.09, 0.07),
    );
    const rods = Math.max(2, Math.round(span / 7));
    for (let r = 0; r < rods; r++) {
      const rx = -span / 2 + ((r + 0.5) / rods) * span;
      truss.push(composeM(rx, height - 0.15, z, 0, 0, 0, 0.03, 0.3, 0.03));
    }
  }

  // --- Aisle carpet runners ---------------------------------------------------
  const aisles = findAisles(width, tables);
  const carpetMatrices: THREE.Matrix4[] = [];
  const carpetColors: THREE.Color[] = [];
  const runnerLen = depth - 3.5;
  for (const g of aisles) {
    const w = Math.max(0.9, Math.min(g.w - 0.5, 2.4));
    // border underlay then field — same instanced draw, per-instance color
    carpetMatrices.push(composeM(g.x, 0.006, 0, -Math.PI / 2, 0, 0, w + 0.24, runnerLen + 0.24, 1));
    carpetColors.push(new THREE.Color(CARPET_BORDER));
    carpetMatrices.push(composeM(g.x, 0.012, 0, -Math.PI / 2, 0, 0, w, runnerLen, 1));
    carpetColors.push(new THREE.Color(CARPET_FIELD));
  }

  // --- Hanging banners over the main aisles -----------------------------------
  const hangW = 1.35;
  const hangH = hangW * BANNER_ASPECT;
  const hangY = botY - 0.06 - hangH / 2; // tucked under the bottom chord
  const xs = aisles.length
    ? aisles.map((g) => g.x)
    : width >= 18
      ? [-width / 4, width / 4]
      : [0];
  const rowStep = nz > 6 ? 2 : 1;
  for (let j = 0; j < nz; j += rowStep) {
    if (nz >= 3 && (j === 0 || j === nz - 1)) continue; // keep the wall rows clear
    const z = (j + 0.5) * (depth / nz) - depth / 2;
    for (const x of xs) {
      banners.push(
        composeM(x, hangY, z + 0.006, 0, 0, 0, hangW, hangH, 1),
        composeM(x, hangY, z - 0.006, 0, Math.PI, 0, hangW, hangH, 1),
      );
    }
  }

  return { header, bannerMatrices: banners, trussMatrices: truss, carpetMatrices, carpetColors };
}

function InstancedStatic({
  geometry,
  material,
  matrices,
  colors,
  receiveShadow,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrices: THREE.Matrix4[];
  colors?: THREE.Color[];
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    if (colors) {
      for (let i = 0; i < colors.length; i++) mesh.setColorAt(i, colors[i]);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, colors, geometry, material]);
  if (matrices.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, matrices.length]}
      receiveShadow={receiveShadow ?? false}
    />
  );
}

export default function HallAtmosphere({ width, depth, height, tables }: HallAtmosphereProps) {
  const assets = useMemo(getAtmosphereAssets, []);
  const entrance = useMemo(getEntranceGeometries, []);
  const layout = useMemo(
    () => computeLayout(width, depth, height, tables),
    [width, depth, height, tables],
  );

  // Shadow maps render on demand (gl.shadowMap.autoUpdate = false) — nudge
  // one refresh after our meshes mount so they appear in the baked shadows.
  const { gl } = useThree();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      gl.shadowMap.needsUpdate = true;
    });
    return () => cancelAnimationFrame(id);
  }, [gl, layout]);

  return (
    <group>
      {/* North-wall CARD SHOW header */}
      {layout.header && (
        <mesh
          geometry={assets.unitPlane}
          material={assets.headerMaterial}
          position={[0, layout.header.y, -depth / 2 + 0.07]}
          scale={[layout.header.w, layout.header.h, 1]}
        />
      )}

      {/* Cloth banners — E/W walls, entrance flankers, hanging over aisles */}
      <InstancedStatic
        geometry={assets.unitPlane}
        material={assets.bannerMaterial}
        matrices={layout.bannerMatrices}
      />

      {/* Ceiling truss grid under the panel rows */}
      <InstancedStatic
        geometry={assets.unitBox}
        material={assets.trussMaterial}
        matrices={layout.trussMatrices}
      />

      {/* Aisle carpet runners (border + field share the draw via instance color) */}
      <InstancedStatic
        geometry={assets.unitPlane}
        material={assets.carpetMaterial}
        matrices={layout.carpetMatrices}
        colors={layout.carpetColors}
        receiveShadow
      />

      {/* Entrance — double doors at the south wall, behind the spawn */}
      <group position={[0, 0, depth / 2 - 0.13]} rotation={[0, Math.PI, 0]}>
        <mesh geometry={entrance.doors} material={assets.doorMaterial} />
        <mesh geometry={entrance.frame} material={assets.frameMaterial} />
        <mesh
          geometry={assets.signGeometry}
          material={assets.signMaterial}
          position={[0, 2.86, 0.062]}
        />
      </group>
    </group>
  );
}
