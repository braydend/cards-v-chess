/**
 * Ink income balance.
 *
 * Every value here is a PLACEHOLDER. Ink's worth is set by what it buys, and
 * packs do not exist yet, so none of these can be validated until prices do —
 * see "Ink income values" in game-design.md's open questions, which is to be
 * resolved together with "Pack weighting and prices".
 *
 * Kill rewards are not here: they live on `PIECE_TYPES`, beside the rest of a
 * Piece's stats, so a Piece's whole balance profile reads in one place.
 */

/** Paid on every round completion, whatever the round number. */
export const ROUND_INCOME_BASE = 10

/**
 * Added per round completed, so a round pays
 * `ROUND_INCOME_BASE + roundNumber * ROUND_INCOME_PER_ROUND`.
 *
 * Scaling rather than flat because rounds grow — round 11 spawns 13 Pieces —
 * so a fixed payout would shrink in real terms exactly as the pressure rises.
 */
export const ROUND_INCOME_PER_ROUND = 5

/**
 * The share of kill rewards a Joker's Clear pays for what it destroyed.
 *
 * A quarter rather than the full amount. Clear is the safety valve for a
 * repair-versus-the-wall stall, and paying full would make holding a Joker
 * while the board fills the single best way to earn — an income exploit, not
 * an escape hatch.
 */
export const JOKER_CLEAR_SHARE = 0.25
