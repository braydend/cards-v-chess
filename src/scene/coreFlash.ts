import { Color } from 'three'

/**
 * When the Core was last struck, in clock seconds. -1 means idle, exactly as
 * `TowerAnimation.flashStartedAt` does.
 *
 * Mutable, and shared by reference: `GameScene` owns it, a leak impact stamps it
 * at the moment it lands, and `Core` reads it in its own frame loop. Stamped by
 * the impact rather than derived from `core.health` deliberately — health drops
 * the instant the leak resolves, a whole lunge before anything arrives, so
 * flashing on it would show the Core flinching from a blow that has not landed.
 */
export interface CoreFlash {
  startedAt: number
}

/**
 * Presentation constants, tunable by feel. PLACEHOLDERS, and nothing in the
 * engine reads them.
 *
 * `CORE_CRITICAL_FRACTION` is not a placeholder in the same sense: it preserves
 * the 0.3 threshold `Core.tsx` already used, so an unflashed Core looks exactly
 * as it did before this module existed.
 */
export const CORE_FLASH_MS = 200
export const CORE_CRITICAL_FRACTION = 0.3

const HEALTHY = new Color('#f4d03f')
const CRITICAL = new Color('#7b241c')
const FLASH = new Color('#fff8e0')

/**
 * The colour the Core should be this frame.
 *
 * Mutates and returns `target` rather than allocating, exactly as `towerColour`
 * does — this runs once a frame for the lifetime of the run. The module-level
 * Colours above are constructed once and only ever read.
 *
 * `healthFraction` is `health / maxHealth`, clamped here so a caller cannot
 * produce nonsense from a transient out-of-range value. `flashProgress` is 1 at
 * the instant of impact and 0 once the flash expires.
 */
export function coreColour(target: Color, healthFraction: number, flashProgress: number): Color {
  const health = Math.min(1, Math.max(0, healthFraction))

  // `>`, not `>=`: the declarative version this replaces read
  // `healthFraction > 0.3`, so the threshold itself was already critical.
  target.copy(health > CORE_CRITICAL_FRACTION ? HEALTHY : CRITICAL)

  if (flashProgress > 0) target.lerp(FLASH, Math.min(1, flashProgress))

  return target
}

/**
 * `emissiveIntensity` for the Core.
 *
 * The unflashed term is preserved exactly from the declarative version:
 * `0.25 + healthFraction * 0.5`. The flash adds on top, so a strike reads as a
 * burst of light rather than only a hue change.
 */
export function coreEmissiveIntensity(healthFraction: number, flashProgress: number): number {
  const health = Math.min(1, Math.max(0, healthFraction))
  const flash = Math.min(1, Math.max(0, flashProgress))

  return 0.25 + health * 0.5 + flash * 1.5
}

/** Flash progress from a stamp: 1 at impact, 0 once spent, 0 while idle. */
export function flashProgressAt(startedAt: number, now: number): number {
  if (startedAt < 0) return 0

  return Math.max(0, 1 - (now - startedAt) / (CORE_FLASH_MS / 1000))
}
