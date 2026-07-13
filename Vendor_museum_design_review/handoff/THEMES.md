# Vendor Museum — Beta Theme Handoff

Two new switchable themes from the design exploration (`Vendor Museum Redesign.dc.html`),
packaged for the React app. The current "Museum Refined" look stays as the default /
control group.

| Theme id  | Name              | Canvas refs | One-liner |
|-----------|-------------------|-------------|-----------|
| `refined` | Museum Refined    | turn 1      | today's museumKit, unchanged |
| `night`   | Show Floor · Night| 3a, 4a–4c   | convention-poster energy on warm ink black |
| `lobby`   | Charcoal Lobby    | 3b, 4d–4f   | wayfinding signage, oxblood accent, enamel signs |

## Files

- `themeKit.tsx` — museumKit generalized: `ThemeProvider`, `useTheme()`, `THEMES`.
  Same recipe surface as museumKit (buttons, input, label, panel, note, hoverCss)
  so screens migrate constant-by-constant.
- `ThemeSwitch.tsx` — segmented pill switcher (persists to localStorage
  `vendor-museum:theme`).

## Wiring

1. Copy both files into `src/components/`.
2. Wrap the DOM subtree once (e.g. in `root.tsx`, OUTSIDE the R3F canvases —
   context must not cross the Canvas root, same rule as the data provider):
   `<ThemeProvider><Routes/></ThemeProvider>`
3. Add `<ThemeSwitch/>` to PageShell's corner chrome and/or the Account page.
4. Add the beta fonts to `index.html` (only `night`/`lobby` use them; Refined
   stays on Georgia/system):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Archivo:wght@400;500;600;700;900&family=DM+Serif+Display&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

5. Migrate screens: replace museumKit constant imports with `useTheme()` reads.
   Mapping is 1:1 (see the header comment in themeKit.tsx). PageShell +
   HomeScreen first — they carry most of the chrome.

## Token sheets

### night — "Show Floor · Night"

- bg `#171411` · panel `#201b15` · surface/wells `#241f18`
- text cream `#f2ecdf` · muted `#a39a89`
- accent red `#e0563c` (on-accent text = bg) · accent2 blue `#7096e6` · done-green `#57b878`
- borders: **2px solid** — full-strength cream for poster frames, `rgba(242,236,223,0.35)` for quiet panels
- type: Barlow Condensed 800 UPPERCASE display (line-height ~0.95) ·
  Archivo body (600 for emphasis) · IBM Plex Mono for meta/labels (letter-spacing 0.14–0.2em)
- signature moves:
  - primary buttons: red block + `box-shadow: 4px 4px 0 cream`
  - hero headline glow: `text-shadow: 0 0 34px rgba(224,86,60,0.3)`
  - ticket date blocks: blue/red square, condensed 800, 2px cream divider
  - marquee strip: red bg, condensed 700, `★`-separated, ls 0.24em
  - show-pass card: `#241f18`, 2px cream border, red offset shadow,
    red/blue barber-stripe tape `repeating-linear-gradient(90deg, red 0 18px, blue 18px 36px)`
  - price chips: red bg; SOLD = strikethrough grey chip + red outline `SOLD` chip;
    display-only = blue outline chip
  - floor plan: `filter: invert(0.92) hue-rotate(180deg) saturate(0.4)`; booth dots red,
    starred glow `0 0 10px 3px rgba(224,86,60,0.7)`

### lobby — "Charcoal Lobby"

- bg gradient `#1b1918 → #161414 → #121010` · board panels `#100e0d` /
  `rgba(10,9,8,0.5)` with double hairline inset
- text ivory `#efeae0` · muted `#9b948a`
- accent oxblood `#a84b36` (numerals, arrows, dots, primary buttons)
- borders: 1px `rgba(239,234,224,0.22)`; letter-board rows use
  `1px dashed rgba(239,234,224,0.18)`
- type: DM Serif Display for headings/wing names · IBM Plex Mono for everything
  else (small caps, wide tracking 0.12–0.44em)
- signature moves:
  - directory board: oxblood roman numerals (DM Serif, 38px), wing name serif 24px,
    mono sub-line, oxblood directional arrows (→ ↗)
  - enamel sign (profile header / front-desk forms): bg `#efe8da`, ink `#2a2622`,
    double pinline inset borders (1.5px `#a84b36` at inset 8px + 1px 40%-alpha at 12px),
    4 corner "screw" dots `#8b857a`, engraved text via
    `text-shadow: 0 1px 0 rgba(255,255,255,0.7)`
  - inventory price labels: mini enamel plates under framed cards
    (ivory bg, oxblood price, grey condition; SOLD strikethrough + oxblood `SOLD`)
  - card frames: `3px solid #2e2a26` + 1px ivory-alpha outline at 3px offset
    (the museum frame idiom, de-golded)
  - floor plan: `filter: invert(0.9) sepia(0.25) saturate(0.6)`; booth dots oxblood
  - footer motto line: mono, ls 0.26em, muted

## 3D overlays (HUD / minimap / InspectOverlay / HallDirectory)

The canvases themselves don't change. Theme the DOM overlays only:

- HUD hints + binder F-prompt: `t.fontMono`, `t.text` on `rgba(bg, 0.85)` pills,
  `t.borderWidth` borders.
- Minimap frame: border color `t.border`; booth dots `t.boothDot || gold`;
  starred glow keeps its size ramp, recolored to the dot color.
- InspectOverlay placard: price in `t.accent`, SOLD strikethrough in `t.muted` —
  same rules the vendor-page grids use.
- HallDirectory rows: `museum-row` hover already comes from `t.hoverCss`.

## Notes

- `tsc -b` clean expected: type-only imports use `import type`
  (verbatimModuleSyntax), no new deps.
- Theme choice is per-browser (localStorage), not per-account — fine for beta;
  move to `profiles` if you want it to roam.
- If a beta user screenshots a bug, the theme is identifiable at a glance
  (red poster vs oxblood signage vs gold serif).
