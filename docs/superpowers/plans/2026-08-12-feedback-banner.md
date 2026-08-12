# Visual Feedback Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable, unmissable, single-line feedback banner and wire it to announce "The King's Guard approaches" when a Guard round starts.

**Architecture:** A generic presentational `Banner` component renders one line of centered text with a pure-CSS flash (fade in, hold ~3s, fade out, ~4s total). The tested decision logic lives in a pure sidecar module `guardRoundBanner.ts` (`phase === 'inProgress' && isGuardRound(roundNumber)`). A thin `GuardRoundBanner` component reads the snapshot, calls the pure function, and mounts `<Banner key={roundNumber}>`. Everything is derived from the existing snapshot publish — no engine changes, no timers, no effects.

**Tech Stack:** TypeScript (strict), React, zustand, Vitest, pnpm. CSS lives in the single `src/index.css`.

## Global Constraints

- The banner is generic and scenario-agnostic: exactly one prop (`message: string`), one style, no icons, no tone variants, no per-call duration options.
- The Guard round copy is the exact string `"The King's Guard approaches"`.
- The banner shows only while `phase === 'inProgress'` at a Guard round number. It is `null` in `gap` and `defeated`.
- Animation timing: fade in ~0.4s, hold ~3s, fade out ~0.6s — ~4s total, `animation-fill-mode: forwards`, ending at `opacity: 0`.
- Single centered line, large and unmissable, `white-space: nowrap`, `pointer-events: none` (never blocks the board during a hard round).
- Mounted once inside the `.hud` div in `Hud.tsx` so desktop and mobile branches both get it.
- `key={snapshot.roundNumber}` on the `Banner` so each Guard round remounts and replays the flash.
- No engine changes, no timers, no effects — purely derived from the snapshot, so manual *and* auto-start both trigger it.
- `src/ui/` may import from `src/data/` freely; the inbound restriction covers only `src/game/` internals. Import the `RoundPhase` type from the public surface (`../game`), never from inside `src/game/`.
- No `Math.random` anywhere.
- The design authority is `docs/superpowers/specs/2026-08-12-feedback-banner-design.md`. Read it before changing anything.

---

### Task 1: `guardRoundBanner.ts` — pure decision function

**Files:**
- Create: `src/ui/guardRoundBanner.ts`
- Test: `src/ui/guardRoundBanner.test.ts`

**Interfaces:**
- Consumes: `isGuardRound(roundNumber: number): boolean` from `../data/guardRounds`; `RoundPhase` type from `../game` (public surface).
- Produces: `GUARD_BANNER_MESSAGE: string` (exact value `"The King's Guard approaches"`) and `guardRoundBanner(phase: RoundPhase, roundNumber: number): string | null`. Task 3's `GuardRoundBanner` calls this and renders the returned string.

- [ ] **Step 1: Write the failing test**

Create `src/ui/guardRoundBanner.test.ts`, mirroring the style of `src/ui/formatStat.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GUARD_BANNER_MESSAGE, guardRoundBanner } from './guardRoundBanner'

describe('guardRoundBanner', () => {
  it('announces guard rounds 15, 23, 31 while in progress', () => {
    for (const n of [15, 23, 31]) {
      expect(guardRoundBanner('inProgress', n)).toBe(GUARD_BANNER_MESSAGE)
    }
  })

  it('stays silent for non-guard rounds in progress', () => {
    for (const n of [1, 14, 16, 22]) {
      expect(guardRoundBanner('inProgress', n)).toBeNull()
    }
  })

  it('stays silent in the gap, even at a guard round number', () => {
    expect(guardRoundBanner('gap', 15)).toBeNull()
    expect(guardRoundBanner('gap', 23)).toBeNull()
  })

  it('stays silent after defeat', () => {
    expect(guardRoundBanner('defeated', 15)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/ui/guardRoundBanner.test.ts`
Expected: FAIL — `Cannot find module './guardRoundBanner'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/guardRoundBanner.ts`:

