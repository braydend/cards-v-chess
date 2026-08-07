/**
 * Formats an engine number for display.
 *
 * Engine damage to a Tower is `attackDamage × BLOCKED_ATTACK_MULTIPLIER` for a
 * Pawn blocked straight ahead, and full `attackDamage` for every other blocked
 * Piece — both can be floats.
 * The Pawn's `2 × 0.5` happens to land on a clean 1, but any Piece with an odd
 * attack damage will not, and repeated float subtraction drifts — a Tower can
 * reach 8.999999999999998 health. Round to one decimal and let `String` drop a
 * trailing `.0`, so the panel never shows the drift.
 */
export function formatStat(value: number): string {
  return String(Math.round(value * 10) / 10)
}
