# Per-route OG previews — design spike

Status: **phase 1 IMPLEMENTED** (2026-07-10, branch `u2a-og`) — Edge Function
`supabase/functions/og-render/` (pure logic in `og.ts`, 10/10 unit tests),
nginx bot-split live in `nginx.conf` (container-validated `nginx -t` + curl
matrix), and four static 1200×630 cards in `public/` (`og-show.png`,
`og-vendor.png`, `og-collector.png`, `og-default.png`, ~39 kB each). One
as-built deviation from §b below: the nginx branch uses a **302 redirect** to
the function instead of `proxy_pass` (rationale under "As shipped"). Deploy
runbook at the bottom — the function still needs `supabase functions deploy`
and the VPS needs a rebuild before this is live.

## a) The problem

Vendor Museum is a client-rendered SPA. Every route — `/show/:id`, `/vendor/:id`,
`/collector/:id`, `/museum/vendor/:id`, `/museum/collector/:id` — serves the same
`index.html`, whose `<head>` carries one site-level OG/Twitter block (added in the
roadmap "Now" wave: *"Vendor Museum — walk card shows in 3D"*). Link-unfurl crawlers
do **not** execute JavaScript, so sharing a specific show or vendor page in Slack,
Discord, iMessage, X, etc. renders the generic site card instead of the show's name,
date, and image. Per-route OG therefore needs *server-side* help: something must
return route-specific `<meta>` tags in the initial HTML response.

**Premise correction.** Earlier notes assumed the deploy target was shared hosting
(Hostinger) where we can't touch the web server, making per-route OG look expensive
(prerender services, etc.). That premise is wrong: the deploy in this repo is a
**self-controlled nginx inside Docker** (`Dockerfile` production stage copies
`nginx.conf` → `/etc/nginx/conf.d/default.conf`), fronted by an existing **Traefik**
(`docker-compose.deploy.yml`, TLS via cert resolver `mytlschallenge`) at
**museum.maybesomething.tech**. We own every line of the nginx config, so the
classic "sniff the bot, serve it meta HTML" pattern is fully available.