```ts
import { isGuardRound } from '../data/guardRounds'
import type { RoundPhase } from '../game'

/** The single line the banner shows the moment a Guard round starts. */
export const GUARD_BANNER_MESSAGE = "The King's Guard approaches"

/**
 * Whether the banner should announce a Guard round, and what it says.
 *
 * Pure and deterministic: a Guard round is pure arithmetic on the round
 * number, so the message needs nothing but the current phase and round
 * number — no engine events, no timers. Returns null in the gap, after
 * defeat, and for any non-Guard round in progress.
 */
export function guardRoundBanner(phase: RoundPhase, roundNumber: number): string | null {
  return phase === 'inProgress' && isGuardRound(roundNumber) ? GUARD_BANNER_MESSAGE : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/ui/guardRoundBanner.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean. (The lint check confirms importing from `../data/guardRounds` and the public `../game` surface violates no boundary rule.)

- [ ] **Step 6: Commit**

```bash
git add src/ui/guardRoundBanner.ts src/ui/guardRoundBanner.test.ts
git commit -m "feat(ui): decide when the king's guard banner should show"
```

---

### Task 2: `Banner.tsx` — the generic presentational component and its CSS

**Files:**
- Create: `src/ui/Banner.tsx`
- Modify: `src/index.css` (insert the `.banner` rules near the top, after the `.hud__panel` rule that ends around line 51)

**Interfaces:**
- Consumes: nothing.
- Produces: `Banner({ message }: { message: string })` — renders a single `<div className="banner">{message}</div>`. Task 3 mounts it.

- [ ] **Step 1: Create the component**

Create `src/ui/Banner.tsx`:

```tsx
/**
 * A large, centered, single-line announcement that flashes in, holds, and
 * fades out (~4s, driven entirely by CSS).
 *
 * Scenario-agnostic: it takes one message and never reads a store, so any
 * future feedback scenario reuses it unchanged — the caller decides when to
 * mount it and what it says. Pointer-transparent, so it never blocks the
 * board during a round.
 */
export function Banner({ message }: { message: string }) {
  return <div className="banner">{message}</div>
}
```

- [ ] **Step 2: Add the CSS**

In `src/index.css`, after the `.hud__panel` rule, add:

```css
/* The announcement banner: one large centered line that flashes in, holds,
   and fades out over ~4s. It fills the viewport so the flex centering is
   against the window, and stays pointer-transparent — it must never block
   the board during a hard round. */
.banner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  text-align: center;
  white-space: nowrap;
  font-size: clamp(1.6rem, 5vw, 3.5rem);
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #f5e9c8;
  text-shadow:
    0 0 1.2rem rgb(245 233 200 / 55%),
    0 0.2rem 0.6rem rgb(0 0 0 / 80%);
  animation: banner-flash 4s ease forwards;
}

@keyframes banner-flash {
  0% {
    opacity: 0;
    transform: scale(0.92);
  }
  10% {
    opacity: 1;
    transform: scale(1);
  }
  75% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/Banner.tsx src/index.css
git commit -m "feat(ui): add generic flashing announcement banner"
```

---

### Task 3: `GuardRoundBanner.tsx` — the scenario wiring, mounted in `Hud.tsx`

**Files:**
- Create: `src/ui/GuardRoundBanner.tsx`
- Modify: `src/ui/Hud.tsx` (add the import and mount `<GuardRoundBanner />` inside the `.hud` div, alongside the shared modals)

**Interfaces:**
- Consumes: `guardRoundBanner(phase, roundNumber)` and the snapshot from `useGameStore`; `Banner({ message })` from Task 2.
- Produces: nothing — final integration. The full suite and a manual play-through are the verification.

- [ ] **Step 1: Create the wiring component**

Create `src/ui/GuardRoundBanner.tsx`:

```tsx
import { useGameStore } from '../state/store'
import { Banner } from './Banner'
import { guardRoundBanner } from './guardRoundBanner'

/**
 * The King's Guard announcement.
 *
 * Reads the snapshot and mounts the banner the moment a Guard round enters
 * progress. Keyed by round number so each Guard round remounts the banner
 * and replays the flash even if React otherwise would not remount it (a
 * round resolving and the next auto-starting inside one publish batch).
 * Mounting (and the CSS animation) is the whole mechanism — no timers, no
 * effects, no engine changes.
 */
export function GuardRoundBanner() {
  const snapshot = useGameStore((store) => store.snapshot)
  const message = guardRoundBanner(snapshot.phase, snapshot.roundNumber)

  if (message === null) return null
  return <Banner key={snapshot.roundNumber} message={message} />
}
```

- [ ] **Step 2: Mount it in `Hud.tsx`**

Add the import:

```tsx
import { GuardRoundBanner } from './GuardRoundBanner'
```

and mount it inside the `.hud` div, beside the shared modals:

```tsx
      <TowerPanel />
      <PackShop />
      <Credits />
      <GuardRoundBanner />
```

(`Hud.tsx` currently ends the `.hud` div with `<TowerPanel />`, `<PackShop />`, `<Credits />` — the `GuardRoundBanner` is the fourth, and its `.banner` absolutely positions itself over the full viewport.)

- [ ] **Step 3: Typecheck, lint, and run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: all clean, all tests pass (including `src/ui/guardRoundBanner.test.ts` from Task 1 and `src/data/guardRounds.test.ts`).

- [ ] **Step 4: Manual smoke check**

Run `pnpm dev`, play or skip to round 15, and confirm: when the round starts (button **or** auto-start), the banner flashes "THE KING'S GUARD APPROACHES" center-screen, holds, and fades — without blocking clicks on the board. Start a non-Guard round (e.g. 16) and confirm no banner.

- [ ] **Step 5: Commit**

```bash
git add src/ui/GuardRoundBanner.tsx src/ui/Hud.tsx
git commit -m "feat(ui): announce king's guard rounds with a banner"
```
