import { supabase } from './supabase';

/**
 * Anonymous walk counters (0007).
 *
 * The dumbest honest analytics: one number per public walkable thing that
 * goes up when someone walks it. No identifiers, no cookies, nothing
 * per-person — a localStorage key day-dedupes repeat walks per browser and
 * that is the entire client-side footprint.
 *
 * Everything degrades silently, including the console. An unapplied 0007
 * migration would make blind REST calls 404 at PostgREST — and Chromium
 * prints an unsuppressable "Failed to load resource" console error for
 * every non-2xx response, even when the JS handles it (the cousin of the
 * storage.download() 400 gotcha). So nothing touches REST until a one-time
 * probe against /graphql/v1 (always HTTP 200 on Supabase — schema errors
 * ride the JSON body; 0007 enables pg_graphql) confirms visit_counts
 * exists. Pre-migration: probe answers "not ready", recordWalk/fetchWalks
 * no-op, zero console errors, zero UI difference. Post-migration: the
 * positive result latches into localStorage and everything runs over plain
 * REST. Applying 0007 to the live project is what turns the feature on —
 * no client rebuild needed.
 */

export type WalkKind = 'show' | 'vendor' | 'collector';

// target_id is a uuid column — a malformed id would 400 at PostgREST, so
// skip the round trip entirely (same guard as publicShows.getShowForWalk).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dedupeKey = (kind: WalkKind, id: string) =>
  `vendor-museum:walked:${kind}:${id}:${new Date().toISOString().slice(0, 10)}`;

// Latched once the probe succeeds — migrations never unapply, so a positive
// answer is good forever and later sessions skip the probe entirely.
const READY_KEY = 'vendor-museum:visit-counts-ready';

let readyPromise: Promise<boolean> | null = null;

/** One GraphQL round trip asking whether visit_counts is queryable. Both
 *  outcomes are HTTP 200 (even with pg_graphql disabled the endpoint answers
 *  200 + an errors body), so an unapplied migration never logs anything. */
async function probeVisitCounts(): Promise<boolean> {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) return false;
    // Default pg_graphql naming first; inflected fallback in case the
    // project ever opts into camelCase inflection.
    for (const field of ['visit_countsCollection', 'visitCountsCollection']) {
      const res = await fetch(`${url}/graphql/v1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ query: `{ ${field}(first: 1) { edges { node { walks } } } }` }),
      });
      if (!res.ok) return false;
      const json = (await res.json()) as {
        data?: Record<string, unknown> | null;
        errors?: unknown[];
      };
      if (!json.errors && json.data && json.data[field] != null) {
        try {
          localStorage.setItem(READY_KEY, '1');
        } catch {
          // storage denied — the module-level promise still caches this session
        }
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function backendReady(): Promise<boolean> {
  try {
    if (localStorage.getItem(READY_KEY)) return Promise.resolve(true);
  } catch {
    // storage denied — fall through to the (session-cached) probe
  }
  if (!readyPromise) readyPromise = probeVisitCounts();
  return readyPromise;
}

/**
 * Bump a counter — fire-and-forget, at most once per browser per day.
 * Callers: public show walks (ShowDetail's WALK handler) and the public
 * vendor/collector museums on mount. NOT the /demo route, NOT sandbox halls.
 */
export function recordWalk(kind: WalkKind, id: string): void {
  if (!supabase || !UUID_RE.test(id)) return;
  const sb = supabase;
  try {
    const key = dedupeKey(kind, id);
    if (localStorage.getItem(key)) return; // already counted today
    localStorage.setItem(key, '1');
  } catch {
    // storage denied/full — still count this walk, just without the dedupe
  }
  void backendReady()
    .then((ready) => {
      if (!ready) return undefined; // unapplied migration — silently invisible
      return sb.rpc('record_walk', { p_kind: kind, p_target: id });
    })
    .then(undefined, () => undefined);
}

/** Current count, or null on any failure — callers hide the line on null. */
export async function fetchWalks(kind: WalkKind, id: string): Promise<number | null> {
  if (!supabase || !UUID_RE.test(id)) return null;
  try {
    if (!(await backendReady())) return null;
    const { data, error } = await supabase
      .from('visit_counts')
      .select('walks')
      .eq('kind', kind)
      .eq('target_id', id)
      .maybeSingle();
    if (error || !data) return null;
    const walks = Number((data as { walks: number | string }).walks);
    return Number.isFinite(walks) ? walks : null;
  } catch {
    return null;
  }
}
