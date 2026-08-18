// Card art: Collectr's own image first, Pokémon TCG API second, nothing third.
//
// Images are the load-bearing part of the export — the app's sync plan puts
// image-less NEW items in a `blocked` bucket because CardRecord.imageBlob is
// required, so a card with no art never reaches a wall. Hence the fallback.
//
// The fallback is deliberately COWARDLY: it accepts a match only when the API
// returns exactly one card for the set+number pair. Under-matching costs the
// user one missing image; over-matching hangs the wrong artwork on their wall
// under the right name, which is much worse and much harder to notice.
//
// Extensions keep whatever the server actually sent (.png/.jpg/.webp). We do
// not re-encode: that would mean adding `sharp`, and the app's downscaleImage()
// re-encodes everything to WebP on import anyway.

import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './session.mjs';

const POKEMONTCG_API = 'https://api.pokemontcg.io/v2/cards';

// Unauthenticated limits are 1000/day and 30/min. 2.2s between calls is ~27/min
// with headroom, and one call per card means a 500-card collection with no
// Collectr images at all still fits inside the daily budget.
const POKEMONTCG_MIN_INTERVAL_MS = 2200;

const EXT_BY_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

/** Filesystem-safe stem for an id that may contain "|", "/" and spaces. */
export function safeFileId(collectrId) {
  const cleaned = String(collectrId).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  const stem = cleaned || 'card';
  // Long composite fallback ids can blow past Windows' path limit.
  return stem.length > 100 ? stem.slice(0, 100) : stem;
}

/** "Sword & Shield—Brilliant Stars" → "sword shield brilliant stars". */
export function normalizeSetName(setName) {
  return String(setName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/pok[eé]mon/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "045/195" → "045". Collectr prints the denominator, the API doesn't. */
export function normalizeCardNumber(cardNumber) {
  return String(cardNumber ?? '')
    .split('/')[0]
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim();
}

function extFromResponse(contentType, url, bytes) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (EXT_BY_TYPE[type]) return EXT_BY_TYPE[type];
  const fromUrl = String(url || '').split('?')[0].match(/\.(png|jpe?g|webp|gif|avif)$/i);
  if (fromUrl) return fromUrl[0].toLowerCase().replace('.jpeg', '.jpg');
  // Servers that send application/octet-stream still send real image bytes.
  if (bytes && bytes.length > 12) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return '.png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return '.jpg';
    if (bytes.slice(0, 4).toString('latin1') === 'RIFF') return '.webp';
  }
  return null;
}

/** Any img/<stem>.* already on disk, so a re-run doesn't re-download. */
function existingImage(imgDir, stem) {
  for (const ext of ['.png', '.jpg', '.webp', '.gif', '.avif']) {
    if (fs.existsSync(path.join(imgDir, stem + ext))) return `img/${stem}${ext}`;
  }
  return null;
}

/**
 * Where a previous run said each image came from. Resuming otherwise has to
 * guess, and would report pokemontcg art as Collectr art.
 */
function previousSources(outDir) {
  const map = new Map();
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(outDir, 'collection.json'), 'utf8'));
    for (const item of doc.items ?? []) {
      if (item.collectrId && item.imageSource) map.set(item.collectrId, item.imageSource);
    }
  } catch {
    // No previous export (or an unreadable one) — resume with what's on disk.
  }
  return map;
}

async function writeImage(imgDir, stem, buffer, contentType, url) {
  const ext = extFromResponse(contentType, url, buffer);
  if (!ext || !buffer || buffer.length < 128) return null;
  const rel = `img/${stem}${ext}`;
  fs.writeFileSync(path.join(imgDir, `${stem}${ext}`), buffer);
  return rel;
}

/**
 * Fetch the Collectr-hosted image through the browser's request context, so it
 * carries the session cookies a signed-URL CDN may require.
 */
