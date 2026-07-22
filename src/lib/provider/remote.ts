import type { DataProvider } from './types';
import type {
  CardRecord,
  SavedPlanRecord,
  VendorRecord,
  InventoryItemRecord,
  InventoryStatus,
  VendorShowEntry,
} from '../db';
import { downscaleImage } from '../db';
import { isDisplayPref } from '../displayPref';
import { normalizeBoothLayout } from '../boothLayout';
import { localProvider } from './local';
import { supabase } from '../supabase';
import {
  uploadImage,
  downloadImage,
  downloadImageIfExists,
  removeImage,
} from '../supabaseImages';

/**
 * Supabase-backed provider for signed-in users (accounts workstream).
 *
 * Blob is the currency on both sides: every image is downloaded to a Blob so
 * hooks, object-URL lifecycles and sleeve textures work identically to the
 * local provider. Tables/buckets per supabase/migrations/0001_init.sql:
 *   cards     ⇄ collections + cards/<userId>/<cardId>.webp (private bucket)
 *   banner    ⇄ cards/<userId>/_banner.webp (storage only, no table)
 *   vendors   ⇄ vendors + banners/<vendorId>/banner.webp
 *   inventory ⇄ inventory_items + inventory/<vendorId>/<itemId>.webp
 *   plans     ⇄ shows (drafts, published=false) + booths + plans/<showId>/plan.webp
 *
 * The floor-plan working slot stays local-backed on purpose (drafting surface
 * — see types.ts); those delegations are final, not stubs.
 *
 * The `upsertCloud*` primitives are exported for the guest→account import
 * wizard (src/lib/importLocal.ts): they accept full records so client-side
 * UUIDs are preserved and re-running the import is idempotent.
 */

// ---------------------------------------------------------------- row shapes

interface CollectionRow {
  id: string;
  name: string;
  image_path: string;
  added_at: string;
  metadata: Record<string, unknown> | null;
}

/** collections.metadata jsonb ⇄ CardRecord's optional metadata fields.
 *  Placard keys are strings; curation keys (0007-era walls feature) carry
 *  their real types through the same jsonb. */
const CARD_META_KEYS = ['setName', 'cardNumber', 'year', 'grade', 'notes'] as const;
const CARD_CURATION_KEYS = ['featured', 'hangOrder', 'onWalls'] as const;
// 3D-interactivity wave: display walls/binder/both + the wall-slot pin.
const CARD_LAYOUT_KEYS = ['display', 'wallSlot'] as const;

function cardMetaFromRow(metadata: Record<string, unknown> | null): Partial<CardRecord> {
  const out: Partial<CardRecord> = {};
  for (const k of CARD_META_KEYS) {
    const v = metadata?.[k];
    if (typeof v === 'string' && v) out[k] = v;
  }
  const featured = metadata?.featured;
  if (typeof featured === 'boolean') out.featured = featured;
  const hangOrder = metadata?.hangOrder;
  if (typeof hangOrder === 'number' && Number.isFinite(hangOrder)) out.hangOrder = hangOrder;
  const onWalls = metadata?.onWalls;
  if (typeof onWalls === 'boolean') out.onWalls = onWalls;
  const display = metadata?.display;
  if (isDisplayPref(display)) out.display = display;
  const wallSlot = metadata?.wallSlot;
  if (typeof wallSlot === 'string' && wallSlot) out.wallSlot = wallSlot;
  return out;
}

function cardMetaToJson(
  card: Partial<CardRecord>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const k of CARD_META_KEYS) {
    const v = card[k];
    if (typeof v === 'string' && v) out[k] = v;
  }
  if (typeof card.featured === 'boolean') out.featured = card.featured;
  if (typeof card.hangOrder === 'number' && Number.isFinite(card.hangOrder)) {
    out.hangOrder = card.hangOrder;
  }
  if (typeof card.onWalls === 'boolean') out.onWalls = card.onWalls;
  if (card.display && isDisplayPref(card.display)) out.display = card.display;
  if (typeof card.wallSlot === 'string' && card.wallSlot) out.wallSlot = card.wallSlot;
  return out;
}

