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
import {
  firstTowerId,
  jokerCard,
  liveRound,
  pawnAt,
  standardCard,
  withDeck,
  withTower,
} from './fixtures'
import { step, tick } from './index'
import type { BuildableRank, GameState } from './types'

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
 * no-op repair hide behind these tests before.
 *
 * The real constraint is narrower than a previous version of this comment
 * claimed: it does NOT need to divide evenly into the Tower's max health
 * (currently rank 5's 22, not the 20 this comment used to say — 22 is what
 * `762f0bb` rebalanced it to, and that made the old claim false). Damage
 * arrives in whole 1-point steps, so a deficit that only needs to reach or
 * exceed `HEAL_DEFICIT` lands on exactly `HEAL_DEFICIT` every time, full stop
 * — no remainder to worry about, whatever the Tower's max health is. Measured
 * by instrumenting the test below while fixing this comment: against the
 * current 22-health Tower, both heals fired with the Tower at exactly 12
 * health (a deficit of exactly 10), and the Tower fell at exactly the
 * `aidedResolveMs` the test computes from
 * `maxHealth + heartsAvailable * HEAL_DEFICIT` — accurate to well under a
 * millisecond of simulated time.
 *
 * What DOES matter: `HEAL_DEFICIT` must stay safely below the Tower's max
 * health, so the deficit can actually reach it while the Tower is still
 * alive. 10 against 22 leaves 12 health in hand when a heal fires; if it were
 * close to or above max health, the Tower would die before the threshold ever
 * triggered and a heal would silently never fire — the exact no-op-repair
 * failure mode described above, reached from the opposite direction.
 */
const HEAL_DEFICIT = 10

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/**
 * A Tower of `rank` at `TOWER_SQUARE`, with a Pawn grinding it from directly
 * up-file at `GRINDER_SQUARE`. Defaults to rank 5, the diagonal blind spot the
 * rest of this file exercises; the rank 7 Wall below reuses the same shape
 * rather than duplicating it, since blocking depends on the squares, not the
 * rank.
 */
function grind(hearts: number, rank: BuildableRank = 5): GameState {
  // Matching the Tower: a numbered Card supports only its own rank.
  const deck = Array.from({ length: hearts }, (_, i) => standardCard(`h${i}`, rank, 'hearts'))
  const built = withDeck(deck, withTower(rank, TOWER_SQUARE))

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
      // arrives in whole steps of 1, so the deficit is exactly `HEAL_DEFICIT`
      // at the moment this fires and each ♥ is worth precisely that much.
      // Healing the instant health dips by 1 would buy almost nothing, which
      // is what let a no-op repair hide behind this test before.
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

describe('packs cannot lengthen the wall', () => {
  /**
   * The bound this whole file pins is "♥ runs out". Packs are the thing that
   * could remove it — a player with Ink could buy ♥ forever and hold a blocked
   * Piece against an unkillable Tower with no round end in sight.
   *
   * Gap-only purchasing is what prevents it. This test is the invariant; without
   * it, the rule is only a comment.
   */
  it('refuses a purchase while a round is live, so the ♥ supply is fixed for its duration', () => {
    const grinding: GameState = { ...grind(0), ink: 10_000 }

    expect(grinding.phase).toBe('inProgress')
    expect(step(grinding, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).toBe(grinding)
  })

  it('allows the same purchase in the gap', () => {
    const between: GameState = { ...grind(0), phase: 'gap', ink: 10_000 }

    expect(step(between, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).not.toBe(between)
  })
})

describe('the rank 7 Wall', () => {
  it('has no gun, so it can never shoot back at what grinds it', () => {
    // The premise of everything below. A Wall is the diagonal blind spot
    // generalised: rank 5 cannot shoot a Piece directly up-file, and rank 7
    // cannot shoot anything at all.
    expect(TOWER_RANKS[7].geometry).toBe('none')
    expect(TOWER_RANKS[7].damage).toBe(0)
  })

  it('still falls when fed every ♥ in the Deck, and the round still ends', () => {
    // WHY THIS TEST EXISTS. "Repair versus the wall" is an OPEN design
    // question, left open on the grounds that the existing bound survives the
    // Wall: ♥ supply is fixed for a round's whole duration because buyPack is
    // refused while a round is live, so repair runs out, the Wall falls, and
    // the round resumes. That is reasoning, not evidence, until this runs.
    //
    // Unlike the diagonal blind spot above, this is not about the Wall being
    // unable to hit ITS attacker specifically — geometry 'none' means it can
    // never hit anything. It is the sharpest version of the case this file
    // pins, because every other rank can eventually shorten its own grind by
    // shooting something; the Wall never can.
    const HEARTS = 4
    const HEART_IDS = Array.from({ length: HEARTS }, (_, index) => `h${index}`)

    // Rank 7, matching the Wall: a numbered Card supports only its own rank.
    let state = grind(HEARTS, 7)

    // Grind, repairing to full whenever a ♥ is left. A ♥ restores to full
    // regardless of the deficit, so unlike the deficit-gated tests above this
    // just spends every heart on a fixed cadence — the point here is only that
    // the grind eventually resolves once they run out, not the precise value
    // each one buys.
    for (const card of HEART_IDS) {
      state = runFor(state, 20_000)
      if (state.towers.length === 0) break
      state = step(state, { kind: 'supportTower', cardId: card, towerId: firstTowerId(state) })
    }

    // No more ♥ left. Comfortably longer than the unaided kill time computed
    // below, so a hang here — rather than a clean resolve — is the finding:
    // it would mean the Wall broke round termination, not that the window was
    // too short.
    const maxHealth = TOWER_RANKS[7].maxHealth
    const dpsPerHop = PIECE_TYPES.pawn.attackDamage * BLOCKED_ATTACK_MULTIPLIER
    const hopIntervalMs = PIECE_TYPES.pawn.moveIntervalMs
    const unaidedResolveMs = (maxHealth / dpsPerHop) * hopIntervalMs

    state = runFor(state, unaidedResolveMs * 3)

    expect(state.towers).toHaveLength(0)
    expect(state.phase).not.toBe('inProgress')
  })
})
