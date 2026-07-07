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

Write drive scripts as `*.tmp.mjs` in the repo root (so `import 'playwright'`
resolves against the project's node_modules); delete them when done.
Screenshots go to `$CLAUDE_JOB_DIR/tmp`. SwiftShader inflates all GPU costs
(shader compiles take seconds) — treat frame timings as relative, not
absolute. Collect `console`/`pageerror` events; zero errors is part of PASS.

## Seeding data (fresh profile = empty IndexedDB every launch)

Generate images in-page with a canvas, then upload through the real inputs:

- cards: `#home-file-input` (home screen); thumbnails = `img[alt^="..."]`
- vendor: VENDOR REGISTRY → `input[placeholder="New vendor name"]` + Enter;
  inventory: `#vendor-inventory-input` (multi-file); items counted via
  `input[placeholder="Add a caption…"]`
- floor plan: WALK A CARD SHOW → `#plan-input`; `floorplan_example.png` in
  the repo root detects 50 boxes; wait for `/\d+ boxes/` in body text
- assign a booth: click a `<svg> rect` center → "Vendor at this booth:"
  panel → `selectOption`. **Re-read element coordinates after any panel
  opens/DOM change — the page scrolls and stale coords miss silently**
  (this broke a "Set start" click once; the feature was fine).

## Driving the 3D scenes

- Click canvas center to engage pointer lock.
- Steer under pointer lock with synthetic events (PointerLockControls reads
  `movementX/Y`, gain 0.002 rad/px, yaw -= mX·0.002):
  `document.dispatchEvent(new MouseEvent('mousemove', { movementX, movementY }))`
- Walk with `keyboard.down/up('KeyW')` bursts.
- **Hall navigation**: the minimap marker div (`img[alt="Minimap"]`'s next
  sibling) exposes live pose: `translate(Xpx, Ypx) rotate(Rrad)` where
  `u=(X+6)/mapW`, `v=(Y+7.2)/mapH`, `yaw=-R`. Camera forward in image axes
  is `(-sin yaw, -cos yaw)`, so steer with `desiredYaw = atan2(-du, -dv)`,
  walk, repeat. Player is blocked ~0.8 m from a table; binders sit ~0.9 m
  below eye height, so once "stuck" against the booth, pitch down (-0.3 to
  -0.9 rad) and sweep yaw until "Press F to open the binder" appears in
  body text. Hard-won navigation details (2026-07-06 M0 run):
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
- Measure open-animation smoothness by recording rAF deltas around the F
  press and reporting the max gap.

## Flows worth driving

museum: upload cards → ENTER THE GALLERY → binder open/flip/close.
hall: vendor+inventory → plan → assign booth → GENERATE → navigate to booth
→ F → check first spread (textures), last spread (no pocket bleed-through),
card click → inspect, close → reopen (warm cache).
