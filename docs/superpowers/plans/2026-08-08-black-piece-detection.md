# Black Piece Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the Black Piece's defensive power from "dodges Tower shots" to "undetected by Towers" — the Tower fails to acquire the target, so the shot never fires — with a full `dodge`→`miss` rename, a cloak-flicker visual, and updated docs.

**Architecture:** In `fireTowers` (`src/game/tick.ts`) the per-target roll moves out of the damage loop into a detection pass that filters undetected Black targets out before any damage is applied; the cooldown arithmetic is untouched, so a miss spends the fire interval exactly as today's dodge does. The engine renames `dodgeChance`→`missChance`, `DodgeRecord`→`MissRecord`, `recentDodges`→`recentMisses`, `DODGE_RING_SIZE`→`MISS_RING_SIZE`, `appendDodges`→`appendMisses`, `dodged`→`missed`. The renderer renames `whiff.ts`→`cloakFlicker.ts`, replaces the scale-swell `whiffScale` with an opacity-dip `cloakOpacity`, and gives Black Pieces a per-Piece cloned material (opacity is per-material, materials are shared per tier).

**Tech Stack:** TypeScript (strict), Vitest, React Three Fiber. Commands: `pnpm test:run`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.

## Global Constraints

- `src/game/` must never import React or Three.js. **Enforced by ESLint.**
- `Math.random` must never appear in `src/game/`. Misses roll `rng.combat` via `next()` in `src/game/rng.ts`, exactly as today's dodge does.
- `src/scene/`, `src/ui/`, `src/state/` import from the engine only via `src/game/index.ts` (the public surface). `MissRecord` must be exported there.
- The health arithmetic is **identical** to today's dodge: `blackHealth = greenHealth + misses × damage` holds exactly. The detection pass is behavior-preserving; roll order (towers in array order, targets in `selectTargets`'s sorted order) is unchanged, so determinism is preserved.
- The `rng.combat` stream keeps its current independence from `packs`; the 50% placeholder stays `0.5` under its new name `missChance`.
- Frozen docs — `docs/superpowers/specs/2026-08-07-chess-tiers-design.md` and `docs/superpowers/plans/2026-08-07-chess-tiers.md` — describe the dodge as it was decided and must **not** be edited.
- The codebase stops saying "dodge": after Task 1, `rg -i dodge src` matches nothing; after Task 2, `rg whiff src` matches nothing either.
- No non-null assertions (`noUncheckedIndexedAccess` is on). Fixtures throw rather than return `undefined` (see `firstTower`).
- TypeScript is pinned to the 5.x line; do not bump it.

---

### Task 1: Engine — rename `dodge`→`miss` and move the roll into a detection pass

**Files:**
- Modify: `src/game/types.ts:62-80` (TierDef), `113-125` (DodgeRecord), `338-352` (recentDodges), `405-414` (rng.combat comments)
- Modify: `src/data/tiers.ts:6,9-12`
- Modify: `src/data/tiers.test.ts:8,19-25`
- Modify: `src/game/index.ts:26`
- Modify: `src/game/state.ts:42`
- Modify: `src/game/tick.ts:17-26,39-44,63-78,172-177,202,255,272,307-390,408`
- Rename: `src/game/dodge.test.ts` → `src/game/miss.test.ts` (git mv, then rewrite)
- Modify: `src/state/structuralKey.test.ts:57-68`
- Modify: `src/scene/whiff.ts` (type/field references only — the module rename to `cloakFlicker.ts` and the visual change are Task 2)
- Modify: `src/scene/whiff.test.ts` (type/field references only)
- Modify: `src/scene/Pieces.tsx:155` (`state.recentDodges` → `state.recentMisses`)

**Interfaces:**
- Consumes: `GameState.recentDodges` and `DodgeRecord` (both being renamed out of existence); `TIERS.black.dodgeChance`.
- Produces: `TierDef.missChance`; `interface MissRecord { pieceId: string; roundNumber: number; roundElapsedMs: number }` (exported from `index.ts`); `GameState.recentMisses: readonly MissRecord[]`; `MISS_RING_SIZE = 32`; `appendMisses`; `fireTowers` returns `{ towers, pieces, destroyed, rng, missed }` where `missed: string[]`. These names are what Task 2 consumes.

- [ ] **Step 1: Write the renamed test file first**

