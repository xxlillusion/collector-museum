import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Binder, { BinderMaterialWarmup, COVER_W, COVER_H, COVER_T, CARDS_PER_SHEET } from './Binder';
import { isTouchDevice } from './GalleryControls';
import { CLOTH_TOP_Y } from './tableGeometry';
import { TABLE } from './Room';
import { getInventoryItems } from '../lib/db';
import { prefetchSleeveTexture } from '../lib/sleeveTextures';
import { useVendorInventory } from '../lib/useVendorInventory';
import type { TablePlacement } from '../lib/vendorPlan';
import type { CardWithUrl } from '../lib/useCards';

// Inventory binders on assigned tables. Closed binders are two instanced
// draws total (leather shells + ring packs) with zero textures; opening one
// hides its instance and mounts the real museum Binder in its place with the
// vendor's inventory slice, loading textures lazily around the open spread.

/** 10 pages × 9 pockets — one binder holds 90 items; overflow starts a new one. */
export const ITEMS_PER_BINDER = 90;

const PROMPT_DISTANCE = 2.2;
const PROMPT_GAZE = 0.86; // dot(cameraForward, toBinder) threshold — matches Binder

export interface BinderPose {
  vendorId: string;
  /** Which 90-item slice of the vendor's inventory this binder holds. */
  binderIndex: number;
  position: [number, number, number];
  quaternion: THREE.Quaternion;
}

/**
 * One binder per 90 inventory items, spread across the booth's tables in
 * emission order; extras sit side by side on the last table. A vendor with
 * multiple booths gets the same binders at each booth.
 */
export function computeBinderPoses(
  tables: TablePlacement[],
  inventoryCounts: Map<string, number>,
): BinderPose[] {
  const booths = new Map<string, TablePlacement[]>();
  for (const t of tables) {
    if (!t.vendorId || (inventoryCounts.get(t.vendorId) ?? 0) === 0) continue;
    const arr = booths.get(t.rectId);
    if (arr) arr.push(t);
    else booths.set(t.rectId, [t]);
  }

  const poses: BinderPose[] = [];
  for (const boothTables of booths.values()) {
    boothTables.sort((a, b) => a.indexInBooth - b.indexInBooth);
    const vendorId = boothTables[0].vendorId!;
    const count = inventoryCounts.get(vendorId)!;
    const binderCount = Math.ceil(count / ITEMS_PER_BINDER);
    const lastIdx = boothTables.length - 1;
    const extrasOnLast = Math.max(1, binderCount - lastIdx);

    for (let i = 0; i < binderCount; i++) {
      const table = boothTables[Math.min(i, lastIdx)];
      // Extras on the last table spread along its (stretched) long axis
      let offX = 0;
      if (i >= lastIdx && extrasOnLast > 1) {
        const j = i - lastIdx;
        const tableW = TABLE.topW * (table.sx ?? 1);
        const pitch = Math.min(0.42, (tableW * 0.8) / extrasOnLast);
        offX = (j - (extrasOnLast - 1) / 2) * pitch;
      }
      // Same lie-flat pose as the museum binder, re-based from its
      // -X-facing table to this table's local frame (front = +Z), riding
      // the table's yaw. Alternating skew keeps rows from looking stamped.
      const skew = (i % 2 === 0 ? 1 : -1) * 0.1;
      const quaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.PI / 2, table.rotationY + Math.PI / 2, Math.PI / 2 + skew, 'YXZ'),
      );
      const cos = Math.cos(table.rotationY);
      const sin = Math.sin(table.rotationY);
      poses.push({
        vendorId,
        binderIndex: i,
        position: [
          table.position[0] + offX * cos,
          CLOTH_TOP_Y + 0.03,
          table.position[2] - offX * sin,
        ],
        quaternion,
      });
    }
  }
  return poses;
}

/** Leather shells (covers + spine) and ring packs, geometry in binder-local
 *  space so instance matrices are just each binder's pose. */
