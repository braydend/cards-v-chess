/**
 * How many Pieces one of this Tower's shots reaches, as the inspect panel
 * states it — or `null` for a Tower that never shoots at all.
 *
 * This is the half of "what can this Tower attack" that the board cannot show.
 * The coverage highlight lights every square in the footprint; a shot only
 * reaches `targetsPerShot` of the Pieces standing in it, and `selectTargets` in
 * `src/game/tick.ts` picks the ones nearest the Core. The gap gets wide up the
 * ladder — a rank-9 Freezer lights a 5x5 disc and reaches 3 of the Pieces on it
 * — so the highlight over-promises unless this figure sits beside it. Those
 * counts are placeholder balance and quoted only for scale; the tests
 * deliberately assert against the real `TOWER_RANKS` table instead.
 *
 * **The Wall returns null, and the panel prints nothing.** Rank 7 has no gun:
 * `targetsPerShot` is 0, and "hits 0 per shot" would be a statistic about
 * shooting on a Tower whose whole design is that it does not shoot. The geometry
 * line already says "Never fires — it blocks and soaks", which is the true and
 * sufficient statement. Returning a string here — even an accurate one — would
 * either repeat that line or invite the reader to look for a gun.
 *
 * **Rank 10 gets its own phrasing rather than a number.** It carries
 * `Number.POSITIVE_INFINITY`, which `String` renders as `'Infinity'` — a word
 * from the language, not from the game — and `formatStat` is no help, since
 * rounding Infinity leaves it exactly where it was. "hits all per shot" was the
 * alternative and reads worse: it invites the reader to hunt for a quantity when
 * the point of the toll gate is that there is not one.
 *
 * Pure and separate from `TowerPanel.tsx` because there is no jsdom here — a
 * decision left in a `.tsx` file cannot be tested at all, and both the Wall and
 * the unlimited case are exactly the kind of branch that would go unnoticed if
 * it broke. Same reason `supportLabel.ts` exists. See CLAUDE.md.
 */
export function targetsLabel(targetsPerShot: number): string | null {
  if (targetsPerShot <= 0) return null

  return Number.isFinite(targetsPerShot) ? `hits ${targetsPerShot} per shot` : 'hits all in range'
}
