import { supabase } from './supabase';
import { uploadImage, removeImage, downloadImageIfExists } from './supabaseImages';
import type { VendorPlanMeta, VendorRect } from './vendorPlan';
import { reconstructPlanMeta } from './publicShows';

/**
 * Authed organizer operations on the cloud `shows` / `booths` tables.
 * Callers pass the organizer id from useAuth's session at the call site —
 * these are plain async functions, not hooks, so DOM screens and the setup
 * screen can share them. All functions throw on failure (callers surface
 * the message inline); guests never reach them (UI gates on session).
 */

export interface MyShow {
  id: string;
  name: string;
  showDate: string | null; // ISO yyyy-mm-dd
  published: boolean;
  boothCount: number;
  hasPlanImage: boolean;
  updatedAt: string; // ISO timestamp
}

/** Everything the organizer edit screen needs to reload a show into the
 *  local working slots (the same pattern useSavedPlans.loadPlan uses). */
export interface MyShowForEdit {
  id: string;
  name: string;
  showDate: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  published: boolean;
  meta: VendorPlanMeta | null;
  planBlob: Blob | null;
}

function client() {
  if (!supabase) throw new Error('Accounts are not configured on this deployment.');
  return supabase;
}

/**
 * rect → booths-row mapping shared by publish and update: rect jsonb goes in
 * verbatim; the vendor_id FK is set only when that vendor exists in the cloud
 * (guest vendors live in IndexedDB only; the original vendorId stays inside
 * the rect jsonb so a later import can re-link).
 */
async function boothRowsFromRects(
  sb: NonNullable<typeof supabase>,
  showId: string,
  rects: VendorRect[],
): Promise<{ show_id: string; rect: VendorRect; vendor_id: string | null }[]> {
  const vendorIds = [
    ...new Set(rects.map((r) => r.vendorId).filter((v): v is string => Boolean(v))),
  ];
  let cloudVendorIds = new Set<string>();
  if (vendorIds.length > 0) {
    const { data: vendorRows } = await sb.from('vendors').select('id').in('id', vendorIds);
    cloudVendorIds = new Set((vendorRows ?? []).map((v: { id: string }) => v.id));
  }
  return rects.map((r) => ({
    show_id: showId,
    rect: r,
    vendor_id: r.vendorId && cloudVendorIds.has(r.vendorId) ? r.vendorId : null,
  }));
}

/**
 * Publish the current working floor plan as a public show:
 * 1. insert a `shows` row (plan_meta = VendorPlanMeta minus rects),
 * 2. upload the plan image to plans/<showId>/plan.webp (the Storage policy
 *    requires the show row to exist first),
 * 3. write one `booths` row per rect — rect jsonb verbatim; vendor_id FK set
 *    only when that vendor exists in the cloud (guest vendors live in
 *    IndexedDB only; the original vendorId stays inside the rect jsonb so a
 *    later import can re-link).
 * Each publish mints a new show — the local working plan has no cloud
 * identity to upsert against. Returns the new show id.
 */
export async function publishShow(args: {
  organizerId: string;
  name: string;
  showDate?: string;
  country?: string;
  state?: string;
  city?: string;
  planBlob: Blob;
  meta: VendorPlanMeta;
}): Promise<string> {
  const sb = client();
  const { rects, ...planMeta } = args.meta;

  const { data: show, error: showErr } = await sb
    .from('shows')
    .insert({
      organizer_id: args.organizerId,
      name: args.name,
      show_date: args.showDate ?? null,
      country: args.country ?? null,
      state: args.state ?? null,
      city: args.city ?? null,
      plan_meta: planMeta,
      published: true,
    })
    .select('id')
    .single();
  if (showErr || !show) {
    throw new Error(`publish show: ${showErr?.message ?? 'no row returned'}`);
  }
  const showId = show.id as string;

  // Owner-uid prefix — the storage insert policy is a plain auth.uid() path
  // check (0002 migration); readers use the stored plan_image_path column.
  const planPath = `${args.organizerId}/${showId}/plan.webp`;
  await uploadImage('plans', planPath, args.planBlob);
  const { error: pathErr } = await sb
    .from('shows')
    .update({ plan_image_path: planPath, updated_at: new Date().toISOString() })
    .eq('id', showId);
  if (pathErr) throw new Error(`publish show: ${pathErr.message}`);

  // Replace this show's booths (fresh show, but delete-first keeps the
  // function safe if it's ever pointed at an existing id).
  await sb.from('booths').delete().eq('show_id', showId);
  if (rects.length > 0) {
    const rows = await boothRowsFromRects(sb, showId, rects);
    const { error: boothErr } = await sb.from('booths').insert(rows);
    if (boothErr) throw new Error(`publish booths: ${boothErr.message}`);
  }

  return showId;
}

/**
 * Save edits to an existing show: name/date/location/plan_meta always; the
 * plan image only when `planBlob` is passed (i.e. the organizer replaced it —
 * a fresh versioned filename dodges CDN caching on the public URL); booths
 * are replaced wholesale (delete-then-insert, same normalization as publish).
 */