`git mv src/game/dodge.test.ts src/game/miss.test.ts`, then replace the file's contents with:

```ts
import { describe, expect, it } from 'vitest'
import { TOWER_RANKS } from '../data/towerRanks'
import { firstTower, liveRound, pieceAt, withTower } from './fixtures'
import { step, tick } from './index'
import type { GameState, PieceTier } from './types'

const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/** A rank-3 vertical Tower, one Rook on its file under fire. */
function underFire(tier: PieceTier): GameState {
  const rook = pieceAt('rook', 'sneak', { file: 3, rank: 4 })
  return liveRound(withTower(3, { file: 3, rank: 2 }), [{ ...rook, tier }])
}

// 6 shots at 2 damage = 12, under the Rook's 14 health even for green. The
// Rook marches once, at 1600ms, from (3,4) to (3,3) — still on the tower's
// file, so every shot in the window still lands.
const WINDOW_MS = TOWER_RANKS[3].fireIntervalMs * 6 + DT

describe('the black miss', () => {
  it('is missed on a seeded roll, so a black Piece takes less damage than a green twin', () => {
    const black = runFor(underFire('black'), WINDOW_MS)
    const green = runFor(underFire('green'), WINDOW_MS)

    const blackHealth = black.pieces.find((piece) => piece.id === 'sneak')?.health ?? 0
    const greenHealth = green.pieces.find((piece) => piece.id === 'sneak')?.health ?? 0

    expect(black.recentMisses.length).toBeGreaterThan(0)
    expect(blackHealth).toBeGreaterThan(greenHealth)
  })

  it('records exactly one entry per undetected shot, carrying piece id, round, and elapsed time', () => {
    const black = runFor(underFire('black'), WINDOW_MS)
    const green = runFor(underFire('green'), WINDOW_MS)

    const blackHealth = black.pieces.find((piece) => piece.id === 'sneak')?.health ?? 0
    const greenHealth = green.pieces.find((piece) => piece.id === 'sneak')?.health ?? 0
    const missed = black.recentMisses.length

    // Each undetected shot is one 2-damage hit the green twin still took, so
    // the black Piece's health exceeds the green twin's by damage × misses.
    expect(blackHealth).toBe(greenHealth + missed * TOWER_RANKS[3].damage)

    for (const record of black.recentMisses) {
      expect(record.pieceId).toBe('sneak')
      expect(record.roundNumber).toBe(1)
      expect(record.roundElapsedMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('spends the fire interval on a miss, so the Tower keeps its cadence against a Black Piece', () => {
    const black = runFor(underFire('black'), WINDOW_MS)
    const green = runFor(underFire('green'), WINDOW_MS)

    expect(black.recentMisses.length).toBeGreaterThan(0)
    // A miss is a shot that fires nothing but still spends the interval, so
    // the Tower's cooldown lands exactly where the green twin's does. If a
    // miss held at "ready" instead, the Tower would roll again nearly every
    // tick against a lone Black Piece and the 50% would collapse to ~3%.
    expect(firstTower(black).fireCooldownMs).toBe(firstTower(green).fireCooldownMs)
  })

  it('never misses a non-Black Piece, and records nothing', () => {
    const green = runFor(underFire('green'), WINDOW_MS)

    expect(green.recentMisses).toEqual([])
  })

  it("a Joker's Clear still destroys a Black Piece, and rolls nothing", () => {
    const state = { ...underFire('black'), deck: [{ id: 'joker', kind: 'joker' as const }] }
    const cleared = step(state, { kind: 'clearPieces', cardId: 'joker' })

    expect(cleared.pieces).toHaveLength(0)
    expect(cleared.recentMisses).toEqual([])
  })

  it('is deterministic — same seed, same misses', () => {
    expect(runFor(underFire('black'), WINDOW_MS).recentMisses).toEqual(
      runFor(underFire('black'), WINDOW_MS).recentMisses,
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/game/miss.test.ts`
Expected: FAIL. `black.recentMisses` is `undefined` (the field does not exist yet), so `.length` throws. The renamed tests cannot pass until the rename lands.

- [ ] **Step 3: Rename the engine surface**

`src/game/types.ts:74`:
```ts
  /** Chance in [0, 1) a Tower fails to detect this Piece on a shot. 0 = never. */
  readonly missChance: number
```