let shellGeos: { leather: THREE.BufferGeometry; rings: THREE.BufferGeometry } | null = null;
function getShellGeometries() {
  if (shellGeos) return shellGeos;
  const back = new THREE.BoxGeometry(COVER_W + 0.02, COVER_H, COVER_T);
  back.translate(COVER_W / 2 - 0.01, 0, -0.006);
  const spine = new THREE.BoxGeometry(0.02, COVER_H, 0.032);
  spine.translate(-0.012, 0, 0.004);
  const front = new THREE.BoxGeometry(COVER_W, COVER_H, COVER_T);
  front.translate(COVER_W / 2, 0, 0.012);
  const ringParts: THREE.BufferGeometry[] = [];
  for (const y of [-0.11, 0, 0.11]) {
    const ring = new THREE.TorusGeometry(0.012, 0.0022, 8, 24);
    ring.rotateX(Math.PI / 2);
    ring.translate(0.004, y, 0.005);
    ringParts.push(ring);
  }
  shellGeos = {
    leather: mergeGeometries([back, spine, front]),
    rings: mergeGeometries(ringParts),
  };
  return shellGeos;
}

/** The opened binder: loads that vendor's inventory (object URLs live only
 *  while open) and drives the real Binder from its shell's resting pose. */
function OpenHallBinder({
  pose,
  suspended,
  onInspect,
  onClosed,
}: {
  pose: BinderPose;
  suspended: boolean;
  onInspect: (url: string, caption?: string) => void;
  onClosed: (relock: boolean) => void;
}) {
  const { items } = useVendorInventory(pose.vendorId);

  const cards = useMemo<CardWithUrl[]>(
    () =>
      items
        .slice(pose.binderIndex * ITEMS_PER_BINDER, (pose.binderIndex + 1) * ITEMS_PER_BINDER)
        .map((i) => ({
          id: i.id,
          name: i.caption,
          imageBlob: i.imageBlob,
          addedAt: i.addedAt,
          imageUrl: i.imageUrl,
          aspect: i.aspect,
        })),
    [items, pose.binderIndex],
  );

  const captionByUrl = useMemo(
    () => new Map(items.filter((i) => i.caption).map((i) => [i.imageUrl, i.caption])),
    [items],
  );

  return (
    <Binder
      cards={cards}
      open
      suspended={suspended}
      onOpenRequest={() => {}}
      onPromptChange={() => {}}
      onInspect={(url) => onInspect(url, captionByUrl.get(url))}
      onClosed={onClosed}
      restPose={{ position: pose.position, quaternion: pose.quaternion }}
      lazySheetWindow={1}
      fillLight={false}
    />
  );
}

