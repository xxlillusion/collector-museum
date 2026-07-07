# Vendor Museum — Handoff / Project Guide

A first-person 3D virtual museum for a personal Pokemon card collection. Users upload card
images (drag & drop), then walk a realistic gallery room where the cards hang as framed,
spotlit art. No backend — everything persists in the browser via IndexedDB, deployable as a
static site.

Two experiences, switched from the upload screen:
1. **Museum** — the original card gallery. A collection picker on the home screen swaps the
   walls between the user's cards and any vendor's inventory.
2. **Convention View** (formerly "Vendor View") — upload a convention floor plan image,
   review auto-detected table boxes in a 2D editor, assign vendors to booths, press
   Generate, and walk a 3D convention hall where each box becomes one or more 6-ft
   tablecloth tables with vendor banners and browsable inventory binders (see
   “Convention View” and “Vendors” sections below).

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

Five top-level views, switched in `src/App.tsx` (plain state union, no router):

```
HomeScreen (DOM) ←→ Scene (museum, R3F Canvas + DOM overlays)
        ↕
VendorsScreen (DOM: vendor registry — profile / inventory / shows)
        ↕
VendorSetupScreen (DOM: upload / detect / edit / assign) ←→ VendorScene (hall, R3F Canvas)
```

`type View = 'home' | 'gallery' | 'vendorSetup' | 'vendorWalk' | 'vendors'` — `vendorWalk`
guards on `planMeta` existing and falls back to setup. DOM screens are their own scroll
containers (`height: 100vh; overflow-y: auto`) because `html/body/#root` keep
`overflow: hidden` for the fullscreen canvases.

### Data flow

`src/lib/db.ts` — IndexedDB (`vendor-museum` db, v4). Stores:
- `cards` (v1): `{ id, name, imageBlob, addedAt }` → `src/lib/useCards.ts` hook (object URL
  per blob, revoked/recreated on each reload).
- `settings` (v2): single-slot `{ key, blob }` records — `tableclothBanner` (→ `useBanner.ts`),
  `vendorFloorPlan` (downscaled plan image) and `vendorPlanMeta` (JSON-as-Blob;
  → `useVendorPlan.ts`). JSON-in-a-Blob means new settings need **no schema bump**.
  `vendorBanner:<id>` slots are **legacy** (pre-vendor-entity per-box banners) — still
  restored/rendered for old saved plans, but no new ones are created.
- `plans` (v3): `SavedPlanRecord` snapshots (+ optional `showDate`, ISO yyyy-mm-dd — feeds
  derived "shows attended"; new saves write `banners: []`).
- `vendors` (v4): `VendorRecord { id, name, createdAt, updatedAt, bannerBlob?, manualShows }`.
- `inventory` (v4): `InventoryItemRecord { id, vendorId (indexed), imageBlob, caption,
  visible, aspect, addedAt }` — separate store so vendor lists never deserialize image
  blobs; `aspect` computed once at upload; `visible` is stored-but-inert (future public
  profiles / accounts).

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
| `InspectOverlay.tsx`  | Full-screen card view (+ optional `caption` line — vendor inventory captions); any click (or Esc) closes it, and Scene then re-locks the pointer (best-effort — Chrome has a ~1s cooldown after exiting pointer lock, so it falls back to click-canvas-to-lock)          |
| `HomeScreen.tsx`      | Museum-styled home (“Museum Refined” design, replaced the old UploadScreen 2026-07): card upload dropzone, framed collection grid with delete, tablecloth banner slot, saved-plan list with “Walk →” (loads snapshot via `onWalkPlan` then jumps straight to `vendorWalk`), “ON THE WALLS” collection picker (own cards vs any vendor with inventory → drives what `Scene` hangs), Enter Gallery / Walk a Card Show / Vendor Registry CTAs |
| `Binder.tsx`          | The 3×3-pocket flip binder (18 cards per double-sided sheet). Parameterized for reuse: optional `restPose` (default = museum `BINDER_REST`), `lazySheetWindow` (only sheets within ±window of the current spread carry card textures — hall passes 1, museum omits → unchanged) and `fillLight` (false = host scene owns the fill light; see gotcha 11). Sleeve textures come from `lib/sleeveTextures.ts`, not `useTexture`; pocket geometries/materials are module-level singletons shared by every pocket (per-pocket allocation used to stall the open animation). Only the **top sheet of each stack** renders its card content (+ the sheet in flight and the pages it reveals/covers, toggled per frame via face-group refs) — resting sheets sit ~x·FAN apart, less than the pocket content stack near the spine, so buried cards physically poked through the page above (seen as previous-page cards leaking into the spine-side column of the last page). Exports `COVER_W/H/T` for the hall's instanced shells, `CARDS_PER_SHEET` for prefetch, and `BinderMaterialWarmup` (five 1 mm never-culled triangles that pull the sheet/pocket shader programs through compile at scene load instead of first open)                                                                    |


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

