# Support Rank Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Card played for its suit may only support a Tower of the same rank — face cards excepted — and every support applies a flat value instead of one scaled by rank.

**Architecture:** One pure predicate, `canSupport(card, tower)`, is the single answer to "may this Card support this Tower?". It is enforced twice: the engine refuses the play, and the board-click resolver declines the click so it falls through to the Tower inspect panel instead of dispatching a doomed command. Separately, `applySupport` stops reading a magnitude and instead takes a multiplier — `1` for a matched numbered Card, `1.5` for a face card — applied to flat constants in `src/data/cards.ts`.

**Tech Stack:** TypeScript (strict), Vitest, React Three Fiber, zustand, pnpm.

**Design spec:** [`docs/superpowers/specs/2026-08-06-support-rank-matching-design.md`](../specs/2026-08-06-support-rank-matching-design.md). Read it before starting — it records why face cards are exempt and why proportional supports were rejected.

**Issue:** [#20](https://github.com/braydend/cards-v-chess/issues/20)

## Global Constraints

Every task's requirements implicitly include all of these.

- **`src/game/` and `src/data/` must never import React or Three.js.** ESLint enforces it; a violation fails `pnpm lint` and therefore CI.
- **`Math.random` must never appear in `src/game/` or `src/data/`.** Also ESLint-enforced. Nothing in this plan needs randomness.
- **A Card's identity is its `id`, never its rank and suit.** The Deck is a multiset. Look up and remove through `findCard` / `removeCard` in `src/game/cards.ts`.
- **An illegal play returns the state object unchanged and consumes nothing.** Never throw. Tests assert identity with `toBe(state)`, so returning a fresh but equal object is a failure.
- **Balance values live in `src/data/cards.ts`.** Tuning must never require touching logic. The four values this plan introduces: `SPADE_HEALTH = 6`, `DIAMOND_SPEED_MS = 60`, `CLUB_DAMAGE = 2`, `FACE_SUPPORT_PREMIUM = 1.5`.
- **There is no jsdom and there are no component tests.** Any decision left inside a `.tsx` file cannot be tested at all, so branching belongs in a pure module beside it. `.tsx` is plumbing: read the stores, call the pure function, apply the result.
- **Never call `setState` inside `useFrame`, and never allocate in the frame loop.** Task 4 touches the frame loop; mutate, do not allocate.
- **Vocabulary is fixed.** "Support" is a Card played for its suit — a face card's own action (Shield, Echo, Reinforce, Expand) is never Support. "Round", never "wave". `cardRank` for a Card's rank, `boardRank` for a board row.
- **Coverage gates `src/game/**` at 85 statements / 85 branches / 85 functions / 90 lines.** `src/data/**`, `src/scene/**` and `src/ui/**` are excluded from coverage but still typechecked and linted.
- **Verification before every commit:** `pnpm test:run && pnpm typecheck && pnpm lint`. Run the commands and read the output; do not assume.
- **Commit messages** end with the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Created:**
- Nothing. Every change lands in a file that already exists — `canSupport` belongs beside `applySupport` in `src/game/support.ts` because they are the same concern (what a suit does to a Tower), and splitting them would make the engine's support surface two files for no gain.

**Modified:**

| File | Responsibility after this change |
| --- | --- |
| `src/game/support.ts` | `canSupport` (may this Card reach this Tower?) and `applySupport` (what the suit does), now flat |
| `src/game/cardPlays.ts` | `supportTower` refuses a mismatch, and picks the multiplier |
| `src/game/index.ts` | Exports `canSupport` so `src/scene/` can use it |
| `src/data/cards.ts` | Flat balance constants replace `supportMagnitude` and its two per-magnitude rates |
| `src/scene/boardClick.ts` | A support Card that cannot reach the clicked Tower does not consume the click |
| `src/scene/towerColour.ts` | An optional `dimmed` flag fades an out-of-reach Tower |
| `src/scene/Towers.tsx` | Reads the picked Card and passes eligibility into `towerColour` |
| `src/ui/supportLabel.ts` | Label names the flat value and which Towers it reaches |
| `src/ui/Deck.tsx` | Target hint names the required rank |
| `docs/design/game-design.md` | The design of record |
| `CLAUDE.md` | The new invariant |

**Tests modified:** `src/game/support.test.ts`, `src/game/roundTermination.test.ts`, `src/data/deck.test.ts`, `src/scene/boardClick.test.ts`, `src/scene/towerColour.test.ts`, `src/ui/supportLabel.test.ts`.

**Deliberately untouched:** `src/game/commandFor.ts` and its tests. Its documented contract is that it decides which Command a play *would* be and does **not** validate it, and it only ever receives a `towerId` — it has no Tower from which to read a rank. `src/game/step.test.ts` already pairs a rank-5 support Card with a rank-5 Tower, so it stays green.

---

## Task 1: The rank-match rule in the engine

**Files:**
- Modify: `src/game/support.ts` (add `canSupport`)
- Modify: `src/game/cardPlays.ts:74-92` (`supportTower`)
- Modify: `src/game/index.ts:15`
- Test: `src/game/support.test.ts`
- Test: `src/game/roundTermination.test.ts:13`, `:34-39`, `:80`, `:135` (fixture repair, done first)

**Interfaces:**
- Consumes: `isBuildableRank(rank: CardRank): rank is BuildableRank` from `src/game/cards.ts`; the test fixtures `withTower`, `withDeck`, `standardCard`, `firstTower`, `firstTowerId` from `src/game/fixtures.ts`.
- Produces: `canSupport(card: Card, tower: Tower): boolean`, exported from `src/game/support.ts` and re-exported from `src/game/index.ts`. Tasks 3 and 4 both import it from `'../game'`.

- [ ] **Step 1: Repair the `roundTermination` fixture first, before the rule exists**

`grind()` seeds **10♥** against a **rank-5** Tower — a pairing this task is about to make illegal, which would take those tests down with it. Fixing it now, as a separate green commit, keeps the rule's own commit honest: nothing in it should turn red for an unrelated reason.

In `src/game/roundTermination.test.ts`, delete the `supportMagnitude` import on line 13:

```ts
import { supportMagnitude } from '../data/cards'
```

Change `grind` (line 34-39) so its hearts match the Tower they repair:

```ts
/** A rank-5 diagonal Tower with a Pawn grinding it from directly up-file. */
function grind(hearts: number): GameState {
  // Rank 5, matching the Tower: a numbered Card supports only its own rank.
  const deck = Array.from({ length: hearts }, (_, i) => standardCard(`h${i}`, 5, 'hearts'))
  const built = withDeck(deck, withTower(5, TOWER_SQUARE))

  return liveRound(built, [pawnAt('grinder', GRINDER_SQUARE)])
}
```

Add this constant just below `GRINDER_SQUARE` (line 23), replacing what `supportMagnitude(10)` was doing — it was never the Card's value, only the size of the health deficit these tests wait for before repairing:

```ts
/**
 * How large a health deficit these tests let build up before repairing.
 *
 * ♥ restores to FULL, so a repair is worth exactly the deficit at the moment it
 * lands — not anything about the Card. Waiting for a fixed deficit is what keeps
 * the arithmetic below valid: each ♥ is then worth precisely this much. Healing
 * the instant health dips by 1 would buy almost nothing, which is what let a
 * no-op repair hide behind these tests before. Must divide evenly into the
 * Tower's 20 max health at 0.5 damage per hop.
 */
const HEAL_DEFICIT = 10
```

Then replace both `const healMagnitude = supportMagnitude(10)` declarations (lines 80 and 135) by deleting them, and replace every remaining use of `healMagnitude` with `HEAL_DEFICIT` — lines 88, 106, and 145. After the edit, line 88 reads:

```ts
    const aidedResolveMs =
      ((maxHealth + heartsAvailable * HEAL_DEFICIT) / dpsPerHop) * hopIntervalMs
```

and lines 106 and 145 read:

```ts
      if (tower && heart && tower.maxHealth - tower.health >= HEAL_DEFICIT) {
```

- [ ] **Step 2: Verify the fixture repair is green on the unchanged engine**

Run: `pnpm test:run src/game/roundTermination.test.ts`
Expected: PASS, all 5 tests. This edit is behaviour-preserving — a 10♥ and a 5♥ both restore to full today.

- [ ] **Step 3: Commit the fixture repair**

```bash
git add src/game/roundTermination.test.ts
git commit -m "$(cat <<'EOF'
Match the grind fixture's hearts to the Tower they repair

Prep for the rank-match rule: these tests seeded 10♥ against a rank-5
Tower, a pairing that is about to become illegal. Behaviour-preserving
today, since ♥ restores to full whatever the rank.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Widen the `withSupport` test helper to any rank and any Tower rank**

The existing helper hardcodes a rank-5 Tower and accepts only three Card ranks, which cannot express a mismatch. In `src/game/support.test.ts`, replace lines 12-16:

```ts
/** A rank-5 Tower plus the one support Card under test. */
function withSupport(cardId: string, rank: 2 | 5 | 'K', suit: 'hearts' | 'diamonds' | 'spades' | 'clubs') {
  const built = withTower(5, SQUARE)
  return withDeck([standardCard(cardId, rank, suit)], built)
}
```

with:

```ts
/**
 * A Tower plus the one support Card under test.
 *
 * `towerCardRank` defaults to 5 because most of this suite is about what a
 * support does rather than where it may land; the tests for the rank-match rule
 * pass it explicitly.
 */
function withSupport(
  cardId: string,
  rank: CardRank,
  suit: Suit,
  towerCardRank: BuildableRank = 5,
) {
  const built = withTower(towerCardRank, SQUARE)
  return withDeck([standardCard(cardId, rank, suit)], built)
}
```

Extend the type import on line 6 to carry the three types this now needs:

```ts
import type { BuildableRank, CardRank, GameState, Suit } from './types'
```

- [ ] **Step 5: Write the failing tests for the rank-match rule**

Append this to `src/game/support.test.ts`. `BUILDABLE_RANKS` comes from `../data/towerRanks` — add it to the existing `TOWER_RANKS` import on line 3.

```ts
describe('canSupport: a numbered Card supports only a Tower of its own rank', () => {
  // Typed as the real rank types rather than `number`, so no cast is needed at
  // the call — `withSupport` takes a CardRank and a BuildableRank.
  it.each<[CardRank, BuildableRank]>([
    [7, 5],
    [2, 10],
  ])('refuses a %s played onto a rank-%s Tower, and keeps the Card', (cardRank, towerCardRank) => {
    const state = hurtTo(1)(withSupport('h', cardRank, 'hearts', towerCardRank))
    const after = step(state, { kind: 'supportTower', cardId: 'h', towerId: firstTowerId(state) })

    // Identity, not equality: a refused play must return the very same state
    // object, and must not consume the Card.
    expect(after).toBe(state)
    expect(after.deck).toHaveLength(1)
  })

  it.each(BUILDABLE_RANKS)('lets a %s support a Tower of that same rank', (rank) => {
    const state = hurtTo(1)(withSupport('h', rank, 'hearts', rank))

    expect(firstTower(play(state, 'h')).health).toBe(TOWER_RANKS[rank].maxHealth)
  })

  it.each(['J', 'Q', 'K', 'A'] as const)(
    'exempts %s, which supports a Tower of any rank',
    (rank) => {
      // A Tower's cardRank is always 2–10, so strict equality would make every
      // face card unplayable for its suit. The exemption is what keeps a face
      // card worth weighing for its suit as well as for its action.
      const state = hurtTo(1)(withSupport('h', rank, 'hearts', 10))

      expect(firstTower(play(state, 'h')).health).toBe(TOWER_RANKS[10].maxHealth)
    },
  )
})
```

- [ ] **Step 6: Run the new tests to verify they fail**

Run: `pnpm test:run src/game/support.test.ts`
Expected: the two `refuses a %s played onto a rank-%s Tower` cases FAIL — the play currently succeeds, so `after` is a new object and the Deck is empty. Every other new case passes already.

- [ ] **Step 7: Write `canSupport`**

In `src/game/support.ts`, change the imports at the top from:

```ts
import type { Suit, Tower } from './types'
```

to:

```ts
import { isBuildableRank } from './cards'
import type { Card, Suit, Tower } from './types'
```

and add this function above `applySupport`:

```ts
/**
 * Whether this Card may be played for its suit onto this Tower.
 *
 * A numbered Card supports only a Tower of its own rank: a 5♥ repairs a rank-5
 * Tower and nothing else. That is what makes the ranks in a Deck mean something
 * after build time — without it, rank is inert the moment a Tower exists.
 *
 * **Face cards are exempt** and support any Tower. A Tower's `cardRank` is
 * always a `BuildableRank`, so strict equality would make J♠, Q♦, K♣ and A♥
 * unplayable for their suit entirely, and a face card is meant to be worth
 * weighing for its suit as well as for its action.
 *
 * A Joker has no suit, so support was never available to it.
 */
export function canSupport(card: Card, tower: Tower): boolean {
  if (card.kind !== 'standard') return false
  if (!isBuildableRank(card.rank)) return true

  return card.rank === tower.cardRank
}
```

- [ ] **Step 8: Enforce it in `supportTower`**

In `src/game/cardPlays.ts`, change the import on line 12 from:

```ts
import { applySupport } from './support'
```

to:

```ts
import { applySupport, canSupport } from './support'
```

and add the guard to `supportTower` (after the `if (!target) return state` on line 81):

```ts
  const target = state.towers.find((tower) => tower.id === towerId)
  if (!target) return state

  // A numbered Card reaches only a Tower of its own rank. Face cards are
  // exempt — see `canSupport`.
  if (!canSupport(card, target)) return state
```

Update the function's doc comment (lines 69-73) to:

```ts
/**
 * Plays a Card for its SUIT, applying a support action to one existing Tower.
 *
 * A numbered Card must match the Tower's rank; a face card may support any
 * Tower. A Joker is refused: it has no suit, so this play is not available to
 * it. See `canSupport`.
 */
```

- [ ] **Step 9: Export `canSupport` from the engine's public surface**

`src/scene/boardClick.ts` and `src/scene/Towers.tsx` both need it in later tasks, and the renderer imports from `src/game/index.ts` only. Change line 15 of `src/game/index.ts`:

```ts
export { applySupport, canSupport } from './support'
```

- [ ] **Step 10: Repair the two existing tests the rule invalidates**

Two tests in `src/game/support.test.ts` pair a Card with a Tower of a different rank. Both are testing something real, so both get retargeted rather than deleted.

Replace the ♥ test at lines 40-50:

```ts
  it('restores the same amount whatever the rank — a 2♥ repairs as fully as a K♥', () => {
    // ...
    const healed = (rank: 2 | 'K') =>
      firstTower(play(hurtTo(1)(withSupport('h', rank, 'hearts')), 'h')).health

    expect(healed(2)).toBe(TOWER_RANKS[5].maxHealth)
    expect(healed('K')).toBe(healed(2))
  })
```

with:

```ts
  it('restores the same amount from a matched Card or a face card alike', () => {
    // ♥ is the one support that does NOT scale with rank. That is deliberate:
    // it is what stops ♠ (heal + ceiling) from strictly dominating ♥, and it
    // makes the cheap ♥ the efficient repair while a high one is better spent
    // building. The comparison is now matched-vs-face rather than low-vs-high,
    // because a 2♥ can no longer reach a rank-5 Tower at all.
    const healed = (rank: 5 | 'K') =>
      firstTower(play(hurtTo(1)(withSupport('h', rank, 'hearts')), 'h')).health

    expect(healed(5)).toBe(TOWER_RANKS[5].maxHealth)
    expect(healed('K')).toBe(healed(5))
  })
```

Replace the ♣ test at lines 164-168:

```ts
  it('always adds at least one, even from the lowest rank', () => {
    const state = withSupport('c', 2, 'clubs')

    expect(play(state, 'c').towers[0]?.damage).toBeGreaterThanOrEqual(TOWER_RANKS[5].damage + 1)
  })
```

with the same assertion aimed at a Tower the 2♣ can actually reach:

```ts
  it('always adds at least one, even from the lowest rank', () => {
    const state = withSupport('c', 2, 'clubs', 2)

    expect(firstTower(play(state, 'c')).damage).toBeGreaterThanOrEqual(TOWER_RANKS[2].damage + 1)
  })
```

- [ ] **Step 11: Run the full suite**

Run: `pnpm test:run`
Expected: PASS, every file. If `roundTermination.test.ts` fails here, Step 1 was incomplete.

- [ ] **Step 12: Typecheck, lint, and check coverage**

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage`
Expected: all clean, and `src/game/**` still over its 85/85/85/90 thresholds.

- [ ] **Step 13: Commit**

```bash
git add src/game/support.ts src/game/cardPlays.ts src/game/index.ts src/game/support.test.ts
git commit -m "$(cat <<'EOF'
Restrict a numbered support to a Tower of its own rank

A Card played for its suit reached any Tower, so rank meant nothing
after build time and a 7♥ repaired a Tower built from a 5. A numbered
Card now supports only its own rank; face cards are exempt, because a
Tower's rank is always 2-10 and strict equality would make every face
card unplayable for its suit.

Closes part of #20.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Flat support values

**Files:**
- Modify: `src/data/cards.ts:1-48`
- Modify: `src/game/support.ts` (`applySupport`)
- Modify: `src/game/cardPlays.ts:74-92` (`supportTower`)
- Modify: `src/ui/supportLabel.ts`
- Modify: `src/ui/Deck.tsx:152-175` (`targetHint`)
- Test: `src/game/support.test.ts`, `src/data/deck.test.ts`, `src/ui/supportLabel.test.ts`

**Interfaces:**
- Consumes: `canSupport` from Task 1; `isBuildableRank` from `src/game/cards.ts`.
- Produces: `applySupport(tower: Tower, suit: Suit, multiplier: number): Tower` — the third parameter is now a **multiplier**, not a magnitude. Constants `SPADE_HEALTH = 6`, `DIAMOND_SPEED_MS = 60`, `CLUB_DAMAGE = 2`, `FACE_SUPPORT_PREMIUM = 1.5` exported from `src/data/cards.ts`. `supportMagnitude`, `SPEED_MS_PER_MAGNITUDE` and `MAGNITUDE_PER_DAMAGE` cease to exist.

- [ ] **Step 1: Write the failing tests for flat values**

Replace the whole `describe('♠ Health', ...)` block (lines 130-155) of `src/game/support.test.ts` with:

```ts
describe('♠ Health', () => {
  it('raises maxHealth by the flat value', () => {
    const state = withSupport('s', 5, 'spades')

    expect(firstTower(play(state, 's')).maxHealth).toBe(TOWER_RANKS[5].maxHealth + SPADE_HEALTH)
  })

  it('heals by the same amount, so a damaged Tower keeps the headroom it had', () => {
    const state = hurtTo(4)(withSupport('s', 5, 'spades'))

    expect(firstTower(play(state, 's')).health).toBe(4 + SPADE_HEALTH)
  })

  it('leaves a full-health Tower at full health — issue #14, where the Tower rendered as damaged', () => {
    // Towers.tsx colours by `health / maxHealth`, so raising the ceiling alone
    // darkened the Tower exactly as a hit does, and could even trip the
    // critical pulse. Asserting the ratio, not the numbers, is what pins that.
    const tower = firstTower(play(withSupport('s', 5, 'spades'), 's'))

    expect(tower.health).toBe(tower.maxHealth)
  })

  it('gives a rank-2 Tower exactly what it gives a rank-10 — rank no longer scales a buff', () => {
    // The whole point of flat values: a 2♠ on a rank-2 Tower is worth the same
    // upgrade as a 10♠ on a rank-10 Tower, so a Tower's power grows at a
    // predictable rate however it was built.
    const gain = (rank: 2 | 10) =>
      firstTower(play(withSupport('s', rank, 'spades', rank), 's')).maxHealth -
      TOWER_RANKS[rank].maxHealth

    expect(gain(2)).toBe(SPADE_HEALTH)
    expect(gain(10)).toBe(SPADE_HEALTH)
  })

  it('pays a face card the premium, on any Tower', () => {
    const state = withSupport('s', 'A', 'spades')

    expect(firstTower(play(state, 's')).maxHealth).toBe(
      TOWER_RANKS[5].maxHealth + SPADE_HEALTH * FACE_SUPPORT_PREMIUM,
    )
  })
})
```

Replace the whole `describe('♣ Damage', ...)` block (lines 157-169) with:

```ts
describe('♣ Damage', () => {
  it('raises damage by the flat value', () => {
    const state = withSupport('c', 5, 'clubs')

    expect(firstTower(play(state, 'c')).damage).toBe(TOWER_RANKS[5].damage + CLUB_DAMAGE)
  })

  it('gives a rank-2 Tower exactly what it gives a rank-10', () => {
    const gain = (rank: 2 | 10) =>
      firstTower(play(withSupport('c', rank, 'clubs', rank), 'c')).damage -
      TOWER_RANKS[rank].damage

    expect(gain(2)).toBe(CLUB_DAMAGE)
    expect(gain(10)).toBe(CLUB_DAMAGE)
  })

  it('pays a face card the premium', () => {
    const state = withSupport('c', 'K', 'clubs')

    expect(firstTower(play(state, 'c')).damage).toBe(
      TOWER_RANKS[5].damage + CLUB_DAMAGE * FACE_SUPPORT_PREMIUM,
    )
  })
})
```

Replace the ♥ ceiling test (lines 52-66) — its assertion still names a magnitude:

```ts
  it('fills a ceiling a ♠ has raised, which is what keeps the two suits distinct', () => {
    const built = withTower(5, SQUARE)
    const withCards = withDeck(
      [standardCard('s', 'A', 'spades'), standardCard('h', 2, 'hearts')],
      built,
    )
    const towerId = firstTowerId(withCards)

    const raised = step(withCards, { kind: 'supportTower', cardId: 's', towerId })
    const damaged = hurtTo(3)(raised)
    const repaired = firstTower(step(damaged, { kind: 'supportTower', cardId: 'h', towerId }))

    expect(repaired.health).toBe(TOWER_RANKS[5].maxHealth + supportMagnitude('A'))
    expect(repaired.health).toBe(repaired.maxHealth)
  })
```

with — note the 2♥ becomes a 5♥, since a 2♥ cannot reach a rank-5 Tower:

```ts
  it('fills a ceiling a ♠ has raised, which is what keeps the two suits distinct', () => {
    const built = withTower(5, SQUARE)
    const withCards = withDeck(
      [standardCard('s', 'A', 'spades'), standardCard('h', 5, 'hearts')],
      built,
    )
    const towerId = firstTowerId(withCards)

    const raised = step(withCards, { kind: 'supportTower', cardId: 's', towerId })
    const damaged = hurtTo(3)(raised)
    const repaired = firstTower(step(damaged, { kind: 'supportTower', cardId: 'h', towerId }))

    expect(repaired.health).toBe(
      TOWER_RANKS[5].maxHealth + SPADE_HEALTH * FACE_SUPPORT_PREMIUM,
    )
    expect(repaired.health).toBe(repaired.maxHealth)
  })
```

Replace the ♦ throughput test (lines 89-127) — two A♦ used to shave 280ms, three now shave 270ms, and only three get the interval under half:

```ts
  it('fires more often than its rank alone would once ticked', () => {
    // Mirrors "fires using the Tower's own damage, not its rank's" in
    // blocking.test.ts, which does the equivalent job for ♣. Nothing anywhere
    // ticks a ♦-supported Tower, so this suite would still pass if
    // fireTowers read the rank definition's interval instead of the Tower's
    // own.
    const built = withTower(5, SQUARE)
    const towerId = firstTowerId(built)

    // Three Aces played for ♦ shrink the 500ms rank interval by 270ms
    // (3 × 60ms × the 1.5 face premium), to 230ms — under half, so two shots
    // fit inside one rank-interval-sized window.
    const withCards = withDeck(
      [
        standardCard('d0', 'A', 'diamonds'),
        standardCard('d1', 'A', 'diamonds'),
        standardCard('d2', 'A', 'diamonds'),
      ],
      built,
    )
    const boosted = ['d0', 'd1', 'd2'].reduce(
      (state, cardId) => step(state, { kind: 'supportTower', cardId, towerId }),
      withCards,
    )

    expect(firstTower(boosted).fireIntervalMs).toBeLessThan(TOWER_RANKS[5].fireIntervalMs / 2)

    // Two Pieces, each one-shot by the rank's own damage (3 vs. 3 health),
    // sitting on opposite diagonals so both are covered.
    const state = liveRound(boosted, [
      pawnAt('a', { file: 1, rank: 1 }),
      pawnAt('b', { file: 3, rank: 3 }),
    ])

    // A window just over the rank's OWN interval: at that interval only one
    // shot would land, so only using the Tower's own (post-support) interval
    // gets through both Pieces in time.
    let current = state
    const windowMs = TOWER_RANKS[5].fireIntervalMs + DT
    for (let elapsed = 0; elapsed < windowMs; elapsed += DT) {
      current = tick(current, DT)
    }

    expect(current.pieces).toHaveLength(0)
  })
```

Finally, replace the import on line 2 of `src/game/support.test.ts`:

```ts
import { MIN_FIRE_INTERVAL_MS, supportMagnitude } from '../data/cards'
```

with:

```ts
import {
  CLUB_DAMAGE,
  FACE_SUPPORT_PREMIUM,
  MIN_FIRE_INTERVAL_MS,
  SPADE_HEALTH,
} from '../data/cards'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/support.test.ts`
Expected: FAIL, at import resolution — `SPADE_HEALTH`, `CLUB_DAMAGE` and `FACE_SUPPORT_PREMIUM` do not exist in `src/data/cards.ts` yet.

- [ ] **Step 3: Replace the magnitude constants with flat values**

Rewrite `src/data/cards.ts` in full:

```ts
import type { Suit } from '../game/types'

export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'spades', 'clubs']

