# Display Run Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the current run's seed in the UI (the About modal) with a copy button (issue #64).

**Architecture:** The seed already lives on `GameState.seed` and flows through the store; this is pure view work. The existing info modal is retitled from Credits to About and gains a "Run seed" section whose Copy button goes through a tiny pure helper (`copyText`), keeping the clipboard decision testable per the no-jsdom rule. No engine changes.

**Tech Stack:** TypeScript (strict), React, zustand (`uiStore` for view state), Vitest.

## Global Constraints

- **No `Math.random` in `src/game/` or `src/data/`** — not touched here, but the seed's determinism is why `GameState.seed` exists.
- **`src/game/` and `src/data/` must never import React or Three.js** — not touched here.
- **No jsdom and no component tests** — any branch that must be tested is pulled into a pure module (`src/ui/copyText.ts`) beside the `.tsx` plumbing.
- **Renderer boundary:** `src/ui/` imports from `src/game/` only through `src/game/index.ts` (the public surface). Reading `snapshot.seed` is fine — the type comes through `../game`'s public `GameState`.
- **`uiStore.ts` is view-only state** — the modal's open flag is exactly this; never move it into `GameState`.
- **"Credits" becomes "About"** everywhere user-facing; the CC-BY attribution text itself is unchanged.

---

### Task 1: `copyText` pure helper and its tests

**Files:**
- Create: `src/ui/copyText.ts`
- Test: `src/ui/copyText.test.ts`

**Interfaces:**
- Produces: `copyText(text: string, write: (text: string) => Promise<unknown>): Promise<boolean>` — resolves `true` when the writer resolves, `false` when it throws or rejects. Task 3's Copy button calls it, passing a closure over `navigator.clipboard.writeText`.

- [ ] **Step 1: Write the failing test**

`src/ui/copyText.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { copyText } from './copyText'

describe('copyText', () => {
  it('reports success when the writer resolves', async () => {
    const written: string[] = []
    const ok = await copyText('run-seed', async (text) => {
      written.push(text)
    })
    expect(ok).toBe(true)
    expect(written).toEqual(['run-seed'])
  })

  it('reports failure when the writer rejects', async () => {
    const ok = await copyText('run-seed', async () => {
      throw new Error('clipboard denied')
    })
    expect(ok).toBe(false)
  })

  it('reports failure when the writer throws synchronously (unavailable clipboard)', async () => {
    const ok = await copyText('run-seed', () => {
      throw new TypeError('navigator.clipboard is undefined')
    })
    expect(ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/ui/copyText.test.ts`
Expected: FAIL — module `./copyText` cannot be resolved.

- [ ] **Step 3: Write the minimal implementation**

`src/ui/copyText.ts`:

```ts
/**
 * Writes `text` to the clipboard and reports whether it succeeded.
 *
 * Pure so the decision is testable without a browser: the caller passes the
 * writer (`navigator.clipboard.writeText` in `About.tsx`), and an absent or
 * denied clipboard — which surfaces as either a synchronous throw or a
 * rejection — resolves to `false`. The seed stays visible on screen either
 * way, so a failure is not an error the UI needs to surface.
 */
export async function copyText(
  text: string,
  write: (text: string) => Promise<unknown>,
): Promise<boolean> {
  try {
    await write(text)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run src/ui/copyText.test.ts`
Expected: PASS — 3 passing.

- [ ] **Step 5: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/copyText.ts src/ui/copyText.test.ts
git commit -m "feat(ui): copyText helper for clipboard writes"
```

---

### Task 2: Retitle the credits modal to About

**Files:**
- Modify: `src/state/uiStore.ts:60-67,110-111` (rename `creditsOpen`/`setCreditsOpen` → `aboutOpen`/`setAboutOpen`, update the doc comment)
- Rename: `src/ui/Credits.tsx` → `src/ui/About.tsx` (component `Credits` → `About`, `aria-label` and header "Credits" → "About")
- Modify: `src/ui/Hud.tsx:2,30` (import and mount `About`)
- Modify: `src/ui/DesktopHud.tsx:13,70,72` (doc comment, `setAboutOpen`, button label "About")
- Modify: `src/ui/MobileHud.tsx:28,92-94` (`setAboutOpen`, button label "About")
- Modify: `src/ui/useDialogFocus.tsx:17` (comment: "matching `Credits`" → "matching `About`")
- Modify: `src/scene/pieceModels.ts:17-18` (comment: "HUD's Credits panel (`src/ui/Credits.tsx`)" → "HUD's About panel (`src/ui/About.tsx`)")

**Interfaces:**
- Consumes: nothing.
- Produces: `useUiStore` field `aboutOpen: boolean` and setter `setAboutOpen: (open: boolean) => void`; component `About` (props none), mounted in `Hud.tsx`. Task 3 adds the seed section to this renamed component.

- [ ] **Step 1: Rename the uiStore field**

In `src/state/uiStore.ts`, rename `creditsOpen` → `aboutOpen` and `setCreditsOpen` → `setAboutOpen` (interface, doc comment, and the two implementation lines). The doc comment becomes "Whether the About modal is open." with the body text otherwise unchanged.

- [ ] **Step 2: Rename the modal file and component**

```bash
git mv src/ui/Credits.tsx src/ui/About.tsx
```

In the file: rename `export function Credits()` → `export function About()`, the store reads `creditsOpen` → `aboutOpen` and `setCreditsOpen` → `setAboutOpen`, the `aria-label="Credits"` → `aria-label="About"`, and the header `<span className="hud__label">Credits</span>` → `About`. Update the file's doc comments that say "credits" to say "About" (e.g. the first comment line "The credits modal: a static attribution panel" → "The About modal: the run seed and the model attribution"). Keep the `MODEL_*` constants and attribution `<p>` untouched.

- [ ] **Step 3: Update Hud.tsx**

`import { About } from './About'` and `<About />` in place of `Credits`. Keep the mount position identical.

- [ ] **Step 4: Update the HUD buttons**

`DesktopHud.tsx`: the doc comment "(`TowerPanel`, `PackShop`, `Credits`)" → "`About`)"; `useUiStore.getState().setCreditsOpen(true)` → `setAboutOpen(true)`; button label "Credits" → "About".
`MobileHud.tsx`: `setCreditsOpen` → `setAboutOpen` (the store selector and the onClick), button label "Credits" → "About".

- [ ] **Step 5: Update the two doc comments**

`useDialogFocus.tsx:17`: "matching `Credits`" → "matching `About`".
`pieceModels.ts:17-18`: "the HUD's Credits panel (`src/ui/Credits.tsx`)" → "the HUD's About panel (`src/ui/About.tsx`)".

- [ ] **Step 6: Verify no stale references**

Run: `rg -n "credits|Credits" src/`
Expected: only the CSS class `.credits__line` (a style hook, left alone) and the attribution comment above it.

- [ ] **Step 7: Run lint, typecheck, and the test suite**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: all clean; 753+ tests passing (no behavior change, pure rename).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): retitle the credits modal to About"
```

