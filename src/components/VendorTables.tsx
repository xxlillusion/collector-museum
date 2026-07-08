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
  makeNameTexture,
} from './tableGeometry';
import type { TablePlacement } from '../lib/vendorPlan';

/** What a vendor contributes to its tables' front drape. */
export interface VendorDrapeInfo {
  name: string;
  bannerUrl: string | null;
}

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
    const s = new THREE.Vector3();
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      table.makeRotationY(t.rotationY);
      // Stretch-to-fit boxes: scale in the table's local frame so part
      // offsets (legs, drapes) ride out to the stretched edges. Y stays 1.
      table.scale(s.set(t.sx ?? 1, 1, t.sz ?? 1));
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
  /** Legacy per-box banner object URLs by banner id (VendorRect.bannerId). */
  vendorBannerUrls?: Map<string, string>;
  /** Assigned vendors by id — banner image, or name lettered on the cloth. */
  vendors?: Map<string, VendorDrapeInfo>;
}

/** One front-drape texture to produce: an image letterboxed on cloth, or a
 *  vendor name lettered on cloth. `key` is the table-group key. */
interface DrapeDesc {
  key: string;
  kind: 'image' | 'text';
  url?: string;
  text?: string;
}

/** Build/load one texture per descriptor; dispose replaced ones. */
function useDrapeTextures(descs: DrapeDesc[]): Map<string, THREE.CanvasTexture> {
  const [textures, setTextures] = useState<Map<string, THREE.CanvasTexture>>(new Map());
  const key = descs.map((d) => `${d.key}|${d.kind}|${d.url ?? d.text ?? ''}`).join('\n');
  useEffect(() => {
    let cancelled = false;
    const loaded = new Map<string, THREE.CanvasTexture>();
    if (descs.length === 0) {
      setTextures(new Map());
      return;
    }
    // Text textures are synchronous; images resolve the async remainder
    const images = descs.filter((d) => d.kind === 'image' && d.url);
    for (const d of descs) {
      if (d.kind === 'text') {
        const tex = makeNameTexture(d.text ?? '');
        if (tex) loaded.set(d.key, tex);
      }
    }
    if (images.length === 0) {
      setTextures(new Map(loaded));
      return () => {
        cancelled = true;
        for (const tex of loaded.values()) tex.dispose();
      };
    }
    let pending = images.length;
    for (const d of images) {
      const img = new Image();
      // Cloud banners are Supabase CDN URLs: without CORS opt-in the canvas
      // taints and texSubImage2D throws (the drape silently falls back to
      // plain cloth). blob: object URLs ignore the attribute, so the
      // local/guest path is unaffected.
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!cancelled) {
          const tex = makeBannerTexture(img);
          if (tex) loaded.set(d.key, tex);
        }
        if (--pending === 0 && !cancelled) setTextures(new Map(loaded));
      };
      img.onerror = () => {
        if (--pending === 0 && !cancelled) setTextures(new Map(loaded));
      };
      img.src = d.url!;
    }
    return () => {
      cancelled = true;
      for (const tex of loaded.values()) tex.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return textures;
}

export default function VendorTables({ tables, bannerUrl, vendorBannerUrls, vendors }: VendorTablesProps) {
  const geos = useMemo(getTableGeometries, []);

  // Tables grouped by the front-drape texture they resolve to: the assigned
  // vendor's banner, else the vendor's name lettered on the cloth, else the
  // legacy per-box banner, else the global banner, else plain cloth. One
  // instanced front drape per group — draw calls grow with unique vendors
  // (a handful), never with table count.
  const { groups, descs } = useMemo(() => {
    const groups = new Map<string, TablePlacement[]>();
    const descMap = new Map<string, DrapeDesc>();
    for (const t of tables) {
      const vendor = t.vendorId ? vendors?.get(t.vendorId) : undefined;
      let key: string;
      if (vendor?.bannerUrl) {
        key = `vb:${t.vendorId}`;
        descMap.set(key, { key, kind: 'image', url: vendor.bannerUrl });
      } else if (vendor) {
        key = `vn:${t.vendorId}`;
        descMap.set(key, { key, kind: 'text', text: vendor.name });
      } else {
        const url =
          (t.bannerId ? vendorBannerUrls?.get(t.bannerId) : undefined) ?? bannerUrl ?? null;
        if (url) {
          key = `img:${url}`;
          descMap.set(key, { key, kind: 'image', url });
        } else {
          key = 'plain';
        }
      }
      const arr = groups.get(key);
      if (arr) arr.push(t);
      else groups.set(key, [t]);
    }
    return { groups, descs: [...descMap.values()] };
  }, [tables, bannerUrl, vendorBannerUrls, vendors]);

  const textures = useDrapeTextures(descs);

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
    for (const [key, tex] of textures) {
      mats.set(key, new THREE.MeshStandardMaterial({
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
      {[...groups.entries()].map(([key, group]) => (
        <InstancedPart
          key={key}
          spec={{
            geometry: geos.front,
            local: frontLocal,
            material: frontMats.get(key) ?? getClothMaterial(),
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
