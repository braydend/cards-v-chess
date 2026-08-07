# Chess Piece Tiers — Design

**Date:** 2026-08-07
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

Every Chess Piece plays the same strategy: march down-board, hunt the Core once
forward motion runs out. There is no difficulty lever inside a round beyond
"more Pieces, later types" — the roster stays the same threat from round 1 to
round 40. Issue #31 asks for **tiers** of Pieces, so the difficulty curve has
something to scale *with*: as rounds progress, the mix shifts from dumb to
smart to aggressive to sneaky.

Issue #13 (Pieces pathing to the corner after hitting the end of the board) is
**already resolved** — the hunting-for-all work deleted the lateral sweep, and
every Piece now hunts the Core once its forward move runs out. The tier work
therefore builds on the hunting system rather than replacing it. "Green" is the
current behaviour, hunting included.

## Decision

Each spawn is assigned a **tier** — `green`, `yellow`, `red`, or `black` — a
per-Piece property set at spawn, carried for life, and inherited through
promotion. A tier is a small set of behaviour flags; it never touches a Piece's
type, its stats, or its Ink reward. Any type can be any tier: a red Pawn, a
black Rook, a green Queen are all legal.

| Tier | Colour (marker) | Flags |
| --- | --- | --- |
| **Green** | none | baseline — current logic, hunting included |
| **Yellow** | yellow | `huntsFromSpawn` |
| **Red** | red | `seeksTowers` |
| **Black** | black | `dodgeChance: 0.5` |

### The four tiers

- **Green — "dumb".** Exactly today's logic. Marches forward, hunts once
  forward motion runs out, promotes on the back rank. The default tier a run
  begins in.
- **Yellow — "smart".** Hunts the Core from the moment it steps onto the board,
  rather than marching first. Direction comes from the same per-type distance
  fields hunting already uses; the fields remain Tower-blind. A yellow Piece is
  born with `hunting: true`. **One carve-out:** the Staging rank is not a board
  square, so a distance field has no entry for it — a yellow Piece's first hop,
  entry onto the board, is an ordinary forward march, and hunting begins the
  moment it is on the board. This preserves the Staging rank's one-way entry
  rule, which is already structural. **Pawns never hunt** — they promote — so a
  yellow Pawn marches and promotes exactly like a green one; the *promotion*
  inherits yellow and so becomes a Queen that hunts from spawn.
- **Red — "aggressive".** Seeks Towers. On each move decision a red Piece finds
  the nearest Tower reachable by its *own* movement — a distance field over its
  own move set, seeded at each Tower, capped by a reach radius (placeholder
  number) — and detours to it, overriding its forward march at any point. It
  moves by the same `huntByField` discipline as hunting: one hop per interval,
  the slide capped at the closer square, a Tower blocking the line ground
  rather than routed around. When it has destroyed its target it resumes its
  normal march (or hunt). **The fields stay Tower-blind as geometry** — Towers
  are only ever the *seed* of a red field, never obstacles in it — so red gains
  no pathfinding and cannot be used to route Pieces around each other. What the
  fields do see is the Tower *list*, which is what makes Tower placement able to
  attract a red Piece — a deliberate inversion of the no-mazing invariant, and
  a strategic choice the player makes (placing a decoy Tower spends a card and
  draws aggression toward it).
- **Black — "sneaky".** Each incoming damage event from Tower fire rolls the
  seeded PRNG once: a 50% chance the shot is negated entirely. Joker's Clear is
  a board wipe, not damage, so it is **not** dodged. Rolls come from a new named
  PRNG stream, `rng.combat`, so the dodge is deterministic per run seed and the
  `packs` stream is untouched. The renderer flashes a **whiff** — the shot that
  "missed" is visible to the player, so a Black Piece standing still through
  Tower fire reads as dodging, not as immune or un-rendered.

  **A dodge cannot be inferred by the renderer — it must be recorded.** A Tower
  hit is a `damageTaken` rise, a Piece death is an absence, but a negated shot
  changes no field the renderer diffs, so no mechanism can spot it from a
  snapshot. The engine therefore records each negated shot in a new
  `GameState.recentDodges` ring — the `recentExits` precedent: a never-cleared,
  capped ring of `{ pieceId, roundNumber, roundElapsedMs }`. Because a dodge
  never moves the structural key, the flash cannot be diff-driven like the
  Tower hit-flash; it is read live in `useFrame`, exactly as movement is:
  `PieceMesh` scans the ring for its own id within the whiff window and drives
  a short emissive/scale pulse. `roundNumber` in the record stops a dodge from
  a previous round re-flashing at the same elapsed time in the next one.

