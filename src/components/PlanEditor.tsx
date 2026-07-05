import { useRef, useState, useEffect, useCallback } from 'react';
import type { VendorRect } from '../lib/vendorPlan';
import { TABLE_W, TABLE_D, tablesInLength } from '../lib/vendorPlan';

// 2D floor-plan editor: the plan image with an SVG overlay whose viewBox is
// the stored-image pixel space — all rect math happens in image px and the
// browser handles display scaling, so window resizes cost nothing.

interface PlanEditorProps {
  planUrl: string;
  imgW: number;
  imgH: number;
  rects: VendorRect[];
  pxPerMeter: number;
  onChange: (rects: VendorRect[]) => void;
}

type DragState =
  | { kind: 'move'; id: string; startX: number; startY: number; orig: VendorRect }
  | { kind: 'resize'; id: string; corner: number; orig: VendorRect }
  | { kind: 'draw'; id: string; anchorX: number; anchorY: number };

const GOLD = '#d4af37';

export default function PlanEditor({
  planUrl,
  imgW,
  imgH,
  rects,
  pxPerMeter,
  onChange,
}: PlanEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const drag = useRef<DragState | null>(null);

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
    if (addMode) return;
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

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = toImage(e);
    if (d.kind === 'move') {
      const nx = Math.max(0, Math.min(imgW - d.orig.w, d.orig.x + (x - d.startX)));
      const ny = Math.max(0, Math.min(imgH - d.orig.h, d.orig.y + (y - d.startY)));
      updateRect(d.id, { x: nx, y: ny });
    } else if (d.kind === 'resize') {
      // Corners: 0=NW 1=NE 2=SE 3=SW — opposite corner stays fixed
      const { orig, corner } = d;
      const fixedX = corner === 0 || corner === 3 ? orig.x + orig.w : orig.x;
      const fixedY = corner === 0 || corner === 1 ? orig.y + orig.h : orig.y;
      const cx = Math.max(0, Math.min(imgW, x));
      const cy = Math.max(0, Math.min(imgH, y));
      const nx = Math.min(fixedX, cx);
      const ny = Math.min(fixedY, cy);
      const nw = Math.max(minSize, Math.abs(cx - fixedX));
      const nh = Math.max(minSize, Math.abs(cy - fixedY));
      updateRect(d.id, { x: nx, y: ny, w: nw, h: nh });
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
    if (d?.kind !== 'draw') return;
    // A click without a real drag drops a default one-table rect
    const r = rects.find((rr) => rr.id === d.id);
    if (!r) return;
    if (r.w < minSize || r.h < minSize) {
      const w = TABLE_W * pxPerMeter;
      const h = TABLE_D * pxPerMeter;
      updateRect(d.id, {
        x: Math.max(0, Math.min(imgW - w, d.anchorX - w / 2)),
        y: Math.max(0, Math.min(imgH - h, d.anchorY - h / 2)),
        w,
        h,
      });
    }
  };

  const tablesForRect = (r: VendorRect) =>
    tablesInLength(Math.max(r.w, r.h) / pxPerMeter);

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
          cursor: addMode ? 'crosshair' : 'default',
        }}
        onPointerDown={onPointerDownEmpty}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {rects.map((r) => {
          const isSel = r.id === selected;
          const k = tablesForRect(r);
          const corners: [number, number][] = [
            [r.x, r.y],
            [r.x + r.w, r.y],
            [r.x + r.w, r.y + r.h],
            [r.x, r.y + r.h],
          ];
          return (
            <g key={r.id}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={GOLD}
                fillOpacity={isSel ? 0.4 : 0.22}
                stroke={GOLD}
                strokeWidth={isSel ? ui * 0.35 : ui * 0.2}
                style={{ cursor: addMode ? 'crosshair' : 'move' }}
                onPointerDown={(e) => onPointerDownRect(e, r)}
              />
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
                {k > 1 ? `${k} tables` : '1 table'}
              </text>
              {isSel && !addMode && (
                <>
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
      </svg>

      {/* Mode toggle lives with the canvas so it reads as a tool */}
      <button
        onClick={() => setAddMode((m) => !m)}
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          background: addMode ? GOLD : 'rgba(0,0,0,0.7)',
          color: addMode ? '#1a1614' : '#e8e4dc',
          border: `1px solid ${GOLD}`,
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '13px',
          cursor: 'pointer',
          fontFamily: 'Georgia, serif',
        }}
      >
        {addMode ? '✓ Drawing tables — click to finish' : '+ Add table'}
      </button>
    </div>
  );
}
