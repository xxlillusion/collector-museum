import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, useProgress } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Suspense, useState, useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import Room, { ROOM, TRACK_OFFSET } from './Room';
import CardFrame, { FRAME_EXTRA } from './CardFrame';
import GalleryControls, { isTouchDevice } from './GalleryControls';
import MobileControls from './MobileControls';
import HUD from './HUD';
import InspectOverlay from './InspectOverlay';
import Table from './Table';
import Binder from './Binder';
import type { CardWithUrl } from '../lib/useCards';

// Layout constants — gallery style: consistent row height, variable widths
const ROW_CENTERS = [3.15, 1.5]; // hang heights (frame centers)
const MAX_CONTENT_H = 1.25;      // tallest image content allowed
const MAX_CONTENT_W = 2.1;       // widest image content allowed (panoramas)
const FRAME_GAP = 0.45;          // horizontal gap between frame edges
const WALL_MARGIN = 1.2;         // keep-clear zone at wall ends

interface SceneProps {
  cards: CardWithUrl[];
  bannerUrl: string | null;
  onManage: () => void;
}

interface CardPlacement {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;   // image content width
  height: number;  // image content height
  card: CardWithUrl;
}

/** Scale an image to fit the row: fixed target height, capped width. */
function sizeFor(aspect: number): { w: number; h: number } {
  let h = MAX_CONTENT_H;
  let w = h * aspect;
  if (w > MAX_CONTENT_W) {
    w = MAX_CONTENT_W;
    h = w / aspect;
  }
  return { w, h };
}

/**
 * Greedy row packing: fill each row of each display wall left-to-right with
 * variable-width frames, then center the row. No overlap by construction.
 */
function computeLayout(cards: CardWithUrl[]): CardPlacement[] {
  const placements: CardPlacement[] = [];
  const usableLength = ROOM.width - WALL_MARGIN * 2;

  const walls = [
    { z: -(ROOM.depth / 2) + 0.12, rotY: 0 },       // north, faces into room
    { z: (ROOM.depth / 2) - 0.12, rotY: Math.PI },  // south, faces into room
  ];

  let idx = 0;

  for (const wall of walls) {
    for (const rowY of ROW_CENTERS) {
      if (idx >= cards.length) return placements;

      // Collect cards that fit in this row
      const row: { card: CardWithUrl; w: number; h: number; frameW: number }[] = [];
      let rowWidth = 0;
      while (idx < cards.length) {
        const { w, h } = sizeFor(cards[idx].aspect);
        const frameW = w + FRAME_EXTRA;
        const nextWidth = rowWidth + (row.length > 0 ? FRAME_GAP : 0) + frameW;
        if (nextWidth > usableLength && row.length > 0) break;
        row.push({ card: cards[idx], w, h, frameW });
        rowWidth = nextWidth;
        idx++;
      }

      // Center the row and lay out left-to-right.
      // Mirror x on the south wall so cards keep upload order when viewed.
      let cursor = -rowWidth / 2;
      for (const item of row) {
        const xCenter = cursor + item.frameW / 2;
        const x = wall.rotY === 0 ? xCenter : -xCenter;
        placements.push({
          position: [x, rowY, wall.z],
          rotation: [0, wall.rotY, 0],
          width: item.w,
          height: item.h,
          card: item.card,
        });
        cursor += item.frameW + FRAME_GAP;
      }
    }
  }

  return placements;
}

/** Merge nearby card x-positions so each cluster shares one spotlight. */
function clusterXs(xs: number[], minGap = 1.5): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const x of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && x - last[last.length - 1] < minGap) last.push(x);
    else clusters.push([x]);
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
}

/**
 * Warm gallery spotlight on the ceiling track, aimed at the wall.
 * Includes the physical fixture geometry.
 */