`src/game/types.ts:113-125` — replace `DodgeRecord` with:
```ts
/**
 * One undetected Tower shot, recorded for the renderer.
 *
 * A miss changes no field the renderer diffs — a hit is a `damageTaken` rise,
 * a death is an absence, but a miss leaves the Piece untouched — so it
 * must be recorded or the cloak-flicker can never be shown. Never cleared,
 * capped at `MISS_RING_SIZE` in `tick.ts` exactly as `recentExits` is.
 */
export interface MissRecord {
  readonly pieceId: string
  readonly roundNumber: number
  readonly roundElapsedMs: number
}
```

`src/game/types.ts:338-352` — replace the field and its doc comment:
```ts
  /**
   * The most recent undetected Tower shots, for the renderer to show a
   * cloak-flicker.
   *
   * A miss is invisible to the structural key — the Piece ends the tick with
   * the same square, health, and flags it started with — so it must be recorded
   * or the cloak-flicker can never be drawn. Lookup is by `pieceId`, unique
   * within a run, so a stale record can never match a live Piece.
   *
   * NEVER CLEARED, and deliberately excluded from `structuralKey`: a miss is a
   * pure render cue, and keying it would publish a store update for every
   * undetected shot. Capped at `MISS_RING_SIZE` in `tick.ts` instead, exactly
   * as `recentExits` is. A Joker's Clear is a board wipe, not damage, so it
   * never rolls and never lands here.
   */
  readonly recentMisses: readonly MissRecord[]
```

`src/game/types.ts:405-414` — in the `rng` doc: "the black dodge from its own" → "the black miss from its own"; "what an existing seed deals or dodges" → "what an existing seed deals or misses"; and line 414: `/** The black dodge's draws. ... */` → `/** The black miss's draws. ... */`.

`src/data/tiers.ts:6`:
```ts
 * logic. The reach radius and the 50% miss chance are PLACEHOLDER tuning, not design.
```

`src/data/tiers.ts:9-12` — rename the field in all four lines: `dodgeChance: 0` → `missChance: 0` (black keeps `missChance: 0.5`).

`src/game/index.ts:26` — `DodgeRecord,` → `MissRecord,`.

`src/game/state.ts:42` — `recentDodges: [],` → `recentMisses: [],`.

- [ ] **Step 4: Rename and restructure `fireTowers` in `src/game/tick.ts`**

Line 19 in the type import block: `DodgeRecord,` → `MissRecord,`.

Lines 39-44:
```ts
/**
 * How many miss records `GameState.recentMisses` keeps. Sized like the exit
 * ring: the renderer reads it live each frame, so it only needs to outlast a
 * publish cycle.
 */
export const MISS_RING_SIZE = 32
```

Lines 63-78:
```ts
/**
 * Appends to the miss ring, dropping the oldest past `MISS_RING_SIZE`.
 *
 * Returns the SAME array when there is nothing to append, so the overwhelming
 * majority of ticks allocate nothing here.
 */
function appendMisses(
  current: readonly MissRecord[],
  added: readonly MissRecord[],
): readonly MissRecord[] {
  if (added.length === 0) return current

  const next = [...current, ...added]

  return next.length > MISS_RING_SIZE ? next.slice(next.length - MISS_RING_SIZE) : next
}
```

Lines 172-177:
```ts
  const missRecords: MissRecord[] = fired.missed.map((pieceId) => ({
    pieceId,
    roundNumber: state.roundNumber,
    roundElapsedMs,
  }))
  const recentMisses = appendMisses(state.recentMisses, missRecords)
```

Lines 202, 255, 272: `recentDodges,` → `recentMisses,`.

Line 319: `dodged: string[]` → `missed: string[]`. Line 322: `dodged: []` → `missed: []`. Line 330: `const dodged: string[] = []` → `const missed: string[] = []`.

Lines 356-390 — replace the cooldown loop body (from `cooldown -= tower.fireIntervalMs` through the end of the damage `for`) with:

