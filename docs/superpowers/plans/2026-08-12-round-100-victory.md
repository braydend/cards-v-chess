# Round 100 Victory and Free Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make beating round 100 the goal of a run — completing it shows a victory screen and records the win, then the player continues into free play (the same game, difficulty still escalating) until the Core falls.

**Architecture:** A new `'victory'` phase on `RoundPhase` plus a sticky `won` flag on `GameState`. Round-100 completion lands on `'victory'` (roundNumber held at 100) instead of `'gap'`; `tick` freezes there and every command is refused except the new `continueToFreePlay`, which moves into the round-101 gap. A full-screen victory overlay (`src/ui/VictoryScreen.tsx`) shows while `phase === 'victory'`; the defeat hint acknowledges the win when `won` is true.

**Tech Stack:** TypeScript (strict, 5.x pinned), Vitest, React Three Fiber UI via zustand. No new dependencies.

## Global Constraints

- **`Math.random` must never appear in `src/game/`** — ESLint fails `pnpm lint` on it. Runs are seeded; the engine takes a seed, it never mints one.
- **Renderer boundary (both directions).** `src/game/` and `src/data/` never import React or Three.js. `src/ui/`, `src/scene/`, `src/state/` import from `src/game/index.ts` only (never from inside `src/game/`); test files are exempt from the inbound half. `src/data/` is importable from `src/ui/`.
- **`step`'s switch is exhaustiveness-protected.** Adding a `Command` variant without a matching `case` is compile error `TS2366`. Do not add an `assertNever` helper and do not weaken the return type.
- **`tick` is driven by a fixed timestep.** Tests call `tick(state, 1000/60)` directly; never pass a raw frame delta.
- **`nextEntityId`'s parity is load-bearing.** Never spend it on anything but a Piece or a Tower — Cards have `nextCardId`.
- **Ink income is event-driven, never time-based.**
- **CI runs `lint`, `typecheck`, `test:coverage`, `build`.** Verify with `pnpm lint` and `pnpm typecheck` after each task; full suite with `pnpm test:run`.
- **Commits are frequent and small**, each task one commit. Follow the repo's commit-message style (`docs:`, `feat(engine):`, `feat(ui):`).
- **Spec:** `docs/superpowers/specs/2026-08-12-round-100-victory-design.md` is the authority. Read it before implementing.

---

### Task 1: Victory state foundation — types, data, command, and freezing

**Files:**
- Modify: `src/game/types.ts` — `RoundPhase` gains `'victory'`; `GameState` gains `won: boolean`; `Command` gains `continueToFreePlay`.
- Modify: `src/data/rounds.ts` — add `VICTORY_ROUND`.
- Modify: `src/game/state.ts` — `createInitialState` sets `won: false`.
- Create: `src/game/phase.ts` — `isTerminal`.
- Modify: `src/game/step.ts` — add the `continueToFreePlay` case.
- Modify: `src/game/tick.ts` — the terminal-phase guard uses `isTerminal`.
- Modify: `src/game/cardPlays.ts` — all seven `'defeated'` guards become `isTerminal`.
- Test: `src/data/rounds.test.ts`, `src/game/phase.test.ts` (new), `src/game/step.test.ts`, `src/game/tick.test.ts`

**Interfaces:**
- Consumes: existing `RoundPhase`, `GameState`, `Command`, `createInitialState`, `step`, `tick`.
- Produces:
  - `VICTORY_ROUND` from `src/data/rounds` — `const VICTORY_ROUND = 100`.
  - `isTerminal(phase: RoundPhase): boolean` from `src/game/phase` — `true` for `'defeated'` and `'victory'`, `false` otherwise.
  - `GameState.won: boolean` — sticky, `false` at run start.
  - `{ kind: 'continueToFreePlay' }` — valid only in `'victory'`; moves to `'gap'` at `roundNumber + 1`.

- [ ] **Step 1: Write the failing tests**

`src/data/rounds.test.ts` — add `VICTORY_ROUND` to the existing import on line 3 and append a test inside the existing `describe('round composition', ...)` block, after the last test:

```ts
  it('is beatable at round 100', () => {
    expect(VICTORY_ROUND).toBe(100)
  })
```

