import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { BINDER_REST } from './Room';
import { isTouchDevice } from './GalleryControls';
import { acquireSleeveTexture } from '../lib/sleeveTextures';
import type { CardWithUrl } from '../lib/useCards';

// Page/cover dimensions (meters). Local convention: spine along +Y at x=0,
// pages extend to +X when on the right stack, content faces +Z.
// Cover dims are exported for the hall's instanced closed-binder shells.
const PAGE_W = 0.28;
const PAGE_H = 0.34;
export const COVER_W = 0.30;
export const COVER_H = 0.36;
export const COVER_T = 0.006;

const CARDS_PER_FACE = 9;
/** Exported for the hall's prompt-time texture prefetch (one spread's worth). */
export const CARDS_PER_SHEET = 18;

// Pocket grid metrics (module-level so geometry can be shared).
const POCKET_MARGIN_X = 0.014;
const POCKET_MARGIN_Y = 0.016;
const POCKET_GAP = 0.006;
const POCKET_W = (PAGE_W - POCKET_MARGIN_X * 2 - POCKET_GAP * 2) / 3;
const POCKET_H = (PAGE_H - POCKET_MARGIN_Y * 2 - POCKET_GAP * 2) / 3;

// Shared across every pocket of every sheet. A binder mounts ~90 pockets ×
// 3 meshes; per-pocket geometry/material allocation (plus the physical
// material's shader compile) used to land inside the open animation and
// stutter it. Card planes share a unit geometry scaled per card.
const pageGeometry = new THREE.PlaneGeometry(PAGE_W, PAGE_H);
const pocketGeometry = new THREE.PlaneGeometry(POCKET_W, POCKET_H);
const weldGeometry = new THREE.PlaneGeometry(POCKET_W, 0.003);
const cardGeometry = new THREE.PlaneGeometry(1, 1);
const pageMaterial = new THREE.MeshStandardMaterial({
  color: '#17151a',
  roughness: 0.85,
  side: THREE.DoubleSide,
});
const backingMaterial = new THREE.MeshStandardMaterial({ color: '#232028', roughness: 0.8 });
const sheenMaterial = new THREE.MeshPhysicalMaterial({
  color: '#ffffff',
  transparent: true,
  opacity: 0.1,
  roughness: 0.12,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.08,
  envMapIntensity: 1.2,
  depthWrite: false,
});
const weldMaterial = new THREE.MeshStandardMaterial({
  color: '#0c0b0e',
  roughness: 0.6,
  transparent: true,
  opacity: 0.6,
});

/**
 * Five 1-mm, never-culled triangles that pull the sheet/pocket shader
 * programs through compilation at scene load instead of on first binder
 * open (where the compile burst used to stall the open animation).
 * Binder renders one internally (museum: Binder mounts with the scene);
 * the hall mounts its own because its Binder only mounts on open.
 */
export function BinderMaterialWarmup() {
  const warmMap = useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, []);
  return (
    <group scale={0.001}>
      {[pageMaterial, backingMaterial, sheenMaterial, weldMaterial].map((m, i) => (
        <mesh key={i} geometry={cardGeometry} material={m} frustumCulled={false} />
      ))}
      {/* same program variant as SleeveCard (standard material + map) */}
      <mesh geometry={cardGeometry} frustumCulled={false}>
        <meshStandardMaterial map={warmMap} roughness={0.5} />
      </mesh>
    </group>
  );
}

const OPEN_DURATION = 0.6;  // lift + cover swing (seconds)
const FLIP_DURATION = 0.4;  // one sheet turn
const VIEW_DISTANCE = 0.6;  // binder distance in front of the camera
// Scale applied at the view pose so the spread fills the screen. Scaling
// (rather than moving closer) keeps the mid-swing cover clear of the 0.1
// near plane: worst case tip ≈ 0.6 − 0.30·scale ≈ 0.13.
const VIEW_SCALE = 1.55;
const FAN = 0.006;          // stacking fan angle between resting sheets

const PROMPT_DISTANCE = 2.2;
const PROMPT_GAZE = 0.86;   // dot(cameraForward, toBinder) threshold

type Phase = 'closed' | 'opening' | 'open' | 'closing';

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Resting hinge angle for sheet i given the current spread index k.
// Right stack (i >= k): top sheet is the most lifted (most negative).
// Left stack (i < k): top sheet (k-1) is the most lifted above -PI.
function restAngle(i: number, k: number, numSheets: number) {
  if (i >= k) return -FAN * (numSheets - i);
  return -Math.PI + FAN * (i + 1);
}

