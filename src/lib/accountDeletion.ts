import { supabase } from './supabase';

/**
 * DELETE MY DATA — purge every row the signed-in account owns, then the
 * storage objects those rows referenced. The auth login and profiles row
 * survive (full account removal is a support request via /contact).
 *
 * Everything runs under RLS with the user's own client, so the owner-scoped
 * delete policies (0001/0006) are the real guardrail — nothing here can touch
 * another account's rows even if a filter were wrong.
 *
 * FK-safe order (children first — booths' and inventory's delete policies
 * subquery their PARENT rows, so parents must still exist when they run):
 *   1. booth_applications  (own applications; other applicants' rows on owned
 *      shows are outside our delete policy and fall to the shows FK cascade)
 *   2. booths of owned shows
 *   3. shows               (cascades any remaining booths / applications)
 *   4. inventory_items of owned vendors
 *   5. vendors             (cascades any remaining items / applications;
 *      owner_id scope also catches unregistered stores + old placeholders)
 *   6. interests           (own hearts; hearts on owned items cascaded in 4)
 *   7. collections
 *
 * Storage (live-verified 2026-07-10 on this project): only the CARDS bucket
 * is actually client-deletable. All four buckets carry owner-prefix DELETE
 * policies (cards: 0001, kept by 0003; banners/inventory/plans: 0002), but
 * the storage service's remove path only deletes objects it can SEE — and
 * banners/inventory/plans have no storage.objects SELECT policy (they're
 * public buckets; reads bypass RLS via the public endpoint). remove() there
 * returns `data: [], error: null` and deletes nothing — same service-level
 * policy quirk as the documented upsert-403 gotcha. Cards has 0001's
 * owner-prefix SELECT policy, so its objects really are removed (collected
 * BEFORE the rows disappear). Banner / inventory / plan images are skipped:
 * once their rows are gone the unguessable paths are unreachable (the same
 * discovery model 0003 gave the cards bucket) — the panel copy says so.
 */

export interface PurgeSummary {
  rowsDeleted: number;
  filesRemoved: number;
}

/** Storage removal batch size (well under the API's per-request limits). */
const REMOVE_CHUNK = 100;

function client() {
  if (!supabase) throw new Error('Accounts are not configured on this deployment.');
  return supabase;
}

type PageResult<Row> = { data: Row[] | null; error: { message: string } | null };

/** Page through a select so path collection survives >1000-row accounts. */
async function selectAll<Row>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<Row>>,
): Promise<Row[]> {
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** Run one counted delete, throwing a labelled error on failure. */
async function del(
  query: PromiseLike<{ error: { message: string } | null; count: number | null }>,
  label: string,
): Promise<number> {
  const { error, count } = await query;
  if (error) throw new Error(`Deleting ${label} failed: ${error.message}`);
  return count ?? 0;
}

export async function purgeMyData(
  userId: string,
  onProgress: (message: string) => void,
): Promise<PurgeSummary> {
  const sb = client();

  // ---- collect ids + card image paths BEFORE any rows disappear ----------
  onProgress('Taking inventory of your data…');

  const vendors = await selectAll<{ id: string }>((from, to) =>
    sb.from('vendors').select('id').eq('owner_id', userId).range(from, to),
  );
  const vendorIds = vendors.map((v) => v.id);

  const shows = await selectAll<{ id: string }>((from, to) =>
    sb.from('shows').select('id').eq('organizer_id', userId).range(from, to),
  );
  const showIds = shows.map((s) => s.id);

  // Cards is the one client-deletable bucket (see header) — collect its
  // paths now; banner / inventory / plan objects are left to become
  // unreachable with their rows.
  const cards = await selectAll<{ image_path: string | null }>((from, to) =>
    sb.from('collections').select('image_path').eq('owner_id', userId).range(from, to),
  );
  const cardPaths = cards.map((c) => c.image_path).filter((p): p is string => Boolean(p));

  // ---- rows, FK-safe order ------------------------------------------------
  const steps: { label: string; run: () => Promise<number> }[] = [
    {
      label: 'booth applications',
      run: async () => {
        // Own applications (the delete policy is applicant-scoped). The
        // own-store / own-show sweeps are belt-and-braces: insert RLS makes
        // those rows applicant-owned anyway, and anything left on owned
        // shows dies with the show's FK cascade below.
        let n = await del(
          sb.from('booth_applications').delete({ count: 'exact' }).eq('applicant_id', userId),
          'booth applications',
        );
        if (vendorIds.length) {
          n += await del(
            sb.from('booth_applications').delete({ count: 'exact' }).in('vendor_id', vendorIds),
            'booth applications',
          );
        }
        if (showIds.length) {
          n += await del(
            sb.from('booth_applications').delete({ count: 'exact' }).in('show_id', showIds),
            'booth applications',
          );
        }
        return n;
      },
    },
    ...(showIds.length
      ? [
          {
            label: 'booths',
            run: () =>
              del(sb.from('booths').delete({ count: 'exact' }).in('show_id', showIds), 'booths'),
          },
        ]
      : []),
    {
      label: 'shows',
      run: () =>
        del(sb.from('shows').delete({ count: 'exact' }).eq('organizer_id', userId), 'shows'),
    },
    ...(vendorIds.length
      ? [
          {
            label: 'inventory items',
            run: () =>
              del(
                sb.from('inventory_items').delete({ count: 'exact' }).in('vendor_id', vendorIds),
                'inventory items',
              ),
          },
        ]
      : []),
    {
      label: 'stores',
      run: () =>
        del(sb.from('vendors').delete({ count: 'exact' }).eq('owner_id', userId), 'stores'),
    },
    {
      label: 'interest marks',
      run: () =>
        del(
          sb.from('interests').delete({ count: 'exact' }).eq('user_id', userId),
          'interest marks',
        ),
    },
    {
      label: 'collection cards',
      run: () =>
        del(
          sb.from('collections').delete({ count: 'exact' }).eq('owner_id', userId),
          'collection cards',
        ),
    },
  ];

  let rowsDeleted = 0;
  for (let i = 0; i < steps.length; i++) {
    onProgress(`Deleting ${i + 1} of ${steps.length} — ${steps[i].label}…`);
    rowsDeleted += await steps[i].run();
  }

  // ---- card image objects (paths collected above) -------------------------
  let filesRemoved = 0;
  for (let i = 0; i < cardPaths.length; i += REMOVE_CHUNK) {
    const chunk = cardPaths.slice(i, i + REMOVE_CHUNK);
    onProgress(`Removing card images ${Math.min(i + chunk.length, cardPaths.length)} of ${cardPaths.length}…`);
    const { data, error } = await sb.storage.from('cards').remove(chunk);
    if (error) throw new Error(`Removing card images failed: ${error.message}`);
    filesRemoved += data?.length ?? 0;
  }

  onProgress('');
  return { rowsDeleted, filesRemoved };
}
