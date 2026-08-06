# Cards V Chess

A web-based 3D tower defense game with trading-card-game mechanics.

Two factions, and the name is literal:

- **Cards** — the player. A **standard 54-card deck** is your arsenal. Cards are modal: **rank builds** a Tower (a face card acts instead), **suit supports** an existing one.
- **Chess** — the AI opponent. Chess pieces invade the board in Rounds, each type mapping a real chess trait onto a tower-defense threat, trying to reach the **Core**.

It is a **one-sided defense**. The player is always Cards; Chess is always the attacker. There is no mode where the player commands chess pieces.

**[`docs/design/game-design.md`](docs/design/game-design.md) is the authority on the design.** Read it before designing, extending, or balancing game content. The dated specs in `docs/superpowers/specs/` are frozen decision records — useful for *why* a choice was made and what was rejected, but never for current state.

## Current state

`pnpm dev` gives a playable loop: the board renders, rounds start manually or automatically, the full Chess roster advances on chess rules, Towers fire, blocked Pieces grind Towers down, cards are played from the Deck, and the run ends when the Core falls.

What exists:

- The rules engine (`src/game/`) with `step` / `tick`, driven by a fixed-timestep accumulator.
- **The card system.** The Deck, modality (rank builds / suit supports), the rank ladder 2–10, the four suit supports, and all five card actions — Jack Shield, Queen Echo, King Reinforce, Ace Expand, Joker Clear. Playing a card consumes it.
- **The full Chess roster** — Pawn, Knight, Bishop, Rook, Queen, King — each with its own movement, Pawn promotion on the back rank, hunting Knights, the King's move-speed/slide aura, and the Bishop's healing aura.
- **Tower combat.** Firing geometry per rank, Tower health, shields, damage from blocked Pieces, and destruction.
- **Tower legibility.** A Tower darkens as it loses health, flashes on a hit, pulses at critical health, and flares as it dies; clicking one opens an inspect panel with the exact figures, including lifetime `damageTaken`.
- The renderer (`src/scene/`), with distinct per-type rendering for each Piece, and the HUD, the Deck UI and the Tower panel (`src/ui/`).
- **CI.** `lint`, `typecheck`, `test:coverage` with per-directory thresholds, and `build` — see "CI" below.
- 292 tests across 19 files, all passing, none of which need a browser. Run `pnpm test:run` for the live count — this figure is indicative of scale, and a stale one here has already leaked into a plan document once.

What does **not** exist yet:

- **Ink and packs.** No currency, no pack opening, no cull flow, and no seeded PRNG. The Deck is a fixed authored list in `src/data/deck.ts` — see the file's own comment before touching it.

Towers fire and can kill Pieces outright, so a round does not resolve by leaking out — it ends when nothing on the board can still act, whether that means every Piece destroyed, stranded, or through the Core.

The design still runs ahead of the code on the economy, so read `docs/design/game-design.md` for the intended design rather than inferring it from what is built. The largest unbuilt piece is Ink and packs, with the cull flow and the PRNG.

**Known bug, cause unconfirmed.** Playing an Ace produces a visible shadow artifact — a black wedge across the scene. `src/scene/GameScene.tsx` casts shadows from a `directionalLight` using three.js's default directional-light shadow frustum, which the board's footprint in light space outgrows. A fixed frustum on a growable board is a real problem, but it does **not** account for the symptom: three.js renders receivers outside the shadow frustum as fully **lit**, not black, and the light-space half-extent already exceeds the default box at 8×8, before any Ace is played. So the mechanism is unknown. Reproduce and bisect before changing the lighting — an earlier confident diagnosis of this was wrong.

## Tech stack

| Concern | Choice |
| --- | --- |
| Renderer | React Three Fiber (Three.js via React) |
| Language | TypeScript, strict |
| Build | Vite |
| Package manager | pnpm |
| State (view layer) | zustand |
| Tests | Vitest |
| Art style | Low-poly |

Chosen because this game is roughly half 3D scene and half dense 2D UI (the Deck, card zoom, tooltips, pack opening, the cull screen). React handles the second half well, and low-poly art means the renderer will not be the bottleneck.

## Commands

