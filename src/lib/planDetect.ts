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

/**
 * Re-join pass-A fragments of one outlined box that a label split apart.
 * When digits touch the box outline, the enclosed interior splits into stacked
 * fragments. Genuine neighbours are separated by a shared wall — a gap band
 * with fully-dark rows — while a text gap is only partially dark, so merging
 * is gated on no near-solid line crossing the gap.
 */
function mergeSplitFragments(
  cands: Candidate[],
  mask: Uint8Array,
  w: number,
  maxDim: number,
): Candidate[] {
  const gapMax = Math.max(8, 0.025 * maxDim);
  const tol = 3;

  // Is any row (or column) of the gap band near-solid dark? Inset the shared
  // extent so the box's own side borders don't count toward the coverage.
  const solidLineInGap = (a: Candidate, b: Candidate, vertical: boolean): boolean => {
    if (vertical) {
      const x0 = Math.max(a.x, b.x) + 2;
      const x1 = Math.min(a.x + a.w, b.x + b.w) - 2;
      if (x1 <= x0) return true;
      for (let y = a.y + a.h; y < b.y; y++) {
        let dark = 0;
        for (let x = x0; x < x1; x++) dark += mask[y * w + x];
        if (dark / (x1 - x0) >= 0.95) return true;
      }
    } else {
      const y0 = Math.max(a.y, b.y) + 2;
      const y1 = Math.min(a.y + a.h, b.y + b.h) - 2;
      if (y1 <= y0) return true;
      for (let x = a.x + a.w; x < b.x; x++) {
        let dark = 0;
        for (let y = y0; y < y1; y++) dark += mask[y * w + x];
        if (dark / (y1 - y0) >= 0.95) return true;
      }
    }
    return false;
  };

  const merged = [...cands];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = 0; j < merged.length; j++) {
        if (i === j) continue;
        const a = merged[i];
        const b = merged[j];
        let vertical: boolean;
        if (
          Math.abs(a.x - b.x) <= tol &&
          Math.abs(a.x + a.w - (b.x + b.w)) <= tol &&
          b.y > a.y + a.h && b.y - (a.y + a.h) <= gapMax
        ) {
          vertical = true;
        } else if (
          Math.abs(a.y - b.y) <= tol &&
          Math.abs(a.y + a.h - (b.y + b.h)) <= tol &&
          b.x > a.x + a.w && b.x - (a.x + a.w) <= gapMax
        ) {
          vertical = false;
        } else {
          continue;
        }
        if (solidLineInGap(a, b, vertical)) continue;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const bw = Math.max(a.x + a.w, b.x + b.w) - x;
        const bh = Math.max(a.y + a.h, b.y + b.h) - y;
        // The text gap is part of the box, so count it as filled
        const gapArea = vertical
          ? (b.y - (a.y + a.h)) * Math.min(a.w, b.w)
          : (b.x - (a.x + a.w)) * Math.min(a.h, b.h);
        const fillArea = a.fill * a.w * a.h + b.fill * b.w * b.h + gapArea;
        merged[i] = { x, y, w: bw, h: bh, fill: Math.min(1, fillArea / (bw * bh)) };
        merged.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return merged;
}

// Coverage-guided guillotine decomposition of one labeled component into
// solid rectangular strips. Booth rings and L-corners arrive as a single
// connected component whose bbox is mostly empty interior; cutting along
// interior low-coverage row/column bands recovers the table runs.
const SPLIT_COV = 0.3;

