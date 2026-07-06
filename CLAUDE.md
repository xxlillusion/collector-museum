# Vendor Museum — Handoff / Project Guide

A first-person 3D virtual museum for a personal Pokemon card collection. Users upload card
images (drag & drop), then walk a realistic gallery room where the cards hang as framed,
spotlit art. No backend — everything persists in the browser via IndexedDB, deployable as a
static site.

Two experiences, switched from the upload screen:
1. **Museum** — the original card gallery.
2. **Vendor View** — upload a convention floor plan image, review auto-detected table boxes
   in a 2D editor, press Generate, and walk a 3D convention hall where each box becomes one
   or more 6-ft tablecloth tables (see “Vendor View” section below).

## Quality bar (non-negotiable)

**Realism is the point.** This must never look like a lazy Three.js demo. All visual work
uses PBR materials, deliberate lighting design (individual spotlight painting), soft shadows,
env-map reflections/glare, reflective floor, ACES tone mapping, and post-processing
(AO/bloom/vignette). Treat lighting and shadows as seriously as layout.

## Stack

- **Vite 8 + React 19 + TypeScript** (strict, `verbatimModuleSyntax` enabled)
- **@react-three/fiber v9 + @react-three/drei v10** (Three.js r185)
- **@react-three/postprocessing** — N8AO, Bloom, Vignette (desktop only)
- **idb** — IndexedDB wrapper for card storage
- **nipplejs v1** — mobile virtual joystick (⚠ new rewrite, see gotchas)

## Commands

```
npm run dev      # dev server (5175, falls through to next free port)
npm run build    # tsc -b && vite build — USE THIS to type-check (see gotchas)
```

## Architecture

Four top-level views, switched in `src/App.tsx` (plain state union, no router):

```
HomeScreen (DOM) ←→ Scene (museum, R3F Canvas + DOM overlays)
        ↕
VendorSetupScreen (DOM: upload / detect / edit) ←→ VendorScene (hall, R3F Canvas)
```

`type View = 'home' | 'gallery' | 'vendorSetup' | 'vendorWalk'` — `vendorWalk` guards on
`planMeta` existing and falls back to setup. DOM screens are their own scroll containers
(`height: 100vh; overflow-y: auto`) because `html/body/#root` keep `overflow: hidden`
for the fullscreen canvases.

### Data flow

`src/lib/db.ts` — IndexedDB (`vendor-museum` db, v2). Stores:
- `cards`: `{ id, name, imageBlob, addedAt }` → `src/lib/useCards.ts` hook (object URL per
  blob, revoked/recreated on each reload).
- `settings`: single-slot `{ key, blob }` records — `tableclothBanner` (→ `useBanner.ts`),
  `vendorFloorPlan` (downscaled plan image) and `vendorPlanMeta` (JSON-as-Blob;
  → `useVendorPlan.ts`). JSON-in-a-Blob means new settings need **no schema bump**.

All uploads pass through `downscaleImage()` (≤1600px, WebP 0.92).

### 3D scene (`src/components/`)


