import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface CardRecord {
  id: string;
  name: string;
  imageBlob: Blob;
  addedAt: number;
}

export interface SettingRecord {
  key: string;
  blob: Blob;
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
}

let dbPromise: Promise<IDBPDatabase<MuseumDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MuseumDB>('vendor-museum', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('cards', { keyPath: 'id' });
          store.createIndex('addedAt', 'addedAt');
        }
        if (oldVersion < 2) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// Downscale large uploads — full-resolution photos become huge GPU textures,
// which slows scene load and can crash the WebGL context on weaker GPUs.
async function downscaleImage(file: File, maxDim = 1600): Promise<Blob> {
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

// Vendor View — convention floor plan image + its table-rectangle metadata.
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
