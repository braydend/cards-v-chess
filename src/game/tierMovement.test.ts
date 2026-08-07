import { describe, expect, it } from 'vitest'
import { BOARD, CORE_SQUARE } from '../data/board'
import { towersAt } from './fixtures'
import { nextMove } from './movement'
import type { MoveRequest } from './movement'
import type { PieceTypeId, Square, Tower } from './types'

const NO_TOWERS = new Map<string, Tower>()

function move(
  typeId: PieceTypeId,
  from: Square,
  towers: ReadonlyMap<string, Tower> = NO_TOWERS,
  overrides: Partial<MoveRequest> = {},
) {
  const request: MoveRequest = {
    typeId,
    from,
    moveCount: 0,
    handedness: 1,
    slideBonus: 0,
    hunting: false,
    tier: 'green',
    ...overrides,
  }
  return nextMove(request, BOARD, CORE_SQUARE, towers)
}

describe('yellow — hunts from spawn', () => {
  it('a yellow Knight hunts from its first on-board hop', () => {
    const from = { file: 5, rank: 6 }
    const yellow = move('knight', from, NO_TOWERS, { hunting: true, tier: 'yellow' })
    const alreadyHunting = move('knight', from, NO_TOWERS, { hunting: true, tier: 'green' })

    expect(yellow).toEqual(alreadyHunting)
  })

  it('a yellow Knight on the Staging rank marches its entry hop', () => {
    // rank `BOARD.ranks` is off the board — the Staging rank. No distance field
    // has an entry there, so hunting must not engage until the Piece is on it.
    const from = { file: 3, rank: BOARD.ranks }
    const yellow = move('knight', from, NO_TOWERS, { hunting: true, tier: 'yellow' })
    const green = move('knight', from, NO_TOWERS, { hunting: false, tier: 'green' })

    expect(yellow).toEqual(green)
  })

  it('a yellow Pawn still marches, because Pawns never hunt', () => {
    const from = { file: 3, rank: 5 }
    const yellow = move('pawn', from, NO_TOWERS, { hunting: true, tier: 'yellow' })
    const green = move('pawn', from, NO_TOWERS, { hunting: false, tier: 'green' })

    expect(yellow).toEqual(green)
  })
})

describe('red — seeks Towers', () => {
  it('detours toward the nearest Tower within reach', () => {
    // Rook at (5,6). The Tower at (4,4) is 2 rook-moves away; green marches
    // straight down its file to (5,5), red steps left toward the Tower.
    const towers = towersAt({ file: 4, rank: 4 })

    expect(move('rook', { file: 5, rank: 6 }, towers, { tier: 'red' })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 6 },
    })
    expect(move('rook', { file: 5, rank: 6 }, towers, { tier: 'green' })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('grinds a Tower blocking its line rather than routing around it', () => {
    const towers = towersAt({ file: 5, rank: 5 })

    expect(move('rook', { file: 5, rank: 6 }, towers, { tier: 'red' })).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
    })
  })

  it('behaves exactly as green when no Tower is in reach', () => {
    expect(move('rook', { file: 5, rank: 6 }, NO_TOWERS, { tier: 'red' })).toEqual(
      move('rook', { file: 5, rank: 6 }, NO_TOWERS, { tier: 'green' }),
    )
  })

  it('ignores a Tower its own movement cannot reach', () => {
    // (4,0) is a same-colour square as (3,4); (4,0) vs (3,4): (4+0)%2=0,
    // (3+4)%2=1 — opposite colour, so the Bishop can never reach it. Both
    // sides then behave identically (they both hunt the Core from rank 0).
    const towers = towersAt({ file: 3, rank: 4 })

    expect(move('bishop', { file: 4, rank: 0 }, towers, { tier: 'red' })).toEqual(
      move('bishop', { file: 4, rank: 0 }, towers, { tier: 'green' }),
    )
  })

  it('a red Pawn behaves exactly like a green Pawn', () => {
    expect(move('pawn', { file: 3, rank: 5 }, NO_TOWERS, { tier: 'red' })).toEqual(
      move('pawn', { file: 3, rank: 5 }, NO_TOWERS, { tier: 'green' }),
    )
  })
})
