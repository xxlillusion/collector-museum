import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Suspense, useState, useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import Room, { ROOM, TRACK_OFFSET } from './Room';
import CardFrame, { FRAME_EXTRA } from './CardFrame';
import GalleryControls, { isTouchDevice } from './GalleryControls';
import MobileControls from './MobileControls';
import HUD from './HUD';
import InspectOverlay from './InspectOverlay';
import type { InspectSale } from './InspectOverlay';
import Table from './Table';
import Binder from './Binder';
import { ShadowRefresh, LoadingOverlay } from './sceneCommon';
import {
  MUSEUM_EXPOSURE,
  MUSEUM_WALL_SPOT,
  MUSEUM_SPOT_LENS_EMISSIVE,
  MUSEUM_ENV_TOP,
  MUSEUM_ENV_SIDE,
  MUSEUM_BLOOM,
  MUSEUM_VIGNETTE,
} from './sceneTuning';
import type { CardWithUrl } from '../lib/useCards';

// Layout constants — gallery style: consistent row height, variable widths
const ROW_CENTERS = [3.15, 1.5]; // hang heights (frame centers)
const MAX_CONTENT_H = 1.25;      // tallest image content allowed
const MAX_CONTENT_W = 2.1;       // widest image content allowed (panoramas)
const FRAME_GAP = 0.45;          // horizontal gap between frame edges
const WALL_MARGIN = 1.2;         // keep-clear zone at wall ends

