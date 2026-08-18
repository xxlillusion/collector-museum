// Collectr JSON → CollectrItem[]. Pure: no fs, no network, no Playwright.
//
// WHY heuristics instead of a hardcoded endpoint and field map: Collectr has
// no public portfolio API. Holdings sit behind auth.getcollectr.com, so nobody
// could read the real response shape while writing this file. Everything here
// is therefore written to survive an unknown schema AND to be inspected before
// it is trusted — discover.mjs dry-runs this module against the user's own
// captured responses and prints the mapping it inferred.
//
// Kept pure (and Node-runnable, in the collectrImport.ts tradition) so the
// dry-run in discover.mjs and the real run in export.mjs execute literally the
// same code. A preview that can't lie is worth more than a clever parser.

/** Field aliases used for SCORING a candidate array. */
export const FIELD_ALIASES = {
  id: ['id', 'productId', 'product_id', 'cardId', 'itemId', 'collectionItemId'],
  name: ['name', 'cardName', 'productName', 'title'],
  set: ['setName', 'set', 'expansion', 'setTitle', 'series'],
  number: ['cardNumber', 'number', 'collectorNumber', 'cardNum'],
  qty: ['quantity', 'qty', 'count', 'copies'],
  condition: ['condition', 'conditionName'],
  grade: ['grade', 'gradeLabel', 'gradeValue', 'gradingCompany'],
  image: ['imageUrl', 'image', 'imageUrlSmall', 'frontImage', 'thumbnail', 'img'],
};

// Read-time only. These do not affect scoring (the scored set above is fixed
// so scores stay comparable) but the envelope has a `year`, and grade needs
// the company and the value pulled out separately to render "PSA 9".
const EXTRA_ALIASES = {
  year: ['year', 'releaseYear', 'setYear', 'releaseDate', 'releasedAt'],
  gradingCompany: ['gradingCompany', 'gradeCompany', 'grader', 'gradingService', 'gradeService'],
  gradeValue: ['gradeLabel', 'gradeValue', 'grade', 'gradeNumber', 'gradeName'],
};

/**
 * Identity of one holding on the wall. A graded slab and a raw copy of the
 * same card are genuinely different works — different object, different
 * placard — so the grade is part of the key, not just a field on it.
 *
 * The suffix is appended ONLY when the card is actually graded. A raw card
 * must key as "p1", not "p1|": src/lib/collectrCsv.ts (the other feeder) emits
 * the bare form, and if the two producers disagreed, a user who exported with
 * this script and later refreshed from a Collectr PRO CSV would import a
 * complete duplicate collection instead of matching what they already own.
 */
export function groupingKey(productId, grade) {
  return grade ? `${productId}|${grade}` : `${productId}`;
}

/** Alias under the original spec name, so either import works. */
export const GROUPING_KEY = groupingKey;

