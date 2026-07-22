import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Suspense, useState, useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import VendorRoom from './VendorRoom';
import VendorTables from './VendorTables';
import type { VendorDrapeInfo } from './VendorTables';
import VendorHallBinders from './VendorHallBinders';
import type { FetchInventory, InspectPayload } from './VendorHallBinders';
import HallAtmosphere from './HallAtmosphere';
import GalleryControls, { isTouchDevice } from './GalleryControls';
import type { Collider } from './GalleryControls';
import MobileControls from './MobileControls';
import HUD from './HUD';
import InspectOverlay from './InspectOverlay';
import { ShadowRefresh, LoadingOverlay } from './sceneCommon';
import {
  HALL_EXPOSURE,
  HALL_AISLE_SPOT,
  HALL_SPOT_LENS_EMISSIVE,
  HALL_CEILING_PANEL_EMISSIVE,
  HALL_SHADOW_DIRECTIONAL,
  HALL_ENV_TOP,
  HALL_ENV_SIDE,
  HALL_BLOOM,
  HALL_VIGNETTE,
} from './sceneTuning';
import HallDirectory from './HallDirectory';
import type { DirectoryVendor } from './HallDirectory';
import { Minimap, MinimapTracker } from './Minimap';
import type { BoothMarker, MinimapMapping } from './Minimap';
import { TABLE } from './Room';
import { planToLayout } from '../lib/vendorPlan';
import type { VendorPlanMeta, TablePlacement } from '../lib/vendorPlan';
import type { VendorSummary } from '../lib/useVendors';
import type { ResolvedHallSignage } from '../lib/hallSignage';
import type { BoothLayoutConfig } from '../lib/boothLayout';
import { isWanted, toggleWant } from '../lib/interestService';
import { useAuth } from '../lib/auth';

interface VendorSceneProps {
  planMeta: VendorPlanMeta;
  planUrl: string | null;
  bannerUrl: string | null;
  vendorBannerUrls: Map<string, string>;
  vendors: VendorSummary[];
  /** Resolved hall signage (F3) — absent renders the classic defaults.
   *  Hosts call resolveSignage(config, showName, urls). */
  signage?: ResolvedHallSignage;
  /** Inventory reads for the hall binders — threaded as a prop because React
   *  context does not cross the R3F Canvas root (see VendorHallBinders). */
  fetchInventory: FetchInventory;
  /** Route planning (public show walks): starred vendors' booths glow on the
   *  minimap; the directory shows/toggles the star. Absent in sandbox walks. */
  starredVendorIds?: Set<string>;
  onToggleStar?: (vendorId: string) => void;
  /** Public show walks: the inspect overlay names the vendor and links to
   *  /vendor/:id. Absent/false (sandbox — no public pages), no vendor line. */
  linkVendors?: boolean;
  onBack: () => void;
  /** Top-right exit button label — public show walks say "Leave Show"
   *  instead of the editor's "Floor Plan". */
  exitLabel?: string;
}

const PLAYER_HEIGHT = 1.7;
const WALL_MARGIN = 0.6;
const TABLE_PAD = 0.35; // collision inflation, matches the museum feel

/** Warm aisle spotlight with its physical fixture, hung from the hall ceiling. */
function AisleSpot({ x, z, height }: { x: number; z: number; height: number }) {
  const lightRef = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(x, 0, z);
    return o;
  }, [x, z]);

  useEffect(() => {
    if (lightRef.current) lightRef.current.target = target;
  }, [target]);

  return (
    <group>
      <primitive object={target} />
      <spotLight
        ref={lightRef}
        position={[x, height - 0.2, z]}
        angle={HALL_AISLE_SPOT.angle}
        penumbra={HALL_AISLE_SPOT.penumbra}
        intensity={HALL_AISLE_SPOT.intensity}
        decay={HALL_AISLE_SPOT.decay}
        distance={height * HALL_AISLE_SPOT.distanceFactor}
        color={HALL_AISLE_SPOT.color}
      />
      <mesh position={[x, height - 0.16, z]}>
        <cylinderGeometry args={[0.07, 0.09, 0.28, 16]} />
        <meshStandardMaterial color="#111111" roughness={0.35} metalness={0.85} />
      </mesh>
      <mesh position={[x, height - 0.31, z]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.065, 16]} />
        <meshStandardMaterial
          color="#fff3dd"
          emissive="#ffdfa8"
          emissiveIntensity={HALL_SPOT_LENS_EMISSIVE}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Grid of emissive ceiling panels — visual density via bloom, zero light cost. */
