# Tower Role Rebalance — Design

**Date:** 2026-08-06
**Status:** Agreed
**Issue:** [#19 — towers 6-10 may be overpowered](https://github.com/braydend/cards-v-chess/issues/19)
**Supersedes part of:** [`2026-08-05-card-system-and-roster-design.md`](2026-08-05-card-system-and-roster-design.md), specifically the rank ladder's decision that ranks 8 and above scale on `targetsPerShot`.

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

Ranks 6-10 cover so much of the board that Tower placement stops being a
decision. Reported from play: **a single rank-6 Tower placed centrally carries
auto-rounds for 45+ rounds with no further intervention.**

Measuring the shipped ladder on an 8x8 board confirms it, and sharpens it.
Coverage below is the share of the other 63 squares, averaged over every legal
placement and taken from a central square:

| Rank | Geometry | Avg | From centre | Damage | Interval | Targets |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | adjacent r1 | 10% | 13% | 1 | 600 | 1 |
| 3 | vertical r4 | 9% | 11% | 1 | 600 | 1 |
| 4 | cross r4 | 17% | 22% | 2 | 550 | 1 |
| 5 | diagonal r5 | 13% | 21% | 3 | 500 | 1 |
| 6 | star r5 | 33% | 43% | 3 | 480 | 1 |
| 7 | disc r3 | 46% | **76%** | 4 | 450 | 1 |
| 8 | star r6 | 35% | 43% | 4 | 420 | 3 |
| 9 | disc r3 | 46% | **76%** | 5 | 400 | 5 |
| 10 | disc r4 | 65% | **100%** | 6 | 380 | ∞ |

A rank-10 Tower on a central square covers **the entire board** and hits **every
Piece on it** for 6 damage every 380ms. That is not a strong Tower, it is a win
condition.

Three structural faults sit underneath the numbers.

**The ladder scales on four axes at once.** Coverage, damage, fire rate and
target count all rise together from rank 6 up. Tower-defense balance treatments
generally hold range as the single dominant lever and weight a Tower's DPS by
the fraction of the field it covers; stacking all four makes the top of the
ladder strictly dominant rather than differently good.

**Ranks 7 and 9 are the same Tower.** Identical geometry and range, differing
only in damage and target count. And rank 8 covers *less* board than rank 7
(35% against 46%), so the ladder is not even monotonic in the axis it leans on.

**Rarity is flat, on purpose, and that purpose has failed.** `src/data/packs.ts`
makes a 10 exactly as likely to pull as a 2, reasoning that "the rank ladder
already separates those nine cards by geometry, range and damage." It separates
them, but only in one direction: nothing restrains the strongest card in the
game from also being among the most common.

Four symptoms were confirmed in play, and all four are shape problems rather
than magnitude problems:

1. Placement stopped mattering.
2. Rounds became trivial.
3. Low ranks became dead cards.
4. The top ranks all feel the same.

A numbers-only retune addresses only the second.

## Decision

**Power still rises with rank, but every rank trades something.** Coverage and
single-target damage move in opposite directions, so a high rank is stronger
overall without being better at everything. Ranks 7, 8 and 9 additionally take
on utility roles instead of being four flavours of the same gun.

The commitment in `game-design.md` that "power rises with rank" is preserved,
and the flat rarity in `packs.ts` survives intact — its stated rationale
becomes true rather than aspirational.

### The new ladder

| Rank | Geometry | Coverage (avg / best) | 1-target DPS | vs. a crowd | Role |
| --- | --- | --- | --- | --- | --- |
| **2** | adjacent r1 | 10% / 13% | **7.5** | 7.5 | Point-blank executioner |
| **3** | vertical r5 | 10% / 11% | 4.0 | 4.0 | Lane sniper — one file, all the way down |
| **4** | cross r4 | 17% / 22% | 3.6 | 3.6 | Crossroads |
| **5** | diagonal r5 | 13% / 21% | 3.6 | 3.6 | The X, blind spot retained |
| **6** | star r3 | 25% / 38% | 3.3 | 3.3 | 4 and 5 together — the composition payoff |
| **7** | none | — | 0 | 0 | **Wall** — no gun, blocks and soaks |
| **8** | ring r4 | 38% / 62% | 1.4 | 4.3 | **Amplifier** — marks what it covers |
| **9** | adjacent r2 | 27% / 38% | 1.3 | 4.0 | **Freezer** — slows what it covers |
| **10** | band ±1 | 33% / 37% | 1.3 | **all** | **Toll gate** — full width, nothing passes un-shot |

Four properties this encodes, each answering one of the four symptoms:

1. **Single-target DPS falls monotonically as rank rises**, 7.5 down to 1.3. A
   rank 2 out-damages a rank 10 against a single Piece by six times, permanently.
   Low ranks can never become landfill.
2. **Coverage is capped well below the board.** Best case falls from 100% to
   62%. Every Tower has somewhere it is not, so placement is always a decision.
3. **A rank 10 beats a rank 2 only when there is a crowd.** That single
   comparison is the whole trade.
4. **Ranks 7, 8, 9 and 10 do four different jobs**, none of which is the job the
   others do.

### Rank 6 keeps its shape and loses its reach

Rank 6 stays `star`, the composition of 4 and 5, because that is the one
legibility win the ladder has: 6 reads as "4 and 5 together" the way 4 once read
as "2 and 3 together".

Range drops from 5 to 3. Coverage falls from 33% to 25% averaged over all
placements, and from 43% to 38% from a central square — a modest change on its
own, because a star's rays reach the board edge either way. **The reach cut is
not what fixes rank 6; the DPS cut is.** Damage drops from 3 to 2 and the
interval lengthens from 480ms to 600ms, taking it from 6.25 DPS to 3.33 — so
the Tower reported as carrying 45+ unattended rounds now takes **1.9 times as
long to kill anything**, and can no longer out-trade what walks into it.

A **horizontal** line was proposed for rank 6 and is **rejected**, for the
reason it was rejected at rank 2: Pieces travel down a file, so a horizontal
line catches each Piece for exactly one move interval and therefore one shot.
Chess movement made this worse rather than better — a Pawn is now *strictly*
file-confined.

### Rank 10 is where horizontal works

The `band` — full board width, ±1 rank — is the horizontal idea placed at the
one rank that can carry it. Horizontal fails at low rank because one crossing is
one shot; at rank 10 with unlimited targets, "one toll on every Piece, no
exceptions, and nothing can go around it" is precisely the identity.

Two properties make it the right capstone:

- **Nothing can flank it.** Files never grow — only ranks do — so a band spans
  the full width for the entire run. In a game with no pathfinding, a guaranteed
  toll on every Piece is a capstone that needs no raw power behind it.
- **An Ace dilutes it.** As the board gains ranks, the band's *share* of the
  board shrinks while its absolute coverage stays fixed. Board growth is a
  natural counterweight rather than an amplifier.

Placing it is a real decision: deep is a last line of defence, shallow buys the
rest of the board time.

### The three utility mechanics are positional auras, not timed debuffs

| | Rank 7 — Wall | Rank 8 — Amplifier | Rank 9 — Freezer |
| --- | --- | --- | --- |
| Geometry | none | ring r4, hollow core | adjacent r2 |
| Fires | never | weakly | weakly |
| Effect | blocks and soaks | Pieces it covers take ×2 damage from **other** Towers | Pieces it covers have their move interval ×1.5 |
| Precedent | every Tower already blocks | `buffedPieceIds` in `auras.ts` | `KING_SPEED_MULTIPLIER`, inverted |

The effects are **derived per tick from position** and stored nowhere. A Piece
is slowed *while it stands in a freezer's coverage*, not for N seconds after
being hit. `src/game/auras.ts` already establishes this shape exactly:
`buffedPieceIds` recomputes membership every tick from Piece positions, and its
comment records the design choice — "membership, not a count: the aura
deliberately does **not** stack".

Dropping duration is what makes this cheap:

- **No timers.** A timed debuff needs per-Piece duration state ticked down every
  tick. An aura needs no new persistent state at all.
- **No `structuralKey` risk.** A per-tick countdown is exactly the class of value
  the key excludes, and adding one is documented as the way to silently destroy
  the measured 24-publishes-per-600-frames property.
- **Non-stacking for free**, matching the King aura's existing choice rather than
  inventing a second rule for the same question.
- **Placement matters more.** A timed debuff travels with the Piece and stops
  caring where the Tower was. An aura is bounded by coverage, so where the Tower
  goes *is* the decision.

The resulting combinations are spatial, which is the point:

- The amplifier's **hollow core is a socket**. A rank 2 sits in the middle, and
  everything the ring marks walks into 7.5 DPS doubled.
- The freezer **holds Pieces inside someone else's kill zone** rather than adding
  damage of its own.
- The wall **cannot defend itself at all**, which promotes rank 5's accidental
  diagonal blind spot from an oddity into a deliberate design position.

Two rules are fixed now rather than left to tuning:

- **The amplifier never amplifies its own fire.** Otherwise a lone rank 8 is
  self-sufficient and the dominance problem is rebuilt at a new rank. This
  mirrors the King never buffing itself and `applyHealing`'s
  `other.id === piece.id` check, so all three auras in the codebase agree on
  what "other" means.
- **Auras do not stack.** Two freezers are one freezer.

### Numbers

Every value here is a **placeholder** in the sense the codebase already uses:
the relationships are design, the magnitudes are tuning.

```
rank  geometry   range  dmg  interval  targets  maxHealth
 2    adjacent     1     3     400        1         10
 3    vertical     5     2     500        1         14
 4    cross        4     2     550        1         18
 5    diagonal     5     2     550        1         22
 6    star         3     2     600        1         26
 7    none         0     0    1000        0         45     <- wall
 8    ring         4     1     700        3         30     <- amplifier
 9    adjacent     2     1     750        3         34     <- freezer
10    band         1     1     800        ∞         38     <- toll gate

AMPLIFIER_MULTIPLIER = 2.0    damage from other Towers, inside the ring
FREEZE_MULTIPLIER    = 1.5    move interval, mirroring KING_SPEED_MULTIPLIER = 0.7
```

Single-target DPS across the firing ranks is therefore 7.50, 4.00, 3.64, 3.64,
3.33, 1.43, 1.33, 1.25 — **non-increasing**, with ranks 4 and 5 deliberately
tied. Rank 9 sits at 750ms rather than 650ms specifically to preserve that: at
650ms it would out-damage rank 8, and the whole point of the ladder is that
damage never rises as coverage does.

The wall's `fireIntervalMs` of 1000 is inert — `geometry: 'none'` means it never
has a target and `fireTowers` skips it outright — but it is deliberately
positive rather than 0, so that no future change to the firing loop's
`while (cooldown >= tower.fireIntervalMs)` condition can spin on it.

**The wall's 45 health is deliberately shy** — roughly 1.7 times rank 6, not
three times. A blocked Pawn deals `2 × 0.5 = 1` damage per 900ms and a Queen
2.5 per second, so wall health *is* worst-case round length. Over-tuning it
manufactures the grind that "Repair versus the wall" exists to decide, and
raising a number later is easier than discovering the problem in play.

### Engine surface

`TowerGeometry` gains `'none' | 'ring' | 'band'`. Because `coversSquare`
switches exhaustively on it, adding the three variants is a compile error until
all three are handled — the same protection `step`'s switch relies on.

- `'none'` covers nothing. `range: 0` would already achieve this, since
  `coversSquare` guards `distance > range` and distance is always at least 1,
  but an explicit variant is self-documenting and forces the reader to notice
  that a Tower which never fires exists.
- `'ring'` covers the outer band only: `distance <= range && distance >= range - 1`.
- `'band'` covers the full file width at `rankDistance <= range`, with no file
  bound at all. It is the first geometry whose coverage is not a function of
  Chebyshev distance, so it must be handled before the shared `distance > range`
  guard rather than after it.

## Rejected

### Rank 10 as an ink factory

Proposed as "spawns X ink per second while the round runs". **Rejected — it
breaks a hard invariant**, stated in both `CLAUDE.md` and `game-design.md`:

> **Ink income must be event-driven** — round completion and kills — **never
> time-based.** The gap between rounds is untimed, so time-based income is
> unbounded: the player would just wait.

Scoping it to "while the round runs" dodges the untimed-gap exploit but not the
real one. A round ends when nothing can act. Pair the ink factory with the
rank-7 wall and a ♥, decline to kill the last Piece, and the player farms Ink
for as long as they care to. `JOKER_CLEAR_SHARE` was set to 0.25 specifically to
close a much weaker version of the same exploit — holding a Joker while the
board fills — so the precedent for taking this seriously is already in the
codebase.

It would also add a fourth Ink income path, and the *shapes* of the three
existing paths are settled rather than open. See
[`2026-08-06-ink-income-design.md`](2026-08-06-ink-income-design.md).

### Rank 8 as a confuser

Proposed as "randomizes the attacked pieces pathing (while still respecting
their movement rules) for X seconds, does not affect pawns". **Rejected in
favour of the amplifier**, though not because it is unbuildable.