function WallSpot({ x, wallZ }: { x: number; wallZ: number }) {
  const lightRef = useRef<THREE.SpotLight>(null);
  const dir = wallZ < 0 ? 1 : -1; // direction into the room
  const fixtureZ = wallZ + dir * TRACK_OFFSET;

  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(x, 2.3, wallZ);
    return o;
  }, [x, wallZ]);

  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.target = target;
    }
  }, [target]);

  return (
    <group>
      <primitive object={target} />
      <spotLight
        ref={lightRef}
        position={[x, ROOM.height - 0.18, fixtureZ]}
        angle={0.7}
        penumbra={0.85}
        intensity={60}
        decay={2}
        distance={11}
        color="#ffe6bd"
      />
      {/* Fixture: track head tilted toward the wall */}
      <group position={[x, ROOM.height - 0.16, fixtureZ]} rotation={[dir * -0.55, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.055, 0.07, 0.22, 16]} />
          <meshStandardMaterial color="#111111" roughness={0.35} metalness={0.85} />
        </mesh>
        {/* Emissive lens */}
        <mesh position={[0, -0.115, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.05, 16]} />
          <meshStandardMaterial
            color="#fff3dd"
            emissive="#ffdfa8"
            emissiveIntensity={6}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Shadow maps are rendered on demand (gl.shadowMap.autoUpdate = false in
 * onCreated) since the room is static — this saves a full shadow render pass
 * every frame. Re-render shadows for a while whenever `trigger` changes
 * (layout/textures streaming in); the binder requests its own updates while
 * it animates.
 */
function ShadowRefresh({ trigger }: { trigger: unknown }) {
  const { gl } = useThree();
  const frames = useRef(0);
  useEffect(() => {
    frames.current = 0;
  }, [trigger]);
  useFrame(() => {
    if (frames.current < 120) {
      gl.shadowMap.needsUpdate = true;
      frames.current++;
    }
  });
  return null;
}

/** DOM overlay shown while textures stream in (useProgress is a global store). */
function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0d0b0a',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      letterSpacing: '0.1em',
      zIndex: 50,
      gap: '12px',
    }}>
      <div style={{ fontSize: '15px' }}>LIGHTING THE GALLERY…</div>
      <div style={{ fontSize: '12px', color: '#8a7a55' }}>{Math.round(progress)}%</div>
    </div>
  );
}

