import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  DEFAULT_SIGNAGE_TITLE,
  SIGNAGE_THEMES,
  signageCacheKey,
} from '../lib/hallSignage';
import type { ResolvedHallSignage, SignagePalette } from '../lib/hallSignage';

// Canvas-baked textures + shared materials/geometries for HallAtmosphere.
// Since F3 the signage set (header / cloth banners / entrance sign) is
// parameterized by ResolvedHallSignage — title/subtitle/theme palette and
// optional uploaded images — behind a small keyed cache (signageCacheKey,
// cap 2: the current look + the one just edited away from; evicted entries
// dispose their textures/materials). Everything signage-independent (door,
// truss, carpet, pennant materials + every geometry) stays a lazy module
// singleton exactly like tableGeometry.ts, so its identity never churns.
// resolveSignage(null) — title 'CARD SHOW', classic subtitle, classicGold —
// reproduces the pre-F3 baked canvases stroke for stroke; that regression
// key is load-bearing.

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

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  } catch { /* older engines — spacing is cosmetic */ }
}

// ---------------------------------------------------------------------------
// Palette shades — the accents the canvases need beyond the four theme fields
// ---------------------------------------------------------------------------

function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')}`;

/** Mix toward another color (t = 0..1). */
function mixHex(hex: string, toward: string, t: number): string {
  const a = hexRgb(hex);
  const b = hexRgb(toward);
  if (!a || !b) return hex;
  return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

/** Multiply toward black (f < 1 darkens). */
function scaleHex(hex: string, f: number): string {
  const a = hexRgb(hex);
  if (!a) return hex;
  return toHex(a[0] * f, a[1] * f, a[2] * f);
}

function alphaOf(hex: string, alpha: number): string {
  const a = hexRgb(hex);
  if (!a) return hex;
  return `rgba(${a[0]},${a[1]},${a[2]},${alpha})`;
}

/** Gradient stops + translucent accents. classicGold's stops were hand-tuned
 *  pre-F3; while the palette still carries those exact hexes the original
 *  literals come back verbatim (the regression key). Tuned or non-classic
 *  palettes derive everything from gold/dark. */
interface Shades {
  headerTop: string;
  headerBot: string;
  bannerTop: string;
  bannerBot: string;
  titleHi: string;
  titleLo: string;
  a28: string;
  a40: string;
  a45: string;
  a50: string;
}

function shadesFor(p: SignagePalette): Shades {
  if (p.gold === '#d4af37' && p.dark === '#1b1613') {
    return {
      headerTop: '#221c16',
      headerBot: '#141009',
      bannerTop: '#231d17',
      bannerBot: '#120e08',
      titleHi: '#ecd489',
      titleLo: '#9a7b22',
      a28: 'rgba(212,175,55,0.28)',
      a40: 'rgba(212,175,55,0.4)',
      a45: 'rgba(212,175,55,0.45)',
      a50: 'rgba(212,175,55,0.5)',
    };
  }
  return {
    headerTop: mixHex(p.dark, '#ffffff', 0.035),
    headerBot: scaleHex(p.dark, 0.72),
    bannerTop: mixHex(p.dark, '#ffffff', 0.045),
    bannerBot: scaleHex(p.dark, 0.62),
    titleHi: mixHex(p.gold, '#ffffff', 0.35),
    titleLo: scaleHex(p.gold, 0.7),
    a28: alphaOf(p.gold, 0.28),
    a40: alphaOf(p.gold, 0.4),
    a45: alphaOf(p.gold, 0.45),
    a50: alphaOf(p.gold, 0.5),
  };
}

// ---------------------------------------------------------------------------
// Text fitting — shrink long organizer text; the classic strings fit at their
// base sizes with hundreds of px to spare, so defaults render untouched
// ---------------------------------------------------------------------------

/** Single-line ellipsis for text that would dwarf any font size. */
function ellipsize(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Step the size down until `text` fits `maxWidth`; letter spacing scales
 *  with the size so shrunken titles keep their tracking. Leaves the context
 *  font/spacing set for the caller's fillText. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  baseSize: number,
  baseSpacing: number,
  maxWidth: number,
  minSize: number,
  fontOf: (size: number) => string,
): void {
  let size = baseSize;
  for (;;) {
    setLetterSpacing(ctx, Math.round(baseSpacing * (size / baseSize)));
    ctx.font = fontOf(size);
    if (ctx.measureText(text).width <= maxWidth || size <= minSize) return;
    size = Math.max(minSize, Math.floor(size * 0.93));
  }
}

// ---------------------------------------------------------------------------
// Header banner — show title + subtitle (north wall)
// ---------------------------------------------------------------------------

export const HEADER_ASPECT = 456 / 2048; // h / w of the canvas below

function makeHeaderCanvas(title: string, subtitle: string, p: SignagePalette): HTMLCanvasElement {
  const [c, ctx] = canvas(2048, 456);
  const sh = shadesFor(p);

  const bg = ctx.createLinearGradient(0, 0, 0, 456);
  bg.addColorStop(0, sh.headerTop);
  bg.addColorStop(0.5, p.dark);
  bg.addColorStop(1, sh.headerBot);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 2048, 456);
  grain(ctx, 2048, 456, 2600, 0.16);

  // Double border, museum-plaque style
  ctx.strokeStyle = p.goldSoft;
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 26, 2048 - 52, 456 - 52);
  ctx.strokeStyle = sh.a28;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(40, 40, 2048 - 80, 456 - 80);

  // Corner diamonds
  ctx.fillStyle = p.goldSoft;
  for (const [x, y] of [[26, 26], [2022, 26], [26, 430], [2022, 430]]) {
    diamond(ctx, x, y, 14);
    ctx.fill();
  }

  // Title with a soft gold gradient — auto-fit keeps long show names inside
  // the plaque ('CARD SHOW' fits at the base 196px, so defaults are exact)
  const titleText = ellipsize(title, 40);
  const grad = ctx.createLinearGradient(0, 110, 0, 300);
  grad.addColorStop(0, sh.titleHi);
  grad.addColorStop(0.55, p.gold);
  grad.addColorStop(1, sh.titleLo);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = grad;
  fitFont(ctx, titleText, 196, 26, 1800, 52, (s) => `600 ${s}px ${SERIF}`);
  ctx.fillText(titleText, 1024, 208);
  ctx.shadowColor = 'transparent';

  // Flanking diamonds + rules beside the title (wide titles zero the rules
  // out — negative-width fillRect is a no-op, exactly as pre-F3)
  const halfTitle = ctx.measureText(titleText).width / 2;
  ctx.fillStyle = p.goldSoft;
  diamond(ctx, 1024 - halfTitle - 74, 208, 26);
  ctx.fill();
  diamond(ctx, 1024 + halfTitle + 74, 208, 26);
  ctx.fill();
  ctx.fillStyle = sh.a40;
  ctx.fillRect(120, 205, 1024 - halfTitle - 240, 4);
  ctx.fillRect(1024 + halfTitle + 120, 205, 2048 - 240 - (1024 + halfTitle + 120), 4);

  // Subtitle
  const subText = ellipsize(subtitle, 60);
  ctx.fillStyle = p.cream;
  fitFont(ctx, subText, 54, 18, 1800, 30, (s) => `${s}px ${SERIF}`);
  ctx.fillText(subText, 1024, 356);
  return c;
}