---

### Task 3: Add the Run seed section to the About modal

**Files:**
- Modify: `src/ui/About.tsx`

**Interfaces:**
- Consumes: `copyText(text, write): Promise<boolean>` from Task 1; `useGameStore((store) => store.snapshot.seed)` (the `GameState.seed` string, public through `src/game/index.ts`).
- Produces: the "Run seed" section — `snapshot.seed` in a `<code>` element plus a Copy button that flips to "Copied" for 1.5s on success.

- [ ] **Step 1: Add the imports and state**

At the top of `src/ui/About.tsx` add `import { useEffect, useRef, useState } from 'react'` (the file already imports `useRef`), `import { useGameStore } from '../state/store'`, and `import { copyText } from './copyText'`.

Inside `About`, after the existing store reads, add:

```tsx
const seed = useGameStore((store) => store.snapshot.seed)
const [copied, setCopied] = useState(false)
const timerRef = useRef<number | null>(null)

const onCopy = () => {
  void copyText(seed, (text) => navigator.clipboard.writeText(text)).then((ok) => {
    if (!ok) return
    setCopied(true)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied(false), 1500)
  })
}

useEffect(() => {
  return () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }
}, [])
```

All hooks stay above the existing `if (!open) return null`, so hook order is unconditional.

- [ ] **Step 2: Render the seed section**

Between the modal head and the attribution `<p>`, insert:

```tsx
<div className="about__seed">
  <span className="hud__label">Run seed</span>
  <code className="about__seed-code">{seed}</code>
  <button type="button" className="hud__button" onClick={onCopy}>
    {copied ? 'Copied' : 'Copy'}
  </button>
</div>
```

- [ ] **Step 3: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: both clean. (The Copy button is renderer plumbing, deliberately untested — the clipboard decision is already covered by `copyText.test.ts`.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/About.tsx
git commit -m "feat(ui): show and copy the run seed in the About modal"
```

---

### Task 4: Seed row CSS and CLAUDE.md update

**Files:**
- Modify: `src/index.css` (add `.about__seed` rules near the `.credits__line` block at ~line 703)
- Modify: `CLAUDE.md` (the "What does not exist yet" list)

**Interfaces:**
- Consumes: nothing.
- Produces: styled `.about__seed` row; updated doc text.

- [ ] **Step 1: Add the CSS**

Above the `.credits__line` block in `src/index.css`, add:

```css
/* The run seed row in the About modal. The monospace value inherits the
   panel's text colour; the Copy button uses the standard hud__button. */
.about__seed {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.about__seed-code {
  padding: 0.15rem 0.4rem;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 0.3rem;
  background: rgb(0 0 0 / 25%);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.95rem;
  letter-spacing: 0.03em;
}
```

- [ ] **Step 2: Update CLAUDE.md**

In "What does not exist yet", replace:

> **A visible or enterable seed.** Runs are seeded and reproducible, but the seed is internal — `src/state/simulation.ts` mints it and nothing shows it.

with:

> **An enterable seed.** The current run's seed is visible and copyable in the About modal, but there is still no way to start a run from a typed seed.

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src/index.css CLAUDE.md
git commit -m "feat(ui): style the run seed row; note the visible seed in docs"
```

---

## Self-Review Notes

- **Spec coverage:** Behaviour (seed in About modal, Copy → "Copied" 1.5s, no error UI on failure) → Tasks 3. Architecture (`About.tsx`, `uiStore` rename, HUD labels, `copyText` pure helper, `Hud.tsx` mount, comment updates, CSS) → Tasks 1–4. Testing (`copyText.test.ts` only) → Task 1. Non-goals (no seed entry, no game-over screen seed, no engine changes) → honored by omission. CLAUDE.md note → Task 4.
- **Placeholder scan:** every step carries concrete code or an exact file reference; no "similar to", "add error handling", or "fill in later".
- **Type consistency:** `copyText(text, write)` resolves to `Promise<boolean>` in Task 1 and is consumed identically in Task 3; `aboutOpen`/`setAboutOpen` names match across Tasks 2 and 3; the CSS classes in Task 4 match the JSX in Task 3.
