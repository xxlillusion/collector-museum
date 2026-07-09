import { supabase } from './supabase';
import { publicImageUrl } from './supabaseImages';
import type { CardMetaFields } from './cardMeta';

/**
 * Anon-safe public reads for collector profile pages (`/collector/:id`) and
 * the public collector museum — FROZEN signatures (Wave 2). Same contract as
 * publicVendors: degrade gracefully (null/empty) on missing config, malformed
 * ids, RLS denials or unapplied schema; never throw.
 *
 * Collection items only come back when the owner set collection_public (the
 * collections RLS gates anon selects); the cards bucket is public-read after
 * 0003 so `publicImageUrl('cards', ...)` works for these items.
 */

export interface PublicCollectorItem {
  id: string;
  imageUrl: string;
  name: string;
  /** width / height, computed at upload. */
  aspect: number;
  /** Card metadata from collections.metadata jsonb (set / number / year / grade / notes). */
  meta: CardMetaFields;
}

export interface PublicCollectorProfile {
  id: string;
  displayName: string;
  country: string | null;
  state: string | null;
  city: string | null;
  bio: string;
  /** False = the profile exists but the collection is private (or empty of
   *  public rows) — pages show the private note instead of a grid. */
  collectionPublic: boolean;
  items: PublicCollectorItem[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPublicCollectorProfile(
  profileId: string,
): Promise<PublicCollectorProfile | null> {
  if (!supabase) return null;
  if (!UUID_RE.test(profileId)) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, country, state, city, bio, collection_public')
      .eq('id', profileId)
      .maybeSingle();
    if (error || !data) return null;
    const profile = data as unknown as {
      id: string;
      display_name: string;
      country: string | null;
      state: string | null;
      city: string | null;
      bio: string;
      collection_public: boolean;
    };

    let items: PublicCollectorItem[] = [];
    if (profile.collection_public) {
      const { data: rows, error: itemErr } = await supabase
        .from('collections')
        .select('id, image_path, name, aspect, metadata')
        .eq('owner_id', profileId)
        .order('added_at', { ascending: true });
      if (!itemErr && rows) {
        items = (rows as unknown as {
          id: string;
          image_path: string;
          name: string;
          aspect: number;
          metadata: Record<string, unknown> | null;
        }[]).map((row) => {
          const meta: CardMetaFields = {};
          for (const k of ['setName', 'cardNumber', 'year', 'grade', 'notes'] as const) {
            const v = row.metadata?.[k];
            if (typeof v === 'string' && v) meta[k] = v;
          }
          return {
            id: row.id,
            imageUrl: publicImageUrl('cards', row.image_path),
            name: row.name ?? '',
            aspect: row.aspect > 0 ? row.aspect : 0.714,
            meta,
          };
        });
      }
    }

    return {
      id: profile.id,
      displayName: profile.display_name ?? '',
      country: profile.country ?? null,
      state: profile.state ?? null,
      city: profile.city ?? null,
      bio: profile.bio ?? '',
      collectionPublic: Boolean(profile.collection_public),
      items,
    };
  } catch {
    return null;
  }
}
