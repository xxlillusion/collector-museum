# Verify — drive the app headlessly (browser GUI)

Build/launch/drive recipe that works for this repo (Vite + R3F, no tests).

## Launch

```
npm run dev          # background; port 5175 may be taken by the user's own
                     # server — parse the actual port from the output
```

Playwright is a devDependency; **no browser download needed** — use the
system Edge channel with software GL (works headless on this machine):

```js
const browser = await chromium.launch({
  channel: 'msedge', headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--no-sandbox'],
});
```

**Pointer lock is DENIED in headless Edge** (as of 2026-07-10 —
`THREE.PointerLockControls: Unable to use Pointer Lock API`). Shim it via
`context.addInitScript` BEFORE any page load; PLC, the crosshair raycast
compute, HUD lock state and Esc-relock all believe it:

```js
await ctx.addInitScript(() => {
  let fake = null;
  Element.prototype.requestPointerLock = function () { fake = this; document.dispatchEvent(new Event('pointerlockchange')); };
  try { Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => fake }); } catch { /* */ }
  Document.prototype.exitPointerLock = function () { fake = null; document.dispatchEvent(new Event('pointerlockchange')); };
});
```

Write drive scripts as `*.tmp.mjs` in the repo root (so `import 'playwright'`
resolves against the project's node_modules); delete them when done. (From a
scratchpad dir instead: `createRequire('<repo>/package.json')` and
`require('playwright')`.) Screenshots go to `$CLAUDE_JOB_DIR/tmp`. SwiftShader
inflates all GPU costs (shader compiles take seconds) — treat frame timings as
relative, not absolute, and treat glossy-material highlights (e.g. tablecloth
sheen) as unreliable. Collect `console`/`pageerror` events; zero errors is
part of PASS. A `WebGL context lost — remounting canvas to recover` warning
can fire under SwiftShader load; the app self-heals (that's the recovery path
working), but repeated losses mean the run is too heavy.

## Seeding data (fresh profile = empty IndexedDB every launch)

Generate images in-page with a canvas, then upload through the real inputs:

- cards: `#home-file-input` (home screen); thumbnails = `img[alt^="..."]`
- vendor: VENDOR REGISTRY → `input[placeholder="New vendor name"]` + Enter;
  inventory: **`input[type=file][multiple]` inside the vendor panel** (the old
  `#vendor-inventory-input` id is GONE — VendorManagementPanel uses refs; the
  single-file input alongside it is the banner). Items counted via
  `input[placeholder="Add a caption…"]`; sale fields per tile:
  `input[placeholder="$ price"]`, `select` (For sale/Sold/Display only),
  `input[placeholder^="Condition"]`.
- floor plan: BUILD A SHOW → `#plan-input`; `floorplan_example.png` in
  the repo root detects 50 boxes; wait for `/\d+ boxes/` in body text
- assign a booth: click a `<svg> rect` center → "Vendor at this booth:"
  panel → `selectOption`. **Scroll the plan svg into view first and re-read
  element coordinates after any panel opens/DOM change — the page scrolls and
  stale coords miss silently** (on ShowEditorScreen the plan sits below the
  fold; a click computed from a pre-scroll rect lands nowhere). Pick the svg
  with the most `rect` children — PageShell chrome adds other svgs.
- persistent profiles: `chromium.launchPersistentContext(dir, …)` keeps
  IndexedDB/localStorage across runs — build the sandbox state once, reuse it
  for museum/hall/mobile passes (relaunch same dir with a different viewport
  for touch).

## Driving the 3D scenes

- **SwiftShader race**: R3F's Canvas config effect can overwrite the scenes'
  custom crosshair `events.compute` after mount (pre-existing, harmless on real
  GPUs). If a scripted CANVAS CLICK must raycast from the crosshair, re-install
  the compute via the R3F store first (`window.__R3F`-style store access →
  `store.setEvents({ compute: <the crosshair compute> })`), or aim the
  crosshair and click the true screen-center pixel.
- Click canvas center to engage (shimmed) pointer lock.
- Steer under pointer lock with synthetic events (PointerLockControls reads
  `movementX/Y`, gain 0.002 rad/px, yaw -= mX·0.002):
  `document.dispatchEvent(new MouseEvent('mousemove', { movementX, movementY }))`