/**
 * Balance values for the card actions. PLACEHOLDERS, not design decisions —
 * they live here so tuning never touches logic.
 */

/**
 * Health a ♠ adds, to both current and maximum.
 *
 * Flat, not rank-scaled: a 2♠ on a rank-2 Tower is worth exactly what a 10♠ is
 * on a rank-10 Tower, so a Tower's power grows at a predictable rate however it
 * was built. 6 is the midpoint of the 2–10 range rank scaling used to produce,
 * so a mid-ladder Tower behaves as it always did.
 */
export const SPADE_HEALTH = 6

/** Milliseconds a ♦ shaves off a Tower's fire interval. Midpoint of the old 20–100ms range. */
export const DIAMOND_SPEED_MS = 60

/** Damage a ♣ adds. Midpoint of the old +1–3 range. */
export const CLUB_DAMAGE = 2

/**
 * What a face card's support is worth relative to a matched numbered Card.
 *
 * Face cards are the only Cards that can support a Tower of any rank (see
 * `canSupport`), and they carry a premium on top of that reach. It is **flat
 * across J, Q, K and A** — a J♠ and an A♠ are identical as supports, and the
 * choice between them is which action you would rather give up.
 *
 * The three values above are even so that this premium lands on whole numbers.
 * Changing one without the other reintroduces rounding the design deliberately
 * has none of.
 */
