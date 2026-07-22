import { useCallback, useLayoutEffect, useEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { allSlots, slotWorld } from '../lib/wallSlots';
import type { SlotGridSpec } from '../lib/wallSlots';

// Arrange-mode slot fittings (F1): one instanced brass outline per wall slot,
// an invisible instanced hit plane that makes the whole slot clickable (the
// visible bars are 4 mm — hopeless raycast targets on their own), and a single
// ghost outline previewing where the held frame will land. Two extra draw
// calls while arranging (outlines + ghost); the hit planes never render
// (material.visible=false skips the render list but not the raycaster).

const BAR = 0.004;        // brass bar width — inlay-line thin, museum hardware
const MARK_W = 1.84;      // a touch larger than the widest single-slot frame (1.75)
const MARK_H = 1.6;       // frame ≈1.57 tall; rows sit 1.65 apart — stay clear
const MARK_DEPTH = 0.006;
const HIT_W = 2.16;       // nearly the full 2.2 pitch — no dead zones between slots
const HIT_H = 1.62;
// Markers sit this far behind the frame plane (toward the wall): span-2
// frames overlap the bars laterally, so a distinct plane reads as mounting
// hardware behind the art instead of interpenetrating the wood.
const WALL_PULL = 0.065;
const GHOST_PUSH = 0.07;  // ghost floats in front of any occupant frame (wood ends at +0.04)
const GHOST_GROW = 0.05;  // breathing room around the held card's footprint
const GHOST_BAR = 0.007;  // slightly bolder than the grid so the preview reads at distance

// Instance colors multiply the material's brass; emissive stays material-level
// (a constant warm floor so markers read in unlit stretches of wall).
const COLOR_AVAILABLE = new THREE.Color(0.42, 0.4, 0.36);
const COLOR_OCCUPIED = new THREE.Color(1.2, 1.0, 0.72);
const COLOR_HOVER = new THREE.Color(2.6, 2.3, 1.6);

/** Rectangle outline as four merged bars — shared by the grid and the ghost. */
function makeOutlineGeometry(w: number, h: number, bar: number): THREE.BufferGeometry {
  const top = new THREE.BoxGeometry(w, bar, MARK_DEPTH);
  top.translate(0, (h - bar) / 2, 0);
  const bottom = new THREE.BoxGeometry(w, bar, MARK_DEPTH);
  bottom.translate(0, -(h - bar) / 2, 0);
  const left = new THREE.BoxGeometry(bar, h - bar * 2, MARK_DEPTH);
  left.translate(-(w - bar) / 2, 0, 0);
  const right = new THREE.BoxGeometry(bar, h - bar * 2, MARK_DEPTH);
  right.translate((w - bar) / 2, 0, 0);
  const merged = mergeGeometries([top, bottom, left, right])!;
  [top, bottom, left, right].forEach((g) => g.dispose());
  return merged;
}

interface SharedAssets {
  outlineGeo: THREE.BufferGeometry;
  hitGeo: THREE.PlaneGeometry;
  warmGeo: THREE.BufferGeometry;
  markerMat: THREE.MeshStandardMaterial;
  hitMat: THREE.MeshBasicMaterial;
  ghostMat: THREE.MeshStandardMaterial;
}

let shared: SharedAssets | null = null;

/** Lazy shared singletons (the tableGeometry idiom) — survive canvas remounts. */
function getShared(): SharedAssets {
  if (!shared) {
    const warmGeo = new THREE.BufferGeometry();
    warmGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 0.001, 0, 0, 0, 0.001, 0], 3),
    );
    warmGeo.computeVertexNormals();
    shared = {
      outlineGeo: makeOutlineGeometry(MARK_W, MARK_H, BAR),
      hitGeo: new THREE.PlaneGeometry(HIT_W, HIT_H),
      warmGeo,
      markerMat: new THREE.MeshStandardMaterial({
        color: '#8a6f35',
        metalness: 0.85,
        roughness: 0.35,
        emissive: '#8a6f35',
        emissiveIntensity: 0.15,
      }),
      // Never enters the render list; still raycasts (three skips only
      // rendering for material.visible=false, not intersection).
      hitMat: new THREE.MeshBasicMaterial({ visible: false }),
      ghostMat: new THREE.MeshStandardMaterial({
        color: '#8a6f35',
        metalness: 0.85,
        roughness: 0.3,
        emissive: '#c9a24d',
        emissiveIntensity: 0.55,
      }),
    };
  }
  return shared;
}

interface WallSlotMarkersProps {
  grid: SlotGridSpec;
  /** Cell id → occupant item id, from the live slot resolution. */
  occupancy: Map<string, string>;
  /** Arrange mode — markers render and hit planes raycast only while true. */
  active: boolean;
  /** Held card's frame footprint + span — sizes and validates the ghost. */
  holding: { span: 1 | 2; w: number; h: number } | null;
  onSlotClick: (slotId: string) => void;
}