/** One card inside a sleeve pocket. Texture comes from the shared sleeve
 *  cache (downscaled ImageBitmap, decoded off the main thread) and is
 *  uploaded via gl.initTexture so it never stalls the render loop. */
function SleeveCard({ card }: { card: CardWithUrl }) {
  const gl = useThree((s) => s.gl);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let alive = true;
    const handle = acquireSleeveTexture(card.id, card.imageBlob);
    handle.promise
      .then((t) => {
        if (!alive) return;
        gl.initTexture(t); // upload now, off the render path
        setTexture(t);
      })
      .catch(() => {});
    return () => {
      alive = false;
      handle.release();
      setTexture(null);
    };
  }, [card, gl]);

  if (!texture) return null;

  // Fit inside the pocket, preserving aspect
  const inset = 0.94;
  let w = POCKET_W * inset;
  let h = w / card.aspect;
  if (h > POCKET_H * inset) {
    h = POCKET_H * inset;
    w = h * card.aspect;
  }

  return (
    // Visual only — the pocket's sleeve plane handles clicks (bigger target)
    <mesh position={[0, 0, 0.0012]} scale={[w, h, 1]} geometry={cardGeometry} raycast={() => null}>
      <meshStandardMaterial map={texture} roughness={0.5} />
    </mesh>
  );
}

/** One 3x3 grid of sleeve pockets covering a page face. */
function PocketGrid({
  cards,
  onInspect,
}: {
  cards: (CardWithUrl | undefined)[];
  onInspect: (url: string) => void;
}) {
  const pockets: { x: number; y: number; card: CardWithUrl | undefined }[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      pockets.push({
        x: -PAGE_W / 2 + POCKET_MARGIN_X + POCKET_W / 2 + col * (POCKET_W + POCKET_GAP),
        y: PAGE_H / 2 - POCKET_MARGIN_Y - POCKET_H / 2 - row * (POCKET_H + POCKET_GAP),
        card: cards[row * 3 + col],
      });
    }
  }

  return (
    <group>
      {pockets.map((p, i) => (
        <group key={i} position={[p.x, p.y, 0]}>
          {/* Pocket backing — slightly lighter than the page */}
          <mesh position={[0, 0, 0.0006]} geometry={pocketGeometry} material={backingMaterial} />

          {p.card && <SleeveCard card={p.card} />}

          {/* Plastic sleeve sheen over the pocket — also the click target
              for the card inside (frontmost, full pocket size). userData
              lets the native-click fallback raycast identify the card. */}
          <mesh
            position={[0, 0, 0.0022]}
            geometry={pocketGeometry}
            material={sheenMaterial}
            userData={{ cardUrl: p.card?.imageUrl }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              if (!p.card) return;
              e.stopPropagation();
              if (e.delta > 8) return;
              onInspect(p.card.imageUrl);
            }}
            onPointerEnter={() => { if (p.card) document.body.style.cursor = 'pointer'; }}
            onPointerLeave={() => { document.body.style.cursor = 'default'; }}
          />
          {/* Weld seam at the pocket opening */}
          <mesh
            position={[0, POCKET_H / 2 - 0.0015, 0.0024]}
            geometry={weldGeometry}
            material={weldMaterial}
          />
        </group>
      ))}
    </group>
  );
}

/**
 * One double-sided binder sheet, hinged at the spine (x=0). Front face
 * (+Z when on the right stack) holds 9 cards; the back face is a mirrored
 * group so its grid reads correctly once the sheet is flipped left.
 */
