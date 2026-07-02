import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface CardRecord {
  id: string;
  name: string;
  imageBlob: Blob;
  addedAt: number;
}

interface MuseumDB extends DBSchema {
  cards: {
    key: string;
    value: CardRecord;
    indexes: { addedAt: number };
  };
}

let dbPromise: Promise<IDBPDatabase<MuseumDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MuseumDB>('vendor-museum', 1, {
      upgrade(db) {
        const store = db.createObjectStore('cards', { keyPath: 'id' });
        store.createIndex('addedAt', 'addedAt');
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