```ts
      cooldown -= tower.fireIntervalMs

      // Detection runs before damage: each Black target rolls the seeded
      // stream once, and an undetected target is filtered out — its slot stays
      // empty, no backfill with the next-nearest Piece. A miss still spends
      // the interval (cooldown was just decremented), so the Tower rolls again
      // at its next normal fire time — never every tick. Roll order stays
      // deterministic: towers iterate in array order and targets in
      // selectTargets's sorted order. Clear is a board wipe, not damage, so it
      // never reaches this loop and can never be missed.
      const acquired: Piece[] = []
      for (const target of targets) {
        const missChance = tierDef(target.tier).missChance
        if (missChance > 0) {
          const [roll, advanced] = next(combatRng)
          combatRng = advanced
          if (roll < missChance) {
            missed.push(target.id)
            continue
          }
        }
        acquired.push(target)
      }

      for (const target of acquired) {
        const multiplier = amplificationFor(tower.id, target.id, amplifiers)
        remainingHealth.set(
          target.id,
          (remainingHealth.get(target.id) ?? 0) - tower.damage * multiplier,
        )
      }
```

Line 408: `return { towers: nextTowers, pieces: survivors, destroyed, rng: combatRng, dodged }` → `... rng: combatRng, missed }`.

- [ ] **Step 5: Rename the remaining test references**

`src/data/tiers.test.ts` — line 8: `TIERS.green.dodgeChance` → `TIERS.green.missChance`; line 19 test name "only red seeks Towers and only black dodges" → "only red seeks Towers and only black misses"; line 21: `TIERS.black.dodgeChance` → `TIERS.black.missChance`; line 24: `def.dodgeChance` → `def.missChance`.

`src/state/structuralKey.test.ts:57-68` — test name "ignores recentDodges, which add no publish of their own" → "ignores recentMisses, which add no publish of their own"; comment line 58 "A dodge changes nothing else in the key" → "A miss changes nothing else in the key"; line 64 `recentDodges: [{ pieceId: 'dodger', roundNumber: 1, roundElapsedMs: 400 }],` → `recentMisses: [{ pieceId: 'sneak', roundNumber: 1, roundElapsedMs: 400 }],`.

- [ ] **Step 6: Update the renderer's type references (module rename and visual change are Task 2)**

`src/scene/whiff.ts` — line 1: `import type { DodgeRecord } from '../game'` → `import type { MissRecord } from '../game'`. Line 32: `dodges: readonly DodgeRecord[]` → `misses: readonly MissRecord[]`. Line 38: `for (const record of dodges)` → `for (const record of misses)`. Doc comment: line 4 "negated a Tower shot" → "was undetected by a Tower"; line 6 "A dodge moves no field" → "A miss moves no field"; line 8 `GameState.recentDodges` → `GameState.recentMisses`; line 23 "the dodge ring" → "the miss ring"; line 26 "newly negated shot" → "newly undetected shot"; line 27 "previous round's dodge" → "previous round's miss"; line 56 "fresh dodge" → "fresh miss".

`src/scene/whiff.test.ts` — line 2: `DodgeRecord` → `MissRecord`. Line 5: `const DODGES: readonly DodgeRecord[]` → `const MISSES: readonly MissRecord[]`, and update every `DODGES` usage to `MISSES`. Line 26: `const later: readonly DodgeRecord[]` → `const later: readonly MissRecord[]`. Rename the word "dodge" in test names/comments to "miss".

`src/scene/Pieces.tsx:155` — `state.recentDodges,` → `state.recentMisses,`.

- [ ] **Step 7: Run the whole suite and verify**

Run: `pnpm test:run`
Run: `pnpm typecheck`
Run: `pnpm lint`
Run: `rg -i dodge src` — expect no matches.

Expected: all pass; the miss tests are green, the detection pass preserves every prior behavior (roll order and health arithmetic unchanged).

- [ ] **Step 8: Commit**

```bash
git add src/game src/data src/state src/scene
git commit -m "feat(engine): black Pieces are undetected, not dodging"
```

---

### Task 2: Renderer — rename `whiff`→`cloakFlicker` and flicker opacity instead of scale

**Files:**
- Rename: `src/scene/whiff.ts` → `src/scene/cloakFlicker.ts` (git mv, then rewrite)
- Rename: `src/scene/whiff.test.ts` → `src/scene/cloakFlicker.test.ts` (git mv, then rewrite)
- Modify: `src/scene/Pieces.tsx:19,106-111,147-161,180-189` — new `tier` prop, per-Piece black material clone, opacity write, import swap