Create `src/game/phase.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isTerminal } from './phase'
import type { RoundPhase } from './types'

describe('isTerminal', () => {
  it('is true for defeated', () => {
    expect(isTerminal('defeated')).toBe(true)
  })

  it('is true for victory', () => {
    expect(isTerminal('victory')).toBe(true)
  })

  it.each<RoundPhase>(['gap', 'inProgress'])('is false for %s', (phase) => {
    expect(isTerminal(phase)).toBe(false)
  })
})
```

`src/game/step.test.ts` — add `import { VICTORY_ROUND } from '../data/rounds'` to the imports (after the `./fixtures` line). Inside the existing `describe('step: the defeated guard', ...)`, append this block (it reuses `defeatedState()` and the command list already in that describe):

```ts
  it.each<[string, (towerId: string) => Command]>([
    ['buildTower', () => ({ kind: 'buildTower', cardId: 'build', square: BUILD_SQUARE })],
    ['supportTower', (towerId) => ({ kind: 'supportTower', cardId: 'support', towerId })],
    ['shieldTower', (towerId) => ({ kind: 'shieldTower', cardId: 'shield', towerId })],
    [
      'echoTower',
      (towerId) => ({ kind: 'echoTower', cardId: 'echo', sourceTowerId: towerId, square: BUILD_SQUARE }),
    ],
    ['reinforceCore', () => ({ kind: 'reinforceCore', cardId: 'king' })],
    ['expandBoard', () => ({ kind: 'expandBoard', cardId: 'ace' })],
    ['clearPieces', () => ({ kind: 'clearPieces', cardId: 'joker' })],
  ])('%s: refuses to act once victorious, leaving state (and the Card) untouched', (_kind, buildCommand) => {
    const state = { ...defeatedState(), phase: 'victory' as const }

    expect(step(state, buildCommand(firstTowerId(state)))).toBe(state)
  })
```

Also add a new describe after `describe('step: the defeated guard', ...)` ends:

```ts
describe('step: continueToFreePlay', () => {
  it('is refused outside the victory phase', () => {
    const state = createInitialState()

    expect(step(state, { kind: 'continueToFreePlay' })).toBe(state)
  })

  it('moves from victory into the round-101 gap, keeping the win', () => {
    const victor: GameState = {
      ...createInitialState(),
      phase: 'victory',
      won: true,
      roundNumber: VICTORY_ROUND,
    }

    const after = step(victor, { kind: 'continueToFreePlay' })

    expect(after.phase).toBe('gap')
    expect(after.roundNumber).toBe(VICTORY_ROUND + 1)
    expect(after.won).toBe(true)
    expect(after.roundElapsedMs).toBe(0)
    expect(after.pendingSpawns).toHaveLength(0)
  })
})
```

`src/game/tick.test.ts` — add `VICTORY_ROUND` to the imports (`import { VICTORY_ROUND } from '../data/rounds'`) and append to the existing `describe('tick: phase handling', ...)`:

```ts
  it('is inert once victorious', () => {
    const victor: GameState = { ...createInitialState(), phase: 'victory' }

    expect(tick(victor, DT)).toBe(victor)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/game/phase.test.ts src/game/step.test.ts src/game/tick.test.ts src/data/rounds.test.ts`
Expected: FAIL — `phase.test.ts` cannot resolve `./phase` (module does not exist); the step/tick tests fail on type or reference errors (`VICTORY_ROUND` not exported, `'victory'` not assignable to `RoundPhase`, `won` missing, `continueToFreePlay` not a `Command`).

- [ ] **Step 3: Implement the types and data**

`src/game/types.ts`:

```ts
export type RoundPhase = 'gap' | 'inProgress' | 'defeated' | 'victory'
```

In `GameState`, directly after the `leaks` field (around line 340):

```ts
  /**
   * Whether this run has beaten round `VICTORY_ROUND` — the goal of a run.
   *
   * Latches true when round 100 completes (see `tick.ts`) and never clears
   * within the run. What free play and the defeat screen read: the run-outcome
   * fact "this run won", in the same class as `leaks`.
   */
  readonly won: boolean
```

In the `Command` union, directly after the `startRound` variant:

```ts
  | { readonly kind: 'continueToFreePlay' }
```

`src/data/rounds.ts` — add at the top, next to `INTRODUCED_AT`:

