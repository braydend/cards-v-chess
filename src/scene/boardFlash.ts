import type { BoardSpec } from '../game'

/**
 * Presentation constant, tunable by feel. PLACEHOLDER, and nothing in the
 * engine reads it.
 */
export const CLEAR_FLASH_MS = 300

const FLASH_SECONDS = CLEAR_FLASH_MS / 1000

/**
 * A Joker's Clear, as one white pulse over the whole board.
 *
 * A board-wide flash rather than a burst per Piece, so a burst keeps meaning
 * "a Tower did that" and the rarest card in the Deck gets its own signal rather
 * than fifteen copies of a common one.
 */
export interface BoardFlash {
  /** Clock seconds when the Clear resolved. */
  readonly startedAt: number
}

/** Whether this flash still has anything to draw. */
export function isFlashLive(flash: BoardFlash, now: number): boolean {
  return now - flash.startedAt < FLASH_SECONDS
}

/**
 * Adds a uniform white contribution to every square in `out`, three floats per
 * square, indexed row-major by board rank then file — the same layout
 * `accumulatePulses` writes, so the two sum into one buffer and one draw.
 *
 * ADDITIVE, and it deliberately does NOT zero the buffer: `accumulatePulses`
 * owns that and runs first, so zeroing here would erase every pulse in flight
 * the moment a Joker was played. Writes only within the board's own region,
 * which is what keeps it inside the buffer at any board size. Allocates nothing.
 */
export function accumulateBoardFlash(
  out: Float32Array,
  board: BoardSpec,
  flash: BoardFlash | null,
  now: number,
): void {
  if (!flash) return

  const age = now - flash.startedAt
  if (age < 0 || age >= FLASH_SECONDS) return

  const intensity = 1 - age / FLASH_SECONDS
  // White, so all three channels take the same value and one loop covers them.
  const channels = board.files * board.ranks * 3

  for (let index = 0; index < channels; index += 1) {
    // `?? 0` because `noUncheckedIndexedAccess` types this read as
    // `number | undefined`, and this codebase has no non-null assertions.
    out[index] = (out[index] ?? 0) + intensity
  }
}
