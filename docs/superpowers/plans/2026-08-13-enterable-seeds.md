# Enterable Seeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player start a run from a specific seed, via a start screen on every load or a `?seed=` URL parameter, with the seed pushed into the URL when a run starts (issue #65).

**Architecture:** A start screen is a view-state overlay (`startScreenOpen` in `uiStore`, default `true`), exactly like the PackShop and About modals. The engine is untouched: `reset(seed)` in `src/state/simulation.ts` already accepts any seed, so starting a run is one call. A pure, testable `src/ui/seedUrl.ts` owns seed normalization and URL parsing; `main.tsx` reads the URL once before render. The renderer-only parts (the screen, the buttons, the URL write) stay untested per the repo's `src/ui` policy.

**Tech Stack:** React, zustand (`uiStore`), Vite, Vitest, TypeScript strict.

## Global Constraints

- TypeScript strict; `pnpm typecheck` must pass after every task.
- `Math.random` stays confined to `src/state/simulation.ts` — never in `src/game/`.
- No direct imports from inside `src/game/` in `src/ui/`/`src/state/` — go through `src/game/index.ts` or `src/state/*` only. (This plan imports only `src/state/simulation` and existing `src/ui` modules, so the rule is satisfied.)
- No `setState` inside effects (`react-hooks/set-state-in-effect`). Adjust view state during render (the `PackShop` "reset on prop change" pattern) or from event handlers.
- `resetRun` must keep clearing `uiStore` view state — the renderer never resets a run without also clearing its own selection state (see `src/ui/cardActions.ts` docstring).
- Domain vocabulary: "Run seed", "New run", "Start", "Random". Never "wave" or "tower" for the faction or seed concepts.
- View-state additions go in `uiStore`; simulation/engine files do not change behaviour.

---

### Task 1: `seedUrl.ts` — pure seed normalization and URL parsing (TDD)

**Files:**
- Create: `src/ui/seedUrl.ts`
- Test: `src/ui/seedUrl.test.ts`

**Interfaces:**
- Produces:
  - `normalizeSeed(input: string): string` — trims and lowercases. The single answer for seed shape; the field and the URL read both call it so they cannot disagree.
  - `seedFromUrl(search: string): string | null` — returns the normalized `?seed=` value, or `null` when the param is absent or empty after normalization. Takes the raw search string so the caller supplies `window.location.search`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/seedUrl.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeSeed, seedFromUrl } from './seedUrl'

describe('normalizeSeed', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeSeed('  abcd1234  ')).toBe('abcd1234')
  })

  it('lowercases', () => {
    expect(normalizeSeed('AbCd1234')).toBe('abcd1234')
  })

  it('trims and lowercases together', () => {
    expect(normalizeSeed('  MiXeD_SeEd  ')).toBe('mixed_seed')
  })

  it('passes an already-normal seed through unchanged', () => {
    expect(normalizeSeed('abcd1234')).toBe('abcd1234')
  })

  it('reduces whitespace-only input to empty', () => {
    expect(normalizeSeed('   ')).toBe('')
  })
})

