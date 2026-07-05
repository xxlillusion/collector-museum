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
UploadScreen (DOM) ←→ Scene (museum, R3F Canvas + DOM overlays)
        ↕
VendorSetupScreen (DOM: upload / detect / edit) ←→ VendorScene (hall, R3F Canvas)
```

`type View = 'upload' | 'gallery' | 'vendorSetup' | 'vendorWalk'` — `vendorWalk` guards on
`planMeta` existing and falls back to setup.

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
| `UploadScreen.tsx`    | Drag-drop + browse upload, thumbnail grid with delete, "Enter Museum"                                                                                                                                                                                                    |


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

Flow: UploadScreen “Vendor View” button → `VendorSetupScreen` (drop plan image →
auto-detect → `PlanEditor` fix-up → Generate) → `VendorScene` (first-person hall).
Plan image + edited boxes persist in the `settings` store; a saved plan skips straight
to the editor on return.

### Files

| File | Role |
| ---- | ---- |
| `lib/vendorPlan.ts` | Data model (`VendorRect` in stored-image px, `VendorPlanMeta`) + pure math: `planToLayout(meta)` → hall dims + `TablePlacement[]`. px→m via `pxPerMeter`; image y-down → world +Z; hall = plan extent + 2m margin, height 6, axes clamped to 8–80m. A box spawns `max(1, floor(long/1.83 + 0.25))` 6-ft tables centered along its run; fronts face the hall centerline |
| `lib/planDetect.ts` | Dependency-free detection: downsample ≤1000px → luma → Otsu → Pass A (flood-fill light mask from borders; remaining enclosed light components = outlined tables) + Pass B (dark connected components = filled tables) → bbox filters (min side, ≤40% of image, fill ratio ≥0.7, aspect ≤14) → IoU merge → containment prune. `inferScale`: modal short side of table-aspect boxes / 0.76m, cross-checked vs long side / 1.83m. Main thread is fine at this size |
| `lib/useVendorPlan.ts` | `useBanner`-style hook: `{ planUrl, planMeta, setPlan, saveMeta, clearPlan, loading }`; new image clears stale rects |
| `PlanEditor.tsx` | `<img>` + SVG overlay, `viewBox` = stored-image px (browser scales; zero resize math). Select/move/resize (corner handles)/delete (✕ or Backspace), “Add table” draw mode (click = default 1-table box), pointer capture guarded in try/catch. Controlled; parent debounce-persists (500ms) |
| `VendorSetupScreen.tsx` | Upload/detect/edit wrapper; scale readout (“hall ≈ W×D m · N boxes → M tables”), Re-detect, Replace image |
| `VendorRoom.tsx` | Parameterized `{width, depth, height}` hall shell (reflector floor 512/256, walls, baseboards, hemi+ambient). Room.tsx deliberately untouched |
| `VendorTables.tsx` | **Instanced**: one `instancedMesh` per part (board, merged legs, cloth top, front/back/side drapes) = 7 draw calls for any table count. Matrices = table world transform × part local offset, set in `useLayoutEffect` (+ `computeBoundingSphere`). Banner texture composited once, applied to all fronts |
| `VendorScene.tsx` | Duplicates Scene.tsx’s Canvas props + `onCreated` **verbatim, on purpose** (see gotcha 9-adjacent comment in file). Hall lighting: 1 shadow directional (ortho fit to hall) + ≤6 warm aisle spots + emissive ceiling panels (bloom, zero light cost) = 9 lights total |
| `tableGeometry.ts` | Extracted cloth recipes (`makeTopGeometry`, `makeDrapeGeometry(width, phase)`, CLOTH_* constants), lazy shared singletons `getTableGeometries()` (incl. back drape phase 3.1 + `mergeGeometries` legs), `getClothMaterial()`, `makeBannerTexture(img)`. Table.tsx consumes these — museum visuals unchanged |
| `sceneCommon.tsx` | `ShadowRefresh` + `LoadingOverlay` shared by both scenes |

### Perf rules for the hall (50–200 tables)

- Never per-table lights or shadow spots — the budget is hemi + ambient + 1 shadow
  directional + ≤6 spots. Visual density comes from emissive panels via bloom.
- All tables share geometry; keep new per-table decoration instanced or it will multiply
  draw calls by table count (reflector renders the scene twice).

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
- `floorplan_example.png` (repo root) is the user’s real example plan — **detection has
  not been run against it yet**; that’s the first thing to try (Replace image in Vendor
  View; a synthetic test plan currently occupies the IndexedDB slot).
- Candidate next steps (discussed, not built): rotated tables in editor + layout; editor
  undo / zoom / multi-select; manual scale nudge control; per-vendor banners & booth
  labels (would need per-instance UVs or texture atlas — mind the draw-call rule); walk-in
  entrance/doors on the hall; bundle code-splitting (~1.4MB); card metadata in inspect
  view; deploy setup (any static host).
- Museum-side known gaps: east/west walls unused by card layout (overflow silently
  dropped); pre-downscale images in old IndexedDBs stay full-res until re-uploaded.