export const FACE_SUPPORT_PREMIUM = 1.5

/**
 * The floor a fire interval can never go below, however many ♦ are stacked.
 *
 * Not a balance value — a guard, and load-bearing. `fireTowers` loops
 * `while (cooldown >= fireIntervalMs)`, so an interval of zero would never
 * terminate, and a flat per-♦ subtraction genuinely reaches zero. (A
 * proportional one would only ever approach it, which is part of why flat
 * values need this and the rejected proportional design did not.)
 */
export const MIN_FIRE_INTERVAL_MS = 100

/**
 * A Jack's shield, flat rather than rank-scaled.
 *
 * A blocked Pawn deals 1 damage per 900ms hop, so 10 absorbs about 9 seconds of
 * grinding. Flat on purpose: it is worth proportionally more on a cheap Tower,
 * which gives low ranks a reason to matter once the player holds 9s and 10s.
 */
export const JACK_SHIELD = 10

/** Core health a King adds, to both current and maximum. */
export const KING_CORE_HEALTH = 1

/** Board ranks an Ace adds. Ranks only, never files. */
export const ACE_BOARD_RANKS = 1
```

- [ ] **Step 4: Make `applySupport` flat**

In `src/game/support.ts`, replace the `applySupport` import line and the function. The import at the top becomes:

```ts
import {
  CLUB_DAMAGE,
  DIAMOND_SPEED_MS,
  MIN_FIRE_INTERVAL_MS,
  SPADE_HEALTH,
} from '../data/cards'
```

and `applySupport` becomes:

```ts
/**
 * Applies one suit's support action to a Tower.
 *
 * Supports stack additively with no cap — capping them is known future work and
 * deliberately out of scope here.
 *
 * **Nothing scales with rank.** Not the Card's, not the Tower's: every ♠ adds
 * `SPADE_HEALTH` wherever it lands. `multiplier` is 1 for a matched numbered
 * Card and `FACE_SUPPORT_PREMIUM` for a face card, which is the only reason two
 * plays of the same suit ever differ. ♥ ignores it entirely — see below.
 */