| File                  | Role                                                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Scene.tsx`           | Canvas config (ACES tone mapping, dpr clamp, custom raycast compute, WebGL context-loss auto-recovery via key remount), aspect-aware layout algorithm, clustered `WallSpot` spotlights, `Environment` + `Lightformer`s, `EffectComposer`, `LoadingOverlay` (useProgress) |
| `Room.tsx`            | Exports `ROOM` dims (20×5×12) + `TRACK_OFFSET`. Reflective floor (`MeshReflectorMaterial`), walls, crown molding, baseboards, ceiling light tracks, central bench, base lighting + shadow-casting key light                                                              |
| `CardFrame.tsx`       | Framed card: mitred wood frame (clearcoat), white passe-partout mat, card texture plane, glass pane with env glare. Click → inspect (guarded by `e.delta > 8` to ignore drags)                                                                                           |
| `GalleryControls.tsx` | Desktop: `PointerLockControls` + WASD (velocity in `useFrame`, fixed eye height 1.7). Exports `isTouchDevice`, mutable `mobileInput`/`mobileLook` shared with mobile controls, and `AABB`. Parameterized via optional props `bounds` / `colliders: AABB[]` / `initialPosition` — **defaults reproduce the museum exactly** (room clamp + one-sided table push-out); VendorScene passes hall bounds + per-table AABBs. Push-out = axis of least penetration |
| `MobileControls.tsx`  | Touch only: nipplejs joystick (bottom-left) writes `mobileInput`; window-level touch-drag listeners write `mobileLook` deltas (consumed as yaw/pitch in `GalleryControls.useFrame`). No intercepting overlay, so taps reach the canvas for card clicks                   |
| `HUD.tsx`             | Control hints (different text for touch), crosshair when locked, "Manage Cards" button                                                                                                                                                                                   |
| `InspectOverlay.tsx`  | Full-screen card view; any click (or Esc) closes it, and Scene then re-locks the pointer (best-effort — Chrome has a ~1s cooldown after exiting pointer lock, so it falls back to click-canvas-to-lock)                                                                  |
| `HomeScreen.tsx`      | Museum-styled home (“Museum Refined” design, replaced the old UploadScreen 2026-07): card upload dropzone, framed collection grid with delete, tablecloth banner slot, saved-plan list with “Walk →” (loads snapshot via `onWalkPlan` then jumps straight to `vendorWalk`), Enter Gallery / Walk a Card Show CTAs |


### Layout algorithm (`computeLayout` in Scene.tsx)

Gallery-style: each frame is sized from its image's real aspect ratio (`aspect` computed
in `useCards` via `createImageBitmap`) — fixed target content height 1.25, width capped at
2.1 for panoramas. Greedy row packing fills two rows per wall (centers 3.15 / 1.5), rows
centered, fixed 0.45 gap between frame edges — overlap impossible by construction. North
wall fills first, then south. Spotlights are placed one per *cluster* of nearby frames
(`clusterXs`, merge distance 1.5) to keep the forward-renderer light count sane.

### Lighting design

Very low ambient/hemisphere base so warm track spotlights (`#ffe6bd`, one per cluster,
no shadows) paint pools on the walls. One shadow-casting spot over the bench
(PCFShadowMap + `shadow-radius` for softness). Env map is generated locally via
`<Environment>` + `<Lightformer>`s — **no network fetch** (don't switch to
`preset="..."`, those download HDRs).

⚠ **Do NOT re-add drei `<SoftShadows>` (PCSS) or `N8AO*`* — their first-frame shader
compile burst on Windows/ANGLE can trip the GPU driver timeout (TDR), killing the WebGL
context → intermittent black canvas with the DOM UI still alive. That bug was shipped and
reverted once. Post-processing is Bloom + Vignette only.

### Mobile strategy

`isTouchDevice` gates: no PointerLockControls, no SoftShadows, no EffectComposer,
reflector resolution 512 (vs 1024). Movement/look come from the shared mutable objects.

## Vendor View (floor plan → walkable convention hall)

Flow: HomeScreen “Walk a Card Show” button → `VendorSetupScreen` (drop plan image →
auto-detect → `PlanEditor` fix-up → Generate) → `VendorScene` (first-person hall).
Plan image + edited boxes persist in the `settings` store; a saved plan skips straight
to the editor on return. HomeScreen’s saved-plan “Walk →” shortcut bypasses the editor:
it loads the snapshot into the working slots and goes directly to `vendorWalk`.

### Files

