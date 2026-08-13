# Enterable Seeds

**Status:** Approved design — implementation follows.
**Date:** 2026-08-13

## Feature

The player can start a run from a specific seed (issue #65). The seed is
already minted per run, visible and copyable in the About modal (issue #64),
and `reset(seed)` in `src/state/simulation.ts` already accepts any seed — this
issue is the entry point for it. There are two ways in:

1. **A start screen** the game opens into on every load, with a seed field and
   a Start button.
2. **A `?seed=` URL parameter** that starts that run immediately on load,
   bypassing the start screen.

Starting a run from the UI pushes the run's seed into the URL, so the current
run is always link-shareable, not just copyable.

## Behaviour

- **Every load lands on the start screen** — unless the URL carries a
  `?seed=...` param, in which case that run starts immediately and the screen
  is skipped.
- The start screen is a minimal overlay: the game title, a seed field, a
  **Random** button that fills the field with a fresh seed, and a **Start**
  button. The board renders behind it, as with the modals. There is **no close
  button, even when opened mid-run** — Start is the only way out, and "New
  run" is a committed decision, like the DevPanel's Reset.
- **Start** with an empty field starts a random seed; with text, it uses that
  seed. Either way the seed is **trimmed and lowercased** (any non-empty string
  is a valid seed — the engine hashes whatever it gets), pushed into the URL,
  and the screen closes.
- **"Play again"** on the defeat screen keeps today's behaviour: a fresh random
  seed, skipping the start screen.
- A new **"New run"** button (in both the desktop and mobile HUD) opens the
  start screen from anywhere, abandoning the current run when Start is pressed.
- Starting a run — from the start screen or via Play again — writes
  `?seed=<normalized seed>` to the URL with `history.replaceState`, so Back
  does not step through runs and the link always reflects the current run.
- The About modal is unchanged: it shows and copies the same `GameState.seed`.

## Architecture

- **`src/ui/seedUrl.ts`** (new, pure, testable — the `copyText` pattern):
  - `normalizeSeed(input: string): string` — trim and lowercase. The single
    answer for seed shape, used by both the field and the URL read so they
    cannot disagree.
  - `seedFromUrl(search: string): string | null` — reads `?seed=...`, returns
    the normalized seed, or `null` when absent or empty after normalization.
    Takes the search string, so `window.location.search` is passed in by the
    caller.
- **`src/state/uiStore.ts`**: add `startScreenOpen: boolean` (default `true`)
  and `setStartScreenOpen`. View-only state, like `aboutOpen`.
- **`src/ui/StartScreen.tsx`** (new): the overlay. Form state is local; Start
  calls a pure decision helper (see below) then the same view-state clear
  `resetRun()` performs. Rendered from `Hud.tsx`, like About and PackShop.
- **`src/ui/cardActions.ts`**: `startRun(seed: string | null)` — the shared
  action both the start screen and Play again funnel through. It calls
  `reset(seed ?? random)`, writes the normalized seed to the URL, clears the
  leftover view state (the `resetRun` clear), and closes the start screen.
  `resetRun` can delegate to it with no seed.
- **`src/main.tsx`**: before `render()`, if `seedFromUrl(window.location.search)`
  is non-null, call `startRun(thatSeed)`. This is deliberately **not** in
  `simulation.ts` — that module is imported by `src/state/simulation.test.ts`
  under plain Node with no jsdom, so a module-scope `window` read there would
  throw in every test run. `simulation.ts` keeps booting a random run; the URL
  seed replaces it before first paint.
- **`src/ui/DesktopHud.tsx`** and **`src/ui/MobileHud.tsx`**: add the **New
  run** button calling `setStartScreenOpen(true)`.
- **`simulation.ts`**: export the existing `newSeed()` so the start screen's
  Random button and `startRun` can mint one. No behaviour change.
- **CSS**: start-screen layout in `src/index.css` — title, field, buttons,
  overlay over the board.

## Testing

- `src/ui/seedUrl.test.ts`: `normalizeSeed` (trim, case, empty) and
  `seedFromUrl` (absent, empty, whitespace-only, mixed case, extra params),
  with an injected search string so nothing touches a real URL.
- The start screen, the HUD buttons, and the `main.tsx` orchestration are
  renderer plumbing and stay untested, like the rest of `src/ui`. The engine is
  untouched, so no engine coverage changes.

## Non-goals

- No seed on the victory or defeat screens beyond Play again; the start screen
  is the seed home.
- No persistence: a run's seed survives only in the URL and the About modal,
  not in storage.
- No engine changes: `GameState.seed`, `createInitialState`, and `reset` are
  unchanged. `Math.random` stays confined to `simulation.ts`.
- No seed validation beyond trim + lowercase: any non-empty string is a run.
