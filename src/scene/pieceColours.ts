/**
 * The King-buff ring at a Piece's base.
 *
 * Teal, deliberately distinct from every `TIER_COLOURS` value (a yellow-tier
 * Piece would swallow a yellow ring) and every `TOWER_COLOURS` value — the aura
 * ring must read as an aura, not as a tier marker, a Tower, or a buff of
 * another colour. `tierColours.test.ts` guards the disjointness.
 *
 * Kept in its own module rather than exported from a component file: mixing
 * component and non-component exports breaks React Fast Refresh, which shows up
 * as a full reload on every edit instead of a hot update. Same precedent
 * `rankColours.ts` already sets for the Tower side.
 */
export const BUFF_RING_COLOUR = '#22d3ee'
