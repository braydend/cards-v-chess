import { ALL_CARD_RANKS } from '../data/cards'
import type { CardRank } from '../game'

/**
 * Convert a `<select>` value back into a typed CardRank.
 *
 * A select's `event.target.value` is always a string, so a numeric rank like
 * 7 arrives as `"7"` — but `CardRank`'s buildable ranks are real numbers, and
 * `isBuildableRank` tests `typeof rank === 'number'`. Passing the raw string
 * through would build a Card whose rank is a string — neither a number (so no
 * hand ladder uses it) nor a face rank (so no face action matches). Face ranks
 * survive as themselves.
 *
 * Lookup runs through `ALL_CARD_RANKS` so the mapping and the option list can
 * never disagree — every option renders from the same array it is parsed
 * back through.
 */
export function cardRankFromSelectValue(value: string): CardRank | undefined {
  return ALL_CARD_RANKS.find((rank) => String(rank) === value)
}
