import type { DodgeRecord } from '../game'

/**
 * The dodge whiff: a short flash on a Black Piece that just negated a Tower
 * shot. Presentation constants, tunable by feel — nothing in the engine reads
 * them. A dodge moves no field the renderer diffs, so unlike the Tower
 * hit-flash it cannot be diff-driven; it is read live in `useFrame` from
 * `GameState.recentDodges`.
 */
export const WHIFF_FLASH_MS = 220

export interface WhiffTracker {
  lastElapsed: number
  lastRound: number
  flashStartedAtMs: number
}

export function createWhiffTracker(): WhiffTracker {
  return { lastElapsed: -1, lastRound: -1, flashStartedAtMs: -Infinity }
}

/**
 * Advances a Piece's tracker against the dodge ring and returns the flash age
 * in milliseconds. `nowMs` is wall-clock (frame.clock.elapsedTime * 1000); the
 * records carry engine elapsed time, which is monotonic within a round — so a
 * newer `roundElapsedMs` means a newly negated shot. `roundNumber` in the
 * record keeps a previous round's dodge from re-flashing when the next round
 * reaches the same elapsed time. Mutates `tracker` in place; it lives in a ref.
 */
export function whiffAgeMs(
  tracker: WhiffTracker,
  dodges: readonly DodgeRecord[],
  pieceId: string,
  roundNumber: number,
  nowMs: number,
): number {
  let newest = -1
  for (const record of dodges) {
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

/** A scale multiplier: a brief swell on a fresh dodge, 1 otherwise. */
export function whiffScale(ageMs: number): number {
  if (ageMs < 0 || ageMs >= WHIFF_FLASH_MS) return 1
  const progress = ageMs / WHIFF_FLASH_MS
  return 1 + 0.3 * Math.cos((progress * Math.PI) / 2)
}
