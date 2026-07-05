import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { TABLE } from './Room';
import {
  CLOTH_W,
  CLOTH_D,
  CLOTH_TOP_Y,
  CLOTH_ROUGHNESS,
  DRAPE_H,
  getTableGeometries,
  getClothMaterial,
  makeBannerTexture,
} from './tableGeometry';
import type { TablePlacement } from '../lib/vendorPlan';

// All hall tables are identical 6ft units, so N tables render as one
// instancedMesh per part (~8 draw calls total). Local frame matches the
// museum Table: long axis on X, front drape toward +Z, origin on the floor.

interface PartSpec {
  geometry: THREE.BufferGeometry;
  /** Local transform of this part within one table. */
  local: THREE.Matrix4;
  material: THREE.Material;
  castShadow?: boolean;
}

function InstancedPart({
  spec,
  tables,
}: {
  spec: PartSpec;
  tables: TablePlacement[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const table = new THREE.Matrix4();
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      table.makeRotationY(t.rotationY);
      table.setPosition(t.position[0], t.position[1], t.position[2]);
      m.multiplyMatrices(table, spec.local);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tables, spec.local]);

  return (
    <instancedMesh
      ref={ref}
      args={[spec.geometry, spec.material, tables.length]}
      castShadow={spec.castShadow ?? false}
      receiveShadow
    />
  );
}

interface VendorTablesProps {
  tables: TablePlacement[];
  bannerUrl: string | null;
}

export default function VendorTables({ tables, bannerUrl }: VendorTablesProps) {
  const geos = useMemo(getTableGeometries, []);

  // Banner texture shared by every front drape (one material, one draw call)
  const [bannerTex, setBannerTex] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    if (!bannerUrl) {
      setBannerTex(null);
      return;
    }
    let cancelled = false;
    let tex: THREE.CanvasTexture | null = null;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      tex = makeBannerTexture(img);
      if (tex) setBannerTex(tex);
    };
    img.src = bannerUrl;
    return () => {
      cancelled = true;
      tex?.dispose();
    };
  }, [bannerUrl]);

  const parts = useMemo<PartSpec[]>(() => {
    const cloth = getClothMaterial();
    const boardMat = new THREE.MeshStandardMaterial({ color: '#d8d4cb', roughness: 0.6 });
    const legMat = new THREE.MeshStandardMaterial({
      color: '#6f6f6f',
      roughness: 0.35,
      metalness: 0.8,
    });
    const frontMat = bannerTex
      ? new THREE.MeshStandardMaterial({
          map: bannerTex,
          roughness: CLOTH_ROUGHNESS,
          side: THREE.DoubleSide,
        })
      : cloth;

    const compose = (
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
    ): THREE.Matrix4 => {
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0));
      m.setPosition(x, y, z);
      return m;
    };

    return [
      // Laminate board under the cloth
      {
        geometry: geos.board,
        local: compose(0, TABLE.topH - 0.025, 0),
        material: boardMat,
        castShadow: true,
      },
      // Legs (positions baked into the merged geometry)
      { geometry: geos.legs, local: new THREE.Matrix4(), material: legMat, castShadow: true },
      // Sagging cloth top
      { geometry: geos.top, local: compose(0, CLOTH_TOP_Y, 0, -Math.PI / 2), material: cloth },
      // Drapes: front (+Z, banner side), back, and both ends
      {
        geometry: geos.front,
        local: compose(0, CLOTH_TOP_Y - DRAPE_H / 2, CLOTH_D / 2),
        material: frontMat,
        castShadow: true,
      },
      {
        geometry: geos.back,
        local: compose(0, CLOTH_TOP_Y - DRAPE_H / 2, -CLOTH_D / 2, 0, Math.PI),
        material: cloth,
        castShadow: true,
      },
      {
        geometry: geos.sideL,
        local: compose(-CLOTH_W / 2, CLOTH_TOP_Y - DRAPE_H / 2, 0, 0, -Math.PI / 2),
        material: cloth,
      },
      {
        geometry: geos.sideR,
        local: compose(CLOTH_W / 2, CLOTH_TOP_Y - DRAPE_H / 2, 0, 0, Math.PI / 2),
        material: cloth,
      },
    ];
  }, [geos, bannerTex]);

  return (
    <group>
      {parts.map((spec, i) => (
        <InstancedPart key={i} spec={spec} tables={tables} />
      ))}
    </group>
  );
}
