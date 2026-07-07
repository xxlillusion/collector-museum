import * as THREE from 'three';

// Shared texture cache for binder sleeve cards (museum + hall).
//
// Sleeve pockets are small on screen (~1/3 of a page), so decoding the full
// ≤1600px stored image per pocket was pure waste: 36 concurrent decodes +
// full-res GPU uploads landed mid-open-animation and stalled the frame loop
// for seconds. Instead, decode each blob once via createImageBitmap — off the
// main thread, resized to a 512px cap — and cache the resulting texture by
// item id (card/inventory images are immutable per id, so no invalidation).
//
// Entries are refcounted by mounted sleeves; eviction (LRU past MAX_CACHED)
// only touches unpinned entries, so an open binder can never lose a texture
// it is currently displaying.

const MAX_HEIGHT = 512;
const MAX_CACHED = 120; // ≈1MB each at 512px → ~120MB GPU ceiling

interface Entry {
  promise: Promise<THREE.Texture>;
  texture: THREE.Texture | null;
  refs: number;
  lastUse: number;
}

let clock = 0;
const cache = new Map<string, Entry>();

async function decode(blob: Blob): Promise<THREE.Texture> {
  // flipY must happen at decode time — WebGL ignores UNPACK_FLIP_Y for
  // ImageBitmap uploads, so the texture itself is marked flipY = false.
  let bmp = await createImageBitmap(blob, { imageOrientation: 'flipY' });
  if (bmp.height > MAX_HEIGHT) {
    const scaled = await createImageBitmap(bmp, {
      resizeWidth: Math.max(1, Math.round((bmp.width / bmp.height) * MAX_HEIGHT)),
      resizeHeight: MAX_HEIGHT,
      resizeQuality: 'medium',
    });
    bmp.close();
    bmp = scaled;
  }
  const texture = new THREE.Texture(bmp);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function ensure(id: string, blob: Blob): Entry {
  let entry = cache.get(id);
  if (!entry) {
    const e: Entry = { promise: null!, texture: null, refs: 0, lastUse: 0 };
    e.promise = decode(blob).then(
      (t) => {
        e.texture = t;
        return t;
      },
      (err) => {
        cache.delete(id); // don't poison the id — a later acquire retries
        throw err;
      },
    );
    cache.set(id, e);
    entry = e;
    evict();
  }
  entry.lastUse = ++clock;
  return entry;
}

function evict() {
  while (cache.size > MAX_CACHED) {
    let oldestKey: string | null = null;
    let oldestUse = Infinity;
    for (const [key, e] of cache) {
      if (e.refs > 0 || !e.texture) continue; // pinned or still decoding
      if (e.lastUse < oldestUse) {
        oldestUse = e.lastUse;
        oldestKey = key;
      }
    }
    if (oldestKey === null) return;
    const e = cache.get(oldestKey)!;
    (e.texture!.image as ImageBitmap).close?.();
    e.texture!.dispose();
    cache.delete(oldestKey);
  }
}

/** Pin a sleeve texture for a mounted pocket; call release() on unmount. */
export function acquireSleeveTexture(
  id: string,
  blob: Blob,
): { promise: Promise<THREE.Texture>; release: () => void } {
  const entry = ensure(id, blob);
  entry.refs++;
  let released = false;
  return {
    promise: entry.promise,
    release: () => {
      if (released) return;
      released = true;
      entry.refs--;
    },
  };
}

/** Warm the cache without pinning — e.g. while the player gazes at a closed
 *  binder, so the first spread is already decoded when they press F. */
export function prefetchSleeveTexture(id: string, blob: Blob): void {
  ensure(id, blob).promise.catch(() => {});
}
