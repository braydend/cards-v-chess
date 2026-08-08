import type { MissRecord } from '../game'

/**
 * The cloak-flicker: a brief alpha dip on a Black Piece a Tower just failed to
 * detect. Presentation constants, tunable by feel — nothing in the engine reads
 * them. A miss moves no field the renderer diffs, so unlike the Tower hit-flash
 * it cannot be diff-driven; it is read live in `useFrame` from
 * `GameState.recentMisses`.
 */
export const CLOAK_FLASH_MS = 220

export interface CloakTracker {
  lastElapsed: number
  lastRound: number
  flashStartedAtMs: number
}

export function createCloakTracker(): CloakTracker {
  return { lastElapsed: -1, lastRound: -1, flashStartedAtMs: -Infinity }
}

/**
 * Advances a Piece's tracker against the miss ring and returns the flash age
 * in milliseconds. `nowMs` is wall-clock (frame.clock.elapsedTime * 1000); the
 * records carry engine elapsed time, which is monotonic within a round — so a
 * newer `roundElapsedMs` means a newly undetected shot. `roundNumber` in the
 * record keeps a previous round's miss from re-flashing when the next round
 * reaches the same elapsed time. Mutates `tracker` in place; it lives in a ref.
 */
export function cloakAgeMs(
  tracker: CloakTracker,
  misses: readonly MissRecord[],
  pieceId: string,
  roundNumber: number,
  nowMs: number,
): number {
  let newest = -1
  for (const record of misses) {
    if (record.pieceId !== pieceId || record.roundNumber !== roundNumber) continue
    if (record.roundElapsedMs > newest) newest = record.roundElapsedMs
  }

  if (roundNumber !== tracker.lastRound) {
    tracker.lastRound = roundNumber
    tracker.lastElapsed = -1
  }

  if (newest > tracker.lastElapsed) {
    tracker.lastElapsed = newest
    tracker.flashStartedAtMs = nowMs
  }

  return nowMs - tracker.flashStartedAtMs
}

/**
 * An opacity multiplier: a dip toward partial transparency on a fresh miss, 1
 * otherwise. The dip bottoms out at ~35% opacity at the window's midpoint and
 * eases back to full by the end, reading as a "cloaking hiccup" rather than a
 * pulse. Composition: this modulates opacity, while the health-shrink and the
 * promotion pop keep modulating scale — independent axes.
 */
export function cloakOpacity(ageMs: number): number {
  if (ageMs < 0 || ageMs >= CLOAK_FLASH_MS) return 1
  const progress = ageMs / CLOAK_FLASH_MS
  return 1 - 0.65 * Math.sin(progress * Math.PI)
}
