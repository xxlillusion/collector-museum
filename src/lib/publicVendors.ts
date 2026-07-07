import { supabase } from './supabase';
import { publicImageUrl } from './supabaseImages';

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
  items: PublicInventoryItem[];
  upcomingShows: PublicUpcomingShow[];
}

interface VendorRow {
  id: string;
  name: string;
  banner_path: string | null;
}

interface InventoryRow {
  id: string;
  image_path: string;
  caption: string;
  visible: boolean;
  aspect: number;
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
    .select('id, image_path, caption, visible, aspect')
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
      .select('id, name, banner_path')
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
      items,
      upcomingShows,
    };
  } catch {
    return null;
  }
}
