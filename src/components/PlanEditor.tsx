import { useRef, useState, useEffect, useCallback } from 'react';
import type { VendorRect } from '../lib/vendorPlan';
import { TABLE_D, boxGrid, standardTableW } from '../lib/vendorPlan';

// 2D floor-plan editor: the plan image with an SVG overlay whose viewBox is
// the stored-image pixel space — all rect math happens in image px and the
// browser handles display scaling, so window resizes cost nothing.
//
// Power tools (2026-07-10):
// - Zoom/pan: a CSS transform on the stage wrapper that holds BOTH the <img>
//   and the SVG (they can never desync). toImage() maps client→image px via
//   getBoundingClientRect ratios, which reflect the transform — every drag,
//   resize, rotate, draw, calibrate and marquee inherits zoom correctness.
//   Zoom state is ephemeral (never persisted). Pan = Space+drag or
//   middle-drag; plain drag on empty space stays marquee-select.
// - Undo/redo: history of rects snapshots (cap 50) committed at operation
//   boundaries — end of drag/resize/rotate, add, delete — plus external rect
//   changes from the parent (vendor assign/unassign) detected by prop
//   identity. Undo/redo emit through the same onChange path, so the parent's
//   debounce-persist stays the single write path.
// - Multi-select: selected is an ordered id list (last = primary). Shift-click
//   toggles membership, marquee selects, group move/delete operate on the
//   whole set. onSelectionChange emits the PRIMARY id only — the assign
//   panel's single-rect contract is unchanged.

interface PlanEditorProps {
  planUrl: string;
  imgW: number;
  imgH: number;
  rects: VendorRect[];
  pxPerMeter: number;
  /** Show-standard table length; drives the grid preview. Absent = 6 ft. */
  tableLengthFt?: 6 | 8;
  onChange: (rects: VendorRect[]) => void;
  /** Calibration line finished: length in image px. Parent asks for the real length. */
  onCalibrateLine?: (lengthPx: number) => void;
  onSelectionChange?: (id: string | null) => void;
  /** Player start marker (image px). Provide both to enable the tool. */
  startPx?: { x: number; y: number } | null;
  onStartChange?: (p: { x: number; y: number }) => void;
  /** Vendor id → name, for labelling assigned boxes. */
  vendorNames?: Map<string, string>;
}

type EditorMode = 'select' | 'add' | 'calibrate' | 'setStart';

type DragState =
  | { kind: 'move'; id: string; startX: number; startY: number; origs: VendorRect[] }
  | { kind: 'resize'; id: string; corner: number; orig: VendorRect }
  | { kind: 'rotate'; id: string; cx: number; cy: number }
  | { kind: 'draw'; id: string; anchorX: number; anchorY: number }
  | { kind: 'calibrate'; x0: number; y0: number }
  | { kind: 'pan'; startCX: number; startCY: number; tx0: number; ty0: number }
  | { kind: 'marquee'; x0: number; y0: number; additive: boolean };

interface CalLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Ephemeral view transform: translate(tx,ty) then scale(s), origin 0 0. */
interface ViewState {
  s: number;
  tx: number;
  ty: number;
}

const GOLD = '#d4af37';

const ROTATE_SNAP = 15; // degrees; hold Shift for free rotation

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.35; // toolbar button factor
const HISTORY_MAX = 50;

