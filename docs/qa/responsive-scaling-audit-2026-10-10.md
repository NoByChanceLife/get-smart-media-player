# Get Smart Media Player — Responsive Scaling Audit
Date: 2026-10-10
Scope: current main branch UI shell and React components before planned visual reskin.

## Executive finding

The app now has a workable cross-input navigation foundation, but responsive sizing is inconsistent because individual screens were authored with different breakpoint assumptions, fixed widths, viewport formulas, and card-density rules. The recent rail-layout fix established the correct shell contract: persistent navigation must reserve physical layout space wherever it is visible.

The next pass should standardize layout tokens and responsive behavior before the visual reskin so the reskin does not preserve conflicting geometry.

## Regression-protected shell baseline

- Persistent Get Smart rail owns layout width at every viewport where it is visible.
- Collapsed rail reserves 74px; expanded rail reserves 256px.
- Live TV Groups remains visible and separate from the app rail.
- Live TV navigation chain: Main Rail ↔ Groups ↔ Channels ↔ Now ↔ Next ↔ Later ↔ Favorite.
- Repeated Left is the safe escape/reset path back to Main Rail.
- Real Android hardware is the current performance reference; software-rendered TV emulator is functional/layout QA only.

## Critical / high-priority scaling findings

### 1. App-wide layout system is not centralized
Most screens use local Tailwind width, padding, breakpoint, height, and grid rules. There is no single compact/TV density contract. This is the main source of inconsistent scale.

Affected examples:
- App shell padding and rail offsets: src/App.tsx
- Live TV column widths and viewport math: src/components/LiveTVView.tsx
- Home card grids and hero sizing: src/components/HomeView.tsx
- Movies/Series poster grids: src/components/MoviesView.tsx, src/components/SeriesView.tsx
- Search/Favorites grids: src/components/GlobalSearchView.tsx, src/components/FavoritesView.tsx

Recommended direction: create shared responsive layout/density tokens before reskin.

### 2. Breakpoint-driven poster grids can create oversized thumbnails
Movies and Series use:
- grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6
- aspect-[2/3]

Search and Favorites use similar breakpoint-count grids. On Android devices with unusual CSS viewport/density combinations, too few columns can be selected for the physical landscape width, producing very large posters.

Recommended direction: replace major poster grids with an auto-fit/minmax card-width system or a shared responsive card-grid utility based on minimum/maximum card width, not only Tailwind breakpoint counts.

### 3. Home has multiple independent card-density systems
Home uses several different grids:
- 2/3/4/5 columns
- 2/3/4/6 columns
- 1/2/4 columns
- poster grids 2/3/4/5 columns

These create visible scale jumps between sections and devices.

Recommended direction: define shared content-card classes for live tiles, source tiles, landscape cards, and posters.

### 4. EPGView uses legacy viewport assumptions
EPGView still has:
- h-[calc(100vh-5.5rem)]
- min-h-[580px]
- -m-4 sm:-m-6
- fixed channel/program widths (w-48/sm:w-60; w-56/sm:w-64)

This conflicts with the newer LiveTVView approach and can overflow or over-scale on short landscape Android viewports.

Recommended direction: either retire EPGView if no longer customer-facing, or convert it to the same dynamic-height and density contract as LiveTVView.

### 5. WatchingGuideOverlay has large fixed viewport occupancy
WatchingGuideOverlay uses:
- h-[76vh] min-h-[430px]
- max-h-[72vh]
- inner h-[min(58vh,520px)] min-h-[330px]
- fixed w-56 groups pane

On short/wide phone landscapes this can occupy too much of the viewing surface or force cramped content.

Recommended direction: clamp height by available dynamic viewport and scale group width from compact to TV.

## Medium-priority scaling inconsistencies

### TopBar
- max-w-7xl centers the header independently from the full-width app shell.
- multiple hidden sm/lg/xl controls change composition abruptly.
- compact Android landscapes can display a dense control cluster.

Direction: define compact, standard, and TV header modes.

### TVNavigationRail
- width contract is now structurally correct.
- internal padding/row heights remain constant across short phone landscapes and full TV screens.
- continuous scroll solves clipping, but density should later adapt modestly by available height.

Direction: preserve 74/256 shell widths unless user testing says otherwise; adjust row density rather than width during reskin.

### FloatingPiPPlayer
Uses fixed widths/heights such as 680px, h-64, w-72, w-32. These are reasonable desktop values but can be disproportionate on compact Android layouts.

Direction: clamp to available viewport dimensions.

### VideoPlayer overlays
Player controls are generally responsive, but the channel drawer is fixed at w-80 and several top/bottom control rows rely on hide-at-sm/md behavior. Requires compact landscape validation.

### Modals
Server Settings, Parental Controls, Streaming Performance, Profile Switcher, and PIN modal mostly use max-width/max-height correctly, but padding and multi-column forms vary considerably. Large modals use max-h-[92vh] and local p-6 patterns.

Direction: standardize modal shell padding/header/footer/body sizing and use 100dvh-safe maximum heights.

### StreamHealthPanel
Fixed w-88/sm:w-96 with max viewport width is safe horizontally, but top offset and panel height should be tested on short landscape Android displays.

## Low-priority / cleanup

- BottomNavBar component remains in the repository even though App no longer renders it. Remove or explicitly mark deprecated after navigation baseline is locked.
- App.tsx still imports BottomNavBar although it is no longer rendered.
- Old EPGView may now duplicate the unified Live TV design. Confirm whether it has any remaining route/use before reskin.
- Development image fallbacks using /src/assets/... should be replaced with packaged/imported assets separately from scaling work.

## Proposed implementation order

1. Lock shell geometry and remove/deprecate duplicate navigation artifacts.
2. Introduce shared responsive layout/density tokens.
3. Fix poster/card grids app-wide.
4. Normalize Home section densities.
5. Normalize Live TV / guide overlays and legacy EPG dimensions.
6. Normalize TopBar and modal shells.
7. Validate Samsung landscape, Android TV 1080p, desktop browser, mouse/touch/D-pad.
8. Freeze responsive baseline.
9. Begin visual reskin on top of the stable geometry.

## Current quality assessment before reskin

Functional/beta maturity: strong.
Visual and responsive consistency: incomplete.
The main product risk is no longer core navigation architecture; it is inconsistent layout density across device classes.

