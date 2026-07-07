import { supabase } from './supabase';
import type { AccountType } from './auth';

/**
 * Authed profile + canonical-vendor operations — FROZEN signatures (Wave 2).
 * Like showService, these are plain async functions outside the DataProvider
 * seam (profiles only exist for signed-in users; guests never reach them).
 * Callers pass the user id from useAuth's session. All functions throw on
 * failure except where noted.
 */

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

/** The signed-in vendor account's canonical vendor row (profile_id = uid). */
export interface MyVendorRecord {
  id: string;
  name: string;
  country: string | null;
  state: string | null;
  areaServed: string;
  inventoryPublic: boolean;
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

interface MyVendorRow {
  id: string;
  name: string;
  country: string | null;
  state: string | null;
  area_served: string;
  inventory_public: boolean;
}

function toMyVendor(row: MyVendorRow): MyVendorRecord {
  return {
    id: row.id,
    name: row.name,
    country: row.country ?? null,
    state: row.state ?? null,
    areaServed: row.area_served ?? '',
    inventoryPublic: row.inventory_public !== false,
  };
}

export async function getMyVendor(userId: string): Promise<MyVendorRecord | null> {
  const sb = client();
  const { data, error } = await sb
    .from('vendors')
    .select('id, name, country, state, area_served, inventory_public')
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) throw new Error(`load vendor profile: ${error.message}`);
  return data ? toMyVendor(data as unknown as MyVendorRow) : null;
}

/**
 * Get-or-create the canonical vendor row. The signup trigger creates it for
 * vendor accounts made after migration 0003; this is the fallback for legacy
 * accounts (or a collector switching to vendor).
 */
export async function ensureCanonicalVendor(
  userId: string,
  displayName: string,
): Promise<MyVendorRecord> {
  const existing = await getMyVendor(userId);
  if (existing) return existing;
  const sb = client();
  const { data, error } = await sb
    .from('vendors')
    .insert({
      owner_id: userId,
      profile_id: userId,
      name: displayName.trim() || 'My Table',
    })
    .select('id, name, country, state, area_served, inventory_public')
    .single();
  if (error || !data) {
    throw new Error(`create vendor profile: ${error?.message ?? 'no row returned'}`);
  }
  return toMyVendor(data as unknown as MyVendorRow);
}

export async function updateMyVendorSettings(
  vendorId: string,
  patch: Partial<Omit<MyVendorRecord, 'id'>>,
): Promise<void> {
  const sb = client();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.country !== undefined) row.country = patch.country;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.areaServed !== undefined) row.area_served = patch.areaServed;
  if (patch.inventoryPublic !== undefined) row.inventory_public = patch.inventoryPublic;
  const { error } = await sb.from('vendors').update(row).eq('id', vendorId);
  if (error) throw new Error(`update vendor profile: ${error.message}`);
}