## Vendors (first-class entity, db v4, 2026-07-06)

A vendor owns a name, an optional banner image, captioned inventory images and derived
"shows attended". Managed in `VendorsScreen.tsx` (HomeScreen → "Vendor Registry"):
vendor list + selected profile (rename on blur, banner slot, inventory grid with
debounced caption inputs + inert "Public (future)" checkbox, shows list with manual
add/remove).

- **Assignment**: `VendorRect.vendorId` (set in the setup screen's per-box panel,
  dropdown + quick-create; assigning clears legacy `bannerId`). Same vendor may hold
  multiple boxes. Resolved live — deleting a vendor leaves dangling ids that render as
  unassigned.
- **Shows attended are derived, never stored** (`lib/vendorShows.ts::deriveShowsAttended`):
  manual entries ∪ saved plans where the vendor is assigned to ≥1 rect AND
  `SavedPlanRecord.showDate` (optional, set in the save dialog) is past. Unassigning or
  re-dating self-corrects.
- **Hooks**: `useVendors` (summaries only: banner object URL + `countInventory` per
  vendor — never inventory blobs), `useVendorInventory(vendorId | null)` (lazy, per-vendor
  object URLs, revoked on switch/unmount; used by the registry, the museum picker and the
  open hall binder).
- **Hall rendering**: assigned tables' front drape = vendor banner, else the vendor name
  lettered on cloth (`makeNameTexture`); grouping stays one instanced draw per unique
  texture. Booths with inventory get **binders** (`VendorHallBinders.tsx`): 90 items per
  binder (10 faces × 9), binder *i* on booth table *i* (emission order), extras side by
  side on the last table, duplicated at each of the vendor's booths. Closed binders =
  **2 instanced draws total** (merged leather shells + ring packs), zero textures. F (or
  click/tap) opens: the instance collapses to scale 0 and the real `Binder` mounts in its
  place with the inventory slice (`lazySheetWindow=1` — textures only near the open
  spread), full flip/inspect/caption flow, then unmounts on close.
- **Museum**: HomeScreen picker feeds a vendor's inventory into `Scene` as `CardWithUrl[]`
  (aspect stored on the record); captions surface in `InspectOverlay`.

## Convention View (floor plan → walkable convention hall)

(Renamed from "Vendor View" 2026-07-06 — user-facing strings say Convention View; internal
`vendor*` file/identifier names kept to avoid churn.)

Flow: HomeScreen “Walk a Card Show” button → `VendorSetupScreen` (drop plan image →
auto-detect → `PlanEditor` fix-up → assign vendors → Generate) → `VendorScene`
(first-person hall). Plan image + edited boxes persist in the `settings` store; a saved
plan skips straight to the editor on return. HomeScreen’s saved-plan “Walk →” shortcut
bypasses the editor: it loads the snapshot into the working slots and goes directly to
`vendorWalk`.

### Files