function BinderSheet({
  frontCards,
  backCards,
  onInspect,
  hingeRef,
  frontFaceRef,
  backFaceRef,
}: {
  frontCards: (CardWithUrl | undefined)[];
  backCards: (CardWithUrl | undefined)[];
  onInspect: (url: string) => void;
  hingeRef: (g: THREE.Group | null) => void;
  /** Face content groups — Binder's useFrame toggles their visibility so
   *  only the top sheet of each stack shows cards (see the sheet loop). */
  frontFaceRef: (g: THREE.Group | null) => void;
  backFaceRef: (g: THREE.Group | null) => void;
}) {
  return (
    // z: sheets ride the rings just above the back cover (top surface z=0)
    <group ref={hingeRef} position={[0, 0, 0.005]}>
      <group position={[PAGE_W / 2 + 0.004, 0, 0]}>
        {/* Page base — dark, visible from both sides */}
        <mesh geometry={pageGeometry} material={pageMaterial} />
        {/* Front face content */}
        <group ref={frontFaceRef} position={[0, 0, 0.0004]}>
          <PocketGrid cards={frontCards} onInspect={onInspect} />
        </group>
        {/* Back face content (faces -Z until the sheet is flipped) */}
        <group ref={backFaceRef} rotation={[0, Math.PI, 0]} position={[0, 0, -0.0004]}>
          <PocketGrid cards={backCards} onInspect={onInspect} />
        </group>
      </group>
    </group>
  );
}

// Sheets outside the lazy window render empty pockets — no cards, no textures
const EMPTY_FACE: (CardWithUrl | undefined)[] = new Array(9).fill(undefined);

interface BinderProps {
  cards: CardWithUrl[];
  open: boolean;
  /** true while the InspectOverlay is up — binder ignores keys/clicks */
  suspended: boolean;
  onOpenRequest: () => void;
  onPromptChange: (visible: boolean) => void;
  onInspect: (url: string) => void;
  onClosed: (relock: boolean) => void;
  /** Closed resting pose; absent = the museum table (BINDER_REST). */
  restPose?: { position: [number, number, number]; quaternion: THREE.Quaternion };
  /**
   * When set, only sheets within ±window of the current spread carry card
   * textures (the rest show empty pockets). The hall uses 1 so an open
   * inventory binder never mounts hundreds of textures at once; the museum
   * omits it — behavior unchanged.
   */
  lazySheetWindow?: number;
  /**
   * false = the host scene owns the fill light (the hall mounts Binder only
   * while open, and mounting a light changes the scene's light count, which
   * forces three.js to recompile every material — a multi-second first-open
   * stall). Default true: the light is always mounted, intensity 0 while
   * closed, so the count never changes.
   */
  fillLight?: boolean;
}

