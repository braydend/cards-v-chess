import { Color } from 'three'
import type { CardRank } from '../game'
import { RANK_COLOURS } from './rankColours'

/**
 * Presentation constants, tunable by feel. Nothing in the engine reads them and
 * none of them is a balance value.
 */
export const CRITICAL_HEALTH_FRACTION = 0.3
export const HIT_FLASH_MS = 150
export const DEATH_FLARE_MS = 300
export const CRITICAL_PULSE_HZ = 1.2

/** How far toward `DAMAGED` a Tower at zero health goes. Preserved exactly. */
const DAMAGE_RAMP = 0.85

const DAMAGED = new Color('#3b0d0d')
const FLASH = new Color('#fff3d0')
const CRITICAL = new Color('#ff5a4a')

/**
 * The colour a Tower should be this frame.
 *
 * Mutates and returns `target` rather than allocating — this runs once per Tower
 * per frame, and allocating in the frame loop is exactly what CLAUDE.md forbids.
 * The module-level Colours above are constructed once and only ever read.
 *
 * - `healthFraction` is `health / maxHealth`, clamped here so a caller cannot
 *   produce nonsense from a transient out-of-range value.
 * - `flashProgress` is 1 at the instant of a hit and 0 once the flash expires.
 * - `criticalPhase` is elapsed time in *cycles* (seconds × CRITICAL_PULSE_HZ).
 *   Ignored unless health is under CRITICAL_HEALTH_FRACTION.
 */
export function towerColour(
  target: Color,
  cardRank: CardRank,
  healthFraction: number,
  flashProgress: number,
  criticalPhase: number,
): Color {
  const health = Math.min(1, Math.max(0, healthFraction))

  target.set(RANK_COLOURS[cardRank])
  target.lerp(DAMAGED, (1 - health) * DAMAGE_RAMP)

  if (health < CRITICAL_HEALTH_FRACTION) {
    // Sine rather than a sawtooth so the pulse eases at both ends instead of
    // snapping, which reads as a heartbeat rather than a strobe.
    const pulse = (Math.sin(criticalPhase * Math.PI * 2) + 1) / 2
    target.lerp(CRITICAL, pulse * 0.6)
  }

  if (flashProgress > 0) {
    target.lerp(FLASH, Math.min(1, flashProgress))
  }

  return target
}
