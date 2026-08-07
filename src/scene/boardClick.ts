import {
  canSupport,
  commandFor,
  isBuildableRank,
  squaresEqual,
  type Card,
  type Command,
  type PlayMode,
  type PlayTarget,
  type Square,
  type Tower,
} from '../game'

export type BoardClick =
  | { readonly kind: 'select'; readonly towerId: string }
  | { readonly kind: 'deselect' }
  | { readonly kind: 'build' }

/**
 * What a click on a board square means with no Card picked from the Deck.
 *
 * Extracted from the component so the rules are testable — this project has no
 * jsdom and no component tests, so logic left inside a `.tsx` file is logic that
 * cannot be tested at all.
 *
 * Clicking a Tower selects it for the inspect panel, clicking the selected Tower
 * deselects it, and clicking anywhere else is `build`.
 *
 * `build` no longer means "place a Tower here for free": `placeTower` is gone,
 * and a Tower is built by playing a Card for its rank. It now means only "this
 * click was not aimed at a Tower", which is why `resolveBoardAction` is the
 * function the renderer calls — it is the one that knows about the selected
 * Card and can turn that into an actual play.
 */
export function resolveBoardClick(
  square: Square,
  towers: readonly Tower[],
  selectedTowerId: string | null,
): BoardClick {
  const tower = towers.find((candidate) => squaresEqual(candidate.square, square))
  if (!tower) return { kind: 'build' }

  return tower.id === selectedTowerId
    ? { kind: 'deselect' }
    : { kind: 'select', towerId: tower.id }
}

/** Everything a board click has to weigh up. */
export interface BoardClickContext {
  readonly square: Square
  /** Live Towers, not a published snapshot — a click acts on the board as it is now. */
  readonly towers: readonly Tower[]
  /** The Tower whose inspect panel is open. */
  readonly selectedTowerId: string | null
  /** The Card picked from the Deck, or null when none is. */
  readonly card: Card | null
  readonly playMode: PlayMode
  /** The Tower a Queen will copy, once its first click has picked one. */
  readonly echoSourceTowerId: string | null
  /** How the pointer engages: `fine` is click-to-play, `coarse` is tap-to-preview. */
  readonly pointer: 'fine' | 'coarse'
  /** The square already previewed by a previous tap, or null. */
  readonly previewedSquare: Square | null
}

export type BoardAction =
  /** Open the inspect panel on this Tower. */
  | { readonly kind: 'select'; readonly towerId: string }
  /** Close the inspect panel. */
  | { readonly kind: 'deselect' }
  /** Remember this Tower as the Queen's Echo source; the next click picks the square. */
  | { readonly kind: 'pickEchoSource'; readonly towerId: string }
  /** Play the picked Card. */
  | { readonly kind: 'play'; readonly command: Command }
  /** On touch, the first tap on a square previews its coverage instead of playing. */
  | { readonly kind: 'preview'; readonly square: Square }

/**
 * What a click on a board square does — the whole decision, in one pure
 * function, for the same reason `resolveBoardClick` exists: there are no
 * component tests, so this cannot live in `Board.tsx`.
 *
 * Two features meet on this gesture. The Tower inspect panel wants a click on a
 * Tower to select it; the card system wants a click on a Tower to be the target
 * of a ♥ repair, a Jack's shield, or a Queen's Echo source.
 *
 * **A Card that can act on the clicked target wins.** That is the whole rule:
 * with no Card picked the inspect panel behaves exactly as it did before the
 * card system existed, and a Card that cannot be played at what was clicked
 * (a rank Card clicked onto an occupied square, a King, which takes no board
 * target at all) does not consume the click either — the panel opens instead.
 * A support Card aimed at a Tower of the wrong rank is the same case: it cannot
 * act on what was clicked, so the panel gets the click.
 *
 * Which Command a target produces is `commandFor`'s job, not this function's.
 * All that is decided here is *which* target the click is, and whether the card
 * play or the panel gets it.
 */
export function resolveBoardAction(context: BoardClickContext): BoardAction {
  const { square, towers, selectedTowerId, card, playMode, echoSourceTowerId, pointer, previewedSquare } =
    context

  const inspect = resolveBoardClick(square, towers, selectedTowerId)

  // `build` is only reachable on an empty square, and on its own it now means
  // the player clicked past whatever they were inspecting — so it closes the
  // panel. A play deliberately leaves the panel alone: repairing the Tower on
  // screen and watching its health climb is the point of having a panel.
  const panel: BoardAction = inspect.kind === 'build' ? { kind: 'deselect' } : inspect

  if (!card) return panel

  // On a coarse pointer the first tap previews instead of playing: touch has no
  // hover, so this tap and the teal/red CoveragePreview it triggers are the
  // only way the player learns a square's footprint — or that a square is
  // illegal — before committing. Preview fires on ANY square, legal or not,
  // exactly as desktop hover does; the red marker is what teaches illegality,
  // and the second tap's play is refused by the engine with the selection
  // preserved. A fine pointer never previews: hover already shows the preview.
  // Support-mode and face-card plays have no footprint to preview, so the gate
  // is restricted to a buildable rank in build mode.
  if (
    pointer === 'coarse' &&
    playMode === 'build' &&
    card.kind === 'standard' &&
    isBuildableRank(card.rank) &&
    !(previewedSquare && squaresEqual(previewedSquare, square))
  ) {
    return { kind: 'preview', square }
  }

  const clickedTower = towers.find((tower) => squaresEqual(tower.square, square))

  // A support Card that cannot reach this Tower must not consume the click.
  // `commandFor` does not validate — it would still return a supportTower
  // command, which the engine then refuses — so the player would get neither a
  // play nor the inspect panel. This is the check that keeps the panel.
  if (playMode === 'support' && clickedTower && !canSupport(card, clickedTower)) return panel

  // Echo is the only play needing two board targets: a source Tower to copy,
  // then a square to build the copy on. Sequencing those two clicks is UX and
  // belongs here; what the resulting target means does not, and comes from
  // `commandFor` below.
  if (playMode === 'build' && card.kind === 'standard' && card.rank === 'Q' && !echoSourceTowerId) {
    return clickedTower ? { kind: 'pickEchoSource', towerId: clickedTower.id } : panel
  }

  const target: PlayTarget =
    playMode === 'build' && echoSourceTowerId !== null
      ? { kind: 'echo', sourceTowerId: echoSourceTowerId, square }
      : clickedTower
        ? { kind: 'tower', towerId: clickedTower.id }
        : { kind: 'square', square }

  const command = commandFor(card, playMode, target)

  return command ? { kind: 'play', command } : panel
}
