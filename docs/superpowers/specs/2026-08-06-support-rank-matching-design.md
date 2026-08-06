# Support Rank Matching — Design

**Date:** 2026-08-06
**Status:** Agreed
**Issue:** [#20 — playing cards as buffs should only apply to towers of the same type](https://github.com/braydend/cards-v-chess/issues/20)
**Supersedes part of:** [`2026-08-05-card-mechanics-design.md`](2026-08-05-card-mechanics-design.md), specifically its decision that ♦ ♠ ♣ support magnitude scales with the Card's rank.

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

A Card played for its suit currently applies to **any** Tower on the board. A
Tower built from 5♠ accepts a 7♥, a 2♦, a 10♣ — anything. Suit and rank are
fully independent at play time, so the only thing a Deck needs in order to
support a Tower is the right suit.

That is wrong in two ways.

**It costs the Deck its shape.** The Deck is the whole strategic layer: cards
come from random packs, the cap is 30, and culling is a real decision. If any
♥ repairs any Tower, the ranks in a Deck say nothing about which Towers it can
sustain. Rank matters only at build time and is inert thereafter.

**It reads as a bug in play.** The Cards faction is a deck of playing cards,
and a 7♥ visibly has nothing to do with a Tower built from a 5. Players read
the pairing as meaningful before the rules tell them it is not.

Rank-scaled magnitude compounds it. For ♦ ♠ ♣, magnitude is the Card's face
value — 2 through 10, then J 11, Q 12, K 13, A 14 — and it takes no account of
the target, so a support is worth most, proportionally, on the cheapest Tower
available. The best play is the pairing that should feel least natural. (♥ has
ignored magnitude since issue #17 and restores to full whatever the rank.)

## Decision

### 1. A numbered support must match the Tower's rank

Playing a Card for its **suit** requires `card.rank === tower.cardRank` when the
Card's rank is buildable (2–10). A 5♥ repairs a rank-5 Tower; a 7♥ does not.

**Face cards are exempt.** J, Q, K and A support any Tower.

A Tower's `cardRank` is always a `BuildableRank`, so strict equality would make
face suits unplayable — J♠, Q♦, K♣ and A♥ could never match anything on the
board. Two documented design points would die with them: "every face card is
worth weighing for its suit as well as for its action", and the J 11 / Q 12 /
K 13 / A 14 magnitude ladder. Exempting them keeps face cards dual-purpose and
gives them a job no numbered card has — the buff that works anywhere.

The cost is one clause: the rule reads "suit supports a Tower of the same rank,
unless the Card is a face card". That was accepted over the alternative of
mapping face cards onto rank 10, which invents a relationship the design does
not otherwise have.

A Joker is refused as it always was. It has no suit, so support was never
available to it.

### 2. Supports are flat, not scaled

`applySupport` takes a **multiplier**, not a magnitude, and reads nothing off
the Tower:

| Suit | Numbered (matched) | Face (any Tower) |
| --- | --- | --- |
| ♥ Repair | restore to full | restore to full |
| ♠ Health | +6 current and maximum | +9 |
| ♦ Speed | −60ms fire interval | −90ms |
| ♣ Damage | +2 | +3 |

The multiplier is `1` for a matched numbered Card and `FACE_SUPPORT_PREMIUM`
(1.5) for any face card, **regardless of which face card it is**. J♠ and A♠ are
identical as supports; the choice between them is which action you would rather
give up, not which is the bigger buff.

Rank no longer scales a buff at all — not the Card's rank, and not the Tower's.
Every ♠ is +6 wherever it lands. The intent is that a Tower's power grows at a
predictable rate however it was built, and that the rank match is a question of
*whether* you can apply a support, never of *how much* it is worth.

The base values are the midpoints of what rank scaling used to produce (2–10 →
6, 20–100ms → 60, +1–3 → +2), so a mid-ladder Tower behaves almost exactly as
it does today. They are even, so the 1.5× premium lands on integers and no
rounding exists anywhere in the system. They are placeholders and live in
`src/data/cards.ts` with the rest of the balance values.

### Rejected: proportional supports

Scaling each buff to the Tower's own stats — ♠ +25%, ♦ −12%, ♣ +50% — was
considered and rejected. It makes equivalence hold by construction rather than
by the ladder happening to be linear, and ♠ +25% reproduces today's integers
exactly, because `maxHealth` is `4 × rank`.

It was rejected because it **preserves the ladder's ratios permanently**: a
rank-10 Tower stays five times a rank-2 Tower no matter how many supports each
receives. Flat values let a small Tower close some of the gap, which is the
behaviour wanted here. Proportional ♣ also could not deliver what it promised —
base damage is a small integer (1 at rank 2, 6 at rank 10), so +50% rounds
straight back into the uneven 50–100% spread it was meant to fix.

## Consequences

**♥ is no longer a universal panic button.** A Tower about to fall can be saved
only by a ♥ of its exact rank or a face ♥. This is the sharpest edge of the
change, and it tightens the repair-versus-the-wall bound that
`src/game/roundTermination.test.ts` pins: fewer ♥ in a Deck can reach any given
Tower, so a grinding Piece resolves sooner. The bound was already finite; it is
now tighter. Nothing about round termination depends on it being loose.

**`MIN_FIRE_INTERVAL_MS` becomes genuinely load-bearing.** A flat subtraction
reaches zero — ten ♦ on a rank-2 Tower would hit the floor — where the rejected
proportional version only ever approached it. `fireTowers` loops
`while (cooldown >= fireIntervalMs)`, so without the floor that is an infinite
loop rather than a balance problem.

**Flat buffs compress the ladder over time.** +6 health is worth far more to a
rank-2 Tower (8 max health) than to a rank-10 (40). This cuts against the
existing high-rank power creep rather than with it. That creep — a rank-10
Tower covers most of the board — is real and known, and is explicitly not this
change's problem; see Out of scope.

**The never-stuck property is unchanged.** Every Card of rank 2–10 can still
always build, so a Deck holding any of them is never dead. Support becoming
harder to place adds no new unplayable Card: the numbered Card whose rank
matches no standing Tower simply builds instead. Jack and Queen remain the only
Cards that can be stranded by an empty board, exactly as recorded in
`game-design.md`.

**Echo is unaffected.** A Queen copies the source Tower's rank, so an echoed
Tower matches the same Cards its source does.

## Implementation notes

Not a plan — the plan is written separately. These are the decisions that
belong with the design rather than being rediscovered during the work.

**The predicate is pure and lives in the engine.** `canSupport(card, tower)` in
`src/game/support.ts`: false for a Joker, `card.rank === tower.cardRank` for a
buildable rank, true for J/Q/K/A.

**Two enforcement points, deliberately.**

- `supportTower` (`src/game/cardPlays.ts`) refuses and returns state unchanged,
  consuming nothing — how every illegal play already behaves.
- `resolveBoardAction` (`src/scene/boardClick.ts`) checks it before building the
  target, so a click on a Tower the Card cannot reach falls through to opening
  the inspect panel rather than dispatching a command that will be refused.

**`commandFor` is not the place for this check.** Its documented contract is
that it decides which Command a play *would* be and does not validate, and it
only ever receives a `towerId` — it has no Tower from which to read a rank.
`resolveBoardAction` already holds the live Towers, so the check goes where the
data is.

**`supportMagnitude`, `SPEED_MS_PER_MAGNITUDE` and `MAGNITUDE_PER_DAMAGE` are
deleted.** Nothing reads them once supports are flat. The J 11 / Q 12 / K 13 /
A 14 ladder goes with them, and `game-design.md` loses the paragraph that
documents it.

**Legibility, per the agreed scope.**

- `supportModeLabel` names the requirement: `Health +6 — rank-7 Towers only`
  for a numbered Card, `Health +9 — any Tower` for a face card. The Deck's
  target hint says which rank to click.
- `Towers.tsx` reads `selectedCardId` and `playMode` and dims the Towers a
  picked support Card cannot reach. The eligibility decision is `canSupport`,
  already pure and tested; the only part that cannot be tested here is one
  additional `lerp` in `towerColour`, which gets a test for its dim factor.

**Tests that must move.** `src/game/support.test.ts` (magnitude is gone),
`src/data/deck.test.ts` (the `supportMagnitude` block is deleted),
`src/ui/supportLabel.test.ts` (new copy), `src/scene/boardClick.test.ts` (the
mismatch falls through to the panel), and `src/game/roundTermination.test.ts`,
whose fixture grinds a rank-5 Tower while holding 10♥ — a pairing the new rule
forbids. Its hearts become rank-5, and its timing math loses `supportMagnitude`.

## Out of scope

Deliberately not addressed here. Each is future work.

**Capping how many supports one Tower can hold.** Supports still stack
additively with no limit, so a Tower that receives every ♠ in a Deck grows
without bound. Flat values make that easier to reason about than rank scaling
did — n supports is exactly `6n` health — but they do not bound it. A cap is
the obvious next question and is explicitly left for a follow-up; nothing in
this design should be read as having settled it.

**High-rank power creep.** A rank-10 Tower covers most of the board, which is a
geometry and range problem in `TOWER_RANKS`, not a support problem. Flat buffs
narrow the gap slightly as a side effect. Fixing the ladder itself is a separate
ticket.

**Rebalancing the four base values.** 6 / 60ms / +2 and the 1.5× premium are
placeholders chosen to sit where rank scaling used to average. They are tuning,
not design, and they live in `src/data/cards.ts` so tuning never touches logic.

**A build fallback for Jack and Queen.** Still open, still recorded in
`game-design.md`, and untouched by this change.