/** Rotate point (px, py) by deg degrees (SVG clockwise) about (cx, cy). */
function rotatePoint(px: number, py: number, cx: number, cy: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

/** Axis-aligned bounds of a (possibly rotated) rect in image px. */
function worldBounds(r: VendorRect) {
  const deg = r.rotationDeg ?? 0;
  if (deg === 0) return { x: r.x, y: r.y, w: r.w, h: r.h };
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const pts = [
    rotatePoint(r.x, r.y, cx, cy, deg),
    rotatePoint(r.x + r.w, r.y, cx, cy, deg),
    rotatePoint(r.x + r.w, r.y + r.h, cx, cy, deg),
    rotatePoint(r.x, r.y + r.h, cx, cy, deg),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

function boundsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Content equality — used to skip no-op history entries (click without drag). */
function rectsEqual(a: VendorRect[], b: VendorRect[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ra = a[i];
    const rb = b[i];
    if (
      ra.id !== rb.id ||
      ra.x !== rb.x ||
      ra.y !== rb.y ||
      ra.w !== rb.w ||
      ra.h !== rb.h ||
      ra.rotationDeg !== rb.rotationDeg ||
      ra.vendorId !== rb.vendorId ||
      ra.bannerId !== rb.bannerId
    ) {
      return false;
    }
  }
  return true;
}

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Keep the plan on-screen: content edges may never leave the viewport gap. */
function clampView(s: number, tx: number, ty: number, vw: number, vh: number): ViewState {
  const loX = Math.min(0, vw - vw * s);
  const hiX = Math.max(0, vw - vw * s);
  const loY = Math.min(0, vh - vh * s);
  const hiY = Math.max(0, vh - vh * s);
  return { s, tx: clampNum(tx, loX, hiX), ty: clampNum(ty, loY, hiY) };
}

function isEditableTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export default function PlanEditor({
  planUrl,
  imgW,
  imgH,
  rects,
  pxPerMeter,
  tableLengthFt,
  onChange,
  onCalibrateLine,
  onSelectionChange,
  startPx,
  onStartChange,
  vendorNames,
}: PlanEditorProps) {
  const tableW = standardTableW(tableLengthFt);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // Ordered multi-selection; last entry is the PRIMARY (drives the assign panel)
  const [selected, setSelected] = useState<string[]>([]);
  // Mouse/pen hover only — real plans print their own booth numbers, so the
  // per-box table-count label shows just for the hovered or selected rect
  // (touch has no hover: selected-only there).
  const [hovered, setHovered] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('select');
  const [calLine, setCalLine] = useState<CalLine | null>(null);
  const calLineRef = useRef<CalLine | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [view, setView] = useState<ViewState>({ s: 1, tx: 0, ty: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const drag = useRef<DragState | null>(null);
  // rects as of drag start — the undo snapshot committed at drag end
  const dragBase = useRef<VendorRect[] | null>(null);
  const addMode = mode === 'add';

  // Ref mirrors so window-level key handlers and undo/redo stay stable
  const rectsRef = useRef(rects);
  rectsRef.current = rects;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const viewRef = useRef(view);
  viewRef.current = view;
  const spaceRef = useRef(false);

  const primary = selected.length > 0 ? selected[selected.length - 1] : null;
  useEffect(() => {
    onSelectionChange?.(primary);
  }, [primary, onSelectionChange]);

  const minSize = Math.max(4, 0.3 * pxPerMeter);
  // Handle/stroke sizes live in viewBox units — keep them readable regardless
  // of image resolution by scaling with the image dimension
  const ui = Math.max(imgW, imgH) / 100;

  // ---- history (undo/redo) ----------------------------------------------
  const [history, setHistory] = useState<{ past: VendorRect[][]; future: VendorRect[][] }>(
    { past: [], future: [] },
  );
  const historyRef = useRef(history);
  historyRef.current = history;

  // Everything PlanEditor sends upward goes through emitChange so the prop
  // echo can be told apart from external changes (vendor assign in the panel)
  const lastSent = useRef<VendorRect[] | null>(null);
  const emitChange = useCallback((next: VendorRect[]) => {
    lastSent.current = next;
    onChange(next);
  }, [onChange]);

  const commit = useCallback((base: VendorRect[]) => {
    setHistory((h) => ({
      past: [...h.past.slice(-(HISTORY_MAX - 1)), base],
      future: [],
    }));
  }, []);

  // External rect changes (assign/unassign from the parent panel) become
  // undo steps too; our own echoes are recognized by identity — the parent
  // stores the exact array emitChange sent.
  const lastKnown = useRef(rects);
  useEffect(() => {
    if (rects === lastKnown.current) return;
    if (rects !== lastSent.current) commit(lastKnown.current);
    lastKnown.current = rects;
  }, [rects, commit]);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const prev = h.past[h.past.length - 1];
    setHistory({ past: h.past.slice(0, -1), future: [...h.future, rectsRef.current] });
    emitChange(prev);
    setSelected([]);
  }, [emitChange]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const next = h.future[h.future.length - 1];
    setHistory({ past: [...h.past, rectsRef.current], future: h.future.slice(0, -1) });
    emitChange(next);
    setSelected([]);
  }, [emitChange]);

  // ---- view (zoom/pan) ---------------------------------------------------
  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Default anchor = viewport center (toolbar buttons)
    const px = clientX !== undefined ? clientX - rect.left : rect.width / 2;
    const py = clientY !== undefined ? clientY - rect.top : rect.height / 2;
    setView((v) => {
      const s = clampNum(v.s * factor, MIN_ZOOM, MAX_ZOOM);
      if (s === v.s) return v;
      // Keep the content point under the anchor fixed
      const k = s / v.s;
      return clampView(s, px - (px - v.tx) * k, py - (py - v.ty) * k, rect.width, rect.height);
    });
  }, []);

  const resetView = useCallback(() => setView({ s: 1, tx: 0, ty: 0 }), []);

  // React's root wheel listener is passive — a native non-passive listener is
  // the only way preventDefault (page scroll) works during cursor zoom
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomAt(Math.exp(-dy * 0.0018), e.clientX, e.clientY);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Capture keeps drags alive after the pointer leaves the SVG; guarded
  // because a pointer can vanish mid-gesture (pen lift, touch cancel)
  const capture = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // drag still works while the pointer stays over the element
    }
  };

  /** Client coords → image-pixel coords via bounding-rect ratios (the rect
   *  reflects the zoom/pan CSS transform, so this is zoom-correct). */
  const toImage = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - r.left) / r.width) * imgW,
      y: ((e.clientY - r.top) / r.height) * imgH,
    };
  }, [imgW, imgH]);

  const updateRect = useCallback((id: string, next: Partial<VendorRect>) => {
    emitChange(rects.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }, [rects, emitChange]);

  const deleteSelected = useCallback(() => {
    const sel = selectedRef.current;
    if (sel.length === 0) return;
    const del = new Set(sel);
    commit(rectsRef.current);
    emitChange(rectsRef.current.filter((r) => !del.has(r.id)));
    setSelected([]);
  }, [commit, emitChange]);

  // Window-level keys: Delete/Backspace (group delete), Esc (clear selection),
  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (undo/redo), Space (hold to pan).
  // Editable targets are left alone — typing in the vendor/calibration inputs
  // must never delete boxes or trigger history.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.code === 'Space') {
        // Keep button focus semantics (Space activates a focused button)
        if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return;
        spaceRef.current = true;
        setSpaceHeld(true);
        e.preventDefault(); // stop page scroll while the pan modifier is held
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Escape') {
        setSelected([]);
        setMarquee(null);
        if (drag.current?.kind === 'marquee') drag.current = null;
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [undo, redo, deleteSelected]);

  /** Space+drag or middle-button = pan, in any mode, even over rects. */
  const isPanIntent = (e: React.PointerEvent) => spaceRef.current || e.button === 1;

  const startPan = (e: React.PointerEvent) => {
    e.preventDefault(); // suppress middle-click autoscroll
    drag.current = {
      kind: 'pan',
      startCX: e.clientX,
      startCY: e.clientY,
      tx0: viewRef.current.tx,
      ty0: viewRef.current.ty,
    };
    setPanning(true);
    capture(e);
  };

  const onPointerDownEmpty = (e: React.PointerEvent) => {
    if (isPanIntent(e)) {
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    if (mode === 'setStart') {
      const { x, y } = toImage(e);
      onStartChange?.({
        x: Math.max(0, Math.min(imgW, x)),
        y: Math.max(0, Math.min(imgH, y)),
      });
      setMode('select');
      return;
    }
    if (mode === 'calibrate') {
      const { x, y } = toImage(e);
      drag.current = { kind: 'calibrate', x0: x, y0: y };
      calLineRef.current = { x0: x, y0: y, x1: x, y1: y };
      setCalLine(calLineRef.current);
      capture(e);
      return;
    }
    if (!addMode) {
      // Marquee select; a no-drag click clears the selection at pointerup
      const { x, y } = toImage(e);
      drag.current = { kind: 'marquee', x0: x, y0: y, additive: e.shiftKey };
      capture(e);
      return;
    }
    const { x, y } = toImage(e);
    const id = crypto.randomUUID();
    dragBase.current = rects;
    drag.current = { kind: 'draw', id, anchorX: x, anchorY: y };
    emitChange([...rects, { id, x, y, w: 1, h: 1 }]);
    setSelected([id]);
    capture(e);
  };

  const onPointerDownRect = (e: React.PointerEvent, r: VendorRect) => {
    if (mode !== 'select') return;
    if (isPanIntent(e)) return; // bubble to the svg root → pan
    e.stopPropagation();
    if (e.button !== 0) return;
    if (e.shiftKey) {
      // Toggle membership; added rect becomes the primary
      setSelected((prev) =>
        prev.includes(r.id) ? prev.filter((id) => id !== r.id) : [...prev, r.id],
      );
      return;
    }
    const { x, y } = toImage(e);
    const members = selected.includes(r.id) ? selected : [r.id];
    if (!selected.includes(r.id)) setSelected([r.id]);
    dragBase.current = rects;
    drag.current = {
      kind: 'move',
      id: r.id,
      startX: x,
      startY: y,
      origs: rects.filter((rr) => members.includes(rr.id)),
    };
    capture(e);
  };

  const onPointerDownHandle = (e: React.PointerEvent, r: VendorRect, corner: number) => {
    if (isPanIntent(e)) return;
    e.stopPropagation();
    dragBase.current = rects;
    drag.current = { kind: 'resize', id: r.id, corner, orig: r };
    capture(e);
  };

  const onPointerDownRotate = (e: React.PointerEvent, r: VendorRect) => {
    if (isPanIntent(e)) return;
    e.stopPropagation();
    dragBase.current = rects;
    drag.current = { kind: 'rotate', id: r.id, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
    capture(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      const vp = viewportRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      setView((v) =>
        clampView(
          v.s,
          d.tx0 + (e.clientX - d.startCX),
          d.ty0 + (e.clientY - d.startCY),
          r.width,
          r.height,
        ),
      );
      return;
    }
    const { x, y } = toImage(e);
    if (d.kind === 'marquee') {
      setMarquee({ x0: d.x0, y0: d.y0, x1: x, y1: y });
      return;
    }
    if (d.kind === 'calibrate') {
      calLineRef.current = { x0: d.x0, y0: d.y0, x1: x, y1: y };
      setCalLine(calLineRef.current);
      return;
    }
    if (d.kind === 'move') {
      // Group move: one shared delta, clamped so no member leaves the image —
      // the formation never distorts at the borders
      let dx = x - d.startX;
      let dy = y - d.startY;
      for (const o of d.origs) {
        const deg = o.rotationDeg ?? 0;
        if (deg === 0) {
          dx = clampNum(dx, -o.x, imgW - o.w - o.x);
          dy = clampNum(dy, -o.y, imgH - o.h - o.y);
        } else {
          // Rotated corners may poke past the image edge; clamp the center only
          dx = clampNum(dx, -o.w / 2 - o.x, imgW - o.w / 2 - o.x);
          dy = clampNum(dy, -o.h / 2 - o.y, imgH - o.h / 2 - o.y);
        }
      }
      const byId = new Map(d.origs.map((o) => [o.id, o]));
      emitChange(
        rects.map((r) => {
          const o = byId.get(r.id);
          return o ? { ...r, x: o.x + dx, y: o.y + dy } : r;
        }),
      );
    } else if (d.kind === 'rotate') {
      const raw = (Math.atan2(y - d.cy, x - d.cx) * 180) / Math.PI + 90;
      const snapped = (e.shiftKey ? raw : Math.round(raw / ROTATE_SNAP) * ROTATE_SNAP) % 360;
      // Normalize to (−180, 180]; store 0 as undefined so detected rects stay lean
      const deg = snapped > 180 ? snapped - 360 : snapped <= -180 ? snapped + 360 : snapped;
      updateRect(d.id, { rotationDeg: deg === 0 ? undefined : deg });
    } else if (d.kind === 'resize') {
      // Corners: 0=NW 1=NE 2=SE 3=SW — opposite corner stays fixed.
      // Rotated rects: run the same math in the rect's local (unrotated)
      // frame, then re-anchor so the fixed corner keeps its on-screen spot.
      const { orig, corner } = d;
      const deg = orig.rotationDeg ?? 0;
      const cx0 = orig.x + orig.w / 2;
      const cy0 = orig.y + orig.h / 2;
      const local = deg === 0 ? { x, y } : rotatePoint(x, y, cx0, cy0, -deg);
      const fixedX = corner === 0 || corner === 3 ? orig.x + orig.w : orig.x;
      const fixedY = corner === 0 || corner === 1 ? orig.y + orig.h : orig.y;
      const px = Math.max(0, Math.min(imgW, local.x));
      const py = Math.max(0, Math.min(imgH, local.y));
      const nx = Math.min(fixedX, px);
      const ny = Math.min(fixedY, py);
      const nw = Math.max(minSize, Math.abs(px - fixedX));
      const nh = Math.max(minSize, Math.abs(py - fixedY));
      if (deg === 0) {
        updateRect(d.id, { x: nx, y: ny, w: nw, h: nh });
      } else {
        const worldFixed = rotatePoint(fixedX, fixedY, cx0, cy0, deg);
        // New center in the old local frame → offset of the fixed corner from
        // it → subtract that offset (rotated) from the fixed corner's world spot
        const localCx = nx + nw / 2;
        const localCy = ny + nh / 2;
        const off = rotatePoint(fixedX - localCx, fixedY - localCy, 0, 0, deg);
        const centerX = worldFixed.x - off.x;
        const centerY = worldFixed.y - off.y;
        updateRect(d.id, { x: centerX - nw / 2, y: centerY - nh / 2, w: nw, h: nh });
      }
    } else {
      const cx = Math.max(0, Math.min(imgW, x));
      const cy = Math.max(0, Math.min(imgH, y));
      updateRect(d.id, {
        x: Math.min(d.anchorX, cx),
        y: Math.min(d.anchorY, cy),
        w: Math.abs(cx - d.anchorX),
        h: Math.abs(cy - d.anchorY),
      });
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'pan') {
      setPanning(false);
      return;
    }
    if (d.kind === 'marquee') {
      const m = marquee;
      setMarquee(null);
      const w = m ? Math.abs(m.x1 - m.x0) : 0;
      const h = m ? Math.abs(m.y1 - m.y0) : 0;
      if (!m || (w < ui * 0.5 && h < ui * 0.5)) {
        // Plain click on empty space — clear (the pre-marquee behavior)
        setSelected([]);
        return;
      }
      const box = { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), w, h };
      const hits = rects.filter((r) => boundsIntersect(worldBounds(r), box)).map((r) => r.id);
      setSelected((prev) =>
        d.additive ? [...prev.filter((id) => !hits.includes(id)), ...hits] : hits,
      );
      return;
    }
    if (d.kind === 'calibrate') {
      const line = calLineRef.current;
      const len = line ? Math.hypot(line.x1 - line.x0, line.y1 - line.y0) : 0;
      if (len < ui * 2) {
        // Accidental click, not a measurement
        calLineRef.current = null;
        setCalLine(null);
        return;
      }
      // The line stays visible as reference while the parent asks for length
      setMode('select');
      onCalibrateLine?.(len);
      return;
    }
    if (d.kind === 'draw') {
      // A click without a real drag drops a default one-table rect
      const r = rects.find((rr) => rr.id === d.id);
      if (r && (r.w < minSize || r.h < minSize)) {
        const w = tableW * pxPerMeter;
        const h = TABLE_D * pxPerMeter;
        updateRect(d.id, {
          x: Math.max(0, Math.min(imgW - w, d.anchorX - w / 2)),
          y: Math.max(0, Math.min(imgH - h, d.anchorY - h / 2)),
          w,
          h,
        });
      }
    }
    // move / resize / rotate / draw finished — one history step per gesture.
    // Content equality skips no-op steps (click on a rect, snap-back rotate).
    const base = dragBase.current;
    dragBase.current = null;
    if (base && !rectsEqual(base, rectsRef.current)) commit(base);
  };

  // Grid mapped onto image axes: divisions across the rect's width/height.
  // Mirrors planToLayout via the shared boxGrid so the preview can't drift.
  const gridForRect = (r: VendorRect) => {
    const wM = r.w / pxPerMeter;
    const hM = r.h / pxPerMeter;
    const g = boxGrid(Math.max(wM, hM), Math.min(wM, hM), tableW);
    return wM >= hM ? { nw: g.cols, nh: g.rows } : { nw: g.rows, nh: g.cols };
  };

  const viewIsDefault = view.s === 1 && view.tx === 0 && view.ty === 0;

  return (
    <div style={{ width: '100%', userSelect: 'none' }}>
      {/* Mode toggles in normal flow ABOVE the stage — floated over the image
          they covered the plan's own top-left content */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
        <button
          onClick={() => setMode((m) => (m === 'add' ? 'select' : 'add'))}
          style={toolButton(mode === 'add')}
        >
          {mode === 'add' ? '✓ Drawing tables — click to finish' : '+ Add table'}
        </button>
        {onCalibrateLine && (
          <button
            onClick={() => {
              calLineRef.current = null;
              setCalLine(null);
              setMode((m) => (m === 'calibrate' ? 'select' : 'calibrate'));
            }}
            style={toolButton(mode === 'calibrate')}
          >
            {mode === 'calibrate' ? '✓ Drag a line over a known length' : '📏 Calibrate'}
          </button>
        )}
        {onStartChange && (
          <button
            onClick={() => setMode((m) => (m === 'setStart' ? 'select' : 'setStart'))}
            style={toolButton(mode === 'setStart')}
          >
            {mode === 'setStart' ? '✓ Click where you want to start' : '🚩 Set start'}
          </button>
        )}
        <div style={{ flex: '1 1 auto' }} />
        <button
          onClick={undo}
          disabled={history.past.length === 0}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          style={iconButton(history.past.length === 0)}
        >
          ↶
        </button>
        <button
          onClick={redo}
          disabled={history.future.length === 0}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
          style={iconButton(history.future.length === 0)}
        >
          ↷
        </button>
        <button
          onClick={() => zoomAt(1 / ZOOM_STEP)}
          disabled={view.s <= MIN_ZOOM}
          title="Zoom out (scroll on the plan)"
          aria-label="Zoom out"
          style={iconButton(view.s <= MIN_ZOOM)}
        >
          ⊖
        </button>
        <button
          onClick={() => zoomAt(ZOOM_STEP)}
          disabled={view.s >= MAX_ZOOM}
          title="Zoom in (scroll on the plan)"
          aria-label="Zoom in"
          style={iconButton(view.s >= MAX_ZOOM)}
        >
          ⊕
        </button>
        <button
          onClick={resetView}
          disabled={viewIsDefault}
          title="Reset view"
          aria-label="Reset view"
          style={iconButton(viewIsDefault)}
        >
          ⤢ {Math.round(view.s * 100)}%
        </button>
      </div>

      {/* Viewport clips the zoomed stage; the stage transform carries BOTH the
          image and the SVG overlay so they can never drift apart */}
      <div
        ref={viewportRef}
        style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: '8px' }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
            transformOrigin: '0 0',
          }}
        >
      <img
        src={planUrl}
        alt="Floor plan"
        draggable={false}
        style={{ width: '100%', display: 'block', borderRadius: '8px' }}
      />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${imgW} ${imgH}`}
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: panning
            ? 'grabbing'
            : spaceHeld
              ? 'grab'
              : mode !== 'select'
                ? 'crosshair'
                : 'default',
        }}
        onPointerDown={onPointerDownEmpty}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {rects.map((r) => {
          const isSel = selected.includes(r.id);
          const isPrimary = r.id === primary;
          const soloSel = isSel && selected.length === 1;
          // Table-count labels collided with the plan's printed booth numbers
          // (label soup on real plans) — hover/selection reveals them. Vendor
          // names always render: they carry info the plan itself doesn't.
          const showCount = isSel || hovered === r.id;
          const { nw, nh } = gridForRect(r);
          const k = nw * nh;
          const rcx = r.x + r.w / 2;
          const rcy = r.y + r.h / 2;
          const vendorName = r.vendorId ? vendorNames?.get(r.vendorId) : undefined;
          const labelSize = Math.min(ui * 2.2, Math.max(r.h * 0.6, ui * 1.2));
          const corners: [number, number][] = [
            [r.x, r.y],
            [r.x + r.w, r.y],
            [r.x + r.w, r.y + r.h],
            [r.x, r.y + r.h],
          ];
          return (
            // Rotation on the group: rect, label, and every handle render in
            // the rotated frame for free
            <g
              key={r.id}
              transform={`rotate(${r.rotationDeg ?? 0} ${rcx} ${rcy})`}
              // Boundary events on the group so handles/labels don't flicker
              // it off; touch taps fire enter/leave too, so gate to mouse/pen
              // (touch reveals the count via selection instead)
              onPointerEnter={(e) => {
                if (e.pointerType !== 'touch') setHovered(r.id);
              }}
              onPointerLeave={() => setHovered((h) => (h === r.id ? null : h))}
            >
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={GOLD}
                fillOpacity={isSel ? 0.4 : 0.22}
                stroke={GOLD}
                strokeWidth={isSel ? ui * 0.35 : ui * 0.2}
                style={{ cursor: mode !== 'select' ? 'crosshair' : 'move' }}
                onPointerDown={(e) => onPointerDownRect(e, r)}
              />
              {/* Subdivision preview: how the box splits into tables in 3D */}
              {nw > 1 &&
                Array.from({ length: nw - 1 }, (_, i) => (
                  <line
                    key={`v${i}`}
                    x1={r.x + ((i + 1) / nw) * r.w}
                    y1={r.y}
                    x2={r.x + ((i + 1) / nw) * r.w}
                    y2={r.y + r.h}
                    stroke={GOLD}
                    strokeOpacity={0.75}
                    strokeWidth={ui * 0.1}
                    strokeDasharray={`${ui * 0.4} ${ui * 0.3}`}
                    style={{ pointerEvents: 'none' }}
                  />
                ))}
              {nh > 1 &&
                Array.from({ length: nh - 1 }, (_, j) => (
                  <line
                    key={`h${j}`}
                    x1={r.x}
                    y1={r.y + ((j + 1) / nh) * r.h}
                    x2={r.x + r.w}
                    y2={r.y + ((j + 1) / nh) * r.h}
                    stroke={GOLD}
                    strokeOpacity={0.75}
                    strokeWidth={ui * 0.1}
                    strokeDasharray={`${ui * 0.4} ${ui * 0.3}`}
                    style={{ pointerEvents: 'none' }}
                  />
                ))}
              {showCount && (
                <text
                  x={rcx}
                  y={vendorName ? rcy - labelSize * 0.55 : rcy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#fff"
                  stroke="#000"
                  strokeWidth={ui * 0.06}
                  paintOrder="stroke"
                  fontSize={labelSize}
                  style={{ pointerEvents: 'none', fontFamily: 'Georgia, serif' }}
                >
                  {nw > 1 && nh > 1
                    ? `${nh}×${nw} · ${k} tables`
                    : k > 1
                      ? `${k} tables`
                      : '1 table'}
                </text>
              )}
              {vendorName && (
                <text
                  x={rcx}
                  y={showCount ? rcy + labelSize * 0.65 : rcy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={GOLD}
                  stroke="#000"
                  strokeWidth={ui * 0.06}
                  paintOrder="stroke"
                  fontSize={labelSize * 0.85}
                  style={{ pointerEvents: 'none', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
                >
                  {vendorName}
                </text>
              )}
              {soloSel && mode === 'select' && (
                <>
                  {/* Rotate handle above the top edge (single selection only —
                      group resize/rotate is deliberately not offered) */}
                  <line
                    x1={rcx}
                    y1={r.y}
                    x2={rcx}
                    y2={r.y - ui * 2.5}
                    stroke={GOLD}
                    strokeWidth={ui * 0.15}
                  />
                  <circle
                    cx={rcx}
                    cy={r.y - ui * 2.5}
                    r={ui * 0.8}
                    fill={GOLD}
                    stroke="#fff"
                    strokeWidth={ui * 0.2}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(e) => onPointerDownRotate(e, r)}
                  />
                  {corners.map(([cx, cy], i) => (
                    <circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r={ui * 0.8}
                      fill="#fff"
                      stroke={GOLD}
                      strokeWidth={ui * 0.2}
                      style={{ cursor: i % 2 === 0 ? 'nwse-resize' : 'nesw-resize' }}
                      onPointerDown={(e) => onPointerDownHandle(e, r, i)}
                    />
                  ))}
                </>
              )}
              {isPrimary && mode === 'select' && (
                <g
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    if (isPanIntent(e)) return;
                    e.stopPropagation();
                    // ✕ removes the whole selection (group delete)
                    deleteSelected();
                  }}
                >
                  <circle cx={r.x + r.w + ui * 1.6} cy={r.y - ui * 1.6} r={ui} fill="rgba(0,0,0,0.8)" />
                  <text
                    x={r.x + r.w + ui * 1.6}
                    y={r.y - ui * 1.6}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#fff"
                    fontSize={ui * 1.2}
                    style={{ pointerEvents: 'none' }}
                  >
                    {selected.length > 1 ? `✕${selected.length}` : '✕'}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {startPx && (
          <g style={{ pointerEvents: 'none' }}>
            <circle cx={startPx.x} cy={startPx.y} r={ui * 0.9} fill="#e33" stroke="#fff" strokeWidth={ui * 0.2} />
            <text
              x={startPx.x}
              y={startPx.y - ui * 1.4}
              textAnchor="middle"
              fill="#fff"
              stroke="#000"
              strokeWidth={ui * 0.08}
              paintOrder="stroke"
              fontSize={ui * 1.6}
              style={{ fontFamily: 'Georgia, serif' }}
            >
              🚩 start
            </text>
          </g>
        )}

        {calLine && (
          <g style={{ pointerEvents: 'none' }}>
            <line
              x1={calLine.x0}
              y1={calLine.y0}
              x2={calLine.x1}
              y2={calLine.y1}
              stroke="#ff5544"
              strokeWidth={ui * 0.25}
              strokeDasharray={`${ui * 0.8} ${ui * 0.5}`}
            />
            {[[calLine.x0, calLine.y0], [calLine.x1, calLine.y1]].map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r={ui * 0.5} fill="#ff5544" />
            ))}
            <text
              x={(calLine.x0 + calLine.x1) / 2}
              y={(calLine.y0 + calLine.y1) / 2 - ui}
              textAnchor="middle"
              fill="#fff"
              stroke="#000"
              strokeWidth={ui * 0.08}
              paintOrder="stroke"
              fontSize={ui * 1.6}
              style={{ fontFamily: 'Georgia, serif' }}
            >
              {(Math.hypot(calLine.x1 - calLine.x0, calLine.y1 - calLine.y0) / pxPerMeter).toFixed(2)} m
            </text>
          </g>
        )}

        {marquee && (
          <rect
            x={Math.min(marquee.x0, marquee.x1)}
            y={Math.min(marquee.y0, marquee.y1)}
            width={Math.abs(marquee.x1 - marquee.x0)}
            height={Math.abs(marquee.y1 - marquee.y0)}
            fill={GOLD}
            fillOpacity={0.08}
            stroke={GOLD}
            strokeWidth={ui * 0.15}
            strokeDasharray={`${ui * 0.5} ${ui * 0.35}`}
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>
        </div>
      </div>
    </div>
  );
}

const toolButton = (active: boolean): React.CSSProperties => ({
  background: active ? GOLD : 'rgba(0,0,0,0.7)',
  color: active ? '#1a1614' : '#e8e4dc',
  border: `1px solid ${GOLD}`,
  borderRadius: '6px',
  padding: '6px 12px',
  fontSize: '13px',
  cursor: 'pointer',
  fontFamily: 'Georgia, serif',
});

const iconButton = (disabled: boolean): React.CSSProperties => ({
  ...toolButton(false),
  padding: '6px 10px',
  opacity: disabled ? 0.35 : 1,
  cursor: disabled ? 'default' : 'pointer',
});