export async function updateShow(args: {
  showId: string;
  organizerId: string;
  name: string;
  showDate?: string;
  country?: string;
  state?: string;
  city?: string;
  meta: VendorPlanMeta;
  planBlob?: Blob;
}): Promise<void> {
  const sb = client();
  const { rects, ...planMeta } = args.meta;

  const patch: Record<string, unknown> = {
    name: args.name,
    show_date: args.showDate ?? null,
    country: args.country ?? null,
    state: args.state ?? null,
    city: args.city ?? null,
    plan_meta: planMeta,
    updated_at: new Date().toISOString(),
  };

  if (args.planBlob) {
    const { data: row } = await sb
      .from('shows')
      .select('plan_image_path')
      .eq('id', args.showId)
      .maybeSingle();
    const oldPath = (row as { plan_image_path: string | null } | null)?.plan_image_path;
    // Remove-then-upload (never upsert — the storage service 403s x-upsert
    // writes on buckets without a SELECT policy).
    if (oldPath) await removeImage('plans', oldPath);
    const planPath = `${args.organizerId}/${args.showId}/plan-${Date.now()}.webp`;
    await uploadImage('plans', planPath, args.planBlob);
    patch.plan_image_path = planPath;
  }

  const { error: showErr } = await sb.from('shows').update(patch).eq('id', args.showId);
  if (showErr) throw new Error(`update show: ${showErr.message}`);

  const { error: delErr } = await sb.from('booths').delete().eq('show_id', args.showId);
  if (delErr) throw new Error(`update booths: ${delErr.message}`);
  if (rects.length > 0) {
    const rows = await boothRowsFromRects(sb, args.showId, rects);
    const { error: boothErr } = await sb.from('booths').insert(rows);
    if (boothErr) throw new Error(`update booths: ${boothErr.message}`);
  }
}

/**
 * Load one of the organizer's shows for the edit screen: reconstructed
 * working-slot meta (plan_meta + booth rects) + the plan image downloaded to
 * a Blob so it can be seeded into the local working slots. Returns null when
 * the show doesn't exist or isn't visible to the caller (RLS).
 */
export async function getMyShowForEdit(id: string): Promise<MyShowForEdit | null> {
  const sb = client();
  const { data, error } = await sb
    .from('shows')
    .select(
      'id, name, show_date, country, state, city, published, plan_image_path, plan_meta, booths(rect)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`load show: ${error.message}`);
  if (!data) return null;
  const show = data as {
    id: string;
    name: string;
    show_date: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
    published: boolean;
    plan_image_path: string | null;
    plan_meta: Record<string, unknown> | null;
    booths: { rect: unknown }[] | null;
  };

  const meta = reconstructPlanMeta(
    (show.plan_meta ?? {}) as Partial<VendorPlanMeta>,
    (show.booths ?? []).map((b) => b.rect),
  );
  // Existence-check via the stored path column; downloadImageIfExists avoids
  // the blind-download 400 console error if the object went missing anyway.
  const planBlob = show.plan_image_path
    ? (await downloadImageIfExists('plans', show.plan_image_path)) ?? null
    : null;

  return {
    id: show.id,
    name: show.name,
    showDate: show.show_date ?? null,
    country: show.country ?? null,
    state: show.state ?? null,
    city: show.city ?? null,
    published: show.published,
    meta,
    planBlob,
  };
}

/** The organizer's own shows (published or not), newest first. */
export async function listMyShows(organizerId: string): Promise<MyShow[]> {
  const sb = client();
  const { data, error } = await sb
    .from('shows')
    .select('id, name, show_date, published, plan_image_path, updated_at, booths(count)')
    .eq('organizer_id', organizerId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`list shows: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as {
      id: string;
      name: string;
      show_date: string | null;
      published: boolean;
      plan_image_path: string | null;
      updated_at: string;
      booths: { count: number }[] | null;
    };
    return {
      id: r.id,
      name: r.name,
      showDate: r.show_date ?? null,
      published: r.published,
      boothCount: r.booths?.[0]?.count ?? 0,
      hasPlanImage: Boolean(r.plan_image_path),
      updatedAt: r.updated_at,
    };
  });
}

/** Toggle a show's public visibility (rows stay; booths untouched). */
export async function setShowPublished(id: string, published: boolean): Promise<void> {
  const sb = client();
  const { error } = await sb
    .from('shows')
    .update({ published, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`${published ? 'publish' : 'unpublish'} show: ${error.message}`);
}

export async function unpublishShow(id: string): Promise<void> {
  await setShowPublished(id, false);
}

/** Delete a show outright — booths cascade; the plan image is removed too. */
export async function deleteShow(id: string): Promise<void> {
  const sb = client();
  const { data: row } = await sb
    .from('shows')
    .select('plan_image_path')
    .eq('id', id)
    .maybeSingle();
  const planPath = (row as { plan_image_path: string | null } | null)?.plan_image_path;
  // Remove the image while the show row still exists — the Storage delete
  // policy authorizes via the owning show row. removeImage never throws.
  if (planPath) await removeImage('plans', planPath);
  const { error } = await sb.from('shows').delete().eq('id', id);
  if (error) throw new Error(`delete show: ${error.message}`);
}