```ts
/**
 * The round that completes a run — the goal of the game.
 *
 * Surviving this round records the win and shows the victory screen; the player
 * may then continue into free play. See the round-100 victory spec.
 */
export const VICTORY_ROUND = 100
```

`src/game/state.ts` — in `createInitialState`, after `leaks: 0,`:

```ts
    won: false,
```

Create `src/game/phase.ts`:

```ts
import type { RoundPhase } from './types'

/**
 * Whether the run is in a terminal phase: `defeated` or `victory`.
 *
 * `tick` freezes and every card-play command is refused in both — a victorious
 * run is not playing, it is deciding whether to continue. One predicate so the
 * seven card-play guards and the tick guard cannot drift apart.
 */
export function isTerminal(phase: RoundPhase): boolean {
  return phase === 'defeated' || phase === 'victory'
}
```

- [ ] **Step 4: Implement the command, the tick guard, and the card-play guards**

`src/game/step.ts` — add the case to the switch:

```ts
    case 'continueToFreePlay':
      return continueToFreePlay(state)
```

and the function at the end of the file:

```ts
/**
 * The only command valid in the victory phase: moves the run into free play.
 *
 * Free play is the round-101 gap — a normal, startable round. The win is
 * already recorded (`won` latched at the victory transition) and stays true.
 * `roundElapsedMs` and `pendingSpawns` are reset so the gap reads as a fresh
 * round about to begin, exactly as a round completion leaves it.
 */
function continueToFreePlay(state: GameState): GameState {
  if (state.phase !== 'victory') return state

  return {
    ...state,
    phase: 'gap',
    roundNumber: state.roundNumber + 1,
    roundElapsedMs: 0,
    pendingSpawns: [],
  }
}
```

`src/game/tick.ts` — import `isTerminal` and change the guard on line 95:

```ts
  if (state.phase === 'defeated') return state
```

becomes

```ts
  if (isTerminal(state.phase)) return state
```

`src/game/cardPlays.ts` — import `isTerminal` (`import { isTerminal } from './phase'`) and replace **all seven** `if (state.phase === 'defeated') return state` (lines 48, 71, 107, 136, 163, 191, 221) with:

```ts
  if (isTerminal(state.phase)) return state
```

