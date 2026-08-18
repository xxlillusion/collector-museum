// Build the export folder from a HAR you saved yourself — no automation at all.
//
// Why this exists: Collectr's auth domain sits behind AWS WAF, which rejects
// Playwright-launched browsers whether headed or headless, and Google's OAuth
// refuses to sign in inside an automation-controlled browser ("this browser may
// not be secure"). Both are deliberate anti-phishing / anti-abuse measures and
// this tool does not try to defeat either.
//
// So we invert it. You browse your own collection in your own ordinary Chrome,
// signed in the ordinary way, and save what the page already fetched. This
// script then does the offline half — the same candidate-scoring and
// normalizing the live exporter uses, minus the browser.
//
// It reads a .har (DevTools "Save all as HAR with content") or plain .json
// response bodies, so whichever way you captured it, it lands here.
//
//   node tools/collectr-export/from-har.mjs --har collectr.har --out ./collectr-export
//
// SECURITY: a HAR is a full network recording — it contains your session
// cookies and auth headers. Nothing from it is copied into the output, and you
// should delete the .har once the import is done. Never attach one to a bug
// report.

import fs from 'node:fs';
import path from 'node:path';
import {
  rankCandidates, normalizeRows, rowIdentity, findDuplicateIds,
} from './normalize.mjs';
import { downloadImages } from './images.mjs';
import { run, parseArgs, writeJson, CliError } from './session.mjs';

const HELP = `
collectr from-har — build the export folder from a saved capture (no browser)

  node tools/collectr-export/from-har.mjs --har <file.har> [--out ./collectr-export]
  npm run collectr:from-har -- --har <file.har>

Use this when the automated login cannot get through Collectr's bot protection.
You capture the data yourself, in your normal browser:

  1. Open https://app.getcollectr.com/portfolio/products in your usual Chrome,
     signed in as normal.
  2. F12 -> Network tab -> tick "Preserve log".
  3. Scroll through your WHOLE collection so every page loads.
  4. Right-click any request -> "Save all as HAR with content".
  5. Run this with --har pointing at that file.

Accepts .har files, or plain .json files holding a raw response body. Pass
--har more than once, or point it at a folder, to combine several captures.

Options:
  --har <path>     HAR file, JSON file, or folder of them (repeatable)
  --out <dir>      Output folder (default ./collectr-export)
  --limit <n>      Stop after roughly n cards
  --no-fallback    Skip the Pokémon TCG API image fallback
  --help           Show this message

SECURITY: the HAR holds your session cookies. None of it is copied into the
output — delete the .har when you are done, and never share it.
`;

/** Every JSON body in a HAR, newest last, with the URL that produced it. */
function bodiesFromHar(har) {
  const out = [];
  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    const text = e?.response?.content?.text;
    if (typeof text !== 'string' || !text.trim()) continue;
    // "Save all as HAR" (without content) omits bodies entirely — that is the
    // single most common mistake, so it gets its own error message later.
    if (e.response.content.encoding === 'base64') continue;
    const mime = e.response.content.mimeType || '';
    if (!/json/i.test(mime) && !text.trimStart().startsWith('{') && !text.trimStart().startsWith('[')) {
      continue;
    }
    try {
      out.push({ url: e.request?.url ?? '(unknown)', body: JSON.parse(text) });
    } catch {
      // Truncated or non-JSON body — skip it rather than fail the whole run.
    }
  }
  return out;
}

function collectInputs(targets) {
  const files = [];
  for (const t of targets) {
    if (!fs.existsSync(t)) throw new CliError(`No such file or folder: ${t}`);
    if (fs.statSync(t).isDirectory()) {
      for (const name of fs.readdirSync(t)) {
        if (/\.(har|json)$/i.test(name)) files.push(path.join(t, name));
      }
    } else {
      files.push(t);
    }
  }
  if (files.length === 0) throw new CliError('No .har or .json files found.');
  return files;
}

function readBodies(files) {
  const bodies = [];
  let sawHarWithoutContent = false;
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new CliError(`${file} is not readable JSON.\n${err.message}`);
    }
    if (parsed?.log?.entries) {
      const got = bodiesFromHar(parsed);
      if (got.length === 0 && parsed.log.entries.length > 0) sawHarWithoutContent = true;
      bodies.push(...got);
    } else {
      bodies.push({ url: `file:${path.basename(file)}`, body: parsed });
    }
  }
  if (bodies.length === 0 && sawHarWithoutContent) {
    throw new CliError(
      [
        'That HAR has requests but no response bodies.',
        '',
        'In DevTools use "Save all as HAR with content" (the plain "Save all as',
        'HAR" option records headers only, which is not enough to rebuild your',
        'collection).',
      ].join('\n'),
    );
  }
  if (bodies.length === 0) throw new CliError('No JSON response bodies found in that capture.');
  return bodies;
}

