# Chess Piece Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six procedural piece silhouettes with Aitordsgn's CC-BY 4.0 chess-piece model set, carrying the attribution in the UI, code, and README.

**Architecture:** The model archive lives in `public/models/chess_pieces/` and is loaded once via `useLoader(GLTFLoader, url)`. A new pure module `src/scene/pieceModels.ts` extracts each piece's two parts from the GLTF, merges them into one shared `BufferGeometry` per type, orients Knight/King/Bishop upright, applies a uniform 0.75 scale, and translates each base to y=0. `Pieces.tsx` and `PieceExits.tsx` keep their shared `{geometry, material}` per-type structure — they just source geometry from `pieceModels.ts` instead of `pieceGeometry.ts`. A Credits modal in the HUD plus a README section carry the CC-BY attribution.

**Tech Stack:** TypeScript (strict), React 19, React Three Fiber + drei, three 0.185, Vite 8, Vitest 4, zustand.

## Global Constraints

- **Renderer boundary (ESLint-enforced):** `src/game/` and `src/data/` must never import React or three.js. This plan only touches `src/scene/`, `src/ui/`, `src/state/`, `public/`, and `README.md` — all on the renderer side, all free to import three.
- **Inbound barrel rule (ESLint-enforced):** `src/scene/`, `src/ui/`, `src/state/` must import engine code through the `../game` barrel, never a module inside it. The plan follows this (`import type { PieceTypeId } from '../game'`).
- **Base path:** production builds serve from `/cards-v-chess/` (see `vite.config.ts`). Any runtime URL must be built with `import.meta.env.BASE_URL`, never hardcoded as `/...`.
- **Share geometries/materials across instances** (CLAUDE.md discipline) — one `BufferGeometry` per Piece type, never per piece.
- **No `Math.random` in `src/game` or `src/data`** — untouched here.
- **`src/scene/` is deliberately untested** (excluded from coverage). Verification is `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, and `pnpm build`.
- **Scale factor 0.75** is the agreed value (King = 1.31, Pawn = 0.62). It is a placeholder for visual review — the fallback is 0.65. The uniform factor and per-type height ordering are fixed; only the number moves.
- **Attribution text** (verbatim, from the model's `license.txt`): "This work is based on "Chess Pieces" (https://sketchfab.com/3d-models/chess-pieces-d2d7fec42d0a405d910b3ef751b30f38) by aitordsgn (https://sketchfab.com/aitordsgn) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)".

---

### Task 1: Install dependencies and stage the model assets

**Files:**
- Create: `public/models/chess_pieces/scene.gltf`, `public/models/chess_pieces/scene.bin`, `public/models/chess_pieces/license.txt` (extracted from `chess_pieces.zip` at the repo root)
- Delete: `chess_pieces.zip`
- The worktree has no `node_modules`, so nothing can be verified until `pnpm install` runs.

**Interfaces:**
- Consumes: the already-downloaded `chess_pieces.zip` at the repo root (verified contents: `scene.gltf`, `scene.bin`, `license.txt`).
- Produces: the asset files under `public/`, served by Vite at `import.meta.env.BASE_URL + 'models/chess_pieces/scene.gltf'` (and the `.bin` resolved relative to it by GLTFLoader).

- [ ] **Step 1: Install dependencies**

```bash
pnpm install
```

Expected: resolves from `pnpm-lock.yaml` with no errors. Verify `node_modules/three` exists.

- [ ] **Step 2: Extract the archive into `public/`**

```bash
mkdir -p public/models/chess_pieces
unzip -o chess_pieces.zip -d public/models/chess_pieces
rm chess_pieces.zip
```

- [ ] **Step 3: Verify the staged files**

Run: `ls -la public/models/chess_pieces/`
Expected: `license.txt`, `scene.bin`, `scene.gltf` present, and `chess_pieces.zip` gone.

Run: `head -c 300 public/models/chess_pieces/license.txt`
Expected: the CC-BY-4.0 license block crediting "Chess Pieces" by aitordsgn.

Run: `git status --short`
Expected: `public/models/chess_pieces/` untracked, nothing else changed.

- [ ] **Step 4: Commit**

```bash
git add public/models/chess_pieces
git commit -m "feat(models): add Aitordsgn chess piece GLTF assets under public"
```

---

### Task 2: Create `src/vite-env.d.ts` and the `pieceModels` module

**Files:**
- Create: `src/vite-env.d.ts`
- Create: `src/scene/pieceModels.ts`

**Interfaces:**
- Consumes: nothing yet (self-contained).
- Produces:
  - `MODEL_URL: string` — the base-aware asset URL.
  - `PIECE_TYPE_IDS: PieceTypeId[]` — the six types in the union's order.
  - `REST_Y = 0` — the board-rest height for every type.
  - `extractPieceGeometry(scene: Object3D, typeId: PieceTypeId): BufferGeometry` — pure, node-verifiable extraction.
  - `usePieceModels(): Record<PieceTypeId, BufferGeometry>` — the React hook both consumers call; suspends until the model loads.

**Why `vite-env.d.ts`:** `import.meta.env.BASE_URL` is used in `pieceModels.ts` and the repo has no Vite client types reference, so `tsc` would fail. This is the standard Vite-scaffolded file.

- [ ] **Step 1: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 2: Create `src/scene/pieceModels.ts`**

```ts
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type BufferGeometry, type Mesh, type Object3D } from 'three'
import type { PieceTypeId } from '../game'