describe('seedFromUrl', () => {
  it('returns null when there is no search string', () => {
    expect(seedFromUrl('')).toBeNull()
  })

  it('returns null when the seed param is absent', () => {
    expect(seedFromUrl('?foo=1&bar=2')).toBeNull()
  })

  it('returns null when the seed param is empty', () => {
    expect(seedFromUrl('?seed=')).toBeNull()
  })

  it('returns null when the seed param is whitespace-only', () => {
    expect(seedFromUrl('?seed=%20%20')).toBeNull()
  })

  it('returns the normalized seed', () => {
    expect(seedFromUrl('?seed=AbCd1234')).toBe('abcd1234')
  })

  it('trims and lowercases the value', () => {
    expect(seedFromUrl('?seed=%20MiXeD_SeEd%20')).toBe('mixed_seed')
  })

  it('ignores extra params around the seed', () => {
    expect(seedFromUrl('?foo=1&seed=abcd1234&bar=2')).toBe('abcd1234')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/ui/seedUrl.test.ts`
Expected: FAIL — module `./seedUrl` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/seedUrl.ts`:

```ts
/**
 * Normalises a user-supplied seed to the shape the engine expects.
 *
 * The engine hashes whatever string it is given, so "same seed" means "same
 * characters". A URL or a copy-paste can smuggle in leading/trailing
 * whitespace or an inconsistent case, so this is the single answer for seed
 * shape — the start-screen field and the URL read both call it, and they
 * cannot disagree. Any non-empty string is a valid seed; nothing else is
 * validated.
 */
export function normalizeSeed(input: string): string {
  return input.trim().toLowerCase()
}

/**
 * Reads the `?seed=` value from a URL search string.
 *
 * Takes the raw search string rather than touching `window.location`, so the
 * decision is pure and testable. Returns the normalised seed, or `null` when
 * the param is absent or empties on normalisation — an absent seed and an
 * unplayable one are the same thing to the caller.
 */
export function seedFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get('seed')
  if (raw === null) return null

  const normalized = normalizeSeed(raw)
  return normalized === '' ? null : normalized
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/ui/seedUrl.test.ts`
Expected: PASS (all 13 tests).

- [ ] **Step 5: Verify the full suite still passes**

Run: `pnpm test:run`
Expected: PASS. Then `pnpm typecheck` and `pnpm lint` — both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/seedUrl.ts src/ui/seedUrl.test.ts
git commit -m "feat: pure seed normalization and URL parsing (issue #65)"
```

---

### Task 2: Export `newSeed` and add `startScreenOpen` to `uiStore`

**Files:**
- Modify: `src/state/simulation.ts:27-29`
- Modify: `src/state/uiStore.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `export function newSeed(): string` in `src/state/simulation.ts` — the existing module-private seed minter, now exported for the start screen's Random button and `startRun`.
  - `startScreenOpen: boolean` (default `true`) and `setStartScreenOpen: (open: boolean) => void` on `UiStore`.

- [ ] **Step 1: Export `newSeed`**

In `src/state/simulation.ts`, change `function newSeed(): string {` to `export function newSeed(): string {`. The function body is unchanged. `Math.random` is legal here — this module is the one place a run seed is minted.

- [ ] **Step 2: Add the `startScreenOpen` flag to `uiStore`**

In `src/state/uiStore.ts`, add a field and setter alongside the other boolean view-state flags (after `aboutOpen`/`setAboutOpen`, around line 60-67):

```ts
  /**
   * Whether the start screen is showing.
   *
   * Defaults to `true` so every load lands on the start screen; `main.tsx`
   * closes it before first paint when the URL carries a seed. Purely view
   * state — "no run has been chosen yet" is a UI concern, not an engine one,
   * and the simulation always boots a throwaway random run behind it.
   */
  startScreenOpen: boolean
  setStartScreenOpen: (open: boolean) => void
```

And in the store initialiser, after `aboutOpen`/`setAboutOpen`:

```ts
  startScreenOpen: true,
  setStartScreenOpen: (startScreenOpen) => set({ startScreenOpen }),
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck` and `pnpm lint` — both PASS. Run `pnpm test:run` — PASS (no test imports `uiStore`; `simulation.test.ts` keeps passing because `newSeed`'s export does not change behaviour).

- [ ] **Step 4: Commit**

```bash
git add src/state/simulation.ts src/state/uiStore.ts
git commit -m "feat: expose newSeed and start-screen flag (issue #65)"
```

---

### Task 3: `startRun` in `cardActions`, with `resetRun` delegating

**Files:**
- Modify: `src/ui/cardActions.ts`

**Interfaces:**
- Consumes: `reset`, `newSeed` from `src/state/simulation`; `normalizeSeed` from `./seedUrl`; `useUiStore` from `src/state/uiStore`.
- Produces:
  - `export function startRun(seed: string | null): void` — starts a run with the given seed (normalized) or a fresh random one, pushes `?seed=<seed>` into the URL, clears the leftover view state, and closes the start screen.
  - `resetRun(): void` — now a one-line delegate to `startRun(null)`, keeping its public name (used by the HUDs and DevPanel).

- [ ] **Step 1: Add `startRun` and rewire `resetRun`**

Replace the whole body of `src/ui/cardActions.ts` with:

```ts
import { reset, newSeed } from '../state/simulation'
import { useUiStore } from '../state/uiStore'
import { normalizeSeed } from './seedUrl'

/**
 * Toggle a Card into or out of the hand being assembled. Shared by the desktop
 * Deck and the mobile deck overlay so the two cannot drift.
 *
 * Cards are picked into a hand as a multi-select. A new pick also clears any
 * touch preview (so a stale footprint does not point at a square from a
 * previous selection).
 */
export function toggleCardForHand(cardId: string): void {
  const ui = useUiStore.getState()
  ui.setPreviewedSquare(null)
  ui.toggleCard(cardId)
}

/**
 * Start a run with a specific seed.
 *
 * The one funnel every run start flows through — the start screen, "Play
 * again", and the URL seed at boot. `null` means a fresh random seed. The
 * seed is normalised here, so whatever shape the caller had (typed text,
 * a URL param) becomes the canonical one, and the same seed is pushed into
 * the URL so the current run is always the link. `replaceState`, not
 * `pushState`, so Back does not step through runs.
 *
 * View state is cleared here, the same list `resetRun` used to own:
 * `simulation.reset` only owns GameState, and it must stay that way — it lives
 * outside React on purpose. `selectedTowerId` matters most of the list:
 * `reset()` rewinds the entity counter, so a stale id would open the Tower
 * panel on a brand-new Tower that happens to reuse it.
 */
export function startRun(seed: string | null): void {
  const runSeed = seed !== null ? normalizeSeed(seed) : newSeed()
  reset(runSeed)
  history.replaceState(null, '', `?seed=${runSeed}`)
  const ui = useUiStore.getState()
  ui.clearSelection()
  ui.setSelectedTowerId(null)
  ui.setPackShopOpen(false)
  ui.clearMarkedForCull()
  ui.setPreviewedSquare(null)
  ui.setStartScreenOpen(false)
}

/**
 * Start a fresh run with a random seed.
 *
 * Kept as its own name because it is the "Play again" and DevPanel action:
 * same funnel as `startRun`, just no seed.
 */
export function resetRun(): void {
  startRun(null)
}
```

Note: `history` is a browser global referenced only inside `startRun`, which no test imports (`cardActions.ts` has no test file and is not imported by any). The `Math.random` boundary is intact — `newSeed` lives in `src/state/simulation.ts`, not `src/game/`.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck` and `pnpm lint` — both PASS. Run `pnpm test:run` — PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/cardActions.ts
git commit -m "feat: startRun funnel pushes seed to URL (issue #65)"
```

---

### Task 4: The start screen component

**Files:**
- Create: `src/ui/StartScreen.tsx`
- Modify: `src/ui/Hud.tsx`
- Modify: `src/ui/useDialogFocus.tsx` — the Tab trap must include `input` so the start screen's seed field is reachable by keyboard; no existing caller has an input, so the wider selector is a no-op for them.
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `startScreenOpen`/`setStartScreenOpen` from `useUiStore`; `startRun` from `./cardActions`; `normalizeSeed` from `./seedUrl`; `newSeed` from `src/state/simulation`.
- Produces: `export function StartScreen(): JSX.Element | null` — the landing overlay. Mounted once in `Hud.tsx`.

- [ ] **Step 1: Write the component**

Create `src/ui/StartScreen.tsx`:

```tsx
import { useRef, useState } from 'react'
import { newSeed } from '../state/simulation'
import { useUiStore } from '../state/uiStore'
import { startRun } from './cardActions'
import { normalizeSeed } from './seedUrl'
import { useDialogFocus } from './useDialogFocus'

/**
 * The start screen: the overlay every load lands on.
 *
 * The seed field is the whole form — empty means a random run. Start funnels
 * through `startRun`, which normalises, resets the simulation, pushes the seed
 * into the URL, and closes this screen. There is deliberately no close button
 * and Escape is inert: "New run" is a committed decision, like the DevPanel's
 * Reset, so Start is the only way out.
 *
 * Focus is still moved in and Tab trapped by `useDialogFocus` so the
 * `aria-modal` assertion holds and the board behind cannot be tabbed into —
 * but the `close` it is handed is a no-op, which is what makes Escape inert.
 */
export function StartScreen() {
  const open = useUiStore((store) => store.startScreenOpen)
  const panelRef = useRef<HTMLDivElement>(null)
  const [seed, setSeed] = useState('')

  // No-op close: the screen cannot be dismissed, only started past. Escape
  // must not close it.
  useDialogFocus(panelRef, () => {}, open)

  if (!open) return null

  const onStart = () => {
    startRun(normalizeSeed(seed) === '' ? null : seed)
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="New run">
      <div className="modal__scrim" />

      <div className="modal__panel" ref={panelRef} tabIndex={-1}>
        <div className="modal__head">
          <span className="hud__label">Cards V Chess</span>
        </div>

        <label className="start-screen__field">
          <span className="hud__label">Run seed</span>
          <input
            type="text"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            placeholder="Empty starts a random run"
          />
        </label>

        <div className="modal__actions">
          <button type="button" className="modal__cancel" onClick={() => setSeed(newSeed())}>
            Random
          </button>
          <button type="button" className="hud__button" onClick={onStart}>
            Start
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Widen the dialog focus trap to inputs**

In `src/ui/useDialogFocus.tsx`, change the focusable selector (line 68) from:

```ts
const focusable = panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
```

to:

```ts
const focusable = panel.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), a[href]')
```

Also update the docstring above the hook (lines 17-21): the focusable set is now inputs, buttons, and links. The comment currently says "buttons plus links, matching `About`" — extend it to note that `StartScreen` adds an input, which is why inputs are in the set. No existing caller (`About`, `PackShop`, the deck overlay) contains an input, so this is a no-op for them.

- [ ] **Step 3: Mount it in `Hud.tsx`**

In `src/ui/Hud.tsx`: add `import { StartScreen } from './StartScreen'` and render `<StartScreen />` after `<About />` (around line 30):

```tsx
      <About />
      <StartScreen />
```

- [ ] **Step 4: Add the CSS**

In `src/index.css`, after the `.about__seed-code` block (around line 719) and before the `.credits__line` comment, add:

```css
/* The start screen: the same modal frame as the shop, with a seed field in
   place of a form. The scrim is inert — there is no close, only Start. */
.start-screen__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.start-screen__field input {
  padding: 0.5rem 0.6rem;
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: 0.4rem;
  background: rgb(255 255 255 / 6%);
  color: #e8edf4;
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.95rem;
  letter-spacing: 0.03em;
}
```

The monospace matches the About modal's seed display, so what the player types reads like what they copy.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck` and `pnpm lint` — both PASS (watch for `react-hooks/set-state-in-effect`: the `Random` and `Start` buttons write state from event handlers, which is fine). Run `pnpm test:run` — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/StartScreen.tsx src/ui/Hud.tsx src/ui/useDialogFocus.tsx src/index.css
git commit -m "feat: start screen overlay (issue #65)"
```

---

### Task 5: "New run" buttons in both HUD branches

**Files:**
- Modify: `src/ui/DesktopHud.tsx`
- Modify: `src/ui/MobileHud.tsx`

**Interfaces:**
- Consumes: `useUiStore` (already imported in both) and its new `setStartScreenOpen`.
- Produces: a **New run** button in each HUD that opens the start screen.

- [ ] **Step 1: DesktopHud**

In `src/ui/DesktopHud.tsx`, inside `.hud__actions`, after the **About** button (around line 67-73), add:

```tsx
        <button
          type="button"
          className="hud__button"
          onClick={() => useUiStore.getState().setStartScreenOpen(true)}
        >
          New run
        </button>
```

`useUiStore` is already imported at the top of the file.

- [ ] **Step 2: MobileHud**

In `src/ui/MobileHud.tsx`, inside `.mobileActions`, after the **About** button (around line 89-95), add:

```tsx
        <button
          type="button"
          className="hud__button hud__button--quiet"
          onClick={() => useUiStore.getState().setStartScreenOpen(true)}
        >
          New run
        </button>
```

`useUiStore` is already imported.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck` and `pnpm lint` — both PASS. Run `pnpm test:run` — PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/DesktopHud.tsx src/ui/MobileHud.tsx
git commit -m "feat: New run button opens the start screen (issue #65)"
```

---

### Task 6: Boot-time URL seed in `main.tsx`

**Files:**
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `seedFromUrl` from `./ui/seedUrl`; `startRun` from `./ui/cardActions`.
- Produces: a URL seed starts that run immediately at boot, skipping the start screen.

- [ ] **Step 1: Read the URL seed before first paint**

Replace `src/main.tsx` with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startRun } from './ui/cardActions'
import { seedFromUrl } from './ui/seedUrl'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

// A `?seed=` in the URL starts that run immediately, bypassing the start
// screen. Read before render so the first paint is already that run. This is
// deliberately not in `src/state/simulation.ts` — that module is imported by
// `src/state/simulation.test.ts` under plain Node with no jsdom, so a
// module-scope `window` read there would throw in every test run. The
// simulation's throwaway random boot is simply replaced, the same way any
// `startRun` call replaces it.
const urlSeed = seedFromUrl(window.location.search)
if (urlSeed !== null) startRun(urlSeed)

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Note: `startRun` already closes the start screen (`setStartScreenOpen(false)`), so no extra flag is needed here — the screen is skipped for free.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`, `pnpm lint`, and `pnpm build` — all PASS. Run `pnpm test:run` — PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: ?seed= URL param starts a run at boot (issue #65)"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run the whole check suite**

Run: `pnpm lint` — PASS.
Run: `pnpm typecheck` — PASS.
Run: `pnpm test:coverage` — PASS (thresholds unchanged; the engine is untouched, `seedUrl.test.ts` lives in `src/ui/`, which is excluded from coverage).
Run: `pnpm build` — PASS.

- [ ] **Step 2: Manual smoke test**

Run `pnpm dev`, then:
1. Load the page with no URL param → the start screen shows over the board; Random fills the field; Start with the field empty starts a random run; the URL now reads `?seed=<seed>`.
2. Reload the page → the seed stays in the URL and the run replays (start screen skipped).
3. Load with `?seed=abcd1234` → that run starts immediately; About shows `abcd1234`.
4. Click **New run** mid-run → the start screen opens; Escape does nothing; Start abandons the current run.
5. Lose a run → **Play again** re-rolls a random seed and the URL updates to match.

- [ ] **Step 3: Report**

Summarize what was built, the files touched, and the manual smoke results.
