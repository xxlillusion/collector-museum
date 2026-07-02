import { useTexture } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useState, useEffect } from 'react';
import * as THREE from 'three';

export const MAT_BORDER = 0.09;   // white passe-partout visible around the image
export const FRAME_BORDER = 0.07; // wood frame width
const FRAME_DEPTH = 0.08;

// Total extra width/height a frame adds around the image content
export const FRAME_EXTRA = (MAT_BORDER + FRAME_BORDER) * 2;

interface CardFrameProps {
  position: [number, number, number];
  rotation: [number, number, number];
  imageUrl: string;
  /** Image content width in world units */
  width: number;
  /** Image content height in world units */
  height: number;
  onClick: () => void;
}

interface FramedCardProps {
  imageUrl: string;
  width: number;
  height: number;
  onClick: () => void;
}

function FramedCard({ imageUrl, width, height, onClick }: FramedCardProps) {
  const texture = useTexture(imageUrl);
  const [hovered, setHovered] = useState(false);

  const innerW = width + MAT_BORDER * 2; // mat opening
  const innerH = height + MAT_BORDER * 2;
  const outerW = innerW + FRAME_BORDER * 2;

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <group>
      {/* Wood frame — four mitred sides */}
      {([
        { pos: [0, (innerH + FRAME_BORDER) / 2, 0] as const, size: [outerW, FRAME_BORDER, FRAME_DEPTH] as const },
        { pos: [0, -(innerH + FRAME_BORDER) / 2, 0] as const, size: [outerW, FRAME_BORDER, FRAME_DEPTH] as const },
        { pos: [-(innerW + FRAME_BORDER) / 2, 0, 0] as const, size: [FRAME_BORDER, innerH, FRAME_DEPTH] as const },
        { pos: [(innerW + FRAME_BORDER) / 2, 0, 0] as const, size: [FRAME_BORDER, innerH, FRAME_DEPTH] as const },
      ]).map((side, i) => (
        <mesh key={i} position={[...side.pos]} castShadow>
          <boxGeometry args={[...side.size]} />
          <meshPhysicalMaterial
            color="#241d16"
            roughness={0.32}
            metalness={0.05}
            clearcoat={0.7}
            clearcoatRoughness={0.25}
          />
        </mesh>
      ))}

      {/* White passe-partout mat (recessed) */}
      <mesh position={[0, 0, 0.012]}>
        <planeGeometry args={[innerW, innerH]} />
        <meshStandardMaterial color="#f5f2ea" roughness={0.9} />
      </mesh>

      {/* The artwork itself */}
      <mesh
        position={[0, 0, 0.022]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.delta > 8) return; // ignore clicks that were drags (touch look)
          onClick();
        }}
        onPointerEnter={() => { setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerLeave={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      >
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.45}
          metalness={0.0}
          emissive={hovered ? '#3a3220' : '#000000'}
          emissiveIntensity={hovered ? 0.9 : 0}
        />
      </mesh>

      {/* Glass pane — subtle glare from the environment */}
      <mesh position={[0, 0, FRAME_DEPTH / 2 - 0.008]} raycast={() => null}>
        <planeGeometry args={[innerW, innerH]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.1}
          roughness={0.04}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.05}
          envMapIntensity={1.6}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export default function CardFrame({ position, rotation, imageUrl, width, height, onClick }: CardFrameProps) {
  return (
    <group position={position} rotation={rotation}>
      <FramedCard imageUrl={imageUrl} width={width} height={height} onClick={onClick} />
    </group>
  );
}
