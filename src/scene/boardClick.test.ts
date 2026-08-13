import { describe, expect, it } from 'vitest'
import type { Card, CardRank, Square, Suit, Tower, TowerTypeId } from '../game'
import { resolveBoardAction, resolveBoardClick, type BoardClickContext } from './boardClick'

function towerAt(id: string, square: Square, type: TowerTypeId = 'vertical'): Tower {
  return {
    id,
    square,
    type,
    range: 5,
    fireCooldownMs: 0,
    health: 12,
    maxHealth: 12,
    damage: 1,
    fireIntervalMs: 600,
    shield: 0,
    damageTaken: 0,
    shotsFired: 0,
    kills: 0,
    upgradesSpent: 0,
    fireIntervalBaseMs: 600,
  }
}

// Two different types on purpose: the pending Tower and the J/Q target flows
// depend on which Tower was clicked, not just on whether one was.
const A = towerAt('tower-1', { file: 2, rank: 2 })
const B = towerAt('tower-2', { file: 5, rank: 6 }, 'cross')

describe('resolveBoardClick', () => {
  it('builds on an empty square', () => {
    expect(resolveBoardClick({ file: 0, rank: 0 }, [A, B], null)).toEqual({ kind: 'build' })
  })

  it('builds on an empty square even while a Tower is selected', () => {
    expect(resolveBoardClick({ file: 0, rank: 0 }, [A, B], A.id)).toEqual({ kind: 'build' })
  })

  it('selects the Tower on a square that holds one', () => {
    expect(resolveBoardClick(A.square, [A, B], null)).toEqual({
      kind: 'select',
      towerId: 'tower-1',
    })
  })

  it('deselects when the already-selected Tower is clicked again', () => {
    expect(resolveBoardClick(A.square, [A, B], A.id)).toEqual({ kind: 'deselect' })
  })

  it('switches selection when a different Tower is clicked', () => {
    expect(resolveBoardClick(B.square, [A, B], A.id)).toEqual({
      kind: 'select',
      towerId: 'tower-2',
    })
  })

  it('builds when there are no Towers at all', () => {
    expect(resolveBoardClick({ file: 2, rank: 2 }, [], null)).toEqual({ kind: 'build' })
  })
})

const EMPTY: Square = { file: 0, rank: 0 }

function card(rank: CardRank, suit: Suit = 'hearts', id = 'card-1'): Card {
  return { id, kind: 'standard', rank, suit }
}

const JOKER: Card = { id: 'card-joker', kind: 'joker' }

function click(overrides: Partial<BoardClickContext> = {}): BoardClickContext {
  return {
    square: EMPTY,
    towers: [A, B],
    selectedTowerId: null,
    card: null,
    pendingTower: null,
    pointer: 'fine',
    previewedSquare: null,
    ...overrides,
  }
}

/**
 * The composed rule where the Tower inspect panel, the pending-Tower placement
 * flow, and the card system meet on the same gesture. A pending Tower wins
 * outright — the hand was already committed, so any square click is its
 * placement. Otherwise a Card that can act on what was clicked wins, and the
 * panel gets every click no Card claims.
 */
describe('resolveBoardAction: no Card picked', () => {
  it('selects the Tower that was clicked, exactly as the panel alone did', () => {
    expect(resolveBoardAction(click({ square: A.square }))).toEqual({
      kind: 'select',
      towerId: A.id,
    })
  })

  it('deselects when the selected Tower is clicked again', () => {
    expect(resolveBoardAction(click({ square: A.square, selectedTowerId: A.id }))).toEqual({
      kind: 'deselect',
    })
  })

  it('switches selection between Towers', () => {
    expect(resolveBoardAction(click({ square: B.square, selectedTowerId: A.id }))).toEqual({
      kind: 'select',
      towerId: B.id,
    })
  })

  it('closes the panel on an empty square — there is no free placement to do instead', () => {
    expect(resolveBoardAction(click({ selectedTowerId: A.id }))).toEqual({ kind: 'deselect' })
  })
})

describe('resolveBoardAction: a pending Tower wins every square click', () => {
  it('places on an empty square', () => {
    expect(resolveBoardAction(click({ pendingTower: 'vertical' }))).toEqual({
      kind: 'play',
      command: { kind: 'placeTower', square: EMPTY },
    })
  })

  it('places on a square that holds a Tower — the engine refuses, the click is still a placement', () => {
    // The pending Tower outranks the panel: the hand is committed, so a click
    // on a Tower is a placement attempt, never a select. `placeTower` in
    // cardPlays.ts refuses the occupied square and the click is just wasted.
    expect(resolveBoardAction(click({ square: A.square, pendingTower: 'vertical' }))).toEqual({
      kind: 'play',
      command: { kind: 'placeTower', square: A.square },
    })
  })

  it('places even with a Card picked — the committed hand outranks a fresh pick', () => {
    expect(resolveBoardAction(click({ card: card('J'), pendingTower: 'ring' }))).toEqual({
      kind: 'play',
      command: { kind: 'placeTower', square: EMPTY },
    })
  })

  it('places while a Tower is selected, leaving the panel open', () => {
    expect(resolveBoardAction(click({ selectedTowerId: A.id, pendingTower: 'vertical' }))).toEqual({
      kind: 'play',
      command: { kind: 'placeTower', square: EMPTY },
    })
  })
})

