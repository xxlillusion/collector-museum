import type {
  CardRecord,
  VendorRecord,
  InventoryItemRecord,
  SavedPlanRecord,
} from './db';
// Reads the LOCAL (guest IndexedDB) data directly — intentionally bypassing
// the active provider, which is remote while the wizard runs.
import { localProvider } from './provider/local';
import {
  upsertCloudCard,
  upsertCloudVendor,
  upsertCloudInventoryItem,
  upsertCloudPlan,
} from './provider/remote';

/**
 * Guest→account import: everything the browser accumulated before sign-up,
 * read once up front so the wizard can show counts and upload sequentially.
 * Local data is never deleted; ids are preserved end-to-end (the cloud tables
 * accept client UUIDs) so re-running the import is an idempotent upsert.
 */
export interface LocalSnapshot {
  cards: CardRecord[];
  vendors: VendorRecord[];
  /** All inventory items across all local vendors. */
  inventory: InventoryItemRecord[];
  plans: SavedPlanRecord[];
}

export interface ImportSelection {
  cards: boolean;
  vendors: boolean; // vendors AND their inventory
  plans: boolean; // saved plans → draft shows
}

export const importedFlagKey = (userId: string) => `vm-imported:${userId}`;

export async function readLocalSnapshot(): Promise<LocalSnapshot> {
  const [cards, vendors, plans] = await Promise.all([
    localProvider.getCards(),
    localProvider.getVendors(),
    localProvider.getPlanRecords(),
  ]);
  const inventory = (
    await Promise.all(vendors.map((v) => localProvider.getInventoryItems(v.id)))
  ).flat();
  return { cards, vendors, inventory, plans };
}

/**
 * Sequential upload with progress callbacks. Order matters: vendors go up
 * before plans so booth vendor_id foreign keys resolve (upsertCloudPlan nulls
 * the FK for any vendor missing from the cloud — the id stays inside the rect
 * jsonb either way).
 */
export async function importLocalData(
  userId: string,
  snapshot: LocalSnapshot,
  selection: ImportSelection,
  onProgress: (message: string) => void,
): Promise<void> {
  if (selection.cards) {
    for (let i = 0; i < snapshot.cards.length; i++) {
      onProgress(`Uploading card ${i + 1} of ${snapshot.cards.length}…`);
      await upsertCloudCard(userId, snapshot.cards[i]);
    }
  }
  if (selection.vendors) {
    for (let i = 0; i < snapshot.vendors.length; i++) {
      onProgress(`Uploading vendor ${i + 1} of ${snapshot.vendors.length}…`);
      await upsertCloudVendor(userId, snapshot.vendors[i]);
    }
    for (let i = 0; i < snapshot.inventory.length; i++) {
      onProgress(`Uploading inventory item ${i + 1} of ${snapshot.inventory.length}…`);
      await upsertCloudInventoryItem(userId, snapshot.inventory[i]);
    }
  }
  if (selection.plans) {
    for (let i = 0; i < snapshot.plans.length; i++) {
      onProgress(`Uploading plan ${i + 1} of ${snapshot.plans.length}…`);
      await upsertCloudPlan(userId, snapshot.plans[i]);
    }
  }
  localStorage.setItem(importedFlagKey(userId), new Date().toISOString());
}