**Interfaces:**
- Consumes: `MissRecord` and `GameState.recentMisses` from `src/game/index.ts`; `Piece.tier: PieceTier`.
- Produces: `cloakFlicker.ts` exporting `CLOAK_FLASH_MS = 220`, `interface CloakTracker`, `createCloakTracker()`, `cloakAgeMs(tracker, misses, pieceId, roundNumber, nowMs): number`, `cloakOpacity(ageMs): number`.

- [ ] **Step 1: Write the failing cloak-flicker test first**

`git mv src/scene/whiff.test.ts src/scene/cloakFlicker.test.ts`, then replace its contents with:

```ts
import { describe, expect, it } from 'vitest'
import type { MissRecord } from '../game'
import { CLOAK_FLASH_MS, createCloakTracker, cloakAgeMs, cloakOpacity } from './cloakFlicker'

const MISSES: readonly MissRecord[] = [
  { pieceId: 'a', roundNumber: 1, roundElapsedMs: 500 },
  { pieceId: 'b', roundNumber: 1, roundElapsedMs: 600 },
  { pieceId: 'a', roundNumber: 1, roundElapsedMs: 1200 },
]

describe('cloakAgeMs', () => {
  it('flashes when a new miss for this Piece appears, and ignores other Pieces', () => {
    const tracker = createCloakTracker()

    expect(cloakAgeMs(tracker, MISSES, 'a', 1, 10_000)).toBe(0)
    // No new miss for 'a' — the age keeps growing.
    expect(cloakAgeMs(tracker, MISSES, 'a', 1, 10_400)).toBe(400)
  })

  it('re-arms when a later miss for this Piece arrives', () => {
    const tracker = createCloakTracker()

    expect(cloakAgeMs(tracker, MISSES, 'a', 1, 10_000)).toBe(0)
    expect(cloakAgeMs(tracker, MISSES, 'a', 1, 10_500)).toBe(500)
    // A later miss — a newer record in the ring — re-arms the flash.
    const later: readonly MissRecord[] = [
      ...MISSES,
      { pieceId: 'a', roundNumber: 1, roundElapsedMs: 1600 },
    ]
    expect(cloakAgeMs(tracker, later, 'a', 1, 10_800)).toBe(0)
  })

  it("a new round must not re-flash a previous round's miss at the same elapsed time", () => {
    const tracker = createCloakTracker()

    cloakAgeMs(tracker, MISSES, 'a', 1, 10_000)
    // Round 2 starts at elapsed 0; 'a' has no miss there yet.
    expect(cloakAgeMs(tracker, MISSES, 'a', 2, 10_000)).toBe(0)
  })

  it('a miss in a fresh round flashes', () => {
    const tracker = createCloakTracker()
    const round2 = [{ pieceId: 'a', roundNumber: 2, roundElapsedMs: 400 }]

    cloakAgeMs(tracker, MISSES, 'a', 1, 10_000)
    expect(cloakAgeMs(tracker, round2, 'a', 2, 11_000)).toBe(0)
  })
})

describe('cloakOpacity', () => {
  it('dips to ~35% opacity at the midpoint and returns to 1 by the end of the window', () => {
    expect(cloakOpacity(0)).toBe(1)
    expect(cloakOpacity(CLOAK_FLASH_MS / 2)).toBeCloseTo(0.35)
    expect(cloakOpacity(CLOAK_FLASH_MS)).toBe(1)
    expect(cloakOpacity(CLOAK_FLASH_MS + 1)).toBe(1)
  })

  it('returns 1 when nothing has flashed', () => {
    expect(cloakOpacity(-1)).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/scene/cloakFlicker.test.ts`
Expected: FAIL — `./cloakFlicker` does not resolve (only `whiff.ts` exists).

- [ ] **Step 3: Write `src/scene/cloakFlicker.ts`**

`git mv src/scene/whiff.ts src/scene/cloakFlicker.ts`, then replace its contents with:

