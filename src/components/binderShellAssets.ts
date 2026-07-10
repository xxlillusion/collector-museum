import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COVER_W, COVER_H, COVER_T } from './Binder';

// Closed-binder shell assets (leather covers + spine, chrome ring packs) for
// the hall's instanced draws — extracted from VendorHallBinders so Stream B1
// can retexture/retune the shells without touching the frozen binder logic.
//
// Everything here is a module-level singleton shared by every hall mount:
// geometry is in binder-local space (instance matrices are just each binder's
// pose), and the perf contract stands — closed binders stay EXACTLY two
// instanced draws (one leather, one rings), zero textures. R3F never disposes
// objects passed via `args`, so singletons survive canvas remounts.

export interface BinderShellAssets {
  geometries: {
    /** Back cover + spine + front cover, merged. */
    leather: THREE.BufferGeometry;
    /** Three torus rings, merged. */
    rings: THREE.BufferGeometry;
  };
  materials: {
    leather: THREE.MeshPhysicalMaterial;
    rings: THREE.MeshStandardMaterial;
  };
}

let assets: BinderShellAssets | null = null;

/** Lazy shared singletons — call from render code; cheap after first call. */
export function getBinderShellAssets(): BinderShellAssets {
  if (assets) return assets;

  const back = new THREE.BoxGeometry(COVER_W + 0.02, COVER_H, COVER_T);
  back.translate(COVER_W / 2 - 0.01, 0, -0.006);
  const spine = new THREE.BoxGeometry(0.02, COVER_H, 0.032);
  spine.translate(-0.012, 0, 0.004);
  const front = new THREE.BoxGeometry(COVER_W, COVER_H, COVER_T);
  front.translate(COVER_W / 2, 0, 0.012);
  const ringParts: THREE.BufferGeometry[] = [];
  for (const y of [-0.11, 0, 0.11]) {
    const ring = new THREE.TorusGeometry(0.012, 0.0022, 8, 24);
    ring.rotateX(Math.PI / 2);
    ring.translate(0.004, y, 0.005);
    ringParts.push(ring);
  }

  assets = {
    geometries: {
      leather: mergeGeometries([back, spine, front]),
      rings: mergeGeometries(ringParts),
    },
    materials: {
      leather: new THREE.MeshPhysicalMaterial({
        color: '#1c1a17',
        roughness: 0.5,
        clearcoat: 0.3,
        clearcoatRoughness: 0.4,
      }),
      rings: new THREE.MeshStandardMaterial({
        color: '#b8b8b8',
        roughness: 0.25,
        metalness: 0.9,
      }),
    },
  };
  return assets;
}
