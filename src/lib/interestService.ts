import { supabase } from './supabase';

/**
 * "I'm interested" want-list (0006).
 *
 * Local-first: every visitor gets a localStorage want-list keyed by inventory
 * item id, so hearts work anonymously and in the sandbox. Signed-in users
 * additionally sync a row into the `interests` table (fire-and-forget — an
 * unapplied migration or offline write never breaks the toggle), which is
 * what powers the vendor-side demand counts in the registry.
 */

const WANTS_KEY = 'vendor-museum:wants';

function readWants(): Set<string> {
  try {
    const raw = localStorage.getItem(WANTS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeWants(wants: Set<string>): void {
  try {
    if (wants.size === 0) localStorage.removeItem(WANTS_KEY);
    else localStorage.setItem(WANTS_KEY, JSON.stringify([...wants]));
  } catch {
    // storage denied/full — in-memory behavior still holds for this session
  }
}

export function isWanted(itemId: string): boolean {
  return readWants().has(itemId);
}

/** Toggle locally (sync) and mirror to the cloud when signed in. Returns the new state. */
export function toggleWant(userId: string | null, itemId: string): boolean {
  const wants = readWants();
  const wanted = !wants.has(itemId);
  if (wanted) wants.add(itemId);
  else wants.delete(itemId);
  writeWants(wants);

  if (userId && supabase) {
    const sb = supabase;
    void (async () => {
      try {
        if (wanted) {
          await sb.from('interests').upsert(
            { user_id: userId, item_id: itemId },
            { onConflict: 'user_id,item_id', ignoreDuplicates: true },
          );
        } else {
          await sb.from('interests').delete().eq('user_id', userId).eq('item_id', itemId);
        }
      } catch {
        // non-fatal — the local toggle already happened
      }
    })();
  }
  return wanted;
}

/**
 * Demand counts for a vendor's items (item id → interested users). Only the
 * vendor's owner sees full counts (interests RLS); everyone else gets {}.
 */
export async function fetchInterestCounts(vendorId: string): Promise<Map<string, number>> {
  if (!supabase) return new Map();
  try {
    const { data, error } = await supabase
      .from('interests')
      .select('item_id, inventory_items!inner(vendor_id)')
      .eq('inventory_items.vendor_id', vendorId);
    if (error || !data) return new Map();
    const counts = new Map<string, number>();
    for (const row of data as unknown as { item_id: string }[]) {
      counts.set(row.item_id, (counts.get(row.item_id) ?? 0) + 1);
    }
    return counts;
  } catch {
    return new Map();
  }
}