```bash
pnpm install
pnpm dev           # Vite dev server
pnpm build         # typecheck, then production build
pnpm test          # Vitest, watch mode
pnpm test:run      # Vitest, single run (use this in automation)
pnpm test:coverage # Vitest with coverage + thresholds (what CI runs)
pnpm typecheck     # tsc --noEmit
pnpm lint
```

**TypeScript is pinned to the 5.x line on purpose.** TypeScript 7 is published as `latest`, but `typescript-eslint` currently declares support only for `>=4.8.4 <6.1.0`, so upgrading breaks `pnpm lint`. Revisit once typescript-eslint ships TS 7 support.

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`: `lint`, `typecheck`, `test:coverage`, `build`. Pushes to `main` also deploy to [GitHub Pages](https://braydend.github.io/cards-v-chess/), gated on those checks passing.

Branch protection is currently **off**, so nothing blocks a direct push to `main` or the merge of a red pull request. What CI does guarantee is that such a commit never reaches the live site — `deploy` declares `needs: checks`. **The gate is on the deployment, not on the branch.**

CI enforces three things beyond "the tests pass":

- The **renderer boundary** — `src/game/` and `src/data/` importing React or Three.js fails `pnpm lint`.
- **Seeded determinism** — `Math.random` in those directories fails `pnpm lint`.
- **Engine coverage** — thresholds on `src/game/` and `src/state/`. `src/scene/`, `src/ui/`, `src/data/`, the entry points `src/App.tsx` and `src/main.tsx`, and `src/state/uiStore.ts` are excluded: the renderer needs a browser and is deliberately untested, `data/` is constant tables, and `uiStore.ts` holds view-only UI state (selection, hover), not the simulation bridge the rest of `src/state/` carries. A file added to `state/` is measured unless it, like `uiStore.ts`, holds that kind of view state rather than bridging to the simulation.

Coverage sets `include` explicitly rather than relying on the default. The default counts only files the tests import, so a new untested file in `src/game/` would not move the number at all. Thresholds are a per-directory allowlist, not a global floor — a new measured directory (a future `src/engine/`, say) shows up in the coverage report because `include` catches it, but has no threshold of its own and cannot fail the build until it is given an entry in `vite.config.ts`. The current thresholds — see `vite.config.ts` for the numbers, so this stays the one place they live — are a **regression ratchet, not a baseline**: they sit just under what the code already does. Defining a real baseline is an open follow-up; do not treat passing them as evidence of good coverage.

## Game design

The player defends a **Core** on a board of chess squares against rounds of invading chess Pieces, building **Towers** by playing cards from a standard 54-card deck. Every standard card is modal — **rank builds** a Tower, **suit supports** an existing one — and playing a card **consumes** it. J, Q, K, A act instead of building, and a Joker has one action and no suit. Runs are seeded, start by opening a pack, and the Deck is capped at 30 cards.

**[`docs/design/game-design.md`](docs/design/game-design.md) is the single source of truth** for the design, and holds the only canonical list of open questions. Read it before designing, extending, or balancing any game content. Do not duplicate its detail back into this file.

### Invariants that constrain code

Design facts with hard implementation consequences. Breaking one of these is a bug, not a balance choice:

- **`Math.random` must never appear in `src/game/`.** Runs are seeded and the simulation must stay reproducible. Randomness comes from a seeded PRNG carried in `GameState`. **Enforced by ESLint** — a violation fails `pnpm lint`, and therefore CI.
- **Ink income must be event-driven** — round completion and kills — **never time-based.** The gap between rounds is untimed, so time-based income is unbounded: the player would just wait.
- **Playing a card consumes it.** There is no drawing, no shuffling, no discard pile, and no hand. The whole Deck is always visible and playable.
- **A Card's identity is its `id`, never its rank and suit.** The Deck is a multiset — cards come from random packs, so duplicates are normal, and the authored starting Deck already holds a triple. Three identical 5♦ are three distinct Cards, and playing one must leave the other two. Any lookup or removal keyed on rank+suit is a bug the moment a duplicate exists; go through `findCard` / `removeCard` in `src/game/cards.ts`.
- **The board grows.** An Ace adds a rank, so never derive a spawn rank or a board extent from a module constant — read it from `state.board`. A static `SPAWN_RANK` in `src/data/board.ts` had to be deleted for exactly this reason, and the fixed shadow frustum in `src/scene/GameScene.tsx` is the same assumption still unfixed.
- **Towers block movement, and blocked Pieces attack them at half damage.** A Piece whose next square holds a Tower does not advance.
- **Never add pathfinding.** A blocked Piece grinds; it must never route around. Routing would let the player steer Pieces by placing Towers — that is mazing, and it is rejected. Walling is allowed; herding is not.
- **Pieces move by chess rules, not toward the Core.** `src/game/movement.ts` owns this. There is no goal-seeking: a Piece reaches the Core only if chess movement happens to take it there.
- **A round ends when nothing can still act, not when the board is empty.** Every Piece type that could once run out of legal moves for good now has a designed way off `stuck` — Pawns promote, sliders and the King sweep sideways, and a Knight that exhausts its forward hops hunts the Core with knight moves rather than stranding on the back rank (see the hunting carve-out below) — but `stillActive` still checks every Piece, rather than assuming a designed answer always applies.
- **A Piece blocked by a Tower counts as acting.** `nextMove` returns `attackTower`, not `stuck`, so the round cannot end while it grinds. That terminates only because repair is bounded by a finite Deck: ♥ runs out, the Tower falls, the round resumes. **Adding packs removes the bound** — see `src/game/roundTermination.test.ts`, which pins it, and "Repair versus the wall" in the design doc.
- **Pieces are forward-biased and deterministic.** Direction is a pure function of Piece type, `moveCount`, and `handedness`. Never choose a line because the Core is on it — that is goal-seeking, and it makes Tower placement steer Pieces. **Narrow carve-out:** once a Knight's forward hops run out, it hunts the Core directly, guided by a knight-move distance field computed on an empty board (`src/game/knightDistance.ts`). The field never sees Towers, so Tower placement cannot change what it returns, and a hunting Knight blocked by a Tower grinds on it exactly like every other blocked Piece rather than trying another square. What the invariant actually guards against — Tower placement steering a Piece around an obstacle — still cannot happen; only the *source* of direction changes, and only for a Knight that would otherwise have nothing left to do.
- **Sliders and the King sweep laterally when forward is off the board, reflecting off the file edges and flipping `handedness`.** Round termination depends on this: without the flip a Piece oscillates between two files forever. Knights take a different answer to the same problem — once a Knight's forward hops run out it hunts the Core with knight moves instead of sweeping sideways, per the carve-out above.
- **No path manipulation.** No walls, no blockers, no herding. Defense is coverage, not maze geometry.
- **Ink is never spent to play a card.** It buys packs only.

## Architecture

### The one hard rule

**`src/game/` must never import React or Three.js.**

The rules engine is pure TypeScript. It owns all game state and all game logic. The renderer reads that state and draws it. React renders; it never simulates.

This is not stylistic. It buys three things:

1. The entire game is testable without a browser, a canvas, or a renderer.
2. The simulation stays deterministic, because nothing in it can depend on frame timing or component lifecycles.
3. If R3F ever becomes the wrong choice, `src/scene/` gets rewritten and the game — plus its whole test suite — survives untouched.

If you find yourself wanting to import a Three.js type into `game/`, that is a signal the boundary is in the wrong place. Fix the boundary, don't cross it.

**This rule is enforced by ESLint**, not just documented — `eslint.config.js` restricts renderer imports in `src/game/` and `src/data/`, so a violation fails `pnpm lint` rather than quietly eroding.

### Engine shape

```ts
step(state: GameState, command: Command): GameState   // player actions
tick(state: GameState, fixedDt: number): GameState    // the simulation
```

- `step` handles player commands — play a card for its rank or its suit, start the round, toggle auto-start. Commands are valid both between rounds and mid-round. There is no free Tower placement: every Tower comes from a Card, so there is no `placeTower` command and clicking an empty board with nothing selected does nothing.
- `tick` advances the simulation: piece movement, tower firing, damage, deaths, round completion.
- A **fixed-timestep accumulator** drives `tick`. Never pass a raw frame delta into the engine. Tests drive fake time by calling `tick` directly.
- "Round in progress" is a flag on `GameState`, not a separate code path. There is one state machine, not two.

### Time model — what it means for the engine

The design is in `game-design.md`; these are the consequences for code:

- **One state machine, not two.** "Round in progress" is a flag on `GameState`. Commands are valid both during a round and in the gap, so there is no separate build-phase code path.
- **Auto-start is a setting, not a mode.** It issues the same start command the player would. Do not branch on it beyond that.
- **The gap between rounds is untimed**, which is why no engine value may accrue with elapsed time.
- **Pieces hop between discrete squares.** The engine only ever holds square positions; smooth motion is the renderer interpolating between them.

### How the simulation reaches React

This bridge is the part most likely to get broken by accident, so understand it before changing `src/state/`:

1. `state/simulation.ts` owns the live `GameState` **outside React**, and advances it with the fixed-timestep accumulator.
2. `scene/GameLoop.tsx` calls `advance(delta * 1000)` from `useFrame`. It sets no state and touches no store.
3. `state/store.ts` subscribes to the simulation and publishes a snapshot to zustand **only when `structuralKey` changes** — that key deliberately excludes `roundElapsedMs`, `moveCooldownMs`, and `prevSquare`, all of which change every tick.
4. Components read the snapshot for mounting and unmounting. Smooth motion between squares is done in `useFrame` by mutating the mesh transform, reading live state via `simulation.getState()`.

Because pieces move in discrete hops, this keeps React renders rare: measured at **24 store publishes across 600 frames** (25x fewer than rendering per frame). `src/state/simulation.test.ts` guards this with a bound of 60 — comfortable headroom over the real number, but tight enough to fail on a regression — and if that test starts failing, something is pushing per-frame updates through React.

Adding a per-tick value to `structuralKey` would silently destroy this property. Don't.

### Directory layout

```
src/
  game/       pure TS rules engine — no React, no three.js
              types, state, step, tick, board helpers
  data/       board, piece types, tower ranks, card values, the starting Deck,
              round composition — data, not code
  scene/      R3F components: Board, Core, Towers, Pieces, GameLoop
  ui/         React DOM overlay: Hud, Deck, TowerPanel (later: PackOpen, the cull screen)
  state/      simulation (owns live state) + zustand bridge to React
