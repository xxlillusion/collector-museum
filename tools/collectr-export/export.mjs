// Step 3: write the export folder the app reads.
//
// Harvesting has two strategies, in order, because the likely failure is
// known in advance: modern SPAs keep their bearer token in memory and send it
// as a header, so replaying the portfolio request from Node with only cookies
// will often 401. When it works it is by far the better path (fast, complete,
// no rendering), so we try it first and fall back to staying inside the page
// and scrolling — where the app's own token does the work for us.
//
// Everything is deliberately serial and throttled. This drives a third party's
// site with one user's own account; being slow is the price of being polite.

import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs,
  run,
  sleep,
  launchBrowser,
  attachJsonCapture,
  requireStorageState,
  writeJson,
  isLoginUrl,
  detectChallenge,
  CliError,
  SESSION_EXPIRED,
  CHALLENGE_MESSAGE,
  DISCOVERY_PATH,
  COLLECTR_APP,
} from './session.mjs';
import {
  rankCandidates,
  detectPagination,
  normalizeRows,
  findDuplicateIds,
  rowIdentity,
} from './normalize.mjs';
import { downloadImages } from './images.mjs';

const HELP = `
collectr export — write the folder Vendor Museum imports

  node tools/collectr-export/export.mjs --out ./collectr-export [options]
  npm run collectr:export

Requires a saved session (npm run collectr:login) and works best after
npm run collectr:discover, which teaches it where your cards live.

Options:
  --out <dir>      Output folder (default ./collectr-export)
  --url <url>      Page to open (overrides what discovery learned)
  --limit <n>      Stop after roughly n rows — useful for a quick trial run
  --headed         Show the browser (use this if anything looks stuck)
  --no-fallback    Skip the Pokémon TCG API image fallback
  --browser <name> chrome (default) | msedge | chromium
  --help           Show this message

Writes <dir>/collection.json and <dir>/img/*. Existing images are reused, so
re-running after an interruption is cheap.
`;

const FETCH_THROTTLE_MS = 300;
const MAX_PAGES = 100;
const MAX_SCROLLS = 200;
const BARREN_SCROLLS_BEFORE_STOP = 3;

// ---------------------------------------------------------------------------
// Candidate selection

/** A candidate is only usable if we can read a name AND an identity from it. */
function isUsable(candidate) {
  return Boolean(candidate.matched.name);
}

function bestCandidate(capture) {
  const [best] = rankCandidates(capture.body).filter(isUsable);
  return best ?? null;
}