```ts
import type { MissRecord } from '../game'

/**
 * The cloak-flicker: a brief alpha dip on a Black Piece a Tower just failed to
 * detect. Presentation constants, tunable by feel — nothing in the engine reads
 * them. A miss moves no field the renderer diffs, so unlike the Tower hit-flash
 * it cannot be diff-driven; it is read live in `useFrame` from
 * `GameState.recentMisses`.
 */
export const CLOAK_FLASH_MS = 220

export interface CloakTracker {
  lastElapsed: number
  lastRound: number
  flashStartedAtMs: number
}

export function createCloakTracker(): CloakTracker {
  return { lastElapsed: -1, lastRound: -1, flashStartedAtMs: -Infinity }
}

/**
 * Advances a Piece's tracker against the miss ring and returns the flash age
 * in milliseconds. `nowMs` is wall-clock (frame.clock.elapsedTime * 1000); the
 * records carry engine elapsed time, which is monotonic within a round — so a
 * newer `roundElapsedMs` means a newly undetected shot. `roundNumber` in the
 * record keeps a previous round's miss from re-flashing when the next round
 * reaches the same elapsed time. Mutates `tracker` in place; it lives in a ref.
 */
export function cloakAgeMs(
  tracker: CloakTracker,
  misses: readonly MissRecord[],
  pieceId: string,
  roundNumber: number,
  nowMs: number,
): number {
  let newest = -1
  for (const record of misses) {
    if (record.pieceId !== pieceId || record.roundNumber !== roundNumber) continue
    if (record.roundElapsedMs > newest) newest = record.roundElapsedMs
  }

  if (roundNumber !== tracker.lastRound) {
    tracker.lastRound = roundNumber
    tracker.lastElapsed = -1
  }

  if (newest > tracker.lastElapsed) {
    tracker.lastElapsed = newest
    tracker.flashStartedAtMs = nowMs
  }

  return nowMs - tracker.flashStartedAtMs
}

/**
 * An opacity multiplier: a dip toward partial transparency on a fresh miss, 1
 * otherwise. The dip bottoms out at ~35% opacity at the window's midpoint and
 * eases back to full by the end, reading as a "cloaking hiccup" rather than a
 * pulse. Composition: this modulates opacity, while the health-shrink and the
 * promotion pop keep modulating scale — independent axes.
 */
export function cloakOpacity(ageMs: number): number {
  if (ageMs < 0 || ageMs >= CLOAK_FLASH_MS) return 1
  const progress = ageMs / CLOAK_FLASH_MS
  return 1 - 0.65 * Math.sin(progress * Math.PI)
}
```

- [ ] **Step 4: Run the cloak-flicker test to verify it passes**

Run: `pnpm vitest run src/scene/cloakFlicker.test.ts`
Expected: PASS. (At the midpoint `Math.sin(π/2) === 1`, so `1 - 0.65 === 0.35`.)

- [ ] **Step 5: Wire the flicker into `src/scene/Pieces.tsx`**

Line 19:
```ts
import { createCloakTracker, cloakAgeMs, cloakOpacity } from './cloakFlicker'
```

In the `Pieces` map (lines 67-83), pass the tier through so `PieceMesh` knows which Pieces get a cloned material:
```tsx
        return (
          <PieceMesh
            key={piece.id}
            pieceId={piece.id}
            promoted={piece.promoted}
            tier={piece.tier}
            board={board}
            geometry={geometry}
            material={material}
            ringGeometry={resources.ring}
            ringMaterial={resources.ringMaterial}
          />
        )
```

In `PieceMesh`'s props (lines 89-105) add `tier: PieceTier` to the destructure and the type.

Replace line 109:
```ts
  const cloakTracker = useRef(createCloakTracker())
```

After the refs, add the per-Piece cloned material for Black (opacity is per-material, and black materials are shared per tier, so a shared material cannot flicker one Black Piece without flickering them all — see CLAUDE.md):
```tsx
  // Opacity is per-material, and materials are shared per tier — so only the
  // Black tier, the one that cloak-flickers, gets a per-Piece clone. The clone
  // is transparent so the opacity writes render; green/yellow/red keep the
  // shared material. Disposed on unmount alongside the shared ones.
  const meshMaterial = useMemo(() => {
    if (tier !== 'black') return material
    const clone = material.clone()
    clone.transparent = true
    return clone
  }, [tier, material])

  useEffect(
    () => () => {
      if (meshMaterial !== material) meshMaterial.dispose()
    },
    [meshMaterial, material],
  )
```

In the `useFrame` callback, replace the whiff block (lines 153-161) with:
```tsx
    const flashAgeMs = cloakAgeMs(
      cloakTracker.current,
      state.recentMisses,
      pieceId,
      state.roundNumber,
      now * 1000,
    )
    if (meshMaterial !== material) {
      meshMaterial.opacity = cloakOpacity(flashAgeMs)
    }
    mesh.scale.set(scale, scale, scale)
```