// ---------------------------------------------------------------------------
// Cloth banner — vertical, swallowtail bottom (E/W walls + hanging)
// ---------------------------------------------------------------------------

export const BANNER_ASPECT = 800 / 512; // h / w

const BANNER_W = 512;
const BANNER_H = 800;
const BANNER_NOTCH = 74; // swallowtail depth

/** The cloth silhouette path (transparent outside — material uses alphaTest). */
function bannerSilhouette(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(BANNER_W, 0);
  ctx.lineTo(BANNER_W, BANNER_H - BANNER_NOTCH);
  ctx.lineTo(BANNER_W / 2, BANNER_H);
  ctx.lineTo(0, BANNER_H - BANNER_NOTCH);
  ctx.closePath();
}

/** Hanging sleeve + grommets — drawn on the baked banner AND back over an
 *  uploaded one, so organizer art still reads as hung show cloth. */
function bannerSleeve(ctx: CanvasRenderingContext2D, grommetRing: string) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, BANNER_W, 40);
  ctx.fillStyle = '#0d0b09';
  ctx.beginPath();
  ctx.arc(58, 20, 9, 0, Math.PI * 2);
  ctx.arc(BANNER_W - 58, 20, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = grommetRing;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(58, 20, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(BANNER_W - 58, 20, 9, 0, Math.PI * 2);
  ctx.stroke();
}

function makeBannerCanvas(words: string[], p: SignagePalette): HTMLCanvasElement {
  const [c, ctx] = canvas(BANNER_W, BANNER_H);
  const sh = shadesFor(p);
  const W = BANNER_W;
  const H = BANNER_H;
  const notch = BANNER_NOTCH;

  bannerSilhouette(ctx);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, sh.bannerTop);
  bg.addColorStop(0.5, p.dark);
  bg.addColorStop(1, sh.bannerBot);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  grain(ctx, W, H, 1400, 0.15);

  bannerSleeve(ctx, sh.a50);

  // Border following the swallowtail
  ctx.strokeStyle = p.goldSoft;
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
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 5;
  diamond(ctx, W / 2, 240, 96);
  ctx.stroke();
  ctx.strokeStyle = sh.a45;
  ctx.lineWidth = 2;
  diamond(ctx, W / 2, 240, 118);
  ctx.stroke();
  ctx.fillStyle = p.gold;
  diamond(ctx, W / 2, 240, 34);
  ctx.fill();

  // Stacked wordmark — subtitle words (max 4); rows tighten past three so
  // the stack never chases the swallowtail. Three words at step 110 = the
  // classic layout exactly.
  const shown = words.slice(0, 4).map((w) => ellipsize(w, 16));
  const step = shown.length <= 3 ? 110 : Math.min(110, (668 - 430) / (shown.length - 1));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  shown.forEach((w, i) => {
    const y = 430 + i * step;
    ctx.fillStyle = p.cream;
    fitFont(ctx, w, 64, 12, 440, 28, (s) => `${s}px ${SERIF}`);
    ctx.fillText(w, W / 2, y);
    if (i < shown.length - 1) {
      ctx.fillStyle = p.goldSoft;
      diamond(ctx, W / 2, y + step / 2, 9);
      ctx.fill();
    }
  });
  ctx.restore();
  return c;
}

