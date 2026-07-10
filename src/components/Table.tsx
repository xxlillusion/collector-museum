import { useMemo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ROOM, TABLE } from './Room';
import {
  CLOTH_COLOR,
  CLOTH_ROUGHNESS,
  CLOTH_ENVMAP_INTENSITY,
  CLOTH_W,
  CLOTH_D,
  CLOTH_TOP_Y,
  DRAPE_H,
  makeTopGeometry,
  makeDrapeGeometry,
  makeBannerTexture,
} from './tableGeometry';

// Vendor table against the east wall. Local +Z faces into the room (-X world)
// after the group's -90° Y rotation. Dimensions live in Room.tsx (TABLE);
// cloth geometry recipes are shared with VendorTables in tableGeometry.ts.

/**
 * Banner image letterboxed on the front drape, sharing its fold geometry.
 */
function BannerDrape({ url, geometry }: { url: string; geometry: THREE.PlaneGeometry }) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let cancelled = false;
    let tex: THREE.CanvasTexture | null = null;
    const img = new Image();
    // CORS opt-in for cloud banner URLs (canvas taint); no-op for blob: URLs.
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      tex = makeBannerTexture(img);
      if (tex) setTexture(tex);
    };
    img.src = url;
    return () => {
      cancelled = true;
      tex?.dispose();
    };
  }, [url]);

  if (!texture) return null;
  return (
    <mesh geometry={geometry} position={[0, 0, 0.004]} receiveShadow>
      <meshStandardMaterial map={texture} roughness={CLOTH_ROUGHNESS} envMapIntensity={CLOTH_ENVMAP_INTENSITY} />
    </mesh>
  );
}

interface TableProps {
  bannerUrl: string | null;
}

export default function Table({ bannerUrl }: TableProps) {
  const spotRef = useRef<THREE.SpotLight>(null);

  const topGeo = useMemo(makeTopGeometry, []);
  const frontGeo = useMemo(() => makeDrapeGeometry(CLOTH_W, 0.4), []);
  const sideGeoL = useMemo(() => makeDrapeGeometry(CLOTH_D, 1.9), []);
  const sideGeoR = useMemo(() => makeDrapeGeometry(CLOTH_D, 4.2), []);

  // Warm spot aimed down at the table (the bench key light barely reaches here)
  const spotTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(TABLE.x, TABLE.topH, 0);
    return o;
  }, []);

  useEffect(() => {
    if (spotRef.current) spotRef.current.target = spotTarget;
  }, [spotTarget]);

  const legX = TABLE.topW / 2 - 0.18;

  return (
    <group>
      {/* Rotated so local +Z (drape front) faces into the room (-X world) */}
      <group position={[TABLE.x, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        {/* Table top — laminate, mostly hidden under the cloth */}
        <mesh position={[0, TABLE.topH - 0.025, 0]} castShadow receiveShadow>
          <boxGeometry args={[TABLE.topW, 0.05, TABLE.topD]} />
          <meshStandardMaterial color="#d8d4cb" roughness={0.6} />
        </mesh>

        {/* Folding U-frame legs near each end */}
        {[-1, 1].map((s) => (
          <group key={`legs-${s}`} position={[s * legX, 0, 0]}>
            {[-1, 1].map((z) => (
              <mesh
                key={`leg-${z}`}
                position={[0, (TABLE.topH - 0.05) / 2, z * (TABLE.topD / 2 - 0.08)]}
                castShadow
              >
                <cylinderGeometry args={[0.018, 0.018, TABLE.topH - 0.05, 10]} />
                <meshStandardMaterial color="#6f6f6f" roughness={0.35} metalness={0.8} />
              </mesh>
            ))}
            {/* Cross bar near the floor */}
            <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.016, 0.016, TABLE.topD - 0.16, 10]} />
              <meshStandardMaterial color="#6f6f6f" roughness={0.35} metalness={0.8} />
            </mesh>
          </group>
        ))}

        {/* Tablecloth — sagging top */}
        <mesh
          geometry={topGeo}
          position={[0, CLOTH_TOP_Y, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <meshStandardMaterial color={CLOTH_COLOR} roughness={CLOTH_ROUGHNESS} envMapIntensity={CLOTH_ENVMAP_INTENSITY} side={THREE.DoubleSide} />
        </mesh>

        {/* Front drape (faces the room) */}
        <group position={[0, CLOTH_TOP_Y - DRAPE_H / 2, CLOTH_D / 2]}>
          <mesh geometry={frontGeo} receiveShadow>
            <meshStandardMaterial color={CLOTH_COLOR} roughness={CLOTH_ROUGHNESS} envMapIntensity={CLOTH_ENVMAP_INTENSITY} side={THREE.DoubleSide} />
          </mesh>
          {bannerUrl && <BannerDrape url={bannerUrl} geometry={frontGeo} />}
        </group>

        {/* Side drapes */}
        <group
          position={[-CLOTH_W / 2, CLOTH_TOP_Y - DRAPE_H / 2, 0]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <mesh geometry={sideGeoL} receiveShadow>
            <meshStandardMaterial color={CLOTH_COLOR} roughness={CLOTH_ROUGHNESS} envMapIntensity={CLOTH_ENVMAP_INTENSITY} side={THREE.DoubleSide} />
          </mesh>
        </group>
        <group
          position={[CLOTH_W / 2, CLOTH_TOP_Y - DRAPE_H / 2, 0]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <mesh geometry={sideGeoR} receiveShadow>
            <meshStandardMaterial color={CLOTH_COLOR} roughness={CLOTH_ROUGHNESS} envMapIntensity={CLOTH_ENVMAP_INTENSITY} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </group>

      {/* Warm table spot on the ceiling, matching the wall track fixtures */}
      <primitive object={spotTarget} />
      <spotLight
        ref={spotRef}
        position={[TABLE.x - 1.1, ROOM.height - 0.18, 0]}
        angle={0.7}
        penumbra={0.95}
        intensity={28}
        decay={2}
        distance={8}
        color="#ffe6bd"
      />
      <group position={[TABLE.x - 1.1, ROOM.height - 0.16, 0]} rotation={[0, 0, -0.5]}>
        <mesh>
          <cylinderGeometry args={[0.055, 0.07, 0.22, 16]} />
          <meshStandardMaterial color="#111111" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[0, -0.115, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.05, 16]} />
          <meshStandardMaterial
            color="#fff3dd"
            emissive="#ffdfa8"
            emissiveIntensity={6}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}