function decomposeComponent(
  labels: Int32Array,
  label: number,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  depth: number,
  out: Candidate[],
): void {
  // Tight bbox of this label within the given bounds
  let tx0 = x1 + 1;
  let tx1 = x0 - 1;
  let ty0 = y1 + 1;
  let ty1 = y0 - 1;
  let area = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (labels[y * w + x] !== label) continue;
      area++;
      if (x < tx0) tx0 = x;
      if (x > tx1) tx1 = x;
      if (y < ty0) ty0 = y;
      if (y > ty1) ty1 = y;
    }
  }
  if (area === 0) return;
  const tw = tx1 - tx0 + 1;
  const th = ty1 - ty0 + 1;
  const colCnt = new Uint32Array(tw);
  const rowCnt = new Uint32Array(th);
  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) {
      if (labels[y * w + x] !== label) continue;
      colCnt[x - tx0]++;
      rowCnt[y - ty0]++;
    }
  }
  const emit = () => out.push({ x: tx0, y: ty0, w: tw, h: th, fill: area / (tw * th) });
  if (depth <= 0) {
    emit();
    return;
  }

  // Split into contiguous bands of above/below-threshold coverage and recurse
  // into every band that still holds pixels. Low bands aren't discarded — a
  // ring's interior band still contains its two vertical arms, which the
  // recursion then separates along the other axis.
  const trySplit = (cnt: Uint32Array, len: number, denom: number, columns: boolean): boolean => {
    const bands: Array<[number, number]> = [];
    let start = 0;
    let cur = cnt[0] / denom >= SPLIT_COV;
    for (let i = 1; i < len; i++) {
      const high = cnt[i] / denom >= SPLIT_COV;
      if (high !== cur) {
        bands.push([start, i - 1]);
        start = i;
        cur = high;
      }
    }
    bands.push([start, len - 1]);
    if (bands.length < 2) return false;
    for (const [a, b] of bands) {
      let sum = 0;
      for (let i = a; i <= b; i++) sum += cnt[i];
      if (sum === 0) continue;
      if (columns) decomposeComponent(labels, label, w, tx0 + a, ty0, tx0 + b, ty1, depth - 1, out);
      else decomposeComponent(labels, label, w, tx0, ty0 + a, tx1, ty0 + b, depth - 1, out);
    }
    return true;
  };

  // Cut across the long axis first; both axes get tried either way
  if (th >= tw) {
    if (trySplit(rowCnt, th, tw, false)) return;
    if (trySplit(colCnt, tw, th, true)) return;
  } else {
    if (trySplit(colCnt, tw, th, true)) return;
    if (trySplit(rowCnt, th, tw, false)) return;
  }
  emit();
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
 * Infer px→meters assuming table-shaped boxes are standard tables of length
 * `tableW` (default 6 ft). Modal short side of aspect-plausible rects / table
 * depth (0.76 m), cross-checked against the modal long side / tableW.
 */
