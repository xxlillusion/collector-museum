import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { BINDER_REST } from './Room';
import { isTouchDevice } from './GalleryControls';
import type { CardWithUrl } from '../lib/useCards';

// Page/cover dimensions (meters). Local convention: spine along +Y at x=0,
// pages extend to +X when on the right stack, content faces +Z.
const PAGE_W = 0.28;
const PAGE_H = 0.34;
const COVER_W = 0.30;
const COVER_H = 0.36;
const COVER_T = 0.006;

const CARDS_PER_FACE = 9;
const CARDS_PER_SHEET = 18;

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

/** One card inside a sleeve pocket; texture shared with the wall frames. */
function SleeveCard({
  card,
  pocketW,
  pocketH,
}: {
  card: CardWithUrl;
  pocketW: number;
  pocketH: number;
}) {
  const texture = useTexture(card.imageUrl);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  // Fit inside the pocket, preserving aspect
  const inset = 0.94;
  let w = pocketW * inset;
  let h = w / card.aspect;
  if (h > pocketH * inset) {
    h = pocketH * inset;
    w = h * card.aspect;
  }

  return (
    // Visual only — the pocket's sleeve plane handles clicks (bigger target)
    <mesh position={[0, 0, 0.0012]} raycast={() => null}>
      <planeGeometry args={[w, h]} />
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
  const marginX = 0.014;
  const marginY = 0.016;
  const gap = 0.006;
  const pocketW = (PAGE_W - marginX * 2 - gap * 2) / 3;
  const pocketH = (PAGE_H - marginY * 2 - gap * 2) / 3;

  const pockets: { x: number; y: number; card: CardWithUrl | undefined }[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      pockets.push({
        x: -PAGE_W / 2 + marginX + pocketW / 2 + col * (pocketW + gap),
        y: PAGE_H / 2 - marginY - pocketH / 2 - row * (pocketH + gap),
        card: cards[row * 3 + col],
      });
    }
  }

  return (
    <group>
      {pockets.map((p, i) => (
        <group key={i} position={[p.x, p.y, 0]}>
          {/* Pocket backing — slightly lighter than the page */}
          <mesh position={[0, 0, 0.0006]}>
            <planeGeometry args={[pocketW, pocketH]} />
            <meshStandardMaterial color="#232028" roughness={0.8} />
          </mesh>

          {p.card && (
            <SleeveCard card={p.card} pocketW={pocketW} pocketH={pocketH} />
          )}

          {/* Plastic sleeve sheen over the pocket — also the click target
              for the card inside (frontmost, full pocket size). userData
              lets the native-click fallback raycast identify the card. */}
          <mesh
            position={[0, 0, 0.0022]}
            userData={{ cardUrl: p.card?.imageUrl }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              if (!p.card) return;
              e.stopPropagation();
              if (e.delta > 8) return;
              onInspect(p.card.imageUrl);
            }}
            onPointerEnter={() => { if (p.card) document.body.style.cursor = 'pointer'; }}
            onPointerLeave={() => { document.body.style.cursor = 'default'; }}
          >
            <planeGeometry args={[pocketW, pocketH]} />
            <meshPhysicalMaterial
              color="#ffffff"
              transparent
              opacity={0.1}
              roughness={0.12}
              metalness={0}
              clearcoat={1}
              clearcoatRoughness={0.08}
              envMapIntensity={1.2}
              depthWrite={false}
            />
          </mesh>
          {/* Weld seam at the pocket opening */}
          <mesh position={[0, pocketH / 2 - 0.0015, 0.0024]}>
            <planeGeometry args={[pocketW, 0.003]} />
            <meshStandardMaterial color="#0c0b0e" roughness={0.6} transparent opacity={0.6} />
          </mesh>
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
}: {
  frontCards: (CardWithUrl | undefined)[];
  backCards: (CardWithUrl | undefined)[];
  onInspect: (url: string) => void;
  hingeRef: (g: THREE.Group | null) => void;
}) {
  return (
    // z: sheets ride the rings just above the back cover (top surface z=0)
    <group ref={hingeRef} position={[0, 0, 0.005]}>
      <group position={[PAGE_W / 2 + 0.004, 0, 0]}>
        {/* Page base — dark, visible from both sides */}
        <mesh>
          <planeGeometry args={[PAGE_W, PAGE_H]} />
          <meshStandardMaterial color="#17151a" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        {/* Front face content */}
        <group position={[0, 0, 0.0004]}>
          <PocketGrid cards={frontCards} onInspect={onInspect} />
        </group>
        {/* Back face content (faces -Z until the sheet is flipped) */}
        <group rotation={[0, Math.PI, 0]} position={[0, 0, -0.0004]}>
          <PocketGrid cards={backCards} onInspect={onInspect} />
        </group>
      </group>
    </group>
  );
}

interface BinderProps {
  cards: CardWithUrl[];
  open: boolean;
  /** true while the InspectOverlay is up — binder ignores keys/clicks */
  suspended: boolean;
  onOpenRequest: () => void;
  onPromptChange: (visible: boolean) => void;
  onInspect: (url: string) => void;
  onClosed: (relock: boolean) => void;
}

export default function Binder({
  cards,
  open,
  suspended,
  onOpenRequest,
  onPromptChange,
  onInspect,
  onClosed,
}: BinderProps) {
  const { camera, gl } = useThree();

  const rootRef = useRef<THREE.Group>(null);
  const coverRef = useRef<THREE.Group>(null);
  const sheetRefs = useRef<(THREE.Group | null)[]>([]);

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

  const tablePose = useMemo(() => {
    const pos = new THREE.Vector3(...BINDER_REST);
    // Lie flat (covers up), spine parallel to the east wall, with a slight
    // casual skew so it doesn't look machine-placed.
    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2 + 0.12, 'YXZ'),
    );
    return { pos, quat };
  }, []);

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
    } else if (dir === -1 && k > 0) {
      flipRef.current = { sheet: k - 1, from: restAngle(k - 1, k, numSheets), to: -FAN * (numSheets - (k - 1)), t: 0 };
      spreadRef.current = k - 1;
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
      const toBinder = new THREE.Vector3(...BINDER_REST).sub(camera.position);
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

    // Sheet resting angles + active flip
    const k = spreadRef.current;
    const flip = flipRef.current;
    if (flip) {
      flip.t = Math.min(1, flip.t + delta / FLIP_DURATION);
      if (flip.t >= 1) flipRef.current = null;
    }
    for (let i = 0; i < numSheets; i++) {
      const g = sheetRefs.current[i];
      if (!g) continue;
      if (flip && flip.sheet === i) {
        g.rotation.y = flip.from + (flip.to - flip.from) * easeInOutCubic(flip.t);
      } else {
        g.rotation.y = restAngle(i, k, numSheets);
      }
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
      {/* Fill light so the spread reads well anywhere in the room; only
          exists while the binder is up — walking-mode light count unchanged */}
      {open && (
        <pointLight position={[0, 0.1, 0.45]} intensity={0.35} distance={1.4} decay={2} color="#fff0dd" />
      )}

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

      {/* Sheets (hinged at the spine) */}
      {sheets.map((s, i) => (
        <BinderSheet
          key={i}
          frontCards={s.front}
          backCards={s.back}
          onInspect={(url) => {
            if (phaseRef.current === 'open' && !suspendedRef.current) {
              callbacksRef.current.onInspect(url);
            }
          }}
          hingeRef={(g) => { sheetRefs.current[i] = g; }}
        />
      ))}

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
