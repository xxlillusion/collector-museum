import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { ROOM } from './Room';

const MOVE_SPEED = 4; // units per second
const PLAYER_HEIGHT = 1.7;
const MARGIN = 0.6; // distance from walls
const TOUCH_LOOK_SPEED = 0.004;

export const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

// Shared state pushed by MobileControls (DOM overlay outside the Canvas)
export const mobileInput = { x: 0, z: 0 };
export const mobileLook = { dx: 0, dy: 0 };

interface GalleryControlsProps {
  onLockChange: (locked: boolean) => void;
}

export default function GalleryControls({ onLockChange }: GalleryControlsProps) {
  const { camera, gl } = useThree();
  const keys = useRef<Set<string>>(new Set());

  // Set initial camera position / orientation
  useEffect(() => {
    camera.position.set(0, PLAYER_HEIGHT, ROOM.depth / 2 - 1.5);
    camera.rotation.order = 'YXZ';
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
    const halfW = ROOM.width / 2 - MARGIN;
    const halfD = ROOM.depth / 2 - MARGIN;
    camera.position.x = Math.max(-halfW, Math.min(halfW, camera.position.x));
    camera.position.z = Math.max(-halfD, Math.min(halfD, camera.position.z));
    camera.position.y = PLAYER_HEIGHT;
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