interface SceneProps {
  cards: CardWithUrl[];
  /** What hangs on the walls (curated order — featured first, manual order,
   *  hidden excluded). Defaults to `cards`; the binder always pages the full
   *  `cards` list, so curation never shrinks the browsable collection. */
  wallCards?: CardWithUrl[];
  /** imageUrl → caption, shown in the inspect overlay (vendor inventory). */
  captions?: Map<string, string>;
  /** imageUrl → details line (card metadata: set · number · year · grade). */
  details?: Map<string, string>;
  /** imageUrl → sale placard (price / condition / sold) — vendor inventory. */
  sales?: Map<string, InspectSale>;
  /** Want-list heart in the inspect overlay (public vendor museums) —
   *  url-keyed because imageUrl is Scene's currency; host maps url → item. */
  want?: { isWanted: (url: string) => boolean; toggle: (url: string) => boolean };
  bannerUrl: string | null;
  onManage: () => void;
  /** Own-collection museums: "✎ add details" in the inspect overlay for
   *  cards with no caption/details yet — host opens that card's metadata
   *  editor (url identifies the card). */
  onAddDetails?: (url: string) => void;
  /** Top-right exit button label — public museums say where "back" leads
   *  (the default reads wrong when the walls aren't the viewer's cards). */
  exitLabel?: string;
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

/** A display wall: packing-axis length, frame yaw, and how the packing
 *  coordinate maps into world space. `mirror` negates the packing coordinate
 *  so reading order stays left-to-right when *facing* the wall. */
interface WallDesc {
  length: number;
  rotY: number;
  mirror: boolean;
  place: (lateral: number, rowY: number) => [number, number, number];
}

/**
 * Greedy row packing: fill each row of each display wall left-to-right with
 * variable-width frames, then center the row. No overlap by construction.
 * Walls fill in order N → S → E → W; the north/south math is identical to
 * the original two-wall layout, so collections that fit there render exactly
 * as before. (Descriptors built per call — ROOM stays lazily accessed.)
 */
function computeLayout(cards: CardWithUrl[]): CardPlacement[] {
  const placements: CardPlacement[] = [];

  const walls: WallDesc[] = [
    { // north, faces into room
      length: ROOM.width, rotY: 0, mirror: false,
      place: (x, rowY) => [x, rowY, -(ROOM.depth / 2) + 0.12],
    },
    { // south — mirror x so cards keep upload order when viewed facing it
      length: ROOM.width, rotY: Math.PI, mirror: true,
      place: (x, rowY) => [x, rowY, (ROOM.depth / 2) - 0.12],
    },
    { // east — facing +x, "right" is +z: reads naturally unmirrored
      length: ROOM.depth, rotY: -Math.PI / 2, mirror: false,
      place: (z, rowY) => [(ROOM.width / 2) - 0.12, rowY, z],
    },
    { // west — facing -x, "right" is -z: mirrored like the south wall
      length: ROOM.depth, rotY: Math.PI / 2, mirror: true,
      place: (z, rowY) => [-(ROOM.width / 2) + 0.12, rowY, z],
    },
  ];

  let idx = 0;

  for (const wall of walls) {
    const usableLength = wall.length - WALL_MARGIN * 2;
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

      // Center the row and lay out left-to-right (mirrored walls negate the
      // packing coordinate so viewing order matches list order).
      let cursor = -rowWidth / 2;
      for (const item of row) {
        const center = cursor + item.frameW / 2;
        const lateral = wall.mirror ? -center : center;
        placements.push({
          position: wall.place(lateral, rowY),
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

/** World-space spot placement: fixture position on the ceiling track,
 *  aim point on the wall, and the fixture head's yaw (= the wall's rotY). */
interface SpotPlacement {
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  yaw: number;
}

/**
 * Warm gallery spotlight on the ceiling track, aimed at the wall.
 * Includes the physical fixture geometry. The head keeps the original
 * north-wall tilt and is yawed toward its wall — yaw π reproduces the old
 * south-wall pose exactly; ±π/2 serve the east/west walls the same way.
 */
function WallSpot({ fx, fz, tx, tz, yaw }: SpotPlacement) {
  const lightRef = useRef<THREE.SpotLight>(null);

  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(tx, 2.3, tz);
    return o;
  }, [tx, tz]);

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
        position={[fx, ROOM.height - 0.18, fz]}
        angle={MUSEUM_WALL_SPOT.angle}
        penumbra={MUSEUM_WALL_SPOT.penumbra}
        intensity={MUSEUM_WALL_SPOT.intensity}
        decay={MUSEUM_WALL_SPOT.decay}
        distance={MUSEUM_WALL_SPOT.distance}
        color={MUSEUM_WALL_SPOT.color}
      />
      {/* Fixture: track head tilted toward the wall */}
      <group position={[fx, ROOM.height - 0.16, fz]} rotation={[0, yaw, 0]}>
        <group rotation={[-0.55, 0, 0]}>
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
              emissiveIntensity={MUSEUM_SPOT_LENS_EMISSIVE}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export default function Scene({ cards, wallCards, captions, details, sales, want, bannerUrl, onManage, onAddDetails, exitLabel }: SceneProps) {
  const [locked, setLocked] = useState(false);
  // What's inspected: an ordered url list (wall order for frame clicks, the
  // full collection for binder clicks) + the current index — ‹ › / arrows
  // page within the list. The current url keys every caption/sale lookup.
  const [inspect, setInspect] = useState<{ list: string[]; index: number } | null>(null);
  const [inspectWanted, setInspectWanted] = useState(false);
  // "open or animating" — Binder owns the phase machine internally
  const [binderOpen, setBinderOpen] = useState(false);
  const [binderPrompt, setBinderPrompt] = useState(false);
  // Bumping this key remounts the Canvas — our recovery path if the GPU
  // driver kills the WebGL context (black canvas, DOM still alive).
  const [glKey, setGlKey] = useState(0);

  // Curated wall order when provided; the binder below keeps the full list.
  const wallSource = wallCards ?? cards;
  const layout = useMemo(() => computeLayout(wallSource), [wallSource]);

  // One spotlight per cluster of nearby frames, per wall. Spots exist only
  // for walls that actually hold frames — a collection that fits on N+S
  // produces the identical light set the two-wall layout did (light-count
  // changes recompile every material in the scene; see CLAUDE.md gotcha 11).
  const spots = useMemo(() => {
    // rotY identifies the wall (exact constants from computeLayout); the
    // cluster axis is the wall's packing axis: x for N/S, z for E/W.
    const byWall = new Map<number, number[]>();
    for (const p of layout) {
      const rotY = p.rotation[1];
      if (!byWall.has(rotY)) byWall.set(rotY, []);
      byWall.get(rotY)!.push(
        rotY === 0 || rotY === Math.PI ? p.position[0] : p.position[2],
      );
    }
    const result: SpotPlacement[] = [];
    // Cap the light count: every spotlight multiplies per-pixel shading cost
    // (twice, since the reflector re-renders the scene). With many cards the
    // 1.5-gap clustering produces one spot per frame — when it exceeds the
    // cap, wash the wall with evenly spaced spots across the span instead.
    const MAX_SPOTS_PER_WALL = 5;
    for (const [rotY, laterals] of byWall) {
      let clusters = clusterXs(laterals);
      if (clusters.length > MAX_SPOTS_PER_WALL) {
        const min = Math.min(...laterals);
        const max = Math.max(...laterals);
        clusters = Array.from(
          { length: MAX_SPOTS_PER_WALL },
          (_, i) => min + ((i + 0.5) * (max - min)) / MAX_SPOTS_PER_WALL,
        );
      }
      for (const u of clusters) {
        // Fixture rides the wall's ceiling track (TRACK_OFFSET into the
        // room); target sits on the true wall plane. Same numbers the
        // original N/S code produced.
        if (rotY === 0) {
          result.push({ fx: u, fz: -ROOM.depth / 2 + TRACK_OFFSET, tx: u, tz: -ROOM.depth / 2, yaw: 0 });
        } else if (rotY === Math.PI) {
          result.push({ fx: u, fz: ROOM.depth / 2 - TRACK_OFFSET, tx: u, tz: ROOM.depth / 2, yaw: Math.PI });
        } else if (rotY === -Math.PI / 2) {
          result.push({ fx: ROOM.width / 2 - TRACK_OFFSET, fz: u, tx: ROOM.width / 2, tz: u, yaw: -Math.PI / 2 });
        } else {
          result.push({ fx: -ROOM.width / 2 + TRACK_OFFSET, fz: u, tx: -ROOM.width / 2, tz: u, yaw: Math.PI / 2 });
        }
      }
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

  // Url lists the overlay pages through: wall clicks page the hang order
  // (the exact array computeLayout consumed, including any overflow that
  // didn't fit on the walls); binder clicks page the full collection.
  const wallUrls = useMemo(() => wallSource.map((c) => c.imageUrl), [wallSource]);
  const binderUrls = useMemo(() => cards.map((c) => c.imageUrl), [cards]);

  const openInspect = (list: string[], url: string) => {
    const index = Math.max(0, list.indexOf(url));
    document.exitPointerLock?.();
    setInspect({ list, index });
    if (want) setInspectWanted(want.isWanted(list[index]));
  };

  const handleFrameClick = (url: string) => openInspect(wallUrls, url);
  const handleBinderInspect = (url: string) => openInspect(binderUrls, url);

  // ‹ › / arrow keys — wraps at both ends (matches the hall).
  const navigateInspect = (dir: -1 | 1) => {
    if (!inspect || inspect.list.length === 0) return;
    const total = inspect.list.length;
    const index = (inspect.index + dir + total) % total;
    setInspect({ list: inspect.list, index });
    if (want) setInspectWanted(want.isWanted(inspect.list[index]));
  };

  // Current inspected url — the key into every caption/details/sale/want map
  const inspectUrl = inspect ? inspect.list[inspect.index] : null;

  const handleCloseInspect = (relock: boolean) => {
    setInspect(null);
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
          toneMappingExposure: MUSEUM_EXPOSURE,
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
            suspended={inspect !== null}
            onOpenRequest={handleBinderOpen}
            onPromptChange={setBinderPrompt}
            onInspect={handleBinderInspect}
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
              onClick={() => handleFrameClick(card.imageUrl)}
            />
          ))}

          {spots.map((spot) => (
            <WallSpot
              key={`${spot.fx.toFixed(2)}|${spot.fz.toFixed(2)}|${spot.yaw.toFixed(2)}`}
              {...spot}
            />
          ))}

          {/* Local environment map (no network) — drives glass glints and
              clearcoat reflections on the frames and floor */}
          <Environment resolution={64} frames={1}>
            <Lightformer
              intensity={MUSEUM_ENV_TOP.intensity}
              rotation-x={Math.PI / 2}
              position={[0, 4, 0]}
              scale={[12, 8, 1]}
              color={MUSEUM_ENV_TOP.color}
            />
            <Lightformer
              intensity={MUSEUM_ENV_SIDE.intensity}
              rotation-y={Math.PI / 2}
              position={[-8, 2, 0]}
              scale={[6, 3, 1]}
              color={MUSEUM_ENV_SIDE.color}
            />
            <Lightformer
              intensity={MUSEUM_ENV_SIDE.intensity}
              rotation-y={-Math.PI / 2}
              position={[8, 2, 0]}
              scale={[6, 3, 1]}
              color={MUSEUM_ENV_SIDE.color}
            />
          </Environment>

          {/* Freeze movement while the overlay is up too — its ←/→ page the
              inspect list and must not strafe the player underneath. */}
          <GalleryControls onLockChange={setLocked} frozen={binderOpen || inspect !== null} />
          <ShadowRefresh trigger={layout} />
        </Suspense>

        {!isTouchDevice && (
          <EffectComposer>
            <Bloom mipmapBlur luminanceThreshold={MUSEUM_BLOOM.luminanceThreshold} intensity={MUSEUM_BLOOM.intensity} />
            <Vignette offset={MUSEUM_VIGNETTE.offset} darkness={MUSEUM_VIGNETTE.darkness} />
          </EffectComposer>
        )}
      </Canvas>

      <LoadingOverlay />
      <HUD
        locked={locked}
        onUpload={onManage}
        {...(exitLabel ? { uploadLabel: exitLabel } : {})}
        binderPrompt={binderPrompt && locked && !binderOpen}
        binderOpen={binderOpen}
        overlayOpen={inspect !== null}
      />
      <MobileControls hidden={binderOpen} />

      {inspectUrl && inspect && (
        <InspectOverlay
          imageUrl={inspectUrl}
          caption={captions?.get(inspectUrl)}
          details={details?.get(inspectUrl)}
          sale={sales?.get(inspectUrl)}
          want={
            want
              ? {
                  wanted: inspectWanted,
                  onToggle: () => setInspectWanted(want.toggle(inspectUrl)),
                }
              : undefined
          }
          nav={{
            index: inspect.index,
            total: inspect.list.length,
            onPrev: () => navigateInspect(-1),
            onNext: () => navigateInspect(1),
          }}
          onAddDetails={
            onAddDetails && !captions?.get(inspectUrl) && !details?.get(inspectUrl)
              ? () => onAddDetails(inspectUrl)
              : undefined
          }
          onClose={handleCloseInspect}
        />
      )}
    </>
  );
}
