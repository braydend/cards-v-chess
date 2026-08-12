/**
 * The Deck cap.
 *
 * Hard: acquiring cards beyond it forces culling, and that decision is the point
 * of the cap. `cullCountFor` in `src/game/packs.ts` owns the arithmetic.
 *
 * There is no authored starting Deck any more — a run opens by dealing a Base
 * pack, so the opening position is seeded rather than written down. See
 * `createInitialState` in `src/game/state.ts`.
 */
export const DECK_CAP = 30