// ---------------------------------------------------------------------------
// Entrance sign — emissive lozenge (bloom pickup)
// ---------------------------------------------------------------------------

function makeSignCanvas(text: string): HTMLCanvasElement {
  const [c, ctx] = canvas(768, 224);
  ctx.fillStyle = '#0b0a09';
  ctx.fillRect(0, 0, 768, 224);
  ctx.strokeStyle = 'rgba(255,224,160,0.85)';
  ctx.lineWidth = 5;
  ctx.strokeRect(22, 22, 768 - 44, 224 - 44);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe9c4';
  // The lozenge is small — a tight ellipsis + low size floor keep even
  // pathological titles inside the frame (typical titles fit at 40px+).
  const shown = text === 'ENTRANCE' ? text : ellipsize(text, 22);
  if (shown === 'ENTRANCE') {
    // Default sign — pre-F3 drawing verbatim (no fit pass; the classic
    // lettering must come back byte-for-byte, and it slightly overfills the
    // fit budget custom titles get)
    setLetterSpacing(ctx, 22);
    ctx.font = `600 108px ${SERIF}`;
  } else {
    fitFont(ctx, shown, 108, 22, 700, 24, (s) => `600 ${s}px ${SERIF}`);
  }
  ctx.fillText(shown, 384, 118);
  return c;
}

// ---------------------------------------------------------------------------
// Door leaf — dark metal with recessed panels + kick plate (signage-invariant)
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
// Uploaded-image composites — organizer art in the baked frames' clothes
// ---------------------------------------------------------------------------

/** Cover-fit draw (fill + center crop) — never letterboxes, never distorts. */
function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(w / iw, h / ih);
  ctx.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
}

