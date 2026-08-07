# Chess Piece Models — Design

**Date:** 2026-08-07
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

Issue #38: the six Piece types are currently procedural low-poly primitives
(cones, boxes, cylinders in `src/scene/pieceGeometry.ts`) that the player must
learn to tell apart — the silhouettes were hand-tuned, but a Bishop still reads
as a small cone and a Rook as a cylinder. The request is to swap in a real
chess-piece model set so the types are immediately identifiable, and to carry
the model's CC-BY 4.0 attribution in the UI, in code, and in the README.

The chosen set is **"Chess Pieces" by Aitordsgn** on Sketchfab, CC-BY 4.0.

## Decision

### The model set

Downloaded from Sketchfab as a `.gltf` + `.bin` + `license.txt` archive
(73.6k triangles, 36.9k vertices across the whole set). The scene graph is
clean: six top-level nodes named `Pawn`, `Queen`, `Rook`, `Knight`, `King`,
`Bishop`, each with two children — a `*_Plastic` body and a `*_Velvet` base.
All node transforms are identity. **Materials are empty** (no textures, no
colour factors), so per-type tinting is free: assign one `MeshStandardMaterial`
per type exactly as `Pieces.tsx` does today.

**The pieces are not consistently oriented in the source.** Pawn, Queen, and
Rook stand on Y (bodies run 0→height, base disks flat in the xz-plane).
Knight, King, and Bishop stand on Z instead (base disks flat in the xy-plane,
bodies running 0→1.10, 0→1.74, 0→1.33 along Z). Extraction must rotate those
three −90° about X to stand them on Y before anything else.

### Scaling — uniform 0.75

A single uniform scale factor of **0.75** applied to all six types. This keeps
the model set's own chess proportions (the height hierarchy Pawn < Rook <
Knight < Bishop < Queen < King is baked into the set, and it is exactly the
legibility signal the issue wants) while fitting the board, whose squares are
1 unit and whose Towers run 0.67–1.15 tall.

| Type | Native H | Scaled H | Footprint |
| --- | --- | --- | --- |
| Pawn | 0.82 | 0.62 | 0.34 |
| Rook | 0.98 | 0.74 | 0.42 |
| Knight | 1.10 | 0.82 | 0.43 |
| Bishop | 1.33 | 1.00 | 0.40 |
| Queen | 1.49 | 1.12 | 0.47 |
| King | 1.74 | 1.31 | 0.47 |

The King ends up the tallest thing on the board — deliberate, it is the boss
piece. Every footprint stays comfortably inside a 1-unit square. The uniform
factor keeps the set's proportions intact; per-type factors are not needed.

**REST_Y becomes 0 for every type.** Each piece's origin sits at its base
centre in the source, and after the orientation + base-translate below every
origin is exactly the base of the piece resting on the board. The existing
`REST_Y_BY_TYPE` half-height table is deleted and replaced by the constant 0.
The hop arc, health-shrink, whiff flash, promotion pop, tier rings, buff ring,
and leak lunge all mutate the mesh transform and are untouched.

### Extraction pipeline (`src/scene/pieceModels.ts`, new)

A pure, non-component module (the `pieceColours.ts` precedent) that takes the
loaded GLTF and produces, per Piece type, a single `BufferGeometry`:

1. Find the type's top-level node by name.
2. Collect its two part meshes. Both parts share the same attribute layout
   (`NORMAL`, `POSITION`, `TEXCOORD_0`, `TEXCOORD_1`, indexed), so they merge
   cleanly with `mergeGeometries`. Merging discards the Velvet/Plastic material
   distinction — irrelevant, since we tint per type anyway.
3. Rotate Knight, King, and Bishop −90° about X (they stand on Z in the
   source; the others are already upright).
4. Scale uniformly by 0.75.
5. Translate so the base sits exactly at y = 0 (source bases sit at ≈−0.004,
   negligible but worth zeroing for cleanliness).
6. Cache the merged geometry per Piece type id, keyed by the model URL, so
   `Pieces.tsx` and `PieceExits.tsx` share the same geometry instances.

`useLoader(GLTFLoader, url)` loads the model. The module exports
`GEOMETRY_BY_TYPE` in the same shape `pieceGeometry.ts` exports today, so both
consumers change only their import source, and a single `REST_Y = 0` constant
replacing the per-type `REST_Y_BY_TYPE` lookup. The `pieceGeometry.ts`
primitive factories are deleted.

### Asset location

The archive's contents move to **`public/models/chess_pieces/`** —
`scene.gltf`, `scene.bin`, and `license.txt` — served by Vite at a stable URL
and committed to the repo. The raw `chess_pieces.zip` at the project root is
removed (its contents are preserved in `public/`).

### Suspense

`useLoader` suspends while the model streams in, and there is no boundary in
the tree today. `GameScene.tsx` wraps `<Pieces/>` and `<PieceExits/>` in a
`<Suspense fallback={null}>` so the board, Towers, and Core render immediately
and Pieces pop in when the model is ready. The whole-model single file keeps
this to one suspension.

## Attribution (CC-BY 4.0 — "appropriate credit")

The CC-BY license requires the author be credited. The model's own
`license.txt` gives the exact recommended text. The game must carry it in three
places, per the issue:

- **UI.** A **"Credits" button** in the HUD action row opens a modal panel
  (the `.modal` style `PackShop` already uses) showing the full attribution:
  title + source link, author + profile link, license link, and the license's
  recommended credit sentence. `creditsOpen` + setter live in `uiStore.ts` —
  view-only UI state, the sanctioned home for it.
- **Code.** The attribution block (title, author, source URL, license URL) is a
  comment at the top of `pieceModels.ts`, and `license.txt` is committed with
  the assets in `public/models/chess_pieces/`.
- **README.** A short **Attribution** section carrying the same credit. The
  README is currently empty and stays otherwise empty — the issue asks only for
  the credit here, and writing a full README is out of scope.

## Architecture

- **`public/models/chess_pieces/`** (new): scene.gltf, scene.bin, license.txt.
- **`src/scene/pieceModels.ts`** (new): extraction + cache, attribution comment.
- **`src/scene/GameScene.tsx`**: `<Suspense>` around the two Piece components.
- **`src/scene/Pieces.tsx`** and **`src/scene/PieceExits.tsx`**: import
  geometry/REST_Y from `pieceModels` instead of `pieceGeometry`.
- **`src/scene/pieceGeometry.ts`**: deleted.
- **`src/ui/Hud.tsx`**: Credits button in the actions row.
- **`src/ui/Credits.tsx`** (new): the attribution modal.
- **`src/state/uiStore.ts`**: `creditsOpen` + `setCreditsOpen`.
- **`src/index.css`**: modal styles follow the existing `.modal__*` pattern.
- **`README.md`**: Attribution section.
- **`chess_pieces.zip`**: removed from the project root.

## Testing

`src/scene/` is deliberately untested and excluded from coverage, so no unit
tests are added. Verification is `pnpm lint`, `pnpm typecheck`, `pnpm test:run`
(unchanged engine suite), and `pnpm build`. The extraction logic lives in a
pure module rather than a `.tsx` component so nothing hides inside a component
file — the CLAUDE.md discipline that decisions live where they can be found,
even if the renderer is not unit-tested.

## Open questions

- **The scale factor is a placeholder for review.** 0.75 makes the King the
  tallest thing on the board; if it reads too tall, 0.65 (King 1.13, Pawn 0.53)
  is the fallback. The uniform factor and the per-type height ordering are
  fixed; only the number moves.
