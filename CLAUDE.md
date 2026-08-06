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
- **Ink income.** The run currency, earned from Tower kills, round completion, and a Joker's Clear share, shown in the HUD. Kill rewards are authored per Piece type in `src/data/pieceTypes.ts`; the round lump sum and the Joker's share live in `src/data/ink.ts`. Every calculation is in `src/game/ink.ts`. **The numbers are still placeholders**, but packs now price them, so the joint tuning pass is finally possible — see the design doc's open questions.
- **Packs.** Four types — Scrap, Base, Court, Suited — bought with Ink **in the gap between rounds only**, culling to the 30-card cap first. A run opens by dealing a Base pack; there is no authored starting Deck. Runs are seeded, with named PRNG streams in `src/game/rng.ts`. Prices and rarity weights in `src/data/packs.ts` are placeholders; the sizes are not.
- **The full Chess roster** — Pawn, Knight, Bishop, Rook, Queen, King — each with its own movement, Pawn promotion on the back rank, hunting Knights, the King's move-speed/slide aura, and the Bishop's healing aura.
- **The Staging rank.** Pieces spawn one rank past the board and step onto the far rank on their own interval, so a Tower on the far rank blocks an entering Piece rather than having one spawn on top of it (issue #22). Drawn as a ledge by `src/scene/StagingRank.tsx`.
- **Tower combat.** Firing geometry per rank, Tower health, shields, damage from blocked Pieces, and destruction.
- **Tower legibility.** A Tower darkens as it loses health, flashes on a hit, pulses at critical health, and flares as it dies; clicking one opens an inspect panel with the exact figures, including lifetime `damageTaken`.
- The renderer (`src/scene/`), with distinct per-type rendering for each Piece, and the HUD, the Deck UI and the Tower panel (`src/ui/`).
- **CI.** `lint`, `typecheck`, `test:coverage` with per-directory thresholds, and `build` — see "CI" below.
- 588 tests across 35 files, all passing, none of which need a browser. Run `pnpm test:run` for the live count — this figure is indicative of scale, and a stale one here has already leaked into a plan document once.

What does **not** exist yet:

- **The pack-opening animation** (issue #10's stretch goal). The shop reveals a pack's contents as a grid, with no animation.
- **A visible or enterable seed.** Runs are seeded and reproducible, but the seed is internal — `src/state/simulation.ts` mints it and nothing shows it.
- **Caps on King and Ace accumulation.** Both hazards are now reachable and neither is capped; scarcity is the only mitigation.

Towers fire and can kill Pieces outright, so a round does not resolve by leaking out — it ends when nothing on the board can still act, whether that means every Piece destroyed or through the Core. No Piece type can end a round genuinely stranded any more: every type has a designed way off `stuck`.

Packs have landed, closing the gap between design and code on the economy — pricing and King/Ace caps are still open, so read `docs/design/game-design.md` for the intended design rather than inferring it from what is built. The largest unbuilt pieces now are the pack-opening animation and a visible seed.

**The Ace wedge is fixed, and it was never a shadow** (issue #16). Playing an Ace used to throw a wedge across the scene and lose the new rank. The cause was drei's `Instances`, which sizes its `instanceMatrix` and `instanceColor` buffers once from `limit` in a `useState` initialiser and never resizes them; its frame loop still reads the current `limit` to set `mesh.count`. `Board.tsx` passed `limit={squares.length}`, so an Ace moved `count` to 72 against 64 allocated slots — every upload then failed with `INVALID_VALUE: bufferSubData: srcOffset + length too large`, and the eight instances that never received a matrix drew as degenerate geometry. Both suspect `Instances` are now keyed on their slot count so a board growth remounts and reallocates them; **those `key` props are load-bearing, and the files say so.** The general lesson is in "React Three Fiber discipline" below.

Two notes for whoever revisits this. Suspecting the shadow frustum was wrong twice over, and the reasoning that killed it is worth keeping: three.js renders a receiver outside the shadow frustum fully **lit**, not black, and the light-space half-extent already exceeds the default box at 8×8, before any Ace. Separately, `src/scene/GameScene.tsx` really does cast from a `directionalLight` on three.js's default frustum, which a growable board outgrows — a faint dark band is visible at 8×8 with no Ace played. That is a real but **cosmetic and unrelated** open problem; do not let it re-absorb the blame for anything Ace-shaped.

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

- The **renderer boundary**, in both directions. Outbound: `src/game/` and `src/data/` importing React or Three.js fails `pnpm lint`. Inbound: `src/scene/`, `src/ui/`, and `src/state/` importing a module from inside `src/game/` — rather than the public surface at `src/game/index.ts` — also fails `pnpm lint`, so the renderer cannot reach past what the engine deliberately exports. Test files are exempt from the inbound half, because `src/state/structuralKey.test.ts` legitimately needs `src/game/fixtures`, a test-only builder module with no reason to be on the public surface.
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
- **A numbered Card supports only a Tower of its own rank; face cards support any Tower.** Suit and rank are not independent at play time. `canSupport` in `src/game/support.ts` is the single answer, and it is enforced twice on purpose: `supportTower` refuses the play, and `resolveBoardAction` declines the click so the Tower inspect panel gets it instead. `commandFor` deliberately does **not** check — it does not validate, and it only receives a `towerId`, never a Tower.
- **A support's value never depends on a rank.** Not the Card's, not the Tower's. Every ♠ adds the same health wherever it lands; the only variation is a flat premium for a face card. Anything reintroducing rank-scaled magnitude is a regression, not a balance choice. Supports are, however, **uncapped** — bounding a stack is open work, not a settled rule.
- **A Card's identity is its `id`, never its rank and suit.** The Deck is a multiset — cards come from random packs, so duplicates are normal. Three identical 5♦ are three distinct Cards, and playing one must leave the other two. Any lookup or removal keyed on rank+suit is a bug the moment a duplicate exists; go through `findCard` / `removeCard` in `src/game/cards.ts`.
- **The board grows.** An Ace adds a rank, so never derive a spawn rank or a board extent from a module constant — read it from `state.board`. A static `SPAWN_RANK` in `src/data/board.ts` had to be deleted for exactly this reason. Reading the extent from state is necessary but **not sufficient**: growth also has to survive *reaching* the renderer, which is how the Ace wedge happened — `Board.tsx` read `state.board` correctly and still broke, because a buffer sized on the first render never grew with it. The fixed shadow frustum in `src/scene/GameScene.tsx` is the same assumption still unfixed, cosmetically.
- **Towers block movement, and blocked Pieces attack them at half damage.** A Piece whose next square holds a Tower does not advance. The same rule constrains placement in the other direction: `canBuildOn` in `src/game/placement.ts` refuses a build on a square a Piece currently occupies, because a Piece standing on a Tower's square is one that walked through what should have stopped it. The renderer calls the same predicate to mark an illegal square before the click, so the marker and the refusal cannot disagree.
  The spawn route onto the same overlap is closed too, and differently: `drainDueSpawns` in `src/game/tick.ts` places a Piece on the **Staging rank** — `stagingRank(state.board)`, one past the board — which `isInBounds` rejects and so `canBuildOn` refuses for free. Entry to the board is then a move, which this same rule already covers. **A Tower and a Piece can no longer share a square by any route.**
- **Pieces spawn onto the Staging rank, and it must stay out of bounds.** `stagingRank` in `src/game/board.ts` returns `board.ranks`, and the entire fix for issue #22 rests on `isInBounds` being false there — that, and nothing else, is what stops a Tower being built where a Piece appears. Widening `isInBounds` to include it would silently re-open the collision. A Piece standing there is otherwise ordinary: Towers may fire at it, a Joker's Clear destroys it, auras reach it. `src/game/staging.test.ts` pins all of this.
- **Never add pathfinding.** A blocked Piece grinds; it must never route around. Routing would let the player steer Pieces by placing Towers — that is mazing, and it is rejected. Walling is allowed; herding is not.
- **Pieces move by chess rules, not toward the Core.** `src/game/movement.ts` owns this. There is no goal-seeking: a Piece reaches the Core only if chess movement happens to take it there.
- **A round ends when nothing can still act, not when the board is empty.** Every Piece type that could once run out of legal moves for good now has a designed way off `stuck` — Pawns promote, sliders and the King sweep sideways, and a Knight that exhausts its forward hops hunts the Core with knight moves rather than stranding on the back rank (see the hunting carve-out below) — but `stillActive` still checks every Piece, rather than assuming a designed answer always applies.
- **A Piece blocked by a Tower counts as acting.** `nextMove` returns `attackTower`, not `stuck`, so the round cannot end while it grinds. That terminates only because repair is bounded within a round: ♥ runs out, the Tower falls, the round resumes. **Packs do not remove that bound** — buying one is refused while a round is live, so the ♥ supply stays fixed until the gap. See `src/game/roundTermination.test.ts`, which pins it, and "Repair versus the wall" in the design doc.
- **Pieces are forward-biased and deterministic.** Direction is a pure function of Piece type, `moveCount`, and `handedness`. Never choose a line because the Core is on it — that is goal-seeking, and it makes Tower placement steer Pieces. **Narrow carve-out:** once a Knight's forward hops run out, it hunts the Core directly, guided by a knight-move distance field computed on an empty board (`src/game/knightDistance.ts`). The field never sees Towers, so Tower placement cannot change what it returns, and a hunting Knight blocked by a Tower grinds on it exactly like every other blocked Piece rather than trying another square. What the invariant actually guards against — Tower placement steering a Piece around an obstacle — still cannot happen; only the *source* of direction changes, and only for a Knight that would otherwise have nothing left to do.
- **Sliders and the King sweep laterally when forward is off the board, reflecting off the file edges and flipping `handedness`.** Round termination depends on this: without the flip a Piece oscillates between two files forever. Knights take a different answer to the same problem — once a Knight's forward hops run out it hunts the Core with knight moves instead of sweeping sideways, per the carve-out above.
- **No path manipulation.** No walls, no blockers, no herding. Defense is coverage, not maze geometry.
- **Ink is never spent to play a card.** It buys packs only.
- **Packs are bought only in the gap between rounds, and that is what keeps round termination bounded.** A ♥-repaired Tower a Piece cannot break is a permanent wall, and a round cannot end while a Piece grinds it. What bounds it is that the ♥ supply is finite *within a round* — so `buyPack` is refused while a round is live. This is the one deliberate exception to "commands are valid both between rounds and mid-round". `src/game/roundTermination.test.ts` pins it; without that test the rule is only a comment.
- **`nextEntityId`'s parity is load-bearing.** `tick.ts` derives a spawned Piece's `handedness` from it, so consecutively spawned Pieces weave opposite ways. Never spend that counter on anything but a Piece or a Tower — Cards have `nextCardId`. Dealing a 10-card pack from `nextEntityId` would silently reverse Piece movement for a whole run.
- **`step`'s switch is exhaustiveness-protected by its declared return type.** Adding a `Command` variant without a matching `case` is a compile error (`TS2366: Function lacks ending return statement`), not a runtime surprise — so no `assertNever` helper is needed. Do not add one, and do not weaken `step`'s return type to `GameState | undefined`, which would silently remove this.

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
   The Deck is keyed on its **card ids, not its length** — a cull-and-open at the cap replaces cards without changing how many there are, so a length key would never publish and the new cards would never reach React.
   The pack shop's reveal depends on this: it diffs the Deck's ids across a purchase, so keyed on length a cull-at-the-cap purchase would publish nothing and the new cards would never appear.
4. Components read the snapshot for mounting and unmounting. Smooth motion between squares is done in `useFrame` by mutating the mesh transform, reading live state via `simulation.getState()`.

Because pieces move in discrete hops, this keeps React renders rare: measured at **24 store publishes across 600 frames** (25x fewer than rendering per frame). `src/state/simulation.test.ts` guards this with a bound of 60 — comfortable headroom over the real number, but tight enough to fail on a regression — and if that test starts failing, something is pushing per-frame updates through React.

Adding a per-tick value to `structuralKey` would silently destroy this property. Don't.

### Directory layout

```
src/
  game/       pure TS rules engine — no React, no three.js
              types, state, step, tick, board helpers
  data/       board, piece types, tower ranks, card values, packs,
              round composition — data, not code
  scene/      R3F components: Board, Core, Towers, Pieces, GameLoop
  ui/         React DOM overlay: Hud, Deck, TowerPanel, PackShop
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
- **A growing `limit` on drei's `Instances` needs a `key` to match it.** `Instances` allocates its instance buffers once, from `limit`, in a `useState` initialiser — a later `limit` change moves `mesh.count` but never resizes those buffers, so the draw silently overruns them and the surplus instances render as garbage. Any `limit` derived from something that grows (the board, above all) must be paired with a `key` on the same value, so growth remounts and reallocates. This cost real debugging time once; see the Ace wedge under "Current state". Padding `limit` to a generous constant is **not** the fix here — the board's growth is uncapped, and a constant board extent breaks the invariant above.
- **Toggle `visible`** rather than conditionally mounting, where mounting would recompile materials.
- Load assets with `useLoader` / `useGLTF` so they are cached scene-wide.
- **Resetting state when a prop flips wants render-phase adjustment, not an effect.** `setState` inside `useEffect` trips `react-hooks/set-state-in-effect`. Compare the current value against a tracked previous one and set during render, updating the tracker in the same guarded block so the guard flips and the render converges — the pattern React documents for adjusting state when a prop changes. `src/ui/PackShop.tsx` does this to clear a stale selection when the shop reopens.

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
| **Support** | A Card played for its suit, applied to an existing Tower **of the same rank** — face cards excepted, which support any Tower. The four suit actions only; a face card's action is never Support |
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
| **Staging rank** | The off-board rank Pieces spawn onto, one past the board's last rank. Never a board square, so no Tower can stand there. A Piece enters the board by moving off it |

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
- **Vitest runs through esbuild, which strips types without checking them.** A test failing at runtime tells you nothing about what `tsc` thinks, and a passing test suite is not a passing typecheck. Verify any type-level claim with `pnpm typecheck`. This has already caused one wrong conclusion about the codebase's safety properties.

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
