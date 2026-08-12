# Poker Hands Build Towers

**Status:** Approved design — implementation plan follows.
**Date:** 2026-08-12
**Issue:** #57 — rework towers and card mechanics

## Problem

It is easy to build many Towers quickly, which makes the game feel messy. The
relationship between Cards and Towers should change so that Cards must be played
in poker hands in order to purchase Towers.

## The change

Playing a Tower becomes a **hand play**: the player commits a subset of the Deck
that forms a valid poker hand, and the hand type determines the Tower built. The
hand itself is the whole cost — the committed cards are consumed and no Ink is
spent. This replaces the current "a numbered Card's rank builds a Tower" rule.

## Hand ladder

Strict poker rarity orders the ladder: a rarer hand always builds a stronger
Tower. Hand type alone determines the Tower — the ranks of the cards inside the
hand do not modulate it, and the resulting Tower is identical for any cards
forming the same hand type.

| Hand | Cards | Tower | Shape |
| --- | --- | --- | --- |
| High card | 1 | Vertical | A single file. |
| Pair | 2 | Wall | No gun — blocks and soaks. |
| Two pair | 4 | Sniper | Long range, single target, high damage. **New shape.** |
| Three of a kind | 3 | Diagonal | Four diagonals. |
| Straight | 5 | Cross | Four cardinal lines. |
| Flush | 5 | Star | Eight rays, shorter reach. |
| Full house | 5 | Splash | Small area burst. **New shape.** |
| Four of a kind | 4 | Ring-damage | Hits everything its ring covers. Replaces the Amplifier. |
| Straight flush | 5 | Toll gate | Full-board-width band, unlimited targets. |
| Royal flush | 5 | Choice | Builds any of the nine Tower types. |

Notes:

- **The tower roster is the hand ladder.** The old rank-keyed table (2–10)
  retires. Towers are keyed by tower type, not by a Card's rank.
- **Cross replaces the Freezer.** The straight-flush Tower is the cross shape;
  the Freezer does not exist anymore.
- **The Amplifier becomes Ring-damage.** Four of a kind builds a Tower that
  deals damage to everything inside its ring each shot — the "amplify" aura is
  gone.
- **Rarity orders the ladder, not card count.** Two pair (4 cards) sits above
  three of a kind (3 cards) because poker rarity says so.

## Card roles

- **Numbered cards (2–10)** are hand material only. They have no solo build and
  no suit support.
- **Face cards (J/Q/K/A)** have exactly two lives: play their **action** at any
  time, or be **committed to a hand** (gap only). They keep no suit-support
  play.
  - **Jack — Shield.** Grants a Tower a shield, absorbed before health. Unchanged.
  - **Queen — Range.** Adds +1 to any Tower's range. Stackable, any Tower, no
    rank restriction. **Replaces Echo.**
  - **King — Reinforce.** +1 Core current and maximum health. Unchanged.
  - **Ace — Expand.** The board gains a rank. Unchanged.
- **Joker** keeps its Clear action and is never hand material.

**Suit support is removed entirely** — for numbered cards and face cards alike.
Hearts, Diamonds, Spades and Clubs no longer repair, speed, shield, or damage a
Tower when played. A Card's suit matters only for forming flushes, straight
flushes, and royal flushes. All of the suit-support mechanics (`canSupport`,
`applySupport`, rank-matching, the face premium, and the four suit effects)
retire.

## Playing a hand

- **When.** The gap between rounds only. This is now the build phase. Face-card
  actions and the Joker's Clear remain playable mid-round.
- **How.** The player selects Cards from the Deck. The game shows the strongest
  hand the selection forms (five same-suit cards show *flush*; a five-card
  selection with no five-card pattern is refused). A committed set must be
  **exactly one valid hand of its size** — no kickers, no downgrades. Exact
  sizes: high card 1, pair 2, three of a kind 3, two pair 4, four of a kind 4,
  straight 5, flush 5, full house 5, straight flush 5, royal flush 5.
- **Placement.** Two-step: the player first commits the hand — the cards are
  consumed and a Tower of the hand's type appears, awaiting placement — then
  clicks a square to place it, checked by the existing legal-square rules.
  Clicking an illegal square does not place (and does not refund the cards);
  the pending Tower stays until a legal square is chosen or the play is
  cancelled.
- **Cost.** The hand itself — the committed cards are consumed. No Ink. Playing
  a hand is never legal mid-round.

## Engine and data changes

- **Towers are keyed by tower type**, not by a Card's rank. The `TOWER_RANKS`
  table keyed 2–10 becomes a tower-type table keyed by the nine shapes.
  `Tower.cardRank` becomes the Tower's type.
- **`buildTower` is replaced** by a hand command carrying the committed card ids
  and the target square. `supportTower` and `applySupport` are deleted.
  `echoTower` becomes the Queen's range action. Face and Joker commands are
  otherwise unchanged.
- **The rank ladder invariants re-scope.** The old "single-target DPS never
  rises with rank / `targetsPerShot` never falls" property is meaningless once
  no Tower carries a rank. A new tower-type table is authored with **strict
  rarity order** as the constraint, and the tower table tests pin the new
  shapes and their ordering.
- **`BuildableRank` retires** as a Tower key. Cards still carry ranks (they are
  hand material), so `CardRank` survives; only the buildable subset loses its
  meaning.

## Economy

Unchanged. The 30-card Deck cap, packs bought with Ink in the gap, pack prices,
and escalation stay exactly as they are. Only the Card → Tower relationship
changes.

## What this retires

Existing mechanics, invariants, and docs that stop being true and must be
updated in the implementation plan:

- Suit support in all forms (`supportTower`, `applySupport`, rank-matching,
  face premium, ♥ ♦ ♠ ♣ effects).
- The Queen's Echo.
- The Amplifier aura and the "never amplifies itself" invariant.
- The Freezer.
- The rank-keyed `TOWER_RANKS` ladder and its DPS/coverage invariants.
- "Playing a card costs nothing but the Card" holds, but "a numbered Card
  supports only a Tower of its own rank" is dead — there is no support at all.
- `docs/design/game-design.md` sections on modality, supports, and the rank
  ladder need rewriting.

## Open follow-ups

- Sniper and splash geometry and stat tuning (new shapes need authored stats).
- Whether the Queen's stackable +1 range needs a cap (deferred, mirrors the
  other uncapped stacks).
