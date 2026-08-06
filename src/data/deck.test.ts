import { describe, expect, it } from 'vitest'
import { BUILDABLE_RANKS } from './towerRanks'
import { DECK_CAP, STARTING_DECK } from './deck'
import { CLUB_DAMAGE, DIAMOND_SPEED_MS, FACE_SUPPORT_PREMIUM, SPADE_HEALTH, SUITS } from './cards'

describe('the starting Deck', () => {
  it('is within the Deck cap', () => {
    expect(STARTING_DECK.length).toBeLessThanOrEqual(DECK_CAP)
  })

  it('gives every card a unique id', () => {
    const ids = new Set(STARTING_DECK.map((card) => card.id))

    expect(ids.size).toBe(STARTING_DECK.length)
  })

  // Cards are gained from random packs, so duplicates are the normal case and
  // the code must handle them from day one.
  it('contains duplicates', () => {
    const signatures = STARTING_DECK.filter((card) => card.kind === 'standard').map((card) =>
      card.kind === 'standard' ? `${card.rank}${card.suit}` : '',
    )

    expect(new Set(signatures).size).toBeLessThan(signatures.length)
  })

  it('can build every rank on the ladder', () => {
    const ranks = new Set(
      STARTING_DECK.flatMap((card) => (card.kind === 'standard' ? [card.rank] : [])),
    )

    for (const rank of BUILDABLE_RANKS) {
      expect(ranks).toContain(rank)
    }
  })

  it('covers all four suits', () => {
    const suits = new Set(
      STARTING_DECK.flatMap((card) => (card.kind === 'standard' ? [card.suit] : [])),
    )

    for (const suit of SUITS) {
      expect(suits).toContain(suit)
    }
  })

  it('includes every face rank and at least one Joker', () => {
    const ranks = new Set(
      STARTING_DECK.flatMap((card) => (card.kind === 'standard' ? [card.rank] : [])),
    )

    for (const face of ['J', 'Q', 'K', 'A']) {
      expect(ranks).toContain(face)
    }

    expect(STARTING_DECK.some((card) => card.kind === 'joker')).toBe(true)
  })
})

describe('the face-support premium lands on whole numbers', () => {
  // applySupport (src/game/support.ts) never rounds and never floors the ♠/♦/♣
  // result — it trusts that a flat value times FACE_SUPPORT_PREMIUM is already
  // an integer. That is only true because SPADE_HEALTH, DIAMOND_SPEED_MS and
  // CLUB_DAMAGE all happen to be even, which is a fact about the current
  // numbers, not something the type system or the engine enforces. Every other
  // test computes its expected value from these same constants, so retuning
  // one to an odd number (SPADE_HEALTH = 7, say) would produce a Tower with
  // maxHealth 10.5 and a "Health +10.5" UI label with the whole suite green.
  // This test is the only thing that would catch that: it pins the integer
  // property itself, independent of any behaviour built on top of it.
  it.each([
    ['SPADE_HEALTH', SPADE_HEALTH],
    ['DIAMOND_SPEED_MS', DIAMOND_SPEED_MS],
    ['CLUB_DAMAGE', CLUB_DAMAGE],
  ])('%s * FACE_SUPPORT_PREMIUM is an integer', (_name, value) => {
    expect(Number.isInteger(value * FACE_SUPPORT_PREMIUM)).toBe(true)
  })
})