function CeilingPanels({ width, depth, height }: { width: number; depth: number; height: number }) {
  const panels = useMemo(() => {
    const out: [number, number][] = [];
    const pitch = 6;
    const nx = Math.max(1, Math.floor(width / pitch));
    const nz = Math.max(1, Math.floor(depth / pitch));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        out.push([
          (i + 0.5) * (width / nx) - width / 2,
          (j + 0.5) * (depth / nz) - depth / 2,
        ]);
      }
    }
    return out;
  }, [width, depth]);

  return (
    <group>
      {panels.map(([x, z], i) => (
        <mesh key={i} position={[x, height - 0.02, z]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.8, 0.6]} />
          <meshStandardMaterial
            color="#f5efe2"
            emissive="#f0e6cf"
            emissiveIntensity={HALL_CEILING_PANEL_EMISSIVE}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Up to 6 warm spots gridded over the hall (forward-renderer light budget). */
function computeSpotGrid(width: number, depth: number): [number, number][] {
  const pitch = 8;
  let nx = Math.max(1, Math.round(width / pitch));
  let nz = Math.max(1, Math.round(depth / pitch));
  while (nx * nz > 6) {
    if (nx >= nz) nx--;
    else nz--;
  }
  const out: [number, number][] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      out.push([
        (i + 0.5) * (width / nx) - width / 2,
        (j + 0.5) * (depth / nz) - depth / 2,
      ]);
    }
  }
  return out;
}

function tableColliders(tables: TablePlacement[]): Collider[] {
  return tables.map((t) => {
    // Half-extents follow the per-table stretch-to-fit scale
    const halfL = ((t.sx ?? 1) * TABLE.topW) / 2 + TABLE_PAD;
    const halfS = ((t.sz ?? 1) * TABLE.topD) / 2 + TABLE_PAD;
    const [x, , z] = t.position;
    // Multiples of π/2 stay axis-aligned AABBs (the pre-rotation behavior);
    // anything else gets a rotated box resolved in its local frame.
    const quarterTurns = t.rotationY / (Math.PI / 2);
    if (Math.abs(quarterTurns - Math.round(quarterTurns)) > 1e-6) {
      return { cx: x, cz: z, hx: halfL, hz: halfS, rotY: t.rotationY };
    }
    // rotationY of 0/π keeps the long axis on X; ±π/2 puts it on Z
    const alongX = Math.abs(Math.sin(t.rotationY)) < 0.5;
    return alongX
      ? { minX: x - halfL, maxX: x + halfL, minZ: z - halfS, maxZ: z + halfS }
      : { minX: x - halfS, maxX: x + halfS, minZ: z - halfL, maxZ: z + halfL };
  });
}

export default function VendorScene({ planMeta, planUrl, bannerUrl, vendorBannerUrls, vendors, signage, fetchInventory, starredVendorIds, onToggleStar, linkVendors, onBack, exitLabel }: VendorSceneProps) {
  const [locked, setLocked] = useState(false);
  const [binderOpen, setBinderOpen] = useState(false);
  const [binderPrompt, setBinderPrompt] = useState(false);
  // The open binder's full slice + current index (see InspectPayload) —
  // ‹ › / arrows page `items` without another inventory read. The want
  // heart is separate state, recomputed per shown item.
  const [inspect, setInspect] = useState<InspectPayload | null>(null);
  const [inspectWanted, setInspectWanted] = useState(false);
  // Vendor directory overlay — opening unlocks the pointer + freezes controls
  // (the binder-open pattern); selecting a vendor lights their booth dots.
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [highlightVendorId, setHighlightVendorId] = useState<string | null>(null);
  // Want-list hearts sync to the cloud for signed-in users (local otherwise).
  // VendorScene itself is DOM — only the Canvas subtree can't read context.
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // Bumping this key remounts the Canvas — our recovery path if the GPU
  // driver kills the WebGL context (black canvas, DOM still alive).
  const [glKey, setGlKey] = useState(0);

  const { hall, tables, pxPerMeter, planW, planD } = useMemo(
    () => planToLayout(planMeta),
    [planMeta],
  );

  const vendorDrapes = useMemo(() => {
    const map = new Map<string, VendorDrapeInfo>();
    for (const v of vendors) map.set(v.id, { name: v.name, bannerUrl: v.bannerUrl });
    return map;
  }, [vendors]);
  // Binder poses and the open binder's slice must agree on this count —
  // binderCount excludes walls-only items (F2); pre-0008 summaries fall back
  // to the total and behave exactly as before.
  const inventoryCounts = useMemo(
    () => new Map(vendors.map((v) => [v.id, v.binderCount ?? v.inventoryCount])),
    [vendors],
  );
  // Per-store booth layout defaults (F4) — absent vendors render the classic
  // arrangement (VendorHallBinders treats a missing entry as defaults).
  const boothLayouts = useMemo(() => {
    const map = new Map<string, BoothLayoutConfig>();
    for (const v of vendors) if (v.boothLayout) map.set(v.id, v.boothLayout);
    return map;
  }, [vendors]);

  // Assigned booth centers in plan-image UV (dangling vendor ids skipped) +
  // the directory list derived from the same rects.
  const boothMarkers = useMemo<BoothMarker[]>(() => {
    const nameById = new Map(vendors.map((v) => [v.id, v.name]));
    return planMeta.rects
      .filter((r) => r.vendorId && nameById.has(r.vendorId))
      .map((r) => ({
        u: (r.x + r.w / 2) / planMeta.imgW,
        v: (r.y + r.h / 2) / planMeta.imgH,
        vendorId: r.vendorId!,
        name: nameById.get(r.vendorId!),
      }));
  }, [planMeta.rects, planMeta.imgW, planMeta.imgH, vendors]);

  const directoryVendors = useMemo<DirectoryVendor[]>(() => {
    const boothCounts = new Map<string, number>();
    for (const m of boothMarkers) {
      boothCounts.set(m.vendorId, (boothCounts.get(m.vendorId) ?? 0) + 1);
    }
    return vendors
      .filter((v) => boothCounts.has(v.id))
      .map((v) => ({
        id: v.id,
        name: v.name,
        boothCount: boothCounts.get(v.id)!,
        // What's actually browsable in-hall (binder-eligible when known).
        inventoryCount: v.binderCount ?? v.inventoryCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [vendors, boothMarkers]);

  const highlightName = highlightVendorId
    ? vendors.find((v) => v.id === highlightVendorId)?.name ?? null
    : null;
  const colliders = useMemo(() => tableColliders(tables), [tables]);
  const spots = useMemo(() => computeSpotGrid(hall.width, hall.depth), [hall.width, hall.depth]);

  // Spawn at the user's start marker when set, else near the south wall —
  // either way nudged off any table that happens to be there
  const spawn = useMemo<[number, number, number]>(() => {
    // Rotated boxes use their circumscribed AABB — conservative is fine here
    const inside = (xx: number, zz: number) =>
      colliders.some((b) => {
        if ('rotY' in b) {
          const r = Math.hypot(b.hx, b.hz);
          return Math.abs(xx - b.cx) < r && Math.abs(zz - b.cz) < r;
        }
        return xx > b.minX && xx < b.maxX && zz > b.minZ && zz < b.maxZ;
      });
    let x = 0;
    let z = hall.depth / 2 - 2;
    if (planMeta.startPx) {
      const clampX = hall.width / 2 - WALL_MARGIN;
      const clampZ = hall.depth / 2 - WALL_MARGIN;
      x = Math.max(-clampX, Math.min(clampX, planMeta.startPx.x / pxPerMeter - planW / 2));
      z = Math.max(-clampZ, Math.min(clampZ, planMeta.startPx.y / pxPerMeter - planD / 2));
    }
    let guard = 0;
    while (inside(x, z) && guard++ < 50) z -= 1;
    return [x, PLAYER_HEIGHT, z];
  }, [hall.width, hall.depth, colliders, planMeta.startPx, pxPerMeter, planW, planD]);

  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapMarkerRef = useRef<HTMLDivElement | null>(null);
  const minimapMapping = useMemo<MinimapMapping>(
    () => ({ pxPerMeter, planW, planD, imgW: planMeta.imgW, imgH: planMeta.imgH }),
    [pxPerMeter, planW, planD, planMeta.imgW, planMeta.imgH],
  );

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

  const openDirectory = () => {
    document.exitPointerLock?.();
    setDirectoryOpen(true);
  };

  const closeDirectory = (relock: boolean) => {
    setDirectoryOpen(false);
    if (relock) setTimeout(tryLock, 150);
  };

  // M toggles the directory; Esc closes it (browser Esc already exits pointer
  // lock, so this only matters while the panel is up and the pointer is free).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (binderOpen || inspect) return;
      if (e.code === 'KeyM') {
        if (directoryOpen) closeDirectory(true);
        else openDirectory();
      } else if (e.code === 'Escape' && directoryOpen) {
        closeDirectory(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binderOpen, inspect, directoryOpen]);

  const handleInspect = (payload: InspectPayload) => {
    document.exitPointerLock?.();
    setInspect(payload);
    const item = payload.items[payload.index];
    setInspectWanted(item?.itemId ? isWanted(item.itemId) : false);
  };

  // ‹ › / arrow keys — wraps at both ends (matches the museum).
  const navigateInspect = (dir: -1 | 1) => {
    if (!inspect || inspect.items.length === 0) return;
    const total = inspect.items.length;
    const index = (inspect.index + dir + total) % total;
    setInspect({ ...inspect, index });
    const item = inspect.items[index];
    setInspectWanted(item?.itemId ? isWanted(item.itemId) : false);
  };

  // The currently shown item + its vendor line (public walks link the name)
  const inspectItem = inspect ? inspect.items[inspect.index] : null;
  const inspectVendor = useMemo(() => {
    if (!linkVendors || !inspect) return undefined;
    const name = vendors.find((v) => v.id === inspect.vendorId)?.name;
    return name ? { name, href: `/vendor/${inspect.vendorId}` } : undefined;
  }, [linkVendors, inspect, vendors]);

  const handleToggleWant = () => {
    const itemId = inspectItem?.itemId;
    if (!itemId) return;
    // Toggle OUTSIDE the state updater — updaters must stay pure (StrictMode
    // double-invokes them, which would flip the want right back off).
    setInspectWanted(toggleWant(userId, itemId));
  };

  const handleCloseInspect = (relock: boolean) => {
    setInspect(null);
    // Same rules as the museum: relock only on click-close, never while the
    // binder is still up (its no-lock enforcement would fight it)
    if (relock && !binderOpen) {
      setTimeout(tryLock, 150);
    }
  };

  const handleBinderClosed = (relock: boolean) => {
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
        camera={{ fov: 72, near: 0.1, far: 150 }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: HALL_EXPOSURE,
        }}
        style={{ width: '100vw', height: '100vh', background: '#0d0b0a' }}
        // A canvas click while the directory is up dismisses it (and relocks)
        onPointerMissed={() => (directoryOpen ? closeDirectory(true) : tryLock())}
        // Keep this block in sync with Scene.tsx — it encodes CLAUDE.md
        // gotchas 3 & 8 (crosshair raycast compute, deferred events.connect,
        // context-loss remount). Deliberately duplicated, not shared.
        onCreated={(state) => {
          glCanvasRef.current = state.gl.domElement;
          (window as unknown as Record<string, unknown>).__R3F = state;

          // Static scene → shadows on demand
          state.gl.shadowMap.autoUpdate = false;
          state.gl.shadowMap.needsUpdate = true;

          // R3F v9 + StrictMode can leave the event system disconnected after
          // the double-mount. Defer one tick, then connect explicitly and
          // install our compute.
          setTimeout(() => {
            const target = state.gl.domElement.parentElement ?? state.gl.domElement;
            state.events.connect?.(target);
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
          <VendorRoom width={hall.width} depth={hall.depth} height={hall.height} />
          <VendorTables
            tables={tables}
            bannerUrl={bannerUrl}
            vendorBannerUrls={vendorBannerUrls}
            vendors={vendorDrapes}
          />
          <VendorHallBinders
            tables={tables}
            inventoryCounts={inventoryCounts}
            boothLayouts={boothLayouts}
            fetchInventory={fetchInventory}
            suspended={!!inspect || directoryOpen}
            onPromptChange={setBinderPrompt}
            onOpenChange={setBinderOpen}
            onInspect={handleInspect}
            onClosed={handleBinderClosed}
          />
          <HallAtmosphere
            width={hall.width}
            depth={hall.depth}
            height={hall.height}
            tables={tables}
            signage={signage}
          />

          {/* One shadow-casting light for the whole hall — skylight banks.
              Per-table shadow spots are a non-starter at this scale. */}
          <directionalLight
            position={[hall.width * 0.25, hall.height * 2.2, hall.depth * 0.2]}
            intensity={HALL_SHADOW_DIRECTIONAL.intensity}
            color={HALL_SHADOW_DIRECTIONAL.color}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-radius={4}
            shadow-bias={-0.0004}
            shadow-camera-left={-hall.width / 2 - 1}
            shadow-camera-right={hall.width / 2 + 1}
            shadow-camera-top={hall.depth / 2 + 1}
            shadow-camera-bottom={-hall.depth / 2 - 1}
            shadow-camera-near={1}
            shadow-camera-far={hall.height * 4}
          />

          {spots.map(([x, z], i) => (
            <AisleSpot key={i} x={x} z={z} height={hall.height} />
          ))}
          <CeilingPanels width={hall.width} depth={hall.depth} height={hall.height} />

          {/* Local environment map (no network) — drives floor reflections */}
          <Environment resolution={64} frames={1}>
            <Lightformer
              intensity={HALL_ENV_TOP.intensity}
              rotation-x={Math.PI / 2}
              position={[0, 5, 0]}
              scale={[16, 10, 1]}
              color={HALL_ENV_TOP.color}
            />
            <Lightformer
              intensity={HALL_ENV_SIDE.intensity}
              rotation-y={Math.PI / 2}
              position={[-10, 2, 0]}
              scale={[8, 3, 1]}
              color={HALL_ENV_SIDE.color}
            />
            <Lightformer
              intensity={HALL_ENV_SIDE.intensity}
              rotation-y={-Math.PI / 2}
              position={[10, 2, 0]}
              scale={[8, 3, 1]}
              color={HALL_ENV_SIDE.color}
            />
          </Environment>

          {/* Frozen while the overlay is up too — its ←/→ page the inspect
              list and must not strafe the player underneath. */}
          <GalleryControls
            onLockChange={setLocked}
            frozen={binderOpen || directoryOpen || inspect !== null}
            bounds={{ halfW: hall.width / 2 - WALL_MARGIN, halfD: hall.depth / 2 - WALL_MARGIN }}
            colliders={colliders}
            initialPosition={spawn}
          />
          <ShadowRefresh trigger={tables} />
          <MinimapTracker mapping={minimapMapping} markerRef={minimapMarkerRef} />
        </Suspense>

        {!isTouchDevice && (
          <EffectComposer>
            <Bloom mipmapBlur luminanceThreshold={HALL_BLOOM.luminanceThreshold} intensity={HALL_BLOOM.intensity} />
            <Vignette offset={HALL_VIGNETTE.offset} darkness={HALL_VIGNETTE.darkness} />
          </EffectComposer>
        )}
      </Canvas>

      <LoadingOverlay label="SETTING UP THE SHOW…" />
      {planUrl && !binderOpen && (
        <Minimap
          planUrl={planUrl}
          mapping={minimapMapping}
          markerRef={minimapMarkerRef}
          boothMarkers={boothMarkers}
          highlightVendorId={highlightVendorId}
          highlightName={highlightName}
          starredVendorIds={starredVendorIds}
        />
      )}
      <HUD
        locked={locked}
        onUpload={onBack}
        // Touch never pointer-locks — the gaze scan still runs, so surface
        // the tap prompt whenever a binder is in front of the camera.
        binderPrompt={binderPrompt && (locked || isTouchDevice) && !binderOpen && !directoryOpen}
        binderOpen={binderOpen}
        overlayOpen={inspect !== null}
        uploadLabel={exitLabel ?? '🗺 Floor Plan'}
        onDirectory={directoryOpen ? undefined : openDirectory}
      />
      {directoryOpen && !binderOpen && (
        <HallDirectory
          vendors={directoryVendors}
          highlightId={highlightVendorId}
          onHighlight={setHighlightVendorId}
          starredIds={starredVendorIds}
          onToggleStar={onToggleStar}
          onClose={() => closeDirectory(true)}
        />
      )}
      <MobileControls hidden={binderOpen || directoryOpen} />

      {inspect && inspectItem && (
        <InspectOverlay
          imageUrl={inspectItem.url}
          caption={inspectItem.caption}
          sale={inspectItem.sale}
          want={
            inspectItem.itemId !== undefined
              ? { wanted: inspectWanted, onToggle: handleToggleWant }
              : undefined
          }
          nav={{
            index: inspect.index,
            total: inspect.items.length,
            onPrev: () => navigateInspect(-1),
            onNext: () => navigateInspect(1),
          }}
          vendor={inspectVendor}
          onClose={handleCloseInspect}
        />
      )}
    </>
  );
}
