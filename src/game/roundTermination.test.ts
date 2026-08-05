/**
 * The round-end rule depends on an invariant that nothing else states:
 * **Towers only ever lose health**, so a grind is always a countdown and a
 * blocked Piece always unblocks eventually.
 *
 * ♥ Repair is the first mechanic that can break it. The design defers the fix
 * deliberately, because a finite unreplenished Deck bounds the problem: repair
 * runs out, the Tower falls, the round ends. These tests pin that bound so the
 * safety property is asserted rather than assumed — and so that whoever adds
 * packs sees exactly what they are removing.
 */
import { describe, expect, it } from 'vitest'
import { TOWER_RANKS } from '../data/towerRanks'
import { coversSquare } from './coverage'
import { liveRound, pawnAt, standardCard, withDeck, withTower } from './fixtures'
import { step, tick } from './index'
import type { GameState } from './types'

const DT = 1000 / 60
const TOWER_SQUARE = { file: 3, rank: 4 }
const GRINDER_SQUARE = { file: 3, rank: 5 }

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/** A rank-5 diagonal Tower with a Pawn grinding it from directly up-file. */
function grind(hearts: number): GameState {
  const deck = Array.from({ length: hearts }, (_, i) => standardCard(`h${i}`, 10, 'hearts'))
  const built = withDeck(deck, withTower(5, TOWER_SQUARE))

  return liveRound(built, [pawnAt('grinder', GRINDER_SQUARE)])
}

describe('the diagonal blind spot', () => {
  it('cannot cover the square directly up-file, so it never shoots its attacker', () => {
    const { geometry, range } = TOWER_RANKS[5]

    expect(coversSquare(geometry, range, TOWER_SQUARE, GRINDER_SQUARE)).toBe(false)
  })

  it('leaves the grinding Pawn completely undamaged', () => {
    const after = runFor(grind(0), 10_000)

    expect(after.pieces[0]?.health).toBe(3)
  })
})

describe('the wall is bounded by card scarcity', () => {
  it('stalls the round for as long as the Tower is kept alive', () => {
    // Repair on every pass, standing in for a player with cards to spare.
    let state = grind(40)

    for (let elapsed = 0; elapsed < 30_000; elapsed += DT) {
      state = tick(state, DT)

      const tower = state.towers[0]
      const heart = state.deck[0]
      if (tower && heart && tower.health < tower.maxHealth) {
        state = step(state, { kind: 'supportTower', cardId: heart.id, towerId: tower.id })
      }
    }

    expect(state.phase).toBe('inProgress')
    expect(state.towers).toHaveLength(1)
  })

  it('ends once the ♥ supply is exhausted — the bound that makes deferring safe', () => {
    // Two repairs only. The Tower must still fall, and the round must still end.
    let state = grind(2)

    for (let elapsed = 0; elapsed < 60_000; elapsed += DT) {
      state = tick(state, DT)

      const tower = state.towers[0]
      const heart = state.deck[0]
      if (tower && heart && tower.health < tower.maxHealth) {
        state = step(state, { kind: 'supportTower', cardId: heart.id, towerId: tower.id })
      }

      if (state.phase === 'gap') break
    }

    expect(state.deck).toHaveLength(0)
    expect(state.towers).toHaveLength(0)
    expect(state.phase).toBe('gap')
  })

  it('a Joker always breaks the grind, whatever the ♥ supply', () => {
    const state = withDeck(
      [{ id: 'joker', kind: 'joker' }],
      withTower(5, TOWER_SQUARE),
    )
    const stalled = liveRound(state, [pawnAt('grinder', GRINDER_SQUARE)])

    const after = tick(step(stalled, { kind: 'clearPieces', cardId: 'joker' }), DT)

    expect(after.phase).toBe('gap')
  })
})
