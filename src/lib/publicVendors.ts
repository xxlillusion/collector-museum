import { supabase } from './supabase';
import { publicImageUrl } from './supabaseImages';
import type { VendorSummary } from './useVendors';
import type { InventoryStatus, VendorShowEntry } from './db';

/**
 * Anon-safe public reads for vendor profile pages (`/vendor/:id`).
 *
 * Deliberately bypasses the DataProvider seam: these pages are public and
 * work for signed-out visitors, so they query Supabase directly with the
 * anon client. Banners / inventory live in public Storage buckets, so we
 * hand the DOM CDN URLs (`publicImageUrl`) instead of downloading blobs.
 *
 * Every function degrades gracefully: `supabase` null (env not configured),
 * missing tables (schema not applied yet — PGRST205), invalid ids and RLS
 * denials all resolve to `null` / empty lists, never a throw.
 */

export interface PublicInventoryItem {
  id: string;
  imageUrl: string;
  caption: string;
  /** width / height, computed at upload. */
  aspect: number;
  /** Sale metadata (0005). */
  price?: number;
  status: InventoryStatus;
  condition: string;
}

export interface PublicUpcomingShow {
  showId: string;
  name: string;
  /** ISO yyyy-mm-dd. */
  date: string;
}

export interface PublicVendorProfile {
  id: string;
  name: string;
  bannerUrl: string | null;
  /** Non-null = a registered vendor account's canonical profile. */
  profileId: string | null;
  country: string | null;
  state: string | null;
  areaServed: string;
  /** False = the vendor keeps inventory off their public profile/museum
   *  (RLS already hides the items from anon; pages show a private note). */
  inventoryPublic: boolean;
  /** Public contact links (0005) — '' = the vendor left it unstated. */
  website: string;
  contactEmail: string;
  /** Handle without the @. */
  instagram: string;
  items: PublicInventoryItem[];
  upcomingShows: PublicUpcomingShow[];
}

/** Directory entry for /vendors — a VendorSummary superset so the booth
 *  assignment dropdown can consume registered vendors directly. */
export interface RegisteredVendorSummary extends VendorSummary {
  profileId: string;
  country: string | null;
  state: string | null;
  areaServed: string;
  inventoryPublic: boolean;
}

interface VendorRow {
  id: string;
  name: string;
  banner_path: string | null;
  profile_id: string | null;
  country: string | null;
  state: string | null;
  area_served: string | null;
  inventory_public: boolean;
  website: string | null;
  contact_email: string | null;
  instagram: string | null;
}

interface InventoryRow {
  id: string;
  image_path: string;
  caption: string;
  visible: boolean;
  aspect: number;
  price: number | null;
  status: InventoryStatus | null;
  condition: string | null;
}

interface BoothShowRow {
  show_id: string;
  shows: {
    id: string;
    name: string;
    show_date: string | null;
    published: boolean;
  } | null;
}

async function fetchVisibleItems(vendorId: string): Promise<PublicInventoryItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, image_path, caption, visible, aspect, price, status, condition')
    .eq('vendor_id', vendorId)
    .eq('visible', true)
    .order('added_at', { ascending: true });
  if (error || !data) return [];
  return (data as unknown as InventoryRow[])
    // RLS already hides invisible items from anon; re-filter client-side so
    // an owner previewing their own page sees exactly what the public sees.
    .filter((row) => row.visible)
    .map((row) => ({
      id: row.id,
      imageUrl: publicImageUrl('inventory', row.image_path),
      caption: row.caption ?? '',
      aspect: row.aspect > 0 ? row.aspect : 0.714,
      price: row.price ?? undefined,
      status: row.status ?? 'forSale',
      condition: row.condition ?? '',
    }));
}

async function fetchUpcomingShows(vendorId: string): Promise<PublicUpcomingShow[]> {
  if (!supabase) return [];
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('booths')
    .select('show_id, shows!inner(id, name, show_date, published)')
    .eq('vendor_id', vendorId)
    .eq('shows.published', true)
    .gte('shows.show_date', today);
  if (error || !data) return [];
  // A vendor may hold several booths in one show — dedupe by show id.
  const byShow = new Map<string, PublicUpcomingShow>();
  for (const row of data as unknown as BoothShowRow[]) {
    const show = row.shows;
    if (!show || !show.published || !show.show_date) continue;
    if (!byShow.has(show.id)) {
      byShow.set(show.id, { showId: show.id, name: show.name, date: show.show_date });
    }
  }
  return [...byShow.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The full public profile for a vendor page, or `null` when Supabase is not
 * configured, the vendor doesn't exist, the id is malformed, or the schema
 * hasn't been applied yet.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPublicVendorProfile(
  vendorId: string,
): Promise<PublicVendorProfile | null> {
  if (!supabase) return null;
  // Malformed ids (vendor ids are uuids) would 400 at PostgREST and log a
  // network error to the console — short-circuit them silently instead.
  if (!UUID_RE.test(vendorId)) return null;
  try {
    const { data, error } = await supabase
      .from('vendors')
      .select(
        'id, name, banner_path, profile_id, country, state, area_served, inventory_public, website, contact_email, instagram',
      )
      .eq('id', vendorId)
      .maybeSingle();
    if (error || !data) return null;
    const vendor = data as unknown as VendorRow;

    const [items, upcomingShows] = await Promise.all([
      fetchVisibleItems(vendorId),
      fetchUpcomingShows(vendorId),
    ]);

    return {
      id: vendor.id,
      name: vendor.name,
      bannerUrl: vendor.banner_path ? publicImageUrl('banners', vendor.banner_path) : null,
      profileId: vendor.profile_id ?? null,
      country: vendor.country ?? null,
      state: vendor.state ?? null,
      areaServed: vendor.area_served ?? '',
      inventoryPublic: vendor.inventory_public !== false,
      website: vendor.website ?? '',
      contactEmail: vendor.contact_email ?? '',
      instagram: vendor.instagram ?? '',
      items,
      upcomingShows,
    };
  } catch {
    return null;
  }
}

/**
 * Registered vendors (accounts with a canonical vendor profile) for the
 * public /vendors directory and the organizer's booth-assignment dropdown.
 * Item counts reflect what the caller can see (RLS: anon counts public
 * visible items only). Sorted by name.
 */
export async function listRegisteredVendors(): Promise<RegisteredVendorSummary[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('vendors')
      .select(
        'id, name, banner_path, profile_id, country, state, area_served, inventory_public, manual_shows, created_at, updated_at, inventory_items(count)',
      )
      .not('profile_id', 'is', null)
      .order('name');
    if (error || !data) return [];
    return (data as unknown as (VendorRow & {
      manual_shows: VendorShowEntry[] | null;
      created_at: string;
      updated_at: string;
      inventory_items: { count: number }[] | null;
    })[]).map((row) => ({
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
  } catch {
    return [];
  }
}
