# Get Smart Media Player — Reference Board Compliance Audit
Date: 2026-10-10
Status: Pre-reskin geometry baseline
Repository: NoByChanceLife/get-smart-media-player

## Purpose

This audit compares the current customer-facing UI against the approved Get Smart Media Player concept boards. The boards are the geometry and density reference for the next implementation pass.

The target is not a conventional responsive website. The target is a dense, television-first media-player interface that remains usable with remote/D-pad, touch, keyboard, and mouse across Fire TV / Android TV, desktop, tablet, and mobile.

## Approved visual direction

Primary Live TV reference:
- Concept A / Concept 1 family: persistent Get Smart rail + group rail + integrated channel/EPG grid + contextual program preview.
- Concept C informs compact-density behavior for very large channel catalogs.
- Concept E informs touch/mobile composition.
- Concept D / Unified Media Experience informs Home, Movies, and Series: persistent Get Smart navigation with content-dominant surfaces.

The boards should be interpreted as one design system rather than separate unrelated mockups.

## Non-negotiable geometry principles

1. Larger screens reveal more content; they do not simply make controls and cards proportionally larger.
2. Primary customer-facing screens use the full available app canvas after navigation.
3. Navigation width is controlled and stable.
4. Live TV guide density must remain high enough to show roughly 6-10 useful channel rows on common TV and desktop landscape layouts.
5. Program rows are compact, horizontal, and information-dense.
6. Poster/card grids stop growing after reaching their intended viewing size; wider screens show more items.
7. Preview surfaces are contextual and must not consume enough height to significantly damage guide density.
8. Mobile changes composition instead of shrinking the TV layout or making desktop components enormous.
9. Focus treatment must remain obvious without causing collisions in dense grids.
10. Full-screen player surfaces use the true viewport; overlays and drawers clamp to available dynamic viewport.

## Current overall assessment against the boards

- Core architecture: 8.8/10
- Playback/session model: 8.8/10
- Remote/D-pad navigation: 8.7/10
- Feature completeness: 8.5/10
- Live TV functionality: 8.6/10
- Target-layout accuracy: 6.4/10
- Density/scaling accuracy: 6.2/10
- Cross-screen visual consistency: 6.6/10
- Pre-reskin readiness: 7.0/10
- Overall against approved concept target: 7.3/10

The gap is primarily layout geometry and visual density, not core product architecture.

---

# App shell

Files:
- src/App.tsx
- src/components/TVNavigationRail.tsx
- src/components/TopBar.tsx
- src/index.css

## What is correct

- Persistent left Get Smart rail is structurally aligned with the concept boards.
- Collapsed/expanded rail layout reservation is now explicit in App.tsx.
- Current browsing/playback layering supports the desired set-top-box behavior.
- TV focus system exists globally and is already specialized inside Live TV.

## Current mismatches

### Shell width behavior
App.tsx reserves:
- collapsed rail: 74px
- expanded rail: 256px

Keep this baseline for now. The bigger issue is that child screens use inconsistent local max-widths and breakpoints.

### TopBar
TopBar uses max-w-7xl mx-auto, which creates a centered web-header feeling that is not present in the boards. The concept boards use a full-width app composition after the rail.

Required change:
- top bar should align to the active content canvas, not independently center itself.
- define compact / standard / TV top-bar density modes.
- avoid abrupt hidden sm/lg/xl composition changes where possible.

### TVNavigationRail
The rail width is acceptable, but internal row height and padding are nearly constant across short landscape devices and 10-foot TV layouts.

Required change:
- keep width stable.
- scale row density modestly by available height, not by screen width.
- on short landscape, reduce vertical padding before reducing readability.
- preserve always-available D-pad access.

### BottomNavBar
src/components/BottomNavBar.tsx remains in the repository but App.tsx does not render it.

Required change:
- remove the unused App import now.
- mark/delete BottomNavBar after verifying no alternate entrypoint consumes it.
- mobile composition should be deliberate and based on Concept E, not dead legacy navigation.

---

# Live TV

File:
- src/components/LiveTVView.tsx

## What is correct

This is currently the strongest layout foundation.

- Dedicated full-height workspace.
- separate Get Smart rail and Groups rail.
- virtualized channel rows for very large provider catalogs.
- integrated channel + Now + Next + Later + Favorite navigation.
- safe repeated-Left path back toward main rail.
- dynamic viewport height uses 100dvh rather than old 100vh.
- focus scale is disabled inside the dense guide to prevent collisions.

These behaviors should be preserved.

## Current mismatches

### Groups rail gets wider just because the viewport is wider
Current:
- w-36
- sm:w-44
- lg:w-52
- xl:w-60

This is the opposite of the reference-board scaling principle. TV should use additional width for guide data, not continuously widen local navigation.

Required change:
- convert to controlled density token.
- compact/touch: approximately 120-152px as space allows.
- desktop/TV: approximately 152-184px unless usability testing proves more is required.
- never consume guide width merely because the viewport crossed xl.

