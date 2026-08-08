/**
 * King's Guard round composition.
 *
 * Every 8th round starting at round 15 is a Guard round: it replaces the
 * normal pool composition with clustered King+slider squads, so the King's
 * aura (0.7x move interval, +1 slide to adjacent pieces) actually fires on
 * entry. See the design spec, docs/superpowers/specs/2026-08-08-kings-guard-rounds-design.md.
 */

/** The first round that can be a Guard round. Kings enter the pool at 11, so 15 gives the player a few rounds to meet one first. */
export const GUARD_ROUND_FIRST = 15

/** How often a Guard round appears once it can. */
export const GUARD_ROUND_EVERY = 8

/**
 * Whether `roundNumber` is a Guard round. Pure arithmetic — no PRNG, so the
 * same run seed reproduces the same guard cadence for free.
 */
export function isGuardRound(roundNumber: number): boolean {
  return roundNumber >= GUARD_ROUND_FIRST && (roundNumber - GUARD_ROUND_FIRST) % GUARD_ROUND_EVERY === 0
}

import { BOARD } from './board'
import type { PieceTier, PieceTypeId, RoundSpec, Spawn } from '../game/types'

/**
 * How many squads a Guard round gets. Both the squad count and the per-squad
 * slider count grow with the round number; these formulas are PLACEHOLDER
 * tuning — the shape (both grow) is the design.
 */
export function squadCountFor(roundNumber: number): number {
  const guardIndex = (roundNumber - GUARD_ROUND_FIRST) / GUARD_ROUND_EVERY
  return 1 + guardIndex
}

/**
 * How many sliders ride beside each King. Grows more slowly than the squad
 * count so early Guard rounds stay small. PLACEHOLDER tuning.
 */
export function slidersPerSquadFor(roundNumber: number): number {
  const guardIndex = (roundNumber - GUARD_ROUND_FIRST) / GUARD_ROUND_EVERY
  return 2 + Math.floor(guardIndex / 2)
}

/** Milliseconds between squads in a Guard round. PLACEHOLDER tuning. */
export const GUARD_SQUAD_GAP_MS = 1200

/**
 * Builds a Guard round's spawns: one squad per King, each King flanked by
 * sliders on adjacent files, all sharing one `atMs` so they enter the board
 * together and the King's aura fires on entry.
 *
 * The squad band start is clamped so a band never wraps mid-band — a King at
 * a 7->0 edge would lose a flanker. Bands can still overlap (later squads
 * reuse files), which is legal because spawns stack freely on the Staging rank.
 *
 * `tierPool` is `tierPoolFor(roundNumber)` and `sliderPool` is the slider-only
 * type pool; both come from the dispatcher (Task 3), which is what keeps the
 * normal round's pool logic in `rounds.ts`.
 */
export function guardRoundSpec(
  roundNumber: number,
  tierPool: readonly PieceTier[],
  sliderPool: readonly PieceTypeId[],
): RoundSpec {
  const squadCount = squadCountFor(roundNumber)
  const slidersPerSquad = slidersPerSquadFor(roundNumber)
  // Never wider than the board itself — a squad is a contiguous file band, and
  // there are only BOARD.files of those. Rounds 15–39 sit far below this cap.
  const bandWidth = Math.min(slidersPerSquad + 1, BOARD.files)
  const kingSlot = Math.floor((bandWidth - 1) / 2)
  const stride = bandWidth + 1

  const spawns: Spawn[] = []
  let sliderCursor = 0
  let spawnIndex = 0

  for (let squad = 0; squad < squadCount; squad += 1) {
    // Clamp the band start so a band never wraps mid-band: a King at a band
    // edge that wraps 7->0 would lose a flanker (file 0 is distance 7 from
    // file 7, not 1). Bands may still overlap — spawns stack freely on the
    // Staging rank — but each King keeps two adjacent flankers.
    const baseFile = Math.min((squad * stride) % BOARD.files, BOARD.files - bandWidth)
    const atMs = squad * GUARD_SQUAD_GAP_MS

    for (let slot = 0; slot < bandWidth; slot += 1) {
      const file = baseFile + slot
      const isKing = slot === kingSlot
      const typeId: PieceTypeId = isKing
        ? 'king'
        : (sliderPool[sliderCursor % sliderPool.length] as PieceTypeId)
      if (!isKing) sliderCursor += 1

      spawns.push({
        atMs,
        typeId,
        tier: tierPool[spawnIndex % tierPool.length] as PieceTier,
        file,
      })
      spawnIndex += 1
    }
  }

  return { number: roundNumber, spawns }
}
