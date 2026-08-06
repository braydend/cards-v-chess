import { describe, expect, it } from 'vitest'
import type { Card, CardRank, Square, Suit, Tower } from '../game'
import { resolveBoardAction, resolveBoardClick, type BoardClickContext } from './boardClick'

function towerAt(id: string, square: Square): Tower {
  return {
    id,
    square,
    cardRank: 3,
    fireCooldownMs: 0,
    health: 12,
    maxHealth: 12,
    damage: 1,
    fireIntervalMs: 600,
    shield: 0,
    damageTaken: 0,
  }
}

const A = towerAt('tower-1', { file: 2, rank: 2 })
const B = towerAt('tower-2', { file: 5, rank: 6 })

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
    playMode: 'build',
    echoSourceTowerId: null,
    ...overrides,
  }
}

/**
 * The composed rule where the Tower inspect panel and the card system meet on
 * the same gesture: a Card that can act on what was clicked wins, and the panel
 * gets every click no Card claims.
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

describe('resolveBoardAction: a Card whose play targets a Tower beats inspecting', () => {
  it('supports the Tower rather than opening its panel', () => {
    expect(
      resolveBoardAction(
        click({ square: A.square, card: card(7, 'hearts'), playMode: 'support' }),
      ),
    ).toEqual({
      kind: 'play',
      command: { kind: 'supportTower', cardId: 'card-1', towerId: A.id },
    })
  })

  it('supports even the Tower whose panel is already open', () => {
    expect(
      resolveBoardAction(
        click({
          square: A.square,
          selectedTowerId: A.id,
          card: card(7, 'hearts'),
          playMode: 'support',
        }),
      ),
    ).toEqual({
      kind: 'play',
      command: { kind: 'supportTower', cardId: 'card-1', towerId: A.id },
    })
  })

  it('shields the Tower when a Jack is played for its rank', () => {
    expect(resolveBoardAction(click({ square: A.square, card: card('J') }))).toEqual({
      kind: 'play',
      command: { kind: 'shieldTower', cardId: 'card-1', towerId: A.id },
    })
  })

  it('picks a Queen’s Echo source instead of selecting the Tower', () => {
    expect(resolveBoardAction(click({ square: A.square, card: card('Q') }))).toEqual({
      kind: 'pickEchoSource',
      towerId: A.id,
    })
  })

  it('echoes onto an empty square once the source is picked', () => {
    expect(
      resolveBoardAction(click({ card: card('Q'), echoSourceTowerId: A.id })),
    ).toEqual({
      kind: 'play',
      command: { kind: 'echoTower', cardId: 'card-1', sourceTowerId: A.id, square: EMPTY },
    })
  })
})

describe('resolveBoardAction: a Card that cannot act on the click does not consume it', () => {
  it('opens the panel when a rank Card is clicked onto an occupied square', () => {
    // A rank Card builds, and it cannot build where a Tower already stands, so
    // the click falls through to the panel rather than being swallowed.
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

  it('opens the panel for a Joker, which is played from the Deck', () => {
    expect(resolveBoardAction(click({ square: A.square, card: JOKER }))).toEqual({
      kind: 'select',
      towerId: A.id,
    })
  })

  it('closes the panel when a support Card is clicked onto an empty square', () => {
    expect(
      resolveBoardAction(
        click({ selectedTowerId: A.id, card: card(7, 'hearts'), playMode: 'support' }),
      ),
    ).toEqual({ kind: 'deselect' })
  })

  it('closes the panel when a Queen with no source yet is clicked onto an empty square', () => {
    expect(
      resolveBoardAction(click({ selectedTowerId: A.id, card: card('Q') })),
    ).toEqual({ kind: 'deselect' })
  })

  it('refuses to support a Joker — it has no suit', () => {
    expect(
      resolveBoardAction(click({ square: A.square, card: JOKER, playMode: 'support' })),
    ).toEqual({ kind: 'select', towerId: A.id })
  })
})

describe('resolveBoardAction: building', () => {
  it('builds on an empty square with a rank Card picked', () => {
    expect(resolveBoardAction(click({ card: card(4) }))).toEqual({
      kind: 'play',
      command: { kind: 'buildTower', cardId: 'card-1', square: EMPTY },
    })
  })

  it('leaves an open panel alone while building elsewhere', () => {
    // Deliberate: a play never touches the panel, so repairing the inspected
    // Tower and watching its health climb works. Only a click that claims
    // nothing closes it.
    expect(resolveBoardAction(click({ card: card(4), selectedTowerId: A.id }))).toEqual({
      kind: 'play',
      command: { kind: 'buildTower', cardId: 'card-1', square: EMPTY },
    })
  })

  it('builds on any empty square when the board holds no Towers at all', () => {
    expect(resolveBoardAction(click({ towers: [], card: card(10) }))).toEqual({
      kind: 'play',
      command: { kind: 'buildTower', cardId: 'card-1', square: EMPTY },
    })
  })
})
