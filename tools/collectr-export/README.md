# Collectr export

Pull your own Collectr collection onto your own machine as a folder Vendor
Museum can import. Runs locally with Playwright; nothing is uploaded anywhere.

Requires Node 20+ and `npm install` already done in the repo root. No extra
dependencies.

## Start here: the manual capture route

**Collectr blocks automated browsers.** Its auth domain sits behind AWS WAF,
which rejects a Playwright-launched Chrome or Edge whether headed or headless,
and Google's OAuth separately refuses to sign in inside an automation-controlled
browser ("this browser may not be secure"). Both are deliberate anti-phishing
measures and this tool does not attempt to defeat either.

So capture the data yourself, in your own ordinary browser, and let this tool do
the offline half. Two ways — the console snippet is easier, since Chrome keeps
moving the HAR menu around.

### Easiest: the console snippet

1. Open `https://app.getcollectr.com/portfolio/products` in your normal Chrome,
   signed in as usual.
2. **F12 → Console**. Chrome will make you type `allow pasting` the first time
   — that prompt exists to stop people pasting code they haven't read, so read
   [`capture-snippet.js`](./capture-snippet.js) first. It is short, and it only
   records; it sends nothing anywhere.
3. Paste the whole of `capture-snippet.js`, press Enter → `Recording…`.
4. Scroll through your **whole** collection. `collectrCount()` shows progress.
5. Run `collectrSave()` → `collectr-capture.json` in your Downloads.
6. Then:

```bash
npm run collectr:from-har -- --har C:\Users\<you>\Downloads\collectr-capture.json
```

The snippet writes a HAR-shaped file on purpose, so it goes through exactly the
same reader as a real HAR.

### Or: export a HAR

In current Chrome the old "Save all as HAR with content" has moved. Look for the
**download arrow (⬇)** in the Network toolbar, or right-click a request →
**Export HAR**. If offered a choice, **sanitized** is fine and safer — it strips
cookies and auth headers but keeps the response bodies, which is all this reads.

1. Open `https://app.getcollectr.com/portfolio/products` in your normal Chrome,
   signed in as usual.
2. **F12 → Network** tab → tick **Preserve log**.
3. Scroll through your **whole** collection so every page loads.
4. Right-click any request → **Save all as HAR with content**.
   (Plain "Save all as HAR" records headers only — not enough.)
5. Then:

```bash
npm run collectr:from-har -- --har C:\path\to\collectr.har
```

It finds the card list in the capture, merges every page, downloads the art and
writes `./collectr-export/`. Import that folder in the app.

> **Delete the .har afterwards.** It is a full network recording and contains
> your Collectr session cookies. Nothing from it is copied into the output, but
> never attach one to a bug report.

## The automated route (may not work)

Kept because it is much nicer when a site allows it, and Collectr's protection
may change. If `collectr:login` cannot confirm a session, use the HAR route
above instead.

### The three commands

```bash
npm run collectr:login      # 1. sign in yourself, in a real browser window
npm run collectr:discover   # 2. find where your cards live (do this once)
npm run collectr:export     # 3. write ./collectr-export/
```

Run them in that order. Step 2 is not optional the first time — step 3 uses
what it learned to know which page to open.

### 1. `collectr:login`

Opens a visible browser at app.getcollectr.com. **You** sign in, in that
window. Then press Enter back in the terminal and the session is saved to
`tools/collectr-export/.auth/state.json`.

Before saving, it **navigates to your portfolio and checks the session actually
works**, and will not write anything until it does. This matters more than it
sounds: Collectr signs in through Stytch, often via Google, so pressing Enter a
few seconds early captures a half-finished OAuth exchange — a PKCE verifier and
some Google cookies, but no Collectr session. The resulting file looks perfectly
healthy (60 KB, a dozen cookies) and then makes every later step report
"session expired", which sends you chasing the wrong problem entirely.

If the check fails it tells you where it landed and lets you try again, up to
three times.