| File | Role |
| ---- | ---- |
| `lib/vendorPlan.ts` | Data model (`VendorRect` in stored-image px — optional `rotationDeg` (SVG rotate() convention, clockwise about center) and `bannerId`; `VendorPlanMeta` — optional `pxPerMeterSource: 'inferred'\|'manual'` and `startPx`) + pure math: `planToLayout(meta)` → hall dims + `TablePlacement[]` + the **clamped** `pxPerMeter/planW/planD` it used (minimap/spawn mapping basis). px→m via `pxPerMeter`; image y-down → world +Z; image rotate(d) ⇒ world rotationY −d·π/180 (sin sign flips, cos agrees). Hall = plan extent + 2m margin, height 6, axes clamped to 8–80m. **`AISLE_SCALE = 1.2`**: booth *positions* and hall extents spread ×1.2 while box footprints (→ table sizes) keep the true scale — wider aisles without inflating tables; the returned `pxPerMeter/planW/planD` already include the spread so minimap/spawn mapping stay consistent. Show-standard table size: `VendorPlanMeta.tableLengthFt?: 6\|8` + `standardTableW(ft)` (absent = 6 ft). A box spawns a **rows × cols grid** via `boxGrid(long, short, tableW)`: `cols = round(long/tableW)`, `rows = round(short/0.76)` (min 1 each), each table stretched (`TablePlacement.sx/sz`; `sx` normalized to the 1.83 m geometry, clamp window scaled by `tableW/1.83` — an exact 8 ft slot = one table at sx ≈ 1.33) so the grid spans the box footprint exactly — generated proportions match the plan. Single-row fronts face the hall centerline (center is rotation-invariant); multi-row booths face back-to-back outward from the booth center (exact middle row falls back to the centerline heuristic) |
| `lib/planDetect.ts` | Dependency-free detection: downsample ≤1000px → luma → Otsu (saturated mid/bright pixels count as background so colored decoration ≠ tables; dark colored fills still detect) → Pass A (flood-fill light mask from borders; remaining enclosed light components = outlined tables, then `mergeSplitFragments` re-joins boxes that label digits touching the outline split apart — merge gated on the gap band NOT containing a near-solid dark line, which distinguishes text gaps from shared booth walls) + Pass B (dark connected components = filled tables) + **Pass C (saturated colored fills)**: the sat pixels the Otsu guard excluded are grouped into 24-bin hue families (adjacent above-threshold bins merge; family mask includes ±1 bin for JPEG hue jitter). Per family: directly-accepted comps (generic filters OR the thin-run exception — fill ≥0.75, short ≤0.08·maxDim, any aspect, long ≤0.9·maxDim — for whole booth-ring sides) + **guillotine decomposition** of rejected comps (booth rings/L-corners connect into one mostly-empty component; `decomposeComponent` cuts along interior <30%-coverage row/col bands recursively into solid strips). Decomposed pieces only count when their short side is 0.6–1.7× the family's modal short side from ≥2 direct accepts (the ruler that stops decomposed logo art/colored bands minting fake tables), and a family needs **≥3 total candidates** — tables repeat, decoration doesn't → bbox filters (min side, ≤40% of image, fill ratio ≥0.7, aspect ≤14) → IoU merge (A wins, then B, then C) → containment prune → physical size floor (long ≥0.5m, short ≥0.2m — kills icons/figures). `inferScale(rects, imgW, tableW)`: modal short side of table-aspect boxes / 0.76m, cross-checked vs long side / tableW (aspect window scales with the standard). `detectTables(blob, tableW?)`. Main thread is fine at this size |
| `lib/useVendorPlan.ts` | `useBanner`-style hook: `{ planUrl, planMeta, setPlan, saveMeta, clearPlan, loading, reload }`; new image clears stale rects |
| `lib/useVendorBanners.ts` | Per-vendor banner blobs (settings slots `vendorBanner:<id>`) → `Map<id, objectURL>`; `{ bannerUrls, addVendorBanner, removeVendorBanner, reload }`. Owned by App, wiped on plan replace/clear; VendorSetupScreen sweep-deletes unreferenced blobs on debounced persist |
| `lib/useSavedPlans.ts` | Named plan snapshots (`plans` store, db v3): `SavedPlanRecord` bundles plan image blob + metaJson + referenced banner blobs (self-contained, no ref-counting). Save = working→snapshot; Load = snapshot→working slots (raw `putFloorPlanBlob`, no re-downscale), then App reloads useVendorPlan + useVendorBanners |
| `PlanEditor.tsx` | `<img>` + SVG overlay, `viewBox` = stored-image px (browser scales; zero resize math). Modes: select / add / calibrate / setStart. Select/move/resize (corner handles)/delete (✕ or Backspace)/**rotate** (handle above the box, 15° snap, Shift = free; whole `<g>` gets `transform=rotate(deg cx cy)` so handles ride along; resize runs in the rect's local frame then re-anchors the fixed corner in world space), “Add table” draw mode, calibration line drag (→ `onCalibrateLine(px)`), start-marker click (→ `onStartChange`), `onSelectionChange` feeds the banner panel. Live subdivision preview: dashed grid lines per box from the shared `boxGrid` (pointerEvents none), label shows `R×C · N tables` for 2D grids. Pointer capture guarded in try/catch. Controlled; parent debounce-persists (500ms) |
| `VendorSetupScreen.tsx` | Upload/detect/edit wrapper; scale readout (“hall ≈ W×D m · N boxes → M tables”, “· calibrated” when manual), **table-size toggle (6 ft / 8 ft)** in the readout row — updates `meta.tableLengthFt` and re-derives an *inferred* scale from the current rects via `inferScale` (manual calibration never touched); Re-detect (**preserves manual scale + table size**), Replace image, calibration popover (m/ft → pxPerMeter), per-box vendor-banner panel, Saved Plans section (save/load/delete; flushes the debounce before snapshotting) |
| `VendorRoom.tsx` | Parameterized `{width, depth, height}` hall shell (reflector floor 512/256, walls, baseboards, hemi+ambient). Room.tsx deliberately untouched |
| `VendorTables.tsx` | **Instanced**: 6 shared parts (board, merged legs, cloth top, back/side drapes) = one `instancedMesh` each over all tables, plus **one front-drape `instancedMesh` per unique banner** (per-vendor → global → plain cloth fallback). Draw calls = 6 + unique banners — grows with vendors, never with tables. Matrices = table world transform (incl. per-table `sx/sz` stretch, so part offsets ride to the stretched edges) × part local offset, set in `useLayoutEffect` (+ `computeBoundingSphere`) — deps are `[tables, spec]` **on purpose**: a material change makes R3F recreate the mesh via `args`, and the fresh mesh needs its matrices re-set (drapes silently vanish otherwise) |
| `VendorScene.tsx` | Duplicates Scene.tsx’s Canvas props + `onCreated` **verbatim, on purpose** (see gotcha 9-adjacent comment in file). Hall lighting: 1 shadow directional (ortho fit to hall) + ≤6 warm aisle spots + emissive ceiling panels (bloom, zero light cost) = 9 lights total. Spawn = `meta.startPx` when set (clamped into hall, collider-nudged), else south wall. `tableColliders`: AABB for rotationY multiples of π/2, `RotatedBox` otherwise; half-extents follow each table's `sx/sz` stretch |
| `Minimap.tsx` | Plan-image minimap, top-right under the Floor Plan button (`pointerEvents: none` — pointer-lock clicks pass through). `Minimap` (DOM, outside Canvas) + `MinimapTracker` (inside Canvas): `useFrame` writes the marker div's `style.transform` directly via a shared ref — zero React state per frame. u = (worldX + planW/2)·pxPerMeter/imgW (use planToLayout's clamped values); marker rotation = **−yaw** (camera faces (−sin yaw, −cos yaw) in image axes) |
| `tableGeometry.ts` | Extracted cloth recipes (`makeTopGeometry`, `makeDrapeGeometry(width, phase)`, CLOTH_* constants), lazy shared singletons `getTableGeometries()` (incl. back drape phase 3.1 + `mergeGeometries` legs), `getClothMaterial()`, `makeBannerTexture(img)`. Table.tsx consumes these — museum visuals unchanged |
| `sceneCommon.tsx` | `ShadowRefresh` + `LoadingOverlay` shared by both scenes |

### Perf rules for the hall (50–200 tables)

- Never per-table lights or shadow spots — the budget is hemi + ambient + 1 shadow
  directional + ≤6 spots. Visual density comes from emissive panels via bloom.
- All tables share geometry; keep new per-table decoration instanced or it will multiply
  draw calls by table count (reflector renders the scene twice). Per-vendor banners are
  the sanctioned exception: one extra instanced draw per *unique banner* (not per table).

### Collision (GalleryControls)

`Collider = AABB | RotatedBox` ({cx,cz,hx,hz,rotY}). The AABB branch is the original
code verbatim — the museum's lazy defaults flow through it unchanged (push-out still
stops at x=8.57). Rotated boxes: transform the player into the box's local frame
(world→local = rotate by −rotY), run the same axis-of-least-penetration push-out
against ±hx/±hz, transform back.

## Gotchas (hard-won, don't rediscover)

1. **Type-check with `npm run build` (`tsc -b`), not bare `npx tsc --noEmit`** — bare tsc
  ignores the project references and silently passes; `tsc -b` enforces
   `verbatimModuleSyntax` (all type imports must be `import type`).
2. **nipplejs v1.x is a full rewrite**: single-arg event API — `manager.on('move', (evt) =>
  evt.data.vector)`. It does NOT export` JoystickManager`/`EventData`/`JoystickOutputData `types; import`{ create }` and rely on inference.
3. **Raycast under pointer lock**: R3F raycasts from the frozen mouse position when the
  pointer is locked. `Scene.tsx` `onCreated` installs a custom `events.compute` that raycasts
   from screen center (crosshair) when `document.pointerLockElement` is set. Don't remove it.
4. **Three.js dedupe**: `stats-gl` (drei sub-dep) bundles [three@0.170](mailto:three@0.170) → "Multiple instances
  of Three.js" warning. `vite.config.ts` has `resolve.dedupe: ['three']`.
5. **Card click vs touch-drag**: card `onClick` ignores events with `e.delta > 8` px so
  look-drags on mobile don't open the inspect overlay.
6. `**useTexture` doesn't set color space** — CardFrame sets `texture.colorSpace =
  SRGBColorSpace` manually; without it cards look washed out.
7. **OneDrive path**: project lives under OneDrive Desktop; quote paths in shell commands.
8. **drei `PointerLockControls` needs `domElement={gl.domElement}`**: without it, drei binds
  to `events.connected || gl.domElement`. Scene connects R3F events to the canvas's *parent
  div* (deferred `setTimeout` in `onCreated`), while `tryLock` locks the *canvas* — if PLC
  mounts after that timeout (it's inside `<Suspense>`, so it depends on texture load timing),
  it binds to the div, `pointerLockElement === domElement` never matches, and mouse-look
  silently dies while WASD/cursor-hiding still work. Timing-dependent → intermittent per machine.
9. **Room.tsx ↔ GalleryControls.tsx import cycle**: Room imports `isTouchDevice` from
  GalleryControls; GalleryControls imports `ROOM`/`TABLE` from Room. The cycle is benign
  **only while `ROOM` is accessed lazily** (inside functions/hooks). A module-level
  `ROOM.width` in GalleryControls throws “Cannot access 'ROOM' before initialization”
  (TDZ) and React renders an **empty page with zero console errors** — the import fails
  before the error handlers exist. Diagnose with
  `import('/src/App.tsx').catch(e => e.message)` in the browser console. Defaults in
  GalleryControls are lazy functions for exactly this reason.
10. **VendorScene duplicates Scene.tsx’s `<Canvas>` `onCreated` on purpose** — the deferred
  `events.connect`, crosshair `compute`, and context-loss remount are timing-sensitive
  (gotchas 3 & 8). Change one, change both; do not “refactor” them into a shared wrapper
  casually.

## State / where things stand (2026-07-04, branch `floorplanGeneration`)

- Museum flow works: upload → walk → binder / card inspect → persists across refresh.
- Table w/ tablecloth + banner + binder on top shipped; perf pass done for laptop.
- **Vendor View shipped** (commit 6967e65): upload floor plan →
  hybrid detect+edit → generate instanced hall → walk with per-table collision. Verified
  end-to-end on a synthetic plan (14 boxes → 16 tables, correct scale inference, ~120fps,
  9 lights, museum regression clean — old table push-out reproduces exactly at x=8.57).
- `floorplan_example.png` (repo root) is the user’s real example plan — detection tuned
  against it and verified end-to-end (50 boxes → 61 tables, hall ≈ 29×20 m, ~60ms;
  colored decoration / icons / label-split booths all handled; walkable hall renders
  clean). Note IndexedDB is origin-scoped: each dev-server *port* has its own plan slot,
  so the user may still need “Replace image” on their usual port.
- `VendorSetupScreen` now auto-runs detection when a stored plan has no meta (refresh
  mid-detection previously left a dead-end blank screen).
- **Second feature wave shipped** (this branch, all browser-verified end-to-end):
  rotated table boxes (editor rotate handle + rotated layout/collision), calibration-line
  manual scale (m/ft, survives Re-detect), per-vendor banners (per-box upload, grouped
  instanced front drapes), multiple named saved plans (IndexedDB v3 `plans` store,
  self-contained snapshots), and the in-hall minimap with live player marker +
  user-defined start position. DB is now version 3.
- **Proportional table generation shipped** (branch `improveVendorViewGeneration`): boxes
  now spawn a stretch-to-fit rows×cols grid (`boxGrid`) instead of one rigid 6-ft row —
  a square booth spanning two columns gets 2 back-to-back tables, and vendor spacing
  matches the plan (real overlap count on the example plan dropped 18 → 2 pairs, both
  from boxes that overlap on the plan itself). Editor previews the grid with dashed
  lines. Discussed for later: a "stretch one table" display mode and per-show
  user-defined standard table size (calibration already covers scale).
- **Colored-fill detection + 6/8 ft table size shipped** (2026-07-05): `floorplan_two.jpg`
  (repo root) is the user's second real plan — solid orange/teal filled tables that the
  saturation guard previously skipped entirely. Pass C detects them; the follow-up
  guillotine-decomposition pass handles this plan's booth *rings* (tables around a square
  connect into one component at the corners and used to vanish wholesale). Result:
  91 boxes → 103 tables at 8 ft, 98.3% of the plan's colored table pixels covered,
  no logo/decoration false positives, plan-1 regression clean at exactly 50 boxes.
  The 8 ft toggle covers shows that sell 8-ft slots; PlanEditor's grid preview and the
  quick-add default box follow it.
- **Aisle comfort shipped** (2026-07-05): `AISLE_SCALE = 1.2` in planToLayout spreads booth
  positions/hall 20% while tables keep true size (user found aisles cramped). Known deferred
  detection issues on floorplan_two: logos sitting mid-run split/block boxes; occasional
  rects bleeding into neighbors at ring corners — user OK'd deferring, editor fixes suffice.
- Candidate next steps (discussed, not built): editor undo / zoom / multi-select;
  export/import saved plans as files; booth labels on tables; walk-in entrance/doors on
  the hall; bundle code-splitting (~1.4MB); card metadata in inspect view; deploy setup
  (any static host).
- Museum-side known gaps: east/west walls unused by card layout (overflow silently
  dropped); pre-downscale images in old IndexedDBs stay full-res until re-uploaded.

