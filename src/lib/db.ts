import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface CardRecord {
  id: string;
  name: string;
  imageBlob: Blob;
  addedAt: number;
  // Card metadata (all optional; cloud side lives in collections.metadata
  // jsonb — no migration needed). Shown as the museum placard.
  setName?: string;
  cardNumber?: string;
  year?: string;
  grade?: string;
  notes?: string;
}

/** The editable (non-image) fields of a card. */
export type CardPatch = Partial<
  Pick<CardRecord, 'name' | 'setName' | 'cardNumber' | 'year' | 'grade' | 'notes'>
>;

export interface SettingRecord {
  key: string;
  blob: Blob;
}

/** A snapshot of a Convention View plan (image + rect metadata). */
export interface SavedPlanRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  planBlob: Blob;
  /** JSON.stringify(VendorPlanMeta) — rects (rotation, vendorIds), scale, start */
  metaJson: string;
  /**
   * Legacy (pre-vendor-entity) banner blobs snapshotted with the plan.
   * New saves write []; vendor banners now live on VendorRecord and rects
   * reference vendors by id, resolved live.
   */
  banners: { id: string; blob: Blob }[];
  /**
   * The show's date (ISO yyyy-mm-dd). Optional — plans without a date never
   * count toward a vendor's derived "shows attended".
   */
  showDate?: string;
}

/** A manually added "show attended" entry on a vendor. */
export interface VendorShowEntry {
  id: string;
  name: string;
  /** ISO yyyy-mm-dd */
  date: string;
}

/** A vendor — first-class entity referenced from floor-plan rects by id. */
export interface VendorRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Table banner image; absent = vendor name rendered on the cloth. */
  bannerBlob?: Blob;
  /** Manual entries; plan-derived shows are computed live, never stored. */
  manualShows: VendorShowEntry[];
  /** Public contact links (0005) — empty/absent = not shown. */
  website?: string;
  contactEmail?: string;
  /** Handle without the @. */
  instagram?: string;
}

/** Sale status of an inventory item; absent on pre-0005 records = 'forSale'. */
export type InventoryStatus = 'forSale' | 'sold' | 'display';

/** One captioned inventory image belonging to a vendor. */
export interface InventoryItemRecord {
  id: string;
  vendorId: string;
  imageBlob: Blob;
  caption: string;
  /** Future accounts feature (public on the vendor profile) — stored, unused. */
  visible: boolean;
  /** width / height, computed once at upload. */
  aspect: number;
  addedAt: number;
  /** Asking price in the vendor's currency; absent = no price shown. */
  price?: number;
  status?: InventoryStatus;
  /** Free text: "NM", "PSA 9", ... empty/absent = unstated. */
  condition?: string;
}

interface MuseumDB extends DBSchema {
  cards: {
    key: string;
    value: CardRecord;
    indexes: { addedAt: number };
  };
  settings: {
    key: string;
    value: SettingRecord;
  };
  plans: {
    key: string;
    value: SavedPlanRecord;
    indexes: { updatedAt: number };
  };
  vendors: {
    key: string;
    value: VendorRecord;
  };
  inventory: {
    key: string;
    value: InventoryItemRecord;
    indexes: { vendorId: string };
  };
}

let dbPromise: Promise<IDBPDatabase<MuseumDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MuseumDB>('vendor-museum', 4, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('cards', { keyPath: 'id' });
          store.createIndex('addedAt', 'addedAt');
        }
        if (oldVersion < 2) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (oldVersion < 3) {
          const plans = db.createObjectStore('plans', { keyPath: 'id' });
          plans.createIndex('updatedAt', 'updatedAt');
        }
        if (oldVersion < 4) {
          db.createObjectStore('vendors', { keyPath: 'id' });
          const inventory = db.createObjectStore('inventory', { keyPath: 'id' });
          inventory.createIndex('vendorId', 'vendorId');
        }
      },
    });
  }
  return dbPromise;
}