The invariant it touches is:

> **Pieces are forward-biased and deterministic.** Direction is a pure function
> of Piece type, `moveCount`, and `handedness`.

The counter-argument is sound as far as it goes: the invariant's stated purpose
is preventing **Tower placement from steering Pieces**, mazing requires
*predictability*, and a confuser offers none. `src/game/rng.ts` already carries
seeded named streams, so runs would stay reproducible. The Pawn exemption is
also correct — a Pawn is file-locked, so there is nothing to randomise.

It was rejected on cost and overlap rather than on principle:

- It requires an explicit amendment to a stated invariant, where the amplifier
  requires none.
- A confused Piece moving backwards touches `stillActive` and the Knight's
  `hunting` latch, both of which are load-bearing for round termination.
- Its effect — the Piece takes longer to arrive — is the freezer's job already.

The amplifier takes the same "support Tower" slot with no movement code touched,
no invariant ruling needed, and a rider that rewards placement rather than
duplicating rank 9.

### Making high ranks rare instead

Leave the Towers alone and drop pull weight with rank, so a rank 10 stays a bomb
you rarely hold. **Rejected**: it reopens the deliberate "common is FLAT across
2-10" decision in `packs.ts`, which entangles with the still-open "Pack weighting
and prices" question — itself to be resolved jointly with "Ink income values".
Three unresolved questions is not a place to settle a fourth.

