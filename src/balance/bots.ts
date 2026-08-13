import { pendingUpgrades } from '../game'
import type { Command, GameState, Tower } from '../game'
import { HAND_STRENGTH, bestBuildSquare, bestHandInDeck, cullIdsFor, preferredPack } from './strategy'
import type { Bot, BotParams } from './types'

function decide(state: GameState, params: BotParams): Command | null {
  return state.phase === 'inProgress' ? decideMidRound(state, params) : decideGap(state, params)
}

function decideGap(state: GameState, params: BotParams): Command | null {
  if (state.pendingTower !== null) {
    const square = bestBuildSquare(state, state.pendingTower, params.placement)
    return square ? { kind: 'placeTower', square } : { kind: 'cancelPlacement' }
  }

  const upgrade = nextUpgrade(state)
  if (upgrade) return upgrade

  const face = nextFace(state, params)
  if (face) return face

  const pack = preferredPack(state, params.packPreference, params.inkReserve)
  if (pack) return { kind: 'buyPack', pack, cullCardIds: cullIdsFor(state.deck, pack) }

  const pick = bestHandInDeck(state.deck)
  if (pick && HAND_STRENGTH[pick.hand] >= HAND_STRENGTH[params.minHand]) {
    if (pick.hand === 'royalFlush') {
      return { kind: 'playHand', cardIds: pick.cardIds, chosenType: params.royalChoice }
    }
    return { kind: 'playHand', cardIds: pick.cardIds }
  }

  return null
}

function decideMidRound(state: GameState, params: BotParams): Command | null {
  const upgrade = nextUpgrade(state)
  if (upgrade) return upgrade

  // The one deliberate mid-round card: the Joker as an emergency board wipe.
  if (state.pieces.length >= params.emergencyClearThreshold) {
    const joker = state.deck.find((card) => card.kind === 'joker')
    if (joker) return { kind: 'clearPieces', cardId: joker.id }
  }

  return null
}

function nextUpgrade(state: GameState): Command | null {
  for (const tower of state.towers) {
    if (tower.type === 'wall') continue
    if (pendingUpgrades(tower.kills, tower.upgradesSpent) > 0) {
      const stat = tower.health < tower.maxHealth * 0.5 ? 'health' : 'damage'
      return { kind: 'upgradeTower', towerId: tower.id, stat }
    }
  }
  return null
}

function nextFace(state: GameState, params: BotParams): Command | null {
  const tower = strongestTower(state)

  const jack = state.deck.find((card) => card.kind === 'standard' && card.rank === 'J')
  if (tower && jack) return { kind: 'shieldTower', cardId: jack.id, towerId: tower.id }

  const queen = state.deck.find((card) => card.kind === 'standard' && card.rank === 'Q')
  if (tower && queen) return { kind: 'rangeTower', cardId: queen.id, towerId: tower.id }

  const king = state.deck.find((card) => card.kind === 'standard' && card.rank === 'K')
  if (king) return { kind: 'reinforceCore', cardId: king.id }

  const ace = state.deck.find((card) => card.kind === 'standard' && card.rank === 'A')
  if (params.useExpand && ace) return { kind: 'expandBoard', cardId: ace.id }

  return null
}

function strongestTower(state: GameState): Tower | null {
  let best: Tower | null = null
  for (const tower of state.towers) {
    if (!best || tower.damage > best.damage) best = tower
  }
  return best
}

/** One parameterised bot policy. See `BotParams` for the knobs. */
export function makeBot(params: BotParams): Bot {
  return { name: params.name, decide: (state) => decide(state, params) }
}

/** The sensible-player baseline: strongest hand, coverage-max placement, steady packs. */
export const VALUE_BOT = makeBot({
  name: 'value',
  placement: 'maxCoverage',
  packPreference: ['base', 'scrap', 'suited', 'court'],
  inkReserve: 0,
  minHand: 'highCard',
  royalChoice: 'tollgate',
  emergencyClearThreshold: 15,
  useExpand: true,
})

/** Spend-early: cheap packs, Towers pushed to the spawn side, low clear threshold. */
export const AGGRO_BOT = makeBot({
  name: 'aggro',
  placement: 'spawnSide',
  packPreference: ['scrap', 'base', 'suited', 'court'],
  inkReserve: 0,
  minHand: 'highCard',
  royalChoice: 'tollgate',
  emergencyClearThreshold: 10,
  useExpand: true,
})

/** Hoard: Court packs, only pair-and-better hands, Core-side placement, save the Aces. */
export const CONSERVATIVE_BOT = makeBot({
  name: 'conservative',
  placement: 'coreSide',
  packPreference: ['court', 'suited', 'base', 'scrap'],
  inkReserve: 50,
  minHand: 'pair',
  royalChoice: 'ring',
  emergencyClearThreshold: 20,
  useExpand: false,
})

/** The full matrix roster, in the order the gate runs them. */
export const BOTS: readonly Bot[] = [VALUE_BOT, AGGRO_BOT, CONSERVATIVE_BOT]