/** Uploaded header art, cover-fit full bleed on the plaque ground. */
function compositeHeaderImage(img: HTMLImageElement, p: SignagePalette): HTMLCanvasElement {
  const [c, ctx] = canvas(2048, 456);
  ctx.fillStyle = p.dark;
  ctx.fillRect(0, 0, 2048, 456);
  coverDraw(ctx, img, 2048, 456);
  return c;
}

/** Uploaded banner art inside the swallowtail silhouette — the cutout mask
 *  stays (alphaTest) and the sleeve + grommets return on top, so a plain
 *  rectangular upload still reads as hung show cloth. */
function compositeBannerImage(img: HTMLImageElement, p: SignagePalette): HTMLCanvasElement {
  const [c, ctx] = canvas(BANNER_W, BANNER_H);
  const sh = shadesFor(p);
  bannerSilhouette(ctx);
  ctx.fillStyle = p.dark;
  ctx.fill();
  ctx.save();
  ctx.clip();
  coverDraw(ctx, img, BANNER_W, BANNER_H);
  bannerSleeve(ctx, sh.a50);
  ctx.restore();
  return c;
}

// ---------------------------------------------------------------------------
// Assets bundle — signage-keyed cache over shared invariants
// ---------------------------------------------------------------------------

export interface AtmosphereAssets {
  headerMaterial: THREE.MeshStandardMaterial;
  bannerMaterial: THREE.MeshStandardMaterial;
  signMaterial: THREE.MeshStandardMaterial;
  doorMaterial: THREE.MeshStandardMaterial;
  frameMaterial: THREE.MeshStandardMaterial;
  trussMaterial: THREE.MeshStandardMaterial;
  carpetMaterial: THREE.MeshStandardMaterial;
  /** White base — pennant triangles color per instance (theme palette). */
  pennantMaterial: THREE.MeshStandardMaterial;
  /** Unit 1×1 plane facing +Z — banners, header, carpet strips (scaled per instance). */
  unitPlane: THREE.PlaneGeometry;
  /** Unit 1×1×1 box — truss members (scaled per instance). */
  unitBox: THREE.BoxGeometry;
  /** Sign lozenge plane (1.5 × 0.44). */
  signGeometry: THREE.PlaneGeometry;
  /** Bunting triangle (0.18 wide × 0.24 drop), top edge at the origin. */
  pennantGeometry: THREE.BufferGeometry;
}

/** Signage-independent members, built once per session. */
type SharedAssets = Pick<
  AtmosphereAssets,
  | 'doorMaterial'
  | 'frameMaterial'
  | 'trussMaterial'
  | 'carpetMaterial'
  | 'pennantMaterial'
  | 'unitPlane'
  | 'unitBox'
  | 'signGeometry'
  | 'pennantGeometry'
>;

let shared: SharedAssets | null = null;

function getShared(): SharedAssets {
  if (shared) return shared;

  const unitPlane = new THREE.PlaneGeometry(1, 1);
  unitPlane.name = 'atmoUnitPlane';
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.name = 'atmoUnitBox';
  const signGeometry = new THREE.PlaneGeometry(1.5, 0.44);
  signGeometry.name = 'atmoSign';

  // Bunting triangle: top edge centered at the origin, apex pointing down.
  const pennantGeometry = new THREE.BufferGeometry();
  pennantGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-0.09, 0, 0, 0.09, 0, 0, 0, -0.24, 0]), 3),
  );
  pennantGeometry.computeVertexNormals();
  pennantGeometry.name = 'atmoPennant';

  shared = {
    doorMaterial: new THREE.MeshStandardMaterial({
      map: colorTexture(makeDoorCanvas(), 4),
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
    pennantMaterial: new THREE.MeshStandardMaterial({
      color: '#ffffff', // per-instance colors (theme pennant cycle)
      roughness: 0.92,
      metalness: 0,
      envMapIntensity: 0.15,
      side: THREE.DoubleSide, // flat cloth triangles, seen from both aisles
    }),
    unitPlane,
    unitBox,
    signGeometry,
    pennantGeometry,
  };
  return shared;
}

interface CacheEntry {
  assets: AtmosphereAssets;
  /** Textures/materials owned by THIS entry (shared members excluded). */
  disposables: Set<THREE.Texture | THREE.Material>;
  disposed: boolean;
}

const signageCache = new Map<string, CacheEntry>();

/** Current look + the one just edited away from. */
const CACHE_CAP = 2;

/**
 * Loads `url` with the VendorTables CORS idiom and, on successful decode,
 * swaps the material's map + emissiveMap in place — a texture swap, zero
 * draw-call change. Decode/CORS failure keeps the baked default silently.
 */
function swapInImage(
  entry: CacheEntry,
  material: THREE.MeshStandardMaterial,
  url: string,
  composite: (img: HTMLImageElement) => HTMLCanvasElement,
) {
  const img = new Image();
  // Cloud signage art comes off the Supabase CDN: without CORS opt-in the
  // canvas taints and the texture upload throws. blob: object URLs (sandbox)
  // ignore the attribute, so the local path is unaffected.
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (entry.disposed) return; // evicted while the image was in flight
    const tex = colorTexture(composite(img));
    const old = material.map;
    material.map = tex;
    material.emissiveMap = tex;
    material.needsUpdate = true;
    entry.disposables.add(tex);
    if (old) {
      entry.disposables.delete(old);
      old.dispose();
    }
  };
  img.src = url;
}

