import type { VendorRect } from './vendorPlan';
import { TABLE_W, TABLE_D } from './vendorPlan';

// Best-effort table detection on a floor plan image. Dependency-free canvas
// pixel work; the PlanEditor exists to fix whatever these heuristics miss.
// Axis-aligned boxes only — rotated tables are the editor's job.

export interface DetectionResult {
  rects: VendorRect[];
  imgW: number;
  imgH: number;
  pxPerMeter: number;
}

// Detection runs on a downsampled copy (≤ this max dimension) for speed;
// resulting rects are scaled back to stored-image pixels.
const DETECT_MAX_DIM = 1000;

/** Otsu threshold over a 256-bin luma histogram. */
function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

/**
 * Connected components (4-connectivity) over mask pixels equal to `value`,
 * skipping pixels already labeled. Explicit stack — no recursion.
 */
function connectedComponents(
  mask: Uint8Array,
  labels: Int32Array,
  w: number,
  h: number,
  value: number,
  startLabel: number,
): Component[] {
  const comps: Component[] = [];
  const stack = new Int32Array(w * h);
  let label = startLabel;
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== value || labels[start] !== 0) continue;
    label++;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    const comp: Component = {
      minX: w, minY: h, maxX: 0, maxY: 0, area: 0,
    };
    while (top > 0) {
      const p = stack[--top];
      const px = p % w;
      const py = (p / w) | 0;
      comp.area++;
      if (px < comp.minX) comp.minX = px;
      if (px > comp.maxX) comp.maxX = px;
      if (py < comp.minY) comp.minY = py;
      if (py > comp.maxY) comp.maxY = py;
      if (px > 0 && mask[p - 1] === value && labels[p - 1] === 0) { labels[p - 1] = label; stack[top++] = p - 1; }
      if (px < w - 1 && mask[p + 1] === value && labels[p + 1] === 0) { labels[p + 1] = label; stack[top++] = p + 1; }
      if (py > 0 && mask[p - w] === value && labels[p - w] === 0) { labels[p - w] = label; stack[top++] = p - w; }
      if (py < h - 1 && mask[p + w] === value && labels[p + w] === 0) { labels[p + w] = label; stack[top++] = p + w; }
    }
    comps.push(comp);
  }
  return comps;
}

interface Candidate {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: number;
}

function componentToCandidate(c: Component): Candidate {
  const bw = c.maxX - c.minX + 1;
  const bh = c.maxY - c.minY + 1;
  return { x: c.minX, y: c.minY, w: bw, h: bh, fill: c.area / (bw * bh) };
}

function acceptCandidate(c: Candidate, maxDim: number): boolean {
  const short = Math.min(c.w, c.h);
  const long = Math.max(c.w, c.h);
  if (short < Math.max(6, 0.008 * maxDim)) return false; // line fragments, text
  if (long > 0.4 * maxDim) return false;                 // room outline
  if (c.fill < 0.7) return false;                        // not rectangular
  if (long / short > 14) return false;                   // implausibly long
  return true;
}

function iou(a: Candidate, b: Candidate): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

function contains(outer: Candidate, inner: Candidate): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h &&
    (inner.w * inner.h) < (outer.w * outer.h)
  );
}

/**
 * Infer px→meters assuming table-shaped boxes are 6ft tables.
 * Modal short side of aspect-plausible rects / table depth (0.76 m),
 * cross-checked against the modal long side / table width (1.83 m).
 */
