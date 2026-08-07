import { describe, expect, it } from 'vitest'
import { BOARD, CORE_SQUARE } from '../data/board'
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
