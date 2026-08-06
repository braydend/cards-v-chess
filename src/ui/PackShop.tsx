import { useCallback, useEffect, useState } from 'react'
import { SUITS } from '../data/cards'
import { PACK_TYPES, PACKS, type PackType } from '../data/packs'
import { cullCountFor, type Card, type Suit } from '../game'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { CardFace } from './CardFace'
import { commitState } from './packPurchase'

const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' } as const

/**
 * The pack shop: pick a pack, cull to the cap, open it.
 *
 * A modal because the three steps are one commitment — and because nothing is
 * spent until the single `buyPack` command commits, closing it at any point is
 * free and needs no rollback.
 *
 * Culling happens **before** the reveal, which is what keeps the purchase
 * atomic: `GameState` never holds a half-finished transaction, and the marked
 * cards live in `uiStore` until the command lands.
 */
export function PackShop() {
  const open = useUiStore((store) => store.packShopOpen)
  const setOpen = useUiStore((store) => store.setPackShopOpen)
  const marked = useUiStore((store) => store.markedForCullIds)
  const toggleMarked = useUiStore((store) => store.toggleMarkedForCull)
  const clearMarked = useUiStore((store) => store.clearMarkedForCull)

  const deck = useGameStore((store) => store.snapshot.deck)
  const ink = useGameStore((store) => store.snapshot.ink)

  const [pack, setPack] = useState<PackType | null>(null)
  const [suit, setSuit] = useState<Suit | null>(null)
  const [revealed, setRevealed] = useState<readonly Card[] | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setPack(null)
    setSuit(null)
    setRevealed(null)
    clearMarked()
  }, [setOpen, clearMarked])

  // Escape closes, like any modal. Bound only while open, so the handler is not
  // live for the whole session. `close` is memoised so this binds once per open
  // rather than on every render.
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  function choose(next: PackType) {
    setPack(next)
    // A pack switch changes how many cards must go, so a stale selection sized
    // for the previous pack would silently be wrong.
    clearMarked()
    if (!PACKS[next].suited) setSuit(null)
  }

  function commit() {
    if (!pack) return

    const before = new Set(deck.map((card) => card.id))
    const accepted = dispatch({
      kind: 'buyPack',
      pack,
      ...(PACKS[pack].suited && suit ? { suit } : {}),
      cullCardIds: marked,
    })

    if (!accepted) return

    // The reveal needs nothing from GameState: what is new is whatever was not
    // in the Deck a moment ago.
    const after = useGameStore.getState().snapshot.deck
    setRevealed(after.filter((card) => !before.has(card.id)))
    clearMarked()
  }

  if (!open) return null

  const needed = pack ? cullCountFor(deck.length, pack) : 0
  const button = commitState({ deckSize: deck.length, ink, pack, suit, markedIds: marked })

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Buy a pack">
      <button type="button" className="modal__scrim" aria-label="Close" onClick={close} />

      <div className="modal__panel">
        {revealed ? (
          <>
            <div className="modal__head">
              <span className="hud__label">
                {revealed.length} new {revealed.length === 1 ? 'card' : 'cards'}
              </span>
              <span className="modal__ink">{ink} Ink</span>
            </div>

            <ul className="modal__reveal">
              {revealed.map((card) => (
                <li key={card.id}>
                  <CardFace card={card} modifier="deck__card--new" />
                </li>
              ))}
            </ul>

            <div className="modal__actions">
              <button type="button" className="hud__button" onClick={close}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal__head">
              <span className="hud__label">Buy a pack</span>
              <span className="modal__ink">{ink} Ink</span>
            </div>

            <ul className="modal__packs">
              {PACK_TYPES.map((type) => {
                const def = PACKS[type]

                return (
                  <li key={type}>
                    <button
                      type="button"
                      className={`modal__pack${pack === type ? ' modal__pack--active' : ''}${
                        ink < def.price ? ' modal__pack--poor' : ''
                      }`}
                      onClick={() => choose(type)}
                    >
                      <strong>{def.label}</strong>
                      <span className="hud__muted">{def.size} cards</span>
                      <span className="modal__ink">{def.price}</span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {pack && PACKS[pack].suited ? (
              <div className="modal__suits">
                <span className="hud__label">Suit</span>
                {SUITS.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={`modal__suit${suit === option ? ' modal__suit--active' : ''}`}
                    onClick={() => setSuit(option)}
                  >
                    {SUIT_GLYPH[option]}
                  </button>
                ))}
              </div>
            ) : null}

            {needed > 0 ? (
              <div className="modal__cull">
                <span className="hud__label">
                  Destroy {needed} of {deck.length} — marked {marked.length}
                </span>
                <ul className="deck__cards">
                  {deck.map((card) => (
                    <li key={card.id}>
                      <CardFace
                        card={card}
                        modifier={
                          marked.includes(card.id) ? 'deck__card--doomed' : undefined
                        }
                        onClick={() => toggleMarked(card.id)}
                        title="Mark to destroy"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {button.reason ? <p className="hud__hint">{button.reason}</p> : null}

            <div className="modal__actions">
              <button type="button" className="modal__cancel" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="hud__button"
                disabled={!button.enabled}
                onClick={commit}
              >
                {button.label}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