export function applySupport(tower: Tower, suit: Suit, multiplier: number): Tower {
  switch (suit) {
    // A FULL restore, deliberately ignoring the multiplier. Rank-scaled repair
    // made ♥ strictly worse than ♠, which heals by the same amount AND raises
    // the ceiling. Healing to full instead gives each suit a job no other suit
    // does: ♥ is the emergency restore, ♠ the incremental growth.
    case 'hearts':
      return { ...tower, health: tower.maxHealth }

    // Floored, and not for balance: `fireTowers` loops
    // `while (cooldown >= fireIntervalMs)`, so zero would never terminate — and
    // a flat subtraction really does reach zero if enough ♦ are stacked.
    case 'diamonds':
      return {
        ...tower,
        fireIntervalMs: Math.max(
          MIN_FIRE_INTERVAL_MS,
          tower.fireIntervalMs - DIAMOND_SPEED_MS * multiplier,
        ),
      }

    // Raises current and maximum health together, as a King does for the Core.
    // Moving the ceiling alone left `health / maxHealth` lower than it started,
    // and that ratio is the renderer's only signal for damage — so a ♠ darkened
    // the Tower exactly as a hit does, and stacking two could trip the critical
    // pulse on a Tower that had never been touched. That was issue #14.
    case 'spades': {
      const gain = SPADE_HEALTH * multiplier

      return { ...tower, health: tower.health + gain, maxHealth: tower.maxHealth + gain }
    }

    // No rounding and no floor: the values in data/cards.ts are chosen so the
    // face premium lands on a whole number.
    case 'clubs':
      return { ...tower, damage: tower.damage + CLUB_DAMAGE * multiplier }
  }
}
```

- [ ] **Step 5: Pick the multiplier in `supportTower`**

In `src/game/cardPlays.ts`, change the import on line 8 from:

```ts
import { ACE_BOARD_RANKS, JACK_SHIELD, KING_CORE_HEALTH, supportMagnitude } from '../data/cards'
```

to:

```ts
import { ACE_BOARD_RANKS, FACE_SUPPORT_PREMIUM, JACK_SHIELD, KING_CORE_HEALTH } from '../data/cards'
```

and replace line 83:

```ts
  const magnitude = supportMagnitude(card.rank)