// Downscale large uploads — full-resolution photos become huge GPU textures,
// which slows scene load and can crash the WebGL context on weaker GPUs.
// Exported: the remote provider runs the same pipeline before Storage uploads.
export async function downscaleImage(file: File, maxDim = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale >= 1) {
      bmp.close();
      return file;
    }
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close();
      return file;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/webp', 0.92),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function saveCard(file: File): Promise<CardRecord> {
  const db = await getDB();
  const record: CardRecord = {
    id: crypto.randomUUID(),
    name: file.name,
    imageBlob: await downscaleImage(file),
    addedAt: Date.now(),
  };
  await db.put('cards', record);
  return record;
}

export async function getCards(): Promise<CardRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('cards', 'addedAt');
}

export async function deleteCard(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('cards', id);
}

export async function updateCard(id: string, patch: CardPatch): Promise<void> {
  const db = await getDB();
  const record = await db.get('cards', id);
  if (!record) return;
  await db.put('cards', { ...record, ...patch });
}

const BANNER_KEY = 'tableclothBanner';

export async function saveBanner(file: File): Promise<Blob> {
  const db = await getDB();
  const blob = await downscaleImage(file);
  await db.put('settings', { key: BANNER_KEY, blob });
  return blob;
}

export async function getBanner(): Promise<Blob | undefined> {
  const db = await getDB();
  const record = await db.get('settings', BANNER_KEY);
  return record?.blob;
}

export async function deleteBanner(): Promise<void> {
  const db = await getDB();
  await db.delete('settings', BANNER_KEY);
}

// Convention View — convention floor plan image + its table-rectangle metadata.
// Both live in the settings store: the image as a downscaled blob, the
// metadata as JSON serialized into a Blob (the store's value shape is
// { key, blob }, so no schema bump is needed).

const FLOORPLAN_KEY = 'vendorFloorPlan';
const PLANMETA_KEY = 'vendorPlanMeta';

export async function saveFloorPlan(file: File): Promise<Blob> {
  const db = await getDB();
  const blob = await downscaleImage(file);
  await db.put('settings', { key: FLOORPLAN_KEY, blob });
  return blob;
}

export async function getFloorPlan(): Promise<Blob | undefined> {
  const db = await getDB();
  const record = await db.get('settings', FLOORPLAN_KEY);
  return record?.blob;
}

export async function deleteFloorPlan(): Promise<void> {
  const db = await getDB();
  await db.delete('settings', FLOORPLAN_KEY);
  await db.delete('settings', PLANMETA_KEY);
}

// Per-vendor banner images, one settings slot per banner: `vendorBanner:<id>`.
// Rects reference them by id (VendorRect.bannerId).

const VENDOR_BANNER_PREFIX = 'vendorBanner:';

export async function saveVendorBanner(file: File): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const blob = await downscaleImage(file);
  await db.put('settings', { key: VENDOR_BANNER_PREFIX + id, blob });
  return id;
}

export async function putVendorBanner(id: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key: VENDOR_BANNER_PREFIX + id, blob });
}

export async function getVendorBanners(): Promise<Map<string, Blob>> {
  const db = await getDB();
  const records = await db.getAll(
    'settings',
    IDBKeyRange.bound(VENDOR_BANNER_PREFIX, VENDOR_BANNER_PREFIX + '￿'),
  );
  return new Map(records.map((r) => [r.key.slice(VENDOR_BANNER_PREFIX.length), r.blob]));
}

export async function deleteVendorBanner(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('settings', VENDOR_BANNER_PREFIX + id);
}

export async function deleteAllVendorBanners(): Promise<void> {
  const db = await getDB();
  await db.delete(
    'settings',
    IDBKeyRange.bound(VENDOR_BANNER_PREFIX, VENDOR_BANNER_PREFIX + '￿'),
  );
}

export async function savePlanMeta(meta: unknown): Promise<void> {
  const db = await getDB();
  const blob = new Blob([JSON.stringify(meta)], { type: 'application/json' });
  await db.put('settings', { key: PLANMETA_KEY, blob });
}

export async function getPlanMetaBlob(): Promise<Blob | undefined> {
  const db = await getDB();
  const record = await db.get('settings', PLANMETA_KEY);
  return record?.blob;
}