> Collectr sits behind **AWS WAF**. If you get a human-verification challenge,
> solve it in that window before pressing Enter — this tool will never do it for
> you. If the app keeps bouncing to an error page, `--browser msedge` is worth a
> try.

### 2. `collectr:discover`

Opens the same browser with your saved session and records the JSON the
Collectr app fetches while you browse. Navigate to your collection, scroll to
the bottom, press Enter. It writes `.auth/discovery.json` and prints a ranked
list of what looked like your card list, including the field mapping and the
first few cards run through the real normalizer — so you can check the mapping
before trusting it.

### 3. `collectr:export`

```bash
node tools/collectr-export/export.mjs --out ./collectr-export
```

| Option | Meaning |
| --- | --- |
| `--out <dir>` | Output folder (default `./collectr-export`) |
| `--limit <n>` | Stop after ~n rows — good for a trial run |
| `--headed` | Show the browser (use this if something looks stuck) |
| `--no-fallback` | Skip the Pokémon TCG API image lookup |
| `--browser <name>` | `chrome` (default) → `msedge` → `chromium` |

## Which browser opens

All three commands try **Google Chrome** first, fall back to Edge, then to
Playwright's own bundled Chromium. Force one with `--browser msedge` (or set
`COLLECTR_BROWSER=msedge`); an explicit choice is never silently substituted,
so you always know what you signed in to.

It opens a **fresh, empty profile** — not your everyday Chrome profile. So you
will be asked to sign in even if Collectr is already open in your normal
browser. That is deliberate: Playwright cannot attach to a running Chrome, and
borrowing its profile directory would mean closing Chrome entirely and letting
this tool write to it. Signing in once in a clean window is the cheaper trade.

Interrupted? Just run it again — images already on disk are reused.

## The credential promise

**This tool never asks for, stores, types or transmits your password.**

- There are no `--user` / `--pass` / `--email` flags, and no code path that
  fills a password field. Sign-in happens in a normal browser window, by you,
  which is also why 2FA and SSO simply work.
- It contains no captcha-solving and no bot-detection evasion. If Collectr
  shows a human-verification challenge, the script stops and asks you to deal
  with it yourself in a headed window.
- Auth/login requests are excluded from the response capture, so no token ever
  lands in `discovery.json`.

What *is* saved is the resulting session:

> **`.auth/state.json` — treat this file like a password.** It is cookies plus
> local storage for your signed-in Collectr account: anyone who copies it is
> signed in as you. It is gitignored, written owner-only, and you should
> **delete `.auth/` when you are done exporting.** (`.auth/discovery.json`
> holds your own card data — delete that too.)

## What you get

```
collectr-export/
  collection.json     # the envelope the app validates
  img/<id>.png|jpg|webp
```

Card art comes from Collectr first. If a card has no usable image, the script
asks the public Pokémon TCG API for that exact set + card number and accepts
the answer **only when exactly one card matches** — an under-match costs you a
missing image, an over-match would hang the wrong artwork under the right name.
Anything still without art is marked `imageSource: "none"`; the app reports
those rather than creating a blank card.

## Importing it

Open Vendor Museum → **ACQUISITIONS** → **Import from Collectr** → choose the
export folder. You get a preview of exactly what will be added and changed
before anything is written, and re-importing never rearranges a museum you
have curated: only name/set/number/year/grade/condition/quantity are synced.

(Collectr PRO users can skip all of this and pick their PRO CSV export in the
same dialog — no images, but quantities and grades sync fine.)

## Playing fair

This automates *your own account* against a third-party site, so:

- Use it only on an account you own, for your own collection.
- Leave the throttles alone. Requests are serial with a ~300 ms gap, and the
  Pokémon TCG API is capped well under its 30/min unauthenticated limit.
- Don't redistribute Collectr's images — they are for your own museum.
- Check Collectr's Terms of Service and respect them; automated access may be
  restricted, and that call is yours to make.
- If a page starts asking whether you are human, stop rather than pushing
  through. That is the site asking for a break.
