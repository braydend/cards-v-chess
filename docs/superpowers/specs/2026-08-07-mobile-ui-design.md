# Mobile UI — Design

**Date:** 2026-08-07
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The game works well on a full-size desktop browser, but the HUD is a left-hand
panel sized for a mouse and a wide viewport. On a phone it fails in specific,
predictable ways:

- **The HUD panel covers the board.** `.hud__panel` is `min-width: min(24rem,
  100%)` and left-anchored. On a narrow viewport it becomes effectively full
  width, so the thing the player must see — the board — is hidden behind the
  thing they use to act on it.
- **Coverage preview is hover-driven.** `CoveragePreview` renders against
  `hoveredSquare`, which `PlacementSurface` sets from `onPointerMove`. Touch has
  no continuous pointer position, so the teal footprint and red illegal marker —
  the design doc's core legibility feature — never appear before a tap commits.
- **Tap targets are mouse-sized.** Mini-cards at `2.4rem` minimum and small
  buttons are hard to hit with a thumb.
- **The DOM can scroll or zoom under a touch.** Buttons have no
  `touch-action: manipulation`, so a double-tap can zoom the page; `100vh` on
  iOS measures behind the URL bar; the notch is not accounted for.
- **Stats overflow.** Six stats in the HUD row crowd a phone-sized panel.

## Decision

**Responsive, not a rewrite.** The desktop experience stays pixel-identical —
it is the same JSX, gated behind a media query — and mobile gets a thin
always-visible bar plus a deck overlay, with touch-aware placement.

**A deliberate exception:** the HUD stats row is *simplified on both devices* —
Round, Ink, Core survive; Leaks, Pieces, Towers are dropped. Core already
communicates what Leaks did (each leak costs exactly 1 Core health), and
Pieces/Towers are transient mid-round counts. This is the one desktop-visible
change, and it is made deliberately so both device experiences share one HUD
semantic.

### 1. Two independent questions, two separate detections

The current code conflates two things that must be decided separately:

1. **Layout** — is the viewport phone-shaped? Decides panel vs. thin bar.
2. **Behavior** — does the device have touch? Decides tap-to-preview vs.
   click-to-play.

Keyed differently on purpose:

| Question | Query | Drives |
| --- | --- | --- |
| Layout | `(max-width: 28rem), (max-height: 30rem)` | thin bar vs. `hud__panel` |
| Behavior | `(pointer: coarse)` | tap-to-preview vs. click-to-play |

- **Layout is viewport-shaped, not pointer-shaped.** A mouse on a short laptop
  window still gets click-to-play; a resized desktop window still gets the thin
  bar. This is landscape-first with a portrait fallback: an iPhone in landscape
  (812–932px wide, 375–430px tall) hits `max-height`; an iPhone in portrait hits
  `max-width`. `28rem` (448px) is chosen deliberately over the tighter `26rem`
  so the largest portrait phones — iPhone Pro Max at 430px, and Android phones
  up to ~432px — land in the mobile layout. An iPad is wide *and* tall, so it
  gets the desktop panel, which genuinely fits there — tablets are a graceful
  win rather than a third layout.
- **Behavior is pointer-shaped, not viewport-shaped.** A touchscreen laptop with
  a phone-shaped window should still click-to-play; `(pointer: coarse)` is what
  a real tap is. This is what keeps the desktop interaction model provably
  intact.

A `useMediaQuery` hook in `src/ui/useMediaQuery.ts` wraps `matchMedia` and
subscribes. Client-only, so there is no SSR concern.

### 2. One HUD, two layout branches

`Hud.tsx` calls the layout hook. Desktop renders the current JSX **verbatim** —
the `hud__panel` column — unchanged. Mobile renders a new `MobileHud`.

