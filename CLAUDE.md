# Cards V Chess

A web-based 3D tower defense game with trading-card-game mechanics.

Two factions, and the name is literal:

- **Cards** — the player. Your deck is your arsenal. You play cards to place and upgrade **Towers** that defend the **Core**.
- **Chess** — the AI opponent. Waves of chess pieces invade the board, each piece type with its own movement and characteristics, trying to reach the Core.

It is a **one-sided defense**. The player is always Cards; Chess is always the attacker. There is no mode where the player commands chess pieces.

## Current state

The repo is **empty** — no source, no `package.json`, nothing scaffolded. Everything below the "Tech stack" heading describes the **agreed target**, not existing code. Do not assume a file exists because it is named here.

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

None of these work yet — they are the intended interface once the project is scaffolded.

```bash
pnpm install
pnpm dev          # Vite dev server
pnpm build        # production build
pnpm test         # Vitest, watch mode
pnpm test:run     # Vitest, single run (use this in automation)
pnpm typecheck    # tsc --noEmit
pnpm lint
```

## Architecture

### The one hard rule

**`src/game/` must never import React or Three.js.**

The rules engine is pure TypeScript. It owns all game state and all game logic. The renderer reads that state and draws it. React renders; it never simulates.

This is not stylistic. It buys three things:

1. The entire game is testable without a browser, a canvas, or a renderer.
2. The simulation stays deterministic, because nothing in it can depend on frame timing or component lifecycles.
3. If R3F ever becomes the wrong choice, `src/scene/` gets rewritten and the game — plus its whole test suite — survives untouched.

If you find yourself wanting to import a Three.js type into `game/`, that is a signal the boundary is in the wrong place. Fix the boundary, don't cross it.

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

### Directory layout

```
src/
  game/       pure TS rules engine — no React, no three.js
              state, commands, tick, board, pathing, combat
  data/       card and piece definitions as data, not code
  scene/      R3F components: <Board/> <Tower/> <Piece/>
  ui/         React DOM overlay: Hand, CardDetail, HUD
  state/      zustand store bridging engine <-> view
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