describe('resolveBoardAction: J and Q act on a Tower instead of opening its panel', () => {
  it('shields the Tower when a Jack is clicked onto it', () => {
    expect(resolveBoardAction(click({ square: A.square, card: card('J') }))).toEqual({
      kind: 'play',
      command: { kind: 'shieldTower', cardId: 'card-1', towerId: A.id },
    })
  })

  it('shields even the Tower whose panel is already open', () => {
    expect(
      resolveBoardAction(click({ square: A.square, selectedTowerId: A.id, card: card('J') })),
    ).toEqual({
      kind: 'play',
      command: { kind: 'shieldTower', cardId: 'card-1', towerId: A.id },
    })
  })

  it('widens range when a Queen is clicked onto a Tower', () => {
    expect(resolveBoardAction(click({ square: A.square, card: card('Q') }))).toEqual({
      kind: 'play',
      command: { kind: 'rangeTower', cardId: 'card-1', towerId: A.id },
    })
  })

  it('widens range even for the Tower whose panel is already open', () => {
    expect(
      resolveBoardAction(click({ square: A.square, selectedTowerId: A.id, card: card('Q') })),
    ).toEqual({
      kind: 'play',
      command: { kind: 'rangeTower', cardId: 'card-1', towerId: A.id },
    })
  })
})

describe('resolveBoardAction: a Card that cannot act on the click does not consume it', () => {
  it('gives a lone numbered Card to the panel — a numbered Card is hand material, not a build', () => {
    // A numbered Card alone no longer builds: it is committed as part of a poker
    // hand. Clicking with one picked has no board action, so the panel keeps the
    // click exactly as if nothing were picked.
    expect(resolveBoardAction(click({ card: card(4) }))).toEqual({ kind: 'deselect' })
  })

  it('opens the panel when a numbered Card is clicked onto an occupied square', () => {
    expect(resolveBoardAction(click({ square: A.square, card: card(4) }))).toEqual({
      kind: 'select',
      towerId: A.id,
    })
  })

  it('opens the panel for a King, which takes no board target at all', () => {
    expect(resolveBoardAction(click({ square: A.square, card: card('K') }))).toEqual({
      kind: 'select',
      towerId: A.id,
    })
  })

  it('opens the panel for an Ace, which takes no board target at all', () => {
    expect(resolveBoardAction(click({ square: A.square, card: card('A') }))).toEqual({
      kind: 'select',
      towerId: A.id,
    })
  })

  it('opens the panel for a Joker, which is played from the Deck', () => {
    expect(resolveBoardAction(click({ square: A.square, card: JOKER }))).toEqual({
      kind: 'select',
      towerId: A.id,
    })
  })
})

describe('resolveBoardAction: coarse-pointer tap-to-preview', () => {
  const coarse = { pointer: 'coarse' as const }

  it('previews the first tap on a square instead of placing the pending Tower', () => {
    expect(resolveBoardAction(click({ ...coarse, pendingTower: 'vertical' }))).toEqual({
      kind: 'preview',
      square: EMPTY,
    })
  })

  it('places the pending Tower on the second tap on the same square', () => {
    expect(
      resolveBoardAction(
        click({ ...coarse, pendingTower: 'vertical', previewedSquare: EMPTY }),
      ),
    ).toEqual({
      kind: 'play',
      command: { kind: 'placeTower', square: EMPTY },
    })
  })

  it('re-previews a tap on a different square', () => {
    const other = { file: 4, rank: 4 }
    expect(
      resolveBoardAction(
        click({ ...coarse, pendingTower: 'vertical', previewedSquare: EMPTY, square: other }),
      ),
    ).toEqual({ kind: 'preview', square: other })
  })

  it('previews on an occupied square — the red marker is how touch shows illegality', () => {
    expect(
      resolveBoardAction(click({ ...coarse, pendingTower: 'vertical', square: A.square })),
    ).toEqual({
      kind: 'preview',
      square: A.square,
    })
  })

  it('lets the second tap on an occupied square resolve to a placement the engine will refuse', () => {
    expect(
      resolveBoardAction(
        click({
          ...coarse,
          pendingTower: 'vertical',
          square: A.square,
          previewedSquare: A.square,
        }),
      ),
    ).toEqual({
      kind: 'play',
      command: { kind: 'placeTower', square: A.square },
    })
  })

  it('never previews on a fine pointer', () => {
    expect(resolveBoardAction(click({ pendingTower: 'vertical' }))).toEqual({
      kind: 'play',
      command: { kind: 'placeTower', square: EMPTY },
    })
  })

  it('shields on a single tap — a J needs a Tower target and has no footprint to preview', () => {
    expect(resolveBoardAction(click({ ...coarse, square: A.square, card: card('J') }))).toEqual({
      kind: 'play',
      command: { kind: 'shieldTower', cardId: 'card-1', towerId: A.id },
    })
  })

  it('widens range on a single tap — a Q needs a Tower target and has no footprint to preview', () => {
    expect(resolveBoardAction(click({ ...coarse, square: A.square, card: card('Q') }))).toEqual({
      kind: 'play',
      command: { kind: 'rangeTower', cardId: 'card-1', towerId: A.id },
    })
  })

  it('does not preview for a King, which takes no board target', () => {
    expect(resolveBoardAction(click({ ...coarse, square: A.square, card: card('K') }))).toEqual({
      kind: 'select',
      towerId: A.id,
    })
  })
})
