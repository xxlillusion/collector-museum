// Step 2: find out what Collectr's portfolio endpoint actually looks like.
//
// This exists because nobody — not the user, not whoever wrote export.mjs —
// knows the real response shape. Collectr has no public API, so the only
// honest way to learn the schema is to watch the app talk to its own backend
// while the signed-in user browses their collection.
//
// Nothing here is destructive and nothing is guessed silently: it captures,
// ranks, dry-runs normalizeRows() on the top rows, and shows the user the
// mapping it inferred BEFORE export.mjs relies on it. If the mapping looks
// wrong in .auth/discovery.json, that is the moment to notice.

import {
  parseArgs,
  run,
  launchBrowser,
  attachJsonCapture,
  requireStorageState,
  waitForEnter,
  writeJson,
  isLoginUrl,
  detectChallenge,
  DISCOVERY_PATH,
  COLLECTR_APP,
} from './session.mjs';
import { rankCandidates, detectPagination, normalizeRows } from './normalize.mjs';

const HELP = `
collectr discover — learn Collectr's portfolio endpoint (run this before export)

  node tools/collectr-export/discover.mjs [--url <start-url>]
  npm run collectr:discover

Opens a browser using your saved session, records every JSON response the app
makes while you browse your collection, then ranks which one looks like your
card list and dry-runs the field mapping on the first few rows.

Writes tools/collectr-export/.auth/discovery.json (gitignored — it contains
your own card data). Nothing is sent anywhere.

Options:
  --url <url>   Start page (default ${COLLECTR_APP})
  --top <n>     How many candidates to record (default 10)
  --browser <name>  chrome (default) | msedge | chromium
  --help        Show this message
`;

function summarize(entry, index) {
  const fields = Object.entries(entry.matched)
    .map(([field, key]) => (field === key ? field : `${field}←${key}`))
    .join(', ');
  return [
    `${String(index + 1).padStart(2)}. score ${entry.score.toFixed(1)}  ${entry.length} rows  path: ${entry.path}`,
    `    ${entry.method} ${entry.url}`,
    `    fields: ${fields || '(none matched — probably not your cards)'}`,
    `    paging: ${entry.pagination.kind}${entry.pagination.param ? ` via ${entry.pagination.param}` : ''}`,
    entry.sampleItems[0]
      ? `    first item: ${JSON.stringify(entry.sampleItems[0])}`
      : '    first item: (none normalized — name field missing?)',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP.trim());
    return;
  }

  const statePath = requireStorageState();
  const startUrl = typeof args.url === 'string' ? args.url : COLLECTR_APP;
  const top = Number(args.top) > 0 ? Number(args.top) : 10;

  const browser = await launchBrowser({ headed: true, browser: args.browser });
  const context = await browser.newContext({
    storageState: statePath,
    viewport: { width: 1400, height: 950 },
  });
  const captures = attachJsonCapture(context);
  const page = await context.newPage();

  try {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

    if (isLoginUrl(page.url())) {
      console.log(
        '\nCollectr is showing a login page — your saved session may have expired.\n' +
          'You can sign in right here in this window; then run `npm run collectr:login`\n' +
          'afterwards so the export step gets the refreshed session too.\n',
      );
    }

    console.log(
      [
        '',
        'Recording JSON responses. In the browser window:',
        '  1. Open your collection / portfolio.',
        '  2. Scroll to the bottom so a second page of cards loads.',
        '  3. Come back here.',
        '',
      ].join('\n'),
    );

    await waitForEnter('Press Enter when your collection has finished loading… ');

    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (detectChallenge(bodyText)) {
      console.log(
        '\nHeads up: that page looks like a human-verification challenge, not your\n' +
          'collection. Clear it in the window yourself and re-run discover.\n',
      );
    }

    const ranked = [];
    for (const capture of captures) {
      for (const candidate of rankCandidates(capture.body)) {
        ranked.push({
          score: candidate.score,
          url: capture.url,
          method: capture.method,
          status: capture.status,
          pageUrl: capture.pageUrl,
          postData: capture.postData,
          path: candidate.path,
          length: candidate.length,
          matched: candidate.matched,
          sampleKeys: candidate.keys,
          pagination: detectPagination(capture.url, capture.postData, capture.body),
          sampleRows: candidate.rows.slice(0, 3),
          sampleItems: normalizeRows(candidate.rows.slice(0, 3), candidate.matched),
        });
      }
    }
    ranked.sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      console.log(
        [
          '',
          `No JSON card lists were captured (${captures.length} JSON responses seen).`,
          '',
          'Things to try:',
          '  - Make sure you actually opened your collection, not just the dashboard.',
          '  - Scroll the card list so it fetches.',
          '  - Collectr may render the list server-side; if so this tool cannot',
          '    export it, and Collectr PRO’s own CSV export is the way in.',
          '',
        ].join('\n'),
      );
      return;
    }

    const kept = ranked.slice(0, top);
    writeJson(DISCOVERY_PATH, {
      capturedAt: new Date().toISOString(),
      captureCount: captures.length,
      candidates: kept,
    });

    console.log(`\n${captures.length} JSON responses captured. Best candidates:\n`);
    kept.forEach((entry, i) => console.log(`${summarize(entry, i)}\n`));
    console.log(
      [
        `Full detail (with sample rows): ${DISCOVERY_PATH}`,
        'That file contains your own card data — it is gitignored; delete it when done.',
        '',
        'If candidate 1 looks like your cards, run:',
        '  npm run collectr:export',
        '',
      ].join('\n'),
    );
  } finally {
    await browser.close().catch(() => {});
  }
}

run(main);