| File | Role |
| ---- | ---- |
| `lib/vendorPlan.ts` | Data model (`VendorRect` in stored-image px — optional `rotationDeg` (SVG rotate() convention, clockwise about center) and `bannerId`; `VendorPlanMeta` — optional `pxPerMeterSource: 'inferred'\|'manual'` and `startPx`) + pure math: `planToLayout(meta)` → hall dims + `TablePlacement[]` + the **clamped** `pxPerMeter/planW/planD` it used (minimap/spawn mapping basis). px→m via `pxPerMeter`; image y-down → world +Z; image rotate(d) ⇒ world rotationY −d·π/180 (sin sign flips, cos agrees). Hall = plan extent + 2m margin, height 6, axes clamped to 8–80m. **`AISLE_SCALE = 1.2`**: booth *positions* and hall extents spread ×1.2 while box footprints (→ table sizes) keep the true scale — wider aisles without inflating tables; the returned `pxPerMeter/planW/planD` already include the spread so minimap/spawn mapping stay consistent. Show-standard table size: `VendorPlanMeta.tableLengthFt?: 6\|8` + `standardTableW(ft)` (absent = 6 ft). A box spawns a **rows × cols grid** via `boxGrid(long, short, tableW)`: `cols = round(long/tableW)`, `rows = round(short/0.76)` (min 1 each), each table stretched (`TablePlacement.sx/sz`; `sx` normalized to the 1.83 m geometry, clamp window scaled by `tableW/1.83` — an exact 8 ft slot = one table at sx ≈ 1.33) so the grid spans the box footprint exactly — generated proportions match the plan. Single-row fronts face the hall centerline (center is rotation-invariant); multi-row booths face back-to-back outward from the booth center (exact middle row falls back to the centerline heuristic) |
| `lib/planDetect.ts` | Dependency-free detection: downsample ≤1000px → luma → Otsu (saturated mid/bright pixels count as background so colored decoration ≠ tables; dark colored fills still detect) → Pass A (flood-fill light mask from borders; remaining enclosed light components = outlined tables, then `mergeSplitFragments` re-joins boxes that label digits touching the outline split apart — merge gated on the gap band NOT containing a near-solid dark line, which distinguishes text gaps from shared booth walls) + Pass B (dark connected components = filled tables) + **Pass C (saturated colored fills)**: the sat pixels the Otsu guard excluded are grouped into 24-bin hue families (adjacent above-threshold bins merge; family mask includes ±1 bin for JPEG hue jitter). Per family: directly-accepted comps (generic filters OR the thin-run exception — fill ≥0.75, short ≤0.08·maxDim, any aspect, long ≤0.9·maxDim — for whole booth-ring sides) + **guillotine decomposition** of rejected comps (booth rings/L-corners connect into one mostly-empty component; `decomposeComponent` cuts along interior <30%-coverage row/col bands recursively into solid strips). Decomposed pieces only count when their short side is 0.6–1.7× the family's modal short side from ≥2 direct accepts (the ruler that stops decomposed logo art/colored bands minting fake tables), and a family needs **≥3 total candidates** — tables repeat, decoration doesn't → bbox filters (min side, ≤40% of image, fill ratio ≥0.7, aspect ≤14) → IoU merge (A wins, then B, then C) → containment prune → physical size floor (long ≥0.5m, short ≥0.2m — kills icons/figures). `inferScale(rects, imgW, tableW)`: modal short side of table-aspect boxes / 0.76m, cross-checked vs long side / tableW (aspect window scales with the standard). `detectTables(blob, tableW?)`. Main thread is fine at this size |
| `lib/useVendorPlan.ts` | `useBanner`-style hook: `{ planUrl, planMeta, setPlan, saveMeta, clearPlan, loading, reload }`; new image clears stale rects |
| `lib/useVendorBanners.ts` | **Legacy** per-box banner blobs (settings slots `vendorBanner:<id>`) → `Map<id, objectURL>`. No upload UI anymore (vendor entities own banners now); kept so old saved plans still render their banners. Wiped on plan replace/clear; the old sweep-delete is gone |
| `lib/useSavedPlans.ts` | Named plan snapshots (`plans` store, db v3): plan image blob + metaJson (+ optional `showDate`). `saveCurrentPlan(name, showDate?)` writes `banners: []` — vendors resolve live; legacy records with bundled banners still restore on load. Save = working→snapshot; Load = snapshot→working slots (raw `putFloorPlanBlob`, no re-downscale), then App reloads useVendorPlan + useVendorBanners |
| `lib/useVendors.ts` | Vendor summaries (`VendorSummary`: banner URL + inventoryCount + manualShows) + CRUD incl. `addManualShow/removeManualShow`; `lib/useVendorInventory.ts` — lazy per-vendor items with URLs; `lib/vendorShows.ts` — `deriveShowsAttended` (see Vendors section) |
| `lib/sleeveTextures.ts` | Shared binder sleeve texture cache (museum + hall): decodes card/inventory **blobs** via `createImageBitmap` (off main thread, `imageOrientation:'flipY'` + `texture.flipY=false`, resized to a 512px cap — pockets are small; InspectOverlay still uses the full-res object URL), keyed by item id (images are immutable per id). Entries are **refcounted** by mounted `SleeveCard`s (`acquireSleeveTexture`/release); LRU eviction past 120 entries only touches unpinned entries, so an open binder can't lose a displayed texture. `prefetchSleeveTexture` warms without pinning. Uploaded via `gl.initTexture` off the render path |
| `PlanEditor.tsx` | `<img>` + SVG overlay, `viewBox` = stored-image px (browser scales; zero resize math). Modes: select / add / calibrate / setStart. Select/move/resize (corner handles)/delete (✕ or Backspace)/**rotate** (handle above the box, 15° snap, Shift = free; whole `<g>` gets `transform=rotate(deg cx cy)` so handles ride along; resize runs in the rect's local frame then re-anchors the fixed corner in world space), “Add table” draw mode, calibration line drag (→ `onCalibrateLine(px)`), start-marker click (→ `onStartChange`), `onSelectionChange` feeds the vendor-assignment panel. Live subdivision preview: dashed grid lines per box from the shared `boxGrid` (pointerEvents none), label shows `R×C · N tables` + the assigned vendor's name (gold italic, via `vendorNames` map prop). Pointer capture guarded in try/catch. Controlled; parent debounce-persists (500ms) |
| `VendorSetupScreen.tsx` | Upload/detect/edit wrapper; scale readout (“hall ≈ W×D m · N boxes → M tables”, “· calibrated” when manual), **table-size toggle (6 ft / 8 ft)** in the readout row — updates `meta.tableLengthFt` and re-derives an *inferred* scale from the current rects via `inferScale` (manual calibration never touched); Re-detect (**preserves manual scale + table size**), Replace image, calibration popover (m/ft → pxPerMeter), per-box **vendor-assignment panel** (dropdown of vendors + quick-create-and-assign + unassign; replaced the old banner-upload panel), Saved Plans section (save with optional show date /load/delete; flushes the debounce before snapshotting) |
| `VendorRoom.tsx` | Parameterized `{width, depth, height}` hall shell (reflector floor 512/256, walls, baseboards, hemi+ambient). Room.tsx deliberately untouched |
| `VendorTables.tsx` | **Instanced**: 6 shared parts (board, merged legs, cloth top, back/side drapes) = one `instancedMesh` each over all tables, plus **one front-drape `instancedMesh` per unique texture group**. Group key chain: vendor banner (`vb:<id>`) → vendor name-on-cloth (`vn:<id>`, `makeNameTexture`) → legacy `bannerId` URL → global banner → plain cloth. Draw calls grow with unique vendors, never with tables. Matrices = table world transform (incl. per-table `sx/sz` stretch, so part offsets ride to the stretched edges) × part local offset, set in `useLayoutEffect` (+ `computeBoundingSphere`) — deps are `[tables, spec]` **on purpose**: a material change makes R3F recreate the mesh via `args`, and the fresh mesh needs its matrices re-set (drapes silently vanish otherwise) |
| `VendorHallBinders.tsx` | Inventory binders on assigned tables (see Vendors section): `computeBinderPoses` (booth grouping by `rectId`, overflow spread, museum lie-flat pose re-based per table yaw), 2 instanced shell draws, proximity `useFrame` scan → HUD F-prompt, open = hide instance + mount `Binder` (own `Suspense` so texture mounts never suspend the hall, `fillLight={false}`). The prompt (and shell hover) **prefetches** the binder's first-spread sleeve textures (IDB read + `prefetchSleeveTexture`), so cards are usually decoded before F is pressed. Mounts a permanent intensity-0 `pointLight` (tucked in front of the camera + 0.35 while a binder is open — the light Binder would otherwise own) and a `BinderMaterialWarmup`, both so the first open never changes light count / compiles shaders (gotcha 11) |
| `VendorScene.tsx` | Duplicates Scene.tsx’s Canvas props + `onCreated` **verbatim, on purpose** (see gotcha 9-adjacent comment in file). Hall lighting: 1 shadow directional (ortho fit to hall) + ≤6 warm aisle spots + emissive ceiling panels (bloom, zero light cost) = 9 lights total. Spawn = `meta.startPx` when set (clamped into hall, collider-nudged), else south wall. `tableColliders`: AABB for rotationY multiples of π/2, `RotatedBox` otherwise; half-extents follow each table's `sx/sz` stretch. Owns binder open/prompt state (freezes controls, hides minimap while open) + `InspectOverlay` with captions |
| `Minimap.tsx` | Plan-image minimap, top-right under the Floor Plan button (`pointerEvents: none` — pointer-lock clicks pass through). `Minimap` (DOM, outside Canvas) + `MinimapTracker` (inside Canvas): `useFrame` writes the marker div's `style.transform` directly via a shared ref — zero React state per frame. u = (worldX + planW/2)·pxPerMeter/imgW (use planToLayout's clamped values); marker rotation = **−yaw** (camera faces (−sin yaw, −cos yaw) in image axes) |
| `tableGeometry.ts` | Extracted cloth recipes (`makeTopGeometry`, `makeDrapeGeometry(width, phase)`, CLOTH_* constants), lazy shared singletons `getTableGeometries()` (incl. back drape phase 3.1 + `mergeGeometries` legs), `getClothMaterial()`, `makeBannerTexture(img)`, `makeNameTexture(name)` (canvas fillText — vendor name in cream-gold serif on cloth, same dims as the banner canvas so both drape identically). Table.tsx consumes these — museum visuals unchanged |
| `sceneCommon.tsx` | `ShadowRefresh` + `LoadingOverlay` shared by both scenes |

### Perf rules for the hall (50–200 tables)

- Never per-table lights or shadow spots — the budget is hemi + ambient + 1 shadow
  directional + ≤6 spots. Visual density comes from emissive panels via bloom.
- All tables share geometry; keep new per-table decoration instanced or it will multiply
  draw calls by table count (reflector renders the scene twice). Per-vendor front drapes
  are the sanctioned exception: one extra instanced draw per *unique vendor texture*
  (not per table).
- Closed binders are exactly 2 instanced draws (shells + rings), zero textures. Only the
  one open binder mounts card textures, and only near its current spread
  (`lazySheetWindow=1`). Never mount per-table React binder components.

### Collision (GalleryControls)

`Collider = AABB | RotatedBox` ({cx,cz,hx,hz,rotY}). The AABB branch is the original
code verbatim — the museum's lazy defaults flow through it unchanged (push-out still
stops at x=8.57). Rotated boxes: transform the player into the box's local frame
(world→local = rotate by −rotY), run the same axis-of-least-penetration push-out
against ±hx/±hz, transform back.

## Platform groundwork (Phase 0, 2026-07-06, branch `platform-phase0`)

The app is evolving into a multi-user platform (public shows, vendor/collector/organizer
accounts, Supabase backend) per the approved roadmap
(`~/.claude/plans/direction-take-a-streamed-river.md`). Phase 0 landed the shared seams;
three parallel workstreams build on them. **Frozen files** (streams code against, never
edit): `src/lib/provider/types.ts`, `src/routes.tsx`, `src/lib/db.ts` record types.

- **Provider seam** (`src/lib/provider/`): `DataProvider` interface mirrors db.ts 1:1;
  `local.ts` = guest IndexedDB, `remote.ts` = Supabase stub (accounts stream fills it in —
  images are **downloaded to Blobs** so hooks/sleeve textures stay backend-agnostic).
  Floor-plan **working-slot methods delegate to local even in remote** (drafting is
  local; a future Publish snapshots up). All hooks consume `useProvider()`; return
  shapes unchanged. `root.tsx` picks the provider from the auth session and remounts the
  data subtree via `key` on identity change (never hot-swap provider state). Legacy
  `vendorBanner:*` slots stay direct-db in `useVendorBanners`/`useSavedPlans` on purpose.
- **Context does NOT cross the R3F Canvas root** — hall inventory reads are the
  `fetchInventory` prop (App → VendorScene → VendorHallBinders; feeds both the prompt
  prefetch and the open binder). Re-detect reads the plan via
  `useVendorPlan().getPlanBlob` → prop.
- **Routing** (`wouter`): `src/routes.tsx` is the frozen route table; every future
  screen is pre-stubbed lazy under `src/screens/` (auth/* = accounts stream, vendor/* =
  vendor portal, shows/* + organizer/* = shows stream; `PageShell` is shared chrome).
  Default route = App's original view union; canvases stay outside route transitions.
- **Code splitting**: Scene / VendorScene / VendorSetupScreen are `React.lazy` — entry
  chunk 341 kB (98 kB gz); the ~1.07 MB three.js bundle loads only for 3D views. Don't
  add eager imports from screens into anything that pulls three.
- **Supabase**: `supabase/migrations/0001_init.sql` (profiles + auto-create trigger,
  vendors, inventory_items, shows, booths — rect jsonb + vendor FK —, collections; RLS
  everywhere; buckets banners/inventory/plans public + cards private) + `0002` (storage
  policies rewritten subquery-free). `src/lib/supabase.ts` is env-guarded:
  **no `VITE_SUPABASE_*` in `.env.local` = guest-only mode, auth UI hidden, no Supabase
  project needed for local dev**. `src/lib/auth.tsx` = AuthContext (session restore,
  sign in/up/out).
- **Storage gotchas (hard-won, live-verified 2026-07-06)**: (1) storage.objects
  policies that subquery public tables (vendors/shows ownership) are NOT reliably
  evaluated by the storage service — legitimate owners get 403 on upload while the
  identical subquery passes as a table policy. Every object path therefore starts with
  the OWNER's uid and write policies are plain
  `(storage.foldername(name))[1] = auth.uid()::text` prefix checks; readers use the
  stored `*_path` columns, never reconstructed paths. (2) `upsert: true` on
  `storage.upload()` 403s on buckets without a SELECT policy even for new objects —
  `uploadImage` never sends upsert; overwrites are always removeImage-then-uploadImage
  (`replaceImage`). (3) Blind `storage.download()` of a maybe-missing object logs a 400
  console error — existence-check first (see remote.ts getBanner).

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
11. **Never mount/unmount a light at runtime** (or toggle `light.visible`) — changing the
  scene's light count makes three.js recompile **every** material in the scene. The binder's
  conditional `{open && <pointLight/>}` fill light froze the hall for ~3s on first open
  (reflector + cloth + drape shaders all recompiled; reopen was fine because programs
  cache). Keep lights permanently mounted and animate `intensity` (0 = off) instead —
  that's why Binder's fill light and the hall's binder light always exist.

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
- **Vendor entities shipped** (2026-07-06, browser-verified end-to-end): db v4 (`vendors`
  + `inventory` stores), Vendors Registry screen (create/rename/delete, banner, captioned
  inventory with inert `visible` flag, manual shows), booth assignment in the editor
  (dropdown + quick-create, vendor name on the 2D box), derived shows-attended
  (manual ∪ past-dated saved plans where assigned — `showDate` is new on SavedPlanRecord),
  vendor banner / name-on-cloth front drapes (still one instanced draw per unique
  texture), browsable inventory binders in the hall (90 items each, spread across booth
  tables, 2 instanced draws closed, lazy textures open), museum collection picker
  ("ON THE WALLS": own cards vs vendor inventory) and captions in InspectOverlay.
  "Vendor View" renamed to "Convention View" in user-facing strings only. Verified:
  v3→v4 upgrade with live data, full registry flow, assignment + save-with-past-date →
  shows derivation for two vendors, hall with 103 tables (12 draw-call texture groups,
  zero console errors), F-open binder → flip → inspect-with-caption → close → shell
  restored, museum walls with 12 vendor items, My-Collection + legacy-plan regressions.
  Design decision: accounts/backend expected later — records are self-contained with
  stable UUIDs, `visible` is future-proofing, nothing else anticipates sync.
- **Binder perf + last-page fix shipped** (2026-07-06, browser-verified in hall + museum):
  user reported laggy open animation, 3–5s grey sleeves, and previous-page cards leaking
  into the last page's spine-side column. Fixes: `lib/sleeveTextures.ts` (512px ImageBitmap
  cache, prefetch at prompt/hover), shared pocket geometry/materials, always-mounted fill
  lights + `BinderMaterialWarmup` (gotcha 11 — first open recompiled every hall shader),
  and top-of-stack-only card faces (the leak was physical poke-through at x·FAN gaps).
  Measured headless: first-open max frame gap 3212ms → 392ms (SwiftShader), warm reopen
  fully drawn at +700ms, last page clean in both scenes. A `.claude/skills/verify` skill
  now records the headless drive recipe (minimap-based navigation etc.).
- **Platform Phase 0 shipped** (2026-07-06, branch `platform-phase0`, headless-verified
  M0 PASS: home, route stubs, card upload, gallery walk, vendor+inventory, plan
  detect/assign/save, hall walk, F-open binder through the new fetchInventory prop with
  textures confirmed, close/shell-restore, saved-plan Walk→ — zero console errors):
  provider seam + wouter routes + lazy 3D chunks + Supabase schema/auth plumbing (see
  "Platform groundwork" section). Next: three parallel streams — (A) accounts/collector:
  fills `provider/remote.ts` + `screens/auth/*` + import wizard; (B) vendor portal:
  `VendorsScreen`, `useVendors`/`useVendorInventory`, `screens/vendor/*`; (C) shows:
  `VendorSetupScreen` publish, `screens/shows/*` + `organizer/*`, seed script. Going
  live needs a Supabase project + `.env.local`; guest mode works without one.
- **All three streams shipped + LIVE-verified** (2026-07-07, merged on `platform-phase0`,
  17/17 guest regression + 17/17 live E2E, zero console errors, against the user's real
  Supabase project — email provider ON, confirm-email OFF): guest seed → signup (instant
  session) → cloud card add persists across reload → import wizard round-trips 2 cards +
  1 vendor + 3 items → cloud vendor in registry with public-page link → booth assignment
  → Publish to Card Shows → sign out → anonymous /shows lists it → /show/:id detail →
  3D walk from remote data (canvas + minimap) → F-open binder shows the vendor's cloud
  inventory → anonymous /vendor/:id renders visible inventory + "Appearing at". A demo
  "Live Smoke Show" + "Live Vendor" (test account jason.a.dale2+live2917@gmail.com)
  remain in the project as browsable seed data.
- Candidate next steps (discussed, not built): editor undo / zoom / multi-select;
  export/import saved plans as files; booth labels on tables; walk-in entrance/doors on
  the hall; bundle code-splitting (~1.4MB); card metadata in inspect view; deploy setup
  (any static host).
- Museum-side known gaps: east/west walls unused by card layout (overflow silently
  dropped); pre-downscale images in old IndexedDBs stay full-res until re-uploaded.