export function inferScale(rects: { w: number; h: number }[], imgW: number): number {
  const fallback = imgW / 30; // "image is ~30 m wide" last resort

  const tableish = rects.filter((r) => {
    const aspect = Math.max(r.w, r.h) / Math.min(r.w, r.h);
    return aspect >= 1.6 && aspect <= 3.4; // 6ft table ≈ 2.4
  });

  const modalMedian = (values: number[]): number | null => {
    if (values.length === 0) return null;
    // 10%-wide log bins; take the median of the most populated bin
    const bins = new Map<number, number[]>();
    for (const v of values) {
      const bin = Math.round(Math.log(v) / Math.log(1.1));
      if (!bins.has(bin)) bins.set(bin, []);
      bins.get(bin)!.push(v);
    }
    let best: number[] = [];
    for (const arr of bins.values()) if (arr.length > best.length) best = arr;
    best.sort((a, b) => a - b);
    return best[Math.floor(best.length / 2)];
  };

  const shortSide = modalMedian(tableish.map((r) => Math.min(r.w, r.h)));
  const longSide = modalMedian(tableish.map((r) => Math.max(r.w, r.h)));

  if (shortSide !== null && longSide !== null) {
    const fromShort = shortSide / TABLE_D;
    const fromLong = longSide / TABLE_W;
    // Long boxes (multi-table runs) skew the long-side estimate upward, so
    // prefer the short side unless they wildly disagree.
    if (Math.abs(fromShort - fromLong) / fromLong <= 0.35) return fromShort;
    return fromLong;
  }

  if (rects.length > 0) {
    const shorts = rects.map((r) => Math.min(r.w, r.h)).sort((a, b) => a - b);
    return shorts[Math.floor(shorts.length / 2)] / TABLE_D;
  }

  return fallback;
}

/** Run detection on a stored floor-plan blob. */
export async function detectTables(blob: Blob): Promise<DetectionResult> {
  const bmp = await createImageBitmap(blob);
  const imgW = bmp.width;
  const imgH = bmp.height;
  const scale = Math.min(1, DETECT_MAX_DIM / Math.max(imgW, imgH));
  const w = Math.max(1, Math.round(imgW * scale));
  const h = Math.max(1, Math.round(imgH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bmp.close();
    return { rects: [], imgW, imgH, pxPerMeter: imgW / 30 };
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const data = ctx.getImageData(0, 0, w, h).data;

  // Luma + histogram → Otsu → dark mask (lines/fills = 1)
  const n = w * h;
  const mask = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const luma = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) | 0;
    mask[i] = luma; // temporarily store luma
    hist[luma]++;
  }
  const threshold = otsu(hist, n);
  for (let i = 0; i < n; i++) mask[i] = mask[i] <= threshold ? 1 : 0;

  const labels = new Int32Array(n);

  // Pass A — enclosed light regions (outlined tables): flood the light mask
  // from every border pixel (that's the background), then any remaining light
  // component is an enclosed interior.
  const BACKGROUND = 1;
  {
    const stack = new Int32Array(n);
    let top = 0;
    const push = (p: number) => {
      if (mask[p] === 0 && labels[p] === 0) {
        labels[p] = BACKGROUND;
        stack[top++] = p;
      }
    };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (top > 0) {
      const p = stack[--top];
      const px = p % w;
      const py = (p / w) | 0;
      if (px > 0) push(p - 1);
      if (px < w - 1) push(p + 1);
      if (py > 0) push(p - w);
      if (py < h - 1) push(p + w);
    }
  }
  const enclosed = connectedComponents(mask, labels, w, h, 0, BACKGROUND);

  // Pass B — dark blobs (filled tables)
  const darkLabels = new Int32Array(n);
  const darkBlobs = connectedComponents(mask, darkLabels, w, h, 1, 0);

  const maxDim = Math.max(w, h);
  const passA = enclosed.map(componentToCandidate).filter((c) => acceptCandidate(c, maxDim));
  const passB = darkBlobs.map(componentToCandidate).filter((c) => acceptCandidate(c, maxDim));

  // Merge: pass A wins on overlap (an outlined table also produces a dark
  // ring blob in pass B with poor fill, but belt-and-braces)
  const merged: Candidate[] = [...passA];
  for (const b of passB) {
    if (!merged.some((a) => iou(a, b) > 0.5)) merged.push(b);
  }

  // Containment prune: a rect swallowing ≥3 accepted rects is a booth block
  const pruned = merged.filter(
    (outer) => merged.filter((inner) => inner !== outer && contains(outer, inner)).length < 3,
  );

  const pxPerMeterDetect = inferScale(pruned, w);

  // Scale rects (and the scale itself) back to stored-image pixels
  const inv = 1 / scale;
  const rects: VendorRect[] = pruned.map((c) => ({
    id: crypto.randomUUID(),
    x: Math.round(c.x * inv),
    y: Math.round(c.y * inv),
    w: Math.round(c.w * inv),
    h: Math.round(c.h * inv),
  }));

  return { rects, imgW, imgH, pxPerMeter: pxPerMeterDetect * inv };
}
