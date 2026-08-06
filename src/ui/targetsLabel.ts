/**
 * How many Pieces one of this Tower's shots reaches, as the inspect panel
 * states it.
 *
 * This is the half of "what can this Tower attack" that the board cannot show.
 * The coverage highlight lights every square in the footprint; a shot only
 * reaches `targetsPerShot` of the Pieces standing in it, and `selectTargets` in
 * `src/game/tick.ts` picks the ones nearest the Core. The gap gets wide at the
 * top of the ladder — a rank-9 disc lights 48 squares from the middle of an 8x8
 * board and reaches 5 of the Pieces on them — so the highlight over-promises
 * unless this figure sits beside it. Those counts are placeholder balance and
 * quoted here only for scale; the tests deliberately assert against the real
 * `TOWER_RANKS` table instead.
 *
 * **Rank 10 gets its own phrasing rather than a number.** It carries
 * `Number.POSITIVE_INFINITY`, which `String` renders as `'Infinity'` — a word
 * from the language, not from the game — and `formatStat` is no help, since
 * rounding Infinity leaves it exactly where it was. "hits all per shot" was the
 * alternative and reads worse: it invites the reader to hunt for a quantity when
 * the point of rank 10 is that there is not one.
 *
 * Pure and separate from `TowerPanel.tsx` because there is no jsdom here — a
 * decision left in a `.tsx` file cannot be tested at all, and the copy for the
 * unlimited case is exactly the kind of branch that would go unnoticed if it
 * broke. Same reason `supportLabel.ts` exists. See CLAUDE.md.
 */
export function targetsLabel(targetsPerShot: number): string {
  return Number.isFinite(targetsPerShot)
    ? `hits ${targetsPerShot} per shot`
    : 'hits all in range'
}