async function fetchCollectrImage(requestCtx, url) {
  if (!requestCtx || !url) return null;
  const res = await requestCtx.get(url, { timeout: 20000 }).catch(() => null);
  if (!res || !res.ok()) return null;
  const body = await res.body().catch(() => null);
  if (!body) return null;
  return { buffer: Buffer.from(body), contentType: res.headers()['content-type'] };
}

/**
 * Ask the Pokémon TCG API for this exact set+number. Plain global fetch, NOT
 * the browser context: there is no reason to hand a third party the user's
 * Collectr cookies.
 */
async function lookupPokemonTcg(item, log) {
  const set = normalizeSetName(item.setName);
  const number = normalizeCardNumber(item.cardNumber);
  if (!set || !number) return null;

  const q = `set.name:"${set}" number:"${number}"`;
  const url = `${POKEMONTCG_API}?q=${encodeURIComponent(q)}&pageSize=2&select=id,images`;
  const res = await fetch(url, { headers: { accept: 'application/json' } }).catch(() => null);
  if (!res) return null;
  if (res.status === 429) {
    log('  pokemontcg rate limit hit — backing off 30s');
    await sleep(30000);
    return null;
  }
  if (!res.ok) return null;
  const doc = await res.json().catch(() => null);
  const data = doc && Array.isArray(doc.data) ? doc.data : [];
  // Exactly one, or we decline. Two candidates means we cannot tell reprints
  // apart, and guessing would put the wrong art on the wall.
  if (data.length !== 1) return null;
  return data[0].images?.large ?? data[0].images?.small ?? null;
}

async function fetchPlainImage(url) {
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return { buffer: buf, contentType: res.headers.get('content-type') };
}

/**
 * Download art for every item, mutating each with `image` + `imageSource`.
 * Never throws for a single card: a missing image is reported, not fatal.
 *
 * @param {object[]} items      normalizeRows() output (reads `sourceImageUrl`)
 * @param {string}   outDir     export folder; images land in <outDir>/img
 * @param {object}   requestCtx Playwright APIRequestContext (context.request)
 * @param {object}   opts       { fallback = true, log = console.log }
 */
export async function downloadImages(items, outDir, requestCtx, opts = {}) {
  const { fallback = true, log = console.log } = opts;
  const imgDir = path.join(outDir, 'img');
  fs.mkdirSync(imgDir, { recursive: true });

  const resumed = previousSources(outDir);
  const counts = { collectr: 0, pokemontcg: 0, none: 0, reused: 0 };
  let lastPokemonCall = 0;

  for (const item of items) {
    const stem = safeFileId(item.collectrId);

    const already = existingImage(imgDir, stem);
    if (already) {
      item.image = already;
      item.imageSource = resumed.get(item.collectrId) ?? 'collectr';
      counts[item.imageSource] = (counts[item.imageSource] ?? 0) + 1;
      counts.reused++;
      continue;
    }

    let rel = null;
    const direct = await fetchCollectrImage(requestCtx, item.sourceImageUrl).catch(() => null);
    if (direct) rel = await writeImage(imgDir, stem, direct.buffer, direct.contentType, item.sourceImageUrl);
    if (rel) {
      item.image = rel;
      item.imageSource = 'collectr';
      counts.collectr++;
      continue;
    }

    if (fallback) {
      const wait = POKEMONTCG_MIN_INTERVAL_MS - (Date.now() - lastPokemonCall);
      if (wait > 0) await sleep(wait);
      lastPokemonCall = Date.now();

      const url = await lookupPokemonTcg(item, log).catch(() => null);
      if (url) {
        const art = await fetchPlainImage(url).catch(() => null);
        if (art) rel = await writeImage(imgDir, stem, art.buffer, art.contentType, url);
      }
      if (rel) {
        item.image = rel;
        item.imageSource = 'pokemontcg';
        counts.pokemontcg++;
        continue;
      }
    }

    // Nothing found. Leave `image` unset — the app reports these as blocked
    // rather than creating a card it cannot render.
    delete item.image;
    item.imageSource = 'none';
    counts.none++;
  }

  return counts;
}