### The universal combat rule, sharpened

The clarifying answer to "who deals full damage to a Tower" generalised the
combat rule: **any** Piece deals **full** damage to a Tower that stands on one
of its **attack tiles** — a square the Piece could capture onto by its chess
movement (a Pawn's forward diagonals, a Knight's L-squares, a slider's lines,
a King's neighbouring squares). Half damage is reserved for the one case where
the Tower blocks the Piece but does **not** stand on an attack tile: **a Pawn
blocked straight ahead.** A Pawn's attack tiles are its forward diagonals, so a
Tower directly in front is "genuinely stuck" territory — half damage. Every
other Piece's blocking Tower sits on an attack tile, so it deals full damage.
This is a real buff to every Piece's Tower-killing power (all sliders, Knights,
Queens, and Kings now deal full damage when blocked), and it is deliberate. It
also interacts with the "repair versus the wall" open question — Towers fall
faster under the roster now — and the design doc must record the change
consciously, not silently.

Red is the only tier that *deliberately seeks* attack positions; the other
tiers only ever attack a Tower that happens to block them. The rule itself is
universal; the seeking is red's alone.

### Round composition and the difficulty ramp

`rounds.ts` extends its deterministic machinery — no PRNG — with a tier
unlock schedule and a weighted tier mix:

- Tiers unlock on their own `INTRODUCED_AT` schedule (green from round 1; the
  others later, with placeholder rounds).
- `roundSpec` assigns a tier per spawn from a weighted mix that shifts toward
  higher tiers as rounds progress, using the same interleaved-pool technique
  that keeps rare Piece types reachable in short rounds.
- The result stays a pure function of the round number: same round, same
  spawns, same tiers, same files. No new randomness enters the engine.

### Promotion and Ink

A promoted Queen inherits the Pawn's tier — a red Pawn becomes a red Queen still
hunting Towers; a black Pawn keeps its dodge through promotion. **Ink rewards
stay purely per-type** — a tier changes behaviour, never bounty. This is a
decision for now, explicitly revisitable if balancing needs it later.

## Architecture

### Engine (`src/game/`)

- **`types.ts`**: `PieceTier = 'green' | 'yellow' | 'red' | 'black'`. `Spawn`
  and `Piece` gain `tier`. `MoveRequest` gains `tier`. `GameState` gains the
  `recentDodges` ring (the `recentExits` shape: a never-cleared, capped array).
- **`data/tiers.ts`** (new): the tier table, mirroring `pieceTypes.ts` —
  `id`, `huntsFromSpawn`, `seeksTowers`, `dodgeChance`. Balance numbers
  (reach radius, unlock rounds, mix weights) are **placeholder**, labelled as
  such.
- **`data/rounds.ts`**: tier unlock schedule + shifting weighted mix; `Spawn`
  gains `tier`.
- **`movement.ts`**: `nextMove` branches on `request.tier`. Yellow: treat as
  hunting from the first on-board hop. Red: on each decision, find the nearest
  reachable Tower by own-movement distance field (seeded at Towers, cached),
  within the reach cap; if found, move by `huntByField` toward it, else behave
  as green. The pawn-blocked-straight-ahead carve-out: a Pawn whose only
  attack-free block sits directly ahead attacks at half damage; everything else
  attacks at full.
- **`tick.ts`**: `drainDueSpawns` and `promotedQueens` read `tier`. The blocked
  attack multiplier becomes conditional on the carve-out above. `fireTowers`
  gains the dodge: per shot at a Black Piece, roll `next(rng.combat)`; on
  negate, skip the damage and append a `recentDodges` entry. `tick` threads and
  returns the advanced `rng.combat` (the first `tick`-side randomness — safe
  because the named-stream design keeps `packs` independent). `step` spreads
  `rng` through untouched.