### Featured preview height
Current:
- hidden below xl
- min-h-[138px] at xl+

The board allows a preview, but the preview must remain subordinate to the guide.

Required change:
- use a clamp-based height.
- set both minimum and maximum footprint.
- calculate density so preview never removes too many channel rows.
- the guide remains the dominant work surface.

### Guide columns
Current channel column:
- w-40 sm:w-48 lg:w-56

Current program region:
- three equal columns for Now/Next/Later.

This is workable but still breakpoint-driven.

Required change:
- centralize channel-column widths by density mode.
- keep logos/numbers compact.
- program cells should stretch into additional width.
- consider time-axis behavior later if real EPG duration blocks become more exact.

### Row density
Current virtualized row height is fixed in component logic.

Required change:
- move row height to shared density tokens.
- TV/desktop target should preserve approximately 6-10 visible rows after header/preview.
- compact mode can reduce padding, logo size, and secondary text before hiding useful information.

---

# Legacy EPG

File:
- src/components/EPGView.tsx

Current code still uses:
- h-[calc(100vh-5.5rem)]
- min-h-[580px]
- negative margins
- fixed w-48/sm:w-60 channel columns
- fixed w-56/sm:w-64 program cards

App.tsx does not currently import or render EPGView.

Required action:
- confirm no other entrypoint uses EPGView.
- deprecate/remove it before reskin.
- do not spend time visually polishing a duplicate legacy guide.

---

# Watching guide overlay

File:
- src/components/WatchingGuideOverlay.tsx

Current:
- h-[76vh] min-h-[430px]
- max-h-[72vh]
- inner h-[min(58vh,520px)] min-h-[330px]
- fixed w-56 group pane
- pr-[18vw]

Mismatch:
These values can dominate short landscape screens and do not follow one centralized density contract.

Required change:
- use 100dvh-aware available-space math.
- clamp overlay height.
- clamp group pane width.
- remove viewport-width padding hacks where possible.
- preserve a clear portion of playing video when browsing during playback.

---

# Home

File:
- src/components/HomeView.tsx

## Current mismatch

Home contains several unrelated density systems:
- 2/3/4/5 columns
- 2/3/4/6 columns
- 1/2/4 columns
- poster grids with another pattern
- independent icon and tile sizes

This causes visible scale jumps between sections.

Required change:
Create shared card families:
- content-poster
- content-landscape
- channel-tile
- compact-row
- source-tile
- hero-feature

The Home hero should follow the Concept D / Unified Media Experience principle:
- content dominant
- restrained vertical footprint
- consistent rail
- compact continuation rows
- no oversized web-style dead space

---

# Movies

File:
- src/components/MoviesView.tsx

Current poster grid:
- grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6
- aspect-[2/3]

Mismatch:
On Android/Fire TV CSS viewport combinations, an insufficient column count can produce oversized posters. A larger physical screen should reveal more posters, not enlarge them indefinitely.

Required change:
- replace breakpoint-count-only grid with shared auto-fit/minmax poster grid.
- enforce intended poster min/max width.
- use full content canvas.
- hero height should be clamped and should not overwhelm catalog density.
- details modal remains centered dialog, not full-screen page.

---

# Series

File:
- src/components/SeriesView.tsx

Current poster grid mirrors Movies:
- 2/3/4/5/6 columns
- aspect-[2/3]

Required change:
- use the same shared poster-grid primitive as Movies.
- details modal currently max-w-4xl max-h-[92vh]; standardize against global modal shell.
- episode rows should stay compact and remote-friendly.

---

# Search

File:
- src/components/GlobalSearchView.tsx

Current top-level:
- max-w-6xl mx-auto

Mismatch:
Search becomes narrower than other primary customer-facing sections on large screens.

Required change:
- remove independent page max-width.
- Search is a full-canvas screen after the main rail.
- keep query input itself constrained if useful, but results should use the available canvas.
- use the same channel/card/poster primitives as Live/Favorites/Movies/Series.

---

# Favorites

File:
- src/components/FavoritesView.tsx

Current grids use their own independent breakpoint counts.

Required change:
- favorites should reuse shared channel tile / poster grid / compact history-row components.
- no independent density system.
- active focus treatment must match the rest of the app.

---

# Player

File:
- src/components/VideoPlayer.tsx

## What is correct

- fixed inset-0 full viewport canvas.
- video w-full h-full.
- contain/cover/fill aspect handling.
- playback controls are layered rather than shrinking the video.
- stream errors preserve navigation/control availability.

## Scaling issues to fix

- channel drawer fixed w-80.
- title max-widths and top control composition rely heavily on sm/md hiding.
- control groups can get dense in short landscape.
- overlays need safe-area and dynamic-height validation.
- fullscreen control surface should share button sizing tokens with the rest of the TV UI.

