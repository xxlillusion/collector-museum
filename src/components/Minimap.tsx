import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

// Minimap = two pieces sharing one marker ref, zero React state per frame:
// a DOM overlay (the plan image + marker div, HUD pattern, outside the
// Canvas) and MinimapTracker (inside the Canvas), whose useFrame writes the
// marker's style.transform directly — same philosophy as mobileInput.

export interface MinimapMapping {
  /** Clamped values from planToLayout — the actual px↔world basis. */
  pxPerMeter: number;
  planW: number;
  planD: number;
  imgW: number;
  imgH: number;
}

// On-screen minimap width, px. One module-level computed const shared by the
// DOM overlay AND MinimapTracker's math so both stay consistent — phones get
// a smaller map so it doesn't dominate a 375px viewport.
const MAP_W = typeof window !== 'undefined' && window.innerWidth < 480 ? 140 : 220;
const MARKER = 12; // marker size, px

/** An assigned booth's center in plan-image UV (0–1) — dots on the minimap. */
export interface BoothMarker {
  u: number;
  v: number;
  vendorId: string;
}

interface MinimapProps {
  planUrl: string;
  mapping: MinimapMapping;
  markerRef: React.RefObject<HTMLDivElement | null>;
  /** Assigned booths; the highlighted vendor's dots glow + carry the name. */
  boothMarkers?: BoothMarker[];
  highlightVendorId?: string | null;
  highlightName?: string | null;
  /** Route planning: starred vendors' dots glow steadily (public show walks). */
  starredVendorIds?: Set<string>;
}

/** Fixed top-right overlay; pointerEvents none so pointer-lock clicks pass. */
export function Minimap({
  planUrl,
  mapping,
  markerRef,
  boothMarkers,
  highlightVendorId,
  highlightName,
  starredVendorIds,
}: MinimapProps) {
  const mapH = MAP_W * (mapping.imgH / mapping.imgW);
  const highlighted = (boothMarkers ?? []).filter((b) => b.vendorId === highlightVendorId);
  // Name label rides the topmost highlighted booth
  const labelAnchor = highlighted.length
    ? highlighted.reduce((a, b) => (b.v < a.v ? b : a))
    : null;
  return (
    <div
      style={{
        position: 'fixed',
        top: '76px', // below the HUD's top-right Floor Plan button
        right: '16px',
        width: `${MAP_W}px`,
        height: `${mapH}px`,
        pointerEvents: 'none',
        zIndex: 10,
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.25)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
      }}
    >
      <img
        src={planUrl}
        alt="Minimap"
        draggable={false}
        style={{ width: '100%', height: '100%', display: 'block', opacity: 0.75 }}
      />
      {/* Assigned booth dots: highlighted (directory pick) pulses, starred
          (route planning) glows steadily, the rest are small gold points */}
      {(boothMarkers ?? []).map((b, i) => {
        const active = b.vendorId === highlightVendorId;
        const starredDot = !active && starredVendorIds?.has(b.vendorId);
        const size = active ? 9 : starredDot ? 7 : 4;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: b.u * MAP_W - size / 2,
              top: b.v * mapH - size / 2,
              width: size,
              height: size,
              borderRadius: '50%',
              background: active || starredDot ? '#ffd75e' : 'rgba(212,175,55,0.85)',
              boxShadow: active
                ? '0 0 8px 2px rgba(255,215,94,0.9)'
                : starredDot
                  ? '0 0 6px 1px rgba(255,215,94,0.75)'
                  : 'none',
              animation: active ? 'minimapPulse 1.2s ease-in-out infinite' : 'none',
            }}
          />
        );
      })}
      {labelAnchor && highlightName && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(Math.max(labelAnchor.u * MAP_W, 34), MAP_W - 34),
            top: Math.max(labelAnchor.v * mapH - 20, 2),
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.8)',
            color: '#ffd75e',
            fontSize: 10,
            fontFamily: "Georgia, 'Times New Roman', serif",
            letterSpacing: '0.06em',
            padding: '2px 7px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            maxWidth: MAP_W - 16,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {highlightName}
        </div>
      )}
      <style>{`@keyframes minimapPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.45); }
      }`}</style>
      {/* Up-pointing red triangle; tracker rotates it by −yaw */}
      <div
        ref={markerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          borderLeft: `${MARKER / 2}px solid transparent`,
          borderRight: `${MARKER / 2}px solid transparent`,
          borderBottom: `${MARKER}px solid #ff2d1a`,
          filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.8))',
          transformOrigin: `${MARKER / 2}px ${MARKER * 0.6}px`,
          willChange: 'transform',
        }}
      />
    </div>
  );
}

interface MinimapTrackerProps {
  mapping: MinimapMapping;
  markerRef: React.RefObject<HTMLDivElement | null>;
}

/** Inside the Canvas: streams camera pose into the DOM marker each frame. */
export function MinimapTracker({ mapping, markerRef }: MinimapTrackerProps) {
  const { camera } = useThree();
  const last = useRef({ u: -1, v: -1, yaw: 999 });

  useFrame(() => {
    const el = markerRef.current;
    if (!el) return;
    const { pxPerMeter, planW, planD, imgW, imgH } = mapping;
    const u = ((camera.position.x + planW / 2) * pxPerMeter) / imgW;
    const v = ((camera.position.z + planD / 2) * pxPerMeter) / imgH;
    // camera.rotation is YXZ (GalleryControls sets it), so .y is the yaw
    const yaw = camera.rotation.y;
    const prev = last.current;
    if (
      Math.abs(u - prev.u) < 1e-4 &&
      Math.abs(v - prev.v) < 1e-4 &&
      Math.abs(yaw - prev.yaw) < 1e-3
    ) {
      return;
    }
    prev.u = u;
    prev.v = v;
    prev.yaw = yaw;
    const mapH = MAP_W * (imgH / imgW);
    const x = u * MAP_W - MARKER / 2;
    const y = v * mapH - MARKER * 0.6;
    // Camera faces (−sin yaw, −cos yaw) in image axes; an up triangle rotated
    // by CSS rotate(r) points (sin r, −cos r) ⇒ r = −yaw
    el.style.transform = `translate(${x}px, ${y}px) rotate(${-yaw}rad)`;
  });

  return null;
}
