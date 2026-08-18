import { describe, expect, it } from 'vitest'
import { createInitialState, step } from '../game'
import type { GameState } from '../game'
import { firstTower, standardCard, withDeck, withTower } from '../game/fixtures'
import { DECK_CAP } from '../data/deck'
import { structuralKey } from './structuralKey'

describe('structuralKey', () => {
  it("changes when a Tower's maxHealth changes, even if health does not", () => {
    // Towers.tsx renders `tower.health / tower.maxHealth` and TowerPanel
    // prints the ceiling itself, so a maxHealth change must repaint. No play
    // moves maxHealth alone today — a ♠ moves health with it — so this state
    // is constructed by hand rather than driven through a command. It guards
    // the field the renderer reads, not a transition any card produces.
    const base = withTower('vertical', { file: 2, rank: 2 })
    const raisedCeiling = {
      ...base,
      towers: base.towers.map((tower) => ({ ...tower, maxHealth: tower.maxHealth + 10 })),
    }

    expect(structuralKey(raisedCeiling)).not.toBe(structuralKey(base))
  })

  it('changes when an upgrade is spent, since the spend mutates keyed stats', () => {
    // A spend writes `damage`, `fireIntervalMs`, `maxHealth` or `health`, all
    // keyed — so the panel republishes on the spend itself, and the pending
    // balance (derived from `kills` and the sum of `upgradeCounts`, neither keyed) is
    // recomputed on the same publish.
    const base = withTower('vertical', { file: 2, rank: 2 })
    const withKills = {
      ...base,
      towers: base.towers.map((tower) => ({ ...tower, kills: 10 })),
    }

    const upgraded = step(withKills, {
      kind: 'upgradeTower',
      towerId: firstTower(withKills).id,
      stat: 'damage',
    })

    expect(upgraded).not.toBe(withKills)
    expect(structuralKey(upgraded)).not.toBe(structuralKey(withKills))
  })

  it("changes when pendingTower changes, even though nothing else in the key does", () => {
    // The build preview lives on `pendingTower`, so committing a hand must
    // repaint on its own — not as a side effect of the Deck shrinking. No play
    // moves `pendingTower` alone: a commit also empties the Deck ids and a
    // placement also grows the `towers` string, so the playHand/placeTower test
    // in `the Deck` block would stay green with `pendingTower` dropped from the
    // key. This state is constructed by hand, like the maxHealth test above, so
    // the key depends on `pendingTower` alone.
    const committed = step(
      withDeck([standardCard('five', 5, 'clubs')], createInitialState('key-test')),
      { kind: 'playHand', cardIds: ['five'] },
    )
    expect(committed.pendingTower).not.toBeNull()
    const cleared = { ...committed, pendingTower: null }

    expect(structuralKey(committed)).not.toBe(structuralKey(cleared))
  })

  it('changes when Ink changes, since the HUD prints it', () => {
    const base = createInitialState()
    const earned = { ...base, ink: base.ink + 5 }

    expect(structuralKey(earned)).not.toBe(structuralKey(base))
  })

  it('changes when pack purchases move, since the shop prices from them', () => {
    const base = createInitialState('key-test')
    const purchased = { ...base, packPurchases: { ...base.packPurchases, scrap: 1 } }

    expect(structuralKey(purchased)).not.toBe(structuralKey(base))
  })

  it('ignores recentExits and clears, which add no publish of their own', () => {
    // Every real exit already changes this key some other way: a leak moves
    // `leaks` and `core.health`, a kill and a promotion move the pieces string,
    // and a Clear empties it and removes the consumed Joker from the deck ids.
    // Keying these two as well would add a per-leak string for no new publish —
    // and `simulation.test.ts`'s bound of 60 publishes per 600 frames depends on
    // this design adding none.
    const base = createInitialState()
    const recorded: GameState = {
      ...base,
      recentExits: [
        { pieceId: 'leaker', typeId: 'pawn', reason: 'leak', from: { file: 3, rank: 1 } },
      ],
      clears: base.clears + 1,
    }

    expect(structuralKey(recorded)).toBe(structuralKey(base))
  })

  it('ignores recentMisses, which add no publish of their own', () => {
    // A miss changes nothing else in the key — the Piece keeps its square,
    // health, and flags — so keying the ring would publish a store update for
    // every undetected shot. The renderer reads the ring live in useFrame instead.
    const base = createInitialState()
    const recorded: GameState = {
      ...base,
      recentMisses: [{ pieceId: 'sneak', roundNumber: 1, roundElapsedMs: 400 }],
    }

    expect(structuralKey(recorded)).toBe(structuralKey(base))
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
    // Holding ink and packPurchases equal leaves the Deck as the only term that
    // can move, so this is a genuine end-to-end pin rather than a restatement
    // of the fixture — keyed on length again, both keys would come out identical.
    expect(
      structuralKey({ ...after, ink: before.ink, packPurchases: before.packPurchases }),
    ).not.toBe(structuralKey(before))
  })

  it('still changes when a hand is committed and again when it is placed', () => {
    const before = withDeck([standardCard('five', 5, 'clubs')], createInitialState('key-test'))
    const committed = step(before, { kind: 'playHand', cardIds: ['five'] })
    const placed = step(committed, { kind: 'placeTower', square: { file: 2, rank: 2 } })

    // The commit changes the Deck ids and `pendingTower`, the placement adds a
    // Tower — each move must repaint on its own.
    expect(structuralKey(committed)).not.toBe(structuralKey(before))
    expect(structuralKey(placed)).not.toBe(structuralKey(committed))
  })
})
