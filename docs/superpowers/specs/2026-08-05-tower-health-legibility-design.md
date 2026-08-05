# Tower Health Legibility — Design

**Date:** 2026-08-05
**Status: FROZEN decision record. Not the current design.**

> This document records the decisions taken for [issue #4](https://github.com/braydend/cards-v-chess/issues/4) and why. It is **not updated** as the design evolves.
>
> **For what the game is now, read [`docs/design/game-design.md`](../../design/game-design.md).**

## Scope

Issue #4: *"towers should show their remaining health as well as damage taken from pieces attacking them."*

The mechanics already existed when this was written. The tower-firing slice gave `Tower` both `health` and `maxHealth`, gave each rank a max health of 8/12/16/20, and made blocked Pieces attack the Tower in front of them at half damage — a Pawn deals `2 × 0.5 = 1` every 900ms. `applyTowerDamage` in `tick.ts` already removed a Tower that fell.

So **this is a legibility slice, not a mechanics one.** The numbers were all there and almost none of them were visible: the only feedback was `Towers.tsx` lerping a Tower's colour toward `#3b0d0d` as its health dropped, and the HUD showing a Tower *count*.

**No game rule changed, so `game-design.md` is deliberately untouched.** Towers were already destructible, already had health, and already took damage from the Pieces they block. Adding a legibility decision to the living design document would have been drift.

## Decisions

### 1. Health reads as colour on the board; exact numbers only on inspect

**Considered:** a camera-facing health bar above each Tower; a flat health arc on the Tower's own square; keeping the colour ramp and putting numbers in an inspect panel; a bar *and* a strengthened ramp.

**Chosen:** colour remains the only on-board channel for a Tower's condition — no new geometry for the health readout — and exact figures live in an inspect panel.

The existing ramp keeps its maths exactly (`(1 - healthFraction) * 0.85` toward `#3b0d0d`); it simply moves from render-time computation to frame-time mutation. Legibility improves through the *event* signals added in decision 4, not by steepening the curve.

The board can hold a Tower on nearly every square, so per-Tower billboards is twenty-plus new objects and a sky full of UI competing with the Pieces for attention. The flat arc avoids that but reads poorly at exactly the camera angles the game allows — `OrbitControls` permits a `maxPolarAngle` of 1.4, close to eye level, where a mark lying in the board plane foreshortens to nothing.

The ramp also already existed. It needed strengthening, not replacing.

**Accepted cost:** *proportion* is not readable at a glance. You can see a Tower is hurt; you cannot see it is at 9 of 16 without selecting it. This is mitigated rather than solved, by decision 4 — the critical pulse covers the case that actually matters in a live round, which is *is this Tower about to fall*, not *what is its exact fraction*.

### 2. Damage taken is a real counter, not `maxHealth − health`

**Considered:** deriving it as `maxHealth − health`; a real `damageTaken` field on `Tower`; showing health alone and dropping the tally.

**Chosen:** `Tower` gains `readonly damageTaken: number`, set to `0` in `placeTower` and incremented alongside the health subtraction in `applyTowerDamage`.

Deriving it is correct *only while nothing heals*. Both ♥ repair and ♠ maximum-health are designed and neither is implemented. The day repair lands, a derived value silently stops meaning "damage taken" and starts meaning "damage currently outstanding" — a Tower repaired to full would report zero damage taken after weathering a whole round. ♠ raising `maxHealth` corrupts it independently. Neither failure announces itself; both produce a plausible number that is wrong.

`damageTaken` is deliberately **kept out of `structuralKey`.** It only ever changes in the same breath as `health`, which is already in the key, so including it would add noise against a rule `CLAUDE.md` is emphatic about. The inspect panel therefore updates in step with damage for free.

**Accepted costs:** a field, a line in `tick.ts`, and tests. A destroyed Tower's tally is lost with it — deliberate, since the panel closes when its subject is gone.

**Note for whoever implements repair.** This counter makes the **"Repair versus the wall"** open question *observable* for the first time. A Tower sitting at full health while reporting 40 damage taken **is** the permanent wall the open question warns about, and it will now be visible on screen rather than inferred. This decision does not resolve that question and must not be read as doing so.

### 3. Click a Tower to select it

**Considered:** hover to show the panel; click to select; hover previews with click to pin; a permanent list of every Tower in the HUD.

**Chosen:** click a Tower to select it. The panel pins open until something else is clicked.

Hover flickers panels in and out as the pointer sweeps the board, and it cannot be read while doing anything else. Click is calm, stays readable during a live round, and — decisively — it is the gesture **♥ repair will need anyway**: "select a Tower, apply a suit Card to it." Choosing it here means the interaction composes forward instead of being replaced.

The gesture was **free**: `placeTower` already returns state unchanged for a square that holds a Tower, so clicking a Tower could never build and there is no ambiguity to resolve.

Exhaustively, so there is nothing to interpret:

| Click target | Result |
| --- | --- |
| A Tower that is not selected | It becomes selected |
| The already-selected Tower | Deselected — the gesture toggles |
| An empty square | Builds as it does today, and clears any selection |
| The Core's square | Nothing, as today. Selection is left alone |

A selected Tower that is destroyed simply stops rendering the panel; nothing needs to actively clear it, because ids are never reused within a run.

The permanent HUD list was rejected on two counts — it runs to twenty-plus rows on a full board, and it points the player's eye away from the board during real-time combat.

**Trap recorded, because it is a real bug and not a theoretical one.** Tower ids are monotonic (`tower-${nextEntityId}`) and never reused, so a stale `selectedTowerId` normally cannot collide — *except* that `reset()` rewinds `nextEntityId` to `1`. A selection surviving a reset would silently re-attach to a brand-new Tower. Selection is cleared on reset.

### 4. Feedback is per-instance colour mutation, not new geometry

Three signals, all achieved by mutating the existing instanced Towers inside one `useFrame`, with a `useEffect` doing the snapshot diffing:

| Signal | Trigger | Treatment |
| --- | --- | --- |
| **Hit** | `health` dropped between two published snapshots | 150ms colour flare with a squash-and-recover on scale |
| **Critical** | `health / maxHealth < 0.3` | Colour oscillates toward a warning red at 1.2 Hz, continuously |
| **Destruction** | Tower id absent from the snapshot | 300ms ghost at its last square that flares and scales to zero |

The three durations and the 0.3 threshold are **presentation constants, tunable by feel.** They are not balance values and nothing in the engine reads them.

This works because drei's `<Instance>` ref is a `PositionMesh` carrying a real `THREE.Color`, and the parent `<Instances>` copies `instance.color` into the `instanceColor` buffer in its own frame loop. **Verified against the installed drei 10.7.7 rather than assumed.** Mutating that colour per frame therefore needs no React render, no new objects, and no per-Tower material — satisfying the R3F rules in `CLAUDE.md` and the no-new-geometry choice from decision 1 at the same time.

**Correction recorded.** An *emissive* throb was considered for the critical signal and is **not possible**. `emissive` lives on the shared per-rank material, so throbbing it would light up every Tower of that rank at once. Only colour is per-instance on an `InstancedMesh`. The pulse is brightness, not emission.

Death flares render inside the same per-rank `<Instances>` group as living Towers, so they cost no extra draw call.

**The one exception to no-new-geometry:** selecting a Tower draws a single flat highlight instance on its square, in the style of `CoveragePreview`, present only while something is selected. Geometry was declined for the *health* readout; the selection gesture is invisible without a marker.

### 5. The renderer diffs snapshots; the engine emits no events

**Considered:** renderer-side diffing of the published snapshot; an events list on `GameState` populated by `tick`; a `lastDamagedAtMs` timestamp on `Tower`.

**Chosen:** the renderer diffs. `Towers.tsx` holds last-seen health per Tower id in a ref; a drop starts a flash, and an id vanishing from the snapshot becomes a death ghost. The engine gains no event machinery at all.

The deciding argument is that **an engine event list is lossy by construction here.** `advance()` runs up to `MAX_CATCHUP_STEPS` (5) ticks before a single `emit()`, so anything `tick` writes per tick and clears per tick can be overwritten before any consumer sees it — the renderer would silently miss hits precisely when the frame rate drops. A diff against the published snapshot cannot miss a health change, because a health change is *what publishes the snapshot*.

Making events survive that would mean accumulating them until a consumer drains them, which stops `tick` being a clean state function, and it would put a per-tick-churning array into `GameState` immediately beside the `structuralKey` trap that `CLAUDE.md` warns destroys render performance.

The timestamp option is pure and not lossy, but `roundElapsedMs` resets to `0` at the end of every round, so a stale stamp re-fires a flash at the start of the next one. It also does nothing for destruction — a destroyed Tower leaves state entirely, so the ghost machinery is needed regardless. An engine field for very little.

**Accepted costs:** the renderer holds derived state; several hits inside one frame read as one flash, which is arguably the correct reading anyway; and the death ghost needs React state, costing two renders per Tower death. Deaths are rare, so that is cheap.

An event list becomes the right answer the moment a *second* consumer exists — sound is the obvious one. Revisit then, with the accumulate-and-drain problem solved deliberately rather than by accident.

### 6. Where the code goes

- **`src/scene/towerColour.ts` (new).** The colour maths — base rank colour, health fraction, flash progress, critical phase → a colour — as a pure function mutating a scratch `Color`. This keeps the frame loop allocation-free *and* makes the only genuinely fiddly logic in this slice unit-testable with no renderer, which is where the real risk of getting it wrong sits.
- **`src/ui/TowerPanel.tsx` (new)** rather than growing `Hud.tsx`, which already carries stats, the rank picker, and round control. It renders as a second panel inside the existing `.hud` overlay, so no new layout system. It shows, for the selected Tower: its **card rank** and the geometry description for that rank; **health as `health / maxHealth`**; **damage taken**; and the rank's **damage, range, and fire interval**. It renders nothing at all when no Tower is selected or the selected Tower is gone.

  Health and damage taken are **formatted, not printed raw.** `attackDamage × BLOCKED_ATTACK_MULTIPLIER` is a float, and while the Pawn's `2 × 0.5` happens to give a clean `1`, any Piece with an odd `attackDamage` will not. Trailing `.0` is trimmed and anything finer than one decimal is rounded, so the panel never shows `8.999999999999998`.
- **`GEOMETRY_LABELS` moves out of `Hud.tsx`** into a shared module, so the HUD and the panel read one copy instead of drifting apart.
- **`Board.tsx` reads the Tower list via `simulation.getState()` inside the click handler**, not by subscribing to the snapshot. Subscribing would re-render all 64 square instances on every Tower hit; clicks are rare, and reading live state outside React is the established pattern in this codebase.
- **`src/state/uiStore.ts`** gains `selectedTowerId`, keeping view state out of the game snapshot as that file already insists.

## Not done, deliberately

- **The coverage preview over an occupied square.** Hovering a square that already holds a Tower still previews what the *selected build rank* would cover from there — a footprint for a build that cannot happen. Pre-existing, adjacent, and about coverage rather than health, so it stays out. Showing the existing Tower's real coverage would be the natural companion change.
- **A HUD summary of Tower condition.** Extending the existing `Towers 4` stat to something like `4 · 1 critical` was considered and declined. The critical pulse already delivers whole-board awareness on the board itself, which is where the player is looking during a round; a second readout would duplicate it in the place their eyes are not.
- **No component tests.** The project has no jsdom and no testing-library, and all existing tests are headless by design. Coverage lands on the engine (`damageTaken` starts at zero, accumulates across a grind, and a Tower still falls at zero health) and on `towerColour` (full health, deep damage, mid-flash, inside the critical band).
- **No open question is resolved.** Not "Repair versus the wall", not board geometry, not the rank ladder. Decision 2 makes the first of those visible; visible is not decided.

## Verification

`pnpm test:run`, `pnpm typecheck`, and `pnpm lint`, plus a confirmation that the publish-count guard in `src/state/simulation.test.ts` still passes. Nothing in this slice touches `structuralKey`, and that test is what proves it.