> **CONFIRM before building:** is `docker-compose.deploy.yml` (nginx-in-Docker
> behind the n8n stack's Traefik on the VPS) the *actual live deploy path* for
> museum.maybesomething.tech? Everything below assumes yes. If the site is in fact
> served some other way (e.g. Hostinger static hosting), the nginx half of this
> design is void and the fallback is a prerender/edge-rewrite service in front of
> the host.

## b) Recommended design: nginx bot-split → Supabase Edge Function

Three pieces, all additive:

### 1. Bot detection map (nginx, http level)

`conf.d/default.conf` is included at `http{}` level, so the `map` can sit at the
top of the existing file (marker comment already in place):

```nginx
map $http_user_agent $is_bot {
    default               0;
    ~*facebookexternalhit 1;   # Facebook / Messenger / Instagram
    ~*twitterbot          1;   # X
    ~*slackbot            1;
    ~*discordbot          1;
    ~*linkedinbot         1;
    ~*telegrambot         1;
    ~*whatsapp            1;
    ~*googlebot           1;   # see SEO note below
}
```

SEO note on `googlebot`: Google *does* run JS, so strictly it doesn't need this
path; including it means Google indexes the meta stub (title/description — good)
instead of the empty shell. Serving bots different content is only "cloaking" when
it misrepresents the page; equivalent metadata + a link to the real URL is standard
practice. Keep it in, but it's the first thing to drop if Search Console ever
complains.

### 2. Shareable-route branch (nginx, server level)

Before the SPA fallback (marker comment in place). `if` inside a `location` is
limited (no `proxy_pass` with URI part), so use the well-worn
`return`-to-named-location trick rather than fighting it:

```nginx
location ~ ^/(show|vendor|collector|museum)/ {
    error_page 418 = @og_bot;
    if ($is_bot) { return 418; }
    try_files $uri /index.html;      # humans: SPA as today
}

location @og_bot {
    rewrite ^ /functions/v1/og-render break;
    proxy_set_header X-Original-Path $request_uri;   # tells the fn which row
    proxy_set_header Host ${SUPABASE_HOST};          # <project>.supabase.co
    proxy_ssl_server_name on;                        # SNI for the upstream cert
    proxy_pass https://${SUPABASE_HOST};
    proxy_hide_header cache-control;                 # if we override below
    add_header Cache-Control "public, max-age=600";
}
```

Implementation notes (the sharp edges, found while sketching):

- **Config templating.** `nginx.conf` is currently a static file `COPY`'d in the
  Dockerfile. The official nginx image auto-runs `envsubst` over
  `/etc/nginx/templates/*.template` at startup — rename to
  `nginx.conf.template`, ship `SUPABASE_HOST` through compose (it's derivable
  from the existing `VITE_SUPABASE_URL`), done. No new tooling.
- **Upstream DNS.** A hostname in `proxy_pass` with a *variable* needs a
  `resolver` directive (e.g. `resolver 127.0.0.11` — Docker's embedded DNS — or
  `1.1.1.1`) because nginx then resolves at request time. Alternatively hardcode
  the literal host via envsubst (resolved once at startup; Supabase fronts with a
  stable CDN hostname, and a container restart re-resolves).
- **Edge Function auth.** Supabase functions verify a JWT by default. Deploy
  `og-render` with `--no-verify-jwt` (it's a public, read-only endpoint — same
  trust level as the anon key that's already baked into the shipped JS).
  Alternative: have nginx inject `Authorization: Bearer <anon key>`; the key is
  public anyway, but `--no-verify-jwt` keeps secrets out of nginx entirely.
- The regex deliberately catches `/museum/vendor/:id` + `/museum/collector/:id`
  (the walkable-museum wrappers) as well as the flat pages — all five are
  share-worthy. `/demo` and directories (`/shows`, `/vendors`) keep the
  site-level card; add them later only if wanted.

**As shipped (phase 1): `return 302` instead of `proxy_pass`.** The bot branch
in `nginx.conf` redirects crawlers to
`https://pawtjhjmqzhueuebfnof.supabase.co/functions/v1/og-render?path=$request_uri`
rather than proxying the function response through nginx. Tradeoff, made
deliberately:

- *Pro:* zero proxy plumbing — no `nginx.conf` → envsubst template conversion,
  no Dockerfile change, no request-time `resolver`/SNI directives, nothing to
  break at 3am. The functions URL is public information (same origin the
  shipped JS already calls), so hardcoding it costs nothing.
- *Con:* crawlers must follow the redirect. The major unfurlers all do
  (Facebook/Messenger, X/Twitter, Slack, Discord, Telegram, WhatsApp,
  LinkedIn, Google/bing follow 3xx when resolving cards); the shared URL in
  the unfurl stays the museum URL because the OG HTML sets `og:url` back to
  `museum.maybesomething.tech`. An unfurler that refuses redirects would show
  no card at all (not a wrong card). If one ever matters, the §b `proxy_pass`
  variant above is the drop-in upgrade — the function is agnostic (it reads
  `?path=`, with `X-Original-Path` already supported as the proxy-mode
  fallback).
- `$request_uri` keeps the original query string, so the redirect target can
  contain a nested `?` (e.g. `?path=/show/<id>?utm=x`). That is legal — the
  second `?` is literal query-string data — and `parsePath` strips query/hash
  before matching. Verified by curl.

### 3. `og-render` Supabase Edge Function

A small Deno function, ~100 lines:

1. Parse `X-Original-Path` (fallback: its own query string) → route type + id.
2. Read the row **with the anon key**, so RLS enforces exactly the same
   visibility the app has — this is the crucial correctness property:
   - `/show/:id` → `shows` where `published` (name, date, city/state, venue).
   - `/vendor/:id`, `/museum/vendor/:id` → registered vendors only
     (`profile_id` non-null), name/location; banner only via its stored
     `*_path` column.
   - `/collector/:id`, `/museum/collector/:id` → profiles with
     `collection_public`.
   - Row missing/not visible → return the **generic site card** (never an
     error page, never leaked data).
3. Return minimal HTML: `og:title`, `og:description`, `og:image`, `og:url`,
   `og:site_name`, `twitter:card`, plus
   `<meta http-equiv="refresh" content="0;url=https://museum.maybesomething.tech/show/…">`
   and a plain `<a>` — so any stray *human* who lands here (bot-UA browser
   extensions, curl users) bounces to the real page. A meta-refresh is
   preferred over a 302: several unfurlers refuse to read tags off redirect
   responses.
4. Set `Cache-Control: public, max-age=600` on its own response (see §d).

## c) og:image strategy

- **Phase 1 — static per-type images (SHIPPED).** Four 1200×630 images in
  `public/` (`og-show.png`, `og-vendor.png`, `og-collector.png`,
  `og-default.png`): museum-dark radial background, gold serif VENDOR MUSEUM
  masthead + ❖ ornament (museumKit palette), per-type line ("WALK THIS CARD
  SHOW IN 3D" / "VENDOR INVENTORY & MUSEUM" / "A PRIVATE COLLECTION,
  SPOTLIT" / "WALK CARD SHOWS IN 3D"). Palette-quantized PNG-8, ~39 kB each.
  The function picks by route type; title/description carry the specifics.
  Zero moving parts.
- **Phase 2 — dynamic images.** Real assets already exist in *public* storage
  buckets: vendor **banners** (`banners` bucket) and show **floor-plan images**
  (`plans` bucket). The function swaps `og:image` to the stored public URL from
  the row's `*_path` column (never reconstruct paths — the storage-gotchas rule).
  Considerations: unfurlers want ~1200×630 and some cap image bytes (~1–5 MB) —
  plan images are ≤1600 px WebP so size is fine, but aspect will letterbox;
  WhatsApp historically dislikes WebP (it re-fetches as thumbnail — test).
  A true composite card (banner + name + date rendered onto a canvas) needs
  image rasterization inside the Edge Function (e.g. Satori/resvg-wasm) or
  pre-generating a card image at publish time and storing it next to the plan —
  the pre-generate-at-publish route is simpler and cacheable forever. Decide
  when phase 1 feels stale.
- Cards-bucket images (collector cards) stay out of OG entirely for now:
  public-read but unguessable paths is the existing discovery model; an OG tag
  would happily hand the URL to every link scraper. Collector pages use the
  static/phase-2 treatment instead.

## d) Caching + Traefik

- Bot responses: `Cache-Control: public, max-age=600` (10 min) — set by the
  Edge Function (nginx can override, belt-and-braces). Unfurlers cache
  aggressively on their side anyway; 10 min bounds both stale shows *and* the
  function-invocation bill if something scrapes in a loop.
- Optionally add an nginx `proxy_cache` micro-cache (same 10 min, keyed on
  `$request_uri`) in front of the function — one `proxy_cache_path` line + two
  directives in `@og_bot`; worth it only if function invocations ever matter.
- **Traefik: no changes.** It terminates TLS and forwards to the container's
  :80 verbatim; response headers (incl. `Cache-Control`) pass through
  untouched. No new labels, no middleware. The only Traefik-adjacent fact worth
  recording: the og-split happens entirely *inside* the museum container, so
  the router rule/entrypoint in `docker-compose.deploy.yml` stays as-is.

## e) Alternatives considered

- **Build-time prerender** (vite-ssg / react-snap style): rejected — the routes
  are dynamic ids created at runtime by organizers/vendors; there is no build-time
  list, and rebuilding the site per new show is absurd.
- **Client-only** (react-helmet etc.): impossible for this goal — unfurl crawlers
  don't run JS; whatever the client sets is invisible to them.
- **Third-party prerender service** (prerender.io & co.): works without nginx
  control, but we *have* nginx control; adds a paid dependency and a full
  headless-render pipeline to serve four meta tags. Keep as the fallback if the
  CONFIRM box above comes back "not our nginx".
- **Move OG rendering into nginx itself** (njs/lua templating): avoids the edge
  function but puts Supabase queries + HTML templating in nginx config; harder to
  test, no RLS-by-construction. Rejected.

## f) Effort estimate

| Phase | Work | Estimate |
| --- | --- | --- |
| 1 | `og-render` function (parse route, 3 anon-key reads, HTML template, generic fallback) | 2–4 h |
| 1 | nginx: map + location + named location, `nginx.conf` → envsubst template, compose env plumb | 2–3 h |
| 1 | 3 static OG images | ~1 h |
| 1 | Verification: curl with spoofed UAs against the VPS, Facebook Sharing Debugger / X card validator / Discord paste | 1–2 h |
| **1** | **Total** | **~1 dev-day** |
| 2 | Dynamic `og:image` from stored banner/plan URLs (+ unfurler compatibility testing) | 0.5 day |
| 2b | (optional) Pre-generated composite card images at publish time | 1–1.5 days |

Rollback story is trivial at every step: delete the two nginx blocks and bots see
the site-level card again.

## g) DEPLOY RUNBOOK (phase 1)

Two independent halves; either can ship first (bots just get the old behavior
from whichever half is missing).

### 1. Deploy the Edge Function (once, from any machine with the Supabase CLI)

```sh
# from the repo root, linked to project pawtjhjmqzhueuebfnof
supabase functions deploy og-render --no-verify-jwt --project-ref pawtjhjmqzhueuebfnof
```

`--no-verify-jwt` is required: crawlers arrive with no Authorization header.
The function is read-only and anon-key-scoped (RLS applies), so this is the
same trust level as the shipped JS. No secrets to set — `SUPABASE_URL` /
`SUPABASE_ANON_KEY` are injected by the Edge runtime automatically.

Smoke-test the function directly (works before the nginx half ships):

```sh
curl -s "https://pawtjhjmqzhueuebfnof.supabase.co/functions/v1/og-render?path=/show/<a-published-show-uuid>" | grep og:title
# expect: <meta property="og:title" content="<show name> — Vendor Museum">
curl -s "https://pawtjhjmqzhueuebfnof.supabase.co/functions/v1/og-render?path=/nonsense" | grep og:title
# expect the generic site card, HTTP 200
```

### 2. Ship the nginx config + images to the VPS

`nginx.conf` and the `public/og-*.png` files are baked into the image at
build time (Dockerfile `COPY` — no compose/env changes needed), so this is
the standard deploy:

```sh
# on the VPS, in the repo checkout
git pull
docker compose -f docker-compose.deploy.yml up -d --build
```

No Traefik changes; the redirect happens inside the museum container.

### 3. Verify from anywhere

```sh
# Bot UA → 302 into the Edge Function, whose HTML carries the per-route tags
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  -A Twitterbot https://museum.maybesomething.tech/show/<id>
# expect: 302 https://pawtjhjmqzhueuebfnof.supabase.co/functions/v1/og-render?path=/show/<id>

curl -sL -A Twitterbot https://museum.maybesomething.tech/show/<id> | grep -E 'og:(title|image)'
# expect the show's name + https://museum.maybesomething.tech/og-show.png

# Human UA → the SPA shell, exactly as before
curl -s -A "Mozilla/5.0" https://museum.maybesomething.tech/show/<id> | grep -o '<div id="root">'

# Directories are untouched even for bots
curl -s -o /dev/null -w '%{http_code}\n' -A Twitterbot https://museum.maybesomething.tech/shows
# expect: 200
```

Then paste a show URL into the real validators: Facebook Sharing Debugger
(developers.facebook.com/tools/debug), X Card Validator, and a Discord DM to
yourself. Remember unfurlers cache hard — use each tool's "scrape again".

### Local verification already performed (2026-07-10, pre-deploy)

- `og.ts` unit tests: 10/10 under Node's test runner (parsePath all 5 shapes +
  garbage, HTML escaping incl. `<script>` in a show name, tag structure,
  field composition, date formatting). Strict `tsc --noEmit` clean.
- Live-data handler test: the real `index.ts` handler exercised under Node
  with a Deno shim against the live project — published show / registered
  vendor / public collector each produced correct per-route cards; a missing
  row and a garbage path produced the generic card, HTTP 200,
  `Cache-Control: public, max-age=600`.
- nginx: `nginx -t` green inside `nginx:alpine` with the config mounted at
  `/etc/nginx/conf.d/default.conf` (the Dockerfile's COPY target), plus a
  running-container curl matrix: Twitterbot/Slackbot/WhatsApp UAs → 302 with
  `?path=$request_uri`; human UA → SPA shell; bot on `/shows` → 200 SPA;
  `/assets/*` keeps `max-age=31536000, immutable`.
