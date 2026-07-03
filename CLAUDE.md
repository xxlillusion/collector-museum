# Vendor Museum — Handoff / Project Guide

A first-person 3D virtual museum for a personal Pokemon card collection. Users upload card
images (drag & drop), then walk a realistic gallery room where the cards hang as framed,
spotlit art. No backend — everything persists in the browser via IndexedDB, deployable as a
static site.

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
npm run dev      # dev server (5173, falls through to next free port)
npm run build    # tsc -b && vite build — USE THIS to type-check (see gotchas)
```

## Architecture

Two top-level views, switched in `src/App.tsx`:

```
UploadScreen (DOM)  ←→  Scene (R3F Canvas + DOM overlays)
```

### Data flow

`src/lib/db.ts` — IndexedDB (`vendor-museum` db, `cards` store): `{ id, name, imageBlob, addedAt }`
→ `src/lib/useCards.ts` — hook exposing `cards` (each with an object URL for its blob),
`addCard(file)`, `removeCard(id)`. Object URLs are revoked/recreated on each reload.

### 3D scene (`src/components/`)

| File | Role |
|---|---|
| `Scene.tsx` | Canvas config (ACES tone mapping, dpr clamp, custom raycast compute, WebGL context-loss auto-recovery via key remount), aspect-aware layout algorithm, clustered `WallSpot` spotlights, `Environment` + `Lightformer`s, `EffectComposer`, `LoadingOverlay` (useProgress) |
| `Room.tsx` | Exports `ROOM` dims (20×5×12) + `TRACK_OFFSET`. Reflective floor (`MeshReflectorMaterial`), walls, crown molding, baseboards, ceiling light tracks, central bench, base lighting + shadow-casting key light |
| `CardFrame.tsx` | Framed card: mitred wood frame (clearcoat), white passe-partout mat, card texture plane, glass pane with env glare. Click → inspect (guarded by `e.delta > 8` to ignore drags) |
| `GalleryControls.tsx` | Desktop: `PointerLockControls` + WASD (velocity in `useFrame`, camera clamped to room bounds, fixed eye height 1.7). Exports `isTouchDevice`, and mutable `mobileInput`/`mobileLook` objects shared with mobile controls |
| `MobileControls.tsx` | Touch only: nipplejs joystick (bottom-left) writes `mobileInput`; window-level touch-drag listeners write `mobileLook` deltas (consumed as yaw/pitch in `GalleryControls.useFrame`). No intercepting overlay, so taps reach the canvas for card clicks |
| `HUD.tsx` | Control hints (different text for touch), crosshair when locked, "Manage Cards" button |
| `InspectOverlay.tsx` | Full-screen card view; any click (or Esc) closes it, and Scene then re-locks the pointer (best-effort — Chrome has a ~1s cooldown after exiting pointer lock, so it falls back to click-canvas-to-lock) |
| `UploadScreen.tsx` | Drag-drop + browse upload, thumbnail grid with delete, "Enter Museum" |

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

⚠ **Do NOT re-add drei `<SoftShadows>` (PCSS) or `N8AO`** — their first-frame shader
compile burst on Windows/ANGLE can trip the GPU driver timeout (TDR), killing the WebGL
context → intermittent black canvas with the DOM UI still alive. That bug was shipped and
reverted once. Post-processing is Bloom + Vignette only.

### Mobile strategy

`isTouchDevice` gates: no PointerLockControls, no SoftShadows, no EffectComposer,
reflector resolution 512 (vs 1024). Movement/look come from the shared mutable objects.

## Gotchas (hard-won, don't rediscover)

1. **Type-check with `npm run build` (`tsc -b`), not bare `npx tsc --noEmit`** — bare tsc
   ignores the project references and silently passes; `tsc -b` enforces
   `verbatimModuleSyntax` (all type imports must be `import type`).
2. **nipplejs v1.x is a full rewrite**: single-arg event API — `manager.on('move', (evt) =>
   evt.data.vector)`. It does NOT export `JoystickManager`/`EventData`/`JoystickOutputData`
   types; import `{ create }` and rely on inference.
3. **Raycast under pointer lock**: R3F raycasts from the frozen mouse position when the
   pointer is locked. `Scene.tsx` `onCreated` installs a custom `events.compute` that raycasts
   from screen center (crosshair) when `document.pointerLockElement` is set. Don't remove it.
4. **Three.js dedupe**: `stats-gl` (drei sub-dep) bundles three@0.170 → "Multiple instances
   of Three.js" warning. `vite.config.ts` has `resolve.dedupe: ['three']`.
5. **Card click vs touch-drag**: card `onClick` ignores events with `e.delta > 8` px so
   look-drags on mobile don't open the inspect overlay.
6. **`useTexture` doesn't set color space** — CardFrame sets `texture.colorSpace =
   SRGBColorSpace` manually; without it cards look washed out.
7. **OneDrive path**: project lives under OneDrive Desktop; quote paths in shell commands.

## State / where things stand (2026-07-02)

- Full flow works: upload → enter museum → walk (desktop WASD + mouse, mobile
  joystick + drag) → click card to inspect → cards persist across refresh.
- Visual realism pass done (spotlights, reflector floor, PBR frames, bloom/vignette).
- Black-screen fix shipped: removed PCSS/N8AO (TDR risk, see lighting section), uploads
  downscaled to ≤1600px WebP in `db.ts`, loading overlay, context-loss canvas remount.
- Frames sized from image aspect ratio; greedy row layout, no overlap possible.
- Note: images uploaded before the downscale change are stored at full resolution in
  IndexedDB — re-upload them (or write a migration) if they cause slow loads.
- Not yet done / candidate next steps: bundle is ~1.4 MB (code-splitting if it matters);
  east/west walls unused by layout (overflow beyond 2 walls is silently dropped); no card
  metadata (name/set) in inspect view; no deploy setup yet (any static host works).
