# Mobile HUD Orientation Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the mobile HUD's single bottom bar into independent stats and actions clusters, positioned by orientation: portrait top/bottom, landscape full-height left/right rails.

**Architecture:** `MobileHud.tsx` stops wrapping stats and actions in one `mobileBar` div and renders `mobileStats` and `mobileActions` as sibling chrome-bearing groups. `index.css` moves the bar's chrome onto both clusters and adds `orientation` sub-blocks inside the existing mobile media query. The selected-card strip and TowerPanel follow the actions cluster / avoid the rails per orientation. No engine, state, or store changes.

**Tech Stack:** React (React Three Fiber app), zustand, plain CSS. No new dependencies.

## Global Constraints

- **Desktop is untouched.** All changes are inside `MobileHud.tsx` and the mobile `@media (max-width: 28rem), (max-height: 30rem)` block in `src/index.css`. No rule outside that block changes; `DesktopHud.tsx` is untouched.
- **The mobile media query stays `(max-width: 28rem), (max-height: 30rem)`**, identical to `MOBILE_LAYOUT_QUERY` in `src/ui/useMediaQuery.ts`. The orientation split is a refinement inside it, not a new breakpoint.
- **The strip's build/support toggle, Play, cancel, and hint behave exactly as before** — only position changes. `targetHint`, `rankModeLabel`, `supportModeLabel`, `untargetedPlay`, `selectCard` are untouched.
- **Chrome travels with each cluster.** `pointer-events: auto`, background, and border move off `.mobileBar` onto both `.mobileStats` and `.mobileActions`. Without `pointer-events: auto` the clusters would be click-through (`.hud` is `pointer-events: none`).
- **The touch-hygiene `@media` block's `.mobileBar` selector becomes `.mobileStats, .mobileActions`** (plus `.mobileStrip`, unchanged) so `touch-action: manipulation` and `user-select: none` still apply. `.mobileBar` no longer exists.
- **Safe-area insets per orientation:** portrait stats use `env(safe-area-inset-top)`, portrait actions `env(safe-area-inset-bottom)`, landscape stats `env(safe-area-inset-left)`, landscape actions `env(safe-area-inset-right)`.
- **No jsdom / no component tests.** Verification is `pnpm build && pnpm lint && pnpm test:run` plus manual smoke in both orientations. The landscape strip and TowerPanel positions are flagged for the user's playtest (spec §3, §4).
- **The two `@media` blocks in index.css are NOT to be merged** (a deferred minor from the prior plan); only the `.mobileBar` selector inside the hygiene block changes.
- Do not add comments unless they explain a non-obvious decision; keep existing load-bearing comments accurate (e.g. the "mirrored in useMediaQuery.ts" comment).

---

### Task 1: Split `MobileHud` into sibling stats and actions clusters

**Files:**
- Modify: `src/ui/MobileHud.tsx`

**Interfaces:**
- Consumes: the existing `mobileStats` `<dl>` and `mobileActions` `<div>` JSX, currently nested inside a `<div className="mobileBar">`.
- Produces: two sibling chrome-bearing groups, `mobileStats` and `mobileActions`, rendered directly under the fragment. The `mobileStrip` conditional and `DeckOverlay` mount points are unchanged. Task 2 consumes these exact class names in CSS.

This task is the JSX restructure only — no CSS yet, so the layout will look broken until Task 2 lands. That is expected; keep the commit scoped to the component.

- [ ] **Step 1: Restructure the render output**

In `src/ui/MobileHud.tsx`, the render currently is:

```tsx
  return (
    <>
      <div className="mobileBar">
        <dl className="mobileStats">
          <div>
            <dt>Round</dt>
            <dd>{roundNumber}</dd>
          </div>
          <div>
            <dt>Ink</dt>
            <dd>{ink}</dd>
          </div>
          <div>
            <dt>Core</dt>
            <dd>
              {core.health}
              <span className="hud__muted"> / {core.maxHealth}</span>
            </dd>
          </div>
        </dl>

        <div className="mobileActions">
          {phase === 'defeated' ? (
            <button type="button" className="hud__button" onClick={resetRun}>
              Play again
            </button>
          ) : (
            <button
              type="button"
              className="hud__button"
              disabled={phase !== 'gap'}
              onClick={() => dispatch({ kind: 'startRound' })}
            >
              {phase === 'gap' ? `Start round ${roundNumber}` : 'In progress'}
            </button>
          )}

          <button
            type="button"
            className="hud__button"
            disabled={phase !== 'gap'}
            onClick={() => setPackShopOpen(true)}
          >
            Packs
          </button>

          <button
            type="button"
            className="hud__button hud__button--quiet"
            onClick={() => setDeckOpen(true)}
          >
            Deck
          </button>

          <button
            type="button"
            className="hud__button hud__button--quiet"
            onClick={() => setCreditsOpen(true)}
          >
            Credits
          </button>
        </div>
      </div>
```

