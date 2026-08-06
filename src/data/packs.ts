import type { CardRank } from '../game/types'

/**
 * Pack balance.
 *
 * **Every price and weight here is a PLACEHOLDER**, in exactly the sense
 * `src/data/ink.ts` means it. Ink's worth is set by what it buys and packs are
 * what buy it, so prices and Ink income have to be tuned against each other in
 * one pass — see "Pack weighting and prices" and "Ink income values" in the
 * design doc's open questions. Both remain open. Numbers exist here because a
 * purchase cannot happen without them, not because they are right.
 *
 * The **sizes** are not placeholders. They come from the design doc's pack table
 * and the cull arithmetic depends on them.
 */

export type PackType = 'scrap' | 'base' | 'court' | 'suited'

/** Display order, and the only list of pack types anything should iterate. */
export const PACK_TYPES: readonly PackType[] = ['scrap', 'base', 'court', 'suited']

/**
 * Rarity is rank, in three tiers.
 *
 * `common` is FLAT across 2-10: a 10 is no scarcer than a 2. The rank ladder
 * already separates those nine cards by geometry, range and damage, so charging
 * scarcity for them as well would double-count the same difference.
 */
export type RarityTier = 'common' | 'scarce' | 'rarest'

/** PLACEHOLDER. The pull weight of one card in each tier. */
export const TIER_WEIGHTS: Record<RarityTier, number> = {
  common: 12,
  scarce: 3,
  rarest: 1,
}

/**
 * Which tier a rank sits in.
 *
 * The Ace is alone in `rarest` because caps on the King and Ace hazards were
 * deliberately deferred, which leaves scarcity as the only restraint on board
 * growth.
 *
 * The Joker sits with the face cards rather than below them. It is the only
 * answer to a repair-versus-the-wall stall, and making the escape hatch the
 * hardest card in the game to obtain would be a trap.
 */
export function tierOf(rank: CardRank | 'joker'): RarityTier {
  if (rank === 'A') return 'rarest'
  if (rank === 'J' || rank === 'Q' || rank === 'K' || rank === 'joker') return 'scarce'

  return 'common'
}

export interface PackDef {
  readonly label: string
  /** How many cards it deals. Not a placeholder — the cull maths reads it. */
  readonly size: number
  /** PLACEHOLDER price, in Ink. */
  readonly price: number
  /** Whether it deals a single suit of the player's choosing. */
  readonly suited: boolean
  /**
   * Multipliers on `TIER_WEIGHTS`, per tier. 1 leaves the base table alone.
   *
   * `rarest` is 1 in every pack, on purpose. Court is "weighted toward high
   * ranks", and it must not become "buy this for better Ace odds" — see
   * `tierOf` for why Ace scarcity is load-bearing rather than cosmetic.
   */
  readonly tierBoost: Record<RarityTier, number>
}

const FLAT: Record<RarityTier, number> = { common: 1, scarce: 1, rarest: 1 }

export const PACKS: Record<PackType, PackDef> = {
  scrap: {
    label: 'Scrap',
    size: 3,
    price: 15,
    suited: false,
    tierBoost: FLAT,
  },
  base: {
    label: 'Base',
    size: 10,
    price: 40,
    suited: false,
    tierBoost: FLAT,
  },
  court: {
    label: 'Court',
    size: 10,
    price: 85,
    suited: false,
    // Shifts mass into the scarce tier — it does not exclude 2-10, so a Court
    // is better odds and never a guarantee.
    tierBoost: { common: 1, scarce: 5, rarest: 1 },
  },
  suited: {
    label: 'Suited',
    size: 10,
    price: 60,
    // The only pack that lets a player commit to a strategy rather than simply
    // get better numbers.
    suited: true,
    tierBoost: FLAT,
  },
}
