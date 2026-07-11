/**
 * og-render — Supabase Edge Function serving per-route OG preview HTML
 * (docs/og-previews-spike.md, phase 1).
 *
 * nginx redirects unfurl crawlers here as
 *   GET /functions/v1/og-render?path=/show/<uuid>
 * (also /vendor/:id, /collector/:id, /museum/vendor/:id, /museum/collector/:id).
 *
 * Rows are read through PostgREST with the ANON key, so RLS enforces exactly
 * the visibility the app has: unpublished shows, unregistered vendors and
 * private collections all fall through to the generic site card (HTTP 200 —
 * never an error page, never leaked data).
 *
 * Deploy with --no-verify-jwt (public read-only endpoint, same trust level
 * as the anon key already baked into the shipped JS).
 */

import {
  parsePath,
  buildOgHtml,
  showOg,
  vendorOg,
  collectorOg,
  DEFAULT_OG,
  type OgData,
  type ParsedPath,
} from './og.ts';

// Minimal local declaration of the Deno globals this function uses, so the
// module also type-checks under plain tsc (no Deno toolchain on the dev
// machine). Erased at runtime; shape-compatible subset of the real global.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

// Injected automatically by the Supabase Edge runtime.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

/** Anon-key PostgREST read; returns the first row or null (never throws). */
async function fetchRow(
  table: string,
  query: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0
      ? (rows[0] as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Resolve a parsed route to card data; null when the row isn't visible. */
async function resolveRoute(parsed: ParsedPath): Promise<OgData | null> {
  const { type, id, path } = parsed;
  if (type === 'show') {
    // RLS already hides unpublished shows from anon; the filter is explicit
    // belt-and-braces to mirror the app's queries.
    const row = await fetchRow(
      'shows',
      `id=eq.${id}&published=is.true&select=name,show_date,city,state,venue_name`,
    );
    return row ? showOg(row, path) : null;
  }
  if (type === 'vendor') {
    // Registered vendors only (profile_id non-null), like /vendors + /vendor/:id.
    const row = await fetchRow(
      'vendors',
      `id=eq.${id}&profile_id=not.is.null&select=name,state,country,area_served`,
    );
    return row ? vendorOg(row, path) : null;
  }
  // collector: profiles are world-readable by design, so the public-collection
  // gate the app applies must be part of the filter here too.
  const row = await fetchRow(
    'profiles',
    `id=eq.${id}&collection_public=is.true&select=display_name,city,state,country`,
  );
  return row ? collectorOg(row, path) : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  // ?path= is what nginx sends; X-Original-Path kept as a fallback should the
  // deploy ever switch to the spike's proxy_pass variant.
  const raw = url.searchParams.get('path') ?? req.headers.get('x-original-path') ?? '';
  const parsed = parsePath(raw);
  const data = (parsed && (await resolveRoute(parsed))) ?? DEFAULT_OG;
  return new Response(buildOgHtml(data), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
});
