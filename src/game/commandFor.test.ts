import { describe, expect, it } from 'vitest'
import { commandFor, type PlayMode, type PlayTarget } from './commandFor'
import { jokerCard, standardCard } from './fixtures'
import type { Card, Command } from './types'

const SQUARE = { file: 2, rank: 2 }
const ECHO_SQUARE = { file: 5, rank: 5 }
const TOWER_ID = 'tower-1'
const SOURCE_TOWER_ID = 'tower-1'

const NONE: PlayTarget = { kind: 'none' }
const SQUARE_TARGET: PlayTarget = { kind: 'square', square: SQUARE }
const TOWER_TARGET: PlayTarget = { kind: 'tower', towerId: TOWER_ID }
const ECHO_TARGET: PlayTarget = { kind: 'echo', sourceTowerId: SOURCE_TOWER_ID, square: ECHO_SQUARE }

const FIVE = standardCard('five', 5, 'hearts')
const JACK = standardCard('jack', 'J', 'hearts')
const QUEEN = standardCard('queen', 'Q', 'diamonds')
const KING = standardCard('king', 'K', 'clubs')
const ACE = standardCard('ace', 'A', 'spades')
const JOKER = jokerCard('joker')

describe('commandFor: legal plays', () => {
  it.each<[string, Card, PlayMode, PlayTarget, Command]>([
    [
      'a standard Card supported onto a Tower',
      FIVE,
      'support',
      TOWER_TARGET,
      { kind: 'supportTower', cardId: 'five', towerId: TOWER_ID },
    ],
    [
      'a face Card supported onto a Tower, since suit works at every rank',
      KING,
      'support',
      TOWER_TARGET,
      { kind: 'supportTower', cardId: 'king', towerId: TOWER_ID },
    ],
    [
      'a buildable rank built on a square',
      FIVE,
      'build',
      SQUARE_TARGET,
      { kind: 'buildTower', cardId: 'five', square: SQUARE },
    ],
    [
      'a Jack shielding a Tower',
      JACK,
      'build',
      TOWER_TARGET,
      { kind: 'shieldTower', cardId: 'jack', towerId: TOWER_ID },
    ],
    [
      'a Queen echoing a Tower onto a square',
      QUEEN,
      'build',
      ECHO_TARGET,
      { kind: 'echoTower', cardId: 'queen', sourceTowerId: SOURCE_TOWER_ID, square: ECHO_SQUARE },
    ],
    ['a King reinforcing the Core', KING, 'build', NONE, { kind: 'reinforceCore', cardId: 'king' }],
    ['an Ace expanding the board', ACE, 'build', NONE, { kind: 'expandBoard', cardId: 'ace' }],
    ['a Joker clearing Pieces', JOKER, 'build', NONE, { kind: 'clearPieces', cardId: 'joker' }],
  ])('%s', (_label, card, mode, target, expected) => {
    expect(commandFor(card, mode, target)).toEqual(expected)
  })
})

describe('commandFor: illegal combinations return null', () => {
  it.each<[string, Card, PlayMode, PlayTarget]>([
    // The fall-through this fix exists to delete: Board.tsx used to build a
    // Tower for a King, Ace or Joker clicked on a square, which the engine
    // then silently refused.
    ['a King aimed at a square', KING, 'build', SQUARE_TARGET],
    ['an Ace aimed at a square', ACE, 'build', SQUARE_TARGET],
    ['a Joker aimed at a square', JOKER, 'build', SQUARE_TARGET],

    // A Joker has no suit, so support is illegal for it under every target.
    ['a Joker supported with no target', JOKER, 'support', NONE],
    ['a Joker supported onto a square', JOKER, 'support', SQUARE_TARGET],
    ['a Joker supported onto a Tower', JOKER, 'support', TOWER_TARGET],

    // Support needs a Tower target specifically, for any standard or face Card.
    ['a standard Card supported with no target', FIVE, 'support', NONE],
    ['a standard Card supported onto a square', FIVE, 'support', SQUARE_TARGET],
    ['a standard Card supported onto an echo target', FIVE, 'support', ECHO_TARGET],
    ['a face Card supported with no target', KING, 'support', NONE],
    ['a face Card supported onto a square', KING, 'support', SQUARE_TARGET],

    // Each face rank and the Joker need exactly their own target shape.
    ['a Jack aimed at a square', JACK, 'build', SQUARE_TARGET],
    ['a Jack aimed at nothing', JACK, 'build', NONE],
    ['a Jack aimed at an echo target', JACK, 'build', ECHO_TARGET],
    ['a Queen aimed at a Tower', QUEEN, 'build', TOWER_TARGET],
    ['a Queen aimed at a square', QUEEN, 'build', SQUARE_TARGET],
    ['a Queen aimed at nothing', QUEEN, 'build', NONE],
    ['a King aimed at a Tower', KING, 'build', TOWER_TARGET],
    ['a King aimed at an echo target', KING, 'build', ECHO_TARGET],
    ['an Ace aimed at a Tower', ACE, 'build', TOWER_TARGET],
    ['an Ace aimed at an echo target', ACE, 'build', ECHO_TARGET],
    ['a Joker aimed at a Tower', JOKER, 'build', TOWER_TARGET],
    ['a Joker aimed at an echo target', JOKER, 'build', ECHO_TARGET],

    // A buildable rank needs a square specifically.
    ['a buildable rank aimed at a Tower', FIVE, 'build', TOWER_TARGET],
    ['a buildable rank aimed at nothing', FIVE, 'build', NONE],
    ['a buildable rank aimed at an echo target', FIVE, 'build', ECHO_TARGET],
  ])('%s', (_label, card, mode, target) => {
    expect(commandFor(card, mode, target)).toBeNull()
  })
})
