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

Five top-level views, switched inside `MuseumApp` in `src/App.tsx` (plain state union):

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

**App hosts (2026-07-07 restructure)**: `App` (default route) renders `LandingScreen`
for logged-out visitors on a configured deployment (museum-styled landing: explore
shows / vendor directory / sign in / sandbox link — NO local-collection sections), and
`MuseumApp` otherwise (signed-in users; also guest-only deployments with no Supabase
env). `SandboxApp` (route `/sandbox`) is the no-account experience: `MuseumApp` wrapped
in a forced-local `DataProviderBoundary` (identity `"sandbox"`), so a signed-in user's
sandbox visit never touches cloud data. HomeScreen takes `sandbox` (local-only banner,
back-to-main link, no auth corner), `showRegistry` (Vendor Registry + Build a Show CTAs
— **sandbox/guest-only surfaces**, `!configured`; signed-in configured accounts get a
MY STORES → `/account?tab=stores` tile instead) and `showOrganizer` (Organizer Tools
CTA) — organizer gating comes from `useMyProfile()` (`src/lib/useMyProfile.ts`).

**Museum style kit** (`src/components/museumKit.tsx`): the "Museum Refined" colors
(GOLD/BG/PANEL/HAIRLINE/TEXT/MUTED), SERIF/SANS, PAGE_BG, `Ornament`/`Section`/
`QuickAction`, button/input/panel/note styles and `museumHoverCss`. ALL DOM pages
(PageShell chrome, auth, shows, organizer, vendor directory/pages, VendorsScreen,
HomeScreen, LandingScreen) consume it — never re-declare these colors per screen.

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
  visible, aspect, addedAt, price?, status?, condition? }` — separate store so vendor
  lists never deserialize image blobs; `aspect` computed once at upload; `visible` gates
  public profiles/binders; `price / status ('forSale'|'sold'|'display') / condition` are
  the 0005 sale metadata (optional keys — pre-0005 records read as forSale/unpriced).

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
| `InspectOverlay.tsx`  | Full-screen card view (+ optional `caption` line and `sale` placard — price gold / struck-through when sold, condition, SOLD / display-only tags; `InspectSale` type exported, threaded as url-keyed maps: App/VendorMuseum → Scene `sales`, VendorHallBinders `saleByUrl` → VendorScene). Any click (or Esc) closes it, and Scene then re-locks the pointer (best-effort — Chrome has a ~1s cooldown after exiting pointer lock, so it falls back to click-canvas-to-lock)          |
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
"shows attended". The banner / shows-attended / inventory management UI lives in the
shared `VendorManagementPanel.tsx` (2026-07-09 unification wave), consumed by two hosts:
`VendorsScreen.tsx` — the **sandbox/guest-only** Vendor Registry (vendor list + ADD,
rename on blur, delete) — and the signed-in `/account?tab=stores` tab (`MyStoresTab`,
one panel per store).

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
| `PlanWorkbench.tsx` | **The plan-editing machinery, extracted from VendorSetupScreen (Wave 2)** so the organizer show editor reuses it: `meta` mirror + debounce (500ms rect persist), `runDetection` + auto-detect effect, dropzone, calibration popover (m/ft → pxPerMeter), table-size toggle (6 ft / 8 ft — updates `meta.tableLengthFt`, re-derives *inferred* scale via `inferScale`, manual calibration never touched), Re-detect (**preserves manual scale + table size**), Replace image, start marker, `PlanEditor` mount, per-box **vendor-assignment panel** (dropdown + quick-create-and-assign + unassign), scale readout (“Hall ≈ W×D m · N boxes → M tables”). Props = the 8 plan/vendor props VendorSetupScreen always took, plus `actions` render-prop (host buttons in the actions row), `onStateChange` (`{hasMeta, detecting, totalTables}` for host chrome gating) and a ref exposing `flushPendingMeta()` (flush debounce → current meta; called before save/publish/generate) |
| `VendorSetupScreen.tsx` | Now the thin **guest sandbox** host: header + persistent local-only banner (“Shows built here are local to this browser…”), `<PlanWorkbench/>` with GENERATE passed through `actions`, Saved Plans section (save with optional show date /load/delete; flushes via the workbench ref before snapshotting). The Publish-to-Card-Shows dialog moved to `screens/organizer/ShowEditorScreen` (Wave 2). External prop contract unchanged — App.tsx untouched |
| `VendorRoom.tsx` | Parameterized `{width, depth, height}` hall shell (reflector floor 512/256, walls, baseboards, hemi+ambient). Room.tsx deliberately untouched |
| `VendorTables.tsx` | **Instanced**: 6 shared parts (board, merged legs, cloth top, back/side drapes) = one `instancedMesh` each over all tables, plus **one front-drape `instancedMesh` per unique texture group**. Group key chain: vendor banner (`vb:<id>`) → vendor name-on-cloth (`vn:<id>`, `makeNameTexture`) → legacy `bannerId` URL → global banner → plain cloth. Draw calls grow with unique vendors, never with tables. Matrices = table world transform (incl. per-table `sx/sz` stretch, so part offsets ride to the stretched edges) × part local offset, set in `useLayoutEffect` (+ `computeBoundingSphere`) — deps are `[tables, spec]` **on purpose**: a material change makes R3F recreate the mesh via `args`, and the fresh mesh needs its matrices re-set (drapes silently vanish otherwise) |
| `VendorHallBinders.tsx` | Inventory binders on assigned tables (see Vendors section): `computeBinderPoses` (booth grouping by `rectId`, overflow spread, museum lie-flat pose re-based per table yaw), 2 instanced shell draws, proximity `useFrame` scan → HUD F-prompt, open = hide instance + mount `Binder` (own `Suspense` so texture mounts never suspend the hall, `fillLight={false}`). The prompt (and shell hover) **prefetches** the binder's first-spread sleeve textures (IDB read + `prefetchSleeveTexture`), so cards are usually decoded before F is pressed. Mounts a permanent intensity-0 `pointLight` (tucked in front of the camera + 0.35 while a binder is open — the light Binder would otherwise own) and a `BinderMaterialWarmup`, both so the first open never changes light count / compiles shaders (gotcha 11) |
| `VendorScene.tsx` | Duplicates Scene.tsx’s Canvas props + `onCreated` **verbatim, on purpose** (see gotcha 9-adjacent comment in file). Hall lighting: 1 shadow directional (ortho fit to hall) + ≤6 warm aisle spots + emissive ceiling panels (bloom, zero light cost) = 9 lights total. Spawn = `meta.startPx` when set (clamped into hall, collider-nudged), else south wall. `tableColliders`: AABB for rotationY multiples of π/2, `RotatedBox` otherwise; half-extents follow each table's `sx/sz` stretch. Owns binder open/prompt state (freezes controls, hides minimap while open) + `InspectOverlay` with captions |
| `Minimap.tsx` | Plan-image minimap, top-right under the Floor Plan button (`pointerEvents: none` — pointer-lock clicks pass through). `Minimap` (DOM, outside Canvas) + `MinimapTracker` (inside Canvas): `useFrame` writes the marker div's `style.transform` directly via a shared ref — zero React state per frame. u = (worldX + planW/2)·pxPerMeter/imgW (use planToLayout's clamped values); marker rotation = **−yaw** (camera faces (−sin yaw, −cos yaw) in image axes). Optional `boothMarkers` (assigned rect centers in plan-image UV — pure image space, no world mapping) render as gold dots; `highlightVendorId`/`highlightName` make that vendor's dots glow + pulse with a name label |
| `HallDirectory.tsx` | In-hall vendor directory overlay (DOM, museum-dark styling). VendorScene owns the state: **M** or the HUD "☰ Vendors" button opens it via the binder-open pattern (exit pointer lock, `frozen` controls, binder scan `suspended`); Esc / ✕ / canvas click closes and relocks. Rows = vendors with ≥1 assigned booth (booth + item counts); selecting one sets `highlightVendorId` → their booth dots glow on the minimap, which stays visible while the panel is up |
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
three parallel workstreams build on them. **Stable seams** (frozen during the Phase-0
parallel streams, additive-only changes since — never reshape existing signatures):
`src/lib/provider/types.ts`, `src/routes.tsx`, `src/lib/db.ts` record types.

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
- **Platform Wave 2 shipped** (2026-07-07, branch `platform-wave2`; Phase-0 scaffolding +
  3 parallel worktree streams; merged build green; 22/22 headless guest regression incl.
  the PlanWorkbench sandbox flow, zero console errors):
  - **Migration `0003_accounts_locations.sql`** — applied to the live project
    2026-07-07 (user, via dashboard SQL editor) and live-verified: 30/30 E2E —
    vendor signup (trigger created the canonical vendor from metadata) → account
    location/organizer/vendor settings → cloud inventory → create show at a location →
    anon browse-by-state → walk → vendor directory/page/**vendor museum** → collector
    signup → cloud cards → public collection → anon collector page/**collector museum**
    → change-password + re-login round trip → reset-email send. Live seed data:
    show "Wave2 Live Show" (f5d11599), vendor "Wave2 Live Vendor" (159d0c42, account
    jason.a.dale2+w2v1783412552@gmail.com), collector "Wave2 Collector" (114e1767).
    Adds: `profiles.account_type ('collector'|'vendor') + is_organizer +
    country/state/city/bio/collection_public` (legacy `role` kept, deprecated);
    `vendors.profile_id (unique → canonical vendor of a vendor account) +
    country/state/area_served/inventory_public`; `shows.country/state/city`; signup
    trigger creates the canonical vendor row for vendor-type signups; shows insert/update
    RLS requires `is_organizer`; collections readable when `collection_public`; inventory
    select composes `visible AND vendor.inventory_public`; **cards bucket → public-read**
    (paths unguessable; discovery gated by table RLS — storage policies can't subquery).
  - **Auth**: signup picks Collector/Vendor (+ display name, via signup metadata);
    login has forgot-password (`resetPasswordForEmail` → `/reset-password`, which handles
    the `PASSWORD_RECOVERY` session); Account page gained location/bio, change-password,
    organizer toggle, my-vendor-table settings (location, area served, inventory-public),
    collection-public toggle, and one-way Become-a-Vendor. `lib/profileService.ts` owns
    profile + canonical-vendor ops (outside the DataProvider seam, like showService).
  - **Convention View restructure**: HomeScreen “EXPLORE CARD SHOWS →” → `/shows`
    (country/state filter, server-side `.eq`); the local editor stays as “BUILD A SHOW
    (LOCAL SANDBOX) →” with a persistent local-only banner and **no Publish dialog**.
    Organizers create/edit shows at `/organizer/show/new` + `/organizer/show/:id/edit`
    (`ShowEditorScreen`: isOrganizer gate, name/date/location form, lazy `PlanWorkbench`,
    vendors = `listRegisteredVendors()` ∪ own placeholders; edit seeds the local working
    slots from the cloud show via the `loadPlan` pattern, re-uploads the plan image only
    when replaced — versioned filename dodges CDN cache; booths replaced wholesale).
    `showService` gained `updateShow`/`getMyShowForEdit`; `publicShows` exports
    `reconstructPlanMeta` shared by walk + edit.
  - **Public profiles**: `/vendors` directory (registered vendors = `profile_id` non-null),
    vendor pages show location/area-served and respect `inventory_public`;
    `/collector/:id` (public collection grid via `lib/publicCollectors.ts`); both link to
    public museums `/museum/vendor/:id` + `/museum/collector/:id` — tiny lazy wrappers
    that download image blobs (museum binder needs `imageBlob`) and mount the museum
    `Scene` with captions; three.js stays in its lazy chunk (wrappers ≈ 2.8 kB).
  - Deferred: vendor claiming flow for placeholder vendors; clicking a reset-email link
    end-to-end (send verified; needs an inbox — also add `/reset-password` to the
    Supabase Auth redirect-URL allowlist per deploy origin).
- **Cohesion wave (this branch, 2026-07-07)**: guest landing page (`LandingScreen`) with
  numbered home sections gated to signed-in users; local sandbox moved to `/sandbox`
  (forced-local provider, own chrome incl. local vendor registry); museum style kit
  (`museumKit.tsx`) applied across every platform page (shows, show detail, organizer,
  account, vendor directory/pages, collector, auth, registry); Vendor Registry CTA
  gated to vendor accounts, Organizer Tools CTA to organizers; **multi-store vendors**
  (migration `0004_multi_store.sql` — vendors.profile_id unique DROPPED, max 2 stores
  per profile via trigger, one flagship per profile via partial unique index +
  `set_flagship_store` RPC; profileService rewritten: `MyStoreRecord`, `listMyStores`,
  `createStore` (first store flips account_type to vendor + becomes flagship),
  `setFlagshipStore`, `ensureFirstStore`, `updateMyStoreSettings`); Account page "MY
  STORES" section (all account types; open/second store, flagship badge/switch,
  per-store settings) replacing MY VENDOR TABLE + BECOME A VENDOR; VendorsScreen
  "IMPORT MY COLLECTION" (one-time copy of collection cards into a store's inventory,
  captions = card names). `listRegisteredVendors` already returns every profile-linked
  store, so both of an account's stores appear in booth assignment + /vendors
  automatically. ⚠ Migration 0004 must be applied to the live project before
  multi-store/flagship works against Supabase.
- **Deferred UX-test items shipped** (2026-07-07, browser-verified live + touch headless,
  zero console errors): create-show visibility choice (publish now / create hidden —
  `publishShow` gained `published?`, ShowEditorScreen radio + hidden-aware success page;
  hidden shows verified absent from /shows and PUBLISHable from OrganizerHome); museum
  404 (`screens/NotFoundScreen`, routes.tsx catch-all now only matches non-root unknown
  paths — `/` still renders App); touch binder discoverability (VendorHallBinders
  proximity scan no longer skips touch, HUD shows "Tap the binder to open it", prompt
  gating is `locked || isTouchDevice`; verified via Playwright `hasTouch` — prompt +
  projected tap-open + prefetch all live); Account "MY STORES" → real "MANAGE INVENTORY
  IN THE REGISTRY" button (App consumes a one-shot `/?view=vendors` query param, stripped
  via replaceState); "◈ WALKABLE IN 3D" badge on show detail (directory thumbnails
  already existed).
- **Roadmap "Now" wave shipped** (2026-07-08; product recommendations doc approved via
  plan mode — `~/.claude/plans/knowing-what-you-know-vast-barto.md` holds the full
  Now/Next/Later roadmap; headless sandbox E2E PASS, zero console errors). Theme: every
  existing surface becomes actionable. Migration `0005_commerce_contact_logistics.sql` +
  the five features:
  (1) **Inventory sale metadata** — `price? / status ('forSale'|'sold'|'display') /
  condition?` on `InventoryItemRecord` + `inventory_items`; registry tiles gain debounced
  price/status/condition inputs (`SaleFields` in VendorsScreen, `useVendorInventory.setSale`;
  clearing a price sends `{price: undefined}` — remote.ts distinguishes via `'price' in
  patch`); placard in InspectOverlay (hall binder + museum walls), price/SOLD
  (strikethrough)/Display-only on the vendor public page grid. `lib/price.ts` formats
  (USD-only for now).
  (2) **Vendor contact links** — `website / contact_email / instagram` on vendors;
  Account MY STORES inputs (profileService), shown on `/vendor/:id` (WEBSITE ↗ /
  CONTACT ✉ / @HANDLE). Local `VendorRecord` carries the fields (import wizard
  round-trips them) but the sandbox registry deliberately has no inputs — no local
  display surface.
  (3) **Show logistics** — `venue_name / address / hours / admission / external_url` on
  shows; ShowEditorScreen form rows (city/venue split into separate fields); ShowDetail
  shows venue · location, the address as a Google-Maps search link, hours · admission,
  and a SHOW WEBSITE / TICKETS link.
  (4) **Hall wayfinding** — minimap booth dots + directory (see `Minimap.tsx` /
  `HallDirectory.tsx` table rows).
  (5) **Share basics** — site-level OG/Twitter meta in index.html (per-route OG needs
  prerendering or an edge function once a deploy target exists — crawlers don't run JS)
  and `ShareButton.tsx` (native share sheet on touch, clipboard + "LINK COPIED" on
  desktop) on show / vendor / collector pages.
  ⚠ **Apply migration 0005 to the live Supabase project before deploying this code**:
  publicVendors / publicShows / showService / profileService now select the new columns,
  and the resulting PostgREST 400s make `/show/:id` and `/vendor/:id` render "not found"
  until the columns exist (the /shows and /vendors directory lists don't select them and
  keep working). Headless-verified (Playwright sandbox run): sale fields persist across
  reload, 50-box plan → assign → hall, minimap dot + directory list/highlight/Esc-close,
  F-binder → inspect placard ("$120" struck · PSA 9 · SOLD), zero console errors.
- **Roadmap "Next" wave shipped** (2026-07-08, same branch; headless sandbox E2E PASS,
  zero console errors — card-metadata persist + museum placard, hall directory
  regression, binder heart toggle w/ localStorage persistence). Migration
  `0006_interests_applications.sql` (interests + booth_applications tables, RLS) + five
  features:
  (1) **Route planning** — `lib/starredVendors.ts` (localStorage per show, anonymous-OK);
  star toggles on ShowDetail's vendor rows; starred booths glow steadily on the minimap
  (7px, distinct from the directory-pick pulse) and HallDirectory rows get toggleable ★
  (VendorScene props `starredVendorIds`/`onToggleStar` — public show walks only, sandbox
  omits them).
  (2) **Card metadata** — `setName/cardNumber/year/grade/notes` on CardRecord (`CardPatch`,
  `updateCard` through the provider seam; cloud side = collections.metadata jsonb, whole-
  object read-modify-write so cleared fields drop out — **no migration needed**). ✎ editor
  on HomeScreen tiles (save-on-blur), details line on tiles / museum placard (InspectOverlay
  `details` prop; Scene `details` map) / collector page + collector museum.
  `lib/cardMeta.ts` = shared `cardDetailsLine`/`hasCardMeta`. Own-card captions only appear
  once some metadata exists (unedited uploads keep filenames off the walls).
  (3) **"I'm interested" want-list** — `lib/interestService.ts`: localStorage-first
  (`vendor-museum:wants`, works anonymous + sandbox), cloud `interests` row fire-and-forget
  when signed in. Heart pill in InspectOverlay (hall binder via itemId threaded through
  VendorHallBinders' onInspect; public vendor museum via Scene's url-keyed `want` prop),
  ♡ buttons on VendorPage tiles, and ♥-count badges on registry tiles (cloud accounts only —
  interests RLS shows a vendor the rows on their own items). ⚠ Side-effect toggles must run
  OUTSIDE React state updaters — StrictMode double-invokes updaters and un-toggles
  (hit + fixed in VendorScene, caught headless).
  (4) **Booth applications** — `lib/applicationService.ts`; ShowDetail "EXHIBIT AT THIS
  SHOW" section (signed-in accounts with stores: apply per store w/ optional message,
  status chips, withdraw-pending); ShowEditorScreen edit-mode APPLICATIONS panel
  (approve/decline); approved applicants sort to the top of the booth-assignment dropdown.
  Approval is tracking/communication — booth placement stays manual.
  (5) **Booth QR** — `qrcode` dep (lazy AccountScreen chunk only); MY STORES "▦ BOOTH QR"
  → white printable sheet (store name + QR to /vendor/:id + URL), PRINT uses the
  visibility-trick print CSS so only the sheet reaches paper.
  ⚠ **Apply migration 0006 to the live Supabase project** before interests /
  applications work against it (hearts degrade gracefully to local-only; the apply/
  organizer panels surface the error inline). 0005's apply-first warning still stands.
  Not browser-verified (need live + migrations): ShowDetail stars/apply against a real
  show, registry ♥ counts, QR modal (auth-gated) — all isolated, low-risk surfaces.
- **Discovery & Mobile wave shipped** (2026-07-09, roadmap items 14 + 16; built as
  **scaffold + two parallel worktree streams** — scaffold commit froze the seams
  (`lib/publicSearch.ts` types + stub, `/search` + `/wants` routes + placeholder screens,
  `SearchBox.tsx` mounted on LandingScreen/ShowDirectory/VendorDirectory,
  `interestService.getWantedItemIds`), then `disc-stream-a` (search) and `disc-stream-b`
  (mobile + wants) ran concurrently on disjoint files and merged conflict-free; each
  stream self-verified headlessly, merged smoke re-verified the seams; zero console
  errors throughout):
  - **Search (14)** — `searchAll(q)` in `lib/publicSearch.ts`: three parallel anon-safe
    `.ilike` queries (shows by name + published, registered vendors by name, visible
    inventory by caption w/ `vendors!inner` join and `inventory_public` re-filter),
    `%`/`_`/`\` escaped, min 2 chars, limits 20/20/60 with +1-overfetch truncation
    flags; per-section try/catch so one failed query never sinks the search.
    `screens/search/SearchScreen.tsx` reads `?q=` reactively via wouter's `useSearch`,
    SHOWS/VENDORS/CARDS sections in directory-row style (card rows: thumbnail, price
    struck + SOLD when sold, condition, vendor link). SearchBox on the landing page and
    both directory filter rows navigates here. Live-verified: q=Live → 2 shows + 1
    vendor; q=holo → 3 card rows with bucket thumbnails.
  - **Want-list page** — `/wants` (`screens/wants/WantListScreen.tsx` +
    `lib/publicWants.ts` `fetchWantedItems`, ids chunked by 50): localStorage ids →
    anon-safe cloud resolve, grouped by vendor, unheart buttons (toggle OUTSIDE state
    updaters — the StrictMode gotcha), "N marked item(s) aren't listed anymore" note for
    deleted/sandbox-local ids, works signed-out. "♥ WANTS" link in PageShell's corner
    chrome (shown even in guest-only mode). Live loop verified: heart on a vendor page →
    /wants renders it → unheart removes it.
  - **Mobile pass (16)** — 375px target, `clamp()`/`min()` inline (no media-query
    framework): PageShell title `clamp(24px,7vw,34px)` + padding `clamp(16px,4vw,24px)`
    + corner chrome fits beside the back link; LandingScreen h1 clamp; VendorPage/
    CollectorPage/wants grids `minmax(140px,1fr)` (2-up phones); Minimap `MAP_W` now a
    module-computed const (140 under 480px — overlay + tracker share it); HUD hint pills
    wrap (`maxWidth: 90vw`); HallDirectory panel `min(300px, calc(100vw - 32px))`.
    Playwright 375×812 hasTouch: no horizontal scroll on /, /shows, /vendors, /wants,
    /login, live vendor + show pages, /search.
  No schema changes. If caption search ever feels slow, a pg_trgm index on
  inventory_items.caption is a one-line future migration.
- **Power Tools wave shipped** (2026-07-09, roadmap items 3 + 7; scaffold + two parallel
  worktree streams, merged conflict-free, per-stream headless verification 19/19 + 25/25
  and a merged smoke — zero console errors throughout):
  - **Wall curation (3)** — CardRecord gains `featured?/hangOrder?/onWalls?` (jsonb-mapped
    with real types in remote.ts; `lib/wallOrder.ts` = `orderForWalls`/`hiddenFromWalls`).
    HomeScreen "CURATE THE WALLS" mode: wall-ordered grid + dimmed OFF-THE-WALLS tiles,
    ★ featured / ‹ › reorder (hangOrder materialized index-wise on first move, then
    adjacent swaps) / HIDE-SHOW. App + CollectorMuseum pass Scene the new `wallCards`
    prop (curated walls) while `cards` stays full — **the 3D binder always pages the
    whole collection**. CollectorPage grid renders wall order + hidden at the end.
  - **Four-wall museum layout** — `computeLayout` generalized to wall descriptors
    N → S → E → W (E unmirrored, W mirrored — reading order faces each wall; capacity
    roughly doubles to ~88 portrait cards; overflow past four walls still drops).
    **Regression bar held: 4-card placements identical to the old algorithm to 1e-9 and
    the light set unchanged for 2-wall scenes.** Spot clustering generalized per wall
    (≤5/wall, only walls with placements mount spots); `WallSpot` now takes fixture/
    target/yaw (yaw = wall rotY); Room.tsx gained E/W ceiling tracks (ROOM.depth−3,
    TRACK_OFFSET) so fixtures sit on rails. East wall verified visually — same
    treatment as north (spot pools, molding, floor reflections).
  - **Bulk inventory tools (7)** — `lib/bulkInventory.ts` `parseBulkLines` (per-line
    delimiter precedence tab > `|` > comma so captions may contain commas; fields
    caption/price/condition/status; `$`/commas stripped; case-insensitive status words;
    blank = leave untouched). `BulkInventoryPanel` in the registry INVENTORY panel
    (collapsed behind ▤ BULK TOOLS): paste → live PREVIEW table (thumbnail, struck
    current caption, em-dash untouched fields, count-mismatch note) → APPLY with
    "Applying N / M…" progress; plus APPLY-TO-EVERY-ITEM (status/condition + confirm).
    `useVendorInventory.bulkUpdate` = sequential persist-and-patch. ⚠ Registry gotcha:
    `SaleFields` price/condition inputs deliberately don't re-sync on value echoes
    (debounce protection) — external writers must bump its `syncKey` prop (the bulk
    panel's `onDone` does) or new values silently don't render.
  - Curation fields ride `collections.metadata` (no migration). Live cloud round-trip of
    curation needs a signed-in account — manual follow-up check, like prior waves.
  - Housekeeping: stale `.git/worktrees/*` metadata (disc-/pt- stream ghosts) is
    OneDrive-locked on this machine — run `git worktree prune` later; the ghosts are
    inert (0000000, directories already deleted).
- **Registry → My Stores unification shipped** (2026-07-09; headless guest-only E2E
  PASS, zero console errors). Root cause of the registry ↔ MY STORES disconnect:
  remote `createVendor` wrote `owner_id` only while `listMyStores` filters
  `profile_id = uid` — registry vendors were invisible to the account by construction.
  Fixes, **no migration needed** (0004's update RLS already lets an owner set their own
  `profile_id`; the store-limit trigger backstops the cap):
  (1) `profileService` claim functions — `listUnclaimedVendors` / `claimVendorAsStore`
  (idempotent via `and profile_id is null` predicate; first claim → flagship RPC +
  accountType flip like createStore) / `autoClaimMyVendors` (oldest-first up to
  STORE_LIMIT) / `unregisterStore` (profile_id → null, frees a slot, row + inventory
  survive).
  (2) **Tabbed /account** — PROFILE | MY STORES, tab from `?tab=stores` (deep-linkable,
  `useSearch`). `MyStoresTab.tsx` (StorePanel + StoreQrModal moved out of AccountScreen;
  shared helpers in `accountShared.tsx`): auto-claim on load, UNCLAIMED VENDOR PAGES
  list with per-row CLAIM (disabled at cap), UNREGISTER / DELETE actions per store, and
  per-store `VendorManagementPanel` fed by `useVendors`/`useSavedPlans` through the
  provider seam (remote getVendors filters owner_id, so stores come back automatically;
  after `createStore` — a direct-Supabase write — call `vendors.reload()`).
  (3) **`VendorManagementPanel.tsx`** — banner/shows/inventory machinery extracted from
  VendorsScreen (captions, SaleFields + syncKey contract, bulk panel, ♥ counts, import
  collection); file inputs are refs, not fixed DOM ids, because two mount at once on the
  stores tab. VendorsScreen keeps its external prop contract (App.tsx untouched) and is
  now sandbox/guest-only (public-page link removed).
  (4) **Home tiles** — BUILD A SHOW + VENDOR REGISTRY render only when
  `sandbox || !configured`; `showRegistry={!configured}` and the `view === 'vendors'`
  branch is guarded by it (stale signed-in `/?view=vendors` falls through to home, param
  stripped). Signed-in home gets MY STORES → `/account?tab=stores`.
  (5) **Organizer placeholders removed** — PlanWorkbench `onAddVendor` is optional
  (quick-create UI hidden when absent); ShowEditorScreen passes registered vendors only
  (approved applicants still sort first) and no quick-create. Legacy placeholder booth
  assignments render as unassigned in the editor but keep rendering in walks; their
  owner sees them as claimable on the stores tab. Sandbox VendorSetupScreen still passes
  onAddVendor — local quick-create unchanged.
  Verified headless (guest-only + sandbox): tiles, registry create/rename/delete, drop
  upload, caption/price/condition/status persist across reload, bulk apply re-syncs via
  syncKey, banner upload, manual shows, `/?view=vendors` deep-link, /account renders
  NotConfiguredNote. **Live checks pending** (need the real Supabase project):
  auto-claim/claim/unregister round-trip, tab deep-link signed-in, ♥ counts on the tab,
  organizer dropdown = registered-only. Note: concurrent debounce flushes of caption +
  price + condition can race the read-modify-write in useVendorInventory (pre-existing,
  human typing never hits it — only same-tick synthetic writes).
- **UX Wave A shipped** (2026-07-10, branch `ux-waves`; from the live UX review plan
  `~/.claude/plans/your-role-you-re-delegated-brook.md` — scaffold + 2 worktree streams
  merged conflict-free; per-stream verification 53/53 + 34/34 PASS, merged smoke green,
  zero console errors): **cold-start/first-impressions wave.**
  - Landing: two in-engine hero stills in museum-plaque framing (`src/assets/hero-*.webp`,
    TODO re-capture on a real GPU — SwiftShader), "◈ WALK A DEMO SHOW →" CTA, sandbox
    footnote promoted to a "TRY IT NOW →" tile, NBSP-bound arrows (no orphaned →).
  - **Bundled demo show** at `/demo`: `lib/demoShow.ts` manifest (real detection meta
    from floorplan_example.png — 50 rects @41.37 px/m; 4 fictional vendors on 6 booths;
    16 fictional-creature WebP cards with prices/conditions incl. one sold + one display)
    + `screens/demo/DemoShowScreen.tsx` mounting the lazy `VendorScene` exactly like
    ShowDetail's walk (`fetchInventory` = bundled URL → Blob → `InventoryItemRecord`).
    Account-free, DB-reset-proof, exercises the placard path. "SAMPLE EXHIBITION ·
    FICTIONAL VENDORS" fixed placard; ShowDirectory's empty state links to it.
  - Trust surface: `SiteFooter` (About/Privacy/Terms/Contact) mounted in PageShell +
    LandingScreen + HomeScreen; real copy in `screens/static/StaticPages.tsx` (privacy
    names Supabase vs IndexedDB/localStorage, "no analytics, no trackers"; contact =
    mailto).
  - Signed-in: role-aware `OnboardingChecklist` under the home masthead (steps derive
    `done` live from cards/stores/profile — nothing stored but the ✕ dismissal,
    localStorage `vendor-museum:onboarding:<uid>`; derivable steps render ✓/○,
    signal-less steps render → CTAs; auto-hides when derivable steps all done); corner
    chrome shows display name via `accountLabel()` (PageShell export: profile
    displayName → `user_metadata.display_name` → email); /account gains "Walk my public
    museum →" beside the public-page link.
  - **Signup-time sandbox import (roadmap item 15 closed)**: SignupScreen checks
    `readLocalSnapshot()` and lands data-carrying signups on `/account?import=1`
    (AccountScreen scrolls to + gold-pulses the existing import panel, strips the param).
    ⚠ Gotcha found live: a component ref can't carry the post-signup destination —
    `DataProviderBoundary`'s `key={identity}` remount resets it; a module-scoped,
    time-boxed (60s) flag survives the remount.
  - `.claude/skills/verify/SKILL.md` refreshed (2026-07-10 discoveries): headless Edge
    now DENIES pointer lock → addInitScript shim (fake `requestPointerLock` /
    `pointerLockElement` + `pointerlockchange`); binder opens EXIT pointer lock → click
    card pixels with the free cursor; vendor-inventory input is `input[type=file][multiple]`
    in the panel (old id gone); minimap booth/star dots = small round DIV children of the
    map img's parent (player marker = the translate+rotate child); scroll the editor svg
    into view + re-read coords before rect clicks.
  - Live test data from the review remains on prod for reuse (account
    jason.a.dale2+uxtest0709@gmail.com, store e34bbc71, published "UX Test Show (safe to
    delete)" e785d845 + two uxa2verify accounts) — see memory `project-uxtest-account`.
- Candidate next steps (discussed, not built): editor undo / zoom / multi-select;
  export/import saved plans as files; booth labels on tables; walk-in entrance/doors on
  the hall; bundle code-splitting (~1.4MB); card metadata in inspect view; deploy setup
  (any static host).
- Museum-side known gaps: east/west walls unused by card layout (overflow silently
  dropped); pre-downscale images in old IndexedDBs stay full-res until re-uploaded.