### Ranks as pure sidegrades

Make 2-10 roughly equal in total value, differing only in role, so no card is
ever landfill. **Rejected**: it leaves nothing to chase in a pack, makes rank
scarcity meaningless, and removes "which rank did I pull" as a moment worth
caring about.

### Resolving "Repair versus the wall" as part of this

A ♥-fed rank-7 wall is a Tower whose entire identity is soaking attacks, and ♥
restores to full regardless of rank while ♠ raises the ceiling. Four bounds were
considered: permanent `maxHealth` decay on the wall, a lifetime timer, a global
ruling for every Tower, and nothing.

**Nothing was chosen.** The existing bound already holds and the wall does not
break it: the ♥ supply is fixed for a round's whole duration because `buyPack`
is refused while a round is live, so the wall provably runs out of repairs,
falls, and the round resumes. `src/game/roundTermination.test.ts` pins both
halves.

Rounds get slower. The open question stays open, with more weight on it.

## Known interactions

**A freezer slows grinding as well as walking.** A blocked Piece attacks on the
*same* `while (cooldown >= moveIntervalMs)` loop that moves it (`src/game/tick.ts`),
so a freezer covering a wall makes each ♥ buy more seconds of stall. It does not
loosen the bound — the ♥ supply is still fixed mid-round — so rounds become
slower rather than endless.