Change it to drop the `<div className="mobileBar">` wrapper and its closing `</div>`, rendering `mobileStats` and `mobileActions` as direct siblings (dedent by one level):

```tsx
  return (
    <>
      <dl className="mobileStats">
        <div>
          <dt>Round</dt>
          <dd>{roundNumber}</dd>
        </div>
        <div>
          <dt>Ink</dt>
          <dd>{ink}</dd>
        </div>
        <div>
          <dt>Core</dt>
          <dd>
            {core.health}
            <span className="hud__muted"> / {core.maxHealth}</span>
          </dd>
        </div>
      </dl>

      <div className="mobileActions">
        {phase === 'defeated' ? (
          <button type="button" className="hud__button" onClick={resetRun}>
            Play again
          </button>
        ) : (
          <button
            type="button"
            className="hud__button"
            disabled={phase !== 'gap'}
            onClick={() => dispatch({ kind: 'startRound' })}
          >
            {phase === 'gap' ? `Start round ${roundNumber}` : 'In progress'}
          </button>
        )}

        <button
          type="button"
          className="hud__button"
          disabled={phase !== 'gap'}
          onClick={() => setPackShopOpen(true)}
        >
          Packs
        </button>

        <button
          type="button"
          className="hud__button hud__button--quiet"
          onClick={() => setDeckOpen(true)}
        >
          Deck
        </button>

        <button
          type="button"
          className="hud__button hud__button--quiet"
          onClick={() => setCreditsOpen(true)}
        >
          Credits
        </button>
      </div>
```

Everything after (the `mobileStrip` conditional and the `DeckOverlay` mount) is unchanged. No logic, imports, or handlers change — this is a structural edit only.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: all clean (854 tests / 50 files). No new or changed tests — the JSX restructure carries no behavior change.

- [ ] **Step 3: Commit**

```bash
git add src/ui/MobileHud.tsx
git commit -m "refactor(ui): render mobile stats and actions as sibling clusters"
```

---

### Task 2: Position stats and actions by orientation in CSS

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: the `mobileStats` and `mobileActions` class names from Task 1; the existing mobile `@media` block and touch-hygiene block.
- Produces: the final mobile layout — portrait top/bottom bars, landscape left/right rails — plus the strip and TowerPanel placements.

This task rewrites the `.mobileBar` rule in the mobile `@media` block and adds two `orientation` sub-blocks. The two changes to the touch-hygiene block are: the `.mobileBar` selector becomes `.mobileStats, .mobileActions`, and the `.towerPanel` offset becomes orientation-dependent.

- [ ] **Step 1: Replace the `.mobileBar` rule with per-cluster chrome**

In `src/index.css`, the mobile `@media (max-width: 28rem), (max-height: 30rem)` block currently starts with a `.mobileBar` rule (positioned `bottom: 0`, full-width, with background, border-top, pointer-events, and safe-area padding). Replace that rule with:

```css
  /* Shared chrome for the two mobile clusters: stats and actions each carry
     the background, border, and pointer-events the single bar used to own.
     Placement differs per orientation — see the orientation blocks below. */
  .mobileStats,
  .mobileActions {
    position: absolute;
    pointer-events: auto;
    display: flex;
    border: 1px solid rgb(255 255 255 / 12%);
    background: rgb(16 20 26 / 88%);
    color: #e8edf4;
  }
```

- [ ] **Step 2: Add the portrait and landscape orientation blocks**

Immediately after the shared chrome rule, inside the same `@media` block, add:

```css
  /* Portrait: stats top (notch-safe), actions bottom (home-indicator-safe).
     The board keeps the vertical middle. */
  .mobileStats {
    top: 0;
    left: 0;
    right: 0;
    align-items: center;
    justify-content: center;
    padding: 0.45rem 0.7rem;
    padding-top: calc(0.45rem + env(safe-area-inset-top));
    border-bottom-left-radius: 0.6rem;
    border-bottom-right-radius: 0.6rem;
  }

  .mobileActions {
    bottom: 0;
    left: 0;
    right: 0;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.45rem 0.7rem;
    padding-bottom: calc(0.45rem + env(safe-area-inset-bottom));
    border-top-left-radius: 0.6rem;
    border-top-right-radius: 0.6rem;
  }
```

