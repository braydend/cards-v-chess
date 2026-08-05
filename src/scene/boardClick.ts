import { squaresEqual, type Square, type Tower } from '../game'

export type BoardClick =
  | { readonly kind: 'select'; readonly towerId: string }
  | { readonly kind: 'deselect' }
  | { readonly kind: 'build' }

/**
 * What a click on a board square means.
 *
 * Extracted from the component so the rules are testable — this project has no
 * jsdom and no component tests, so logic left inside a `.tsx` file is logic that
 * cannot be tested at all.
 *
 * Clicking a Tower selects it, clicking the selected Tower deselects it, and
 * clicking anywhere else builds as it always has. The gesture is free of
 * ambiguity because `placeTower` already refuses an occupied square, so
 * selecting could never have collided with building.
 */
export function resolveBoardClick(
  square: Square,
  towers: readonly Tower[],
  selectedTowerId: string | null,
): BoardClick {
  const tower = towers.find((candidate) => squaresEqual(candidate.square, square))
  if (!tower) return { kind: 'build' }

  return tower.id === selectedTowerId
    ? { kind: 'deselect' }
    : { kind: 'select', towerId: tower.id }
}
