import type { PublicShowSummary } from './publicShows';
import type { RegisteredVendorSummary } from './publicVendors';
import type { InventoryStatus } from './db';

/**
 * Cross-entity search (roadmap item 14) — shows, registered vendors, and
 * public inventory items by caption. Anon-safe like the other public readers:
 * missing config / errors resolve to empty results, never a throw.
 *
 * SCAFFOLD: types are the frozen seam; `searchAll` is implemented by the
 * search workstream (three parallel `.ilike` queries, `%`/`_` escaped,
 * min-2-char guard, limits 20/20/60).
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

export async function searchAll(q: string): Promise<SearchResults> {
  void q; // implemented by the search workstream
  return EMPTY_RESULTS;
}