Accepted rather than carved out. Separating the two cadences would mean choosing
the move interval before `nextMove` has reported whether the Piece is blocked,
which inverts the existing control flow for a case that does not threaten
termination. Recorded against "Repair versus the wall" as one more thing that
question now bears on.

**Board growth dilutes the band and nothing else.** An Ace adds a rank, so the
band's share of the board shrinks while ring and disc coverage is unaffected.
This is the intended direction — the capstone gets relatively weaker as the run
escalates — but it means the band's tuning should be read against a grown board,
not only against 8x8.

## Verification

- **Coverage becomes a test, not a play-feel argument.** `coverage.test.ts`
  asserts that no rank covers more than **39 of the other 63 squares** on an 8x8
  from *any* placement — the ring at centre, 61.9%, is the ceiling — and that
  single-target DPS falls monotonically from rank 2 to rank 10. Asserted as a
  square count rather than a percentage, so the threshold is exact rather than
  a rounded float. Issue #19 was reported as "may be overpowered"; this makes
  the same claim falsifiable.
- **Aura ordering follows the discipline `auras.ts` documents.** The amplified
  and frozen sets are computed from a frozen Piece list *before* Towers fire, so
  no Piece's outcome depends on which Tower the caller happened to process
  first.
- **`roundTermination.test.ts` gains a wall case**: a rank-7 wall fed every ♥ in
  a Deck still falls, and the round still ends.
