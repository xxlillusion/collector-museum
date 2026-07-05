import { MeshReflectorMaterial } from '@react-three/drei';
import { isTouchDevice } from './GalleryControls';

// Convention-hall shell, parameterized from the floor plan. Same construction
// as the museum Room (reflective floor, plain walls, baseboards) with a
// utilitarian expo palette — Room.tsx stays untouched because its ROOM consts
// feed half the codebase.

const WALL_COLOR = '#c9c5bc';
const BASE_COLOR = '#8a857c';

interface VendorRoomProps {
  width: number;
  depth: number;
  height: number;
}

export default function VendorRoom({ width, depth, height }: VendorRoomProps) {
  return (
    <group>
      {/* Floor — polished concrete with blurred real-time reflections */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <MeshReflectorMaterial
          blur={[400, 100]}
          resolution={isTouchDevice ? 256 : 512}
          mixBlur={1}
          mixStrength={7}
          roughness={0.88}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#1b1917"
          metalness={0.4}
          mirror={0.45}
        />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#24221f" roughness={0.95} />
      </mesh>

      {/* North wall (z = -depth/2) */}
      <mesh position={[0, height / 2, -depth / 2]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.92} />
      </mesh>
      {/* South wall */}
      <mesh position={[0, height / 2, depth / 2]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.92} />
      </mesh>
      {/* East wall */}
      <mesh position={[width / 2, height / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.92} />
      </mesh>
      {/* West wall */}
      <mesh position={[-width / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.92} />
      </mesh>

      {/* Baseboards */}
      {[
        { pos: [0, 0.09, -depth / 2 + 0.02], rot: 0, len: width },
        { pos: [0, 0.09, depth / 2 - 0.02], rot: Math.PI, len: width },
        { pos: [width / 2 - 0.02, 0.09, 0], rot: -Math.PI / 2, len: depth },
        { pos: [-width / 2 + 0.02, 0.09, 0], rot: Math.PI / 2, len: depth },
      ].map(({ pos, rot, len }, i) => (
        <mesh key={i} position={pos as [number, number, number]} rotation={[0, rot, 0]}>
          <boxGeometry args={[len, 0.18, 0.03]} />
          <meshStandardMaterial color={BASE_COLOR} roughness={0.7} />
        </mesh>
      ))}

      {/* Base lighting — a big hall reads as evenly lit */}
      <hemisphereLight args={['#e8e2d5', '#2a2620', 0.5]} />
      <ambientLight intensity={0.12} />
    </group>
  );
}