- Walk with `keyboard.down/up('KeyW')` bursts.
- **Hall navigation**: the minimap is `img[alt="Minimap"]`; its parent's DIV
  children are the overlays — the **player marker** is the child whose
  `style.transform` matches `translate(Xpx, Ypx) rotate(Rrad)`
  (`u=(X+6)/mapW`, `v=(Y+7.2)/mapH`, `yaw=-R`); **booth dots** are small
  (4–10px) `border-radius: 50%` DIVs positioned via `left/top` (gold
  `rgba(212,175,55,…)`; starred = 7px `rgb(255,215,94)` + glow — match on
  size/shape, not one color). Navigate to a booth dot's uv directly instead of
  recomputing plan-image coordinates. Camera forward in image axes is
  `(-sin yaw, -cos yaw)`, so steer with `desiredYaw = atan2(-du, -dv)`,
  walk, repeat. Player is blocked ~0.8 m from a table; binders sit ~0.9 m
  below eye height, so once "stuck" against the booth, pitch down (+mY 150–450)
  and sweep yaw until "Press F to open the binder" appears in body text.
  Hard-won details:
  - Match transform numbers permissively (`[-\d.eE+]+`) — near-zero rotate
    renders in scientific notation — and retry when the regex misses (the
    first frame can have an empty transform).
  - Straight-line steering gets blocked by intervening booths on real
    plans. Assign the **bottom-most, roughly central rect** (spawn is at
    the south wall = bottom of the image) so the walk is obstacle-free,
    and wall-slide (hold W + alternate A/D ~500 ms) when the minimap dist
    stops changing.
  - "Arrived" ≈ dist < 55 px on floorplan_example (~34 px/m; collision
    stops you ~27 px out — a tighter threshold never triggers).
- Binder: F opens, Arrow keys flip, F/Esc closes; the open-spread HUD text
  is "flip pages"; InspectOverlay shows "click anywhere to return".
  **Opening the binder EXITS pointer lock** (free cursor for card clicks) —
  so `page.mouse.click(x, y)` must target the card's actual screen pixels
  (first spread's top-left card ≈ (810, 307) at 1440×900), NOT the center
  crosshair. Center-clicks silently miss.
- Measure open-animation smoothness by recording rAF deltas around the F
  press and reporting the max gap.

## Flows worth driving

museum: upload cards → ENTER THE GALLERY → binder open/flip/close.
hall: vendor+inventory → plan → assign booth → GENERATE → navigate to booth
→ F → check first spread (textures), last spread (no pocket bleed-through),
card click → inspect (placard shows caption + price/condition when set),
close → reopen (warm cache).
signed-in (live Supabase): reuse the uxtest account in memory
(project-uxtest-account) rather than minting new ones.

## 2026-07-22 discoveries (3D-interactivity wave)

- **Port = origin = data.** IndexedDB is per-port; a persistent Playwright
  profile seeded on :5175 is EMPTY on :5176. Keep the same port across runs.
  Killing `npm run dev` (the npm parent) can leave the **vite child alive,
  holding the port and serving stale pre-edit code** — find it via
  `Get-NetTCPConnection -LocalPort 5175` and kill that PID, then restart.
- **Shared `.vite` cache corruption:** worktrees whose `node_modules` is a
  junction to the main checkout share `node_modules/.vite`; their dev servers
  re-optimize it under a long-running main server, which then serves
  duplicated module instances — symptom: `R3F: Hooks can only be used within
  the Canvas component!` on scene mount. Restart the main dev server.
- **`window.confirm` guards** (saved-plan Load / Delete ✕, non-LCD themes):
  headless auto-DISMISSES dialogs, so clicks silently no-op — install
  `page.on('dialog', (d) => d.accept())` before driving those buttons.
- Hidden file inputs (`#home-file-input`, `#plan-input`) need
  `waitForSelector(..., { state: 'attached' })`; `setInputFiles` works on
  them regardless. `#plan-input` only EXISTS before a plan upload — with a
  persistent profile, gate on `#plan-input || /\d+ boxes/` instead.
- **DOM screens scroll their own container** (html/body overflow hidden) —
  `window.scrollBy` no-ops. Walk ancestors for `scrollHeight > clientHeight`
  and adjust `scrollTop`. Scroll click targets to MID-viewport first: the
  FloatingThemeBar owns the bottom-center strip (~y>855 at 900 viewport) and
  swallows clicks.
- Gallery lock: clicking canvas CENTER may hit a frame (opens inspect
  instead of locking) — click low on the floor (~88% height).
- Arrange mode (F1): R toggles; the "N of 48 slots" HUD pill is the DOM
  signal that arrange is active. Wave state in IndexedDB for assertions:
  cards/inventory `display` + `wallSlot`, vendors `boothLayout`, settings
  `hallSignage`/`hallSignageHeader`/`hallSignageBanner`, SavedPlanRecord
  `signageJson`. Smoke scripts should NORMALIZE these keys up front (delete
  them in a readwrite transaction) so re-runs are deterministic.