export async function deletePlanMeta(): Promise<void> {
  const db = await getDB();
  await db.delete('settings', PLANMETA_KEY);
}

/** Raw put into the working floor-plan slot — no re-downscale (snapshot restore). */
export async function putFloorPlanBlob(blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key: FLOORPLAN_KEY, blob });
}

// Saved plan snapshots (`plans` store, schema v3)

export async function savePlanRecord(record: SavedPlanRecord): Promise<void> {
  const db = await getDB();
  await db.put('plans', record);
}

export async function getPlanRecords(): Promise<SavedPlanRecord[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex('plans', 'updatedAt');
  return records.reverse(); // newest first
}

export async function deletePlanRecord(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('plans', id);
}

// Vendors + their inventory (`vendors` / `inventory` stores, schema v4).
// Inventory lives in its own store so vendor lists never deserialize image
// blobs, caption edits rewrite one small record, and per-item ids stay
// stable for a future backend migration.

async function imageAspect(blob: Blob): Promise<number> {
  try {
    const bmp = await createImageBitmap(blob);
    const aspect = bmp.width / bmp.height;
    bmp.close();
    return aspect;
  } catch {
    return 2.5 / 3.5; // card-shaped fallback
  }
}

export async function createVendor(name: string): Promise<VendorRecord> {
  const db = await getDB();
  const now = Date.now();
  const record: VendorRecord = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    manualShows: [],
  };
  await db.put('vendors', record);
  return record;
}

export async function getVendors(): Promise<VendorRecord[]> {
  const db = await getDB();
  const records = await db.getAll('vendors');
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateVendor(
  id: string,
  patch: Partial<Omit<VendorRecord, 'id' | 'createdAt'>>,
): Promise<void> {
  const db = await getDB();
  const record = await db.get('vendors', id);
  if (!record) return;
  await db.put('vendors', { ...record, ...patch, updatedAt: Date.now() });
}

export async function setVendorBannerBlob(id: string, file: File): Promise<void> {
  await updateVendor(id, { bannerBlob: await downscaleImage(file) });
}

/** Remove the bannerBlob key entirely (a `bannerBlob: undefined` patch can't). */
export async function removeVendorBannerBlob(id: string): Promise<void> {
  const db = await getDB();
  const record = await db.get('vendors', id);
  if (!record) return;
  delete record.bannerBlob;
  record.updatedAt = Date.now();
  await db.put('vendors', record);
}

/** Delete the vendor and cascade its inventory. Plan rects keep a dangling
 *  vendorId, which renders as unassigned. */
export async function deleteVendorRecord(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['vendors', 'inventory'], 'readwrite');
  await tx.objectStore('vendors').delete(id);
  const items = await tx.objectStore('inventory').index('vendorId').getAllKeys(id);
  for (const key of items) await tx.objectStore('inventory').delete(key);
  await tx.done;
}

export async function saveInventoryItem(
  vendorId: string,
  file: File,
): Promise<InventoryItemRecord> {
  const db = await getDB();
  const imageBlob = await downscaleImage(file);
  const record: InventoryItemRecord = {
    id: crypto.randomUUID(),
    vendorId,
    imageBlob,
    caption: '',
    visible: true,
    aspect: await imageAspect(imageBlob),
    addedAt: Date.now(),
  };
  await db.put('inventory', record);
  return record;
}

export async function getInventoryItems(vendorId: string): Promise<InventoryItemRecord[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex('inventory', 'vendorId', vendorId);
  return items.sort((a, b) => a.addedAt - b.addedAt);
}

export async function countInventory(vendorId: string): Promise<number> {
  const db = await getDB();
  return db.countFromIndex('inventory', 'vendorId', vendorId);
}

export async function updateInventoryItem(
  id: string,
  patch: Partial<
    Pick<InventoryItemRecord, 'caption' | 'visible' | 'price' | 'status' | 'condition'>
  >,
): Promise<void> {
  const db = await getDB();
  const record = await db.get('inventory', id);
  if (!record) return;
  await db.put('inventory', { ...record, ...patch });
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('inventory', id);
}