```

with:

```ts
  // The only thing that varies between two plays of the same suit. `canSupport`
  // has already guaranteed a numbered Card matches the Tower, so a face card is
  // exactly the case that reached a Tower it does not share a rank with.
  const multiplier = isBuildableRank(card.rank) ? 1 : FACE_SUPPORT_PREMIUM
```

and update the call on line 88 from `applySupport(tower, card.suit, magnitude)` to `applySupport(tower, card.suit, multiplier)`. `isBuildableRank` is already imported on line 11.

- [ ] **Step 6: Run the engine tests**

Run: `pnpm test:run src/game`
Expected: PASS. If `roundTermination.test.ts` fails, check that `HEAL_DEFICIT` (10) is still reachable — the Tower's max health is 20 and ♠ is not involved, so it should be untouched by this task.

- [ ] **Step 7: Delete the `supportMagnitude` tests**

`src/data/deck.test.ts` still imports a function that no longer exists. Delete the whole `describe('supportMagnitude', ...)` block (lines 60-72), and change the import on line 4 from:

```ts
import { SUITS, supportMagnitude } from './cards'
```

to:

```ts
import { SUITS } from './cards'
```

- [ ] **Step 8: Write the failing tests for the new label copy**

Replace `src/ui/supportLabel.test.ts` in full:

```ts
import { describe, expect, it } from 'vitest'
import { supportModeLabel } from './supportLabel'

describe('supportModeLabel', () => {
  it('names the flat value and the only rank it can reach', () => {
    expect(supportModeLabel('spades', 7)).toBe('Health +6 — rank-7 Towers only')
    expect(supportModeLabel('clubs', 2)).toBe('Damage +2 — rank-2 Towers only')
    expect(supportModeLabel('diamonds', 10)).toBe('Speed 60ms faster — rank-10 Towers only')
  })

  it('shows the premium and the reach of a face card', () => {
    expect(supportModeLabel('spades', 'K')).toBe('Health +9 — any Tower')
    expect(supportModeLabel('clubs', 'J')).toBe('Damage +3 — any Tower')
    expect(supportModeLabel('diamonds', 'A')).toBe('Speed 90ms faster — any Tower')
  })

  it('shows no number for ♥, which restores to full whatever the rank', () => {
    // A number here would promise a scaled repair, which is not what ♥ does.
    // Both ranks must read identically apart from their reach.
    expect(supportModeLabel('hearts', 5)).toBe('Repair to full — rank-5 Towers only')
    expect(supportModeLabel('hearts', 'K')).toBe('Repair to full — any Tower')
  })

  it('reads the same value for every face rank, since the premium is flat', () => {
    expect(supportModeLabel('spades', 'J')).toBe(supportModeLabel('spades', 'A'))
  })
})
```

- [ ] **Step 9: Run it to verify it fails**

Run: `pnpm test:run src/ui/supportLabel.test.ts`
Expected: FAIL — the current label reads `Health 7`.

- [ ] **Step 10: Rewrite the label**

Replace `src/ui/supportLabel.ts` in full:

```ts
import { CLUB_DAMAGE, DIAMOND_SPEED_MS, FACE_SUPPORT_PREMIUM, SPADE_HEALTH } from '../data/cards'
import { isBuildableRank, type CardRank, type Suit } from '../game'

/**
 * What playing this Card for its suit would do, as the Deck's mode button
 * shows it.
 *
 * Two facts have to fit on one line of a narrow panel: what the support is
 * worth, and which Towers it can reach. Reach is the half a player cannot infer
 * — a numbered Card supports only its own rank, and a face card supports any
 * Tower — so it is always stated, ♥ included.
 *
 * ♥ is the one suit with no number: it restores to full and ignores the
 * multiplier entirely, so printing a value beside it would promise a scaled
 * repair that does not exist.
 *
 * Pure and separate from `Deck.tsx` because there is no jsdom here — a decision
 * left in a `.tsx` file cannot be tested at all. See CLAUDE.md.
 */
export function supportModeLabel(suit: Suit, rank: CardRank): string {
  const numbered = isBuildableRank(rank)
  const reach = numbered ? `rank-${rank} Towers only` : 'any Tower'
  const multiplier = numbered ? 1 : FACE_SUPPORT_PREMIUM

  return `${effect(suit, multiplier)} — ${reach}`
}

function effect(suit: Suit, multiplier: number): string {
  switch (suit) {
    case 'hearts':
      return 'Repair to full'
    case 'diamonds':
      return `Speed ${DIAMOND_SPEED_MS * multiplier}ms faster`
    case 'spades':
      return `Health +${SPADE_HEALTH * multiplier}`
    case 'clubs':
      return `Damage +${CLUB_DAMAGE * multiplier}`
  }
}
```

- [ ] **Step 11: Name the required rank in the Deck's target hint**

In `src/ui/Deck.tsx`, replace the support branch of `targetHint` (lines 160-162):

```ts
  if (playMode === 'support' && card.kind === 'standard') {
    return `Click a Tower to support${noTowers}`
  }