- **`rng.ts`**: no change — a new named stream is just a new `streamFor(seed,
  name)` call. `GameState.rng` gains a `combat` member.
- **`ink.ts`**: unchanged — tier never pays.

### State bridge (`src/state/`)

- **`structuralKey.ts`**: no new per-tick entry. `tier` is set once at spawn and
  never changes, so it rides along with the existing per-Piece entry
  (`id@square:health`), which already re-renders on spawn/die. Publishing
  cadence is unchanged.

### Renderer (`src/scene/`)

- **`tierColours.ts`** (new): one colour per tier for the marker, deliberately
  disjoint from `PIECE_COLOURS` and `RANK_COLOURS`, guarded by a test (the
  `pieceColours.test.ts` precedent).
- **`Pieces.tsx`**: the piece body keeps its per-type colour (the load-bearing
  Bishop pink / King orange / Queen crimson stay). A **tier ring** at the base
  marks the tier — same ring geometry the King-buff ring already uses, a
  different material. Green gets no ring (it is the baseline). The buff ring
  and the tier ring coexist by stacking (buff above, tier below). **This marker
  is explicitly interim** — the issue anticipates real per-tier assets later,
  and this is the placeholder representation until then.
- **Whiff flash** (new, in `Pieces.tsx` or a small companion module): when a
  Black Piece negates a shot, a brief flash marks the miss. Follows the Tower
  hit-flash precedent (`towerColour.ts`/`towerDiff.ts`): tunable presentation
  constants, nothing in the engine reads them. Unlike the Tower flash it cannot
  be diff-driven — a dodge moves no field in the structural key — so
  `PieceMesh` reads `recentDodges` live in `useFrame` (the same channel as
  movement interpolation) and pulses a short emissive/scale whiff when its own
  id appears within the whiff window. `roundNumber` on the record keeps a
  previous round's dodge from re-flashing at the same elapsed time.

### Design doc and invariants

The two invariants that soften are recorded consciously in `game-design.md`:

1. **"No designated Tower-hunter"** becomes "no designated Tower-hunter *except
   red*" — red is a designed exception that seeks Towers. The universal combat
   rule replaces the uniform half-damage line.
2. **"Fields never see Towers"** gains the red carve-out: fields stay
   Tower-blind as geometry (no pathfinding), but red's fields are *seeded* at
   Towers, which is what lets Tower placement attract them.

## Testing

- `data/rounds.ts`: tier unlock schedule + shifting mix are deterministic; tiers
  actually appear in spawns; a newly unlocked tier appears in its unlock round.
- `data/tiers.ts`: the table's shape — every tier has a label, green is the
  all-false baseline.
- `game/movement.test.ts`: a yellow Knight hunts from its first on-board hop; a
  yellow Pawn still marches and promotes; a red Piece targets the nearest Tower
  within reach and resumes marching once it is gone; a red Piece grinds a Tower
  blocking its line rather than routing around (no pathfinding pinned).
- `game/firing.test.ts` / tier tests: **a Rook (or any non-Pawn) blocked by a
  Tower ahead deals full damage; a Pawn blocked straight ahead deals half** —
  the sharp edge of the universal rule. Black dodge negates shots from a seeded
  stream; a Clear still destroys a Black Piece; a non-Black Piece never dodges;
  a negated shot appends exactly one `recentDodges` entry carrying the piece
  id, round number, and elapsed time.
- `game/promotion.test.ts`: promoted Queen inherits the Pawn's tier.
- `game/staging.test.ts`: a yellow Piece hunts only once on the board, never
  from the Staging rank.
- `state/structuralKey.test.ts`: publishing stays under the 60-publish bound
  (tier is static per piece).
- `game/rng.test.ts`: the `combat` stream is independent of `packs`.

## Open questions

- **Placeholder numbers**: tier unlock rounds, the red reach radius, the tier
  mix weights, and the dodge chance are all tuning, not design. They live in
  `data/` and are labelled placeholders.
- **Half damage survives in exactly one place** (Pawn blocked straight ahead).
  If a future Piece type wants to demolish Towers at full damage (the
  `BLOCKED_ATTACK_MULTIPLIER` comment's "future Piece designed to demolish
  Towers" case), red now occupies that niche.