Then add a separate `@media` block **after both existing mobile `@media` blocks** (i.e. after the touch-hygiene block's closing brace, at the end of the file), for the landscape rails. It must come last so its `.towerPanel` override (Step 3) beats the touch-hygiene block's `bottom` rule:

```css
/* Landscape: stats become a full-height left rail, actions a full-height
   right rail, so the board keeps the full vertical centre. */
@media (max-width: 28rem) and (orientation: landscape),
  (max-height: 30rem) and (orientation: landscape) {
  .mobileStats {
    left: 0;
    top: 0;
    bottom: 0;
    /* Clears the portrait rule's `right: 0` — without this the rail would
       span the full width and cover the board. */
    right: auto;
    flex-direction: column;
    justify-content: center;
    gap: 0.8rem;
    padding: 0.7rem 0.45rem;
    padding-left: calc(0.45rem + env(safe-area-inset-left));
    border-top-right-radius: 0.6rem;
    border-bottom-right-radius: 0.6rem;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  .mobileActions {
    right: 0;
    top: 0;
    bottom: 0;
    /* Clears the portrait rule's `left: 0` — same full-width trap. */
    left: auto;
    flex-direction: column;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.7rem 0.45rem;
    padding-right: calc(0.45rem + env(safe-area-inset-right));
    border-top-left-radius: 0.6rem;
    border-bottom-left-radius: 0.6rem;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
}
```

Notes:
- The portrait rules set `top`/`bottom` and `left`/`right`; the landscape rules override the same properties, so a landscape phone gets rails and a portrait phone gets bars. The mobile query already matches both orientations — portrait via `max-width`, landscape via `max-height` — so these are refinements, not new breakpoints.
- The `flex-direction: column` on the landscape rails stacks the three stats and four buttons vertically; portrait keeps the default row direction.
- The `border-*-radius` overrides square off the inner corner of each rail so it sits flush against the screen edge.

- [ ] **Step 3: Move the strip and TowerPanel with the actions**

Still in `src/index.css`:

1. The existing `.mobileStrip` rule (positioned `left: 0.7rem; right: 0.7rem; bottom: calc(3.2rem + env(safe-area-inset-bottom))`) is already the correct portrait placement — above the bottom actions bar. Leave it. In the landscape `@media` block from Step 2, add:

```css
  /* The selected-card strip follows the actions. In landscape the rail is too
     narrow for the mode-toggle labels, so the strip floats just left of the
     right rail, bottom-aligned, thumb-near the actions. */
  .mobileStrip {
    left: auto;
    right: calc(6rem + 0.7rem);
    bottom: 0.7rem;
    width: min(24rem, calc(100% - 8rem));
  }
```

   The `right: calc(6rem + 0.7rem)` clears the right rail (rail width ~6rem); `width` bounds the strip so it does not span the whole board.

2. In the touch-hygiene `@media` block, the selector list currently includes `.mobileBar`. Change it to `.mobileStats, .mobileActions`:

```css
  .hud button,
  .hud .deck__card,
  .modal button,
  .mobileStats,
  .mobileActions,
  .mobileStrip {
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
```

3. The touch-hygiene block's `.towerPanel` offset rule:

```css
  /* The Tower panel moves above the bar so the two never overlap. */
  .towerPanel {
    bottom: calc(3.6rem + env(safe-area-inset-bottom));
  }
```

   This is the correct portrait placement — keep it. The landscape `@media` block from Step 2 must come **after** this touch-hygiene block (source order matters: both rules have equal specificity and the landscape override's `bottom: auto` has to beat this `bottom` value). Add the landscape override to that block so the panel sits top-right, left of the right rail:

```css
  /* The inspect panel avoids the full-height right rail: anchored top-right,
     left of it. Placed after the touch-hygiene block so its `bottom: auto`
     overrides the portrait `bottom` offset from that block. */
  .towerPanel {
    top: 0.7rem;
    right: calc(6rem + 0.7rem);
    bottom: auto;
  }
```

- [ ] **Step 4: Verify**

Run: `pnpm build && pnpm lint && pnpm test:run`
Expected: all pass (854 tests / 50 files). Then manual smoke:
- DevTools responsive mode, 430×932 (portrait): stats bar at the top, actions bar at the bottom, strip above the actions, TowerPanel above the actions.
- DevTools responsive mode, 932×430 (landscape): stats as a left rail, actions as a right rail, strip bottom-left of the right rail, TowerPanel top-left of the right rail.
- Desktop ≥1024px: unchanged (this task only edits rules inside the mobile `@media` blocks).

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(ui): position mobile stats and actions by orientation — portrait bars, landscape rails"
```

---

## Self-Review

**Spec coverage:**
- §1 (split `mobileBar`, two sibling clusters, placed by orientation) → Tasks 1 and 2.
- §2 (chrome travels, safe-area per orientation, row vs column) → Task 2 Steps 1-2.
- §3 (strip follows actions; portrait above bottom bar, landscape left of right rail) → Task 2 Step 3.
- §4 (TowerPanel portrait above bottom bar, landscape top-right left of rail) → Task 2 Step 3.
- §5 (touch-hygiene `.mobileBar` selector → `.mobileStats, .mobileActions`) → Task 2 Step 3.
- Rejected items: none resurrected. No orientation-specific components, no single-bar reorder, no full-height rails in portrait, no strip-inside-rail.

**Placeholder scan:** No TBD/TODO. Every CSS step has concrete rules. Every task ends with explicit verification commands.

**Type consistency:** No TS types change. Class names `mobileStats`, `mobileActions`, `mobileStrip`, `towerPanel` are consistent across Tasks 1 and 2. The media query strings are copied verbatim from the spec (`(max-width: 28rem), (max-height: 30rem)` plus the `orientation` refinements).
