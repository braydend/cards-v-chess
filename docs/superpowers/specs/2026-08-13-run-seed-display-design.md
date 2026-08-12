# Display Run Seed

**Status:** Approved design — implementation follows.
**Date:** 2026-08-13

## Feature

The player can see — and copy — the seed of their current run from the UI
(issue #64). The seed already lives on `GameState.seed`, minted per run in
`src/state/simulation.ts` and read out by nothing. This issue makes it visible;
it does not add the ability to enter a seed and replay a run, which is a
separate, larger feature.

## Behaviour

- The seed appears in the existing info modal, retitled **About** (formerly
  **Credits**), above the CC-BY attribution.
- The modal shows a **Run seed** section: the seed text in monospace plus a
  **Copy** button.
- Clicking **Copy** writes the seed to the clipboard. On success the button
  reads **Copied** for about 1.5 seconds, then reverts. On a failed or
  unavailable clipboard it does nothing visible — the seed is already on screen
  to read or write down, so there is no error UI.
- The seed is fixed for a run, so the section never changes while the modal is
  open.

## Architecture

- **`src/ui/About.tsx`** (renamed from `Credits.tsx`; component renamed
  `Credits` → `About`): the same modal shell, now titled **About**, with the
  **Run seed** section added above the attribution. Reads `snapshot.seed` via
  `useGameStore`. The transient **Copied** state is a local `useState`, with
  the revert timer cleared on modal close so no `setState` fires after unmount.
- **`src/state/uiStore.ts`**: rename `creditsOpen`/`setCreditsOpen` →
  `aboutOpen`/`setAboutOpen`. The field name should tell the truth about what
  the modal holds.
- **`src/ui/DesktopHud.tsx`** and **`src/ui/MobileHud.tsx`**: rename the button
  label **Credits** → **About**; call `setAboutOpen`.
- **`src/ui/copyText.ts`** (new, pure): `copyText(text, write): boolean`
  where `write` is the clipboard writer. Returns whether the write succeeded.
  The `.tsx` handler passes `navigator.clipboard.writeText`, so the decision —
  did the copy succeed — is pure and testable, per the no-jsdom rule.
- **`src/ui/Hud.tsx`**: mount the renamed `About` in place of `Credits`.
- **Comments**: update the doc references to the renamed modal in
  `src/ui/useDialogFocus.tsx` (traps `Credits`' focus) and
  `src/scene/pieceModels.ts` (points at `src/ui/Credits.tsx`).
- **CSS**: a small seed row (label, monospace value, button) in the modal.

## Testing

- `src/ui/copyText.test.ts`: unit tests for `copyText` with an injected
  writer — a writer that resolves succeeds (`true`), one that rejects or is
  absent yields `false`. The button and transient state are renderer plumbing
  and stay untested, like the rest of `src/ui`.

## Non-goals

- No way to enter a seed and replay a run — the "enterable" half of the
  missing-seed-UI note in `CLAUDE.md` stays open.
- No seed on the game-over screen; the About modal is available at any phase,
  including defeated.
- No engine changes: `GameState.seed` already exists and never changes
  mid-run.
