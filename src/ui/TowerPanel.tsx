import { towerRank } from '../data/towerRanks'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { formatStat } from './formatStat'
import { GEOMETRY_LABELS } from './geometryLabels'

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
 * `damageTaken` is a lifetime total, not `maxHealth - health`. Once ♥ repair
 * exists, a Tower at full health still reporting heavy damage taken is the
 * "Repair versus the wall" open question made visible — see the design doc.
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
        <div>
          <dt>Damage taken</dt>
          <dd>{formatStat(tower.damageTaken)}</dd>
        </div>
      </dl>

      <p className="towerPanel__geometry">{GEOMETRY_LABELS[def.geometry]}</p>

      <p className="hud__muted">
        range {def.range} · {formatStat(def.damage)} dmg · {def.fireIntervalMs}ms
      </p>
    </div>
  )
}
