import { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { ROOM, TABLE } from './Room';

const MOVE_SPEED = 4; // units per second
const PLAYER_HEIGHT = 1.7;
const MARGIN = 0.6; // distance from walls
const TOUCH_LOOK_SPEED = 0.004;

export const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

// Shared state pushed by MobileControls (DOM overlay outside the Canvas)
export const mobileInput = { x: 0, z: 0 };
export const mobileLook = { dx: 0, dy: 0 };

/** Axis-aligned collision box the camera is pushed out of. */
export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Museum defaults — the original hardcoded behavior. Computed lazily: this
// module and Room.tsx import each other (Room needs isTouchDevice), so ROOM
// isn't initialized yet at our module-evaluation time.
const museumBounds = () => ({ halfW: ROOM.width / 2 - MARGIN, halfD: ROOM.depth / 2 - MARGIN });
// The vendor table backs the east wall, so a one-sided push-out (from -X
// only) matches the original clamp exactly.
const museumTableAABB = (): AABB => ({
  minX: TABLE.x - TABLE.topD / 2 - 0.35,
  maxX: Infinity,
  minZ: -(TABLE.topW / 2 + 0.35),
  maxZ: TABLE.topW / 2 + 0.35,
});
const museumSpawn = (): [number, number, number] => [0, PLAYER_HEIGHT, ROOM.depth / 2 - 1.5];

interface GalleryControlsProps {
  onLockChange: (locked: boolean) => void;
  /** true while the binder is open — movement and look are frozen */
  frozen: boolean;
  /** Walkable half-extents; defaults to the museum room. */
  bounds?: { halfW: number; halfD: number };
  /** Collision boxes; defaults to the museum vendor table. */
  colliders?: AABB[];
  initialPosition?: [number, number, number];
}

export default function GalleryControls({
  onLockChange,
  frozen,
  bounds: boundsProp,
  colliders: collidersProp,
  initialPosition: initialPositionProp,
}: GalleryControlsProps) {
  const { camera, gl } = useThree();
  const keys = useRef<Set<string>>(new Set());

  const bounds = useMemo(() => boundsProp ?? museumBounds(), [boundsProp]);
  const colliders = useMemo(() => collidersProp ?? [museumTableAABB()], [collidersProp]);
  const initialPosition = useMemo(
    () => initialPositionProp ?? museumSpawn(),
    [initialPositionProp],
  );

  // Set initial camera position / orientation
  useEffect(() => {
    camera.position.set(...initialPosition);
    camera.rotation.order = 'YXZ';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((_, delta) => {
    // Binder open: drain queued look deltas so the camera doesn't jump on
    // resume, then skip all movement/look.
    if (frozen) {
      mobileLook.dx = 0;
      mobileLook.dy = 0;
      return;
    }

    // Touch look: apply accumulated drag deltas as yaw/pitch
    if (isTouchDevice && (mobileLook.dx !== 0 || mobileLook.dy !== 0)) {
      camera.rotation.y -= mobileLook.dx * TOUCH_LOOK_SPEED;
      camera.rotation.x -= mobileLook.dy * TOUCH_LOOK_SPEED;
      camera.rotation.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, camera.rotation.x));
      mobileLook.dx = 0;
      mobileLook.dy = 0;
    }

    const kb = keys.current;
    let kx = 0, kz = 0;
    if (kb.has('KeyW') || kb.has('ArrowUp')) kz -= 1;
    if (kb.has('KeyS') || kb.has('ArrowDown')) kz += 1;
    if (kb.has('KeyA') || kb.has('ArrowLeft')) kx -= 1;
    if (kb.has('KeyD') || kb.has('ArrowRight')) kx += 1;

    // Combine keyboard + mobile joystick
    const totalX = kx + mobileInput.x;
    const totalZ = kz + mobileInput.z;

    if (totalX !== 0 || totalZ !== 0) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

      const move = new THREE.Vector3();
      move.addScaledVector(dir, -totalZ);
      move.addScaledVector(right, totalX);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(MOVE_SPEED * delta);
        camera.position.add(move);
      }
    }

    // Clamp to room bounds
    camera.position.x = Math.max(-bounds.halfW, Math.min(bounds.halfW, camera.position.x));
    camera.position.z = Math.max(-bounds.halfD, Math.min(bounds.halfD, camera.position.z));
    camera.position.y = PLAYER_HEIGHT;

    // Don't walk through tables. AABB push-out along the axis of least
    // penetration (boxes with an Infinity side push out one way only).
    for (const box of colliders) {
      const { x, z } = camera.position;
      if (x <= box.minX || x >= box.maxX || z <= box.minZ || z >= box.maxZ) continue;
      const dxMin = x - box.minX;
      const dxMax = box.maxX - x;
      const dzMin = z - box.minZ;
      const dzMax = box.maxZ - z;
      const m = Math.min(dxMin, dxMax, dzMin, dzMax);
      if (m === dxMin) camera.position.x = box.minX;
      else if (m === dxMax) camera.position.x = box.maxX;
      else if (m === dzMin) camera.position.z = box.minZ;
      else camera.position.z = box.maxZ;
    }
  });

  // Pointer lock is not supported on mobile — touch look handles it instead
  if (isTouchDevice) return null;

  return (
    // selector matches nothing: disables drei's click-anywhere-to-lock, which
    // raced with card clicks (the lock could land first, flipping the raycast
    // to crosshair mode so the card click missed). Scene locks explicitly via
    // onPointerMissed instead. Mouse-look still works: the controls track
    // pointerlockchange on the canvas regardless of who requested the lock.
    // domElement must be the canvas: Scene.tryLock() requests pointer lock on
    // gl.domElement, and three's PointerLockControls only enables mouse-look
    // when document.pointerLockElement === its own domElement. Without the
    // explicit prop, drei falls back to events.connected — the canvas's parent
    // div (Scene connects events there) — and the match fails: pointer locks,
    // cursor vanishes, but the camera never rotates.
    <PointerLockControls
      domElement={gl.domElement}
      selector="#plc-no-autolock"
      onLock={() => onLockChange(true)}
      onUnlock={() => onLockChange(false)}
    />
  );
}
