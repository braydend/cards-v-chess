import type { Square, TowerTypeId } from '../game'

/**
 * The pending Tower's ghost: what to draw, extracted from the component for the
 * reason `boardClick.ts` gives — this project has no jsdom and no component
 * tests, so a decision left inside a `.tsx` file is a decision no test can
 * reach. Everything here is pure; `PlacementGhost.tsx` reads the stores and
 * passes what it finds in.
 */

/** How the ghost looks for one render: which Tower, and whether the square is refused. */
export interface GhostAppearance {
  readonly type: TowerTypeId
  readonly illegal: boolean
}

/**
 * Whether a ghost should render, and how.
 *
 * Null covers the two cases that look different to a player and are the same
 * here: no Tower is pending, and no square is active (nothing hovered, or on a
 * coarse pointer nothing previewed yet). Both mean "draw nothing", so both are
 * one answer.
 */
export function ghostFor(
  pendingTower: TowerTypeId | null,
  activeSquare: Square | null,
  legal: boolean,
): GhostAppearance | null {
  if (pendingTower === null || activeSquare === null) return null
  return { type: pendingTower, illegal: !legal }
}

/**
 * Exponential damp toward a target, scaled by `dt` so the trail's speed is
 * refresh-rate independent.
 *
 * `current + (target - current) * (1 - exp(-rate * dt))` — asymptotic: it
 * closes a fixed fraction of the remaining gap per unit time, so it never
 * overshoots and converges monotonically. A zero `dt` or zero `rate` moves
 * nothing.
 */
export function ease(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

const TILT_SCALE = 0.25
const MAX_TILT = 0.35

function clampTilt(value: number): number {
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, value))
}

/**
 * Lean around the x axis from a z displacement (the ghost tips forward or back
 * as it trails). Scalar so the frame loop allocates nothing; the component
 * calls `tiltX` and `tiltZ` with the per-axis displacement.
 */
export function tiltX(dz: number): number {
  return clampTilt(dz * TILT_SCALE)
}

/** Lean around the z axis from an x displacement. */
export function tiltZ(dx: number): number {
  return clampTilt(-dx * TILT_SCALE)
}
