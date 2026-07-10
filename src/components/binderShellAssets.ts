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
// instanced draws (one leather, one rings). The leather look is baked into
// two small shared canvas textures (color + grain), so the texture cost is
// constant regardless of binder count. R3F never disposes objects passed via
// `args`, so singletons survive canvas remounts.

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

/**
 * Procedural leather: warm near-black grain field, a stitched border and a
 * blind-embossed diamond — the design every premium card binder actually
 * ships with. BoxGeometry gives each face full 0–1 UVs, so covers show the
 * whole motif while the thin edges compress into a darker band (reads as an
 * edge wrap).
 */
function makeLeatherCanvas(): HTMLCanvasElement {
  const W = 512;
  const H = 640;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  // Base with a soft radial falloff (worn center, darker edges)
  const bg = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, H * 0.72);
  bg.addColorStop(0, '#392c1e');
  bg.addColorStop(0.7, '#2e2317');
  bg.addColorStop(1, '#211710');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Leather grain — speckle + a few creases
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    ctx.fillStyle =
      v > 0.5
        ? `rgba(214,180,140,${0.05 * (v - 0.5)})`
        : `rgba(0,0,0,${0.09 * (0.5 - v)})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.6, 1.6);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + (Math.random() - 0.5) * 90,
      y + (Math.random() - 0.5) * 90,
      x + (Math.random() - 0.5) * 160,
      y + (Math.random() - 0.5) * 160,
    );
    ctx.stroke();
  }

  // Recessed groove just inside the edge…
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.strokeStyle = 'rgba(214,180,140,0.10)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(29, 29, W - 58, H - 58);
  // …and the stitch line inside it
  ctx.strokeStyle = 'rgba(196,158,110,0.55)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.setLineDash([]);

  // Blind-embossed diamond: dark lower-right ridge, lit upper-left ridge
  const dia = (cx: number, cy: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.62, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.62, cy);
    ctx.closePath();
  };
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 5;
  dia(W / 2 + 2, H / 2 + 3, 88);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(222,190,148,0.28)';
  ctx.lineWidth = 4;
  dia(W / 2 - 2, H / 2 - 3, 88);
  ctx.stroke();
  ctx.strokeStyle = '#20170f';
  ctx.lineWidth = 6;
  dia(W / 2, H / 2, 88);
  ctx.stroke();
  // small inner pip
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  dia(W / 2 + 1, H / 2 + 2, 22);
  ctx.fill();
  ctx.fillStyle = '#2e241a';
  dia(W / 2, H / 2, 22);
  ctx.fill();

  return c;
}

/**
 * Grain map (linear, G-channel drives roughnessMap; luminance drives
 * bumpMap): rough grain field, smoother pressed border/emboss.
 */
function makeGrainCanvas(): HTMLCanvasElement {
  const W = 256;
  const H = 320;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.fillStyle = 'rgb(208,208,208)';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 5200; i++) {
    const d = Math.round((Math.random() - 0.5) * 56);
    ctx.fillStyle = `rgb(${208 + d},${208 + d},${208 + d})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
  }
  // pressed (smoother) border band + emboss
  ctx.strokeStyle = 'rgb(168,168,168)';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.strokeStyle = 'rgb(176,176,176)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(W / 2, H / 2 - 44);
  ctx.lineTo(W / 2 + 27, H / 2);
  ctx.lineTo(W / 2, H / 2 + 44);
  ctx.lineTo(W / 2 - 27, H / 2);
  ctx.closePath();
  ctx.stroke();
  return c;
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

  const leatherTex = new THREE.CanvasTexture(makeLeatherCanvas());
  leatherTex.colorSpace = THREE.SRGBColorSpace;
  leatherTex.anisotropy = 4;
  const grainTex = new THREE.CanvasTexture(makeGrainCanvas());
  grainTex.anisotropy = 4;

  const leatherGeo = mergeGeometries([back, spine, front]);
  leatherGeo.name = 'binderLeather';
  const ringsGeo = mergeGeometries(ringParts);
  ringsGeo.name = 'binderRings';

  assets = {
    geometries: {
      leather: leatherGeo,
      rings: ringsGeo,
    },
    materials: {
      leather: new THREE.MeshPhysicalMaterial({
        color: '#ffffff', // design baked into the map
        map: leatherTex,
        roughness: 0.62,
        roughnessMap: grainTex,
        bumpMap: grainTex,
        bumpScale: 0.0016,
        clearcoat: 0.22,
        clearcoatRoughness: 0.5,
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
