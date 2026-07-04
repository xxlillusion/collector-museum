import { MeshReflectorMaterial } from '@react-three/drei';
import { isTouchDevice } from './GalleryControls';

// Room dimensions (in Three.js units)
export const ROOM = {
  width: 20,   // X axis
  height: 5,   // Y axis
  depth: 12,   // Z axis
};

// Distance of the ceiling light track from each display wall
export const TRACK_OFFSET = 1.7;

// Vendor table against the east wall (lives here, not in Table.tsx, so
// GalleryControls can import it without a circular Table → Room →
// GalleryControls → Table dependency).
export const TABLE = {
  x: ROOM.width / 2 - 0.7,  // 9.3 — table center, top ~0.38 off the wall
  topW: 1.83,               // 6 ft folding table
  topD: 0.76,
  topH: 0.74,
};

// Where the closed binder rests (world space), on top of the tablecloth
export const BINDER_REST: [number, number, number] = [TABLE.x, TABLE.topH + 0.03, 0];

const WALL_COLOR = '#dcd6ca';
const TRIM_COLOR = '#f0ece3';

export default function Room() {
  return (
    <group>
      {/* Floor — dark polished surface with blurred real-time reflections */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <MeshReflectorMaterial
          blur={[400, 100]}
          resolution={isTouchDevice ? 512 : 1024}
          mixBlur={1}
          mixStrength={12}
          roughness={0.85}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#16130f"
          metalness={0.55}
          mirror={0.5}
        />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.height, 0]}>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial color="#2a2723" roughness={0.95} />
      </mesh>

      {/* North wall (z = -depth/2) */}
      <mesh position={[0, ROOM.height / 2, -ROOM.depth / 2]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.height]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.92} />
      </mesh>

      {/* South wall (z = +depth/2) */}
      <mesh position={[0, ROOM.height / 2, ROOM.depth / 2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.height]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.92} />
      </mesh>

      {/* East wall (x = +width/2) */}
      <mesh position={[ROOM.width / 2, ROOM.height / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM.depth, ROOM.height]} />
        <meshStandardMaterial color="#d2ccbf" roughness={0.92} />
      </mesh>

      {/* West wall (x = -width/2) */}
      <mesh position={[-ROOM.width / 2, ROOM.height / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM.depth, ROOM.height]} />
        <meshStandardMaterial color="#d2ccbf" roughness={0.92} />
      </mesh>

      {/* Baseboards */}
      {([
        { pos: [0, 0.11, -ROOM.depth / 2 + 0.03] as const, size: [ROOM.width, 0.22, 0.06] as const },
        { pos: [0, 0.11, ROOM.depth / 2 - 0.03] as const, size: [ROOM.width, 0.22, 0.06] as const },
        { pos: [ROOM.width / 2 - 0.03, 0.11, 0] as const, size: [0.06, 0.22, ROOM.depth] as const },
        { pos: [-ROOM.width / 2 + 0.03, 0.11, 0] as const, size: [0.06, 0.22, ROOM.depth] as const },
      ]).map((b, i) => (
        <mesh key={`base-${i}`} position={[...b.pos]}>
          <boxGeometry args={[...b.size]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.5} />
        </mesh>
      ))}

      {/* Crown molding */}
      {([
        { pos: [0, ROOM.height - 0.09, -ROOM.depth / 2 + 0.04] as const, size: [ROOM.width, 0.18, 0.08] as const },
        { pos: [0, ROOM.height - 0.09, ROOM.depth / 2 - 0.04] as const, size: [ROOM.width, 0.18, 0.08] as const },
        { pos: [ROOM.width / 2 - 0.04, ROOM.height - 0.09, 0] as const, size: [0.08, 0.18, ROOM.depth] as const },
        { pos: [-ROOM.width / 2 + 0.04, ROOM.height - 0.09, 0] as const, size: [0.08, 0.18, ROOM.depth] as const },
      ]).map((b, i) => (
        <mesh key={`crown-${i}`} position={[...b.pos]}>
          <boxGeometry args={[...b.size]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.5} />
        </mesh>
      ))}

      {/* Ceiling light tracks (north + south display walls) */}
      {[-1, 1].map((side) => (
        <mesh
          key={`track-${side}`}
          position={[0, ROOM.height - 0.05, side * (ROOM.depth / 2 - TRACK_OFFSET)]}
        >
          <boxGeometry args={[ROOM.width - 3, 0.07, 0.09]} />
          <meshStandardMaterial color="#0e0e0e" roughness={0.4} metalness={0.8} />
        </mesh>
      ))}

      {/* Central bench */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.6, 0.1, 0.8]} />
          <meshPhysicalMaterial color="#3a2c20" roughness={0.35} clearcoat={0.5} clearcoatRoughness={0.3} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={`leg-${s}`} position={[s * 1.05, 0.2, 0]} castShadow>
            <boxGeometry args={[0.08, 0.4, 0.7]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.35} metalness={0.85} />
          </mesh>
        ))}
      </group>

      {/* Base lighting — kept low so the spotlights do the painting */}
      <hemisphereLight intensity={0.18} color="#fff4e0" groundColor="#2b241c" />
      <ambientLight intensity={0.06} />

      {/* Key light over the bench — the main shadow caster */}
      <spotLight
        position={[0, ROOM.height - 0.15, 0]}
        angle={0.65}
        penumbra={1}
        intensity={55}
        decay={2}
        distance={12}
        color="#ffedd0"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-radius={6}
      />
    </group>
  );
}
