import { supabase } from './supabase';
import type { AccountType } from './auth';

/**
 * Authed profile + my-stores operations. Like showService, these are plain
 * async functions outside the DataProvider seam (profiles only exist for
 * signed-in users; guests never reach them). Callers pass the user id from
 * useAuth's session. All functions throw on failure except where noted.
 *
 * "Store" = a vendors row with profile_id = the account (migration 0004:
 * up to STORE_LIMIT per profile, exactly one flagship — the default store).
 * Placeholder vendors (profile_id null) are not stores and never appear here.
 */

export const STORE_LIMIT = 2;

export interface ProfileRecord {
  id: string;
  displayName: string;
  accountType: AccountType;
  isOrganizer: boolean;
  country: string | null;
  state: string | null;
  city: string | null;
  bio: string;
  collectionPublic: boolean;
}

/** One of the signed-in account's registered stores. */
export interface MyStoreRecord {
  id: string;
  name: string;
  country: string | null;
  state: string | null;
  areaServed: string;
  inventoryPublic: boolean;
  isFlagship: boolean;
}

function client() {
  if (!supabase) throw new Error('Accounts are not configured on this deployment.');
  return supabase;
}

interface ProfileRow {
  id: string;
  display_name: string;
  account_type: string;
  is_organizer: boolean;
  country: string | null;
  state: string | null;
  city: string | null;
  bio: string;
  collection_public: boolean;
}

function toProfile(row: ProfileRow): ProfileRecord {
  return {
    id: row.id,
    displayName: row.display_name ?? '',
    accountType: row.account_type === 'vendor' ? 'vendor' : 'collector',
    isOrganizer: Boolean(row.is_organizer),
    country: row.country ?? null,
    state: row.state ?? null,
    city: row.city ?? null,
    bio: row.bio ?? '',
    collectionPublic: Boolean(row.collection_public),
  };
}

export async function getMyProfile(userId: string): Promise<ProfileRecord | null> {
  const sb = client();
  const { data, error } = await sb
    .from('profiles')
    .select('id, display_name, account_type, is_organizer, country, state, city, bio, collection_public')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`load profile: ${error.message}`);
  return data ? toProfile(data as unknown as ProfileRow) : null;
}

export async function updateMyProfile(
  userId: string,
  patch: Partial<Omit<ProfileRecord, 'id'>>,
): Promise<void> {
  const sb = client();
  const row: Record<string, unknown> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.accountType !== undefined) row.account_type = patch.accountType;
  if (patch.isOrganizer !== undefined) row.is_organizer = patch.isOrganizer;
  if (patch.country !== undefined) row.country = patch.country;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.bio !== undefined) row.bio = patch.bio;
  if (patch.collectionPublic !== undefined) row.collection_public = patch.collectionPublic;
  if (Object.keys(row).length === 0) return;
  const { error } = await sb.from('profiles').update(row).eq('id', userId);
  if (error) throw new Error(`update profile: ${error.message}`);
}

interface MyStoreRow {
  id: string;
  name: string;
  country: string | null;
  state: string | null;
  area_served: string;
  inventory_public: boolean;
  is_flagship: boolean;
}

const STORE_COLUMNS = 'id, name, country, state, area_served, inventory_public, is_flagship';

function toStore(row: MyStoreRow): MyStoreRecord {
  return {
    id: row.id,
    name: row.name,
    country: row.country ?? null,
    state: row.state ?? null,
    areaServed: row.area_served ?? '',
    inventoryPublic: row.inventory_public !== false,
    isFlagship: Boolean(row.is_flagship),
  };
}

/** The account's registered stores — flagship first, then oldest first. */
export async function listMyStores(userId: string): Promise<MyStoreRecord[]> {
  const sb = client();
  const { data, error } = await sb
    .from('vendors')
    .select(STORE_COLUMNS)
    .eq('profile_id', userId)
    .order('is_flagship', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`load stores: ${error.message}`);
  return ((data ?? []) as unknown as MyStoreRow[]).map(toStore);
}

/**
 * Create a registered store (client-side STORE_LIMIT check; migration 0004's
 * trigger backstops it). The first store becomes the flagship and flips the
 * profile to account_type 'vendor' so vendor gating (registry entry, vendor
 * directory) lights up.
 */
export async function createStore(userId: string, name: string): Promise<MyStoreRecord> {
  const sb = client();
  const existing = await listMyStores(userId);
  if (existing.length >= STORE_LIMIT) {
    throw new Error(`Store limit reached — an account may hold at most ${STORE_LIMIT} stores.`);
  }
  const { data, error } = await sb
    .from('vendors')
    .insert({
      owner_id: userId,
      profile_id: userId,
      name: name.trim() || 'My Table',
      is_flagship: existing.length === 0,
    })
    .select(STORE_COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(`create store: ${error?.message ?? 'no row returned'}`);
  }
  if (existing.length === 0) {
    // First store makes the account a vendor. Best-effort — the store exists
    // either way, and Account re-syncs the flag on next load.
    try {
      await updateMyProfile(userId, { accountType: 'vendor' });
    } catch { /* non-fatal */ }
  }
  return toStore(data as unknown as MyStoreRow);
}

/** Make this store the account's flagship (its default store). */
export async function setFlagshipStore(storeId: string): Promise<void> {
  const sb = client();
  const { error } = await sb.rpc('set_flagship_store', { store_id: storeId });
  if (error) throw new Error(`set flagship: ${error.message}`);
}

/**
 * Get-or-create the account's first store. Fallback for legacy accounts made
 * before the signup trigger (or a collector using Become a Vendor).
 */
export async function ensureFirstStore(
  userId: string,
  displayName: string,
): Promise<MyStoreRecord> {
  const existing = await listMyStores(userId);
  if (existing.length > 0) return existing[0];
  return createStore(userId, displayName);
}

export async function updateMyStoreSettings(
  storeId: string,
  patch: Partial<Omit<MyStoreRecord, 'id' | 'isFlagship'>>,
): Promise<void> {
  const sb = client();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.country !== undefined) row.country = patch.country;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.areaServed !== undefined) row.area_served = patch.areaServed;
  if (patch.inventoryPublic !== undefined) row.inventory_public = patch.inventoryPublic;
  const { error } = await sb.from('vendors').update(row).eq('id', storeId);
  if (error) throw new Error(`update store: ${error.message}`);
}