export default function WallSlotMarkers({
  grid,
  occupancy,
  active,
  holding,
  onSlotClick,
}: WallSlotMarkersProps) {
  const assets = getShared();
  const slots = useMemo(() => allSlots(grid), [grid]);

  const outlineRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const warmRef = useRef<THREE.InstancedMesh>(null);
  const ghostRef = useRef<THREE.Group>(null);

  // Per-frame-ish interaction state lives in refs — hover changes must not
  // re-render the scene, and the guarded raycast below reads `active`
  // without re-binding.
  const hoverRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const holdingRef = useRef(holding);
  holdingRef.current = holding;
  const occupancyRef = useRef(occupancy);
  occupancyRef.current = occupancy;
  const onSlotClickRef = useRef(onSlotClick);
  onSlotClickRef.current = onSlotClick;
  const cursorRef = useRef(false);

  // Static instance transforms, set once per grid: both meshes pulled toward
  // the wall so occupant frames (artwork at +0.022 off the frame plane) win
  // the nearest-hit contest wherever they overlap a hit plane.
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const off = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    for (const mesh of [outlineRef.current, hitRef.current]) {
      if (!mesh) continue;
      slots.forEach((slot, i) => {
        e.set(slot.rotation[0], slot.rotation[1], slot.rotation[2]);
        q.setFromEuler(e);
        off.set(0, 0, -WALL_PULL).applyQuaternion(q);
        p.set(
          slot.position[0] + off.x,
          slot.position[1] + off.y,
          slot.position[2] + off.z,
        );
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [slots]);

  // Outside arrange mode the hit planes must be raycast-transparent — they
  // cover broad wall areas, and a silent hit would eat the click-that-missed
  // path (Canvas onPointerMissed → pointer re-lock).
  useLayoutEffect(() => {
    const mesh = hitRef.current;
    if (!mesh) return;
    const base = mesh.raycast.bind(mesh);
    mesh.raycast = (raycaster, intersects) => {
      if (activeRef.current) base(raycaster, intersects);
    };
  }, []);

  const applyColors = useCallback(() => {
    const mesh = outlineRef.current;
    if (!mesh) return;
    for (let i = 0; i < slots.length; i++) {
      const color =
        hoverRef.current === i
          ? COLOR_HOVER
          : occupancyRef.current.has(slots[i].id)
            ? COLOR_OCCUPIED
            : COLOR_AVAILABLE;
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [slots]);

  const updateGhost = useCallback(() => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    const hold = holdingRef.current;
    const hover = hoverRef.current;
    if (!activeRef.current || !hold || hover === null) {
      ghost.visible = false;
      return;
    }
    // span 2 without a right neighbour resolves to null — no landing preview
    const world = slotWorld(grid, slots[hover].id, hold.span);
    if (!world) {
      ghost.visible = false;
      return;
    }
    ghost.position.set(world.position[0], world.position[1], world.position[2]);
    ghost.rotation.set(world.rotation[0], world.rotation[1], world.rotation[2]);
    ghost.visible = true;
  }, [grid, slots]);

  // Ghost outline matches the held card's frame footprint — rebuilt on hold
  // change (rare), disposed when replaced.
  const ghostGeo = useMemo(
    () =>
      holding
        ? makeOutlineGeometry(holding.w + GHOST_GROW, holding.h + GHOST_GROW, GHOST_BAR)
        : null,
    [holding],
  );
  useEffect(() => () => { ghostGeo?.dispose(); }, [ghostGeo]);

  useEffect(() => {
    applyColors();
    updateGhost();
  }, [occupancy, holding, applyColors, updateGhost]);

  // Mode exit: clear hover/cursor so nothing sticks into walk mode.
  useEffect(() => {
    if (active) return;
    hoverRef.current = null;
    applyColors();
    updateGhost();
    if (cursorRef.current) {
      document.body.style.cursor = 'default';
      cursorRef.current = false;
    }
  }, [active, applyColors, updateGhost]);

  // Warmup instance: identity matrix + a color so the instanced+instanceColor
  // program variant compiles at scene load (see comment at the warmup group).
  useLayoutEffect(() => {
    const mesh = warmRef.current;
    if (!mesh) return;
    mesh.setMatrixAt(0, new THREE.Matrix4());
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (!activeRef.current) return;
    const idx = e.instanceId ?? null;
    if (idx !== hoverRef.current) {
      hoverRef.current = idx;
      applyColors();
      updateGhost();
    }
    const wantCursor = holdingRef.current !== null;
    if (wantCursor !== cursorRef.current) {
      document.body.style.cursor = wantCursor ? 'pointer' : 'default';
      cursorRef.current = wantCursor;
    }
  };

  const handleLeave = () => {
    if (hoverRef.current !== null) {
      hoverRef.current = null;
      applyColors();
      updateGhost();
    }
    if (cursorRef.current) {
      document.body.style.cursor = 'default';
      cursorRef.current = false;
    }
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!activeRef.current) return;
    e.stopPropagation();
    if (e.delta > 8) return; // look-drag, not a click (the CardFrame guard)
    if (e.instanceId === undefined) return;
    onSlotClickRef.current(slots[e.instanceId].id);
  };

  return (
    <group>
      {/* The brass slot grid — visual only; the hit planes own the raycast */}
      <instancedMesh
        ref={outlineRef}
        args={[assets.outlineGeo, assets.markerMat, slots.length]}
        visible={active}
        raycast={() => null}
      />

      {/* Full-slot click targets (never rendered; guarded raycast above) */}
      <instancedMesh
        ref={hitRef}
        args={[assets.hitGeo, assets.hitMat, slots.length]}
        onClick={handleClick}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      />

      {/* Landing preview for the held frame — position driven imperatively */}
      <group ref={ghostRef} visible={false}>
        {ghostGeo && (
          <mesh
            geometry={ghostGeo}
            material={assets.ghostMat}
            position={[0, 0, GHOST_PUSH]}
            raycast={() => null}
          />
        )}
      </group>

      {/* 1 mm never-culled warmups (the BinderMaterialWarmup idiom): the
          marker mesh is visible=false until the first toggle, so nothing
          would compile its instanced-with-color program — or the ghost's —
          until mid-session, hitching the first R press. */}
      <group position={[0, 0.5, 0]} scale={0.001}>
        <instancedMesh
          ref={warmRef}
          args={[assets.warmGeo, assets.markerMat, 1]}
          frustumCulled={false}
        />
        <mesh geometry={assets.warmGeo} material={assets.ghostMat} frustumCulled={false} />
      </group>
    </group>
  );
}
