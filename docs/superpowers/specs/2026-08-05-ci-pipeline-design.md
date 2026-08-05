# CI Pipeline — Design

**Date:** 2026-08-05
**Status: FROZEN decision record. Not the current design.**

> This document records the decisions taken on 2026-08-05 when CI was introduced, and why.
> It is **not updated** as the pipeline evolves.
>
> **For what CI does now, read `.github/workflows/ci.yml` and the "Commands" section of [`CLAUDE.md`](../../../CLAUDE.md).**
>
> The lasting value here is the **coverage-denominator analysis** in decision 4 — the reason thresholds
> are scoped per-directory rather than set globally. That argument still holds, and re-deriving it costs
> a measurement pass.

## Goal

Add a CI pipeline on GitHub Actions that gates merges into `main` and keeps a playable build of `main`
deployed. The repository is `braydend/cards-v-chess`; the project is a Vite + React Three Fiber
TypeScript game managed with pnpm and tested with Vitest.

Five goals, in priority order. The first four are the gate; the fifth is the payoff.

1. **No broken code reaches `main`** — `lint`, `typecheck`, `test`, and `build` pass on every pull request.
2. **The architectural boundary holds.** `eslint.config.js` already fails the build when `src/game/` or
   `src/data/` imports React or Three.js. CI turns that from a rule a local run could skip into one
   a merge cannot.
3. **The determinism invariant holds.** `Math.random` must never appear in `src/game/`. Before this work
   that was documented in `CLAUDE.md` but enforced nowhere.
4. **The engine stays well-tested** as the code catches up to the design, via a coverage floor scoped to
   the parts of the tree that are meant to be tested.
5. **`main` is always playable** at `https://braydend.github.io/cards-v-chess/`.

## Baseline

Measured on `main` at commit `ca4a9db`, before any changes:

| Check | Result | Approx. time |
| --- | --- | --- |
| `pnpm lint` | pass | ~1s |
| `pnpm typecheck` | pass | ~1s |
| `pnpm test:run` | 38/38 pass, 3 files | 163ms |
| `pnpm build` | pass | 1.9s |

Local toolchain: Node 22.14.0, pnpm 10.28.1.

**This baseline is the single most important input to the design.** The checks total roughly four
seconds. Everything else in a CI run — checkout, Node setup, `pnpm install` — costs an order of
magnitude more. Every structural decision below follows from that ratio.

## Decisions

### 1. Land CI on `main`, not alongside the code

**Considered:** basing the CI work on the unmerged `init` branch; adding the workflow to an empty `main`
ahead of the code; merging `init` into `main` first.

**Chosen:** merge `init` into `main` first, then build CI on top of `main`.

At the time this work started, `main` held only an empty `README.md` — the entire project lived on the
unmerged `init` branch. A workflow added to `main` as it stood would have run `pnpm install` against a
repository with no `package.json`.

`init` was merged via PR #1 (`ca4a9db`) and this work rebased onto the result. CI therefore protects
`main` from its first commit, and there is no long-lived divergent branch for it to grow stale against.

### 2. One workflow file, two jobs — not parallel per-check jobs

**Considered:** four parallel jobs (`lint`, `typecheck`, `test`, `build`); one job running all checks;
a separate deploy workflow triggered by `workflow_run`.

**Chosen:** one file, `.github/workflows/ci.yml`, containing two jobs.

- **`checks`** runs on `pull_request` and `push: main`. Checkout → pnpm → Node (with pnpm cache) →
  `install --frozen-lockfile` → `lint` → `typecheck` → `test:coverage` → `build`. On `main` only, it
  also uploads the GitHub Pages artifact.
- **`deploy`** declares `needs: checks` and `if: github.ref == 'refs/heads/main'`. It publishes the
  artifact that `checks` already built.

Three reasons for one checks job rather than four:

1. **Parallel jobs would be slower, not faster.** Each job pays ~20s of setup to run ~1s of work.
   Fanning out multiplies the setup cost by four and saves nothing.
