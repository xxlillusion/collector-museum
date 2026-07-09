import { supabase } from './supabase';
import { publicImageUrl } from './supabaseImages';
import type { InventoryStatus } from './db';

/**
 * Anon-safe resolution of the visitor's want-list (localStorage inventory
 * item ids → live public rows) for the /wants page. Mirrors the
 * publicVendors.ts contract: `supabase` null (guest-only deployment),
 * missing tables, RLS denials and deleted items all degrade to fewer (or
 * zero) results, never a throw. Ids that don't resolve are simply absent —
 * the page reports them as no-longer-listed.
 */

export interface WantedItem {
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

interface WantedRow {
  id: string;
  vendor_id: string;
  image_path: string;
  caption: string;
  visible: boolean;
  aspect: number;
  price: number | null;
  status: InventoryStatus | null;
  condition: string | null;
  vendors: { name: string } | null;
}

const CHUNK = 50;

export async function fetchWantedItems(ids: string[]): Promise<WantedItem[]> {
  if (!supabase || ids.length === 0) return [];
  const sb = supabase;
  try {
    const out: WantedItem[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { data, error } = await sb
        .from('inventory_items')
        .select(
          'id, vendor_id, image_path, caption, visible, aspect, price, status, condition, vendors!inner(name)',
        )
        .in('id', chunk);
      if (error || !data) continue;
      for (const row of data as unknown as WantedRow[]) {
        // RLS already hides invisible items from anon; re-filter so an owner
        // browsing their own hearts sees exactly what the public sees.
        if (row.visible === false) continue;
        out.push({
          id: row.id,
          vendorId: row.vendor_id,
          vendorName: row.vendors?.name ?? 'Vendor',
          imageUrl: publicImageUrl('inventory', row.image_path),
          caption: row.caption ?? '',
          aspect: row.aspect > 0 ? row.aspect : 0.714,
          price: row.price ?? undefined,
          status: row.status ?? 'forSale',
          condition: row.condition ?? '',
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}
