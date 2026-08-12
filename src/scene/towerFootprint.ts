import { towerType } from '../data/towerTypes'
import {
  reachableSquares,
  squareKey,
  squaresEqual,
  type BoardSpec,
  type Square,
  type Tower,
  type TowerTypeId,
} from '../game'

/**
 * What the selected-Tower coverage overlay draws.
 *
 * Extracted from `TowerCoverage.tsx` for the reason `boardClick.ts` gives: this
 * project has no jsdom and no component tests, so a decision left inside a
 * `.tsx` file is a decision no test can reach. Everything here is pure — the
 * component reads the two stores and passes what it finds in.
 *
 * Split into two functions rather than the one it looks like it needs, and the
 * split is not stylistic. The footprint is memoised in the component, and the
 * memo has to key on values that change only when the footprint changes: a
 * published snapshot carries a fresh `towers` array on every tick that moves a
 * cooldown, so a memo keyed on the array itself would recompute up to a hundred
 * squares every time any Piece hopped or any Tower was hit. `coverageSelection`
 * reduces the selection to the four scalars that actually shape a footprint;
 * `selectedFootprint` turns those into squares. The scalars are the memo's
 * dependencies, which is why they are scalars.
 */

/**
 * Everything about a selected Tower that shapes its footprint, and nothing else.
 *
 * `file` and `boardRank` rather than a `Square` because a fresh `Square` object
 * on every render would defeat the memo this type exists to serve. The name
 * `boardRank` keeps it apart from a card's rank — CLAUDE.md's warning about the
 * two meanings of "rank" applies with force in a type that also carries a
 * Tower's `type`.
 *
 * `type` picks the geometry from the tower table; `range` is the live instance
 * field, not the table's, because a Queen's action moves it. Both come from the
 * Tower object, read in `coverageSelection`.
 *
 * Deliberately does **not** carry health, shield or damage. Those change
 * constantly and none of them moves a covered square, so leaving them out is
 * what makes a hit cost the overlay nothing.
 */
export interface CoverageSelection {
  readonly type: TowerTypeId
  readonly range: number
  readonly file: number
  readonly boardRank: number
}

/**
 * The squares of every standing Tower, sorted into a canonical order.
 *
 * The blocker set for a Tower's footprint and its shots. Sorted so the list's
 * identity — not any particular insertion order — is what changes, which is
 * what lets the component memoise the footprint on this list via
 * `squaresListsEqual`: two publishes that only moved a Piece or a cooldown
 * produce the same sorted squares, so the same list.
 *
 * The sort is string (lexicographic) order on `squareKey` on purpose — any
 * deterministic total order gives the identity-stable memo signature, so a
 * future "fix" to numeric order would churn the ordering for no benefit.
 */
export function blockerSquares(towers: readonly Tower[]): Square[] {
  return [...towers]
    .map((tower) => tower.square)
    .sort((a, b) => (squareKey(a) < squareKey(b) ? -1 : 1))
}

/**
 * Element-wise equality for two square lists, for a store selector.
 *
 * `createWithEqualityFn` keeps the previous selector value when the equality
 * function says the new one is equal, so a selector that returns
 * `blockerSquares(towers)` with this as its equality fn hands back the
 * SAME array reference across publishes where no Tower was built or destroyed.
 * The footprint memo keys on that reference, so a hit or a cooldown tick costs
 * it nothing — the property the scalars in `CoverageSelection` exist to
 * preserve.
 */
export function squaresListsEqual(a: readonly Square[], b: readonly Square[]): boolean {
  if (a.length !== b.length) return false

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]
    const right = b[index]
    if (left === undefined || right === undefined || !squaresEqual(left, right)) return false
  }

  return true
}

/**
 * The squares an overlay should draw for a Tower of this type with this range
 * from `from`, given the standing layout.
 *
 * One role, so one answer: every Tower's value is its shot, so every overlay
 * draws `reachableSquares` — a square the Tower can see but cannot hit (another
 * Tower strictly between) is not lit. Auras are gone, and the old split between
 * a shot-zone footprint and an aura-field footprint is gone with them. One
 * function so the amber footprint and the teal preview cannot disagree, either
 * with each other or with the type's role.
 *
 * Geometry comes from `towerType(type)`; range is passed in, never read from
 * the table, because a Queen's action moves it onto the instance.
 */
export function overlaySquares(
  board: BoardSpec,
  type: TowerTypeId,
  range: number,
  from: Square,
  blockers: readonly Square[],
): Square[] {
  return reachableSquares(board, towerType(type).geometry, range, from, blockers)
}

export interface TowerFootprint {
  /** The selected Tower's own square, which is never in `covered`. */
  readonly origin: Square
  readonly covered: readonly Square[]
}

/**
 * The selected Tower reduced to what the overlay needs, or null when there is
 * nothing to draw.
 *
 * Null covers two cases that look different to a player and are the same here:
 * no Tower is selected, and the selected Tower has been destroyed while its
 * panel was open. A destroyed Tower simply stops being found in the list, so the
 * overlay clears itself with no cleanup, no effect, and no stale id to
 * invalidate — Tower ids are never reused within a run.
 */
export function coverageSelection(
  towers: readonly Tower[],
  selectedTowerId: string | null,
): CoverageSelection | null {
  if (selectedTowerId === null) return null

  const tower = towers.find((candidate) => candidate.id === selectedTowerId)
  if (!tower) return null

  return { type: tower.type, range: tower.range, file: tower.square.file, boardRank: tower.square.rank }
}

/**
 * Every square the selected Tower covers, or null when nothing is selected.
 *
 * Geometry comes from `towerType(type)`; range is a live instance field, read
 * off the Tower in `coverageSelection` and passed in here — a Queen's action
 * moves it, so the table's value is a baseline, never the answer. That is the
 * same source `fireTowers` reads on every shot; see `overlaySquares` for how
 * the two agree.
 *
 * The squares come from `overlaySquares`, the one place that decides what an
 * overlay draws per type. Every type gets the engine's `reachableSquares`,
 * which is the list form of `coversSquare` + `isOccluded` — the exact answer
 * `fireTowers` gets before it shoots. That is the whole point of the overlay:
 * the highlight the player reads and the shot the Tower takes cannot disagree,
 * because there is one answer and both ask for it. A blocked square is a square
 * the Tower can see but cannot hit, so it is not lit.
 *
 * Takes the four fields positionally, each admitting `undefined`, rather than a
 * `Partial<CoverageSelection>`. The component reads them off a possibly-null
 * `CoverageSelection` with `?.` so it can feed them to a memo one at a time, so
 * `undefined` is genuinely reachable and means the same as no selection: draw
 * nothing. Deciding that here rather than in the component is what keeps it
 * testable. `Partial` would say the same thing far more weakly — every field
 * optional means a caller that forgets one still compiles, and if a fifth
 * footprint-shaping field is ever added every call site would silently pass
 * `undefined` for it while `exhaustive-deps` still read as satisfied. Positional
 * parameters make that a compile error at every call site instead.
 */
export function selectedFootprint(
  board: BoardSpec,
  type: TowerTypeId | undefined,
  range: number | undefined,
  file: number | undefined,
  boardRank: number | undefined,
  blockers: readonly Square[],
): TowerFootprint | null {
  if (type === undefined || range === undefined || file === undefined || boardRank === undefined) {
    return null
  }

  const origin: Square = { file, rank: boardRank }

  return { origin, covered: overlaySquares(board, type, range, origin, blockers) }
}