"Desktop exact" is structural, not aspirational: the desktop branch is the
existing markup, so a regression would have to be a change to that branch
itself. Shared leaves are reused, not duplicated: `CardFace`, the stats, and the
pure label functions (`rankModeLabel`, `supportModeLabel`, `targetHint`) are
already module functions or components and are imported by both branches.

### 3. The mobile layout: thin bar + deck overlay

`MobileHud` renders three layers over the canvas:

**Thin bar** — a slim always-visible strip at the **bottom** of the screen
(thumb-friendly in landscape), containing:

- Compact stats: Round, Ink, Core — condensed to a tight row.
- A **Deck** button, opening the overlay.
- **Start round** and **Buy a pack**, disabled per the same `phase` rules as
  desktop.
- **Credits**, matching the desktop HUD's access.
- When a Card is selected, the bar grows into a **selected-card strip**: the
  card label, the build/support mode toggle, and a cancel (✕). The Play action
  for King/Ace/Joker — untargeted plays — lives on this strip; they should not
  require a board tap.

**Deck overlay** — opened by the Deck button. A full-screen sheet (scrim +
panel, exactly the modal pattern, so dismissing is free and needs no rollback).
It shows the card grid with larger touch targets. On picking a Card the overlay
**closes**, the Card is selected, and the player is back on the board with the
selected-card strip visible; reopening the deck keeps the selection. The mode
toggle and Play live in the strip, so the overlay is purely a picker.

**TowerPanel** — currently `absolute; right: 0; bottom: 0`, which would collide
with the thin bar. On mobile it is anchored just *above* the bar, same content.

The modals (PackShop, Credits) are centered and width-capped; they already
reflow acceptably on a landscape phone. The cull grid gets the same touch-target
sizing as the deck.

CSS: new classes are scoped to mobile; the desktop `.hud__panel` block is
untouched. The stats cut (§ above) is the only shared-CSS edit, and it is a
removal of three cells from a shared markup block.

### 4. The play choice is the existing mode toggle

"Play as a boost or as a tower" was raised as a possible new confirmation
dialog. **Rejected.** The existing mode toggle already is that choice, and a
dialog would add a tap to every card play on both devices. Desktop keeps its
current detail block; mobile puts the same two-button toggle (Build / Support)
in the selected-card strip. The choice happens at play time, exactly as the
design doc's grammar — "rank builds, suit supports" — already prescribes.

### 5. Touch placement: tap to preview, tap to play

Gated on `(pointer: coarse)`. With a build-mode Card selected:

- The **first tap** on a square *previews* — the teal footprint and red illegal
  marker render against that square, exactly as hover does on desktop. A tap on
  a different square re-previews there.
- The **second tap** on the *same square* plays the Card.
- Support-mode and face-card plays (repair, shield, echo, King/Ace/Joker) are
  **single-tap** — they have no footprint to preview.

This is the one section the user flagged for playtesting: the two-tap cadence is
an assumption to be confirmed empirically, not a settled fact.

**Plumbing, following the existing architecture:**

- `uiStore` gains `previewedSquare: Square | null` and its setter — view-only
  state, exactly the class `uiStore.ts` exists for. It is excluded from
  `structuralKey` by construction (it lives in `uiStore`, not the snapshot).
- `boardClick.ts` (the pure, tested decision module) gains a `pointer` field on
  `BoardClickContext`. With `pointer: 'coarse'`, a build-mode card, and a square
  that is not already the previewed one, `resolveBoardAction` returns a new
  **`preview`** action instead of `play`. A second tap resolving to the same
  square returns `play` as today. The `pointer` value is passed in by `Board.tsx`
  from the same `useMediaQuery` hook.
- Preview fires on **any** square, legal or not — exactly as hover does on
  desktop. `CoveragePreview`'s red marker is what teaches the player that a
  square is illegal; on touch that is the only way they learn it, so the preview
  must not be gated on legality. The second tap's play is refused by the engine
  and the selection is preserved, which is the existing refusal path.
