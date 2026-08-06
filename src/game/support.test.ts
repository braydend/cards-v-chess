import { describe, expect, it } from 'vitest'
import {
  CLUB_DAMAGE,
  DIAMOND_SPEED_MS,
  FACE_SUPPORT_PREMIUM,
  MIN_FIRE_INTERVAL_MS,
  SPADE_HEALTH,
} from '../data/cards'
import { BUILDABLE_RANKS, TOWER_RANKS } from '../data/towerRanks'
import { firstTower, firstTowerId, liveRound, pawnAt, standardCard, withDeck, withTower } from './fixtures'
import { step, tick } from './index'
import type { BuildableRank, CardRank, GameState, Suit } from './types'

const DT = 1000 / 60

const SQUARE = { file: 2, rank: 2 }

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

function play(state: GameState, cardId: string): GameState {
  return step(state, { kind: 'supportTower', cardId, towerId: firstTowerId(state) })
}

const hurtTo = (health: number) => (state: GameState): GameState => ({
  ...state,
  towers: state.towers.map((tower) => ({ ...tower, health })),
})

describe('♥ Repair', () => {
  it('restores a damaged Tower to full', () => {
    const state = hurtTo(4)(withSupport('h', 5, 'hearts'))

    expect(play(state, 'h').towers[0]?.health).toBe(TOWER_RANKS[5].maxHealth)
  })

  it('never heals past maxHealth', () => {
    const state = withSupport('h', 5, 'hearts')

    expect(play(state, 'h').towers[0]?.health).toBe(TOWER_RANKS[5].maxHealth)
  })

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
})

describe('♦ Speed', () => {
  it('shortens the fire interval', () => {
    const state = withSupport('d', 5, 'diamonds')

    expect(play(state, 'd').towers[0]?.fireIntervalMs).toBeLessThan(TOWER_RANKS[5].fireIntervalMs)
  })

  it('shortens the interval by exactly the flat value', () => {
    const state = withSupport('d', 5, 'diamonds')

    expect(firstTower(play(state, 'd')).fireIntervalMs).toBe(
      TOWER_RANKS[5].fireIntervalMs - DIAMOND_SPEED_MS,
    )
  })

  it('pays a face card the premium, on any Tower', () => {
    const state = withSupport('d', 'A', 'diamonds')

    expect(firstTower(play(state, 'd')).fireIntervalMs).toBe(
      TOWER_RANKS[5].fireIntervalMs - DIAMOND_SPEED_MS * FACE_SUPPORT_PREMIUM,
    )
  })

  it('never drops below the floor, however many are stacked', () => {
    let state = withDeck(
      Array.from({ length: 20 }, (_, i) => standardCard(`d${i}`, 'A', 'diamonds')),
      withTower(5, SQUARE),
    )

    for (let i = 0; i < 20; i += 1) {
      state = play(state, `d${i}`)
    }

    expect(state.towers[0]?.fireIntervalMs).toBe(MIN_FIRE_INTERVAL_MS)
  })

  it('fires more often than its rank alone would once ticked', () => {
    // Mirrors "fires using the Tower's own damage, not its rank's" in
    // blocking.test.ts, which does the equivalent job for ♣. Nothing anywhere
    // ticks a ♦-supported Tower, so this suite would still pass if
    // fireTowers read the rank definition's interval instead of the Tower's
    // own.
    // Rank 3, not rank 5: the rebalance moved rank 5 to a 550ms interval, and
    // 550 - 270 = 280 is fractionally over half, so two shots no longer fit in
    // one rank-interval window. Rank 3's 500ms keeps the original arithmetic.
    const built = withTower(3, SQUARE)
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

    expect(firstTower(boosted).fireIntervalMs).toBeLessThan(TOWER_RANKS[3].fireIntervalMs / 2)

    // One Pawn, not two: rank 3 now deals 2 damage, under a Pawn's 3 health,
    // so it can no longer one-shot a Pawn (rank 5 dropped to 2 damage as
    // well) -- the "each one-shot" premise this test used to rely on no
    // longer holds for either rank. Two hits of 2 on the SAME Pawn (4 total
    // against 3 health) destroys it just as legibly as two one-shots did, and
    // proves the same thing: two shots landed inside the window. Rank 3 is
    // `vertical`, so the Piece has to sit on the Tower's own file --
    // off-file is uncovered regardless of range.
    const state = liveRound(boosted, [pawnAt('a', { file: SQUARE.file, rank: 4 })])

    // A window just over the rank's OWN interval: at that interval only one
    // shot would land, so only using the Tower's own (post-support) interval
    // gets through in time for a second.
    let current = state
    const windowMs = TOWER_RANKS[3].fireIntervalMs + DT
    for (let elapsed = 0; elapsed < windowMs; elapsed += DT) {
      current = tick(current, DT)
    }

    expect(current.pieces).toHaveLength(0)
  })
})

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

describe('supportTower: refusals', () => {
  it('consumes the Card on a successful play', () => {
    const state = withSupport('h', 5, 'hearts')

    expect(play(state, 'h').deck).toHaveLength(0)
  })

  it('refuses an unknown Card', () => {
    const state = withSupport('h', 5, 'hearts')

    expect(step(state, { kind: 'supportTower', cardId: 'ghost', towerId: firstTowerId(state) })).toBe(state)
  })

  it('refuses an unknown Tower, and keeps the Card', () => {
    const state = withSupport('h', 5, 'hearts')
    const after = step(state, { kind: 'supportTower', cardId: 'h', towerId: 'ghost' })

    expect(after).toBe(state)
    expect(after.deck).toHaveLength(1)
  })

  it('refuses a Joker, which has no suit', () => {
    const state = withDeck([{ id: 'j', kind: 'joker' }], withTower(5, SQUARE))

    expect(step(state, { kind: 'supportTower', cardId: 'j', towerId: firstTowerId(state) })).toBe(state)
  })

  it('supports from a face card, since suits work at every rank', () => {
    const state = withSupport('k', 'K', 'clubs')

    expect(play(state, 'k').towers[0]?.damage).toBeGreaterThan(TOWER_RANKS[5].damage)
  })
})

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