```

with:

```ts
  if (playMode === 'support' && card.kind === 'standard') {
    // A numbered Card reaches only its own rank; a face card reaches anything.
    return isBuildableRank(card.rank)
      ? `Click a rank-${card.rank} Tower to support${noTowers}`
      : `Click any Tower to support${noTowers}`
  }
```

`isBuildableRank` is already imported at the top of `Deck.tsx` (line 2).

- [ ] **Step 12: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all clean. `pnpm typecheck` is the check that catches any remaining reference to the three deleted exports.

- [ ] **Step 13: Confirm nothing still references the deleted exports**

Run: `grep -rn "supportMagnitude\|SPEED_MS_PER_MAGNITUDE\|MAGNITUDE_PER_DAMAGE" src docs CLAUDE.md`
Expected: matches only in `docs/design/game-design.md` and `docs/superpowers/` (specs are frozen records and must not be edited; `game-design.md` is Task 5's job). Any hit under `src/` is a miss to fix now.

- [ ] **Step 14: Commit**

```bash
git add src/data/cards.ts src/game/support.ts src/game/cardPlays.ts src/game/support.test.ts src/data/deck.test.ts src/ui/supportLabel.ts src/ui/supportLabel.test.ts src/ui/Deck.tsx
git commit -m "$(cat <<'EOF'
Make every support a flat value instead of a rank-scaled one

Support magnitude was the Card's face value, so the strongest support
was a high card on the cheapest Tower. Now a ♠ adds 6 wherever it
lands, a ♦ shaves 60ms and a ♣ adds 2, with a flat 1.5x premium for a
face card - which is also the only Card that can reach a Tower of a
rank it does not share.

supportMagnitude and its two per-magnitude rates are deleted.

Closes part of #20.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: A click a support Card cannot use falls through to the panel

**Files:**
- Modify: `src/scene/boardClick.ts:89-122` (`resolveBoardAction`)
- Test: `src/scene/boardClick.test.ts`

**Interfaces:**
- Consumes: `canSupport` from `'../game'` (Task 1).
- Produces: no new exports. `resolveBoardAction`'s signature is unchanged — `BoardClickContext` already carries `towers`, which is why the check belongs here.

Without this, a mismatched click still produces a `supportTower` command (`commandFor` does not validate), the engine refuses it, and the player gets neither a play nor a panel — a click that does nothing at all.

- [ ] **Step 1: Give the test fixture two Towers of different ranks**

In `src/scene/boardClick.test.ts`, replace lines 5-21:

```ts
function towerAt(id: string, square: Square): Tower {
  return {
    id,
    square,
    cardRank: 3,
    // ...
  }
}

const A = towerAt('tower-1', { file: 2, rank: 2 })
const B = towerAt('tower-2', { file: 5, rank: 6 })
```

with:

```ts
function towerAt(id: string, square: Square, cardRank: BuildableRank = 3): Tower {
  return {
    id,
    square,
    cardRank,
    fireCooldownMs: 0,
    health: 12,
    maxHealth: 12,
    damage: 1,
    fireIntervalMs: 600,
    shield: 0,
    damageTaken: 0,
  }
}

// Two different ranks on purpose: support now depends on which Tower was
// clicked, not just on whether one was.
const A = towerAt('tower-1', { file: 2, rank: 2 })
const B = towerAt('tower-2', { file: 5, rank: 6 }, 7)
```

Add `BuildableRank` to the type import on line 2:

```ts
import type { BuildableRank, Card, CardRank, Square, Suit, Tower } from '../game'
```

- [ ] **Step 2: Retarget the two existing support tests, which now use a mismatched Card**

Both tests in `describe('resolveBoardAction: a Card whose play targets a Tower beats inspecting')` play a `card(7, 'hearts')` at `A`, which is rank 3. Change both to `card(3, 'hearts')` — lines 110 and 125 — leaving everything else as it is:

```ts
  it('supports the Tower rather than opening its panel', () => {
    expect(
      resolveBoardAction(
        click({ square: A.square, card: card(3, 'hearts'), playMode: 'support' }),
      ),
    ).toEqual({
      kind: 'play',
      command: { kind: 'supportTower', cardId: 'card-1', towerId: A.id },
    })
  })

  it('supports even the Tower whose panel is already open', () => {
    expect(
      resolveBoardAction(
        click({
          square: A.square,
          selectedTowerId: A.id,
          card: card(3, 'hearts'),
          playMode: 'support',
        }),
      ),
    ).toEqual({
      kind: 'play',
      command: { kind: 'supportTower', cardId: 'card-1', towerId: A.id },
    })
  })
```

- [ ] **Step 3: Write the failing tests**

Append to the `describe('resolveBoardAction: a Card that cannot act on the click does not consume it')` block:

```ts
  it('opens the panel when a support Card cannot reach the clicked Tower', () => {
    // A 7♥ has nothing to do with a rank-3 Tower. Without this the click is
    // swallowed: `commandFor` still produces a supportTower command, the engine
    // refuses it, and the player gets no play and no panel either.
    expect(
      resolveBoardAction(
        click({ square: A.square, card: card(7, 'hearts'), playMode: 'support' }),
      ),
    ).toEqual({ kind: 'select', towerId: A.id })
  })

  it('supports the Tower the same Card does match', () => {
    // The same 7♥, one Tower over. B is rank 7.
    expect(
      resolveBoardAction(
        click({ square: B.square, card: card(7, 'hearts'), playMode: 'support' }),
      ),
    ).toEqual({
      kind: 'play',
      command: { kind: 'supportTower', cardId: 'card-1', towerId: B.id },
    })
  })

  it('supports from a face card, which reaches any Tower', () => {
    expect(
      resolveBoardAction(
        click({ square: A.square, card: card('K', 'spades'), playMode: 'support' }),
      ),
    ).toEqual({
      kind: 'play',
      command: { kind: 'supportTower', cardId: 'card-1', towerId: A.id },
    })
  })
```

- [ ] **Step 4: Run to verify the first new test fails**

Run: `pnpm test:run src/scene/boardClick.test.ts`
Expected: `opens the panel when a support Card cannot reach the clicked Tower` FAILS — it currently returns a `play` action. The other two pass already.

- [ ] **Step 5: Decline the click in `resolveBoardAction`**

In `src/scene/boardClick.ts`, change the import block at the top to add `canSupport`:

```ts
import {
  canSupport,
  commandFor,
  squaresEqual,
  type Card,
  type Command,
  type PlayMode,
  type PlayTarget,
  type Square,
  type Tower,
} from '../game'
```

and insert this immediately after `const clickedTower = ...` (line 102), before the Echo branch:

```ts
  // A support Card that cannot reach this Tower must not consume the click.
  // `commandFor` does not validate — it would still return a supportTower
  // command, which the engine then refuses — so the player would get neither a
  // play nor the inspect panel. This is the check that keeps the panel.
  if (playMode === 'support' && clickedTower && !canSupport(card, clickedTower)) return panel
```

Add a sentence to the function's doc comment, after the paragraph ending "the panel opens instead." (line 83):

