import { describe, expect, it } from 'vitest'
import { commandFor, type PlayTarget } from './commandFor'
import { jokerCard, standardCard } from './fixtures'
import type { Card, Command } from './types'

const TOWER_ID = 'tower-1'

const NONE: PlayTarget = { kind: 'none' }
const TOWER_TARGET: PlayTarget = { kind: 'tower', towerId: TOWER_ID }

const FIVE = standardCard('five', 5, 'hearts')
const JACK = standardCard('jack', 'J', 'hearts')
const QUEEN = standardCard('queen', 'Q', 'diamonds')
const KING = standardCard('king', 'K', 'clubs')
const ACE = standardCard('ace', 'A', 'spades')
const JOKER = jokerCard('joker')

describe('commandFor: legal plays', () => {
  it.each<[string, Card, PlayTarget, Command]>([
    [
      'a Jack shielding a Tower',
      JACK,
      TOWER_TARGET,
      { kind: 'shieldTower', cardId: 'jack', towerId: TOWER_ID },
    ],
    [
      'a Queen adding range to a Tower',
      QUEEN,
      TOWER_TARGET,
      { kind: 'rangeTower', cardId: 'queen', towerId: TOWER_ID },
    ],
    ['a King reinforcing the Core', KING, NONE, { kind: 'reinforceCore', cardId: 'king' }],
    ['an Ace expanding the board', ACE, NONE, { kind: 'expandBoard', cardId: 'ace' }],
    ['a Joker clearing Pieces', JOKER, NONE, { kind: 'clearPieces', cardId: 'joker' }],
  ])('%s', (_label, card, target, expected) => {
    expect(commandFor(card, target)).toEqual(expected)
  })
})

describe('commandFor: illegal combinations return null', () => {
  it.each<[string, Card, PlayTarget]>([
    // A numbered Card is hand material, committed as part of a poker hand from
    // the Deck — it has no solo action under any target.
    ['a numbered Card aimed at nothing', FIVE, NONE],
    ['a numbered Card aimed at a Tower', FIVE, TOWER_TARGET],

    // Face actions need exactly their own target shape.
    ['a Jack aimed at nothing', JACK, NONE],
    ['a Queen aimed at nothing', QUEEN, NONE],
    ['a King aimed at a Tower', KING, TOWER_TARGET],
    ['an Ace aimed at a Tower', ACE, TOWER_TARGET],

    // The Joker's only play is untargeted Clear.
    ['a Joker aimed at a Tower', JOKER, TOWER_TARGET],
  ])('%s', (_label, card, target) => {
    expect(commandFor(card, target)).toBeNull()
  })
})