export default function Scene({ cards, bannerUrl, onManage }: SceneProps) {
  const [locked, setLocked] = useState(false);
  const [inspectUrl, setInspectUrl] = useState<string | null>(null);
  // "open or animating" — Binder owns the phase machine internally
  const [binderOpen, setBinderOpen] = useState(false);
  const [binderPrompt, setBinderPrompt] = useState(false);
  // Bumping this key remounts the Canvas — our recovery path if the GPU
  // driver kills the WebGL context (black canvas, DOM still alive).
  const [glKey, setGlKey] = useState(0);

  const layout = useMemo(() => computeLayout(cards), [cards]);

  // One spotlight per cluster of nearby frames, per wall
  const spots = useMemo(() => {
    const byWall = new Map<number, number[]>();
    for (const p of layout) {
      const wallZ = p.position[2] < 0 ? -ROOM.depth / 2 : ROOM.depth / 2;
      if (!byWall.has(wallZ)) byWall.set(wallZ, []);
      byWall.get(wallZ)!.push(p.position[0]);
    }
    const result: { x: number; wallZ: number }[] = [];
    // Cap the light count: every spotlight multiplies per-pixel shading cost
    // (twice, since the reflector re-renders the scene). With many cards the
    // 1.5-gap clustering produces one spot per frame — when it exceeds the
    // cap, wash the wall with evenly spaced spots across the span instead.
    const MAX_SPOTS_PER_WALL = 5;
    for (const [wallZ, xs] of byWall) {
      let clusters = clusterXs(xs);
      if (clusters.length > MAX_SPOTS_PER_WALL) {
        const min = Math.min(...xs);
        const max = Math.max(...xs);
        clusters = Array.from(
          { length: MAX_SPOTS_PER_WALL },
          (_, i) => min + ((i + 0.5) * (max - min)) / MAX_SPOTS_PER_WALL,
        );
      }
      for (const x of clusters) result.push({ x, wallZ });
    }
    return result;
  }, [layout]);

  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Best-effort pointer lock. Guards: canvas may be unmounted (view switch)
  // or replaced (context-loss remount); browsers may reject the request
  // (Chrome's cooldown after exiting lock) — then the next click-on-empty-
  // space simply tries again.
  const tryLock = () => {
    if (isTouchDevice) return;
    try {
      const el = glCanvasRef.current;
      if (!el || !el.isConnected) return;
      const result = el.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => {});
    } catch {
      // ignore — user can click again
    }
  };

  const handleCardClick = (url: string) => {
    document.exitPointerLock?.();
    setInspectUrl(url);
  };

  const handleCloseInspect = (relock: boolean) => {
    setInspectUrl(null);
    // Re-enter walk mode only when closed by click (Escape universally means
    // "release"). Delayed so the overlay's no-lock-while-open enforcement has
    // unmounted first. Never relock while the binder is still up — its own
    // no-lock enforcement would fight it, and the user returns to the binder.
    if (relock && !binderOpen) {
      setTimeout(tryLock, 150);
    }
  };

  const handleBinderOpen = () => {
    document.exitPointerLock?.();
    setBinderOpen(true);
  };

  const handleBinderClosed = (relock: boolean) => {
    setBinderOpen(false);
    if (relock) {
      setTimeout(tryLock, 150);
    }
  };

  return (
    <>
      <Canvas
        key={glKey}
        shadows={{ enabled: true, type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        camera={{ fov: 72, near: 0.1, far: 100 }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
        }}
        style={{ width: '100vw', height: '100vh', background: '#0d0b0a' }}
        onPointerMissed={() => tryLock()}
        onCreated={(state) => {
          glCanvasRef.current = state.gl.domElement;
          (window as unknown as Record<string, unknown>).__R3F = state;

          // Static scene → shadows on demand (ShadowRefresh / Binder set
          // needsUpdate when something actually moves)
          state.gl.shadowMap.autoUpdate = false;
          state.gl.shadowMap.needsUpdate = true;

          // R3F v9 + StrictMode can leave the event system disconnected after
          // the double-mount (no pointer listeners on the DOM at all), and the
          // Canvas config overwrites events set during onCreated. Defer one
          // tick, then connect explicitly and install our compute.
          setTimeout(() => {
            const target = state.gl.domElement.parentElement ?? state.gl.domElement;
            state.events.connect?.(target);
            // When the pointer is locked, raycast from the crosshair (screen
            // center) instead of the frozen mouse position.
            state.setEvents({
              compute: (event, st) => {
                if (document.pointerLockElement) {
                  st.pointer.set(0, 0);
                } else {
                  st.pointer.set(
                    (event.offsetX / st.size.width) * 2 - 1,
                    -(event.offsetY / st.size.height) * 2 + 1,
                  );
                }
                st.raycaster.setFromCamera(st.pointer, st.camera);
              },
            });
          }, 0);

          // Auto-recover from GPU context loss (driver resets, TDR, etc.)
          state.gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('WebGL context lost — remounting canvas to recover');
            setTimeout(() => setGlKey((k) => k + 1), 400);
          });
        }}
      >
        <color attach="background" args={['#0d0b0a']} />

        <Suspense fallback={null}>
          <Room />

          <Table bannerUrl={bannerUrl} />
          <Binder
            cards={cards}
            open={binderOpen}
            suspended={!!inspectUrl}
            onOpenRequest={handleBinderOpen}
            onPromptChange={setBinderPrompt}
            onInspect={handleCardClick}
            onClosed={handleBinderClosed}
          />

          {layout.map(({ position, rotation, width, height, card }) => (
            <CardFrame
              key={card.id}
              position={position}
              rotation={rotation}
              width={width}
              height={height}
              imageUrl={card.imageUrl}
              onClick={() => handleCardClick(card.imageUrl)}
            />
          ))}

          {spots.map(({ x, wallZ }) => (
            <WallSpot key={`${x.toFixed(2)}|${wallZ}`} x={x} wallZ={wallZ} />
          ))}

          {/* Local environment map (no network) — drives glass glints and
              clearcoat reflections on the frames and floor */}
          <Environment resolution={64} frames={1}>
            <Lightformer
              intensity={1.4}
              rotation-x={Math.PI / 2}
              position={[0, 4, 0]}
              scale={[12, 8, 1]}
              color="#fff2dc"
            />
            <Lightformer
              intensity={0.5}
              rotation-y={Math.PI / 2}
              position={[-8, 2, 0]}
              scale={[6, 3, 1]}
              color="#e8dfd0"
            />
            <Lightformer
              intensity={0.5}
              rotation-y={-Math.PI / 2}
              position={[8, 2, 0]}
              scale={[6, 3, 1]}
              color="#e8dfd0"
            />
          </Environment>

          <GalleryControls onLockChange={setLocked} frozen={binderOpen} />
          <ShadowRefresh trigger={cards} />
        </Suspense>

        {!isTouchDevice && (
          <EffectComposer>
            <Bloom mipmapBlur luminanceThreshold={1.2} intensity={0.35} />
            <Vignette offset={0.18} darkness={0.55} />
          </EffectComposer>
        )}
      </Canvas>

      <LoadingOverlay />
      <HUD
        locked={locked}
        onUpload={onManage}
        binderPrompt={binderPrompt && locked && !binderOpen}
        binderOpen={binderOpen}
      />
      <MobileControls hidden={binderOpen} />

      {inspectUrl && (
        <InspectOverlay imageUrl={inspectUrl} onClose={handleCloseInspect} />
      )}
    </>
  );
}
