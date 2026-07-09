import type {
  CardRecord,
  SavedPlanRecord,
  VendorRecord,
  InventoryItemRecord,
} from '../db';

export type ProviderKind = 'local' | 'remote';

/**
 * The persistence seam. Two implementations:
 *  - `local.ts`  — wraps IndexedDB (`db.ts`) 1:1; the guest experience.
 *  - `remote.ts` — Supabase (Postgres + Storage) for signed-in users.
 *
 * Blob stays the currency on purpose: the remote provider downloads images
 * and hands blobs to the exact same hooks, so object-URL lifecycles,
 * sleeveTextures.ts (createImageBitmap on blobs) and aspect computation all
 * work unmodified regardless of backend.
 *
 * Frozen during the Phase-0 parallel workstreams (now merged); since then,
 * additive changes only — never reshape existing signatures. Organizer-only
 * operations (publish show, invites) do NOT belong here; they live in a
 * separate show service used only by organizer and public screens.
 */
export interface DataProvider {
  readonly kind: ProviderKind;

  // ---- cards (the user's own collection) ----
  saveCard(file: File): Promise<CardRecord>;
  getCards(): Promise<CardRecord[]>;
  deleteCard(id: string): Promise<void>;

  // ---- tablecloth banner (single per-user slot) ----
  saveBanner(file: File): Promise<Blob>;
  getBanner(): Promise<Blob | undefined>;
  deleteBanner(): Promise<void>;

  // ---- convention floor-plan working slot ----
  // Drafting surface, not shared data: the remote provider delegates these to
  // the local implementation by design. Editing happens locally; a later
  // "Publish" snapshots the draft up to the cloud.
  saveFloorPlan(file: File): Promise<Blob>;
  putFloorPlanBlob(blob: Blob): Promise<void>;
  getFloorPlan(): Promise<Blob | undefined>;
  deleteFloorPlan(): Promise<void>;
  savePlanMeta(meta: unknown): Promise<void>;
  getPlanMetaBlob(): Promise<Blob | undefined>;
  deletePlanMeta(): Promise<void>;

  // ---- saved plan snapshots / shows ----
  savePlanRecord(record: SavedPlanRecord): Promise<void>;
  getPlanRecords(): Promise<SavedPlanRecord[]>;
  deletePlanRecord(id: string): Promise<void>;

  // ---- vendors ----
  createVendor(name: string): Promise<VendorRecord>;
  getVendors(): Promise<VendorRecord[]>;
  updateVendor(
    id: string,
    patch: Partial<Omit<VendorRecord, 'id' | 'createdAt'>>,
  ): Promise<void>;
  setVendorBannerBlob(id: string, file: File): Promise<void>;
  removeVendorBannerBlob(id: string): Promise<void>;
  deleteVendorRecord(id: string): Promise<void>;

  // ---- inventory ----
  saveInventoryItem(vendorId: string, file: File): Promise<InventoryItemRecord>;
  getInventoryItems(vendorId: string): Promise<InventoryItemRecord[]>;
  countInventory(vendorId: string): Promise<number>;
  updateInventoryItem(
    id: string,
    patch: Partial<
      Pick<InventoryItemRecord, 'caption' | 'visible' | 'price' | 'status' | 'condition'>
    >,
  ): Promise<void>;
  deleteInventoryItem(id: string): Promise<void>;
}
