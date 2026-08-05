# Cards V Chess

A web-based 3D tower defense game with trading-card-game mechanics.

Two factions, and the name is literal:

- **Cards** — the player. Your deck is your arsenal. You play cards to place and upgrade **Towers** that defend the **Core**.
- **Chess** — the AI opponent. Waves of chess pieces invade the board, each piece type with its own movement and characteristics, trying to reach the Core.

It is a **one-sided defense**. The player is always Cards; Chess is always the attacker. There is no mode where the player commands chess pieces.

## Current state

Scaffolded and running. `pnpm dev` gives a playable loop: a board renders, rounds start manually or automatically, pawns hop toward the Core, leaks damage it, and the game ends when it falls.

What exists:

- The rules engine (`src/game/`) with `step` / `tick`, driven by a fixed-timestep accumulator.
- The renderer (`src/scene/`) and a minimal HUD (`src/ui/`).
- 38 tests, all passing, none of which need a browser.

What does **not** exist yet, because it depends on open design decisions:

- **Cards.** There is no hand, no deck, and no card pool. Towers are placed by clicking the board, and cost nothing.
- **Tower combat.** Towers are placed and rendered but do not fire. Damage, range, and targeting depend on the card pool.
- **The piece roster.** One placeholder type (`pawn`) exists so there is something to render and test.

Because Towers cannot kill anything, a round currently resolves by leaking out. That is expected, not a bug.

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

Chosen because this game is roughly half 3D scene and half dense 2D UI (hand, deck, card zoom, tooltips, and later a deckbuilder). React handles the second half well, and low-poly art means the renderer will not be the bottleneck.

## Commands

```bash
pnpm install
pnpm dev          # Vite dev server
pnpm build        # typecheck, then production build
pnpm test         # Vitest, watch mode
pnpm test:run     # Vitest, single run (use this in automation)
pnpm typecheck    # tsc --noEmit
pnpm lint
```

**TypeScript is pinned to the 5.x line on purpose.** TypeScript 7 is published as `latest`, but `typescript-eslint` currently declares support only for `>=4.8.4 <6.1.0`, so upgrading breaks `pnpm lint`. Revisit once typescript-eslint ships TS 7 support.

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

- `step` handles player commands — play a card, place a Tower, upgrade, start the round. Commands are valid both between rounds and mid-round.
- `tick` advances the simulation: piece movement, tower firing, damage, deaths, round completion.
- A **fixed-timestep accumulator** drives `tick`. Never pass a raw frame delta into the engine. Tests drive fake time by calling `tick` directly.
- "Round in progress" is a flag on `GameState`, not a separate code path. There is one state machine, not two.

### Time model

Bloons-style rounds:

- Rounds are discrete and numbered.
- The gap between rounds is **untimed** — the player studies the board and plays cards with no pressure.
- The player starts a round manually, or enables **auto-start** so rounds chain automatically. Auto-start is a setting that enqueues the next start command; it is not a different game mode.
- Once a round is live, combat runs in **real time** and does not wait for the player.
- The player can play cards **during** a round. Building is not locked to the gap.

Chess pieces move in **discrete hops** on a per-piece cadence (knight fast, rook slow), not by sliding continuously. The renderer interpolates between squares so motion reads as smooth. Discrete hops preserve the chess identity and keep threat ranges legible.

### How the simulation reaches React

This bridge is the part most likely to get broken by accident, so understand it before changing `src/state/`:

1. `state/simulation.ts` owns the live `GameState` **outside React**, and advances it with the fixed-timestep accumulator.
2. `scene/GameLoop.tsx` calls `advance(delta * 1000)` from `useFrame`. It sets no state and touches no store.
3. `state/store.ts` subscribes to the simulation and publishes a snapshot to zustand **only when `structuralKey` changes** — that key deliberately excludes `roundElapsedMs`, `moveCooldownMs`, and `prevSquare`, all of which change every tick.
4. Components read the snapshot for mounting and unmounting. Smooth motion between squares is done in `useFrame` by mutating the mesh transform, reading live state via `simulation.getState()`.

Because pieces move in discrete hops, this keeps React renders rare: measured at **28 store publishes across 600 frames** (~21x fewer than rendering per frame). `src/state/simulation.test.ts` guards this — if that test starts failing, something is pushing per-frame updates through React.

Adding a per-tick value to `structuralKey` would silently destroy this property. Don't.

### Directory layout

```
src/
  game/       pure TS rules engine — no React, no three.js
              types, state, step, tick, board helpers
  data/       board, piece types, round composition — data, not code
  scene/      R3F components: Board, Core, Towers, Pieces, GameLoop
  ui/         React DOM overlay: Hud (later: Hand, CardDetail)
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
| **Card** | An item in hand, not yet played |
| **Tower** | A Card's placed, active instance on the board |
| **Piece** | One Chess-faction invader instance |
| **Piece type** | Pawn, knight, bishop, rook, queen, king |
| **Core** | What the player defends |
| **Round** | One wave of invaders. Always "round", never "wave" |
| **Tick** | One fixed-timestep simulation step |
| **Command** | A player action entering the engine |
| **Leak** | A Piece reaching the Core |
| **Square / rank / file** | Board positions, chess terminology |

Do not introduce synonyms for these. Drifting between "wave" and "round", or "tower" and "defender", makes the codebase harder to search.

## Testing

- **The engine is the priority.** `src/game/` is pure and deterministic, so it should carry the bulk of the coverage — whole rounds can be simulated in milliseconds with no renderer.
- Drive time explicitly in tests by calling `tick` with a fixed delta. Never rely on wall-clock time or `requestAnimationFrame`.
- Test behaviour through the engine's public surface (`step`, `tick`, state queries), not internals.
- Keep `data/` definitions out of assertions where possible — a balance tweak should not break unrelated tests.
- Use `pnpm test:run` in automation; `pnpm test` is watch mode.

## Open design decisions

These are **deliberately unresolved**. Do not invent answers, silently pick one, or write code that hardcodes an assumption about them. Ask.

- **Per-piece characteristics** — movement cadence, health, armour, abilities, and how closely each piece type follows real chess movement.
- **The card pool** — what card types exist, what they do, rarity and card categories.
- **Economy** — how cards are drawn, what resource gates playing them, how it is earned. No term has been chosen for this resource yet; do not coin one.
- **Multiplayer scope** — currently assumed single-player versus AI, with no backend, no accounts, and no netcode. Not yet confirmed.
- **Persistence and metagame** — whether there is a collection, deckbuilding, or progression, and whether any of it is saved.
- **Board geometry** — whether the board is a literal 8x8 chessboard or a larger/differently shaped grid.

## Working agreements

- The repo is greenfield: prefer establishing a clean pattern over matching non-existent precedent, but once a pattern exists, follow it.
- Verify before claiming something works. Run the command and read the output.
- When a decision touches anything in "Open design decisions", stop and ask rather than guessing.