export default function Binder({
  cards,
  open,
  suspended,
  onOpenRequest,
  onPromptChange,
  onInspect,
  onClosed,
  restPose,
  lazySheetWindow,
  fillLight = true,
}: BinderProps) {
  const { camera, gl } = useThree();

  const rootRef = useRef<THREE.Group>(null);
  const coverRef = useRef<THREE.Group>(null);
  const sheetRefs = useRef<(THREE.Group | null)[]>([]);
  const frontFaceRefs = useRef<(THREE.Group | null)[]>([]);
  const backFaceRefs = useRef<(THREE.Group | null)[]>([]);

  const numSheets = Math.max(1, Math.ceil(cards.length / CARDS_PER_SHEET));

  const sheets = useMemo(() => {
    const result: { front: (CardWithUrl | undefined)[]; back: (CardWithUrl | undefined)[] }[] = [];
    for (let i = 0; i < numSheets; i++) {
      const front: (CardWithUrl | undefined)[] = [];
      const back: (CardWithUrl | undefined)[] = [];
      for (let j = 0; j < CARDS_PER_FACE; j++) {
        front.push(cards[i * CARDS_PER_SHEET + j]);
        back.push(cards[i * CARDS_PER_SHEET + CARDS_PER_FACE + j]);
      }
      result.push({ front, back });
    }
    return result;
  }, [cards, numSheets]);

  // --- animation state (refs — no re-renders during animation) ---
  const phaseRef = useRef<Phase>('closed');
  const tRef = useRef(0);
  const pendingRelock = useRef(true);
  const spreadRef = useRef(0); // k: sheets 0..k-1 are on the left stack
  const flipRef = useRef<{ sheet: number; from: number; to: number; t: number } | null>(null);
  const promptRef = useRef(false);
  // React mirror of spreadRef, driving the lazy sheet window (no-op re-render
  // for the museum, which passes no window)
  const [spreadUi, setSpreadUi] = useState(0);

  const tablePose = useMemo(() => {
    if (restPose) {
      return {
        pos: new THREE.Vector3(...restPose.position),
        quat: restPose.quaternion.clone(),
      };
    }
    const pos = new THREE.Vector3(...BINDER_REST);
    // Lie flat (covers up), spine parallel to the east wall, with a slight
    // casual skew so it doesn't look machine-placed.
    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2 + 0.12, 'YXZ'),
    );
    return { pos, quat };
  }, [restPose]);

  const viewPos = useRef(new THREE.Vector3());
  const viewQuat = useRef(new THREE.Quaternion());

  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const callbacksRef = useRef({ onOpenRequest, onPromptChange, onInspect, onClosed });
  callbacksRef.current = { onOpenRequest, onPromptChange, onInspect, onClosed };

  const beginClose = (relock: boolean) => {
    if (phaseRef.current !== 'open') return;
    pendingRelock.current = relock;
    // Return all sheets to the right stack before the flight — the motion
    // hides the snap.
    spreadRef.current = 0;
    setSpreadUi(0);
    flipRef.current = null;
    phaseRef.current = 'closing';
    tRef.current = 0;
  };
  const beginCloseRef = useRef(beginClose);
  beginCloseRef.current = beginClose;

  const startFlip = (dir: 1 | -1) => {
    if (phaseRef.current !== 'open' || flipRef.current) return;
    const k = spreadRef.current;
    if (dir === 1 && k < numSheets) {
      flipRef.current = { sheet: k, from: restAngle(k, k, numSheets), to: -Math.PI + FAN * (k + 1), t: 0 };
      spreadRef.current = k + 1;
      setSpreadUi(k + 1);
    } else if (dir === -1 && k > 0) {
      flipRef.current = { sheet: k - 1, from: restAngle(k - 1, k, numSheets), to: -FAN * (numSheets - (k - 1)), t: 0 };
      spreadRef.current = k - 1;
      setSpreadUi(k - 1);
    }
  };
  const startFlipRef = useRef(startFlip);
  startFlipRef.current = startFlip;

  // Open: capture the view pose once (camera freezes afterwards)
  useEffect(() => {
    if (open && phaseRef.current === 'closed') {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      viewPos.current.copy(camera.position).addScaledVector(forward, VIEW_DISTANCE);
      viewPos.current.y -= 0.03;
      viewQuat.current.copy(camera.quaternion);
      spreadRef.current = 0;
      setSpreadUi(0);
      phaseRef.current = 'opening';
      tRef.current = 0;
    }
  }, [open, camera]);

  // While open: no pointer lock allowed (same enforcement as InspectOverlay)
  useEffect(() => {
    if (!open) return;
    const exit = () => {
      if (document.pointerLockElement) document.exitPointerLock();
    };
    exit();
    document.addEventListener('pointerlockchange', exit);
    return () => document.removeEventListener('pointerlockchange', exit);
  }, [open]);

  // Keyboard: F opens/closes, Esc closes (pointer is unlocked while open, so
  // Esc reaches us instead of being consumed by pointer-lock exit), arrows/A/D
  // flip pages (movement is frozen while open, so no conflict).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (suspendedRef.current) return;
      const phase = phaseRef.current;
      if (e.code === 'KeyF') {
        if (phase === 'closed' && promptRef.current) callbacksRef.current.onOpenRequest();
        else if (phase === 'open') beginCloseRef.current(true);
      } else if (e.code === 'Escape' && phase === 'open') {
        beginCloseRef.current(false);
      } else if ((e.code === 'ArrowRight' || e.code === 'KeyD') && phase === 'open') {
        startFlipRef.current(1);
      } else if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && phase === 'open') {
        startFlipRef.current(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Native click fallback while open: R3F's synthetic click dispatch has
  // proven unreliable for some desktop pointer setups (trackpad after
  // pointer-lock exit), so raycast manually from the real mouse coordinates.
  // If R3F's own onClick also fires, onInspect is idempotent — harmless.
  useEffect(() => {
    if (!open) return;
    let downX = 0;
    let downY = 0;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onClick = (e: MouseEvent) => {
      if (phaseRef.current !== 'open' || suspendedRef.current) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return; // drag
      const canvas = gl.domElement;
      const t = e.target as Node | null;
      if (t !== canvas && t !== canvas.parentElement) return; // DOM UI click
      const root = rootRef.current;
      if (!root) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(root.children, true);
      // Nearest few hits: the sleeve sheen is frontmost, but the thin weld
      // seam strip can edge in front of it — look a little past the surface.
      for (const h of hits.slice(0, 4)) {
        const url = (h.object.userData as { cardUrl?: string }).cardUrl;
        if (url) {
          callbacksRef.current.onInspect(url);
          return;
        }
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('click', onClick, true);
    };
  }, [open, camera, gl]);

  // Mobile DOM buttons communicate via window CustomEvents
  useEffect(() => {
    const onFlip = (e: Event) => startFlipRef.current((e as CustomEvent<1 | -1>).detail);
    const onClose = () => beginCloseRef.current(false);
    window.addEventListener('binder-flip', onFlip);
    window.addEventListener('binder-close', onClose);
    return () => {
      window.removeEventListener('binder-flip', onFlip);
      window.removeEventListener('binder-close', onClose);
    };
  }, []);

  useFrame((_, delta) => {
    const root = rootRef.current;
    if (!root) return;
    const phase = phaseRef.current;

    // Proximity prompt (desktop, binder closed)
    if (!isTouchDevice && phase === 'closed') {
      const toBinder = tablePose.pos.clone().sub(camera.position);
      const dist = toBinder.length();
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const gazing = toBinder.normalize().dot(forward) > PROMPT_GAZE;
      const show = dist < PROMPT_DISTANCE && gazing;
      if (show !== promptRef.current) {
        promptRef.current = show;
        callbacksRef.current.onPromptChange(show);
      }
    } else if (promptRef.current && phase !== 'closed') {
      promptRef.current = false;
      callbacksRef.current.onPromptChange(false);
    }

    // Root pose + cover swing. The cover hinge also slides down the stack
    // (closed: top of the sheet stack; open: flat under the left pages) so
    // it neither floats over nor clips through the pages.
    const COVER_Z_CLOSED = 0.012;
    const COVER_Z_OPEN = -0.01;
    const applyCover = (e: number) => {
      if (!coverRef.current) return;
      coverRef.current.rotation.y = -Math.PI * e;
      coverRef.current.position.z = COVER_Z_CLOSED + (COVER_Z_OPEN - COVER_Z_CLOSED) * e;
    };
    if (phase === 'opening' || phase === 'closing') {
      tRef.current = Math.min(1, tRef.current + delta / OPEN_DURATION);
      const raw = tRef.current;
      const e = smoothstep(phase === 'opening' ? raw : 1 - raw);
      root.position.lerpVectors(tablePose.pos, viewPos.current, e);
      root.quaternion.slerpQuaternions(tablePose.quat, viewQuat.current, e);
      root.scale.setScalar(1 + (VIEW_SCALE - 1) * e);
      applyCover(e);
      if (raw >= 1) {
        phaseRef.current = phase === 'opening' ? 'open' : 'closed';
        if (phase === 'closing') callbacksRef.current.onClosed(pendingRelock.current);
      }
    } else if (phase === 'open') {
      root.position.copy(viewPos.current);
      root.quaternion.copy(viewQuat.current);
      root.scale.setScalar(VIEW_SCALE);
      applyCover(1);
    } else {
      root.position.copy(tablePose.pos);
      root.quaternion.copy(tablePose.quat);
      root.scale.setScalar(1);
      applyCover(0);
    }

    // While the binder moves it needs fresh shadows (maps are otherwise
    // rendered on demand — see Scene onCreated)
    if (phase === 'opening' || phase === 'closing') {
      gl.shadowMap.needsUpdate = true;
    }

    // Sheet resting angles + active flip. Sheets are fully hidden inside the
    // closed covers — skip rendering them (and their reflection-pass copies).
    const k = spreadRef.current;
    const flip = flipRef.current;
    if (flip) {
      flip.t = Math.min(1, flip.t + delta / FLIP_DURATION);
      if (flip.t >= 1) flipRef.current = null;
    }
    for (let i = 0; i < numSheets; i++) {
      const g = sheetRefs.current[i];
      if (!g) continue;
      g.visible = phase !== 'closed';
      if (flip && flip.sheet === i) {
        g.rotation.y = flip.from + (flip.to - flip.from) * easeInOutCubic(flip.t);
      } else {
        g.rotation.y = restAngle(i, k, numSheets);
      }
      // Only the top sheet of each stack shows its cards. Resting sheets are
      // separated by fractions of a millimeter near the spine (gap ≈ x·FAN),
      // less than the pocket content stack — buried cards would poke through
      // the page above them (visible as previous-page cards leaking into the
      // spine-side column of the last page). During a flip, the sheet in
      // flight plus the pages it reveals/covers stay live.
      const frontVisible =
        i === k || (flip !== null && (i === flip.sheet || i === flip.sheet + 1));
      const backVisible =
        i === k - 1 || (flip !== null && (i === flip.sheet || i === flip.sheet - 1));
      const front = frontFaceRefs.current[i];
      if (front) front.visible = frontVisible;
      const back = backFaceRefs.current[i];
      if (back) back.visible = backVisible;
    }
  });

  const handleBodyClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    if (phaseRef.current === 'closed' && !suspendedRef.current) {
      callbacksRef.current.onOpenRequest();
    }
  };

  return (
    <group ref={rootRef}>
      {/* Fill light so the spread reads well anywhere in the room. Mounted
          permanently (intensity 0 while closed): toggling a light's mount
          changes the light count and recompiles every scene material. */}
      {fillLight && (
        <pointLight position={[0, 0.1, 0.45]} intensity={open ? 0.35 : 0} distance={1.4} decay={2} color="#fff0dd" />
      )}

      {/* Compile the sheet/pocket programs at scene load, not first open */}
      <BinderMaterialWarmup />

      {/* Back cover (base of the stack) */}
      <mesh
        position={[COVER_W / 2 - 0.01, 0, -0.006]}
        castShadow
        onClick={handleBodyClick}
        onPointerEnter={() => { if (phaseRef.current === 'closed') document.body.style.cursor = 'pointer'; }}
        onPointerLeave={() => { document.body.style.cursor = 'default'; }}
      >
        <boxGeometry args={[COVER_W + 0.02, COVER_H, COVER_T]} />
        <meshPhysicalMaterial color="#1c1a17" roughness={0.5} clearcoat={0.3} clearcoatRoughness={0.4} />
      </mesh>

      {/* Spine */}
      <mesh position={[-0.012, 0, 0.004]} onClick={handleBodyClick}>
        <boxGeometry args={[0.02, COVER_H, 0.032]} />
        <meshPhysicalMaterial color="#1c1a17" roughness={0.5} clearcoat={0.3} clearcoatRoughness={0.4} />
      </mesh>

      {/* Binder rings */}
      {[-0.11, 0, 0.11].map((y) => (
        <mesh key={`ring-${y}`} position={[0.004, y, 0.005]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.012, 0.0022, 8, 24]} />
          <meshStandardMaterial color="#b8b8b8" roughness={0.25} metalness={0.9} />
        </mesh>
      ))}

      {/* Sheets (hinged at the spine). With a lazy window, only sheets near
          the current spread carry cards — flipping pulls neighbors in. */}
      {sheets.map((s, i) => {
        const live =
          lazySheetWindow == null ||
          (i >= spreadUi - 1 - lazySheetWindow && i <= spreadUi + lazySheetWindow);
        return (
          <BinderSheet
            key={i}
            frontCards={live ? s.front : EMPTY_FACE}
            backCards={live ? s.back : EMPTY_FACE}
            onInspect={(url) => {
              if (phaseRef.current === 'open' && !suspendedRef.current) {
                callbacksRef.current.onInspect(url);
              }
            }}
            hingeRef={(g) => { sheetRefs.current[i] = g; }}
            frontFaceRef={(g) => { frontFaceRefs.current[i] = g; }}
            backFaceRef={(g) => { backFaceRefs.current[i] = g; }}
          />
        );
      })}

      {/* Front cover (hinged; group z is animated in useFrame) */}
      <group ref={coverRef} position={[0, 0, 0.012]}>
        <mesh
          position={[COVER_W / 2, 0, 0]}
          castShadow
          onClick={handleBodyClick}
          onPointerEnter={() => { if (phaseRef.current === 'closed') document.body.style.cursor = 'pointer'; }}
          onPointerLeave={() => { document.body.style.cursor = 'default'; }}
        >
          <boxGeometry args={[COVER_W, COVER_H, COVER_T]} />
          <meshPhysicalMaterial color="#1c1a17" roughness={0.5} clearcoat={0.3} clearcoatRoughness={0.4} />
        </mesh>
        {/* Cover emblem — subtle debossed square */}
        <mesh position={[COVER_W / 2, 0.06, 0.0035]}>
          <planeGeometry args={[0.1, 0.1]} />
          <meshStandardMaterial color="#26221d" roughness={0.65} />
        </mesh>
      </group>
    </group>
  );
}