- `CoveragePreview` renders against `hoveredSquare` on fine pointers and
  `previewedSquare` on coarse. It is the same footprint machinery; only the
  square source changes. The `renderOrder` ladder and height bands are
  untouched.
- **No engine changes.** Preview is view state; `commandFor` and the play
  commands are identical. `src/game/` is untouched.
- `boardClick.test.ts` extends with coarse-pointer cases: first tap previews,
  same-square second tap plays, different-square second tap re-previews, and a
  fine pointer never previews.

### 6. Mobile hygiene

The details that make a phone feel like a phone rather than a shrunken desktop:

- **Touch targets.** Cards and buttons get a mobile minimum size (~44px). The
  deck and cull grids already use `auto-fill, minmax(2.4rem, 1fr)`; mobile bumps
  the minimum. `:hover` effects get no mobile styles.
- **Scroll containment.** The canvas already owns `touch-action: none` (pinch
  and orbit). The thin bar, deck overlay, and modals are scrollable and get
  `touch-action: pan-y` + `overscroll-behavior: contain`, so scrolling the deck
  does not orbit the board underneath.
- **iOS Safari.** `100vh` is the URL-bar trap; the HUD and overlay sheets size
  against the visible area, not `100vh`. The viewport meta gains
  `viewport-fit=cover`, and the thin bar pads inside `env(safe-area-inset-*)` in
  landscape so the notch/dynamic island does not cover it.
- **Double-tap zoom.** Buttons declare `touch-action: manipulation`.
- **Text selection / callout.** `user-select: none` on interactive chrome so a
  long-press on a card does not fire iOS's magnifier or callout menu.

## Rejected

- **A drag-ghost placement flow.** A footprint ghost following a drag, native to
  mobile games, was considered and rejected as significantly more work (drag +
  drop, ghost state, gesture arbitration with orbit) for a first pass. Tap →
  preview → tap is the minimum that preserves the footprint.
- **A "play as boost or tower" confirmation dialog.** The mode toggle already is
  that choice; a dialog adds a step on every play. See §4.
- **A bottom-sheet HUD** (the whole panel sliding up, not just the deck). The
  board loses too much vertical space, and the tall Deck is the part that needs
  an overlay — hence thin bar + deck overlay. This was the user's explicit
  choice.
- **A narrow side panel on mobile.** Competes with the board for width on a
  landscape phone.
- **Pinning or reframing the camera for mobile.** Orbit stays exactly as-is;
  the board must still be inspectable from different angles, and camera work is
  a separate, cosmetic problem (see the shadow-frustum note in CLAUDE.md). The
  mobile layout must work *with* the existing camera, not ask for a new one.
- **An explicit "mobile" hard breakpoint by width alone.** A width-only
  breakpoint misfires on split-screen or resized desktop windows; the
  height-aware layout query handles landscape phones precisely.

## Consequences

- **Desktop pixel-identity is structural** — same JSX branch, unchanged — with
  one deliberate exception: the stats row loses Leaks, Pieces, Towers on both
  devices.
- **Coverage legibility survives touch.** Tap-to-preview keeps the teal/amber
  footprint story the design doc treats as essential, and §5's coarse-pointer
  gate means the desktop interaction model is unchanged.
- **No engine or `src/game/` changes.** All mobile behavior is view-layer:
  `uiStore`, `boardClick`, `CoveragePreview`, `Hud`/`MobileHud`, and CSS.
- **No new dependencies.** `matchMedia` is built in; the layout query is
  CSS-native.
- **Testing is bounded by the repo's constraint.** No jsdom, no component tests
  — so layout CSS and the `MobileHud` JSX are verified manually on a real
  device. The verifiable logic is the coarse-pointer branch in `boardClick.ts`
  (Vitest) and the `useMediaQuery` hook (a thin wrapper; test only what it
  decides, not that matchMedia fires). The two-tap cadence is flagged for the
  user's playtest.
