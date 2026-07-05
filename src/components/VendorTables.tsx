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
    // `spec` (not just spec.local): a material/geometry change makes R3F
    // recreate the mesh via args, and the fresh mesh needs its matrices again
  }, [tables, spec]);

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
  /** Per-vendor banner object URLs by banner id (VendorRect.bannerId). */
  vendorBannerUrls?: Map<string, string>;
}

/** Load banner textures for each unique URL; dispose replaced ones. */
function useBannerTextures(urls: string[]): Map<string, THREE.CanvasTexture> {
  const [textures, setTextures] = useState<Map<string, THREE.CanvasTexture>>(new Map());
  const key = urls.join('\n');
  useEffect(() => {
    let cancelled = false;
    const loaded = new Map<string, THREE.CanvasTexture>();
    if (urls.length === 0) {
      setTextures(new Map());
      return;
    }
    let pending = urls.length;
    for (const url of urls) {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) {
          const tex = makeBannerTexture(img);
          if (tex) loaded.set(url, tex);
        }
        if (--pending === 0 && !cancelled) setTextures(new Map(loaded));
      };
      img.onerror = () => {
        if (--pending === 0 && !cancelled) setTextures(new Map(loaded));
      };
      img.src = url;
    }
    return () => {
      cancelled = true;
      for (const tex of loaded.values()) tex.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return textures;
}

export default function VendorTables({ tables, bannerUrl, vendorBannerUrls }: VendorTablesProps) {
  const geos = useMemo(getTableGeometries, []);

  // Tables grouped by the front-drape texture they resolve to: their vendor
  // banner when it exists, else the global banner, else plain cloth. One
  // instanced front drape per group — draw calls grow with unique banners
  // (a handful), never with table count.
  const groups = useMemo(() => {
    const byUrl = new Map<string | null, TablePlacement[]>();
    for (const t of tables) {
      const url =
        (t.bannerId ? vendorBannerUrls?.get(t.bannerId) : undefined) ?? bannerUrl ?? null;
      const arr = byUrl.get(url);
      if (arr) arr.push(t);
      else byUrl.set(url, [t]);
    }
    return byUrl;
  }, [tables, bannerUrl, vendorBannerUrls]);

  const textures = useBannerTextures(
    useMemo(() => [...groups.keys()].filter((u): u is string => u !== null), [groups]),
  );

  // Shared parts (everything except the front drape) — one draw call each
  const parts = useMemo<PartSpec[]>(() => {
    const cloth = getClothMaterial();
    const boardMat = new THREE.MeshStandardMaterial({ color: '#d8d4cb', roughness: 0.6 });
    const legMat = new THREE.MeshStandardMaterial({
      color: '#6f6f6f',
      roughness: 0.35,
      metalness: 0.8,
    });

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
      // Drapes: back and both ends (front is per banner group below)
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
  }, [geos]);

  const frontLocal = useMemo(() => compose(0, CLOTH_TOP_Y - DRAPE_H / 2, CLOTH_D / 2), []);
  const frontMats = useMemo(() => {
    const mats = new Map<string, THREE.MeshStandardMaterial>();
    for (const [url, tex] of textures) {
      mats.set(url, new THREE.MeshStandardMaterial({
        map: tex,
        roughness: CLOTH_ROUGHNESS,
        side: THREE.DoubleSide,
      }));
    }
    return mats;
  }, [textures]);
  useEffect(() => () => {
    for (const m of frontMats.values()) m.dispose();
  }, [frontMats]);

  return (
    <group>
      {parts.map((spec, i) => (
        <InstancedPart key={i} spec={spec} tables={tables} />
      ))}
      {[...groups.entries()].map(([url, group]) => (
        <InstancedPart
          key={url ?? '__cloth__'}
          spec={{
            geometry: geos.front,
            local: frontLocal,
            material: (url !== null && frontMats.get(url)) || getClothMaterial(),
            castShadow: true,
          }}
          tables={group}
        />
      ))}
    </group>
  );
}

function compose(x: number, y: number, z: number, rx = 0, ry = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0));
  m.setPosition(x, y, z);
  return m;
}
