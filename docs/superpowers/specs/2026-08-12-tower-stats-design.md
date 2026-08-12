# Tower Stats — Design

Date: 2026-08-12
Issue: #58 — "when viewing a tower, you should be able to see its current stats (pieces defeated, DPS, health, shield etc.)"

## What exists

The Tower inspect panel (`src/ui/TowerPanel.tsx`) already shows Health, Shield (conditional), Damage taken (lifetime), and a line of `range · damage · fireIntervalMs · targets per shot`. The engine already tracks `shotsFired` and `damageTaken` on each Tower. There is **no per-Tower kill counter** — kills currently feed Ink and nothing else.

## Decisions

- **Pieces defeated** is a new lifetime `kills` counter on `Tower`, monotonic like `damageTaken` and `shotsFired`, incremented when a Tower's damage is the killing blow. Survives repair; never reset within a run.
- **DPS** is theoretical: `damage / (fireIntervalMs / 1000)` from the Tower's current instance values. Live — a ♣ or ♦ support updates it immediately. It deliberately ignores the Amplifier's positional doubling: the doubling applies where the *target* stands, so no single static figure can capture it, and the panel's philosophy is per-Tower figures. The Amplifier/Freezer's low own-DPS is correct; their value is the aura.
- **Kill credit goes to the finishing blow.** When a Piece dies after being hit by multiple Towers, the Tower whose damage takes its health to `<= 0` gets the credit. Deterministic, matches how players read "who killed it".
- **Lifetime per run**, not per round.
- **Extend the existing panel** — no new UI surface.

## Engine changes

### `src/game/types.ts`

Add to `Tower`:

```ts
readonly kills: number
```

Documented as: monotonic lifetime count of Pieces whose finishing blow this Tower dealt; never reset; a Joker's Clear is a board wipe by the Joker, not a Tower's shot, so it never credits any Tower; kept out of `structuralKey` because the death itself removes the Piece (the keyed `pieces` string), so the panel already publishes on every kill.

### `src/game/cardPlays.ts` and `src/game/fixtures.ts`

Seed `kills: 0` in Tower creation and the test helper, next to `shotsFired: 0`.

### `src/game/tick.ts` — attribution in `fireTowers`

Ride the existing damage loop; no new tick-level state beyond a local map:

- Add `const killers = new Map<string, string>()` (`pieceId -> towerId`).
- In the `for (const target of acquired)` loop, capture health before/after:

```ts
const before = remainingHealth.get(target.id) ?? target.health
const after = before - tower.damage * multiplier
remainingHealth.set(target.id, after)
if (before > 0 && after <= 0) killers.set(target.id, tower.id)
```

`selectTargets` already skips Pieces at `<= 0` health, so a Piece dies at most once per tick and exactly one Tower can be its finisher — the check is exact, and deterministic because iteration order is fixed.

- On the `nextTowers.push(...)`, add `kills: tower.kills + (number of `killers` entries whose value is this Tower's id)`. Since a Piece dies at most once per tick, each entry is a distinct kill.

The Wall's early `continue` and the miss path need no changes — a gunless Tower or a missed shot never acquires a target, so it can never be a finisher. A Clear never reaches `fireTowers`, so it credits nothing.

## Panel changes

`src/ui/TowerPanel.tsx` — two additions to the existing `<dl className="hud__stats">`:

- **Pieces defeated** — `formatStat(tower.kills)`, after "Damage taken". Always present.
- **DPS** — `tower.damage / (tower.fireIntervalMs / 1000)`, own row, rounded with `formatStat` (drops trailing `.0`).
- **Wall (rank 7)** — DPS row hidden, mirroring how `targetsLabel` returns `null` for it and the panel drops the clause. The geometry line already says it never fires.

DPS derives from `tower.damage` and `tower.fireIntervalMs`, both already in `structuralKey`, so a support play refreshes it automatically; no key change needed.

## Testing

Engine suites only — no jsdom, no `.tsx` tests:

- **Finishing blow credit** — two Towers damage the same Piece across a tick; only the finisher gains a kill.
- **Overkill** — a shot exceeding a Piece's remaining health counts exactly one kill.
- **Miss** — a black Piece's missed shot leaves `kills` at 0.
- **Wall never kills** — rank 7's `kills` stays at its seed.
- **Clear credits no Tower** — a Joker wipe leaves every surviving Tower's `kills` unchanged.
- **Lifetime, not per-round** — `kills` survives `startRound`; two rounds accumulate.

`structuralKey` is not modified; its existing test stays green.
