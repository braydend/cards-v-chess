import type { CardRank, GameState } from '../game'

/** A Tower that has fallen, held briefly so its destruction is visible. */
export interface Ghost {
  readonly id: string
  readonly cardRank: CardRank
  readonly file: number
  readonly boardRank: number
}

/**
 * Per-Tower animation bookkeeping. Lives in a ref, never in state: it is
 * written by the frame loop, and routing it through React would be the
 * per-frame render CLAUDE.md forbids.
 *
 * It carries the Tower's square and card rank as well as its health, because a
 * destroyed Tower leaves `GameState` entirely — this record is the only place
 * the renderer still knows where it was.
 */
export interface TowerAnimation {
  cardRank: CardRank
  file: number
  boardRank: number
  lastHealth: number
  /** Set by the snapshot diff; the next frame stamps it with a clock time. */
  flashPending: boolean
  /** Clock seconds when the current flash began; -1 when idle. */
  flashStartedAt: number
}

/**
 * Reconciles animation bookkeeping against a published snapshot and returns
 * the Towers that fell. Mutates `animations` in place — seeding new records,
 * updating remembered health, and deleting the dead — but touches no React
 * and no three.js, which is what makes it testable without a renderer.
 *
 * Towers only ever die during a live round. Gating fallen Towers on
 * `phase === 'inProgress'` is what stops `reset()` — which clears the whole
 * board at once from the defeated screen — from firing a death flare for
 * every Tower the player built.
 */
export function diffTowers(
  animations: Map<string, TowerAnimation>,
  snapshot: GameState,
): Ghost[] {
  const live = new Set<string>()

  for (const tower of snapshot.towers) {
    live.add(tower.id)
    const existing = animations.get(tower.id)

    if (!existing) {
      animations.set(tower.id, {
        cardRank: tower.cardRank,
        file: tower.square.file,
        boardRank: tower.square.rank,
        lastHealth: tower.health,
        flashPending: false,
        flashStartedAt: -1,
      })
      continue
    }

    if (tower.health < existing.lastHealth) existing.flashPending = true
    existing.lastHealth = tower.health
  }

  const fallen: Ghost[] = []

  for (const [id, animation] of animations) {
    if (live.has(id)) continue
    animations.delete(id)

    if (snapshot.phase === 'inProgress') {
      fallen.push({
        id,
        cardRank: animation.cardRank,
        file: animation.file,
        boardRank: animation.boardRank,
      })
    }
  }

  return fallen
}
