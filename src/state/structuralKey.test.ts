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
   * the contents change entirely. Keyed on length, the store would never publish
   * and the new cards would be invisible.
   *
   * Deliberately does NOT go through `buyPack`. A purchase also moves `ink`,
   * which is itself part of the key, so a purchase-driven test passes on the ink
   * term alone — it would keep passing with the Deck keyed on length again,
   * which is exactly how this test was originally written and exactly why it
   * pinned nothing. These two states are built by hand so the Deck is the only
   * thing that differs.
   */
  it('changes when two same-length Decks hold different cards', () => {
    const before = withDeck(
      [standardCard('a', 2, 'hearts'), standardCard('b', 3, 'hearts')],
      createInitialState('key-test'),
    )
    const after = withDeck(
      [standardCard('c', 2, 'hearts'), standardCard('d', 3, 'hearts')],
      createInitialState('key-test'),
    )

    expect(after.deck).toHaveLength(before.deck.length)
    expect(structuralKey(after)).not.toBe(structuralKey(before))
  })

  it('survives a real cull-and-open at the cap, where the Deck length cannot move', () => {
    const deck = Array.from({ length: DECK_CAP }, (_, i) => standardCard(`f${i}`, 2, 'hearts'))
    const before: GameState = { ...withDeck(deck, createInitialState('key-test')), ink: 999 }

    const after = step(before, {
      kind: 'buyPack',
      pack: 'scrap',
      cullCardIds: ['f0', 'f1', 'f2'],
    })

    // The trigger: same length, entirely different contents.
    expect(after.deck).toHaveLength(before.deck.length)
    expect(after.deck.map((card) => card.id)).not.toEqual(before.deck.map((card) => card.id))
    // Holding ink equal leaves the Deck as the only term that can move, so this
    // is a genuine end-to-end pin rather than a restatement of the fixture —
    // keyed on length again, both keys would come out identical.
    expect(structuralKey({ ...after, ink: before.ink })).not.toBe(structuralKey(before))
  })

  it('still changes when a card is played and nothing replaces it', () => {
    const before = withDeck([standardCard('five', 5, 'clubs')], createInitialState('key-test'))
    const after = step(before, { kind: 'buildTower', cardId: 'five', square: { file: 2, rank: 2 } })

    expect(structuralKey(after)).not.toBe(structuralKey(before))
  })
})
