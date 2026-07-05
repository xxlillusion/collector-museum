import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TABLE } from './Room';

// Shared 6ft-table geometry/materials — used by the museum Table (one mesh
// per part) and by VendorTables (one instancedMesh per part, hundreds of
// tables). Everything here is deterministic and built once per session, which
// is what makes instancing possible: the cloth "deformation" is baked into
// the geometry, not animated.

export const CLOTH_COLOR = '#6b1d1d';
export const CLOTH_ROUGHNESS = 0.92;

// Drape measurements (cloth overhangs the top by a small margin, then falls
// to just above the floor)
export const OVERHANG = 0.06;
export const CLOTH_W = TABLE.topW + OVERHANG * 2;
export const CLOTH_D = TABLE.topD + OVERHANG * 2;
export const CLOTH_TOP_Y = TABLE.topH + 0.006;
export const DRAPE_H = CLOTH_TOP_Y - 0.015; // stops just off the floor

/** Gentle sagging cloth top — vertices displaced once, normals recomputed. */
export function makeTopGeometry(): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(CLOTH_W, CLOTH_D, 24, 12);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / CLOTH_W + 0.5;
    const v = pos.getY(i) / CLOTH_D + 0.5;
    // Sag toward the middle (plane is later rotated flat, so displace Z)
    const sag = 0.008 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    pos.setZ(i, pos.getZ(i) - sag);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Hanging drape with soft vertical folds that deepen toward the floor.
 * Width is the cloth edge it hangs from; the same recipe is used for the
 * front and both sides so folds match at the corners.
 */
export function makeDrapeGeometry(width: number, phase: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, DRAPE_H, 48, 16);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / width + 0.5;
    const v = 0.5 - pos.getY(i) / DRAPE_H; // 0 at the table edge, 1 at the floor
    const grow = v * v * (3 - 2 * v);       // smoothstep — folds grow downward
    const fold =
      0.028 * Math.sin(u * Math.PI * 7 + phase) * grow +
      0.012 * Math.sin(u * Math.PI * 13 + phase * 1.7) * grow;
    pos.setZ(i, pos.getZ(i) + fold);
  }
  geo.computeVertexNormals();
  return geo;
}

export interface TableGeometries {
  top: THREE.PlaneGeometry;
  front: THREE.PlaneGeometry;
  back: THREE.PlaneGeometry;
  sideL: THREE.PlaneGeometry;
  sideR: THREE.PlaneGeometry;
  board: THREE.BoxGeometry;
  /** 4 legs + 2 crossbars merged into one geometry (positions baked in). */
  legs: THREE.BufferGeometry;
}

let geometries: TableGeometries | null = null;

/** Lazy shared singleton — safe because the parts are never mutated. */
export function getTableGeometries(): TableGeometries {
  if (geometries) return geometries;

  const legX = TABLE.topW / 2 - 0.18;
  const legH = TABLE.topH - 0.05;
  const legParts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    for (const z of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.018, 0.018, legH, 10);
      leg.translate(s * legX, legH / 2, z * (TABLE.topD / 2 - 0.08));
      legParts.push(leg);
    }
    const bar = new THREE.CylinderGeometry(0.016, 0.016, TABLE.topD - 0.16, 10);
    bar.rotateX(Math.PI / 2);
    bar.translate(s * legX, 0.06, 0);
    legParts.push(bar);
  }

  geometries = {
    top: makeTopGeometry(),
    front: makeDrapeGeometry(CLOTH_W, 0.4),
    back: makeDrapeGeometry(CLOTH_W, 3.1),
    sideL: makeDrapeGeometry(CLOTH_D, 1.9),
    sideR: makeDrapeGeometry(CLOTH_D, 4.2),
    board: new THREE.BoxGeometry(TABLE.topW, 0.05, TABLE.topD),
    legs: mergeGeometries(legParts),
  };
  return geometries;
}

let clothMaterial: THREE.MeshStandardMaterial | null = null;

export function getClothMaterial(): THREE.MeshStandardMaterial {
  if (!clothMaterial) {
    clothMaterial = new THREE.MeshStandardMaterial({
      color: CLOTH_COLOR,
      roughness: CLOTH_ROUGHNESS,
      side: THREE.DoubleSide,
    });
  }
  return clothMaterial;
}

/**
 * Composite a banner image letterboxed on a cloth-colored canvas sized for
 * the front drape (UV letterbox tricks smear the image's clamped edge pixels
 * across the rest of the drape, hence the canvas approach).
 */
export function makeBannerTexture(img: HTMLImageElement): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round(1024 * (DRAPE_H / CLOTH_W));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = CLOTH_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Fit the image centered with a margin, preserving aspect
  const fit = 0.82;
  const scale = Math.min(
    (canvas.width * fit) / img.width,
    (canvas.height * fit) / img.height,
  );
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