interface VendorHallBindersProps {
  tables: TablePlacement[];
  /** Vendor id → inventory item count (0 / absent = no binders). */
  inventoryCounts: Map<string, number>;
  /** true while the InspectOverlay is up — ignore keys/clicks. */
  suspended: boolean;
  onPromptChange: (visible: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onInspect: (url: string, caption?: string) => void;
  /** Binder finished closing; relock = resume pointer lock. */
  onClosed: (relock: boolean) => void;
}

export default function VendorHallBinders({
  tables,
  inventoryCounts,
  suspended,
  onPromptChange,
  onOpenChange,
  onInspect,
  onClosed,
}: VendorHallBindersProps) {
  const poses = useMemo(
    () => computeBinderPoses(tables, inventoryCounts),
    [tables, inventoryCounts],
  );
  const geos = useMemo(getShellGeometries, []);
  const mats = useMemo(
    () => ({
      leather: new THREE.MeshPhysicalMaterial({
        color: '#1c1a17',
        roughness: 0.5,
        clearcoat: 0.3,
        clearcoatRoughness: 0.4,
      }),
      rings: new THREE.MeshStandardMaterial({
        color: '#b8b8b8',
        roughness: 0.25,
        metalness: 0.9,
      }),
    }),
    [],
  );

  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const openIdxRef = useRef(openIdx);
  openIdxRef.current = openIdx;
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const promptIdxRef = useRef<number | null>(null);

  const leatherRef = useRef<THREE.InstancedMesh>(null);
  const ringsRef = useRef<THREE.InstancedMesh>(null);
  const fillLightRef = useRef<THREE.PointLight>(null);

  // Instance matrices = binder poses; the opened binder's instance collapses
  // to scale 0 so the real Binder replaces it seamlessly.
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const zero = new THREE.Vector3(0, 0, 0);
    for (const mesh of [leatherRef.current, ringsRef.current]) {
      if (!mesh) continue;
      for (let i = 0; i < poses.length; i++) {
        const p = poses[i];
        m.compose(pos.set(...p.position), p.quaternion, i === openIdx ? zero : one);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [poses, openIdx, geos, mats]);

  const openBinder = (idx: number) => {
    if (openIdxRef.current !== null || suspendedRef.current) return;
    if (promptIdxRef.current !== null) {
      promptIdxRef.current = null;
      onPromptChange(false);
    }
    document.exitPointerLock?.();
    setOpenIdx(idx);
    onOpenChange(true);
  };
  const openBinderRef = useRef(openBinder);
  openBinderRef.current = openBinder;

  // Warm the first spread's sleeve textures as soon as the player shows
  // intent (gazing prompt or hover), so opening doesn't start from a cold
  // IndexedDB read + full decode. Keyed per binder — the blob read + decode
  // only ever happens once; the sleeve cache dedupes repeat calls anyway.
  const prefetchedRef = useRef(new Set<string>());
  const prefetchBinder = (pose: BinderPose) => {
    const key = `${pose.vendorId}:${pose.binderIndex}`;
    if (prefetchedRef.current.has(key)) return;
    prefetchedRef.current.add(key);
    getInventoryItems(pose.vendorId)
      .then((records) => {
        const start = pose.binderIndex * ITEMS_PER_BINDER;
        for (const r of records.slice(start, start + CARDS_PER_SHEET)) {
          prefetchSleeveTexture(r.id, r.imageBlob);
        }
      })
      .catch(() => {});
  };

  // Proximity prompt: nearest closed binder in range and in the crosshair
  useFrame(({ camera }) => {
    // Fill light for the open spread — permanently mounted (mount-toggling a
    // light recompiles every hall material, see Binder.fillLight), parked at
    // intensity 0 while closed, tucked just in front of the camera while open
    // (≈ where Binder's own local fill light would sit at the view pose).
    const light = fillLightRef.current;
    if (light) {
      if (openIdxRef.current !== null) {
        light.intensity = 0.35;
        camera.getWorldDirection(light.position);
        light.position.multiplyScalar(0.2).add(camera.position);
        light.position.y += 0.08;
      } else {
        light.intensity = 0;
      }
    }
    if (isTouchDevice) return;
    let best: number | null = null;
    let bestDist = PROMPT_DISTANCE;
    if (openIdxRef.current === null && !suspendedRef.current) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const to = new THREE.Vector3();
      for (let i = 0; i < poses.length; i++) {
        const p = poses[i];
        to.set(p.position[0], p.position[1], p.position[2]).sub(camera.position);
        const dist = to.length();
        if (dist >= bestDist) continue;
        if (to.normalize().dot(forward) <= PROMPT_GAZE) continue;
        best = i;
        bestDist = dist;
      }
    }
    if (best !== promptIdxRef.current) {
      const wasVisible = promptIdxRef.current !== null;
      promptIdxRef.current = best;
      if (best !== null) prefetchBinder(poses[best]);
      if ((best !== null) !== wasVisible) onPromptChange(best !== null);
    }
  });

  // F opens the prompted binder (the mounted Binder handles F-to-close)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF') return;
      const idx = promptIdxRef.current;
      if (idx !== null) openBinderRef.current(idx);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleShellClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return; // look-drag, not a click
    if (e.instanceId !== undefined) openBinderRef.current(e.instanceId);
  };

  const handleClosed = (relock: boolean) => {
    setOpenIdx(null);
    onOpenChange(false);
    onClosed(relock);
  };

  if (poses.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={leatherRef}
        args={[geos.leather, mats.leather, poses.length]}
        castShadow
        receiveShadow
        onClick={handleShellClick}
        onPointerEnter={(e) => {
          if (openIdxRef.current === null) {
            document.body.style.cursor = 'pointer';
            if (e.instanceId !== undefined) prefetchBinder(poses[e.instanceId]);
          }
        }}
        onPointerLeave={() => { document.body.style.cursor = 'default'; }}
      />
      <instancedMesh ref={ringsRef} args={[geos.rings, mats.rings, poses.length]} />

      {/* Permanent fill light + shader warmup — both exist so opening the
          first binder doesn't trigger a hall-wide shader recompile burst */}
      <pointLight ref={fillLightRef} intensity={0} distance={1.4} decay={2} color="#fff0dd" />
      <BinderMaterialWarmup />

      {openIdx !== null && (
        // Own boundary: mounting inventory textures must not suspend the hall
        <Suspense fallback={null}>
          <OpenHallBinder
            pose={poses[openIdx]}
            suspended={suspended}
            onInspect={onInspect}
            onClosed={handleClosed}
          />
        </Suspense>
      )}
    </group>
  );
}