```

Keep files focused. A file that has grown large is usually doing more than one job.

Card and piece definitions belong in `data/` as plain data. Balance changes should not require touching logic.

## React Three Fiber discipline

These are the failure modes that cause every R3F performance horror story:

- **Never call `setState` inside `useFrame`**, or in fast handlers like `onPointerMove`. Mutate refs directly. Routing per-frame updates through React's scheduler is the single biggest mistake available here.
- **Scale by `delta`**, not by fixed increments, so behaviour is refresh-rate independent.
- **Do not allocate in the frame loop.** No `new Vector3()` 60 times a second — instantiate once, reuse with `.set()`.
- **Share geometries and materials** via `useMemo`.
- **Instance repeated meshes.** Board squares and same-type pieces are the obvious candidates.
- **Toggle `visible`** rather than conditionally mounting, where mounting would recompile materials.
- Load assets with `useLoader` / `useGLTF` so they are cached scene-wide.

## Domain vocabulary

Use these terms exactly and consistently — in code, comments, and UI copy.

| Term | Meaning |
| --- | --- |
| **Cards** | The player's faction |
| **Chess** | The AI attacking faction |
| **Card** | An unplayed item in the Deck. A standard Card has a rank and a suit; a **Joker** has neither. **Consumed when played** |
| **Rank** | 2–10, J, Q, K, A. 2–10 build a Tower; J, Q, K, A act instead |
| **Suit** | ♥ ♦ ♠ ♣. Determines the support action a Card can apply |
| **Tower** | A Card played for its rank — placed, active, and destructible |
| **Support** | A Card played for its suit, applied to an existing Tower. The four suit actions only — a face card's action is never Support |
| **Shield** | Absorbing capacity on a Tower, granted by a **Jack**. Absorbed before health, never regenerates |
| **Echo** | The **Queen**'s action: a copy of an existing Tower's rank, built on an empty square |
| **Reinforce** | The **King**'s action: +1 to Core current and maximum health |
| **Expand** | The **Ace**'s action: the board gains a rank |
| **Clear** | The **Joker**'s action: every Piece on the board is destroyed |
| **Ink** | The run currency. Buys **packs**; never spent to play a card |
| **Piece** | One Chess-faction invader instance |
| **Piece type** | Pawn, knight, bishop, rook, queen, king |
| **Promotion** | A surviving Pawn becoming a Queen |
| **Core** | What the player defends |
| **Round** | One wave of invaders. Always "round", never "wave" |
| **Tick** | One fixed-timestep simulation step |
| **Command** | A player action entering the engine |
| **Leak** | A Piece reaching the Core |
| **Run** | One playthrough: a sequence of Rounds. Identified by a **seed** |
| **Deck** | All cards held for the current Run, capped at 30. Fully visible; grown by **packs**. There is no "hand" |
| **Pack** | A bundle of cards bought with Ink between Rounds |
| **Cull** | Destroying cards to stay within the 30-card Deck cap |
| **Square / rank / file** | Board positions, chess terminology |

**Careful with "rank".** It means two different things — a Card's rank (2–A) and a board rank (row). Both are standard in their own domain, so keep them apart by context and name variables accordingly (`cardRank` vs `boardRank`) wherever both could appear.

**And two types carry a Card's rank.** `CardRank` is every rank a Card can hold, `2..10 | 'J' | 'Q' | 'K' | 'A'`; `BuildableRank` is the `2..10` subset that builds a Tower. Anything doing arithmetic on a rank, or indexing `TOWER_RANKS` / `RANK_COLOURS`, wants `BuildableRank` — `Tower.cardRank` is one of these, because a Tower is only ever built from a buildable rank. `CardRank` was briefly the name of the narrow set; it is not any more, so treat an old reference to it with suspicion.

Do not introduce synonyms for these. Drifting between "wave" and "round", or "tower" and "defender", makes the codebase harder to search.

## Testing

- **The engine is the priority.** `src/game/` is pure and deterministic, so it should carry the bulk of the coverage — whole rounds can be simulated in milliseconds with no renderer.
- Drive time explicitly in tests by calling `tick` with a fixed delta. Never rely on wall-clock time or `requestAnimationFrame`.
- Test behaviour through the engine's public surface (`step`, `tick`, state queries), not internals.
- Keep `data/` definitions out of assertions where possible — a balance tweak should not break unrelated tests.
- **There is no jsdom and no component tests, so a decision left inside a `.tsx` file cannot be tested at all.** Pull any non-trivial branching out into a pure module beside it and test that: `src/game/commandFor.ts` decides which Command a Card produces, `src/scene/boardClick.ts` decides what a board click does. The `.tsx` handler should be plumbing — read the stores, call the pure function, apply the result.
- Use `pnpm test:run` in automation; `pnpm test` is watch mode.

## Open design decisions

**The canonical list lives in [`docs/design/game-design.md`](docs/design/game-design.md), under "Open questions".** It is deliberately the only copy — this list previously existed in three places and drifted out of sync every time the design changed.

Do not duplicate it here. Do not resolve anything on it by guessing.

## Documentation structure

Four roles, four homes. Putting content in the wrong one is how the docs drift:

| File | Role |
| --- | --- |
| `CLAUDE.md` | **How to work in this repo.** Stack, commands, architecture, discipline, vocabulary, testing. Design appears only as invariants that constrain code. |
| `docs/design/game-design.md` | **What the game is.** Living, mutable, single source of truth. Holds the only open-questions list. |
| `docs/superpowers/specs/*.md` | **Why decisions were made**, and what was rejected. Dated, frozen, never updated. |
| `docs/superpowers/plans/*.md` | **How a piece of work was carried out.** Dated, completed, frozen once done — a historical record of the tasks and order, not a live description of current state. |

When the design changes, edit `game-design.md`. Add a new dated spec only to record the reasoning behind a substantial decision — never to restate current state.

## Working agreements

- The repo is greenfield: prefer establishing a clean pattern over matching non-existent precedent, but once a pattern exists, follow it.
- Verify before claiming something works. Run the command and read the output.
- When a decision touches anything on the open-questions list, stop and ask rather than guessing.
