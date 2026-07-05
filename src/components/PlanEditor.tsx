import { useRef, useState, useEffect, useCallback } from 'react';
import type { VendorRect } from '../lib/vendorPlan';
import { TABLE_D, boxGrid, standardTableW } from '../lib/vendorPlan';

// 2D floor-plan editor: the plan image with an SVG overlay whose viewBox is
// the stored-image pixel space — all rect math happens in image px and the
// browser handles display scaling, so window resizes cost nothing.

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
}

type EditorMode = 'select' | 'add' | 'calibrate' | 'setStart';

type DragState =
  | { kind: 'move'; id: string; startX: number; startY: number; orig: VendorRect }
  | { kind: 'resize'; id: string; corner: number; orig: VendorRect }
  | { kind: 'rotate'; id: string; cx: number; cy: number }
  | { kind: 'draw'; id: string; anchorX: number; anchorY: number }
  | { kind: 'calibrate'; x0: number; y0: number };

interface CalLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const GOLD = '#d4af37';

const ROTATE_SNAP = 15; // degrees; hold Shift for free rotation

/** Rotate point (px, py) by deg degrees (SVG clockwise) about (cx, cy). */
function rotatePoint(px: number, py: number, cx: number, cy: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
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
}: PlanEditorProps) {
  const tableW = standardTableW(tableLengthFt);
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('select');
  const [calLine, setCalLine] = useState<CalLine | null>(null);
  const calLineRef = useRef<CalLine | null>(null);
  const drag = useRef<DragState | null>(null);
  const addMode = mode === 'add';

  useEffect(() => {
    onSelectionChange?.(selected);
  }, [selected, onSelectionChange]);

  const minSize = Math.max(4, 0.3 * pxPerMeter);
  // Handle/stroke sizes live in viewBox units — keep them readable regardless
  // of image resolution by scaling with the image dimension
  const ui = Math.max(imgW, imgH) / 100;

  // Capture keeps drags alive after the pointer leaves the SVG; guarded
  // because a pointer can vanish mid-gesture (pen lift, touch cancel)
  const capture = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // drag still works while the pointer stays over the element
    }
  };

  /** Client coords → image-pixel coords via the SVG's CTM. */
  const toImage = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = new DOMPoint(e.clientX, e.clientY);
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const updateRect = useCallback((id: string, next: Partial<VendorRect>) => {
    onChange(rects.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }, [rects, onChange]);

  // Delete/Backspace removes the selected rect
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        onChange(rects.filter((r) => r.id !== selected));
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, rects, onChange]);

  const onPointerDownEmpty = (e: React.PointerEvent) => {
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
      setSelected(null);
      return;
    }
    const { x, y } = toImage(e);
    const id = crypto.randomUUID();
    drag.current = { kind: 'draw', id, anchorX: x, anchorY: y };
    onChange([...rects, { id, x, y, w: 1, h: 1 }]);
    setSelected(id);
    capture(e);
  };

  const onPointerDownRect = (e: React.PointerEvent, r: VendorRect) => {
    if (mode !== 'select') return;
    e.stopPropagation();
    const { x, y } = toImage(e);
    drag.current = { kind: 'move', id: r.id, startX: x, startY: y, orig: r };
    setSelected(r.id);
    capture(e);
  };

  const onPointerDownHandle = (e: React.PointerEvent, r: VendorRect, corner: number) => {
    e.stopPropagation();
    drag.current = { kind: 'resize', id: r.id, corner, orig: r };
    capture(e);
  };

  const onPointerDownRotate = (e: React.PointerEvent, r: VendorRect) => {
    e.stopPropagation();
    drag.current = { kind: 'rotate', id: r.id, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
    capture(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = toImage(e);
    if (d.kind === 'calibrate') {
      calLineRef.current = { x0: d.x0, y0: d.y0, x1: x, y1: y };
      setCalLine(calLineRef.current);
      return;
    }
    if (d.kind === 'move') {
      const deg = d.orig.rotationDeg ?? 0;
      if (deg === 0) {
        const nx = Math.max(0, Math.min(imgW - d.orig.w, d.orig.x + (x - d.startX)));
        const ny = Math.max(0, Math.min(imgH - d.orig.h, d.orig.y + (y - d.startY)));
        updateRect(d.id, { x: nx, y: ny });
      } else {
        // Rotated corners may poke past the image edge; clamp the center only
        const nx = Math.max(-d.orig.w / 2, Math.min(imgW - d.orig.w / 2, d.orig.x + (x - d.startX)));
        const ny = Math.max(-d.orig.h / 2, Math.min(imgH - d.orig.h / 2, d.orig.y + (y - d.startY)));
        updateRect(d.id, { x: nx, y: ny });
      }
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
    if (d?.kind === 'calibrate') {
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
    if (d?.kind !== 'draw') return;
    // A click without a real drag drops a default one-table rect
    const r = rects.find((rr) => rr.id === d.id);
    if (!r) return;
    if (r.w < minSize || r.h < minSize) {
      const w = tableW * pxPerMeter;
      const h = TABLE_D * pxPerMeter;
      updateRect(d.id, {
        x: Math.max(0, Math.min(imgW - w, d.anchorX - w / 2)),
        y: Math.max(0, Math.min(imgH - h, d.anchorY - h / 2)),
        w,
        h,
      });
    }
  };

  // Grid mapped onto image axes: divisions across the rect's width/height.
  // Mirrors planToLayout via the shared boxGrid so the preview can't drift.
  const gridForRect = (r: VendorRect) => {
    const wM = r.w / pxPerMeter;
    const hM = r.h / pxPerMeter;
    const g = boxGrid(Math.max(wM, hM), Math.min(wM, hM), tableW);
    return wM >= hM ? { nw: g.cols, nh: g.rows } : { nw: g.rows, nh: g.cols };
  };

  return (
    <div style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
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
          cursor: mode !== 'select' ? 'crosshair' : 'default',
        }}
        onPointerDown={onPointerDownEmpty}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {rects.map((r) => {
          const isSel = r.id === selected;
          const { nw, nh } = gridForRect(r);
          const k = nw * nh;
          const rcx = r.x + r.w / 2;
          const rcy = r.y + r.h / 2;
          const corners: [number, number][] = [
            [r.x, r.y],
            [r.x + r.w, r.y],
            [r.x + r.w, r.y + r.h],
            [r.x, r.y + r.h],
          ];
          return (
            // Rotation on the group: rect, label, and every handle render in
            // the rotated frame for free
            <g key={r.id} transform={`rotate(${r.rotationDeg ?? 0} ${rcx} ${rcy})`}>
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
              <text
                x={r.x + r.w / 2}
                y={r.y + r.h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fff"
                stroke="#000"
                strokeWidth={ui * 0.06}
                paintOrder="stroke"
                fontSize={Math.min(ui * 2.2, Math.max(r.h * 0.6, ui * 1.2))}
                style={{ pointerEvents: 'none', fontFamily: 'Georgia, serif' }}
              >
                {nw > 1 && nh > 1
                  ? `${nh}×${nw} · ${k} tables`
                  : k > 1
                    ? `${k} tables`
                    : '1 table'}
              </text>
              {isSel && mode === 'select' && (
                <>
                  {/* Rotate handle above the top edge */}
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
                  <g
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onChange(rects.filter((rr) => rr.id !== r.id));
                      setSelected(null);
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
                      ✕
                    </text>
                  </g>
                </>
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
      </svg>

      {/* Mode toggles live with the canvas so they read as tools */}
      <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '8px' }}>
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
