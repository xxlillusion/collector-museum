import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Canvas-baked textures + shared materials/geometries for HallAtmosphere.
// Everything is a lazy module singleton (same pattern as tableGeometry.ts):
// built once per session, shared by every instanced draw, never disposed by
// R3F (passed via args). Palette = the museum kit's gold-on-dark so the hall
// signage reads as the same brand as the DOM chrome.

const GOLD = '#d4af37';
const GOLD_SOFT = 'rgba(212,175,55,0.55)';
const CREAM = '#e8d9a8';
const DARK = '#1b1613'; // banner cloth ground (panel-dark, warm)

const SERIF = 'Georgia, "Times New Roman", serif';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

function colorTexture(c: HTMLCanvasElement, anisotropy = 8): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/** Fine speckle grain, drawn straight onto the target context. */
function grain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  count: number,
  alpha: number,
) {
  for (let i = 0; i < count; i++) {
    const v = Math.random();
    ctx.fillStyle =
      v > 0.5 ? `rgba(255,240,210,${alpha * (v - 0.5)})` : `rgba(0,0,0,${alpha * (0.5 - v)})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.62, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.62, y);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Header banner — "CARD SHOW" (north wall)
// ---------------------------------------------------------------------------

export const HEADER_ASPECT = 456 / 2048; // h / w of the canvas below

function makeHeaderCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(2048, 456);

  const bg = ctx.createLinearGradient(0, 0, 0, 456);
  bg.addColorStop(0, '#221c16');
  bg.addColorStop(0.5, DARK);
  bg.addColorStop(1, '#141009');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 2048, 456);
  grain(ctx, 2048, 456, 2600, 0.16);

  // Double border, museum-plaque style
  ctx.strokeStyle = GOLD_SOFT;
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 26, 2048 - 52, 456 - 52);
  ctx.strokeStyle = 'rgba(212,175,55,0.28)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(40, 40, 2048 - 80, 456 - 80);

  // Corner diamonds
  ctx.fillStyle = GOLD_SOFT;
  for (const [x, y] of [[26, 26], [2022, 26], [26, 430], [2022, 430]]) {
    diamond(ctx, x, y, 14);
    ctx.fill();
  }

  // Title with a soft gold gradient
  const title = ctx.createLinearGradient(0, 110, 0, 300);
  title.addColorStop(0, '#ecd489');
  title.addColorStop(0.55, GOLD);
  title.addColorStop(1, '#9a7b22');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = title;
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '26px';
  } catch { /* older engines — spacing is cosmetic */ }
  ctx.font = `600 196px ${SERIF}`;
  ctx.fillText('CARD SHOW', 1024, 208);
  ctx.shadowColor = 'transparent';

  // Flanking diamonds + rules beside the title
  const halfTitle = ctx.measureText('CARD SHOW').width / 2;
  ctx.fillStyle = GOLD_SOFT;
  diamond(ctx, 1024 - halfTitle - 74, 208, 26);
  ctx.fill();
  diamond(ctx, 1024 + halfTitle + 74, 208, 26);
  ctx.fill();
  ctx.fillStyle = 'rgba(212,175,55,0.4)';
  ctx.fillRect(120, 205, 1024 - halfTitle - 240, 4);
  ctx.fillRect(1024 + halfTitle + 120, 205, 2048 - 240 - (1024 + halfTitle + 120), 4);

  // Subtitle
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '18px';
  } catch { /* */ }
  ctx.font = `54px ${SERIF}`;
  ctx.fillStyle = CREAM;
  ctx.fillText('TRADE  ·  COLLECT  ·  PLAY', 1024, 356);
  return c;
}

// ---------------------------------------------------------------------------
// Cloth banner — vertical, swallowtail bottom (E/W walls + hanging)
// ---------------------------------------------------------------------------

export const BANNER_ASPECT = 800 / 512; // h / w

function makeBannerCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(512, 800);
  const W = 512;
  const H = 800;
  const notch = 74; // swallowtail depth

  // Cloth silhouette (transparent outside — material uses alphaTest)
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H - notch);
  ctx.lineTo(W / 2, H);
  ctx.lineTo(0, H - notch);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#231d17');
  bg.addColorStop(0.5, DARK);
  bg.addColorStop(1, '#120e08');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  grain(ctx, W, H, 1400, 0.15);

  // Hanging sleeve + grommets
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, 40);
  ctx.fillStyle = '#0d0b09';
  ctx.beginPath();
  ctx.arc(58, 20, 9, 0, Math.PI * 2);
  ctx.arc(W - 58, 20, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(212,175,55,0.5)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(58, 20, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W - 58, 20, 9, 0, Math.PI * 2);
  ctx.stroke();

  // Border following the swallowtail
  ctx.strokeStyle = GOLD_SOFT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(22, 56);
  ctx.lineTo(W - 22, 56);
  ctx.lineTo(W - 22, H - notch - 16);
  ctx.lineTo(W / 2, H - 22);
  ctx.lineTo(22, H - notch - 16);
  ctx.closePath();
  ctx.stroke();

  // Big ornament diamond, double-lined
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 5;
  diamond(ctx, W / 2, 240, 96);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(212,175,55,0.45)';
  ctx.lineWidth = 2;
  diamond(ctx, W / 2, 240, 118);
  ctx.stroke();
  ctx.fillStyle = GOLD;
  diamond(ctx, W / 2, 240, 34);
  ctx.fill();

  // Stacked wordmark
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '12px';
  } catch { /* */ }
  ctx.font = `64px ${SERIF}`;
  const words = ['TRADE', 'COLLECT', 'PLAY'];
  words.forEach((w, i) => {
    const y = 430 + i * 110;
    ctx.fillStyle = CREAM;
    ctx.fillText(w, W / 2, y);
    if (i < words.length - 1) {
      ctx.fillStyle = GOLD_SOFT;
      diamond(ctx, W / 2, y + 55, 9);
      ctx.fill();
    }
  });
  ctx.restore();
  return c;
}

// ---------------------------------------------------------------------------
// Entrance sign — emissive "ENTRANCE" lozenge (bloom pickup)
// ---------------------------------------------------------------------------

function makeSignCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(768, 224);
  ctx.fillStyle = '#0b0a09';
  ctx.fillRect(0, 0, 768, 224);
  ctx.strokeStyle = 'rgba(255,224,160,0.85)';
  ctx.lineWidth = 5;
  ctx.strokeRect(22, 22, 768 - 44, 224 - 44);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '22px';
  } catch { /* */ }
  ctx.font = `600 108px ${SERIF}`;
  ctx.fillStyle = '#ffe9c4';
  ctx.fillText('ENTRANCE', 384, 118);
  return c;
}

// ---------------------------------------------------------------------------
// Door leaf — dark metal with recessed panels + kick plate
// ---------------------------------------------------------------------------

function makeDoorCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(512, 1024);
  const base = ctx.createLinearGradient(0, 0, 512, 0);
  base.addColorStop(0, '#2b2620');
  base.addColorStop(0.5, '#332d27');
  base.addColorStop(1, '#26211c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 1024);
  // vertical brushing
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * 512;
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? `rgba(255,240,215,${0.03 * v})` : `rgba(0,0,0,${0.05 * v})`;
    ctx.fillRect(x, Math.random() * 1024, 1.4, 30 + Math.random() * 120);
  }
  // recessed panels
  for (const [py, ph] of [[96, 320] as const, [488, 320] as const]) {
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(72, py, 368, ph);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(72, py, 368, ph);
    ctx.strokeStyle = 'rgba(255,236,200,0.10)';
    ctx.lineWidth = 3;
    ctx.strokeRect(78, py + 6, 356, ph - 12);
  }
  // kick plate
  ctx.fillStyle = '#39322a';
  ctx.fillRect(26, 878, 460, 118);
  for (let i = 0; i < 220; i++) {
    const y = 878 + Math.random() * 118;
    ctx.fillStyle = `rgba(255,240,215,${0.04 * Math.random()})`;
    ctx.fillRect(Math.random() * 460 + 26, y, 40 + Math.random() * 90, 1.2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 878, 460, 118);
  return c;
}

// ---------------------------------------------------------------------------
// Assets bundle
// ---------------------------------------------------------------------------

export interface AtmosphereAssets {
  headerMaterial: THREE.MeshStandardMaterial;
  bannerMaterial: THREE.MeshStandardMaterial;
  signMaterial: THREE.MeshStandardMaterial;
  doorMaterial: THREE.MeshStandardMaterial;
  frameMaterial: THREE.MeshStandardMaterial;
  trussMaterial: THREE.MeshStandardMaterial;
  carpetMaterial: THREE.MeshStandardMaterial;
  /** Unit 1×1 plane facing +Z — banners, header, carpet strips (scaled per instance). */
  unitPlane: THREE.PlaneGeometry;
  /** Unit 1×1×1 box — truss members (scaled per instance). */
  unitBox: THREE.BoxGeometry;
  /** Sign lozenge plane (1.5 × 0.44). */
  signGeometry: THREE.PlaneGeometry;
}

let assets: AtmosphereAssets | null = null;

export function getAtmosphereAssets(): AtmosphereAssets {
  if (assets) return assets;

  const headerTex = colorTexture(makeHeaderCanvas());
  const bannerTex = colorTexture(makeBannerCanvas());
  const signTex = colorTexture(makeSignCanvas(), 4);
  const doorTex = colorTexture(makeDoorCanvas(), 4);

  const unitPlane = new THREE.PlaneGeometry(1, 1);
  unitPlane.name = 'atmoUnitPlane';
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.name = 'atmoUnitBox';
  const signGeometry = new THREE.PlaneGeometry(1.5, 0.44);
  signGeometry.name = 'atmoSign';

  assets = {
    // Slight self-lift (emissiveMap = map at 6%) keeps the gold readable in
    // aisle shadow without ever reaching the 1.2 bloom threshold.
    headerMaterial: new THREE.MeshStandardMaterial({
      map: headerTex,
      emissive: '#ffffff',
      emissiveMap: headerTex,
      emissiveIntensity: 0.07,
      roughness: 0.88,
      envMapIntensity: 0.3,
    }),
    bannerMaterial: new THREE.MeshStandardMaterial({
      map: bannerTex,
      emissive: '#ffffff',
      emissiveMap: bannerTex,
      emissiveIntensity: 0.07,
      roughness: 0.9,
      envMapIntensity: 0.25,
      alphaTest: 0.5, // swallowtail cutout — no blending/sort cost
    }),
    signMaterial: new THREE.MeshStandardMaterial({
      map: signTex,
      emissive: '#ffffff',
      emissiveMap: signTex,
      emissiveIntensity: 2.4,
      toneMapped: false,
      roughness: 0.6,
    }),
    doorMaterial: new THREE.MeshStandardMaterial({
      map: doorTex,
      roughness: 0.5,
      metalness: 0.55,
      envMapIntensity: 0.7,
    }),
    frameMaterial: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.4,
      metalness: 0.8,
      envMapIntensity: 0.8,
    }),
    trussMaterial: new THREE.MeshStandardMaterial({
      color: '#2c2e31',
      roughness: 0.42,
      metalness: 0.75,
      envMapIntensity: 0.7,
    }),
    carpetMaterial: new THREE.MeshStandardMaterial({
      color: '#ffffff', // per-instance colors (field / border)
      roughness: 0.97,
      metalness: 0,
      envMapIntensity: 0.12,
    }),
    unitPlane,
    unitBox,
    signGeometry,
  };
  return assets;
}

/** Constant vertex color for a to-be-merged box part (frameMaterial). */
export function paintVertices(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const col = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

let entranceGeos: { doors: THREE.BufferGeometry; frame: THREE.BufferGeometry } | null = null;

/**
 * Entrance solids in local space: doors (textured) and frame + push bars +
 * sign housing (vertex-colored metal). Origin at floor center of the opening,
 * +Z pointing INTO the hall; the component places it at the south wall with
 * rotationY π.
 */
export function getEntranceGeometries(): { doors: THREE.BufferGeometry; frame: THREE.BufferGeometry } {
  if (entranceGeos) return entranceGeos;

  const leafW = 0.95;
  const leafH = 2.15;
  const leafT = 0.05;

  const doorParts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const leaf = new THREE.BoxGeometry(leafW, leafH, leafT);
    leaf.translate(s * (leafW / 2 + 0.006), leafH / 2, 0);
    doorParts.push(leaf);
  }

  const frameParts: THREE.BufferGeometry[] = [];
  const steel = '#141312';
  const bright = '#9a938a';
  // jambs
  for (const s of [-1, 1]) {
    frameParts.push(
      paintVertices(
        new THREE.BoxGeometry(0.16, leafH + 0.22, 0.2).translate(
          s * (leafW + 0.012 + 0.08),
          (leafH + 0.22) / 2,
          0,
        ),
        steel,
      ),
    );
  }
  // header
  frameParts.push(
    paintVertices(
      new THREE.BoxGeometry((leafW + 0.012) * 2 + 0.32, 0.22, 0.2).translate(0, leafH + 0.11, 0),
      steel,
    ),
  );
  // push bars (hall side = +Z) with stand-offs
  for (const s of [-1, 1]) {
    const bx = s * (leafW / 2 + 0.006);
    frameParts.push(
      paintVertices(
        new THREE.BoxGeometry(leafW * 0.72, 0.035, 0.035).translate(bx, 1.02, leafT / 2 + 0.05),
        bright,
      ),
    );
    for (const e of [-1, 1]) {
      frameParts.push(
        paintVertices(
          new THREE.BoxGeometry(0.03, 0.03, 0.05).translate(
            bx + e * leafW * 0.3,
            1.02,
            leafT / 2 + 0.025,
          ),
          bright,
        ),
      );
    }
  }
  // sign housing (the emissive lozenge mounts just proud of it)
  frameParts.push(
    paintVertices(
      new THREE.BoxGeometry(1.62, 0.52, 0.07).translate(0, 2.86, 0.02),
      steel,
    ),
  );

  const doors = mergeGeometries(doorParts);
  doors.name = 'atmoDoors';
  const frame = mergeGeometries(frameParts);
  frame.name = 'atmoDoorFrame';
  entranceGeos = { doors, frame };
  return entranceGeos;
}
