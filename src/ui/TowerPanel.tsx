import { towerRank } from '../data/towerRanks'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { formatStat } from './formatStat'
import { GEOMETRY_LABELS } from './geometryLabels'
import { targetsLabel } from './targetsLabel'

/**
 * Details of the selected Tower.
 *
 * The board carries the ambient signals — a Tower darkens, flashes, and pulses.
 * This is where the exact figures live, which is why the board needs no health
 * bars above every Tower.
 *
 * It updates in step with damage for free: a hit changes `health`, `health` is
 * in `structuralKey`, and a change there is what publishes a snapshot.
 *
 * `damageTaken` is a lifetime total, not `maxHealth - health`. ♥ repair
 * already exists (`src/game/cardPlays.ts`), so a Tower at full health still
 * reporting heavy damage taken is the "Repair versus the wall" open question
 * made visible right now — see the design doc.
 */
export function TowerPanel() {
  const selectedTowerId = useUiStore((store) => store.selectedTowerId)
  const setSelectedTowerId = useUiStore((store) => store.setSelectedTowerId)
  const towers = useGameStore((store) => store.snapshot.towers)

  // A destroyed Tower simply stops being found, so the panel closes itself.
  // Tower ids are never reused within a run, so a stale id cannot mismatch.
  const tower = towers.find((candidate) => candidate.id === selectedTowerId)
  if (!tower) return null

  const def = towerRank(tower.cardRank)
  const targets = targetsLabel(def.targetsPerShot)

  return (
    <div className="towerPanel">
      <h2 className="towerPanel__title">
        Rank {tower.cardRank} Tower
        <button
          type="button"
          className="towerPanel__close"
          aria-label="Close Tower details"
          onClick={() => setSelectedTowerId(null)}
        >
          ×
        </button>
      </h2>

      <dl className="hud__stats">
        <div>
          <dt>Health</dt>
          <dd>
            {formatStat(tower.health)}
            <span className="hud__muted"> / {formatStat(tower.maxHealth)}</span>
          </dd>
        </div>
        {tower.shield > 0 && (
          <div>
            <dt>Shield</dt>
            <dd>{formatStat(tower.shield)}</dd>
          </div>
        )}
        <div>
          <dt>Damage taken</dt>
          <dd>{formatStat(tower.damageTaken)}</dd>
        </div>
        <div>
          <dt>Pieces defeated</dt>
          <dd>{formatStat(tower.kills)}</dd>
        </div>
        {def.geometry !== 'none' && (
          <div>
            <dt>DPS</dt>
            <dd>{formatStat(tower.damage / (tower.fireIntervalMs / 1000))}</dd>
          </div>
        )}
      </dl>

      <p className="towerPanel__geometry">{GEOMETRY_LABELS[def.geometry]}</p>

      {/* Targets per shot is the half of "what can this Tower attack" that the
          board cannot show — the coverage highlight lights every square in the
          footprint, and a shot only reaches some of the Pieces standing in it,
          so the two are read together. The phrasing is `targetsLabel`'s, not
          this file's: which wording each case gets is a decision, and a
          decision inside a `.tsx` cannot be tested here.

          It returns null for the rank-7 Wall, which has no gun, and then the
          clause is dropped rather than printed as "hits 0 per shot". The
          separator goes with it — hence the whole clause being one expression.

          `def`, not the Tower — ♣ and ♦ mutate damage and the fire interval
          onto the instance, but nothing moves this figure off the ladder. */}
      <p className="hud__muted">
        range {def.range} · {formatStat(tower.damage)} dmg · {tower.fireIntervalMs}ms
        {targets === null ? '' : ` · ${targets}`}
      </p>
    </div>
  )
}
