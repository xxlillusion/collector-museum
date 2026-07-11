/**
 * og-render — pure, runtime-agnostic half of the OG-preview Edge Function
 * (docs/og-previews-spike.md, phase 1).
 *
 * Everything here is plain erasable TypeScript: no Deno APIs, no imports.
 * That keeps it unit-testable under Node (`node --test` with native type
 * stripping) even though it deploys to the Supabase Deno runtime.
 * index.ts owns the serve loop + PostgREST fetches; this module owns path
 * parsing and HTML generation.
 */

export const SITE_ORIGIN = 'https://museum.maybesomething.tech';
export const SITE_NAME = 'Vendor Museum';

/** The site-level card copy (mirrors index.html's static tags). */
const SITE_TITLE = 'Vendor Museum — walk card shows in 3D';
const SITE_DESCRIPTION =
  'Hang your card collection as framed art, browse vendor inventory binders, ' +
  'and walk real card-show floor plans in first person.';

// ------------------------------------------------------------ path parsing

export type RouteType = 'show' | 'vendor' | 'collector';

export interface ParsedPath {
  type: RouteType;
  /** Lowercased UUID, regex-validated — safe to interpolate into a PostgREST URL. */
  id: string;
  /** Normalized site-relative path (query/hash/trailing slash stripped) — og:url + human bounce target. */
  path: string;
}

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/** All five shareable route shapes; museum wrappers map to their flat data. */
const ROUTES: ReadonlyArray<{ re: RegExp; type: RouteType }> = [
  { re: new RegExp(`^/show/(${UUID})$`), type: 'show' },
  { re: new RegExp(`^/vendor/(${UUID})$`), type: 'vendor' },
  { re: new RegExp(`^/collector/(${UUID})$`), type: 'collector' },
  { re: new RegExp(`^/museum/vendor/(${UUID})$`), type: 'vendor' },
  { re: new RegExp(`^/museum/collector/(${UUID})$`), type: 'collector' },
];

/**
 * Parse a raw request path (nginx sends `$request_uri`, which may carry a
 * query string) into a shareable route. Anything that doesn't match one of
 * the five shapes exactly returns null → generic site card.
 */
export function parsePath(raw: string): ParsedPath | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
  let path = raw.split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  for (const route of ROUTES) {
    const m = route.re.exec(path);
    if (m) return { type: route.type, id: m[1].toLowerCase(), path };
  }
  return null;
}

// -------------------------------------------------------------- OG payload

export interface OgData {
  title: string;
  description: string;
  /** Site-relative path for og:url + the human bounce. Root for the generic card. */
  path: string;
  /** Basename of the static card image under public/ (all are 1200×630). */
  imageFile: string;
}

export const DEFAULT_OG: OgData = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  path: '/',
  imageFile: 'og-default.png',
};

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function joinBits(bits: Array<string | null>, sep: string): string {
  return bits.filter((b): b is string => Boolean(b)).join(sep);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-07-12" → "July 12, 2026" — string math only, no Date/timezone traps. */
export function formatShowDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(m[3])}, ${Number(m[1])}`;
}

/** shows row (name, show_date, city, state, venue_name) → card data. */
export function showOg(row: Record<string, unknown>, path: string): OgData {
  const name = str(row.name) || 'Card show';
  const date = formatShowDate(str(row.show_date));
  const place = joinBits([str(row.venue_name) || null, joinBits([str(row.city) || null, str(row.state) || null], ', ') || null], ' · ');
  const specifics = joinBits([date, place || null], ' · ');
  return {
    title: `${name} — ${SITE_NAME}`,
    description:
      (specifics ? `${specifics} — ` : '') +
      'Walk this card show in 3D: the real floor plan, vendor booths, and browsable inventory binders.',
    path,
    imageFile: 'og-show.png',
  };
}

/** vendors row (name, state, country, area_served) → card data. */
export function vendorOg(row: Record<string, unknown>, path: string): OgData {
  const name = str(row.name) || 'Vendor';
  const loc = joinBits([str(row.state) || null, str(row.country) || null], ', ');
  const area = str(row.area_served);
  const specifics = joinBits([loc || null, area ? `serves ${area}` : null], ' · ');
  return {
    title: `${name} — ${SITE_NAME}`,
    description:
      (specifics ? `${specifics} — ` : '') +
      'Card-show vendor on Vendor Museum: browse the inventory binder and walk their museum in 3D.',
    path,
    imageFile: 'og-vendor.png',
  };
}

/** profiles row (display_name, city, state, country) → card data. */
export function collectorOg(row: Record<string, unknown>, path: string): OgData {
  const name = str(row.display_name) || 'A Collector';
  const loc = joinBits([str(row.city) || null, str(row.state) || null, str(row.country) || null], ', ');
  return {
    title: `${name}'s Collection — ${SITE_NAME}`,
    description:
      (loc ? `${loc} — ` : '') +
      'A private card collection, spotlit: walk the gallery in 3D on Vendor Museum.',
    path,
    imageFile: 'og-collector.png',
  };
}

// ------------------------------------------------------------------- HTML

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Minimal crawler-facing HTML. A meta-refresh + plain link bounce any human
 * who lands here (bot-UA extensions, curl users) to the real SPA route —
 * several unfurlers refuse to read tags off 30x responses, hence no redirect.
 * Every interpolated value is escaped; paths are additionally regex-validated
 * upstream (parsePath) or the constant '/'.
 */
export function buildOgHtml(data: OgData): string {
  const title = escapeHtml(data.title);
  const description = escapeHtml(data.description);
  const url = escapeHtml(SITE_ORIGIN + data.path);
  const image = escapeHtml(`${SITE_ORIGIN}/${data.imageFile}`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<meta http-equiv="refresh" content="0;url=${url}">
</head>
<body>
<p><a href="${url}">Continue to ${title} →</a></p>
</body>
</html>
`;
}
