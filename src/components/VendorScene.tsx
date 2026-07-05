import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Suspense, useState, useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import VendorRoom from './VendorRoom';
import VendorTables from './VendorTables';
import GalleryControls, { isTouchDevice } from './GalleryControls';
import type { Collider } from './GalleryControls';
import MobileControls from './MobileControls';
import HUD from './HUD';
import { ShadowRefresh, LoadingOverlay } from './sceneCommon';
import { Minimap, MinimapTracker } from './Minimap';
import type { MinimapMapping } from './Minimap';
import { TABLE } from './Room';
import { planToLayout } from '../lib/vendorPlan';
import type { VendorPlanMeta, TablePlacement } from '../lib/vendorPlan';

interface VendorSceneProps {
  planMeta: VendorPlanMeta;
  planUrl: string | null;
  bannerUrl: string | null;
  vendorBannerUrls: Map<string, string>;
  onBack: () => void;
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
        angle={0.95}
        penumbra={1}
        intensity={55}
        decay={2}
        distance={height * 2.6}
        color="#ffe6bd"
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
          emissiveIntensity={6}
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
            emissiveIntensity={2.2}
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

export default function VendorScene({ planMeta, planUrl, bannerUrl, vendorBannerUrls, onBack }: VendorSceneProps) {
  const [locked, setLocked] = useState(false);
  // Bumping this key remounts the Canvas — our recovery path if the GPU
  // driver kills the WebGL context (black canvas, DOM still alive).
  const [glKey, setGlKey] = useState(0);

  const { hall, tables, pxPerMeter, planW, planD } = useMemo(
    () => planToLayout(planMeta),
    [planMeta],
  );
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
          toneMappingExposure: 1.15,
        }}
        style={{ width: '100vw', height: '100vh', background: '#0d0b0a' }}
        onPointerMissed={() => tryLock()}
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
          <VendorTables tables={tables} bannerUrl={bannerUrl} vendorBannerUrls={vendorBannerUrls} />

          {/* One shadow-casting light for the whole hall — skylight banks.
              Per-table shadow spots are a non-starter at this scale. */}
          <directionalLight
            position={[hall.width * 0.25, hall.height * 2.2, hall.depth * 0.2]}
            intensity={1.1}
            color="#fff4e0"
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
              intensity={1.2}
              rotation-x={Math.PI / 2}
              position={[0, 5, 0]}
              scale={[16, 10, 1]}
              color="#fff2dc"
            />
            <Lightformer
              intensity={0.4}
              rotation-y={Math.PI / 2}
              position={[-10, 2, 0]}
              scale={[8, 3, 1]}
              color="#e8dfd0"
            />
            <Lightformer
              intensity={0.4}
              rotation-y={-Math.PI / 2}
              position={[10, 2, 0]}
              scale={[8, 3, 1]}
              color="#e8dfd0"
            />
          </Environment>

          <GalleryControls
            onLockChange={setLocked}
            frozen={false}
            bounds={{ halfW: hall.width / 2 - WALL_MARGIN, halfD: hall.depth / 2 - WALL_MARGIN }}
            colliders={colliders}
            initialPosition={spawn}
          />
          <ShadowRefresh trigger={tables} />
          <MinimapTracker mapping={minimapMapping} markerRef={minimapMarkerRef} />
        </Suspense>

        {!isTouchDevice && (
          <EffectComposer>
            <Bloom mipmapBlur luminanceThreshold={1.2} intensity={0.35} />
            <Vignette offset={0.18} darkness={0.55} />
          </EffectComposer>
        )}
      </Canvas>

      <LoadingOverlay label="SETTING UP THE SHOW…" />
      {planUrl && <Minimap planUrl={planUrl} mapping={minimapMapping} markerRef={minimapMarkerRef} />}
      <HUD
        locked={locked}
        onUpload={onBack}
        binderPrompt={false}
        binderOpen={false}
        uploadLabel="🗺 Floor Plan"
      />
      <MobileControls hidden={false} />
    </>
  );
}
