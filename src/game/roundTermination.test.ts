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
import { BLOCKED_ATTACK_MULTIPLIER, PIECE_TYPES } from '../data/pieceTypes'
import { TOWER_RANKS } from '../data/towerRanks'
import { coversSquare } from './coverage'
import { jokerCard, liveRound, pawnAt, standardCard, withDeck, withTower } from './fixtures'
import { step, tick } from './index'
import type { GameState } from './types'

const DT = 1000 / 60
const TOWER_SQUARE = { file: 3, rank: 4 }
const GRINDER_SQUARE = { file: 3, rank: 5 }

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

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/** A rank-5 diagonal Tower with a Pawn grinding it from directly up-file. */
function grind(hearts: number): GameState {
  // Rank 5, matching the Tower: a numbered Card supports only its own rank.
  const deck = Array.from({ length: hearts }, (_, i) => standardCard(`h${i}`, 5, 'hearts'))
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
    // Real constants, not guessed timings: this test's math must move if the
    // rules it pins ever do.
    const maxHealth = TOWER_RANKS[5].maxHealth
    const dpsPerHop = PIECE_TYPES.pawn.attackDamage * BLOCKED_ATTACK_MULTIPLIER
    const hopIntervalMs = PIECE_TYPES.pawn.moveIntervalMs
    const heartsAvailable = 2

    // How long the grind takes with no repair at all, versus with both hearts
    // landing at full value. A ♥ that silently did nothing would still resolve
    // at `unaidedResolveMs` — it could never reach the checkpoint below.
    const unaidedResolveMs = (maxHealth / dpsPerHop) * hopIntervalMs
    const aidedResolveMs =
      ((maxHealth + heartsAvailable * HEAL_DEFICIT) / dpsPerHop) * hopIntervalMs
    const checkpointMs = unaidedResolveMs + (aidedResolveMs - unaidedResolveMs) / 2

    let state = grind(heartsAvailable)
    let checkpointPhase: GameState['phase'] | undefined

    for (let elapsed = 0; elapsed < aidedResolveMs + 10 * hopIntervalMs; elapsed += DT) {
      state = tick(state, DT)

      const tower = state.towers[0]
      const heart = state.deck[0]
      // ♥ restores to FULL, so what a heal is worth is the deficit when it
      // lands, not the Card's magnitude. Waiting for a deficit of exactly
      // `HEAL_DEFICIT` is what keeps the arithmetic above valid: damage
      // arrives in 0.5 steps, so the deficit is exactly `HEAL_DEFICIT` at the
      // moment this fires and each ♥ is worth precisely that much. Healing the
      // instant health dips by 1 would buy almost nothing, which is what let a
      // no-op repair hide behind this test before.
      if (tower && heart && tower.maxHealth - tower.health >= HEAL_DEFICIT) {
        state = step(state, { kind: 'supportTower', cardId: heart.id, towerId: tower.id })
      }

      if (checkpointPhase === undefined && elapsed >= checkpointMs) {
        checkpointPhase = state.phase
      }

      if (state.phase === 'gap') break
    }

    // Comfortably past the unaided resolve time and comfortably short of the
    // aided one. Real repair must still be holding the wall up here.
    expect(checkpointPhase).toBe('inProgress')

    expect(state.deck).toHaveLength(0)
    expect(state.towers).toHaveLength(0)
    expect(state.phase).toBe('gap')
  })

  it('a Joker resolves a stall even while ♥ repair is actively sustaining it', () => {
    // faceCards.test.ts already covers the Joker against a static Tower. The
    // point here is stronger: the Tower is being actively kept alive by repair
    // for well past the unaided grind's resolve time, and the Joker still cuts
    // through it — because it clears Pieces outright rather than out-damaging
    // the Tower.
    const maxHealth = TOWER_RANKS[5].maxHealth
    const dpsPerHop = PIECE_TYPES.pawn.attackDamage * BLOCKED_ATTACK_MULTIPLIER
    const hopIntervalMs = PIECE_TYPES.pawn.moveIntervalMs
    const unaidedResolveMs = (maxHealth / dpsPerHop) * hopIntervalMs

    let state = grind(5)

    for (let elapsed = 0; elapsed < unaidedResolveMs + 2 * hopIntervalMs; elapsed += DT) {
      state = tick(state, DT)

      const tower = state.towers[0]
      const heart = state.deck[0]
      if (tower && heart && tower.maxHealth - tower.health >= HEAL_DEFICIT) {
        state = step(state, { kind: 'supportTower', cardId: heart.id, towerId: tower.id })
      }
    }

    // Repair, not survival by omission: this window runs past the point an
    // unaided grind would already have brought the Tower down.
    expect(state.phase).toBe('inProgress')
    expect(state.towers).toHaveLength(1)

    const armed = withDeck([jokerCard('joker'), ...state.deck], state)
    const cleared = step(armed, { kind: 'clearPieces', cardId: 'joker' })
    const after = tick(cleared, DT)

    expect(after.phase).toBe('gap')
  })
})