/**
 * The signage-parameterized asset bundle. Keyed on signageCacheKey — same
 * look, same objects (stable material identity is what keeps R3F from
 * recreating the instanced meshes every render); a new look builds fresh
 * header/banner/sign materials while every invariant member keeps its
 * module-singleton identity.
 */
export function getAtmosphereAssets(signage: ResolvedHallSignage): AtmosphereAssets {
  const key = signageCacheKey(signage);
  const hit = signageCache.get(key);
  if (hit) {
    // LRU touch — the other entry becomes the eviction candidate
    signageCache.delete(key);
    signageCache.set(key, hit);
    return hit.assets;
  }

  const base = getShared();
  const palette = SIGNAGE_THEMES[signage.theme];

  const headerTex = colorTexture(makeHeaderCanvas(signage.title, signage.subtitle, palette));
  // Banner wordmark = subtitle split on '·' (the classic three by default)
  const words = signage.subtitle
    .split('·')
    .map((w) => w.trim().toUpperCase())
    .filter(Boolean);
  const bannerTex = colorTexture(
    makeBannerCanvas(words.length > 0 ? words : ['TRADE', 'COLLECT', 'PLAY'], palette),
  );
  // The entrance lozenge carries the show's title; an untitled hall keeps
  // the classic 'ENTRANCE' (that IS the pre-F3 canvas — the regression key).
  const signTex = colorTexture(
    makeSignCanvas(signage.title === DEFAULT_SIGNAGE_TITLE ? 'ENTRANCE' : signage.title),
    4,
  );

  const assets: AtmosphereAssets = {
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
    doorMaterial: base.doorMaterial,
    frameMaterial: base.frameMaterial,
    trussMaterial: base.trussMaterial,
    carpetMaterial: base.carpetMaterial,
    pennantMaterial: base.pennantMaterial,
    unitPlane: base.unitPlane,
    unitBox: base.unitBox,
    signGeometry: base.signGeometry,
    pennantGeometry: base.pennantGeometry,
  };

  const entry: CacheEntry = {
    assets,
    disposables: new Set([
      headerTex,
      bannerTex,
      signTex,
      assets.headerMaterial,
      assets.bannerMaterial,
      assets.signMaterial,
    ]),
    disposed: false,
  };

  // Uploaded art rides in as a texture swap once decoded
  if (signage.headerImageUrl) {
    swapInImage(entry, assets.headerMaterial, signage.headerImageUrl, (img) =>
      compositeHeaderImage(img, palette),
    );
  }
  if (signage.bannerImageUrl) {
    swapInImage(entry, assets.bannerMaterial, signage.bannerImageUrl, (img) =>
      compositeBannerImage(img, palette),
    );
  }

  signageCache.set(key, entry);
  if (signageCache.size > CACHE_CAP) {
    const oldestKey = signageCache.keys().next().value as string;
    const oldest = signageCache.get(oldestKey)!;
    signageCache.delete(oldestKey);
    oldest.disposed = true;
    for (const d of oldest.disposables) d.dispose();
  }
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
