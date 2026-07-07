import { supabase } from './supabase';
import { publicImageUrl, downloadImage } from './supabaseImages';
import type { VendorPlanMeta, VendorRect } from './vendorPlan';
import type { VendorSummary } from './useVendors';
import type { InventoryItemRecord, VendorShowEntry } from './db';

/**
 * Anonymous public reads for the shows directory and the 3D walk.
 * Every function is null-safe: when Supabase isn't configured, the tables
 * aren't applied yet, or a request fails, they resolve to empty/null —
 * the screens render graceful states, never crash.
 */

export interface PublicShowSummary {
  id: string;
  name: string;
  showDate: string | null; // ISO yyyy-mm-dd
  country: string | null;
  state: string | null;
  city: string | null;
  planImageUrl: string | null;
  boothCount: number;
  vendorCount: number;
}

/** Optional location narrowing for the shows directory. */
export interface ShowLocationFilter {
  country?: string;
  state?: string;
}

/** Everything the detail page + VendorScene need for one show. */
export interface ShowWalkData {
  id: string;
  name: string;
  showDate: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  /** Reconstructed working-slot meta (plan_meta + rects from booths), or
   *  null when the stored meta lacks the essentials — Walk stays disabled. */
  meta: VendorPlanMeta | null;
  /** CDN URL of the plan image — VendorScene/Minimap take any URL. */
  planUrl: string | null;
  vendors: VendorSummary[];
  /** Inventory reads for the hall binders — downloads image Blobs so the
   *  sleeve-texture pipeline stays backend-agnostic. */
  fetchInventory: (vendorId: string) => Promise<InventoryItemRecord[]>;
}

/** Published shows: upcoming first (soonest→latest), then undated, then past (most recent first). */
export async function listPublishedShows(
  filter?: ShowLocationFilter,
): Promise<PublicShowSummary[]> {
  if (!supabase) return [];
  try {
    let query = supabase
      .from('shows')
      .select('id, name, show_date, country, state, city, plan_image_path, booths(vendor_id)')
      .eq('published', true);
    if (filter?.country) query = query.eq('country', filter.country);
    if (filter?.state) query = query.eq('state', filter.state);
    const { data, error } = await query;
    if (error || !data) return [];
    const today = new Date().toISOString().slice(0, 10);
    const rows: PublicShowSummary[] = data.map((raw) => {
      const row = raw as {
        id: string;
        name: string;
        show_date: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
        plan_image_path: string | null;
        booths: { vendor_id: string | null }[] | null;
      };
      const booths = row.booths ?? [];
      return {
        id: row.id,
        name: row.name,
        showDate: row.show_date ?? null,
        country: row.country ?? null,
        state: row.state ?? null,
        city: row.city ?? null,
        planImageUrl: row.plan_image_path ? publicImageUrl('plans', row.plan_image_path) : null,
        boothCount: booths.length,
        vendorCount: new Set(booths.map((b) => b.vendor_id).filter(Boolean)).size,
      };
    });
    const rank = (s: PublicShowSummary) =>
      s.showDate === null ? 1 : s.showDate >= today ? 0 : 2;
    rows.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return a.showDate!.localeCompare(b.showDate!); // upcoming: soonest first
      if (ra === 2) return b.showDate!.localeCompare(a.showDate!); // past: most recent first
      return a.name.localeCompare(b.name);
    });
    return rows;
  } catch {
    return [];
  }
}

function isPlausibleRect(r: unknown): r is VendorRect {
  if (!r || typeof r !== 'object') return false;
  const rect = r as Partial<VendorRect>;
  return (
    typeof rect.x === 'number' &&
    typeof rect.y === 'number' &&
    typeof rect.w === 'number' &&
    typeof rect.h === 'number' &&
    typeof rect.id === 'string'
  );
}

/**
 * Rebuild working-slot meta from a stored plan_meta jsonb + booth rects —
 * shared by the public walk and the organizer edit screen (showService).
 * Null when the stored meta lacks the essentials (walk/edit stay disabled).
 */
