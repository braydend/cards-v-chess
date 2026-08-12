# Visual Feedback Banner — Design

**Date:** 2026-08-12
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The game gives the player no explicit announcement when a King's Guard round
starts — every 8th round from 15 (15, 23, 31, …) is the hardest recurring event
in a run, and it arrives silently. The player needs to *know* it is a Guard
round, and the game needs a way to say so.

More generally, the game has no reusable surface for this kind of transient,
unmissable feedback. This spec builds that surface, and wires it to the Guard
round as the first use case.

## Decision

**A generic `Banner` component — one large, centered, single-line announcement
that fades in, holds ~4 seconds, and fades out — plus a per-scenario pure
decision function and a thin wiring component. The first scenario shows
"The King's Guard approaches" the moment a Guard round enters progress.**

The banner is deliberately plain: text only, one style fits all, no icons, no
tone variants, no per-call duration options. Future scenarios reuse the same
component and bring their own trigger; nothing about the component changes.

### Components

Three small units, each with one job:

- **`src/ui/Banner.tsx`** — presentational, scenario-agnostic. Props:
  `{ message: string }`. Renders a single line of centered text, large enough to
  be unmissable, `pointer-events: none` so it never blocks the board during a
  hard round. Reads no store. Every future scenario reuses it unchanged.
- **`src/ui/guardRoundBanner.ts`** — pure, tested decision logic:
  `guardRoundBanner(phase, roundNumber): string | null`. Returns
  "The King's Guard approaches" when `phase === 'inProgress'` and
  `isGuardRound(roundNumber)` (from `src/data/guardRounds.ts`), otherwise
  `null`. Importing from `src/data/` from `src/ui/` is fine — the inbound
  import restriction covers only `src/game/` internals, not `src/data/`.
- **`src/ui/GuardRoundBanner.tsx`** — the scenario wiring. Reads the snapshot
  via `useGameStore`, calls `guardRoundBanner`, and renders
  `<Banner key={snapshot.roundNumber} message={…} />` when a message exists,
  nothing otherwise. Mounted once inside the `.hud` div in `Hud.tsx`, beside
  the shared modals, so the desktop and mobile branches both get it.

### Data flow

`startRound` — whether from the player's button or auto-start inside `tick` —
flips `phase` from `gap` to `inProgress`. `structuralKey` already includes
`phase` and `roundNumber`, so the store publishes, `GuardRoundBanner`
re-renders, and the banner mounts.

No engine changes. No timers. No effects. The animation is pure CSS, driven by
mounting.

The `key={snapshot.roundNumber}` is the remount guarantee: each Guard round
mounts the banner fresh, so the animation replays every time. It also covers
the pathological case where a round resolves and the next auto-starts inside a
single publish batch — the key forces the replay even though the banner was
never unmounted.

### Styling

Added to `src/index.css`, following the existing conventions:

- `.banner`: centered by the full-viewport `.hud` flex container,
  `text-align: center`, responsive large type via `clamp()`,
  `white-space: nowrap` to guarantee the single line, `text-transform:
  uppercase`, letter-spacing, and a soft `text-shadow` glow so the text reads
  against the dark board. Inherits `pointer-events: none` from `.hud`.
- `@keyframes banner-flash`: fade in (~0.4s), hold (~3s), fade out (~0.6s), ~4s
  total, `animation-fill-mode: forwards` ending at `opacity: 0`. The banner
  stays in the DOM, invisible, for the round's duration — a single div driven
  entirely by CSS, adding no re-renders.

### Why not the alternatives

- **Event recorded in GameState** (a ring like `recentExits`) — robust but adds
  simulation surface and tests for a purely cosmetic, renderer-only concern.
  The renderer already gets everything it needs from `phase` + `roundNumber`.
- **Timer/effect inside the component** — timers need cleanup and re-renders,
  and fight the repo's "React renders; never simulates" discipline. A CSS
  animation is strictly simpler.

## Testing

`src/ui/guardRoundBanner.test.ts`, mirroring the repo's test patterns:

- Guard rounds in `inProgress` (15, 23, 31) return the message.
- Non-guard rounds in `inProgress` (14, 16) return `null`.
- `gap` phase returns `null` even at a Guard round number.
- `isGuardRound` itself is already pinned in `src/data/guardRounds.test.ts`.

The `Banner` component holds no logic to test — this repo has no jsdom, and the
branching lives in the pure function, exactly as `cardPlay.ts`, `packPurchase.ts`
and the other sidecar modules do for their `.tsx` siblings.