export function inferScale(
  rects: { w: number; h: number }[],
  imgW: number,
  tableW: number = TABLE_W,
): number {
  const fallback = imgW / 30; // "image is ~30 m wide" last resort

  // ±~40% around the standard table's aspect (6 ft ≈ 2.4 → 1.6–3.4)
  const tableAspect = tableW / TABLE_D;
  const tableish = rects.filter((r) => {
    const aspect = Math.max(r.w, r.h) / Math.min(r.w, r.h);
    return aspect >= 0.67 * tableAspect && aspect <= 1.42 * tableAspect;
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
    const fromLong = longSide / tableW;
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

/** Run detection on a stored floor-plan blob. `tableW` = show standard (m). */
export async function detectTables(blob: Blob, tableW: number = TABLE_W): Promise<DetectionResult> {
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

  // Luma + histogram → Otsu → dark mask (lines/fills = 1). Strongly saturated
  // mid/bright pixels (colored decoration, highlight zones) count as background:
  // plan linework is near-black, so chroma there is ~0, while e.g. a red banner
  // region has mid luma that would otherwise land under the Otsu threshold and
  // become a giant fake table. The luma guard keeps dark colored fills (navy
  // filled tables) detectable.
  const n = w * h;
  const mask = new Uint8Array(n);
  const sat = new Uint8Array(n);
  const hueBin = new Uint8Array(n); // 24 × 15° hue bins, valid where sat=1
  const hist = new Uint32Array(256);
  let satCount = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const chroma = mx - mn;
    mask[i] = luma; // temporarily store luma
    if (chroma > 60 && luma > 50) {
      sat[i] = 1;
      satCount++;
      let hue: number;
      if (mx === r) hue = ((g - b) / chroma + 6) % 6;
      else if (mx === g) hue = (b - r) / chroma + 2;
      else hue = (r - g) / chroma + 4;
      hueBin[i] = Math.min(23, (hue * 4) | 0); // hue∈[0,6) → 24 bins
    } else {
      hist[luma]++;
    }
  }
  const threshold = otsu(hist, n - satCount);
  for (let i = 0; i < n; i++) mask[i] = sat[i] === 0 && mask[i] <= threshold ? 1 : 0;

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
  // Merge before filtering so a thin text-split sliver isn't dropped first
  const passA = mergeSplitFragments(enclosed.map(componentToCandidate), mask, w, maxDim)
    .filter((c) => acceptCandidate(c, maxDim));
  const passB = darkBlobs.map(componentToCandidate).filter((c) => acceptCandidate(c, maxDim));

  // Pass C — saturated colored fills (tables drawn as solid orange/teal/etc
  // boxes). The Otsu guard above excludes these on purpose so decoration
  // can't become fake tables; here we take the excluded pixels, group them
  // into hue families, and accept a family only when it yields ≥3
  // table-plausible components — tables repeat, decoration doesn't.
  const passC: Candidate[] = [];
  if (satCount >= 0.002 * n) {
    const hueHist = new Uint32Array(24);
    for (let i = 0; i < n; i++) if (sat[i]) hueHist[hueBin[i]]++;
    const binThresh = Math.max(0.002 * n, 30);
    // Circular runs of above-threshold bins = one family each
    const inFamily = new Int8Array(24).fill(-1);
    let famCount = 0;
    for (let b = 0; b < 24; b++) {
      if (hueHist[b] < binThresh || inFamily[b] >= 0) continue;
      const fam = famCount++;
      // walk the run both ways
      for (let d = 0; d < 24 && hueHist[(b + d) % 24] >= binThresh; d++) inFamily[(b + d) % 24] = fam;
      for (let d = 1; d < 24 && hueHist[(b - d + 24) % 24] >= binThresh; d++) inFamily[(b - d + 24) % 24] = fam;
    }
    const famMask = new Uint8Array(n);
    const famLabels = new Int32Array(n);
    for (let f = 0; f < famCount; f++) {
      famMask.fill(0);
      famLabels.fill(0);
      for (let i = 0; i < n; i++) {
        if (!sat[i]) continue;
        const b = hueBin[i];
        // family bins ±1 so JPEG hue jitter doesn't split a box
        if (inFamily[b] === f || inFamily[(b + 1) % 24] === f || inFamily[(b + 23) % 24] === f) {
          famMask[i] = 1;
        }
      }
      // Beyond the generic caps, accept long straight runs of slots (whole
      // booth-ring sides): thin + solid at any aspect. Decoration blobs are
      // far thicker than a table depth, so the short-side cap excludes them.
      const acceptC = (c: Candidate): boolean => {
        if (acceptCandidate(c, maxDim)) return true;
        const short = Math.min(c.w, c.h);
        const long = Math.max(c.w, c.h);
        return (
          c.fill >= 0.75 &&
          short >= Math.max(6, 0.008 * maxDim) &&
          short <= 0.08 * maxDim &&
          long <= 0.9 * maxDim
        );
      };
      const comps = connectedComponents(famMask, famLabels, w, h, 1, 0);
      const direct: Candidate[] = [];
      const rejected: number[] = []; // component indices
      for (let ci = 0; ci < comps.length; ci++) {
        const cand = componentToCandidate(comps[ci]);
        if (acceptC(cand)) direct.push(cand);
        else rejected.push(ci);
      }
      const famCands: Candidate[] = [...direct];
      // Booth rings / L-corners connect into one mostly-empty component —
      // guillotine-cut them into strips. Pieces only count when their short
      // side matches the family's typical table depth (the ruler set by the
      // directly-accepted boxes); this is what keeps decomposed decoration
      // (logo art, colored bands) from minting fake tables.
      if (direct.length >= 2 && rejected.length > 0) {
        const shorts = direct.map((c) => Math.min(c.w, c.h)).sort((a, b) => a - b);
        const modalShort = shorts[shorts.length >> 1];
        for (const ci of rejected) {
          const comp = comps[ci];
          if (comp.area < 150) continue;
          const pieces: Candidate[] = [];
          decomposeComponent(famLabels, ci + 1, w, comp.minX, comp.minY, comp.maxX, comp.maxY, 8, pieces);
          if (pieces.length < 2) continue; // uncuttable — genuinely not a table
          for (const p of pieces) {
            const s = Math.min(p.w, p.h);
            if (acceptC(p) && s >= 0.6 * modalShort && s <= 1.7 * modalShort) famCands.push(p);
          }
        }
      }
      if (famCands.length >= 3) passC.push(...famCands);
    }
  }

  // Merge: pass A wins on overlap (an outlined table also produces a dark
  // ring blob in pass B with poor fill, but belt-and-braces)
  const merged: Candidate[] = [...passA];
  for (const b of passB) {
    if (!merged.some((a) => iou(a, b) > 0.5)) merged.push(b);
  }
  for (const c of passC) {
    if (!merged.some((a) => iou(a, c) > 0.5)) merged.push(c);
  }

  // Containment prune: a rect swallowing ≥3 accepted rects is a booth block
  const pruned = merged.filter(
    (outer) => merged.filter((inner) => inner !== outer && contains(outer, inner)).length < 3,
  );

  const pxPerMeterDetect = inferScale(pruned, w, tableW);

  // Physical size floor: icon-sized blobs (figures, ⓘ markers) survive the
  // pixel filters but no real table is under ~half a table-depth on a side
  const sane = pruned.filter(
    (c) =>
      Math.max(c.w, c.h) / pxPerMeterDetect >= 0.5 &&
      Math.min(c.w, c.h) / pxPerMeterDetect >= 0.2,
  );

  // Scale rects (and the scale itself) back to stored-image pixels
  const inv = 1 / scale;
  const rects: VendorRect[] = sane.map((c) => ({
    id: crypto.randomUUID(),
    x: Math.round(c.x * inv),
    y: Math.round(c.y * inv),
    w: Math.round(c.w * inv),
    h: Math.round(c.h * inv),
  }));

  return { rects, imgW, imgH, pxPerMeter: pxPerMeterDetect * inv };
}
