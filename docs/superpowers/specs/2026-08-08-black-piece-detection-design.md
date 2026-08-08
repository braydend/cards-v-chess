# Black Piece Detection — Design

**Date:** 2026-08-08
**Status:** Agreed

A decision record for issue #52: re-skin the Black Piece's defensive power from
"dodges Tower shots" to "undetected by Towers". For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

Black Pieces currently negate Tower shots with a 50% chance
(`dodgeChance: 0.5` in `src/data/tiers.ts`). The Tower **always fires** and the
shot rolls the seeded `rng.combat` stream; a negated shot is recorded in
`GameState.recentDodges`, and the renderer flashes the Piece with a **scale
pulse** — it "grows" — via `whiff.ts`'s `whiffScale`.

Issue #52 asks for a different story: the Piece should be **undetected by a
Tower**, not dodging a fired shot. The Tower should not fire at it at all,
instead of firing and missing.

## Decision

The mechanic moves from "shot lands, roll to negate" to "shot never happens,
the Tower failed to acquire the target". Four settled forks:

1. **The Tower holds fire and keeps its cooldown.** Detection rolls at
   targeting time, before cooldown is spent. An undetected Piece is excluded
   from the shot; if nothing remains, the Tower behaves exactly like today's
   "no targets" branch — ready, not spent, re-rolling next time it would fire.
2. **Per-shot, re-rolled each fire.** Each time a Tower would fire, each Black
   target rolls the seeded stream. No timed cloaking window, no persistent
   Piece state — same cadence as today's dodge, moved earlier.
3. **The Piece cloak-flickers.** The feedback is a brief alpha dip on the
   Piece — it reads as "the Tower couldn't see me". The grow-pulse is deleted.
4. **Full rename.** The codebase stops saying "dodge" and starts saying
   "miss" / "undetected", engine and renderer and tests alike.

### The engine change

In `fireTowers` (`src/game/tick.ts`), after `selectTargets` returns the
nearest-N reachable Pieces, and **before** `cooldown -= tower.fireIntervalMs`:

- Each Black target rolls `rng.combat` once. Roll order stays deterministic:
  towers in array order, targets in `selectTargets`'s sorted order.
- An undetected target is filtered out. The slot stays empty — no backfill
  with the next-nearest Piece.
- If the filtered list is now empty, treat it exactly as today's
  `targets.length === 0` branch: `cooldown = fireIntervalMs; break`. The Tower
  holds at ready and keeps its cooldown.
- Otherwise spend the cooldown and fire at the detected subset.

The load-bearing ordering detail: detection must run **before**
`cooldown -= fireIntervalMs`, or an all-undetected shot would spend the
cooldown firing nothing — rebuilding the "the Tower always fires" behaviour
this change removes.

A multi-target Tower with `targetsPerShot > 1` fires at the detected subset of
its selected slots and leaves the undetected slots empty.

### The record ring

The `recentDodges` mechanism survives unchanged in shape, renamed. Each
undetected target appends `{ pieceId, roundNumber, roundElapsedMs }` to the
ring (`recentMisses`), capped at 32 (`MISS_RING_SIZE`), never cleared,
deliberately excluded from `structuralKey`, read live in `useFrame` — exactly
as `recentExits` and `recentDodges` work today. A miss changes no field the
renderer diffs, so it must be recorded or the cloak-flicker could never be
shown.

A Joker's Clear remains exempt: it is a board wipe, not Tower fire, so it never
rolls detection and always destroys a Black Piece.

### The renderer change

`PieceMesh` in `src/scene/Pieces.tsx` currently writes
`mesh.scale.set(scale * whiff, ...)`. The signal moves from shape to
transparency:

- On a fresh miss the Black Piece's opacity drops to ~35% for a short window
  (~220ms, matching today's `WHIFF_FLASH_MS`) and eases back — a "cloaking
  hiccup". The maths lives in a renamed pure module (`src/scene/cloakFlicker.ts`,
  `cloakOpacity(ageMs)`), same ring-scanning `useFrame` architecture as today:
  tracker in a ref, no state set, no allocation.
- **Black gets a per-Piece cloned material.** Opacity is per-material in
  three.js, and materials are currently shared per tier. A shared black
  material cannot flicker one Black Piece without flickering every Black
  Piece. Only black clones — green/yellow/red keep the shared material. The
  clones dispose on unmount alongside the shared ones.
- The flicker composes cleanly with existing effects: promotion pop and
  health-shrink modulate **scale**; the cloak modulates **opacity**.
  Independent axes.

### The rename

| Today | After |
| --- | --- |
| `dodgeChance` (`src/data/tiers.ts`) | `missChance` — the Tower's chance to fail detection (0.5 placeholder, same number, same `roll < chance` comparison) |
| `recentDodges` ring + `DodgeRecord` (`src/game/types.ts`) | `recentMisses` + `MissRecord` |
| `fireTowers` `dodged` (`src/game/tick.ts`) | `missed` |
| `DODGE_RING_SIZE`, `appendDodges` (`src/game/tick.ts`) | `MISS_RING_SIZE`, `appendMisses` |
| `whiff.ts`, `whiffScale`, `whiffAgeMs`, `WhiffTracker`, `WHIFF_FLASH_MS` | `cloakFlicker.ts`, `cloakOpacity`, `cloakAgeMs`, `CloakTracker`, `CLOAK_FLASH_MS` |
| `TIERS.black.dodgeChance` references in tests | `missChance` |

`missChance` was chosen over `evadeChance` / `detectionChance`: it keeps the
same "shot doesn't land" semantics as `dodgeChance` (same seeded-roll
comparison `roll < chance`), just re-labelled from the shooter's side — which
is exactly what "the Tower failed to detect" means. `detectionChance` would
read as "chance of detecting", inverting the polarity and inviting a bug at
the call site.

### Docs

- `docs/design/game-design.md` — the Black tier line re-written as *undetected
  by the Tower*; the "Tier tuning numbers" open-question row updates the
  placeholder label ("black dodge chance" → "black miss chance").
- `docs/superpowers/specs/2026-08-07-chess-tiers-design.md` — **untouched**.
  A dated, frozen decision record; it describes the dodge as it was decided.
- `docs/superpowers/plans/2026-08-07-chess-tiers.md` — **untouched**. Frozen
  history.
- `CLAUDE.md` — the "Current state" line mentioning the seeded black-Piece
  dodge gets a one-line refresh to detection/miss wording. The domain
  vocabulary table has no "dodge" row, so nothing there changes.

### Tests

- `src/game/dodge.test.ts` becomes the miss/detection test: same seed → same
  misses; black health exceeds a green twin's by damage × misses; one record
  per undetected shot; non-Black never rolls; determinism; Clear exemption.
- `src/game/roundTermination.test.ts` and
  `src/state/structuralKey.test.ts` reference `recentDodges` and get renamed
  alongside.
- `src/scene/whiff.test.ts` becomes the cloak-flicker test: fresh miss
  flashes, other Pieces ignored, re-arms on a later miss, no re-flash from a
  previous round.
- A new engine test pins the ordering invariant: an all-undetected shot spends
  no cooldown and the Tower holds ready.

## Non-goals

- No timed cloaking window, no persistent stealth state on the Piece.
- No change to the 50% placeholder number, the tier mix, or `rng.combat`'s
  independence from the `packs` stream.
- No new feedback on the Tower itself — the signal stays on the Piece.
- The Amber coverage highlight is not affected; it lights squares, not Pieces.