Required change:
- clamp drawer width.
- create compact player-OSD mode.
- keep true full-screen video.

---

# Floating PiP

File:
- src/components/FloatingPiPPlayer.tsx

Current examples:
- sm:w-[680px]
- h-64
- w-72
- secondary w-32

Mismatch:
Desktop-friendly fixed dimensions can be disproportionate on compact Android layouts.

Required change:
- use clamp() against viewport width and height.
- keep aspect ratio stable.
- maintain minimum usable controls.
- never overlap or block the entire app canvas on compact devices.

---

# Modals and settings surfaces

Files include:
- ServerSettingsModal.tsx
- ParentalControlsModal.tsx
- StreamingPerformanceModal.tsx
- ProfileSwitcherModal.tsx
- PinModal.tsx

## Current pattern

Several use:
- max-h-[92vh]
- local p-6
- independent grid/column logic
- varying header/body/footer geometry

Required change:
Create one modal-shell system:
- modal-sm
- modal-md
- modal-lg
- shared max height based on 100dvh
- shared compact/standard padding
- shared header/footer height
- body always independently scrollable
- responsive forms switch composition without giant controls

Primary app pages must not inherit modal-style max-width restrictions.

---

# Focus and remote behavior

File:
- src/index.css

Current global focus:
- scale(1.045)
- cyan ring/glow

This is strong for television visibility.

Issue:
In dense grids, scale can collide with neighbors.

Required rule:
- spacious cards/hero controls: scale + ring allowed.
- dense guide cells/rows/menus: no geometric scaling; use inset outline/glow/background only.
- every customer-facing control must remain keyboard, D-pad, touch, and mouse accessible.

Live TV already follows the dense-grid exception correctly.

---

# Shared system required before reskin

Create centralized responsive/density primitives rather than continuing local screen rules.

Recommended concepts:

## App density modes
- compact
- touch
- desktop
- tv

Mode should account for usable viewport geometry, not only Tailwind width breakpoints.

## Shared geometry tokens
- --gs-main-rail-collapsed
- --gs-main-rail-expanded
- --gs-group-rail-width
- --gs-topbar-height
- --gs-guide-row-height
- --gs-guide-channel-width
- --gs-card-gap
- --gs-page-pad-x
- --gs-page-pad-y
- --gs-poster-min
- --gs-poster-max
- --gs-landscape-min
- --gs-modal-pad
- --gs-focus-ring

Implementation can be CSS variables/utilities or a small typed layout configuration, but screen-level magic numbers should reduce substantially.

## Shared layout primitives
- FullCanvasPage
- ContentSection
- PosterGrid
- LandscapeGrid
- CompactList
- ModalShell
- GuideWorkspace

Do not over-componentize simple markup; the goal is one geometry contract.

---

# Implementation sequence

## Batch 1 — Geometry foundation
1. Add shared density/geometry tokens.
2. Remove independent TopBar max-width.
3. remove unused BottomNavBar import.
4. preserve 74/256 main rail baseline.
5. create full-canvas page utility.
6. create shared auto-fit poster/landscape grid utilities.

## Batch 2 — Live TV compliance
1. clamp Groups width.
2. normalize guide row/channel widths.
3. clamp preview height.
4. validate 6-10 visible rows.
5. normalize search/header density.
6. preserve existing navigation chain and virtualization.

## Batch 3 — Library screens
1. Movies shared poster grid.
2. Series shared poster grid.
3. Search full-canvas + shared grids.
4. Favorites shared grids.
5. Home card families.

## Batch 4 — Playback surfaces
1. WatchingGuideOverlay dynamic clamp.
2. VideoPlayer OSD compact mode.
3. clamp channel drawer.
4. clamp FloatingPiP dimensions.

## Batch 5 — Settings and cleanup
1. shared modal shell.
2. normalize large settings surfaces.
3. remove/deprecate EPGView.
4. remove/deprecate BottomNavBar file if unused.
5. remove stale one-off layout artifacts.

## Batch 6 — Validation matrix
- Android TV / Fire TV 1080p
- desktop 1920x1080
- desktop 1366x768
- tablet landscape
- compact Android landscape
- phone portrait
- touch
- mouse
- keyboard
- D-pad / arrows
- Back/Escape/Backspace behavior
- 1,000+ channel catalog
- long provider group names
- long channel/program titles

## Freeze gate before reskin

Do not begin final visual reskin until:
- main screens fill the intended canvas.
- TV shows more content instead of just larger content.
- no oversized posters/cards on TV.
- Live TV preserves compact guide density.
- no primary page is accidentally constrained by a centered web max-width.
- overlay/modals fit short landscape dynamic viewports.
- focus never clips or overlaps important dense-grid neighbors.
- cross-input navigation still passes.

After this freeze, the visual reskin can safely address final branding, color, gradients, artwork, shadows, typography finish, animation, and micro-interactions without preserving broken geometry.