(`buyPack` in `src/game/packs.ts` already checks `state.phase !== 'gap'`, which refuses `'victory'` for free — no change there. `startRound`'s `phase !== 'gap'` guard likewise already refuses it.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/game/phase.test.ts src/game/step.test.ts src/game/tick.test.ts src/data/rounds.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck, lint, full suite**

Run: `pnpm typecheck` then `pnpm lint` then `pnpm test:run`
Expected: all clean. (Any test that builds a full `GameState` literal uses `{ ...createInitialState(), ... }` spreads, so `won: false` flows through; no existing test needs editing.)

- [ ] **Step 7: Commit**

```bash
git add src/game/types.ts src/data/rounds.ts src/game/state.ts src/game/phase.ts src/game/step.ts src/game/tick.ts src/game/cardPlays.ts src/data/rounds.test.ts src/game/phase.test.ts src/game/step.test.ts src/game/tick.test.ts
git commit -m "feat(engine): victory phase, won flag, and continueToFreePlay command"
```

---

### Task 2: Round-100 completion lands on victory

**Files:**
- Modify: `src/game/tick.ts` — the round-completion branch (`!stillActive && pendingSpawns.length === 0`, around line 251).
- Test: `src/game/tick.test.ts` — in `describe('tick: round completion', ...)`.

**Interfaces:**
- Consumes: `VICTORY_ROUND` from `src/data/rounds`; `GameState.won`; the `'victory'` phase.
- Produces: completing the round when `roundNumber === VICTORY_ROUND` returns state with `phase: 'victory'`, `won: true`, `roundNumber` unchanged (100), `roundElapsedMs: 0`, `pendingSpawns: []`, and the round-100 income paid. Completing any other round behaves exactly as before.

- [ ] **Step 1: Write the failing tests**

`src/game/tick.test.ts` — append inside `describe('tick: round completion', ...)` (after the existing `'scales the next round up'` test). `VICTORY_ROUND` is already imported from Task 1. `pieceAt`, `runFor`, `DT`, `createInitialState`, `roundIncome` are all in scope in this file. The lone hunting Knight at `{ file: 5, rank: 0 }` mirrors the existing `'completes the round once a hunting Knight leaks'` test's arrangement — it leaks on its first hunt hop, emptying the board.

```ts
  it('lands on the victory phase when round 100 completes, and pays its income', () => {
    const hundredth: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      roundNumber: VICTORY_ROUND,
      pieces: [pieceAt('victory-knight', 'knight', { file: 5, rank: 0 })],
    }

    const state = runFor(hundredth, 60_000)

    expect(state.phase).toBe('victory')
    expect(state.won).toBe(true)
    expect(state.roundNumber).toBe(VICTORY_ROUND)
    expect(state.pieces).toHaveLength(0)
    expect(state.pendingSpawns).toHaveLength(0)
    expect(state.roundElapsedMs).toBe(0)
    expect(state.ink).toBe(roundIncome(VICTORY_ROUND))
  })

  it('completes round 99 into a normal gap at round 100, without the win', () => {
    const ninetyNinth: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      roundNumber: VICTORY_ROUND - 1,
      pieces: [pieceAt('last-knight', 'knight', { file: 5, rank: 0 })],
    }

    const state = runFor(ninetyNinth, 60_000)

    expect(state.phase).toBe('gap')
    expect(state.roundNumber).toBe(VICTORY_ROUND)
    expect(state.won).toBe(false)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/game/tick.test.ts`
Expected: FAIL — the round-100 completion currently lands on `'gap'` with `roundNumber` 101 and `won` still `false`.

- [ ] **Step 3: Implement the victory transition**

`src/game/tick.ts` — import `VICTORY_ROUND` (`import { VICTORY_ROUND } from '../data/rounds'`). In the `if (!stillActive && pendingSpawns.length === 0)` block, split the return into two: the existing gap return, preceded by the victory return when this is round 100.

```ts
  if (!stillActive && pendingSpawns.length === 0) {
    // Beating round 100 is the goal of a run. The completion that lands here
    // at `VICTORY_ROUND` records the win: the phase becomes `victory` — a
    // frozen interstitial, like `defeated`, whose only way out is the
    // `continueToFreePlay` command — and `roundNumber` stays at 100, the round
    // just beaten. A `'victory'` phase rather than a gap: auto-start fires
    // from the gap, so a victory gap would chain round 101 under the victory
    // screen before the player chooses to continue.
    if (state.roundNumber === VICTORY_ROUND) {
      return {
        ...state,
        phase: 'victory',
        won: true,
        roundElapsedMs: 0,
        core,
        leaks,
        recentExits,
        recentMisses,
        rng: { ...state.rng, combat: fired.rng },
        // `state.roundNumber` is VICTORY_ROUND here — the round just played.
        ink: ink + roundIncome(state.roundNumber),
        pieces: healed,
        towers: fired.towers,
        pendingSpawns: [],
        nextEntityId: entityIdAfterPromotion,
      }
    }

    return {
      ...state,
      phase: 'gap',
      roundNumber: state.roundNumber + 1,
      roundElapsedMs: 0,
      core,
      leaks,
      recentExits,
      recentMisses,
      rng: { ...state.rng, combat: fired.rng },
      ink: ink + roundIncome(state.roundNumber),
      pieces: healed,
      towers: fired.towers,
      pendingSpawns: [],
      nextEntityId: entityIdAfterPromotion,
    }
  }
```

(The existing gap return is unchanged — only the new victory branch is added above it.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/game/tick.test.ts`
Expected: PASS — including the pre-existing completion tests.

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `pnpm typecheck` then `pnpm lint` then `pnpm test:run`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/tick.ts src/game/tick.test.ts
git commit -m "feat(engine): round 100 completion lands on the victory phase"
```

---

### Task 3: Victory screen and defeat acknowledgment

**Files:**
- Create: `src/ui/VictoryScreen.tsx`
- Modify: `src/ui/Hud.tsx` — mount the victory screen.
- Modify: `src/ui/DesktopHud.tsx` — defeat hint acknowledges the win.
- Modify: `src/ui/MobileHud.tsx` — same hint.
- Modify: `src/index.css` — victory screen styles.
- Test: none (renderer is deliberately untested; `src/ui/` has no jsdom). Verify with `pnpm typecheck`, `pnpm lint`, `pnpm build`.

**Interfaces:**
- Consumes: `phase`, `won`, `roundNumber` from the zustand `snapshot`; `dispatch` from `../state/store`; `VICTORY_ROUND` from `../data/rounds`.
- Produces: `VictoryScreen` — full-screen overlay rendered when `phase === 'victory'`, whose single button dispatches `{ kind: 'continueToFreePlay' }`. The defeat hint string: `"The Core has fallen. You beat round 100; free play ended on round N."` where N is the defeat `roundNumber`, only when `won` is true.

- [ ] **Step 1: Create the victory screen**

`src/ui/VictoryScreen.tsx`:

```tsx
import { VICTORY_ROUND } from '../data/rounds'
import { dispatch, useGameStore } from '../state/store'

/**
 * The full-screen victory overlay, shown when round `VICTORY_ROUND` completes.
 *
 * Not a closable modal — there is nothing to dismiss. Its single action,
 * Continue to free play, issues the engine's `continueToFreePlay` command,
 * which moves the run into the round-101 gap. There is deliberately no
 * end-run option: the win is the goal, and stopping there just starts a fresh
 * run, which "Play again" already does.
 */
export function VictoryScreen() {
  const phase = useGameStore((store) => store.snapshot.phase)

  if (phase !== 'victory') return null

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Victory">
      <div className="modal__scrim" />
      <div className="modal__panel">
        <div className="modal__head">
          <span className="hud__label">Victory</span>
        </div>
        <p className="victory__title">Round {VICTORY_ROUND} complete — you beat the game.</p>
        <p className="victory__subtitle">
          The goal is reached. Continue to free play: the same game, no further goal, until the Core falls.
        </p>
        <div className="modal__actions">
          <button
            type="button"
            className="hud__button"
            autoFocus
            onClick={() => dispatch({ kind: 'continueToFreePlay' })}
          >
            Continue to free play
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount it and add the defeat hint**

`src/ui/Hud.tsx` — import `VictoryScreen` and render it in the shared modals block:

```tsx
import { VictoryScreen } from './VictoryScreen'
```

```tsx
      <TowerPanel />
      <PackShop />
      <VictoryScreen />
      <Credits />
```

`src/ui/DesktopHud.tsx` — add `VICTORY_ROUND` to imports, add `won` to the destructure, and extend the defeat hint:

```tsx
import { VICTORY_ROUND } from '../data/rounds'
```

```tsx
  const { phase, roundNumber, core, autoStart, ink, won } = snapshot
```

```tsx
      {phase === 'defeated' ? (
        <p className="hud__hint">
          The Core has fallen.
          {won
            ? ` You beat round ${VICTORY_ROUND}; free play ended on round ${roundNumber}.`
            : null}
        </p>
      ) : null}
```

`src/ui/MobileHud.tsx` — same imports and destructure change, and add the hint after the `mobileActions` div (mobile shows no defeat hint today; this keeps the two layouts in step):

```tsx
import { VICTORY_ROUND } from '../data/rounds'
```

```tsx
  const { phase, roundNumber, core, ink, won } = snapshot
```

```tsx
      {phase === 'defeated' ? (
        <p className="hud__hint">
          The Core has fallen.
          {won
            ? ` You beat round ${VICTORY_ROUND}; free play ended on round ${roundNumber}.`
            : null}
        </p>
      ) : null}
```

- [ ] **Step 3: Add the victory screen styles**

`src/index.css` — append after the `.credits__line a` block (around line 590):

```css
/* The victory screen: the pack-shop modal frame, with a celebration in place
   of a form. The scrim is a button like the shop's, but here it does nothing
   — the modal cannot be dismissed, only continued past. */
.victory__title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: #4fd1c5;
}

.victory__subtitle {
  margin: 0;
  line-height: 1.5;
  color: #c3cdda;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck` then `pnpm lint` then `pnpm build`
Expected: all clean. (No new tests — the victory screen and the HUD hint are renderer code, deliberately untested.)

- [ ] **Step 5: Commit**

```bash
git add src/ui/VictoryScreen.tsx src/ui/Hud.tsx src/ui/DesktopHud.tsx src/ui/MobileHud.tsx src/index.css
git commit -m "feat(ui): victory screen, continue to free play, and defeat acknowledgment"
```

---

### Task 4: Docs — resolve the open question and record current state

**Files:**
- Modify: `docs/design/game-design.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the agreed spec `docs/superpowers/specs/2026-08-12-round-100-victory-design.md`.
- Produces: the "Run length and loss condition" open-question row is removed and replaced by a settled "goal" section in `game-design.md`; `CLAUDE.md`'s current state and vocabulary mention the victory and free play.

- [ ] **Step 1: Update `game-design.md`**

Add a subsection under `## Runs`, directly after the `### Seeds` subsection:

```markdown
### The goal: beat round 100, then free play

**A run's goal is to beat round 100.** Completing round 100 — the round
completes, nothing on the board can still act — records the win and shows a
victory screen. From there the player may continue into **free play**: the same
game, the difficulty curve still escalating (`spawnHealthMultiplier`'s tail is
unbounded), no further goal, until the Core falls. Free play changes nothing
mechanical — cards, packs, Ink, and the roster behave identically. The victory
interstitial is a `'victory'` phase: `tick` freezes and every command is refused
except `continueToFreePlay`, which moves into the round-101 gap. A phase rather
than a gap, because auto-start fires from the gap and would chain round 101
under the victory screen. `VICTORY_ROUND` lives in `src/data/rounds.ts`. See
[`docs/superpowers/specs/2026-08-12-round-100-victory-design.md`](../superpowers/specs/2026-08-12-round-100-victory-design.md).
```

Then delete the `**Run length and loss condition**` row from the `## Open questions` table (the first row), since it is now answered.

- [ ] **Step 2: Update `CLAUDE.md`**

In the `## Current state` intro paragraph, change the final clause:

```markdown
cards are played from the Deck, and the run ends when the Core falls.
```

to

```markdown
cards are played from the Deck, beating round 100 records a win with free play
beyond, and the run ends when the Core falls.
```

In the `## Domain vocabulary` table, add a row after the **Round** row:

| **Free play** | The run continuing after round 100 is beaten — the same game, difficulty still escalating, no further goal |

- [ ] **Step 3: Verify**

Run: `pnpm test:run`
Expected: PASS (docs-only change; the suite is a sanity check that nothing else references the deleted open-question row).

- [ ] **Step 4: Commit**

```bash
git add docs/design/game-design.md CLAUDE.md
git commit -m "docs: round 100 is the goal of a run, with free play beyond"
```

---

## Self-Review

**Spec coverage:**
- "A run's goal is round 100; `VICTORY_ROUND = 100` constant in `src/data/rounds.ts`" → Task 1 (data) + Task 2 (completion). ✔
- "New `'victory'` phase; `won` sticky flag; roundNumber held at 100; income paid" → Tasks 1–2. ✔
- "`tick` inert in `'victory'`; every command refused there except `continueToFreePlay`" → Task 1 (`isTerminal` in tick + cardPlays + step). ✔
- "`continueToFreePlay` → gap round 101, `won` stays true; auto-start then chains normally" → Task 1 step function. ✔
- "Victory screen, full-screen overlay, Continue-only; mounted in `Hud.tsx`" → Task 3. ✔
- "Defeat acknowledges the win (`won` true → free play round N)" → Task 3 (DesktopHud + MobileHud). ✔
- "No pre-100 goal indicator" → no task adds one. ✔
- "Difficulty keeps escalating in free play" → no task changes the curve. ✔
- "Testing list" → Task 1 (inert, refusals, command, isTerminal, VICTORY_ROUND), Task 2 (completion at 100 and at 99). ✔
- "`structuralKey` already keys on `phase`; `won` needs no key entry" → no structuralKey change. ✔
- Docs (resolve open question, record current state) → Task 4. ✔

**Placeholder scan:** no TBD/TODO/"similar to"; every step carries concrete code or exact copy. ✔

**Type consistency:** `isTerminal`, `VICTORY_ROUND`, `won`, and `{ kind: 'continueToFreePlay' }` are defined once (Task 1) and consumed under the same names in Tasks 2–3. The defeat hint reads `roundNumber` (the in-progress round at defeat) — consistent with the spec's "reached round N". ✔