2. **`needs: checks` makes a red `main` undeployable.** A separate `workflow_run`-triggered deploy
   workflow achieves the same thing with more indirection and added latency.
3. **Building once.** `checks` already produces `dist/`, so uploading the Pages artifact there spares
   `deploy` a second checkout, install, and build.

The artifact upload is conditioned on `main` so pull requests do not pay for it.

### 3. Keep `typecheck` as its own step despite the redundancy

`pnpm build` is `tsc --noEmit && vite build`, so it already type-checks. Running `pnpm typecheck`
separately duplicates that work.

Kept anyway. It costs about one second and buys a failure labelled `typecheck` rather than a failure
labelled `build` that turns out to be a type error. At this cost the clearer signal wins.

### 4. Coverage thresholds are scoped per-directory, not global

**Considered:** a single global coverage floor; per-directory floors; no coverage gate at all.

**Chosen:** per-directory floors, with an explicit `coverage.include`.

A global floor is actively misleading here, for two reasons found by measuring rather than guessing.

**The default denominator lies.** Vitest only counts files the tests import. Reported that way, the
project sits at **92.6% statements**. Forcing an honest `src/**/*.{ts,tsx}` denominator gives
**60.1% statements and 41.7% functions**. The entire gap is `src/scene/` and `src/ui/`, which sit at 0%
— deliberately. `CLAUDE.md` states the engine is testable without a browser and the renderer is not, so
renderer coverage is a number the project has decided not to chase.

**Worse, the default denominator makes the gate useless precisely when it matters.** Without an explicit
`coverage.include`, adding a brand-new untested `src/game/newThing.ts` does not move the coverage number
at all, because no test imports it. A floor that cannot detect new untested engine code is not a floor.

So `coverage.include` is set explicitly, the renderer is excluded, and thresholds are applied per glob:

| Scope | Measured (stmt / branch / func / line) | Floor |
| --- | --- | --- |
| `src/game/**` | 88.8 / 97.4 / 85.7 / 91.3 | 85 / 90 / 85 / 90 |
| `src/state/**` | 97.7 / 100 / 91.7 / 97.4 | 90 / 95 / 85 / 90 |
| `src/scene/**`, `src/ui/**`, `src/data/**`, `src/App.tsx`, `src/main.tsx` | 0 / n/a | excluded |

`src/data/**` is excluded because `CLAUDE.md` defines it as data rather than code — plain constant
tables, where a coverage percentage measures nothing.

Floors sit a few points below measured values so an honest refactor does not trip them. This is a
**ratchet, not a target**: `src/game/board.ts` is the current weak spot at 46.7% statements, and the
floor deliberately does not demand that be fixed now.

Vitest's `thresholds.autoUpdate` was considered as a self-raising ratchet and rejected — it rewrites the
config file on every run, which is noise in a CI context.

**Explicitly accepted as a first pass.** The floors are expected to be revisited and tightened as the
engine grows; they are not intended as a permanent statement of the right level.

### 5. Enforce the `Math.random` ban in ESLint, not in CI

**Considered:** a `grep` step in the workflow; an ESLint rule.

**Chosen:** an ESLint rule — `no-restricted-properties` banning `Math.random` in `src/game/` and
`src/data/`, sitting alongside the existing `no-restricted-imports` boundary rule.

`CLAUDE.md` calls this a hard rule: runs are seeded and the simulation must stay reproducible, so
randomness comes from a seeded PRNG carried in `GameState`. Before this work, ESLint enforced the
renderer *import* boundary but nothing caught `Math.random()`.

ESLint is the right home rather than a workflow `grep`, because it fails locally too — a developer finds
out at `pnpm lint`, not after pushing. CI is what makes it unskippable, but the rule belongs with the
other boundary rules.