/**
 * ATTRIBUTION — CC-BY 4.0.
 *
 * The Chess Piece models are from "Chess Pieces" by aitordsgn
 * (https://sketchfab.com/aitordsgn), published on Sketchfab
 * (https://sketchfab.com/3d-models/chess-pieces-d2d7fec42d0a405d910b3ef751b30f38),
 * licensed under Creative Commons Attribution 4.0
 * (https://creativecommons.org/licenses/by/4.0/).
 *
 * The model archive lives in `public/models/chess_pieces/` alongside its
 * `license.txt`. The same credit appears in the HUD's Credits panel
 * (`src/ui/Credits.tsx`) and in `README.md`.
 */

/** Base-aware URL: dev serves at `/`, GitHub Pages at `/cards-v-chess/`. */
export const MODEL_URL = `${import.meta.env.BASE_URL}models/chess_pieces/scene.gltf`

/** Every Piece type the game renders, in the type union's declared order. */
export const PIECE_TYPE_IDS: PieceTypeId[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

/** The model's top-level scene node name for each Piece type. */
const NODE_NAME_BY_TYPE: Record<PieceTypeId, string> = {
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  rook: 'Rook',
  queen: 'Queen',
  king: 'King',
}

/**
 * Knight, King, and Bishop stand on Z in the source model (their velvet base
 * disks lie in the xy-plane and their bodies run along +Z); the others already
 * stand on Y. These rotate −90° about X so every piece stands upright on the
 * board. Measured from the GLTF accessor bounds, not assumed.
 */
const ROTATE_ON_X: ReadonlySet<PieceTypeId> = new Set(['knight', 'king', 'bishop'])

/**
 * Uniform scale so the pieces fit 1-unit board squares. Placeholder for visual
 * review — see the design doc's open question; 0.65 is the fallback.
 */
const MODEL_SCALE = 0.75

/** Every piece's origin sits at its base after extraction, so all rest on the
 * board at the same height. */
export const REST_Y = 0

let cached: Record<PieceTypeId, BufferGeometry> | null = null

/**
 * The shared per-type geometries, one instance each, built once and cached for
 * the app's lifetime. `useLoader` suspends until the model is loaded, so
 * callers must be under a Suspense boundary (see GameScene).
 */
export function usePieceModels(): Record<PieceTypeId, BufferGeometry> {
  const gltf = useLoader(GLTFLoader, MODEL_URL)
  if (cached === null) {
    cached = {} as Record<PieceTypeId, BufferGeometry>
    for (const typeId of PIECE_TYPE_IDS) {
      cached[typeId] = extractPieceGeometry(gltf.scene, typeId)
    }
  }
  return cached
}

/**
 * Extract one Piece type from the loaded scene: merge its two parts (the
 * *_Plastic body and the *_Velvet base) into a single geometry, stand it on Y,
 * scale it, and translate so the base sits at y = 0. Pure over a three.js
 * scene, so it can be verified headlessly; `usePieceModels` is the only React
 * in this file.
 */
export function extractPieceGeometry(scene: Object3D, typeId: PieceTypeId): BufferGeometry {
  const node = scene.getObjectByName(NODE_NAME_BY_TYPE[typeId])
  if (!node) throw new Error(`No "${NODE_NAME_BY_TYPE[typeId]}" node in ${MODEL_URL}`)

  node.updateMatrixWorld(true)
  const parts: BufferGeometry[] = []
  node.traverse((child) => {
    if (!(child as Mesh).isMesh) return
    const mesh = child as Mesh
    const part = mesh.geometry.clone()
    part.applyMatrix4(mesh.matrixWorld)
    parts.push(part)
  })

  const merged = mergeGeometries(parts)
  if (!merged) throw new Error(`Could not merge "${NODE_NAME_BY_TYPE[typeId]}" parts`)

  if (ROTATE_ON_X.has(typeId)) merged.rotateX(-Math.PI / 2)
  merged.scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE)
  merged.computeBoundingBox()
  const minY = merged.boundingBox?.min.y ?? 0
  merged.translate(0, -minY, 0)

  return merged
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (If `three/examples/...` fails to resolve, that is a three 0.185 exports-map change — report it rather than switching import styles blindly.)

- [ ] **Step 4: Verify the extraction math headlessly**

The extraction must produce the design table's dimensions. Create a throwaway script at the repo root (do NOT commit it):

```js
import { pathToFileURL } from 'node:url'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const loader = new GLTFLoader()
const url = pathToFileURL('public/models/chess_pieces/scene.gltf').href
const gltf = await loader.loadAsync(url)

const NODE = { pawn: 'Pawn', knight: 'Knight', bishop: 'Bishop', rook: 'Rook', queen: 'Queen', king: 'King' }
const ROTATE = new Set(['knight', 'king', 'bishop'])
const SCALE = 0.75

for (const [typeId, name] of Object.entries(NODE)) {
  const node = gltf.scene.getObjectByName(name)
  node.updateMatrixWorld(true)
  const parts = []
  node.traverse((child) => {
    if (!child.isMesh) return
    const g = child.geometry.clone()
    g.applyMatrix4(child.matrixWorld)
    parts.push(g)
  })
  const merged = mergeGeometries(parts)
  if (ROTATE.has(typeId)) merged.rotateX(-Math.PI / 2)
  merged.scale(SCALE, SCALE, SCALE)
  merged.computeBoundingBox()
  const b = merged.boundingBox
  const height = (b.max.y - b.min.y).toFixed(3)
  const foot = Math.max(b.max.x - b.min.x, b.max.z - b.min.z).toFixed(3)
  const baseY = b.min.y.toFixed(4)
  console.log(typeId.padEnd(8), 'H:', height, 'foot:', foot, 'baseY:', baseY)
}
```

Run: `node verify-models.mjs`
Expected (matches the design table, `baseY` at 0 means the base-translate works):

```
pawn     H: 0.617 foot: 0.344 baseY: 0.0000
rook     H: 0.738 foot: 0.415 baseY: 0.0000
knight   H: 0.824 foot: 0.434 baseY: 0.0000
bishop   H: 0.997 foot: 0.402 baseY: 0.0000
queen    H: 1.117 foot: 0.470 baseY: 0.0000
king     H: 1.309 foot: 0.468 baseY: 0.0000
```

If `baseY` is large-negative and `foot` is the height (or the heights look inverted for knight/king/bishop), the rotateX sign is wrong — flip `-Math.PI / 2` to `Math.PI / 2` in both the script and the module and re-run.

Delete the script when it passes.

- [ ] **Step 5: Lint + full test suite**

Run: `pnpm lint && pnpm test:run`
Expected: lint clean, all existing tests still pass (nothing touched engine state yet).

- [ ] **Step 6: Commit**

```bash
git add src/vite-env.d.ts src/scene/pieceModels.ts
git commit -m "feat(models): add pieceModels module extracting per-type GLTF geometries"
```

---

### Task 3: Wire `Pieces.tsx` to the shared models

**Files:**
- Modify: `src/scene/Pieces.tsx`

**Interfaces:**
- Consumes: `usePieceModels()`, `PIECE_TYPE_IDS`, `REST_Y` from `./pieceModels`.
- Produces: live Pieces rendered with the model geometry; the shared geometry is NOT disposed by this component (the module cache owns it).

**Key correctness point:** the current cleanup disposes `geometry` from `resources.byType`. The model geometries are now module-cached and shared with `PieceExits.tsx` — disposing them here would free geometry the other consumer still renders with. Dispose only the materials this component creates.

- [ ] **Step 1: Change the import**

Replace (line 16):

```ts
import { GEOMETRY_BY_TYPE, PIECE_TYPE_IDS, REST_Y_BY_TYPE } from './pieceGeometry'
```

with:

```ts
import { PIECE_TYPE_IDS, REST_Y, usePieceModels } from './pieceModels'
```

- [ ] **Step 2: Source geometry from the hook**

After the `const pieces = useGameStore(...)` selector (line 32), add:

```ts
const models = usePieceModels()
```

Then in the `resources` `useMemo` (lines 36–56), replace the per-type geometry factory:

```ts
    for (const typeId of PIECE_TYPE_IDS) {
      byType.set(typeId, {
        geometry: GEOMETRY_BY_TYPE[typeId](),
        material: new MeshStandardMaterial({ color: PIECE_COLOURS[typeId], flatShading: true }),
      })
    }
```

with:

```ts
    for (const typeId of PIECE_TYPE_IDS) {
      byType.set(typeId, {
        geometry: models[typeId],
        material: new MeshStandardMaterial({ color: PIECE_COLOURS[typeId], flatShading: true }),
      })
    }
```

and change the memo's dependency array from `[]` to `[models]` (the hook returns a stable module-cached object, so this memo still runs once).

- [ ] **Step 3: Stop disposing the shared geometries**

Replace the cleanup effect (lines 58–69):

```ts
  useEffect(
    () => () => {
      for (const { geometry, material } of resources.byType.values()) {
        geometry.dispose()
        material.dispose()
      }
      resources.ring.dispose()
      resources.ringMaterial.dispose()
      for (const material of resources.tierRingMaterials.values()) material.dispose()
    },
    [resources],
  )
```

with:

```ts
  useEffect(
    () => () => {
      // The model geometries are owned by pieceModels.ts and shared with
      // PieceExits.tsx, so dispose only what this component created.
      for (const { material } of resources.byType.values()) material.dispose()
      resources.ring.dispose()
      resources.ringMaterial.dispose()
      for (const material of resources.tierRingMaterials.values()) material.dispose()
    },
    [resources],
  )
```

- [ ] **Step 4: Use the constant rest height**

Replace (line 154):

```ts
    const restY = REST_Y_BY_TYPE[typeId]
```

with:

```ts
    const restY = REST_Y
```

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: clean. (`REST_Y_BY_TYPE` should no longer appear anywhere in the file — confirm with a search.)

- [ ] **Step 6: Commit**

```bash
git add src/scene/Pieces.tsx
git commit -m "feat(models): render live pieces from the shared GLTF geometries"
```

---

### Task 4: Wire `PieceExits.tsx` to the shared models

**Files:**
- Modify: `src/scene/PieceExits.tsx`

**Interfaces:**
- Consumes: `usePieceModels()`, `PIECE_TYPE_IDS`, `REST_Y` from `./pieceModels`.
- Produces: kill-burst and leak-lunge ghosts rendered with the same model geometry as live pieces. The ghost material stays this component's own (emissive per-type colour); only the geometry is shared.

**Same disposal caveat as Task 3:** the ghost cleanup must not dispose the shared model geometries.

- [ ] **Step 1: Change the import**

Replace (line 9):

```ts
import { GEOMETRY_BY_TYPE, PIECE_TYPE_IDS, REST_Y_BY_TYPE } from './pieceGeometry'
```

with:

```ts
import { PIECE_TYPE_IDS, REST_Y, usePieceModels } from './pieceModels'
```

- [ ] **Step 2: Source geometry from the hook**

Before the `resources` `useMemo` (line 52), add:

```ts
  const models = usePieceModels()
```

Then replace the geometry factory inside the memo:

```ts
      byType.set(typeId, {
        geometry: GEOMETRY_BY_TYPE[typeId](),
        material: new MeshStandardMaterial({
          color: PIECE_COLOURS[typeId],
          emissive: PIECE_COLOURS[typeId],
          emissiveIntensity: 0.6,
          flatShading: true,
        }),
      })
```

with:

```ts
      byType.set(typeId, {
        geometry: models[typeId],
        material: new MeshStandardMaterial({
          color: PIECE_COLOURS[typeId],
          emissive: PIECE_COLOURS[typeId],
          emissiveIntensity: 0.6,
          flatShading: true,
        }),
      })
```

and change the memo's dependency array from `[]` to `[models]`.

- [ ] **Step 3: Stop disposing the shared geometries**

Replace the cleanup effect (lines 70–78):

```ts
  useEffect(
    () => () => {
      for (const { geometry, material } of resources.values()) {
        geometry.dispose()
        material.dispose()
      }
    },
    [resources],
  )
```

with:

```ts
  useEffect(
    () => () => {
      // The model geometries are owned by pieceModels.ts and shared with
      // Pieces.tsx, so dispose only what this component created.
      for (const { material } of resources.values()) material.dispose()
    },
    [resources],
  )
```

- [ ] **Step 4: Use the constant rest height**

Replace (line 192):

```ts
    const restY = REST_Y_BY_TYPE[ghost.typeId]
```

with:

```ts
    const restY = REST_Y
```

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: clean. Confirm `REST_Y_BY_TYPE` and `GEOMETRY_BY_TYPE` no longer appear anywhere in `src/`.

- [ ] **Step 6: Commit**

```bash
git add src/scene/PieceExits.tsx
git commit -m "feat(models): render piece-exit ghosts from the shared GLTF geometries"
```

---

### Task 5: Delete `pieceGeometry.ts` and add the Suspense boundary

**Files:**
- Delete: `src/scene/pieceGeometry.ts`
- Modify: `src/scene/GameScene.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `useLoader` can now suspend (`Pieces.tsx` and `PieceExits.tsx` both call `usePieceModels`), and there is no boundary today — without one, React unmounts the whole tree on the first load. The board, Core, and Towers render immediately; Pieces and ghosts pop in when the model is ready.

- [ ] **Step 1: Delete the primitives module**

```bash
git rm src/scene/pieceGeometry.ts
```

Verify nothing imports it: `grep -rn "pieceGeometry" src/` → no matches.

- [ ] **Step 2: Add Suspense to `GameScene.tsx`**

Add to the imports (line 1):

```ts
import { Suspense } from 'react'
```

Wrap the two model-driven components (lines 36–37):

```tsx
      <Pieces board={board} />
      <PieceExits board={board} flash={coreFlash} />
```

becomes:

```tsx
      <Suspense fallback={null}>
        <Pieces board={board} />
        <PieceExits board={board} flash={coreFlash} />
      </Suspense>
```

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all clean; `vite build` succeeds and bundles the model URL.

- [ ] **Step 4: Commit**

```bash
git add -u
git add src/scene/GameScene.tsx
git commit -m "feat(models): suspend on the model load with the board visible behind it"
```

---

### Task 6: Add `creditsOpen` to `uiStore`

**Files:**
- Modify: `src/state/uiStore.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `creditsOpen: boolean` and `setCreditsOpen: (open: boolean) => void`, consumed by `Hud.tsx` (button) and `Credits.tsx` (modal).

**Why here:** `uiStore.ts` is the sanctioned home for view-only UI state — the same category as `packShopOpen`. It is excluded from coverage thresholds by `vite.config.ts`.

- [ ] **Step 1: Add the state to the interface**

In `interface UiStore`, after the `packShopOpen` block (lines 46–53), add:

```ts
  /**
   * Whether the credits modal is open.
   *
   * Purely view state: the attribution is static text, so nothing about it
   * lives in `GameState`.
   */
  creditsOpen: boolean
  setCreditsOpen: (open: boolean) => void
```

- [ ] **Step 2: Add the store implementation**

In the `create<UiStore>` call, after `setPackShopOpen` (line 79), add:

```ts
  creditsOpen: false,
  setCreditsOpen: (creditsOpen) => set({ creditsOpen }),
```

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/state/uiStore.ts
git commit -m "feat(credits): add creditsOpen view state to uiStore"
```

---

### Task 7: Build the Credits modal and wire the HUD button

**Files:**
- Create: `src/ui/Credits.tsx`
- Modify: `src/ui/Hud.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `creditsOpen` / `setCreditsOpen` from `useUiStore`; the `.modal` / `.modal__scrim` / `.modal__panel` / `.modal__head` CSS classes already used by `PackShop.tsx`.
- Produces: the CC-BY attribution modal and a HUD "Credits" button opening it.

**Attribution content:** the four constants below are the exact "appropriate credit" the license asks for — title, author, and license, each linked, plus the verbatim recommended sentence.

- [ ] **Step 1: Create `src/ui/Credits.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { useUiStore } from '../state/uiStore'

/**
 * The CC-BY 4.0 attribution for the chess piece models.
 *
 * This work is based on "Chess Pieces" by Aitordsgn. The same credit lives in
 * `src/scene/pieceModels.ts` (where the models load), in
 * `public/models/chess_pieces/license.txt`, and in `README.md`.
 */
const MODEL_TITLE = 'Chess Pieces'
const MODEL_URL = 'https://sketchfab.com/3d-models/chess-pieces-d2d7fec42d0a405d910b3ef751b30f38'
const MODEL_AUTHOR = 'aitordsgn'
const MODEL_AUTHOR_URL = 'https://sketchfab.com/aitordsgn'
const MODEL_LICENSE = 'CC-BY-4.0'
const MODEL_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/'

/**
 * The credits modal: a static attribution panel, opened from the HUD.
 *
 * A modal for consistency with the pack shop's interaction (scrim + Escape to
 * close), not because it needs modal semantics — it holds no form and no
 * state. The simpler of the two: no focus trap, just move focus in on open and
 * hand it back on close, following `PackShop.tsx`.
 */
export function Credits() {
  const open = useUiStore((store) => store.creditsOpen)
  const setOpen = useUiStore((store) => store.setCreditsOpen)
  const panelRef = useRef<HTMLDivElement>(null)

  // Remember where focus came from, move it into the dialog, and hand it back
  // on the way out — the `PackShop` precedent.
  useEffect(() => {
    if (!open) return

    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()

    return () => returnFocus?.focus()
  }, [open])

  // Escape closes, like any modal. Bound only while open.
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Credits">
      <button type="button" className="modal__scrim" aria-label="Close" onClick={() => setOpen(false)} />

      <div className="modal__panel" ref={panelRef} tabIndex={-1}>
        <div className="modal__head">
          <span className="hud__label">Credits</span>
        </div>

        <p className="credits__line">
          This work is based on{' '}
          <a href={MODEL_URL} target="_blank" rel="noreferrer">
            {MODEL_TITLE}
          </a>{' '}
          by{' '}
          <a href={MODEL_AUTHOR_URL} target="_blank" rel="noreferrer">
            {MODEL_AUTHOR}
          </a>{' '}
          licensed under{' '}
          <a href={MODEL_LICENSE_URL} target="_blank" rel="noreferrer">
            {MODEL_LICENSE}
          </a>
          .
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the Credits button to the HUD**

In `src/ui/Hud.tsx`, add to the imports:

```ts
import { Credits } from './Credits'
```

Add a button in the `.hud__actions` row, after the "Buy a pack" button (after line 96):

```tsx
          <button
            type="button"
            className="hud__button"
            onClick={() => useUiStore.getState().setCreditsOpen(true)}
          >
            Credits
          </button>
```

And render the modal next to the other modals, after `<PackShop />` (line 114):

```tsx
      <Credits />
```

- [ ] **Step 3: Style the credit line**

Append to `src/index.css`, after the `.modal__cancel` block (line 579):

```css
/* The credits attribution. Teal links match the teal used for selection
   elsewhere; the text inherits the modal panel's colour. */
.credits__line {
  margin: 0;
  line-height: 1.5;
}

.credits__line a {
  color: #4fd1c5;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Credits.tsx src/ui/Hud.tsx src/index.css
git commit -m "feat(credits): add CC-BY attribution modal and HUD button"
```

---

### Task 8: Add the attribution to the README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the model's `license.txt` recommended credit.
- Produces: the README attribution section the issue requires. The README is empty and stays otherwise empty — the issue asks only for the credit here.

- [ ] **Step 1: Write the Attribution section**

Replace the empty `README.md` with:

```markdown
# Cards V Chess

## Attribution

This work is based on "Chess Pieces" (https://sketchfab.com/3d-models/chess-pieces-d2d7fec42d0a405d910b3ef751b30f38) by aitordsgn (https://sketchfab.com/aitordsgn) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
```

- [ ] **Step 2: Verify**

Run: `git diff README.md`
Expected: only the new content.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(models): carry the CC-BY attribution in the README"
```

---

### Task 9: Final verification pass

**Files:** none.

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm test:coverage && pnpm build`
Expected: everything green. Coverage thresholds for `src/game/` and `src/state/` must hold (nothing in those trees changed, so they will).

- [ ] **Step 2: Sanity-check the asset URL**

Run: `grep -n "models/chess_pieces" src/scene/pieceModels.ts`
Expected: `MODEL_URL` is built from `import.meta.env.BASE_URL` — never a hardcoded leading `/` that would break the `/cards-v-chess/` production base.

- [ ] **Step 3: Verify the model files are tracked**

Run: `git ls-files public/models/chess_pieces/`
Expected: `license.txt`, `scene.bin`, `scene.gltf` all tracked; `chess_pieces.zip` is not (it was deleted in Task 1).

---

## Self-Review Notes

- **Spec coverage:** every spec requirement maps to a task — assets to public/ (Task 1), the extraction module (Task 2), live pieces (Task 3), ghosts (Task 4), Suspense + primitive deletion (Task 5), credits state (Task 6), credits modal + HUD button (Task 7), README (Task 8), verification (Task 9). The scale factor 0.75 lives in one place (`pieceModels.ts`) per the "number moves, proportions don't" decision.
- **Type consistency:** `usePieceModels` returns `Record<PieceTypeId, BufferGeometry>` everywhere it is consumed; `REST_Y` is a number constant, not a record — Tasks 3 and 4 both use it bare. `PIECE_TYPE_IDS` matches the `PieceTypeId` union order (`pawn, knight, bishop, rook, queen, king`).
- **Disposal correctness:** the module cache in `pieceModels.ts` owns the geometries; neither consumer disposes them. Each component disposes only its own materials. This is called out in both Tasks 3 and 4 because getting it wrong frees geometry the other consumer still renders.
- **Suspense placement:** both model consumers are wrapped by the single boundary in Task 5. The board/Towers/Core stay visible during the (one) model load.
- **Attribution consistency:** the same credit appears verbatim in `pieceModels.ts`, `Credits.tsx`, `README.md`, and the committed `license.txt`.
