# Cards V Chess — Design

**Date:** 2026-08-05
**Status:** Foundation agreed. **Partly superseded** — see below.

> **Partly superseded by [2026-08-05-card-system-and-roster-design.md](2026-08-05-card-system-and-roster-design.md).**
>
> Still authoritative here: the tech stack and the reasoning behind it, the time model, the architecture and the `game/` boundary, and the testing approach.
>
> Overtaken there: the "Open design decisions" table below. The game is **run-based and seeded**, with a deck built up during a run rather than a persistent collection; the currency is named (**Ink**) and buys **packs** rather than gating card play; the card pool has an agreed grammar; the piece roster is assigned; and **Towers are destructible**.

This document records the decisions made and, more importantly, why. Conventions derived from these decisions live in `CLAUDE.md`.

## Concept

A web-based 3D tower defense game with trading-card-game mechanics. Two factions, named literally:

- **Cards** — the player. The deck is the arsenal; playing cards places and upgrades Towers defending the Core.
- **Chess** — the AI attacker. Waves of chess pieces invade, each piece type with distinct characteristics.

The game is **one-sided**. The player is always Cards. There is no mode in which the player commands chess pieces, and no symmetric or PvP framing.

## Decisions

### 1. Rendering: React Three Fiber

**Considered:** React Three Fiber, vanilla Three.js, Babylon.js.

Babylon was dropped early — its built-in GUI is a poor fit for card layouts compared to React, and the ecosystem is smaller.

The real choice was R3F versus vanilla Three.js, and it was researched rather than assumed. Findings:

- R3F's runtime overhead is **not** a real concern. The reconciler runs outside the animation loop; React only does work when props change. Rendering performance is Three.js and the GPU either way, because R3F *is* Three.js underneath.
- The substantive criticism of R3F for games is **architectural, not performance-related**. React is render-oriented; simulations are data-oriented. Developers who drive the simulation *through* React state describe "fighting the library." This critique is acknowledged by R3F contributors themselves.
- That failure mode applies to open-world, physics-first games with thousands of entities updating per frame.

**Cards V Chess has the inverse profile:** tens of entities, a discrete grid, a tick-based deterministic simulation — and a *heavy* 2D UI burden (the card Deck, card zoom, tooltips, pack opening, the cull screen). The UI half is where React is unambiguously strongest, and the simulation half is where R3F's weakness would have bitten.

Decisively, the chosen architecture removes the criticism entirely: the simulation does not live in React (see decision 3). React only draws.

**Accepted costs:** R3F does not fully support the WebGPU renderer as of early 2026 — irrelevant for low-poly, relevant only if compute shaders are ever wanted. Bundle size is marginally larger, though Three.js (~155KB gzipped) dominates regardless.

**Art style:** low-poly. This makes the performance argument for vanilla moot — the renderer will not be the bottleneck.

### 2. Time model: Bloons-style rounds

**Considered:** fully real-time; strictly turn-based; phased build/combat turns.

All three were wrong. The chosen model, per the user's reference to Bloons TD:

- Rounds are discrete and numbered.
- The gap between rounds is **untimed**. No pressure while planning.
- The player starts a round manually, or enables **auto-start** to chain rounds.
- Once live, combat runs in **real time** and does not wait for the player.
- The player may play cards **during** a round. Building is not confined to the gap.

This keeps tower-defense pressure while preserving the untimed planning that makes chess threat-ranges worth reading.

**Piece motion:** discrete hops on a per-piece cadence (knight fast, rook slow), with the renderer interpolating between squares for smoothness. Continuous sliding was rejected as fighting the chess identity. This is a number per piece type, so it is cheap to revisit.

**Auto-start is a setting, not a mode.** It enqueues the next start command. There is one state machine.

### 3. Architecture: renderer-agnostic engine

`src/game/` is pure TypeScript and **never imports React or Three.js**.

```ts
step(state: GameState, command: Command): GameState   // player actions
tick(state: GameState, fixedDt: number): GameState    // the simulation
```

A fixed-timestep accumulator drives `tick`; raw frame deltas never enter the engine. "Round in progress" is a flag on state, not a parallel code path.

Rationale:

1. **Testability** — entire rounds simulate in milliseconds with no browser, canvas, or renderer.
2. **Determinism** — nothing in the rules can depend on frame timing or component lifecycles.
3. **Reversibility** — if R3F disappoints, `src/scene/` is rewritten and the game plus its full test suite survives.

Point 3 is what made the R3F decision low-risk: it is not a one-way door.

### Structure

```
src/
  game/       pure rules engine
  data/       card and piece definitions as data
  scene/      R3F components
  ui/         React DOM overlay
  state/      zustand bridge
```

Card and piece definitions are data, so balance changes do not touch logic.

### Testing

The engine carries the bulk of coverage, since it is pure and deterministic. Tests drive time explicitly via `tick` with a fixed delta — never wall-clock or `requestAnimationFrame`. Behaviour is tested through the public surface, not internals.

## Open design decisions

Unresolved **on purpose**. Not to be silently resolved in code.

| Area | Status |
| --- | --- |
| Per-piece characteristics | Movement cadence, health, armour, abilities, and how strictly each type follows real chess movement. Acknowledged as differing per type; specifics deferred. |
| Card pool | Card types, effects, rarity, categories. |
| Economy | Draw rules and the resource gating card play. **No name chosen for the resource** — one should not be coined incidentally. |
| Multiplayer scope | Assumed single-player vs AI, no backend/accounts/netcode. Not confirmed. |
| Persistence / metagame | Collection, deckbuilding, progression, saving — all open. |
| Board geometry | Literal 8x8, or larger/other shape. |

## Build status

Scaffolded on 2026-08-05, after the decisions above were agreed.

The foundation is in place and verified: `pnpm typecheck`, `pnpm lint`, `pnpm test:run` (38 tests), and `pnpm build` all pass, and `pnpm dev` serves a playable round loop — board renders, rounds start manually or automatically, pawns hop toward the Core, leaks damage it, the game ends when it falls.

Two decisions made during scaffolding that are worth recording:

- **TypeScript pinned to 5.x.** TS 7 is published as `latest`, but `typescript-eslint` declares support only for `>=4.8.4 <6.1.0`, so TS 7 breaks linting. Revisit when typescript-eslint catches up.
- **The `game/` boundary is enforced by ESLint**, not merely documented. `no-restricted-imports` blocks renderer imports in `src/game/` and `src/data/`. Verified by deliberately introducing a violation and confirming the failure.

Deferred because they depend on the open decisions: the card pool and Deck UI (Towers are currently placed by clicking the board and cost nothing), tower combat behaviour (Towers are placed and rendered but do not fire), and the piece roster beyond one placeholder pawn.

**No project skills were written.** Skills for workflows like "add a card" or "add a piece type" would have to describe structures that do not exist yet — the card pool in particular. They should be written against real code, once the content design is settled.

## Next step

The open decisions — particularly the card pool, piece characteristics, and economy — are now the blocking work. They are entangled (which cards are worth having depends on which pieces threaten you, and both depend on the economy), so they are best resolved together rather than one at a time.