```
 * A support Card aimed at a Tower of the wrong rank is the same case: it cannot
 * act on what was clicked, so the panel gets the click.
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test:run src/scene/boardClick.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add src/scene/boardClick.ts src/scene/boardClick.test.ts
git commit -m "$(cat <<'EOF'
Let the panel keep a click a support Card cannot use

commandFor does not validate, so a support Card aimed at a Tower of
the wrong rank still produced a command the engine then refused - a
click that did nothing at all. resolveBoardAction now declines it, and
the Tower inspect panel gets the click instead.

Closes part of #20.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Fade the Towers a picked support Card cannot reach

**Files:**
- Modify: `src/scene/towerColour.ts`
- Modify: `src/scene/Towers.tsx:44-52`, `:136-166`
- Test: `src/scene/towerColour.test.ts`

**Interfaces:**
- Consumes: `canSupport` from `'../game'` (Task 1); `findCard` from `'../game'`; `useUiStore` from `'../state/uiStore'`.
- Produces: `towerColour(target, cardRank, healthFraction, flashProgress, criticalPhase, dimmed?)` — a sixth optional parameter, defaulting to `false` so the ghost call site and the tests that predate it are unchanged.

- [ ] **Step 1: Write the failing tests**

In `src/scene/towerColour.test.ts`, replace the `brightness` helper (lines 9-12) so it can dim:

```ts
/** Total channel energy — a proxy for "brighter", enough to assert direction. */
function brightness(
  healthFraction: number,
  flashProgress = 0,
  criticalPhase = 0,
  dimmed = false,
): number {
  const colour = towerColour(scratch, 4, healthFraction, flashProgress, criticalPhase, dimmed)
  return colour.r + colour.g + colour.b
}
```

and append these three tests to the `describe('towerColour', ...)` block:

```ts
  it('fades a Tower the picked support Card cannot reach', () => {
    expect(brightness(1, 0, 0, true)).toBeLessThan(brightness(1))
  })

  it('keeps the fade visible through a hit flash', () => {
    // The fade is applied last for exactly this reason: a Tower being hit while
    // out of reach must still read as out of reach, or the flash says "you can
    // play here" at the worst possible moment.
    expect(brightness(1, 1, 0, true)).toBeLessThan(brightness(1, 1))
  })

  it('is undimmed by default, so nothing changes when no support Card is picked', () => {
    const result = towerColour(scratch, 4, 1, 0, 0)

    expect(result.getHexString()).toBe(new Color(RANK_COLOURS[4]).getHexString())
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:run src/scene/towerColour.test.ts`
Expected: the two fade tests FAIL — `brightness(1, 0, 0, true)` equals `brightness(1)` because the parameter is ignored. The default test passes already.

- [ ] **Step 3: Add the fade**

In `src/scene/towerColour.ts`, add beside the other module-level colours (after line 19):

```ts
const OUT_OF_REACH = new Color('#15151a')

/** How far toward `OUT_OF_REACH` a Tower the picked support Card cannot reach goes. */
const OUT_OF_REACH_FADE = 0.7
```

then change the signature and add the fade as the **last** step, after the flash:

```ts
export function towerColour(
  target: Color,
  cardRank: BuildableRank,
  healthFraction: number,
  flashProgress: number,
  criticalPhase: number,
  dimmed = false,
): Color {
```

```ts
  if (flashProgress > 0) {
    target.lerp(FLASH, Math.min(1, flashProgress))
  }

  // Last, so it survives the flash and the critical pulse: a Tower being hit
  // while out of reach must still read as out of reach. Defaults to false, so
  // every caller that does not know about support eligibility is unchanged.
  if (dimmed) {
    target.lerp(OUT_OF_REACH, OUT_OF_REACH_FADE)
  }

  return target
}
```

Extend the function's doc comment with a line for the new parameter, after the `criticalPhase` bullet:

```
 * - `dimmed` fades the Tower to show a picked support Card cannot reach it.
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test:run src/scene/towerColour.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Feed eligibility in from `Towers.tsx`**

Add to the imports at the top of `src/scene/Towers.tsx`:

```ts
import { canSupport, findCard, type BoardSpec, type BuildableRank } from '../game'
import { useUiStore } from '../state/uiStore'
```

(replacing the existing `import type { BoardSpec, BuildableRank } from '../game'` on line 5.)

Add these reads beside the existing `towers` selector (line 45):

```ts
  const towers = useGameStore((store) => store.snapshot.towers)
  const deck = useGameStore((store) => store.snapshot.deck)
  const selectedCardId = useUiStore((store) => store.selectedCardId)
  const playMode = useUiStore((store) => store.playMode)

  // The picked Card, but only while it is being played for its suit — null the
  // rest of the time, which is what leaves every Tower at its normal colour.
  //
  // Subscribing to the Deck costs nothing per frame: the snapshot publishes on
  // structural change only, and the Deck changes only when a Card is played.
  const supportCard =
    playMode === 'support' && selectedCardId !== null
      ? (findCard(deck, selectedCardId) ?? null)
      : null
```

and pass eligibility into the live-Tower `towerColour` call in `useFrame` (line 154):

```ts
      towerColour(
        mesh.color,
        tower.cardRank,
        tower.health / tower.maxHealth,
        flashProgress,
        now * CRITICAL_PULSE_HZ,
        supportCard !== null && !canSupport(supportCard, tower),
      )
```

Leave the ghost call (line 182) alone — a dying Tower is nobody's support target, and the parameter defaults to `false`.

No `setState` is involved and nothing is allocated: `useFrame` re-registers its callback on every render, so it closes over the current `supportCard` without any ref plumbing, and `canSupport` allocates nothing.

- [ ] **Step 6: Extend the component's doc comment**

`Towers.tsx`'s header lists the signals a player can read off a Tower. Add a fifth, after the "Destruction" bullet (line 38):

```
 * - **Out of reach** fades a Tower while a picked support Card cannot reach it
 *   — a numbered Card supports only its own rank. See `canSupport`.
```

- [ ] **Step 7: Run everything, then look at it**

Run: `pnpm test:run && pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean.

Then run `pnpm dev` and check by eye, because this is the one part of the change no test can see: build two Towers of different ranks, pick a numbered Card, press its suit-mode button, and confirm only the matching Tower stays bright. Pick a King and confirm both stay bright. Press the rank-mode button and confirm the fade lifts.

- [ ] **Step 8: Commit**

```bash
git add src/scene/towerColour.ts src/scene/towerColour.test.ts src/scene/Towers.tsx
git commit -m "$(cat <<'EOF'
Fade the Towers a picked support Card cannot reach

A numbered Card supports only its own rank, which is not something a
player can read off the board. Towers out of reach now fade while a
support Card is picked, applied after the hit flash so a Tower being
hit still reads as out of reach.

Closes part of #20.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The design of record

**Files:**
- Modify: `docs/design/game-design.md:58`, `:60`, `:98`, `:334`, and the Open questions table
- Modify: `CLAUDE.md` (invariants list, vocabulary table)

**Interfaces:** none — documentation only. `docs/superpowers/specs/` is frozen and must not be edited.

`game-design.md` is the single source of truth for the design, and it currently documents a rank-scaled magnitude ladder that no longer exists.

- [ ] **Step 1: Rewrite the suit-actions rules in `game-design.md`**

Replace line 58 in full:

```markdown
**♦ ♠ ♣ scale with rank; ♥ does not.** For the three that scale, magnitude is **face value for 2–10, then J 11, Q 12, K 13, A 14**, so a 9♠ is a large buff and a 2♠ a small one, and every face card is worth weighing for its suit as well as for its action.
```

with these three paragraphs:

```markdown
**A numbered Card supports only a Tower of its own rank.** A 5♥ repairs a rank-5 Tower and nothing else; a 7♥ cannot touch it. This is what makes the ranks in a Deck mean something after build time — without it, rank is inert the moment a Tower exists, and any ♥ sustains any Tower. It is a deckbuilding constraint, not a magnitude one: what a support is worth never depends on which Tower it lands on.

**Face cards are exempt and support any Tower.** A Tower's rank is always 2–10, so strict equality would make J♠, Q♦, K♣ and A♥ unplayable for their suit entirely. The exemption is what keeps a face card worth weighing for its suit as well as for its action, and it gives face suits a job no numbered card has: the support that works anywhere.

**Supports are flat, and nothing scales with rank.** Not the Card's rank, not the Tower's. Every ♠ adds the same health wherever it lands, so a 2♠ on a rank-2 Tower is worth exactly what a 10♠ is on a rank-10 Tower, and a Tower's power grows at a predictable rate however it was built. A face card carries a **flat premium** on top of its reach — the same premium for J, Q, K and A alike, so choosing between them is about which action you would rather give up, never about which is the bigger buff. The numbers live in `src/data/cards.ts`; they are tuning, not design.
```

- [ ] **Step 2: Correct the two sentences in line 60 that describe the old ladder**

Line 60 explains why ♥ and ♠ stay distinct. Its last sentence describes rank economics that no longer hold — a low ♥ can no longer be spent where a high one would have been, because neither reaches a Tower it does not match. Replace the sentence:

```markdown
It also inverts what rank means for repair: since a low ♥ heals as well as a high one, the high ♥ is better spent building, and the cheap ♥ becomes the efficient repair.
```

with:

```markdown
Rank no longer trades off against repair value at all: a ♥ reaches exactly one Tower rank, so the question is never how much it heals but whether you hold the rank you need — which is precisely the deckbuilding pressure the rank match exists to create.
```

- [ ] **Step 3: Correct the face-card rationale on line 98**

Replace:

```markdown
♥ ♦ ♠ ♣ already own the whole stat quartet, and ♦ ♠ ♣ scale with rank on top of that, so a face card whose rank mode merely bumped a stat would be a fifth suit.
```

with:

```markdown
♥ ♦ ♠ ♣ already own the whole stat quartet, and a face card can already be played for its suit — at a premium, onto any Tower — so a face card whose rank mode merely bumped a stat would be a fifth suit.
```

- [ ] **Step 4: Note the tightened bound in the "Repair versus the wall" open question**

That row (line 334) records what bounds a repaired Tower's permanence. Append to the end of its **Notes** cell, before the closing `|`:

```markdown
 A third change tightens it in the other direction: a ♥ now reaches only a Tower of its own rank, so fewer of the ♥ in a Deck can sustain any given wall. The bound was already finite; it is now shorter in cards. Nothing here depends on it being loose.
```

- [ ] **Step 5: Add the support cap to the open questions**

Supports still stack additively with no limit — the spec calls this out as future work, and this table is the only canonical place it can be recorded. Add a row immediately after the **Repair versus the wall** row:

```markdown
| **Capping stacked supports** | **Reachable now.** Supports stack additively with no limit, so a Tower fed every ♠ in a Deck grows without bound — and with flat values, *n* supports is exactly *n* × the flat amount, which makes the growth easy to reason about but does not bound it. The rank match narrows how many Cards can reach one Tower, which is a constraint but not a cap. Candidate answers: a hard cap per Tower, diminishing returns per stack, or a cap per round. Deliberately left open by the rank-matching work — do not resolve it by guessing. |
```

- [ ] **Step 6: Add the invariant to `CLAUDE.md`**

In the **Invariants that constrain code** list, add this immediately after the **Playing a card consumes it** bullet:

```markdown
- **A numbered Card supports only a Tower of its own rank; face cards support any Tower.** Suit and rank are not independent at play time. `canSupport` in `src/game/support.ts` is the single answer, and it is enforced twice on purpose: `supportTower` refuses the play, and `resolveBoardAction` declines the click so the Tower inspect panel gets it instead. `commandFor` deliberately does **not** check — it does not validate, and it only receives a `towerId`, never a Tower.
- **A support's value never depends on a rank.** Not the Card's, not the Tower's. Every ♠ adds the same health wherever it lands; the only variation is a flat premium for a face card. Anything reintroducing rank-scaled magnitude is a regression, not a balance choice. Supports are, however, **uncapped** — bounding a stack is open work, not a settled rule.
```

- [ ] **Step 7: Update the Support row of the vocabulary table in `CLAUDE.md`**

Replace:

```markdown
| **Support** | A Card played for its suit, applied to an existing Tower. The four suit actions only — a face card's action is never Support |
```

with:

```markdown
| **Support** | A Card played for its suit, applied to an existing Tower **of the same rank** — face cards excepted, which support any Tower. The four suit actions only; a face card's action is never Support |
```

- [ ] **Step 8: Check the docs against the code**

Run: `grep -rn "supportMagnitude\|scale with rank\|scales with rank" docs/design/game-design.md CLAUDE.md`
Expected: no matches. Every hit is a stale claim about a function that no longer exists.

Run: `pnpm test:run && pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean — docs-only changes should move nothing, and this confirms the branch is green as a whole.

- [ ] **Step 9: Commit**

```bash
git add docs/design/game-design.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Document the rank match and flat supports as the design of record

game-design.md still described a rank-scaled magnitude ladder that no
longer exists. Records the rank match, the face-card exemption and the
flat premium, notes that the ♥ supply against a wall is now shorter in
cards, and adds capping stacked supports to the open questions - it is
reachable now and deliberately unresolved.

Closes #20.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Done criteria

All five tasks committed, and:

- `pnpm test:run` — every test passes.
- `pnpm typecheck` — clean.
- `pnpm lint` — clean, including the renderer-boundary and `Math.random` rules.
- `pnpm test:coverage` — `src/game/**` still meets 85/85/85/90.
- `pnpm build` — succeeds.
- `grep -rn "supportMagnitude" src docs/design CLAUDE.md` returns nothing.
- Checked by eye in `pnpm dev`: a picked numbered support Card leaves only matching-rank Towers bright, a picked face card leaves all of them bright, and clicking an out-of-reach Tower opens its inspect panel rather than doing nothing.

## Out of scope

Named here so nobody widens the change while inside it. Each is recorded in the spec.

- **Capping how many supports one Tower can hold.** Supports still stack additively with no limit. Task 5 adds it to the open questions; it must not be resolved here.
- **High-rank power creep** — a rank-10 Tower covering most of the board is a `TOWER_RANKS` geometry problem, not a support problem.
- **Retuning the four flat values.** 6 / 60ms / +2 / 1.5× are placeholders in `src/data/cards.ts`.
- **A build fallback for Jack and Queen.** Still open, still recorded in `game-design.md`.
- **The shadow frustum in `src/scene/GameScene.tsx`.** A real but cosmetic and entirely unrelated problem. Task 4 touches Tower colour and nothing about lighting.
