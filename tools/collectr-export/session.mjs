// Shared plumbing for the three entry points (login / discover / export).
//
// These three scripts need the same handful of things: argv parsing, the
// .auth/ paths, a "press Enter when you're done" prompt, and a browser started
// the way the repo's other Playwright scripts start one. Keeping that here
// means the credential rules — never ask for a password, write state.json
// owner-only, fail with a sentence instead of a stack — live in ONE place
// rather than being re-implemented (and eventually mis-implemented) in three.
//
// Playwright is imported lazily inside launchBrowser() on purpose: `--help`
// and the "you have no session yet" error must work on a machine where the
// browsers were never downloaded.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

export const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = path.join(TOOL_DIR, '.auth');
export const STATE_PATH = path.join(AUTH_DIR, 'state.json');
export const DISCOVERY_PATH = path.join(AUTH_DIR, 'discovery.json');

export const COLLECTR_APP = 'https://app.getcollectr.com/';
/** The page that actually lists holdings — used as the signed-in probe. */
export const COLLECTR_PORTFOLIO = 'https://app.getcollectr.com/portfolio/products';

/** An error the user can act on. main() prints `.message` and exits 1. */
export class CliError extends Error {}

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/**
 * Minimal argv parser: `--flag`, `--flag value`, `--flag=value`, `--no-flag`.
 * Deliberately tiny — no dependencies are allowed in this tool.
 */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
    let val = eq === -1 ? undefined : a.slice(eq + 1);
    if (val === undefined) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        val = next;
        i++;
      } else {
        val = true;
      }
    }
    if (key.startsWith('no-') && val === true) {
      out[camel(key.slice(3))] = false;
      continue;
    }
    out[camel(key)] = val;
  }
  return out;
}