/** A fetch-backed stand-in for Playwright's request context (images.mjs uses
 *  only .get() -> .ok()/.body()/.headers()). No browser needed for the CDN. */
const fetchRequestCtx = {
  async get(url, { timeout = 20000 } = {}) {
    const ctl = AbortSignal.timeout(timeout);
    const res = await fetch(url, { signal: ctl, redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    const headers = Object.fromEntries(res.headers.entries());
    return { ok: () => res.ok, status: () => res.status, body: async () => buf, headers: () => headers };
  },
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.har && args._.length === 0)) {
    console.log(HELP.trim());
    if (!args.help) process.exitCode = 1;
    return;
  }

  const targets = [...(Array.isArray(args.har) ? args.har : args.har ? [args.har] : []), ...args._];
  const outDir = typeof args.out === 'string' ? args.out : './collectr-export';
  const limit = Number(args.limit) > 0 ? Number(args.limit) : 0;

  const bodies = readBodies(collectInputs(targets));
  console.log(`\nRead ${bodies.length} JSON response${bodies.length === 1 ? '' : 's'}.`);

  // Score every body; the best-scoring array anywhere is the card list.
  let best = null;
  for (const { url, body } of bodies) {
    for (const c of rankCandidates(body) ?? []) {
      if (!best || c.score > best.score) best = { ...c, url };
    }
  }
  if (!best || best.score <= 0) {
    throw new CliError(
      [
        'Could not find anything resembling a card list in that capture.',
        '',
        'Most likely the scroll did not load your cards while recording, or the',
        'HAR was saved without response contents. Re-record with "Preserve log"',
        'ticked, scroll to the very bottom of your collection, then use',
        '"Save all as HAR with content".',
      ].join('\n'),
    );
  }
  console.log(`Best match: ${best.path} (score ${best.score.toFixed(1)}) from ${best.url}`);
  console.log(`Fields mapped: ${Object.keys(best.matched ?? {}).join(', ') || '(none)'}`);

  // Pagination means the same array shape appears in several responses — take
  // every candidate sharing the winner's JSON path, then dedupe by row identity.
  const rows = [];
  const seen = new Set();
  for (const { body } of bodies) {
    // minLength: 1 here, deliberately. Discovery uses a floor of 3 so that
    // random little arrays elsewhere in a payload don't outrank the real card
    // list — but the LAST page of a paginated collection is usually short, and
    // at the default floor it is not even considered a candidate, so the tail
    // of the collection vanishes without a word. Safe to relax now: we already
    // know the winning path and only accept arrays sitting exactly there.
    for (const c of rankCandidates(body, { minLength: 1 }) ?? []) {
      if (c.path !== best.path) continue;
      for (const row of c.rows) {
        const id = rowIdentity(row);
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        rows.push(row);
      }
    }
  }
  console.log(`Collected ${rows.length} unique rows.`);

  let items = normalizeRows(rows, best.matched);
  if (limit && items.length > limit) {
    console.log(`Limiting to ${limit} (of ${items.length}).`);
    items = items.slice(0, limit);
  }
  if (items.length === 0) throw new CliError('Rows were found but none had a usable card name.');

  const dupes = findDuplicateIds(items);
  if (dupes.length > 0) {
    throw new CliError(
      `Grouping produced duplicate ids (${dupes.slice(0, 3).join(', ')}). This is a bug — please report it.`,
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  const counts = await downloadImages(items, outDir, fetchRequestCtx, {
    fallback: args.fallback !== false,
  });

  writeJson(path.join(outDir, 'collection.json'), {
    format: 'vendor-museum-collectr',
    version: 1,
    source: 'collectr-script',
    exportedAt: new Date().toISOString(),
    collectr: { capturedFrom: best.url, itemCount: items.length },
    items,
  });

  const abs = path.resolve(outDir);
  console.log(
    [
      '',
      `${items.length} cards written.`,
      counts
        ? `Images — ${counts.collectr ?? 0} from Collectr, ${counts.pokemontcg ?? 0} fallback, ${counts.none ?? 0} missing.`
        : '',
      '',
      `Folder: ${abs}`,
      'Open Vendor Museum -> ACQUISITIONS -> Import from Collectr -> choose that folder.',
      '',
      'Now delete the .har — it contains your Collectr session.',
      '',
    ].filter(Boolean).join('\n'),
  );
}

run(main);