const normKey = (k) => String(k).toLowerCase().replace(/[_\-\s]+/g, '');

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function str(v) {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

// ---------------------------------------------------------------------------
// Key matching

/**
 * Flatten one level of nesting. Collectr could plausibly return either
 * `{ productName, quantity }` or `{ quantity, product: { name } }`, and we
 * cannot know which. Top-level keys win; nested keys only fill gaps. The
 * container itself is kept too, so an `images: { large }` object is still
 * reachable as the image field.
 */
export function flattenRow(row) {
  const flat = {};
  if (!isPlainObject(row)) return flat;
  for (const [k, v] of Object.entries(row)) {
    if (isPlainObject(v)) continue;
    flat[k] = v;
  }
  for (const [k, v] of Object.entries(row)) {
    if (!isPlainObject(v)) continue;
    flat[k] = v;
    for (const [k2, v2] of Object.entries(v)) {
      if (isPlainObject(v2)) continue;
      if (!(k2 in flat)) flat[k2] = v2;
    }
  }
  return flat;
}

function findKey(keys, aliases, taken) {
  const free = keys.filter((k) => !taken.has(k));
  for (const alias of aliases) {
    const a = normKey(alias);
    const exact = free.find((k) => normKey(k) === a);
    if (exact) return exact;
  }
  // Looser pass so "productImageUrlLarge" still matches "imageUrl". Only for
  // aliases long enough that a substring hit isn't a coincidence — "id" would
  // otherwise swallow "priceUsdId" and every other key containing it.
  for (const alias of aliases) {
    const a = normKey(alias);
    if (a.length < 5) continue;
    const loose = free.find((k) => normKey(k).includes(a));
    if (loose) return loose;
  }
  return null;
}

/** keys → { field: actualKey }. Fields claim keys in declaration order. */
export function buildMapping(keys, aliases = FIELD_ALIASES) {
  const out = {};
  const taken = new Set();
  for (const [field, list] of Object.entries(aliases)) {
    const key = findKey(keys, list, taken);
    if (!key) continue;
    out[field] = key;
    taken.add(key);
  }
  return out;
}

/**
 * Union of the first few rows' (flattened) keys. The spec is "the first
 * object's keys", but a real API omits nulls, so row 1 alone can hide
 * `gradingCompany`. Three rows is enough to see the shape without letting a
 * long tail of one-off keys skew the score.
 */
export function sampleKeys(rows, sampleSize = 3) {
  const keys = [];
  const seen = new Set();
  for (const row of rows.slice(0, sampleSize)) {
    for (const k of Object.keys(flattenRow(row))) {
      if (seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Candidate discovery

/**
 * Walk a parsed JSON body depth-first and collect every array of objects worth
 * considering, with the path it was found at ("data.items", "results", …).
 */
export function findCandidateArrays(body, { minLength = 3, maxDepth = 8 } = {}) {
  const found = [];
  const seen = new Set();

  const walk = (node, path, depth) => {
    if (depth > maxDepth || node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      const head = node.slice(0, 3);
      if (node.length >= minLength && head.length > 0 && head.every(isPlainObject)) {
        found.push({ path: path || '(root)', rows: node });
      }
      // Still descend a little: `results[0].cards` is a real shape.
      for (let i = 0; i < Math.min(node.length, 3); i++) {
        walk(node[i], `${path}[${i}]`, depth + 1);
      }
      return;
    }

    for (const [k, v] of Object.entries(node)) {
      walk(v, path ? `${path}.${k}` : k, depth + 1);
    }
  };

  walk(body, '', 0);
  return found;
}

/**
 * How card-shaped is this array? Field count dominates; length only breaks
 * ties (log, so a 5000-row array of junk can't out-score a 40-row array of
 * cards). Returns the inferred mapping too — that IS the useful output.
 */
export function scoreCandidate(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return { score: 0, matched: {}, keys: [], length: 0 };
  }
  const keys = sampleKeys(arr);
  const matched = buildMapping(keys);
  const fields = Object.keys(matched).length;
  return {
    score: fields * 10 + Math.log(arr.length),
    matched,
    keys,
    length: arr.length,
  };
}

/** Rank every candidate array inside a body. Best first. */
export function rankCandidates(body, opts) {
  return findCandidateArrays(body, opts)
    .map((c) => ({ ...c, ...scoreCandidate(c.rows) }))
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Pagination

const OFFSET_PARAMS = ['offset', 'skip'];
const PAGE_PARAMS = ['page', 'pageNumber', 'pageIndex', 'pageNum'];
const CURSOR_PARAMS = ['cursor', 'after', 'nextCursor', 'pageToken'];
const SIZE_PARAMS = ['limit', 'pageSize', 'take', 'perPage'];
const TOTAL_KEYS = ['totalCount', 'total', 'totalItems', 'totalResults', 'pageCount', 'totalPages'];
const MORE_KEYS = ['hasMore', 'hasNext', 'hasNextPage', 'more'];
const CURSOR_KEYS = ['nextCursor', 'next', 'nextPageToken', 'endCursor', 'continuation'];

function paramsFromUrl(url) {
  const out = [];
  try {
    const u = new URL(url);
    for (const [k, v] of u.searchParams.entries()) out.push({ name: k, value: v, in: 'query' });
  } catch {
    // Relative or malformed URL — nothing to read, not an error.
  }
  return out;
}

function paramsFromPostData(postData) {
  if (!postData || typeof postData !== 'string') return [];
  const out = [];
  try {
    const parsed = JSON.parse(postData);
    if (isPlainObject(parsed)) {
      for (const [k, v] of Object.entries(flattenRow(parsed))) {
        if (isPlainObject(v)) continue;
        out.push({ name: k, value: v, in: 'body' });
      }
      return out;
    }
  } catch {
    // Not JSON — fall through to form encoding.
  }
  if (postData.includes('=')) {
    for (const pair of postData.split('&')) {
      const [k, v = ''] = pair.split('=');
      if (k) out.push({ name: decodeURIComponent(k), value: decodeURIComponent(v), in: 'body' });
    }
  }
  return out;
}

function pick(params, names) {
  for (const name of names) {
    const n = normKey(name);
    const hit = params.find((p) => normKey(p.name) === n);
    if (hit) return hit;
  }
  return null;
}

function shallowLookup(body, names) {
  if (!isPlainObject(body)) return undefined;
  const flat = flattenRow(body);
  for (const name of names) {
    const n = normKey(name);
    for (const [k, v] of Object.entries(flat)) {
      if (normKey(k) === n && !isPlainObject(v)) return v;
    }
  }
  return undefined;
}

/**
 * Which paging dialect is this endpoint speaking? Read from the request (the
 * param we would have to increment) corroborated by the body (the signal that
 * tells us when to stop). 'none' is a legitimate answer — plenty of portfolio
 * endpoints just return everything.
 */
export function detectPagination(requestUrl, postData, body) {
  const params = [...paramsFromUrl(requestUrl), ...paramsFromPostData(postData)];
  const offset = pick(params, OFFSET_PARAMS);
  const page = pick(params, PAGE_PARAMS);
  const cursor = pick(params, CURSOR_PARAMS);
  const size = pick(params, SIZE_PARAMS);

  const total = shallowLookup(body, TOTAL_KEYS);
  const hasMore = shallowLookup(body, MORE_KEYS);
  const nextCursor = shallowLookup(body, CURSOR_KEYS);

  const result = {
    kind: 'none',
    param: null,
    in: null,
    value: null,
    sizeParam: size ? size.name : null,
    size: size ? Number(size.value) || null : null,
    total: typeof total === 'number' ? total : Number(total) || null,
    hasMore: typeof hasMore === 'boolean' ? hasMore : null,
    nextCursor: typeof nextCursor === 'string' ? nextCursor : null,
    signals: [],
  };

  for (const [label, hit] of [['offset', offset], ['page', page], ['cursor', cursor], ['pageSize', size]]) {
    if (hit) result.signals.push(`request ${hit.in}: ${hit.name}=${hit.value} (${label})`);
  }
  if (total !== undefined) result.signals.push(`body: total=${total}`);
  if (hasMore !== undefined) result.signals.push(`body: hasMore=${hasMore}`);
  if (nextCursor !== undefined) result.signals.push('body: nextCursor present');

  // A cursor only works if the body hands us the next one, so it needs both
  // halves. Offset beats page when both are present: it is unambiguous.
  if (cursor && typeof nextCursor === 'string') {
    return { ...result, kind: 'cursor', param: cursor.name, in: cursor.in, value: cursor.value };
  }
  if (offset) {
    return { ...result, kind: 'offset', param: offset.name, in: offset.in, value: Number(offset.value) || 0 };
  }
  if (page) {
    return { ...result, kind: 'page', param: page.name, in: page.in, value: Number(page.value) || 1 };
  }
  if (typeof nextCursor === 'string' && nextCursor) {
    return { ...result, kind: 'cursor', param: 'cursor', in: 'query', value: null };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Rows → CollectrItem[]

// Grouping wants the PRODUCT, not the portfolio entry. Two raw copies of one
// card are usually two rows with two entry ids but one productId — keying on
// the entry id would emit them as two separate walls-worth of card. So product
// ids are tried first and entry ids are only the fallback.
const PRODUCT_ID_ORDER = [
  'productId',
  'product_id',
  'productID',
  'cardId',
  'tcgProductId',
  'id',
  'itemId',
  'collectionItemId',
  '_id',
  'uuid',
];

const NOT_A_GRADE = /^(raw|ungraded|none|n\/?a|null|-|0)$/i;

function readByAliases(flat, aliases) {
  const keys = Object.keys(flat);
  const key = findKey(keys, aliases, new Set());
  return key ? flat[key] : undefined;
}

function readImageUrl(flat, mappedKey) {
  const candidates = [];
  if (mappedKey) candidates.push(flat[mappedKey]);
  for (const alias of FIELD_ALIASES.image) {
    const key = findKey(Object.keys(flat), [alias], new Set());
    if (key) candidates.push(flat[key]);
  }
  for (const v of candidates) {
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
    if (isPlainObject(v)) {
      // `images: { small, large }` — prefer the biggest available.
      for (const k of ['large', 'original', 'full', 'url', 'src', 'medium', 'small']) {
        const nested = v[k];
        if (typeof nested === 'string' && /^https?:\/\//i.test(nested.trim())) return nested.trim();
      }
    }
  }
  return undefined;
}

function readYear(flat) {
  const raw = str(readByAliases(flat, EXTRA_ALIASES.year));
  if (!raw) return undefined;
  const m = raw.match(/(19|20)\d{2}/);
  return m ? m[0] : undefined;
}

/** "PSA" + 9 → "PSA 9". Already-labelled values ("BGS 9.5") pass through. */
function readGrade(flat) {
  const company = str(readByAliases(flat, EXTRA_ALIASES.gradingCompany));
  const value = str(readByAliases(flat, EXTRA_ALIASES.gradeValue));
  if (!value || NOT_A_GRADE.test(value)) {
    // A company with no number is not a grade we can print on a placard.
    return undefined;
  }
  if (!company || NOT_A_GRADE.test(company)) return value;
  return value.toLowerCase().startsWith(company.toLowerCase()) ? value : `${company} ${value}`;
}

function readQuantity(flat, mapping) {
  const raw = mapping.qty ? flat[mapping.qty] : undefined;
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function readProductId(flat, mapping) {
  for (const alias of PRODUCT_ID_ORDER) {
    const key = findKey(Object.keys(flat), [alias], new Set());
    const v = key ? str(flat[key]) : undefined;
    if (v) return v;
  }
  return mapping.id ? str(flat[mapping.id]) : undefined;
}

/**
 * A stable per-ROW identity, used by export.mjs to drop rows it has already
 * harvested. Distinct from groupingKey(): two rows may legitimately be the same
 * product (two raw copies) and must both be counted, so this prefers the
 * entry-level id and falls back to the whole row.
 */
export function rowIdentity(row) {
  const flat = flattenRow(row);
  for (const alias of ['collectionItemId', 'itemId', 'entryId', 'id', '_id', 'uuid']) {
    const key = findKey(Object.keys(flat), [alias], new Set());
    const v = key ? str(flat[key]) : undefined;
    if (v) return `${key}:${v}`;
  }
  try {
    return JSON.stringify(row);
  } catch {
    return String(row);
  }
}

/**
 * Raw rows → the envelope's items. Rows without a usable name are dropped and
 * counted (the CSV parser's behavior: one bad row must not fail an export).
 *
 * Merging: rows sharing a groupingKey() are one item — quantities sum, distinct
 * conditions join with ", " (three raw copies can honestly be NM, LP and LP).
 * `sourceImageUrl` is an out-of-envelope hint for images.mjs and is stripped
 * before collection.json is written.
 */
export function normalizeRows(rows, mapping) {
  const list = Array.isArray(rows) ? rows.filter(isPlainObject) : [];
  const map = mapping ?? buildMapping(sampleKeys(list));

  const byKey = new Map();
  const order = [];
  let dropped = 0;

  for (const row of list) {
    const flat = flattenRow(row);
    const name = map.name ? str(flat[map.name]) : undefined;
    if (!name) {
      dropped++;
      continue;
    }

    const grade = readGrade(flat);
    const setName = map.set ? str(flat[map.set]) : undefined;
    const cardNumber = map.number ? str(flat[map.number]) : undefined;
    // No id at all: fall back to a composite so the export still round-trips.
    // Weaker (a set rename breaks the match) but better than dropping the card.
    const productId =
      readProductId(flat, map) ??
      `row:${normKey(name)}|${normKey(setName ?? '')}|${normKey(cardNumber ?? '')}`;
    const key = groupingKey(productId, grade);

    const condition = grade ? undefined : map.condition ? str(flat[map.condition]) : undefined;
    const quantity = readQuantity(flat, map);

    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += quantity;
      if (condition) existing.conditions.add(condition);
      if (!existing.sourceImageUrl) existing.sourceImageUrl = readImageUrl(flat, map.image);
      continue;
    }

    const item = {
      collectrId: key,
      name,
      quantity,
      conditions: new Set(condition ? [condition] : []),
      sourceImageUrl: readImageUrl(flat, map.image),
    };
    if (setName) item.setName = setName;
    if (cardNumber) item.cardNumber = cardNumber;
    const year = readYear(flat);
    if (year) item.year = year;
    if (grade) item.grade = grade;

    byKey.set(key, item);
    order.push(item);
  }

  const items = order.map((item) => {
    const { conditions, sourceImageUrl, ...rest } = item;
    const out = { ...rest };
    // grade XOR condition: a slab's condition is its grade.
    if (!out.grade && conditions.size) out.condition = [...conditions].join(', ');
    if (sourceImageUrl) out.sourceImageUrl = sourceImageUrl;
    return out;
  });

  Object.defineProperty(items, 'droppedCount', { value: dropped, enumerable: false });
  return items;
}

/**
 * Ids appearing more than once. The app treats a duplicate collectrId as a
 * FATAL parse error (it would re-create the same card on every import), so the
 * exporter must catch it here rather than shipping a broken file.
 */
export function findDuplicateIds(items) {
  const seen = new Set();
  const dupes = new Set();
  for (const item of items) {
    if (seen.has(item.collectrId)) dupes.add(item.collectrId);
    seen.add(item.collectrId);
  }
  return [...dupes];
}