export function reconstructPlanMeta(
  planMetaRaw: Partial<VendorPlanMeta>,
  boothRects: unknown[],
): VendorPlanMeta | null {
  const rects = boothRects.filter(isPlausibleRect);
  const metaValid =
    typeof planMetaRaw.pxPerMeter === 'number' &&
    planMetaRaw.pxPerMeter > 0 &&
    typeof planMetaRaw.imgW === 'number' &&
    planMetaRaw.imgW > 0 &&
    typeof planMetaRaw.imgH === 'number' &&
    planMetaRaw.imgH > 0;
  if (!metaValid) return null;
  return {
    ...(planMetaRaw as Omit<VendorPlanMeta, 'rects'>),
    rects,
    updatedAt: typeof planMetaRaw.updatedAt === 'number' ? planMetaRaw.updatedAt : 0,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getShowForWalk(id: string): Promise<ShowWalkData | null> {
  if (!supabase) return null;
  // A malformed id would 400 at PostgREST (uuid column) — skip the round trip.
  if (!UUID_RE.test(id)) return null;
  const sb = supabase;
  try {
    const { data, error } = await sb
      .from('shows')
      .select(
        'id, name, show_date, country, state, city, plan_image_path, plan_meta, booths(rect, vendor_id)',
      )
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    const show = data as {
      id: string;
      name: string;
      show_date: string | null;
      country: string | null;
      state: string | null;
      city: string | null;
      plan_image_path: string | null;
      plan_meta: Record<string, unknown> | null;
      booths: { rect: unknown; vendor_id: string | null }[] | null;
    };
    const booths = show.booths ?? [];

    // Reconstruct the working-slot meta: plan_meta holds scale / start /
    // table size / image dims; the rects were normalized into booth rows.
    const meta = reconstructPlanMeta(
      (show.plan_meta ?? {}) as Partial<VendorPlanMeta>,
      booths.map((b) => b.rect),
    );

    const planUrl = show.plan_image_path
      ? publicImageUrl('plans', show.plan_image_path)
      : null;

    // Assigned vendors → VendorSummary[] (public banner URLs, live counts).
    const vendorIds = [
      ...new Set(booths.map((b) => b.vendor_id).filter((v): v is string => Boolean(v))),
    ];
    let vendors: VendorSummary[] = [];
    if (vendorIds.length > 0) {
      const { data: vendorRows } = await sb
        .from('vendors')
        .select('id, name, banner_path, manual_shows, created_at, updated_at')
        .in('id', vendorIds);
      const rowsV = (vendorRows ?? []) as {
        id: string;
        name: string;
        banner_path: string | null;
        manual_shows: VendorShowEntry[] | null;
        created_at: string;
        updated_at: string;
      }[];
      const counts = await Promise.all(
        rowsV.map(async (v) => {
          const { count } = await sb
            .from('inventory_items')
            .select('id', { count: 'exact', head: true })
            .eq('vendor_id', v.id)
            .eq('visible', true);
          return count ?? 0;
        }),
      );
      vendors = rowsV.map((v, i) => ({
        id: v.id,
        name: v.name,
        bannerUrl: v.banner_path ? publicImageUrl('banners', v.banner_path) : null,
        inventoryCount: counts[i],
        manualShows: v.manual_shows ?? [],
        createdAt: Date.parse(v.created_at) || 0,
        updatedAt: Date.parse(v.updated_at) || 0,
      }));
    }

    const fetchInventory = async (vendorId: string): Promise<InventoryItemRecord[]> => {
      try {
        const { data: items, error: invErr } = await sb
          .from('inventory_items')
          .select('id, vendor_id, image_path, caption, visible, aspect, added_at')
          .eq('vendor_id', vendorId)
          .eq('visible', true)
          .order('added_at', { ascending: true });
        if (invErr || !items) return [];
        const withBlobs = await Promise.all(
          (items as {
            id: string;
            vendor_id: string;
            image_path: string;
            caption: string | null;
            visible: boolean;
            aspect: number | null;
            added_at: string;
          }[]).map(async (item): Promise<InventoryItemRecord | null> => {
            try {
              const imageBlob = await downloadImage('inventory', item.image_path);
              return {
                id: item.id,
                vendorId: item.vendor_id,
                imageBlob,
                caption: item.caption ?? '',
                visible: item.visible !== false,
                aspect: typeof item.aspect === 'number' && item.aspect > 0 ? item.aspect : 0.714,
                addedAt: Date.parse(item.added_at) || 0,
              };
            } catch {
              return null; // a missing image shouldn't sink the whole binder
            }
          }),
        );
        return withBlobs.filter((x): x is InventoryItemRecord => x !== null);
      } catch {
        return [];
      }
    };

    return {
      id: show.id,
      name: show.name,
      showDate: show.show_date ?? null,
      country: show.country ?? null,
      state: show.state ?? null,
      city: show.city ?? null,
      meta,
      planUrl,
      vendors,
      fetchInventory,
    };
  } catch {
    return null;
  }
}