interface VendorRow {
  id: string;
  name: string;
  banner_path: string | null;
  manual_shows: VendorShowEntry[] | null;
  website: string;
  contact_email: string;
  instagram: string;
  booth_layout: unknown;
  created_at: string;
  updated_at: string;
}

interface InventoryRow {
  id: string;
  vendor_id: string;
  image_path: string;
  caption: string;
  visible: boolean;
  aspect: number;
  added_at: string;
  price: number | null;
  status: InventoryStatus;
  condition: string;
  display_pref: 'walls' | 'binder' | 'both' | null;
  wall_slot: string | null;
}

interface ShowRow {
  id: string;
  name: string;
  show_date: string | null;
  plan_image_path: string | null;
  plan_meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  booths: { rect: unknown }[];
}

// ------------------------------------------------------------------- helpers

/** The remote provider is only constructed with a live session (root.tsx). */
function db() {
  return supabase!;
}

function ts(iso: string): number {
  return new Date(iso).getTime();
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// Same computation as db.ts's private imageAspect — replicated on purpose
// (db.ts is frozen; the helper is three lines).
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

/**
 * Overwrite-safe upload. The storage RLS in 0001_init.sql grants insert +
 * delete but no UPDATE policy, so `upsert: true` on an existing object is
 * rejected — remove first (a no-op when absent), then upload fresh.
 */
async function replaceImage(
  bucket: Parameters<typeof uploadImage>[0],
  path: string,
  blob: Blob,
): Promise<void> {
  await removeImage(bucket, path);
  await uploadImage(bucket, path, blob);
}

// Every object path starts with the OWNER's uid: the storage policies are
// plain `(storage.foldername(name))[1] = auth.uid()::text` prefix checks
// (0002 migration). Policies that subqueried public tables (vendors/shows)
// were not reliably evaluated by the storage service — legitimate owners got
// 403s — while this uid-prefix pattern is proven. Readers never rebuild these
// paths; they use the stored *_path columns.
const cardPath = (userId: string, cardId: string) => `${userId}/${cardId}.webp`;
const bannerSlotPath = (userId: string) => `${userId}/_banner.webp`;
const vendorBannerPath = (userId: string, vendorId: string) =>
  `${userId}/${vendorId}/banner.webp`;
const inventoryPath = (userId: string, vendorId: string, itemId: string) =>
  `${userId}/${vendorId}/${itemId}.webp`;
const planPath = (userId: string, showId: string) => `${userId}/${showId}/plan.webp`;

// --------------------------------------------- id-preserving upsert primitives
// (used by the provider below AND by the import wizard)

export async function upsertCloudCard(userId: string, card: CardRecord): Promise<void> {
  const path = cardPath(userId, card.id);
  await replaceImage('cards', path, card.imageBlob);
  const { error } = await db()
    .from('collections')
    .upsert({
      id: card.id,
      owner_id: userId,
      image_path: path,
      name: card.name,
      aspect: await imageAspect(card.imageBlob),
      added_at: iso(card.addedAt),
      metadata: cardMetaToJson(card),
    });
  if (error) throw new Error(`save card: ${error.message}`);
}

export async function upsertCloudVendor(userId: string, record: VendorRecord): Promise<void> {
  // Row first: the banners-bucket insert policy checks the vendors row exists
  // and is owned by the caller.
  const { error } = await db()
    .from('vendors')
    .upsert({
      id: record.id,
      owner_id: userId,
      name: record.name,
      manual_shows: record.manualShows,
      website: record.website ?? '',
      contact_email: record.contactEmail ?? '',
      instagram: record.instagram ?? '',
      // 0008 column — sent only when the record carries a value, so pre-0008
      // imports of untouched records keep working.
      ...(record.boothLayout !== undefined ? { booth_layout: record.boothLayout } : {}),
      created_at: iso(record.createdAt),
      updated_at: iso(record.updatedAt),
    });
  if (error) throw new Error(`save vendor: ${error.message}`);
  if (record.bannerBlob) {
    const path = vendorBannerPath(userId, record.id);
    await replaceImage('banners', path, record.bannerBlob);
    const { error: patchError } = await db()
      .from('vendors')
      .update({ banner_path: path })
      .eq('id', record.id);
    if (patchError) throw new Error(`save vendor banner: ${patchError.message}`);
  }
}

export async function upsertCloudInventoryItem(
  userId: string,
  item: InventoryItemRecord,
): Promise<void> {
  const path = inventoryPath(userId, item.vendorId, item.id);
  await replaceImage('inventory', path, item.imageBlob);
  const { error } = await db()
    .from('inventory_items')
    .upsert({
      id: item.id,
      vendor_id: item.vendorId,
      image_path: path,
      caption: item.caption,
      visible: item.visible,
      aspect: item.aspect,
      added_at: iso(item.addedAt),
      price: item.price ?? null,
      status: item.status ?? 'forSale',
      condition: item.condition ?? '',
      // 0008 columns — only-when-defined (same rule as booth_layout above).
      ...(item.display !== undefined ? { display_pref: item.display } : {}),
      ...(item.wallSlot !== undefined ? { wall_slot: item.wallSlot } : {}),
    });
  if (error) throw new Error(`save inventory item: ${error.message}`);
}

/**
 * Saved plan → draft show: show row (plan_meta = VendorPlanMeta minus rects),
 * booths rows (rect jsonb verbatim; vendor_id FK only when that vendor exists
 * in the cloud — the id inside the rect json is kept either way), plan image.
 */
export async function upsertCloudPlan(userId: string, record: SavedPlanRecord): Promise<void> {
  const meta = JSON.parse(record.metaJson) as Record<string, unknown> & {
    rects?: { vendorId?: string }[];
  };
  const { rects = [], ...planMeta } = meta;

  // Which assigned vendors actually exist in the cloud (avoid FK violations
  // for dangling / not-yet-imported vendor ids).
  const vendorIds = [
    ...new Set(rects.map((r) => r.vendorId).filter((v): v is string => Boolean(v))),
  ];
  let existingVendors = new Set<string>();
  if (vendorIds.length > 0) {
    const { data } = await db().from('vendors').select('id').in('id', vendorIds);
    existingVendors = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  }

  const imagePath = planPath(userId, record.id);
  // Show row first: the plans-bucket insert policy checks the show exists and
  // is organized by the caller.
  const { error: showError } = await db()
    .from('shows')
    .upsert({
      id: record.id,
      organizer_id: userId,
      name: record.name,
      show_date: record.showDate ?? null,
      plan_image_path: imagePath,
      plan_meta: planMeta,
      published: false,
      created_at: iso(record.createdAt),
      updated_at: iso(record.updatedAt),
    });
  if (showError) throw new Error(`save plan: ${showError.message}`);

  // Replace booths wholesale (rect ids live inside the jsonb).
  const { error: clearError } = await db().from('booths').delete().eq('show_id', record.id);
  if (clearError) throw new Error(`save plan booths: ${clearError.message}`);
  if (rects.length > 0) {
    const rows = rects.map((rect) => ({
      show_id: record.id,
      rect,
      vendor_id: rect.vendorId && existingVendors.has(rect.vendorId) ? rect.vendorId : null,
    }));
    const { error: boothError } = await db().from('booths').insert(rows);
    if (boothError) throw new Error(`save plan booths: ${boothError.message}`);
  }

  await replaceImage('plans', imagePath, record.planBlob);
}

// ------------------------------------------------------------------ provider

// Pre-0008 fallback: filtering on display_pref 400s until the column exists.
// Latch once per session and serve plain counts — zero repeat console noise;
// applying the migration lights the filtered counts up on next load.
let binderCountUnavailable = false;

export function makeRemoteProvider(userId: string): DataProvider {
  return {
    kind: 'remote',

    // ---- cards ----
    saveCard: async (file) => {
      const record: CardRecord = {
        id: crypto.randomUUID(),
        name: file.name,
        imageBlob: await downscaleImage(file),
        addedAt: Date.now(),
      };
      await upsertCloudCard(userId, record);
      return record;
    },
    getCards: async () => {
      const { data, error } = await db()
        .from('collections')
        .select('id,name,image_path,added_at,metadata')
        .eq('owner_id', userId)
        .order('added_at', { ascending: true });
      if (error) throw new Error(`load cards: ${error.message}`);
      const rows = (data ?? []) as CollectionRow[];
      return Promise.all(
        rows.map(
          async (row): Promise<CardRecord> => ({
            id: row.id,
            name: row.name,
            imageBlob: await downloadImage('cards', row.image_path),
            addedAt: ts(row.added_at),
            ...cardMetaFromRow(row.metadata),
          }),
        ),
      );
    },
    updateCard: async (id, patch) => {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name;
      // metadata is written whole (read-modify-write) so cleared fields drop out
      const metaTouched =
        CARD_META_KEYS.some((k) => k in patch) ||
        CARD_CURATION_KEYS.some((k) => k in patch) ||
        CARD_LAYOUT_KEYS.some((k) => k in patch);
      if (metaTouched) {
        const { data } = await db()
          .from('collections')
          .select('metadata')
          .eq('id', id)
          .maybeSingle();
        const current = cardMetaFromRow(
          ((data as { metadata: Record<string, unknown> | null } | null)?.metadata) ?? null,
        );
        row.metadata = cardMetaToJson({ ...current, ...patch });
      }
      if (Object.keys(row).length === 0) return;
      const { error } = await db().from('collections').update(row).eq('id', id);
      if (error) throw new Error(`update card: ${error.message}`);
    },
    deleteCard: async (id) => {
      const { data, error } = await db()
        .from('collections')
        .delete()
        .eq('id', id)
        .select('image_path');
      if (error) throw new Error(`delete card: ${error.message}`);
      const path = (data as { image_path: string }[] | null)?.[0]?.image_path;
      await removeImage('cards', path ?? cardPath(userId, id));
    },

    // ---- tablecloth banner (storage-only slot in the private cards bucket) ----
    saveBanner: async (file) => {
      const blob = await downscaleImage(file);
      await replaceImage('cards', bannerSlotPath(userId), blob);
      return blob;
    },
    getBanner: async () => {
      // Existence check first — a blind download of a missing object logs a
      // 400 "Failed to load resource" console error on every signed-in load.
      const { data } = await supabase!.storage
        .from('cards')
        .list(userId, { search: '_banner.webp' });
      if (!data?.some((f) => f.name === '_banner.webp')) return undefined;
      return downloadImageIfExists('cards', bannerSlotPath(userId));
    },
    deleteBanner: () => removeImage('cards', bannerSlotPath(userId)),

    // Working slot: local by design, even when signed in.
    saveFloorPlan: localProvider.saveFloorPlan,
    putFloorPlanBlob: localProvider.putFloorPlanBlob,
    getFloorPlan: localProvider.getFloorPlan,
    deleteFloorPlan: localProvider.deleteFloorPlan,
    savePlanMeta: localProvider.savePlanMeta,
    getPlanMetaBlob: localProvider.getPlanMetaBlob,
    deletePlanMeta: localProvider.deletePlanMeta,

    // ---- saved plan snapshots ⇄ draft shows ----
    savePlanRecord: (record) => upsertCloudPlan(userId, record),
    getPlanRecords: async () => {
      const { data, error } = await db()
        .from('shows')
        .select('id,name,show_date,plan_image_path,plan_meta,created_at,updated_at,booths(rect)')
        .eq('organizer_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(`load plans: ${error.message}`);
      const rows = (data ?? []) as ShowRow[];
      return Promise.all(
        rows.map(async (row): Promise<SavedPlanRecord> => {
          const planBlob = row.plan_image_path
            ? await downloadImageIfExists('plans', row.plan_image_path)
            : undefined;
          return {
            id: row.id,
            name: row.name,
            createdAt: ts(row.created_at),
            updatedAt: ts(row.updated_at),
            planBlob: planBlob ?? new Blob([], { type: 'image/webp' }),
            metaJson: JSON.stringify({
              ...(row.plan_meta ?? {}),
              rects: row.booths.map((b) => b.rect),
            }),
            banners: [],
            showDate: row.show_date ?? undefined,
          };
        }),
      );
    },
    deletePlanRecord: async (id) => {
      // Image first — the plans-bucket delete policy needs the show row alive.
      const { data } = await db()
        .from('shows')
        .select('plan_image_path')
        .eq('id', id)
        .maybeSingle();
      const path = (data as { plan_image_path: string | null } | null)?.plan_image_path;
      if (path) await removeImage('plans', path);
      const { error } = await db().from('shows').delete().eq('id', id);
      if (error) throw new Error(`delete plan: ${error.message}`);
    },

    // ---- vendors ----
    createVendor: async (name) => {
      const now = Date.now();
      const record: VendorRecord = {
        id: crypto.randomUUID(),
        name,
        createdAt: now,
        updatedAt: now,
        manualShows: [],
      };
      await upsertCloudVendor(userId, record);
      return record;
    },
    getVendors: async () => {
      const { data, error } = await db()
        .from('vendors')
        .select(
          'id,name,banner_path,manual_shows,website,contact_email,instagram,booth_layout,created_at,updated_at',
        )
        .eq('owner_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`load vendors: ${error.message}`);
      const rows = (data ?? []) as VendorRow[];
      return Promise.all(
        rows.map(async (row): Promise<VendorRecord> => {
          const record: VendorRecord = {
            id: row.id,
            name: row.name,
            createdAt: ts(row.created_at),
            updatedAt: ts(row.updated_at),
            manualShows: row.manual_shows ?? [],
            website: row.website || undefined,
            contactEmail: row.contact_email || undefined,
            instagram: row.instagram || undefined,
          };
          const boothLayout = normalizeBoothLayout(row.booth_layout);
          if (boothLayout) record.boothLayout = boothLayout;
          if (row.banner_path) {
            const blob = await downloadImageIfExists('banners', row.banner_path);
            if (blob) record.bannerBlob = blob;
          }
          return record;
        }),
      );
    },
    updateVendor: async (id, patch) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.manualShows !== undefined) row.manual_shows = patch.manualShows;
      if (patch.website !== undefined) row.website = patch.website;
      if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail;
      if (patch.instagram !== undefined) row.instagram = patch.instagram;
      // `in` check: an explicit { boothLayout: undefined } clears the config.
      if ('boothLayout' in patch) row.booth_layout = patch.boothLayout ?? null;
      // bannerBlob is managed by set/removeVendorBannerBlob (Storage-backed).
      const { error } = await db().from('vendors').update(row).eq('id', id);
      if (error) throw new Error(`update vendor: ${error.message}`);
    },
    setVendorBannerBlob: async (id, file) => {
      const blob = await downscaleImage(file);
      const path = vendorBannerPath(userId, id);
      await replaceImage('banners', path, blob);
      const { error } = await db()
        .from('vendors')
        .update({ banner_path: path, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`set vendor banner: ${error.message}`);
    },
    removeVendorBannerBlob: async (id) => {
      await removeImage('banners', vendorBannerPath(userId, id));
      const { error } = await db()
        .from('vendors')
        .update({ banner_path: null, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`remove vendor banner: ${error.message}`);
    },
    deleteVendorRecord: async (id) => {
      // Storage objects first — their delete policies check the vendors row.
      const { data } = await db().from('inventory_items').select('image_path').eq('vendor_id', id);
      const paths = ((data ?? []) as { image_path: string }[]).map((r) => r.image_path);
      await Promise.all([
        removeImage('banners', vendorBannerPath(userId, id)),
        ...paths.map((p) => removeImage('inventory', p)),
      ]);
      // Row delete cascades inventory_items.
      const { error } = await db().from('vendors').delete().eq('id', id);
      if (error) throw new Error(`delete vendor: ${error.message}`);
    },

    // ---- inventory ----
    saveInventoryItem: async (vendorId, file) => {
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
      await upsertCloudInventoryItem(userId, record);
      return record;
    },
    getInventoryItems: async (vendorId) => {
      const { data, error } = await db()
        .from('inventory_items')
        .select(
          'id,vendor_id,image_path,caption,visible,aspect,added_at,price,status,condition,display_pref,wall_slot',
        )
        .eq('vendor_id', vendorId)
        .order('added_at', { ascending: true });
      if (error) throw new Error(`load inventory: ${error.message}`);
      const rows = (data ?? []) as InventoryRow[];
      return Promise.all(
        rows.map(
          async (row): Promise<InventoryItemRecord> => ({
            id: row.id,
            vendorId: row.vendor_id,
            imageBlob: await downloadImage('inventory', row.image_path),
            caption: row.caption,
            visible: row.visible,
            aspect: row.aspect,
            addedAt: ts(row.added_at),
            price: row.price ?? undefined,
            status: row.status,
            condition: row.condition || undefined,
            display: row.display_pref ?? undefined,
            wallSlot: row.wall_slot ?? undefined,
          }),
        ),
      );
    },
    countInventory: async (vendorId) => {
      const { count, error } = await db()
        .from('inventory_items')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', vendorId);
      if (error) throw new Error(`count inventory: ${error.message}`);
      return count ?? 0;
    },
    countBinderInventory: async (vendorId) => {
      if (!binderCountUnavailable) {
        const { count, error } = await db()
          .from('inventory_items')
          .select('id', { count: 'exact', head: true })
          .eq('vendor_id', vendorId)
          .neq('display_pref', 'walls');
        if (!error) return count ?? 0;
        binderCountUnavailable = true;
      }
      const { count, error } = await db()
        .from('inventory_items')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', vendorId);
      if (error) throw new Error(`count inventory: ${error.message}`);
      return count ?? 0;
    },
    updateInventoryItem: async (id, patch) => {
      const row: Record<string, unknown> = {};
      if (patch.caption !== undefined) row.caption = patch.caption;
      if (patch.visible !== undefined) row.visible = patch.visible;
      // `in` check: an explicit { price: undefined } clears the price.
      if ('price' in patch) row.price = patch.price ?? null;
      if (patch.status !== undefined) row.status = patch.status;
      if ('condition' in patch) row.condition = patch.condition ?? '';
      if ('display' in patch) row.display_pref = patch.display ?? 'both';
      if ('wallSlot' in patch) row.wall_slot = patch.wallSlot ?? null;
      if (Object.keys(row).length === 0) return;
      const { error } = await db().from('inventory_items').update(row).eq('id', id);
      if (error) throw new Error(`update inventory item: ${error.message}`);
    },
    deleteInventoryItem: async (id) => {
      const { data, error } = await db()
        .from('inventory_items')
        .delete()
        .eq('id', id)
        .select('image_path');
      if (error) throw new Error(`delete inventory item: ${error.message}`);
      const path = (data as { image_path: string }[] | null)?.[0]?.image_path;
      if (path) await removeImage('inventory', path);
    },
  };
}