- **The amplifier's self-exclusion is pinned by a test**, because it is the rule
  that stops rank 8 rebuilding the dominance problem.
- **`towerRanks.test.ts` and `firing.test.ts`** both assert against the current
  ladder and will need reshaping — `firing.test.ts:253` reads
  `TOWER_RANKS[8].targetsPerShot` directly.

## Documentation to update

| File | Change |
| --- | --- |
| `docs/design/game-design.md` | Replace the rank ladder table and its rationale. Update "Repair versus the wall" — the wall and the freezer both bear on it. Note that the rank-2 horizontal rejection now also explains rank 6, and that rank 10 is where horizontal earns its place. |
| `CLAUDE.md` | Add Wall, Amplifier, Freezer, Toll gate to the vocabulary table. Update the "Current state" summary. |
| `src/data/towerRanks.ts` | New table, and a comment explaining the coverage⇔DPS trade so a future balance pass does not undo it by raising one axis alone. |

## Erratum (2026-08-06)

This is a frozen decision record, so the claim below is left in place above and
corrected here rather than edited in place.

**The original claim.** "Known interactions" above states: "Board growth
dilutes the band and nothing else. An Ace adds a rank, so the band's share of
the board shrinks while ring and disc coverage is unaffected." "Verification"
above sizes the ceiling test at 39 of 63 squares on a literal 8x8 board only,
on the reasoning that 8x8 is the tightest case growth can produce.

**Both are false.** `vertical`, `cross`, `diagonal`, and `ring` are all
bounded by Chebyshev distance along the rank axis, so a centrally-placed
Tower using one of them is RANK-CLIPPED on the 8x8 starting board — its reach
runs into the top or bottom edge before its shape is complete. The first Ace
(9 board ranks) removes that clipping, and each of those geometries jumps to
its true, larger absolute size, permanently. `band` is the only geometry that
was never rank-clipped, because its reach along the files was always the full
board width — it alone matches the original claim.

Measured peak coverage, files fixed at 8, board ranks swept 8/9/10/12/16/24
(the 8x8 column matches the 39-of-63 figure "Verification" above already
gives for rank 8; the columns after it are the correction):

| Rank | Geometry | 8 ranks | 9 ranks | 10 | 12 | 16 | 24 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | vertical | 7 | 8 | 9 | 10 | 10 | 10 |
| 4 | cross | 14 | 15 | 15 | 15 | 15 | 15 |
| 5 | diagonal | 13 | 14 | 14 | 14 | 14 | 14 |
| 8 | ring | 39 | 47 | 47 | 47 | 47 | 47 |
| 10 | band | 23 | 23 | 23 | 23 | 23 | 23 |

(Ranks 2, 6, 7, 9 are unaffected by growth and are omitted; they hold flat at
their 8x8 values from the original table.)

Rank 8's ring is both the absolute ceiling (47 squares) and the worst SHARE
the board ever shows (47 of 71, 66.2%, at 9 board ranks) — worse than the
39-of-63 (61.9%) the pre-Ace board shows, because the ring only reaches its
full size once the first Ace removes its clipping. Every height past 9 has
strictly more squares while the absolute ceiling does not grow further, so
the share falls from there.

**The design intent survives.** No Tower ever blankets the board at any
measured height — 47 stays well under the whole-board count at every size —
so placement still matters at every point in a run; 66% at the worst point
(one Ace in) is the number that intent has to be judged against, not the
39-of-63 this document originally gave. `src/data/towerRanks.test.ts`'s
`describe('the coverage ceiling', ...)` block now sweeps board heights
8/9/16/24 rather than asserting against 8x8 alone, asserts an absolute
ceiling of 47 and a "never the whole board" property at every height, and
checks the 9-board-rank share is the worst the board ever sees.