Known limitation, accepted: `no-restricted-properties` matches `Math.random` as a member expression, so
it does not catch an aliased `const { random } = Math`. The rule is there to stop the accident, not a
determined circumvention.

### 6. Deploy via the official GitHub Pages actions

**Considered:** pushing built output to a `gh-pages` branch; the official
`upload-pages-artifact` / `deploy-pages` action pair.

**Chosen:** the official actions, with `pages: write` and `id-token: write` permissions scoped to the
`deploy` job alone. The workflow's default permission stays `contents: read`.

No build output is committed to the repository, and the deployment identity is OIDC rather than a token
with write access to git history.

**`vite.config.ts` requires a `base` change.** A GitHub Pages project site serves from
`https://braydend.github.io/cards-v-chess/`, so without a matching `base` every asset URL 404s. Setting
it unconditionally would also prefix the dev server path, so it is conditional on the Vite command:

```ts
base: command === 'build' ? '/cards-v-chess/' : '/'
```

This keeps `pnpm dev` at the root while producing correct production URLs. Reading `command` requires
switching `vite.config.ts` from the plain-object form of `defineConfig` to the function form,
`defineConfig(({ command }) => ({ ... }))`.

### 7. Concurrency is configured differently for checks and deploys

- `checks`: group per ref, `cancel-in-progress: true`. Pushing twice to a pull request should abandon
  the superseded run.
- `deploy`: group `pages`, `cancel-in-progress: false`. Killing an in-flight Pages deployment can leave
  the site in a partial state, so deploys queue instead of cancelling. This matches GitHub's own
  published Pages workflow template.

### 8. One pinned Node version, no matrix

Node 22, pinned in `.nvmrc` and consumed by `actions/setup-node` via `node-version-file` so the version
has a single home rather than drifting between the workflow and local development.

No version matrix. This is a browser game with one runtime target; a matrix would multiply CI time to
test a dimension the project does not ship against.

pnpm is pinned by adding `"packageManager": "pnpm@10.28.1"` to `package.json`, which `pnpm/action-setup`
reads directly. Without it, the CI pnpm version floats independently of local development.

## Changes this design implies

| File | Change |
| --- | --- |
| `.github/workflows/ci.yml` | New. `checks` and `deploy` jobs as described in decision 2. |
| `.nvmrc` | New. `22`. |
| `package.json` | Add `"packageManager": "pnpm@10.28.1"`; add `"test:coverage": "vitest run --coverage"`; add `@vitest/coverage-v8` to `devDependencies`. |
| `vite.config.ts` | Conditional `base` (decision 6); `test.coverage` config with `include`, `exclude`, and per-glob `thresholds` (decision 4). |
| `eslint.config.js` | Add the `no-restricted-properties` rule banning `Math.random` in `src/game/` and `src/data/` (decision 5). |
| `CLAUDE.md` | Document the new `test:coverage` command and note that CI enforces the boundary, determinism, and coverage rules. |

## Manual step outside the repository

**GitHub Pages must be enabled with Settings → Pages → Source = "GitHub Actions".** The `deploy` job
fails until this is set, and it cannot be configured from the repository. Branch protection requiring
the `checks` job on pull requests into `main` is also a repository setting, and is recommended once the
first run has gone green — a required check cannot be selected in the UI until it has reported once.

## Deliberately out of scope

- **Dependabot.** Useful, but TypeScript is pinned to the 5.x line on purpose — `typescript-eslint`
  declares support only for `>=4.8.4 <6.1.0`, so an unguarded update opens a PR that breaks `pnpm lint`
  every week. Worth adding later with the right `ignore` entries.
- **Bundle-size budget.** The main chunk is already 1.1MB raw / 302kB gzip and warns on build. That is
  three.js, it is largely unavoidable, and policing it before the game is playable would gate work on a
  number nobody intends to act on yet.
- **Pull request preview deployments.** The most genuinely useful future addition for a game, and the
  most machinery. Deferred rather than rejected.
- **A Node version matrix.** See decision 8.