/** Where the user's cards were last seen, so a headless run knows where to go. */
function startUrlFromDiscovery() {
  try {
    const doc = JSON.parse(fs.readFileSync(DISCOVERY_PATH, 'utf8'));
    const top = (doc.candidates ?? []).find((c) => c.pageUrl);
    return top ? top.pageUrl : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy A — direct refetch

function withParam(capture, kind, param, where, value) {
  const out = { url: capture.url, data: undefined };
  if (kind === 'none' || !param) {
    if (capture.postData) out.data = capture.postData;
    return out;
  }
  if (where === 'body' && capture.postData) {
    try {
      const parsed = JSON.parse(capture.postData);
      parsed[param] = value;
      out.data = JSON.stringify(parsed);
      return out;
    } catch {
      // Not JSON after all — fall through and page via the query string.
    }
  }
  try {
    const url = new URL(capture.url);
    url.searchParams.set(param, String(value));
    out.url = url.toString();
  } catch {
    // Unparseable URL: replay it untouched rather than mangling it.
  }
  if (capture.postData) out.data = capture.postData;
  return out;
}

/** Rows at the same JSON path as the winning capture, else the best array.
 *
 *  The known path is matched with a minLength of 1: the default floor of 3
 *  exists to stop stray little arrays outranking the card list during
 *  discovery, but the LAST page of a paginated collection is usually short.
 *  At the default floor that page yields no candidate, which reads to the
 *  paging loop as "no more rows" — so it stops early AND silently discards the
 *  tail of the collection. Only an exact path match is accepted here, so
 *  relaxing the floor cannot let junk in; the unknown-path fallback keeps the
 *  strict floor. */
function rowsFrom(body, wantedPath) {
  if (wantedPath) {
    const same = rankCandidates(body, { minLength: 1 }).find((c) => c.path === wantedPath);
    if (same) return same.rows ?? [];
  }
  return rankCandidates(body).filter(isUsable)[0]?.rows ?? [];
}

async function directRefetch(context, capture, winner, limit, log) {
  const pagination = detectPagination(capture.url, capture.postData, capture.body);
  log(`  paging looks like: ${pagination.kind}${pagination.param ? ` (${pagination.param})` : ''}`);

  const rows = [];
  const seen = new Set();
  let value = pagination.value;
  let cursor = pagination.nextCursor;
  let firstPageRows = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const paramValue = pagination.kind === 'cursor' ? cursor : value;
    const { url, data } = withParam(capture, pagination.kind, pagination.param, pagination.in, paramValue);

    const method = (capture.method || 'GET').toUpperCase();
    const res = await context.request
      .fetch(url, {
        method,
        // Playwright rejects a body on GET, and a GET capture has none anyway.
        data: method === 'GET' ? undefined : data,
        headers: { accept: 'application/json' },
        timeout: 20000,
      })
      .catch((err) => ({ error: err }));

    if (!res || res.error) return { rows: null, reason: String(res?.error?.message ?? 'request failed') };
    if (res.status() === 401 || res.status() === 403) {
      return { rows: null, reason: `HTTP ${res.status()} (the token lives in the page, not the cookies)` };
    }
    if (!res.ok()) return { rows: rows.length ? rows : null, reason: `HTTP ${res.status()}` };

    const body = await res.json().catch(() => null);
    if (!body) return { rows: rows.length ? rows : null, reason: 'response was not JSON' };

    const pageRows = rowsFrom(body, winner.path);
    let added = 0;
    for (const row of pageRows) {
      const id = rowIdentity(row);
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
      added++;
    }
    log(`  page ${page + 1}: ${pageRows.length} rows (${added} new, ${rows.length} total)`);

    if (added === 0) break;
    if (limit && rows.length >= limit) break;
    if (pagination.kind === 'none') break;

    // A short page is the end of the list on every paging dialect.
    if (firstPageRows === null) firstPageRows = pageRows.length;
    else if (pageRows.length < firstPageRows) break;

    if (pagination.kind === 'cursor') {
      const next = detectPagination(url, data, body).nextCursor;
      if (!next || next === cursor) break;
      cursor = next;
    } else if (pagination.kind === 'offset') {
      value = Number(value || 0) + (pagination.size || firstPageRows || pageRows.length);
    } else {
      value = Number(value || 1) + 1;
    }

    await sleep(FETCH_THROTTLE_MS);
  }

  return { rows, reason: null };
}

// ---------------------------------------------------------------------------
// Strategy B — scroll harvest

async function scrollStep(page) {
  await page
    .evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      // Virtualised lists scroll an inner div, not the window — nudge the
      // tallest scrollable element too rather than guessing its selector.
      let target = null;
      for (const el of document.querySelectorAll('div, main, section, ul')) {
        if (el.scrollHeight > el.clientHeight + 200 && el.clientHeight > 200) {
          if (!target || el.scrollHeight > target.scrollHeight) target = el;
        }
      }
      if (target) target.scrollTop = target.scrollHeight;
    })
    .catch(() => {});
  await page.keyboard.press('End').catch(() => {});
}

async function scrollHarvest(page, harvested, limit, log) {
  let barren = 0;
  for (let i = 0; i < MAX_SCROLLS; i++) {
    const before = harvested.size;
    await scrollStep(page);
    await sleep(700);
    if (harvested.size === before) {
      barren++;
      if (barren >= BARREN_SCROLLS_BEFORE_STOP) break;
    } else {
      barren = 0;
      log(`  scrolled: ${harvested.size} rows`);
    }
    if (limit && harvested.size >= limit) break;
  }
  return [...harvested.values()];
}

// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP.trim());
    return;
  }

  const outDir = path.resolve(typeof args.out === 'string' ? args.out : './collectr-export');
  const limit = Number(args.limit) > 0 ? Number(args.limit) : 0;
  const headed = args.headed === true;
  const fallback = args.fallback !== false;
  const log = (...a) => console.log(...a);

  const statePath = requireStorageState();
  // --url wins over discovery: if you already know the page that lists your
  // cards, there is no reason to be forced through the interactive step.
  const startUrl = typeof args.url === 'string'
    ? args.url
    : startUrlFromDiscovery() ?? COLLECTR_APP;

  const browser = await launchBrowser({ headed, browser: args.browser });
  const context = await browser.newContext({
    storageState: statePath,
    viewport: { width: 1400, height: 950 },
  });

  // Harvest as we go: the same handler serves the initial page load and the
  // scroll fallback, so strategy B needs no extra plumbing.
  const harvested = new Map();
  const captures = attachJsonCapture(context, {
    onCapture: (capture) => {
      const candidate = bestCandidate(capture);
      if (!candidate) return;
      for (const row of candidate.rows) {
        const id = rowIdentity(row);
        if (!harvested.has(id)) harvested.set(id, row);
      }
    },
  });

  const page = await context.newPage();

  try {
    log(`\nOpening ${startUrl}`);
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(2500);

    if (isLoginUrl(page.url())) throw new CliError(SESSION_EXPIRED);
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (detectChallenge(bodyText)) throw new CliError(CHALLENGE_MESSAGE);

    // Give a lazy list a nudge so the first fetch definitely happens.
    for (let i = 0; i < 4 && harvested.size === 0; i++) {
      await scrollStep(page);
      await sleep(1200);
    }

    const winnerCapture = captures.find((c) => bestCandidate(c));
    if (!winnerCapture) {
      throw new CliError(
        [
          'Could not find your card list in anything the page fetched.',
          '',
          'Run the discovery step first — it shows what was captured and lets you',
          'browse to the right screen yourself:',
          '  npm run collectr:discover',
          '',
          'If discovery also finds nothing, Collectr is not serving your collection',
          'as JSON and this tool cannot export it. Collectr PRO’s CSV export can be',
          'imported directly instead.',
        ].join('\n'),
      );
    }
    const winner = bestCandidate(winnerCapture);
    log(`Card list: ${winnerCapture.method} ${winnerCapture.url}  (path: ${winner.path})`);

    log('\nHarvesting (strategy A: direct refetch)…');
    const direct = await directRefetch(context, winnerCapture, winner, limit, log);

    let rows = direct.rows;
    if (!rows || rows.length === 0) {
      log(`  strategy A gave up: ${direct.reason ?? 'no rows'}`);
      log('\nHarvesting (strategy B: scrolling the page)…');
      rows = await scrollHarvest(page, harvested, limit, log);
    } else if (harvested.size > rows.length) {
      // The page itself saw more than the replay did — trust the bigger set.
      log(`  page-side capture had more rows (${harvested.size}); using those`);
      rows = [...harvested.values()];
    }

    if (!rows || rows.length === 0) {
      throw new CliError(
        'No card rows were harvested. Re-run with --headed and watch what the page does.',
      );
    }
    if (limit && rows.length > limit) rows = rows.slice(0, limit);

    const items = normalizeRows(rows, winner.matched);
    log(`\n${rows.length} rows → ${items.length} items (grouped by product + grade)`);
    if (items.droppedCount) log(`  ${items.droppedCount} rows skipped (no readable name)`);
    if (items.length === 0) {
      throw new CliError(
        'Every harvested row was unusable (no card name found). Check the field mapping in\n' +
          `${DISCOVERY_PATH} — the wrong response may have won.`,
      );
    }

    // The app treats a repeated collectrId as a fatal parse error, because a
    // duplicate would re-create the same card on every import. Better to fail
    // here, loudly, than to hand the user a file that can never be imported.
    const dupes = findDuplicateIds(items);
    if (dupes.length) {
      throw new CliError(
        [
          'Refusing to write a broken export: these ids appear more than once.',
          ...dupes.slice(0, 5).map((id) => `  ${id}`),
          dupes.length > 5 ? `  …and ${dupes.length - 5} more` : '',
          '',
          'This means the grouping key did not separate your holdings correctly.',
          `Please report it with the field mapping from ${DISCOVERY_PATH}.`,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }

    log('\nFetching images…');
    const counts = await downloadImages(items, outDir, context.request, { fallback, log });

    for (const item of items) delete item.sourceImageUrl;
    writeJson(path.join(outDir, 'collection.json'), {
      format: 'vendor-museum-collectr',
      version: 1,
      source: 'collectr-script',
      exportedAt: new Date().toISOString(),
      items,
    });

    log(
      [
        '',
        `${items.length} items · ${counts.collectr} Collectr images · ${counts.pokemontcg} fallback · ${counts.none} missing`,
        counts.reused ? `(${counts.reused} images reused from the previous run)` : null,
        '',
        `Export folder: ${outDir}`,
        '',
        'Now open Vendor Museum → ACQUISITIONS → Import from Collectr, and pick',
        'that folder. Nothing is uploaded anywhere by this script.',
        '',
      ]
        .filter((line) => line !== null)
        .join('\n'),
    );
  } finally {
    await browser.close().catch(() => {});
  }
}

run(main);
