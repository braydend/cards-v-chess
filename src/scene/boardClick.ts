import { squaresEqual, type Card, type Command, type Square, type Tower, type TowerTypeId } from '../game'

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
  /** The Tower type awaiting placement after a hand was committed, or null. */
  readonly pendingTower: TowerTypeId | null
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
  /** Play the picked Card, or place a pending Tower. */
  | { readonly kind: 'play'; readonly command: Command }
  /** On touch, the first tap on a square previews its coverage instead of playing. */
  | { readonly kind: 'preview'; readonly square: Square }

/**
 * What a click on a board square does — the whole decision, in one pure
 * function, for the same reason `resolveBoardClick` exists: there are no
 * component tests, so this cannot live in `Board.tsx`.
 *
 * Three features meet on this gesture. The Tower inspect panel wants a click on
 * a Tower to select it; a pending Tower wants any click to be its placement
 * square; the card system wants a click on a Tower to be the target of a Jack's
 * shield or a Queen's range action.
 *
 * A pending Tower wins outright: the hand was already committed, so any square
 * click (coarse pointers previewing first) produces a `placeTower` command, and
 * the engine refuses illegal squares. Otherwise a Card that can act on the
 * clicked target wins. With no Card picked — or a Card that takes no board
 * target (K, A, Joker) or cannot act on what was clicked — the inspect panel
 * gets the click.
 *
 * Which Command a target produces is built inline here — `commandFor` is
 * superseded by this function and the hand flow, and no longer has a seat at
 * this table.
 */
export function resolveBoardAction(context: BoardClickContext): BoardAction {
  const { square, towers, selectedTowerId, card, pendingTower, pointer, previewedSquare } = context

  const inspect = resolveBoardClick(square, towers, selectedTowerId)
  const panel: BoardAction = inspect.kind === 'build' ? { kind: 'deselect' } : inspect

  if (pendingTower !== null) {
    // On a coarse pointer the first tap previews instead of playing: touch has
    // no hover, so this tap and the teal/red CoveragePreview it triggers are
    // the only way the player learns a square's footprint — or that a square
    // is illegal — before committing. Preview fires on ANY square, legal or
    // not, exactly as desktop hover does; the red marker is what teaches
    // illegality, and the second tap's play is refused by the engine. A fine
    // pointer never previews: hover already shows the preview. A J or Q needs
    // a Tower target and has no footprint, so no preview gate applies to them.
    if (pointer === 'coarse' && !(previewedSquare && squaresEqual(previewedSquare, square))) {
      return { kind: 'preview', square }
    }
    return { kind: 'play', command: { kind: 'placeTower', square } }
  }

  if (!card) return panel

  // A J or Q needs a Tower target; K/A/Joker play from the Deck and have no
  // board target at all. Numbered cards are hand material — they are committed
  // as part of a poker hand, never selected alone for a board action.
  if (card.kind !== 'standard') return panel
  const clickedTower = towers.find((tower) => squaresEqual(tower.square, square))
  if (card.rank === 'J' && clickedTower) {
    return { kind: 'play', command: { kind: 'shieldTower', cardId: card.id, towerId: clickedTower.id } }
  }
  if (card.rank === 'Q' && clickedTower) {
    return { kind: 'play', command: { kind: 'rangeTower', cardId: card.id, towerId: clickedTower.id } }
  }

  return panel
}
