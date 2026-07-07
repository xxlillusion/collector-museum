import { supabase } from './supabase';

/**
 * Shared Storage image transfer helpers — FROZEN (all platform workstreams
 * use these; none edit them). Blob is the currency on both sides so hooks,
 * object-URL lifecycles and sleeve textures stay backend-agnostic.
 *
 * Buckets (see supabase/migrations/0001_init.sql): banners / inventory /
 * plans are public, cards is private. Path convention: <owning id>/<name>.webp
 */
export type ImageBucket = 'banners' | 'inventory' | 'plans' | 'cards';

export async function uploadImage(
  bucket: ImageBucket,
  path: string,
  blob: Blob,
): Promise<void> {
  const { error } = await supabase!.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || 'image/webp',
    upsert: true,
  });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
}

/** Download to a Blob. Works for private buckets too (authed client). */
export async function downloadImage(bucket: ImageBucket, path: string): Promise<Blob> {
  const { data, error } = await supabase!.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download ${bucket}/${path}: ${error?.message}`);
  return data;
}

/** Like downloadImage but resolves undefined when the object doesn't exist. */
export async function downloadImageIfExists(
  bucket: ImageBucket,
  path: string,
): Promise<Blob | undefined> {
  const { data, error } = await supabase!.storage.from(bucket).download(path);
  if (error || !data) return undefined;
  return data;
}

/** CDN-cacheable URL — public buckets only (banners / inventory / plans). */
export function publicImageUrl(bucket: ImageBucket, path: string): string {
  return supabase!.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function removeImage(bucket: ImageBucket, path: string): Promise<void> {
  await supabase!.storage.from(bucket).remove([path]);
}
