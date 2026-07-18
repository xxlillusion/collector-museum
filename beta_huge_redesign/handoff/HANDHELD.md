# THE HANDHELD — Claude Code transition spec

Restyle the Vendor Museum React app (DOM screens only) into "THE HANDHELD":
full 1999 LCD-handheld nostalgia. Mockups: `Vendor Museum Redesign.dc.html`
anchors #5b (home) and #6a–#6g (title screen, shows, show detail, vendor,
collector, account, 3D HUD).

## Scope

- **Restyle:** every DOM screen (PageShell chrome + all routes) and the DOM
  overlays on the 3D screens (HUD hints, minimap frame, dialog prompts,
  InspectOverlay, HallDirectory).
- **Do NOT touch:** the R3F `<Canvas>` scenes themselves (Scene, VendorScene,
  museum interiors) — the 3D stays photoreal; the contrast between rendered
  3D and LCD chrome is the point (see #6g). Also leave routing, data layer,
  supabase code alone.
- Suggested approach: implement as a 4th theme (`handheld`) in the beta
  `themeKit.tsx` (see handoff/THEMES.md) OR as a hard cutover replacing
  museumKit constants — user's call. The tokens below map onto the Theme
  interface either way.

## Tokens (the entire palette — 4 LCD shades + nothing else)

```
shell    #8b9a63   // page/desk background around the "screen"
screen   #c5cfa1   // main surface (bg)
panel    #d3dbb4   // raised boxes, dialogs, menus
mid      #b4bf8c   // wells: binder pages, map fields, avatar boxes
ink      #2b331f   // ALL text, borders, fills
muted    #5c6844   // secondary text (dimmer ink)
shadowA  #a8b380   // screen inner bevel
shadowB  rgba(43,51,31,0.35)   // drop shadow for the screen frame
```

No gold, no red, no blue anywhere in DOM chrome. States are expressed with
inversion (ink bg / screen text), weight, `▶` cursors, and blink — never hue.
Errors: inverted box + `!` prefix. Success: dialog box confirmation.

## Type

- Font: **Silkscreen** (Google Fonts, 400 + 700) for EVERYTHING. Fallback
  `monospace`. Add to index.html:
  `<link href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap" rel="stylesheet">`
- ALL CAPS everywhere. Sizes: 8–10px meta, 10–11px body/menu rows, 12–13px
  section titles, 26px title-screen logo. Line-height ~1.9–2 for dialog text.
- Letter-spacing modest (0.02–0.12em) — pixel fonts self-space.

## Core recipes

```
SCREEN FRAME (one per page, wraps all content; PageShell owns it)
  background: screen; border: 4px solid ink; border-radius: 6px;
  box-shadow: inset 0 0 0 2px shadowA, 8px 8px 0 shadowB;
  page body behind it: shell color. Max-width ~980px desktop, full-bleed mobile.

HEADER  border-bottom: 4px double ink; title 700; nav = small caps + inverted
  account chip (ink bg, screen text, padding 4px 8px).

DIALOG BOX (the signature — use for every empty state, confirmation, error,
  onboarding step, and toast)
  border: 3px solid ink; background: panel;
  box-shadow: inset 0 0 0 2px screen, inset 0 0 0 5px ink;   // double border
  padding: 10-14px 14-16px; text 10-11px, line-height ~2;
  blinking ▼ bottom-right (CSS steps() opacity animation, ~1s);
  choices inline: "▶ YES, SHARE   NOT YET" — active choice 700 + ▶, idle muted.

MENU / LIST  border: 3px solid ink; background: panel; rows padded 8-10px;
  row separators 2px solid mid; SELECTED row = inverted (ink bg, screen text)
  with leading ▶; unselected rows indent to align (hidden ▶ or padding).

BUTTONS  primary: ink bg, screen text, no border, 700, "▶ LABEL".
  secondary: panel bg, 3px ink border. No radius. Hover: nudge translate(1px,1px)
  or blink the ▶ — no color shifts.

INPUTS  3px ink border, screen bg, Silkscreen, uppercase placeholder in muted.
  Selects: white-space chip with "▼" suffix.

CARD IMAGES  2-3px ink frame on screen bg, padding 2-3px;
  image-rendering: pixelated; filter: saturate(0.75) contrast(1.05);
  binder grids sit on a mid-colored well (3px ink border, padding 10-12px).
  SOLD: rotate(-8deg) inverted "SOLD!" chip centered over a 0.5-saturation image.

TRAINER/COLLECTOR CARD  panel box; header row "COLLECTOR CARD | ID No. NNNNN"
  with 2px ink underline; avatar = 3px-ink box with initials on mid;
  stats: CARDS / WALKS / BADGES ★★★☆☆ (see #6e).

FLOOR PLANS / MINIMAP  LCD-ify raster plans with
  filter: grayscale(1) sepia(0.4) hue-rotate(50deg) saturate(1.6) brightness(1.05) contrast(0.95);
  booth dots = square ink pixels (no circles); starred booth = bigger square +
  inverted name chip; player marker on minimap = ink diamond with screen outline.
```

## Copy voice (important — half the theme is text)

Game-dialog register, second person, exclamation-friendly, never sarcastic:
- upload success: "JASON hung 3 cards in the MUSEUM!"
- share prompt: "Visitors can now walk the halls. Share the link?  ▶ YES, SHARE / NOT YET"
- vendor greeting: "Hi! Welcome to NW CARD VAULT! Take a look at the binder…"
- empty collection: "The walls are bare! Hang your first card?  ▶ UPLOAD"
- confirm destructive: "Really take AURORA STAG off the wall?  ▶ NO / YES"
Keep proper nouns ALL-CAPS inline (JASON, MUSEUM, BINDER) — that's the idiom.

## Per-route mapping (mockup anchor → route)

- **#6a → `/` logged out (LandingScreen):** title screen. Logo in a dialog
  frame, two pixelated hero stills, menu: ▶ NEW GAME (signup) / CONTINUE
  (login) / DEMO (demo show). Footer motto + © line.
- **#5b → `/` signed in (HomeScreen):** dialog greeting w/ share prompt;
  BINDER page grid (uploads = "+" slot, page X/Y flip); right rail MENU
  (▶ WALK MUSEUM / UPLOAD CARDS / CARD SHOWS 3 NEW / VENDORS / SAVE & SHARE),
  TRAINER CARD mini, next-show footer line. Onboarding checklist becomes
  sequential dialog boxes.
- **#6b → `/shows` (ShowDirectory):** "AREA: WASHINGTON ▼" filter chip,
  selectable list w/ inverted active row, meta line "AUG 02 · SEATTLE ·
  50 BOOTHS · MAP OK!" (no plan = "NO MAP YET"), results dialog.
- **#6c → `/show/:id` (ShowDetail):** LCD-filtered floor plan + square booth
  dots + starred chip; VENDORS list with ★/☆ toggles; "▶ WALK THIS SHOW"
  primary; booth application as dialog ("Want to sell here? Apply with your
  store! ▶ APPLY (JASON'S VAULT)").
- **#6d → `/vendor/:id` (VendorPage):** shopkeeper greeting dialog (WALK IN
  3D / JUST BROWSE); inventory tiles w/ ♡/♥ want toggles, "$240 · NM" meta,
  SOLD! stamp; footer "APPEARS AT: …" appearances strip.
- **#6e → `/collector/:id` (CollectorPage):** TRAINER CARD as the hero
  (ID No., avatar, stats, quote), ▶ WALK THE MUSEUM + SHARE CARD ⎘, binder
  well grid of the collection.
- **#6f → `/account` (AccountScreen + MyStoresTab):** OPTIONS menu on the
  left (PROFILE / MY STORES / WANT LIST n / PASSWORD / INTERFACE STYLE /
  SAVE & QUIT); right panels: PROFILE rows with EDIT actions, "BAG — STORES
  POCKET" for stores, status dialog. Login/Signup/Reset reuse the title-screen
  frame with a single centered form box (NEW GAME = signup framing).
- **#6g → 3D overlays (museum/show walk):** photoreal canvas untouched.
  Minimap = HALL MAP panel (3px border, offset shadow, square dots, ◆ you).
  Top-right status chip "EMERALD CITY · BOOTH 12/50". Interaction prompt =
  full dialog box bottom: "NW CARD VAULT is minding the table. Browse their
  BINDER? ▶ YES [F] / WALK ON". InspectOverlay = card at full res (NOT
  pixelated — inspection is the one place fidelity wins) inside a 3px ink
  frame with name/price caption box.
- **Remaining routes** (`/vendors`, `/search`, `/wants`, `/organizer*`,
  static pages, 404): same recipes — lists as MENUs, forms as dialog boxes.
  404 = "Wild MISSINGNO appeared!"-style dialog + ▶ GO HOME. Organizer editor
  keeps its drag-drop plan editor functional, just re-chromed.

## Implementation notes

- Grep for museumKit imports (`GOLD|PANEL|HAIRLINE|SERIF|primaryButtonStyle`
  etc.) — every consumer gets the mapped recipe above; museumKit's export
  surface can be kept with new values if a hard cutover, or themed via
  themeKit if a 4th beta theme.
- Blink animations: single shared CSS (`@keyframes lcd-blink { 50% {opacity:0} }`,
  `animation: lcd-blink 1s steps(1) infinite`) — steps(), not ease; LCDs don't fade.
- Optional-but-great: page transitions as a 150ms full-screen ink wipe;
  hover "beep" is out of scope (no audio).
- Accessibility: Silkscreen at 8px is small — keep ≥8px only for tertiary
  meta, 10px+ for anything interactive; contrast ink-on-screen passes AA.
  Respect prefers-reduced-motion for blinks.
- Images: `image-rendering: pixelated` + the saturate filter is CSS-only —
  originals stay untouched.
