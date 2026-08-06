import { describe, expect, it } from 'vitest'
import { createInitialState, step } from '../game'
import type { GameState } from '../game'
import { standardCard, withDeck, withTower } from '../game/fixtures'
import { DECK_CAP } from '../data/deck'
import { structuralKey } from './structuralKey'

describe('structuralKey', () => {
  it("changes when a Tower's maxHealth changes, even if health does not", () => {
    // Towers.tsx renders `tower.health / tower.maxHealth` and TowerPanel
    // prints the ceiling itself, so a maxHealth change must repaint. No play
    // moves maxHealth alone today — a ♠ moves health with it — so this state
    // is constructed by hand rather than driven through a command. It guards
    // the field the renderer reads, not a transition any card produces.
    const base = withTower(5, { file: 2, rank: 2 })
    const raisedCeiling = {
      ...base,
      towers: base.towers.map((tower) => ({ ...tower, maxHealth: tower.maxHealth + 10 })),
    }

    expect(structuralKey(raisedCeiling)).not.toBe(structuralKey(base))
  })

  it('changes when Ink changes, since the HUD prints it', () => {
    const base = createInitialState()
    const earned = { ...base, ink: base.ink + 5 }

    expect(structuralKey(earned)).not.toBe(structuralKey(base))
  })
})

describe('the Deck', () => {
  /**
   * `deck.length` used to be the whole Deck key, justified by "every card play
   * removes exactly one card". Packs falsify that: culling at the cap destroys
   * exactly as many cards as the pack deals, so the length does not move while
   * the contents change entirely.
   *
   * Keyed on length, the store would never publish and the new cards would be
   * invisible. This is the most common cull case, not an edge one.
   */
  it('changes when a cull-and-open of equal size replaces cards without moving the length', () => {
    const deck = Array.from({ length: DECK_CAP }, (_, i) => standardCard(`f${i}`, 2, 'hearts'))
    const before: GameState = { ...withDeck(deck, createInitialState('key-test')), ink: 999 }

    const after = step(before, {
      kind: 'buyPack',
      pack: 'scrap',
      cullCardIds: ['f0', 'f1', 'f2'],
    })

    expect(after.deck).toHaveLength(before.deck.length)
    expect(structuralKey(after)).not.toBe(structuralKey(before))
  })

  it('still changes when a card is played and nothing replaces it', () => {
    const before = withDeck([standardCard('five', 5, 'clubs')], createInitialState('key-test'))
    const after = step(before, { kind: 'buildTower', cardId: 'five', square: { file: 2, rank: 2 } })

    expect(structuralKey(after)).not.toBe(structuralKey(before))
  })

  it('is unchanged by a command that does not touch the Deck', () => {
    const before = createInitialState('key-test')
    const after = step(before, { kind: 'setAutoStart', enabled: true })

    expect(after.deck).toEqual(before.deck)
  })
})
