# Developer Mode — Design

**Date:** 2026-08-12
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

Issue #60 asks for a developer mode that makes testing every mechanic easy during
development. It is a testing tool, not game content: it must not appear in the
deployed build, must not shift the seeded simulation, and must not pollute the
player-facing rules.

## Decision

**Engine-native dev commands, dispatched through `step`, gated out of
production by the UI alone.**

Every dev action is a new `Command` variant handled in `step` via a pure module
`src/game/dev.ts`. Each command refuses an invalid input the way existing
commands do — returning state unchanged — so there is one state machine, one
mutation path, and the exhaustiveness-protected `switch` in `step` covers the
new variants for free. There is no runtime gate in the engine: the panel UI is
compiled out of the production build by `import.meta.env.DEV`, so nothing in the
deployed bundle dispatches these commands. The shipped `step` accepts them,
inert.

### Command surface

All variants prefixed `dev` so the exception layer is explicit in the `Command`
union.

- **`devSetRound`** `{ roundNumber }` — gap-only, like `buyPack`. Mid-round it
  would silently skip the number, because round completion sets
  `roundNumber = state.roundNumber + 1` (tick.ts): setting it mid-round then
  completing lands on `N + 1`, not `N`. Refusing is what makes "the next Start
  round uses this number" actually true. Refuses `roundNumber < 1`.
- **`devAddInk`** `{ amount }` — any phase; refuses `amount < 1`.
- **`devSetCoreHealth`** `{ health, maxHealth }` — any phase; refuses
  `health < 1` or `maxHealth < health`. Defeat stays testable by leaking Pieces
  through; the panel does not set health to zero directly.
- **`devGrowBoard`** `{ ranks }` — any phase; refuses `ranks < 1`. Mirrors the
  Ace's rank-only growth (`expandBoard`), so the staging-rank "never shrinks"
  invariant and the spawn-file math in `data/rounds.ts` are untouched.
- **`devSpawnPiece`** `{ typeId, tier, square }` — any phase; square must be in
  bounds **or** on the staging rank; refuses a Tower or a Piece already on the
  square. The Piece is built exactly like a normal spawn — `spawnHealth` scaled
  by round, tier hunt flags — and its `handedness` comes from `nextEntityId`
  parity, because that parity is load-bearing for weave direction.
- **`devRemoveTower`** `{ towerId }` — any phase; removes by id; no-op if
  unknown.
- **`devClearPieces`** — any phase; clears `pieces` with `pendingSpawns`
  untouched (like the Joker), but pays no ink and does not bump `clears` — it
  is a testing utility, not the card.
- **`devAddCard`** `{ rank?, suit? }` — any phase; builds a Card on
  `nextCardId` (never `nextEntityId` — the parity rule that guards `dealPack`).
  Joker when rank is absent. **Bypasses the 30-card deck cap**, a documented
  exception: the picker is the point of the feature.

### Rules that keep dev mode inert

- **Dev commands never draw from `state.rng`.** Using them cannot shift later
  seeded outcomes, so turning dev mode on or off does not corrupt run
  reproducibility.
- **`devSpawnPiece` uses `nextEntityId`; `devAddCard` uses `nextCardId`.** The
  same split the engine already enforces between Piece and Card ids.

## Architecture

### Engine (`src/game/`)

- **`dev.ts`** (new): one exported function per dev command, pure, taking
  `GameState` and returning `GameState`. `step` routes each `dev*` variant to
  it, exactly like every other command.
- **`step.ts`**: new `case` arms for the eight variants.
- **`types.ts`**: eight new `Command` variants. `GameState` gains nothing — no
  `devMode` flag, no dev bookkeeping; dev mode is not a mode, it is a command
  family.
- **`index.ts`**: no new exports needed; the commands travel through the
  existing `Command`/`step` surface.

### State bridge (`src/state/`)

- **`structuralKey.ts`**: no change. Every dev command mutates fields already
  in the key (round number, ink, core, board, deck ids, pieces, towers), so
  publishing works unchanged.
- **`simulation.ts`**: no change. `dispatch` already carries any `Command`.

### UI (`src/ui/`)

- **`DevPanel.tsx`** (new), mounted in `Hud.tsx` beside the other shared
  modals. Begins with `if (!import.meta.env.DEV) return null`, which Vite
  statically replaces, so the panel is dead-code-eliminated from the production
  bundle.
- **Activation**: the backquote `` ` `` key toggles the panel; a small "Dev"
  button appears in the HUD in dev builds. Escape closes.
- **`uiStore.ts`**: `devPanelOpen` — plain view state, same home as
  `packShopOpen`.
- **Layout**: a fixed-position floating panel, deliberately **not** a modal —
  the player must keep clicking the board (to place towers) while it is open.
  Form state is local `useState`; the component reads the snapshot and
  dispatches commands. Sections: Round, Deck (any-card picker), Pieces,
  Economy, Board, Utilities (clear pieces, per-Tower remove + remove all,
  reset run).

## Invariants affected

- **"The Deck is capped at 30"** gains one deliberate, documented exception:
  `devAddCard` bypasses the cap. This is the point of the picker; the exception
  lives in the module comment and this spec, not in the game design.
- **"One state machine, not two"** holds: dev actions are commands like any
  other, and the `step` switch's exhaustiveness protection covers them.
- **Seeded determinism** holds: dev commands draw nothing from `state.rng`, so
  a run played with dev mode untouched is byte-identical to one played without
  the code present.
- **"A Tower and a Piece can never share a square"** holds even for dev spawns:
  `devSpawnPiece` refuses a Tower or Piece on the target square, so a dev spawn
  cannot manufacture the impossible overlap.

## Testing

- `src/game/dev.test.ts`: every command through `step`, with a refused-input
  case and a happy path per command:
  - `devSetRound` refused mid-round and for `roundNumber < 1`; in the gap, the
    next `startRound` loads `roundSpec(n).spawns`.
  - `devAddInk` refused `amount < 1`; adds exactly the amount; valid mid-round.
  - `devSetCoreHealth` refused `health < 1` and `maxHealth < health`; both set;
    survives a tick.
  - `devGrowBoard` refused `ranks < 1`; ranks only, files untouched; the
    staging rank moves with it.
  - `devSpawnPiece` refused out-of-bounds, on a Tower, and on an occupied
    square; spawns on the staging rank; handedness parity follows
    `nextEntityId`; health is round-scaled.
  - `devRemoveTower` removes by id; unknown id no-op; others untouched.
  - `devClearPieces` empties pieces, leaves `pendingSpawns`, pays no ink, no
    `clears` bump.
  - `devAddCard` standard and Joker; uses `nextCardId`; breaks the cap.
  - Rule check: neither rng stream changes under any dev command.
- The panel itself is UI and stays untested by policy; any non-trivial
  branching found in it is pulled into a pure module per the repo rule.

## Open questions

None. The remaining controls are all covered by the eight commands. Balance
questions dev mode reveals in play are for the game design, not this tool.