/** Wrap a main(): CliError prints cleanly, anything else keeps its stack. */
export async function run(main) {
  try {
    await main();
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Path to the saved session, or a CliError telling the user how to make one.
 * Returns the path (Playwright accepts a path for `storageState`) so we never
 * hold the cookie values in memory longer than needed.
 */
export function requireStorageState() {
  if (!fs.existsSync(STATE_PATH)) {
    throw new CliError(
      [
        'No saved Collectr session found.',
        `  expected: ${STATE_PATH}`,
        '',
        'Run this first — a real browser window opens and YOU sign in:',
        '  npm run collectr:login',
      ].join('\n'),
    );
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
  } catch {
    throw new CliError(
      `${STATE_PATH} is not readable JSON.\nDelete it and run: npm run collectr:login`,
    );
  }
  return STATE_PATH;
}

/**
 * Persist cookies + localStorage. Written 0600 because this file IS the login:
 * anyone holding it is signed into the user's Collectr account.
 */
export async function saveStorageState(context) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await context.storageState({ path: STATE_PATH });
  try {
    fs.chmodSync(STATE_PATH, 0o600);
  } catch {
    // Best effort — chmod is a no-op on most Windows volumes.
  }
  return STATE_PATH;
}

/**
 * Is this context actually signed in?
 *
 * Worth doing because the failure it catches is silent and very confusing:
 * Collectr signs in through Stytch, optionally via Google OAuth, so pressing
 * Enter a few seconds early captures a half-finished exchange — a PKCE
 * verifier and some Google cookies, but no Collectr session. That state.json
 * looks perfectly healthy (63 KB, twelve cookies) and then every later step
 * fails with "session expired", pointing at entirely the wrong problem.
 *
 * So we don't trust the cookie jar; we ask the site. Landing anywhere under
 * auth.getcollectr.com (including /error) means not signed in.
 */
export async function isSignedIn(context, { timeoutMs = 20000 } = {}) {
  const page = await context.newPage();
  try {
    await page.goto(COLLECTR_PORTFOLIO, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      .catch(() => {});
    // The SPA redirects after boot, so a settle beat is required.
    await page.waitForTimeout(4000);
    const url = page.url();
    return { ok: !/(^https?:\/\/auth\.)|\/(login|signin|sign-in)\b/i.test(url), url };
  } finally {
    await page.close().catch(() => {});
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Block until the user presses Enter in the terminal. */
export function waitForEnter(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Launch Chromium. You sign in by hand in this window, so which browser it is
 * matters to you and not to the script — pick with `--browser` or
 * COLLECTR_BROWSER. Chrome is tried first because it is what most people
 * recognise as "the browser"; Edge is the repo's usual channel and is on every
 * Windows box, so it is the fallback, and Playwright's bundled build is the
 * last resort.
 *
 * Note this is always a FRESH profile, never your everyday Chrome profile —
 * Playwright cannot attach to a running Chrome, and borrowing its user-data
 * dir requires Chrome be fully closed. So you sign in once here even if you
 * are already signed in to Collectr in your normal browser.
 */
const BROWSER_CHANNELS = ['chrome', 'msedge', 'chromium'];

export async function launchBrowser({ headed = false, browser } = {}) {
  const { chromium } = await import('playwright').catch(() => {
    throw new CliError('Playwright is not installed. Run `npm install` in the repo root first.');
  });
  const opts = {
    headless: !headed,
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--no-sandbox'],
  };

  const requested = browser || process.env.COLLECTR_BROWSER;
  if (requested && !BROWSER_CHANNELS.includes(requested)) {
    throw new CliError(
      `Unknown browser "${requested}". Choose one of: ${BROWSER_CHANNELS.join(', ')}.`,
    );
  }
  // An explicit choice is honoured exactly — no silent fallback, or you would
  // not know which browser you were actually signing into.
  const order = requested ? [requested] : BROWSER_CHANNELS;
  const failures = [];

  for (const channel of order) {
    try {
      // 'chromium' means Playwright's own download, which takes no channel.
      return channel === 'chromium'
        ? await chromium.launch(opts)
        : await chromium.launch({ channel, ...opts });
    } catch (err) {
      failures.push(`  ${channel}: ${err && err.message ? err.message.split('\n')[0] : err}`);
    }
  }

  throw new CliError(
    [
      requested
        ? `Could not start ${requested}.`
        : 'Could not start a browser (tried Chrome, Edge, then Playwright\'s own).',
      ...failures,
      '',
      'Install one with:  npx playwright install chromium',
      'Or pick another:   --browser chrome | msedge | chromium',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// Response capture
//
// Both discover.mjs and export.mjs learn the portfolio endpoint the same way:
// by listening to what the app itself asks for. Shared here so the redaction
// rules below can't drift apart between the two.

// Never record the auth exchange. Those requests are where a bearer token — or
// in the worst case a password — would show up, and discovery.json is a file
// the user might paste into an issue.
const SENSITIVE_URL = /(auth|login|signin|sign-in|oauth|token|password|register)/i;
const SENSITIVE_FIELD = /(password|token|secret|authorization|refresh|otp|code)/i;

function redactPostData(postData) {
  if (!postData || typeof postData !== 'string') return undefined;
  try {
    const parsed = JSON.parse(postData);
    const walk = (v) => {
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        const out = {};
        for (const [k, val] of Object.entries(v)) {
          out[k] = SENSITIVE_FIELD.test(k) ? '[redacted]' : walk(val);
        }
        return out;
      }
      return v;
    };
    return JSON.stringify(walk(parsed));
  } catch {
    return SENSITIVE_FIELD.test(postData) ? '[redacted]' : postData;
  }
}

/**
 * Collect every JSON xhr/fetch response the page makes. Returns the (growing)
 * array of captures; pass `onCapture` to react as they arrive.
 */
export function attachJsonCapture(context, { onCapture, maxBytes = 4_000_000, max = 400 } = {}) {
  const captures = [];
  context.on('response', async (response) => {
    try {
      if (captures.length >= max) return;
      const request = response.request();
      const kind = request.resourceType();
      if (kind !== 'xhr' && kind !== 'fetch') return;
      const url = response.url();
      if (SENSITIVE_URL.test(url)) return;
      const contentType = response.headers()['content-type'] || '';
      if (!contentType.toLowerCase().includes('json')) return;

      const text = await response.text();
      if (!text || text.length > maxBytes) return;
      const body = JSON.parse(text);

      let pageUrl;
      try {
        pageUrl = response.frame().url();
      } catch {
        pageUrl = undefined;
      }

      const capture = {
        url,
        method: request.method(),
        status: response.status(),
        postData: redactPostData(request.postData()),
        pageUrl,
        body,
      };
      captures.push(capture);
      if (onCapture) onCapture(capture);
    } catch {
      // A body that vanished, wasn't JSON, or a navigation mid-read. Captures
      // are opportunistic by nature — one lost response is not an error.
    }
  });
  return captures;
}

const LOGIN_HOST_HINTS = ['auth.getcollectr.com', '/login', '/signin', '/sign-in', '/auth'];

/** True when a URL looks like Collectr's sign-in flow rather than the app. */
export function isLoginUrl(url) {
  const u = String(url || '').toLowerCase();
  return LOGIN_HOST_HINTS.some((hint) => u.includes(hint));
}

export const SESSION_EXPIRED =
  'Your Collectr session expired — run `npm run collectr:login` again.';

const CHALLENGE_HINTS = [
  'captcha',
  'are you human',
  'verify you are human',
  'checking your browser',
  'unusual traffic',
];

/**
 * We do not solve challenges, on purpose. If one appears we stop and hand the
 * problem back to the user in a real window, where solving it is their call.
 */
export function detectChallenge(text) {
  const t = String(text || '').toLowerCase();
  return CHALLENGE_HINTS.some((hint) => t.includes(hint));
}

export const CHALLENGE_MESSAGE = [
  'Collectr showed a human-verification challenge.',
  'This script will not try to solve or evade it.',
  '',
  'Re-run headed and clear the challenge yourself in the window:',
  '  node tools/collectr-export/export.mjs --headed',
].join('\n');