And on the mesh (line 182), `material={material}` → `material={meshMaterial}`.

- [ ] **Step 6: Verify the tree is green and the old names are gone**

Run: `pnpm test:run`
Run: `pnpm typecheck`
Run: `pnpm lint`
Run: `rg whiff src` — expect no matches.

Expected: all pass; `cloakFlicker` resolves, `Pieces.tsx` compiles (the health-shrink `scale` and the promotion pop still compose — only the whiff multiplier is gone).

- [ ] **Step 7: Commit**

```bash
git add src/scene
git commit -m "feat(scene): cloak-flicker opacity instead of whiff scale"
```

---

### Task 3: Docs — refresh the Black-tier description

**Files:**
- Modify: `docs/design/game-design.md:348,408`
- Modify: `CLAUDE.md:24`

**Interfaces:** None — pure documentation, matching the vocabulary the engine and renderer now use.

- [ ] **Step 1: Update `docs/design/game-design.md:348`**

Replace:
```markdown
- **Black — sneaky.** Each Tower shot at it rolls the seeded `rng.combat` stream: a 50% chance the shot is negated (placeholder). A Joker's Clear is a board wipe, not damage, so it is never dodged.
```
with:
```markdown
- **Black — sneaky.** Each Tower shot at it rolls the seeded `rng.combat` stream: a 50% chance the Tower fails to detect it (placeholder), and the shot never fires. A Joker's Clear is a board wipe, not damage, so it always destroys a Black Piece.
```

- [ ] **Step 2: Update `docs/design/game-design.md:408`**

Replace "and black dodge chance are all placeholders" with "and black miss chance are all placeholders".

- [ ] **Step 3: Update `CLAUDE.md:24`**

Replace the phrase "and a seeded black-Piece dodge." at the end of the `Piece tiers` bullet with "and a seeded black-Piece miss (Towers fail to detect it)."

- [ ] **Step 4: Verify**

Run: `rg -i 'dodge|whiff' src docs/design/game-design.md CLAUDE.md` — expect matches only in the frozen `docs/superpowers/specs/2026-08-07-*` and `docs/superpowers/plans/2026-08-07-*` files (the deliberate exception), and in the plan/spec for this feature itself.

- [ ] **Step 5: Full verification and commit**

Run: `pnpm test:run`
Run: `pnpm typecheck`
Run: `pnpm lint`
Run: `pnpm build`

Then:
```bash
git add docs CLAUDE.md
git commit -m "docs: Black Pieces are undetected, not dodging"
```

---

## Self-Review

**Spec coverage:**
- Engine change (detection pass, `cooldown -= fireIntervalMs` unchanged, empty slot stays empty) → Task 1 Step 4.
- Record ring renamed (`recentMisses`, `MISS_RING_SIZE`, `appendMisses`, never cleared, excluded from `structuralKey`) → Task 1 Steps 3-5.
- Clear exemption → Task 1 Step 1 (test) and Step 4 (comment, code unchanged).
- Renderer change (opacity dip to ~35% over ~220ms, per-Piece black clone, dispose on unmount, composes with scale effects) → Task 2 Steps 3 and 5.
- Rename table (all 6 rows) → Task 1 Steps 3-6, Task 2 Steps 3 and 5.
- Docs → Task 3.
- Tests (renamed dodge test, structuralKey test, cloak-flicker test, new cooldown-cadence pin) → Task 1 Steps 1-2 and 5, Task 2 Steps 1-2.

**Placeholder scan:** Every code step shows the exact file content; no "TBD", no "similar to Task N", no "add error handling" without code.

**Type consistency:** `MissRecord`, `recentMisses`, `missChance`, `missed`, `MISS_RING_SIZE`, `appendMisses`, `CLOAK_FLASH_MS`, `cloakAgeMs`, `cloakOpacity`, `CloakTracker` — each name is introduced in Task 1 or Task 2 and consumed identically later. `firstTower` (already in `src/game/fixtures.ts`) is the fixture Task 1's cooldown test relies on. `Piece` is already imported in `tick.ts`. `PieceTier` is already imported in `Pieces.tsx`.
