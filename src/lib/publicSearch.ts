import { supabase } from './supabase';
import { publicImageUrl } from './supabaseImages';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicShowSummary } from './publicShows';
import type { RegisteredVendorSummary } from './publicVendors';
import type { InventoryStatus, VendorShowEntry } from './db';

/**
 * Cross-entity search (roadmap item 14) — shows, registered vendors, and
 * public inventory items by caption. Anon-safe like the other public readers:
 * missing config / errors resolve to empty results, never a throw.
 *
 * Three parallel `.ilike` queries (each individually error-safe — a failed
 * section renders empty rather than sinking the whole search), `%`/`_`/`\`
 * escaped, min-2-char guard, limits 20/20/60 with a +1 overfetch to detect
 * truncation per section.
 */

export interface SearchInventoryItem {
  id: string;
  vendorId: string;
  vendorName: string;
  imageUrl: string;
  caption: string;
  /** width / height, computed at upload. */
  aspect: number;
  price?: number;
  status: InventoryStatus;
  condition: string;
}

export interface SearchResults {
  shows: PublicShowSummary[];
  vendors: RegisteredVendorSummary[];
  items: SearchInventoryItem[];
  /** True per section when that section hit its result limit. */
  truncated: { shows: boolean; vendors: boolean; items: boolean };
}

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_LIMITS = { shows: 20, vendors: 20, items: 60 } as const;

export const EMPTY_RESULTS: SearchResults = {
  shows: [],
  vendors: [],
  items: [],
  truncated: { shows: false, vendors: false, items: false },
};

interface SectionResult<T> {
  rows: T[];
  truncated: boolean;
}

const EMPTY_SECTION = { rows: [], truncated: false };

/** Published shows whose name matches — select/mapping/sort mirror
 *  `listPublishedShows` (lib/publicShows.ts). */
async function searchShows(
  sb: SupabaseClient,
  pattern: string,
): Promise<SectionResult<PublicShowSummary>> {
  try {
    const { data, error } = await sb
      .from('shows')
      .select('id, name, show_date, country, state, city, plan_image_path, booths(vendor_id)')
      .eq('published', true)
      .ilike('name', pattern)
      .limit(SEARCH_LIMITS.shows + 1);
    if (error || !data) return EMPTY_SECTION;
    const truncated = data.length > SEARCH_LIMITS.shows;
    const today = new Date().toISOString().slice(0, 10);
    const rows: PublicShowSummary[] = data.slice(0, SEARCH_LIMITS.shows).map((raw) => {
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
    // Upcoming first (soonest→latest), then undated, then past (most recent first).
    const rank = (s: PublicShowSummary) =>
      s.showDate === null ? 1 : s.showDate >= today ? 0 : 2;
    rows.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return a.showDate!.localeCompare(b.showDate!);
      if (ra === 2) return b.showDate!.localeCompare(a.showDate!);
      return a.name.localeCompare(b.name);
    });
    return { rows, truncated };
  } catch {
    return EMPTY_SECTION;
  }
}

/** Registered vendors whose name matches — select/mapping mirror
 *  `listRegisteredVendors` (lib/publicVendors.ts). */
async function searchVendors(
  sb: SupabaseClient,
  pattern: string,
): Promise<SectionResult<RegisteredVendorSummary>> {
  try {
    const { data, error } = await sb
      .from('vendors')
      .select(
        'id, name, banner_path, profile_id, country, state, area_served, inventory_public, manual_shows, created_at, updated_at, inventory_items(count)',
      )
      .not('profile_id', 'is', null)
      .ilike('name', pattern)
      .order('name')
      .limit(SEARCH_LIMITS.vendors + 1);
    if (error || !data) return EMPTY_SECTION;
    const truncated = data.length > SEARCH_LIMITS.vendors;
    const rows = (data.slice(0, SEARCH_LIMITS.vendors) as unknown as {
      id: string;
      name: string;
      banner_path: string | null;
      profile_id: string | null;
      country: string | null;
      state: string | null;
      area_served: string | null;
      inventory_public: boolean;
      manual_shows: VendorShowEntry[] | null;
      created_at: string;
      updated_at: string;
      inventory_items: { count: number }[] | null;
    }[]).map((row): RegisteredVendorSummary => ({
      id: row.id,
      name: row.name,
      bannerUrl: row.banner_path ? publicImageUrl('banners', row.banner_path) : null,
      inventoryCount: row.inventory_items?.[0]?.count ?? 0,
      manualShows: row.manual_shows ?? [],
      createdAt: Date.parse(row.created_at) || 0,
      updatedAt: Date.parse(row.updated_at) || 0,
      profileId: row.profile_id as string,
      country: row.country ?? null,
      state: row.state ?? null,
      areaServed: row.area_served ?? '',
      inventoryPublic: row.inventory_public !== false,
    }));
    return { rows, truncated };
  } catch {
    return EMPTY_SECTION;
  }
}

/** Visible inventory items whose caption matches. RLS already hides private
 *  inventory from anon; the joined `inventory_public` re-filter keeps an
 *  owner's own search matching what the public sees. */
async function searchItems(
  sb: SupabaseClient,
  pattern: string,
): Promise<SectionResult<SearchInventoryItem>> {
  try {
    const { data, error } = await sb
      .from('inventory_items')
      .select(
        'id, vendor_id, image_path, caption, aspect, price, status, condition, vendors!inner(name, inventory_public, profile_id)',
      )
      .ilike('caption', pattern)
      .eq('visible', true)
      .limit(SEARCH_LIMITS.items + 1);
    if (error || !data) return EMPTY_SECTION;
    const truncated = data.length > SEARCH_LIMITS.items;
    const rows = (data.slice(0, SEARCH_LIMITS.items) as unknown as {
      id: string;
      vendor_id: string;
      image_path: string;
      caption: string | null;
      aspect: number | null;
      price: number | null;
      status: InventoryStatus | null;
      condition: string | null;
      vendors: {
        name: string;
        inventory_public: boolean | null;
        profile_id: string | null;
      } | null;
    }[])
      .filter((row) => row.vendors !== null && row.vendors.inventory_public !== false)
      .map((row): SearchInventoryItem => ({
        id: row.id,
        vendorId: row.vendor_id,
        vendorName: row.vendors!.name,
        imageUrl: publicImageUrl('inventory', row.image_path),
        caption: row.caption ?? '',
        aspect: typeof row.aspect === 'number' && row.aspect > 0 ? row.aspect : 0.714,
        price: row.price ?? undefined,
        status: row.status ?? 'forSale',
        condition: row.condition ?? '',
      }));
    return { rows, truncated };
  } catch {
    return EMPTY_SECTION;
  }
}

export async function searchAll(q: string): Promise<SearchResults> {
  if (!supabase) return EMPTY_RESULTS;
  const trimmed = q.trim();
  if (trimmed.length < SEARCH_MIN_CHARS) return EMPTY_RESULTS;
  // Escape ilike wildcards so a literal "%"/"_" in the query stays literal.
  const pattern = '%' + trimmed.replace(/[\\%_]/g, '\\$&') + '%';
  const sb = supabase;
  try {
    const [shows, vendors, items] = await Promise.all([
      searchShows(sb, pattern),
      searchVendors(sb, pattern),
      searchItems(sb, pattern),
    ]);
    return {
      shows: shows.rows,
      vendors: vendors.rows,
      items: items.rows,
      truncated: {
        shows: shows.truncated,
        vendors: vendors.truncated,
        items: items.truncated,
      },
    };
  } catch {
    return EMPTY_RESULTS;
  }
}
