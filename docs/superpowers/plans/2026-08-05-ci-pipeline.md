# CI Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions pipeline that gates every pull request and every push to `main` on `lint` + `typecheck` + `test` + `build`, and deploys `main` to GitHub Pages only when those checks pass.

**Architecture:** One workflow file, `.github/workflows/ci.yml`, with two jobs. A `checks` job runs all four checks in a single job (the checks total ~4s against ~20s of setup, so fanning out would be slower) and, on `main` only, uploads the built site as a Pages artifact. A `deploy` job declares `needs: checks` plus a `main`-only condition and publishes that artifact. Supporting work hardens two invariants that were documented but unenforced: the `Math.random` determinism ban moves into ESLint, and coverage gets an explicit denominator so a new untested engine file can actually fail the build.

**Tech Stack:** GitHub Actions, pnpm 10.28.1, Node 22, Vite 8, Vitest 4, `@vitest/coverage-v8`, ESLint 10 (flat config), `actions/upload-pages-artifact` + `actions/deploy-pages`.

**Spec:** [`docs/superpowers/specs/2026-08-05-ci-pipeline-design.md`](../specs/2026-08-05-ci-pipeline-design.md). Read it for *why*; this plan is *how*.

## Global Constraints

- **Node version: 22.** Single version, no matrix. Pinned in `.nvmrc`, consumed via `node-version-file` so it has one home.
- **pnpm version: 10.28.1.** Pinned via `"packageManager": "pnpm@10.28.1"` in `package.json`, which `pnpm/action-setup` reads directly.
- **TypeScript stays on the 5.x line.** Do not upgrade it. `typescript-eslint` declares support only for `>=4.8.4 <6.1.0`, so TS 7 (published as `latest`) breaks `pnpm lint`.
- **`src/game/` and `src/data/` must never import React, Three.js, or view state.** Already enforced by `no-restricted-imports` in `eslint.config.js`. Do not weaken it.
- **`Math.random` must never appear in `src/game/` or `src/data/`.** Task 3 enforces this. `Math.max`, `Math.min`, etc. remain allowed — `src/game/tick.ts:34` uses `Math.max` and must keep passing.
- **Pages base path is `/cards-v-chess/`** in production builds only; `pnpm dev` stays at `/`.
- **Coverage thresholds are a regression ratchet, not a baseline.** Do not raise them in this work. A considered baseline is a separate follow-up.
- **`pnpm install` in CI always uses `--frozen-lockfile`.** A lockfile that does not match `package.json` should fail the build, not be silently repaired.
- **Never commit `dist/` or `coverage/`.** Both are already in `.gitignore`.
- **Repository settings already done, do not attempt:** Pages source is set to "GitHub Actions". Branch protection is deliberately off; do not add it.

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `.nvmrc` | Create | Single source of truth for the Node version. |
| `package.json` | Modify | Pin pnpm; add `test:coverage`; add `@vitest/coverage-v8` dev dep. |
| `vite.config.ts` | Modify | Conditional Pages `base`; coverage `include`/`exclude`/`thresholds`. |
| `eslint.config.js` | Modify | Add the `Math.random` ban beside the existing import boundary. |
| `.github/workflows/ci.yml` | Create | The pipeline: `checks` + `deploy`. |
| `CLAUDE.md` | Modify | Document `test:coverage` and what CI enforces. |

Task order is deliberate: every local check (Tasks 1–4) is proven green before Task 5 wires up a workflow that runs them, so a CI failure in Task 5 can only be a workflow problem.

**Note on testing:** this is build-and-CI configuration, not application code, so there is no unit test to write first. The equivalent discipline — and it is followed strictly below — is **prove the check fails on a deliberate violation before trusting that it passes.** A gate never observed failing is not known to be a gate. Tasks 3 and 4 each inject a real violation, watch it fail, then revert.

---

### Task 1: Pin the toolchain

**Files:**
- Create: `.nvmrc`
- Modify: `package.json` (add `packageManager` field)

**Interfaces:**
- Consumes: nothing.
- Produces: `.nvmrc` containing `22`, read by `actions/setup-node` via `node-version-file` in Task 5. `package.json` field `"packageManager": "pnpm@10.28.1"`, read by `pnpm/action-setup` in Task 5.

- [ ] **Step 1: Confirm the versions you are pinning match reality**

```bash
node --version   # expect v22.x
pnpm --version   # expect 10.28.1
```

If `pnpm --version` differs from `10.28.1`, pin the version you actually have and use that value everywhere below instead.

- [ ] **Step 2: Create `.nvmrc`**

```
22
```

Major version only. A full patch pin would need updating every Node patch release for no benefit.

- [ ] **Step 3: Add the `packageManager` field to `package.json`**

Insert immediately after the `"type": "module",` line:

```json
  "packageManager": "pnpm@10.28.1",
```

- [ ] **Step 4: Verify `package.json` is still valid JSON and pnpm accepts the field**

```bash
node -e "console.log(require('./package.json').packageManager)"
```

Expected: `pnpm@10.28.1`

```bash
pnpm install --frozen-lockfile
```

Expected: succeeds. It must NOT report a lockfile mismatch — `packageManager` is metadata and does not change the dependency graph.

- [ ] **Step 5: Commit**

```bash
git add .nvmrc package.json
git commit -m "Pin Node and pnpm versions for reproducible builds

CI needs a fixed toolchain or the pnpm version floats independently of
local development. .nvmrc gives the Node version one home, read by
setup-node rather than duplicated into the workflow."
```

---

### Task 2: Add the Pages base path

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: production builds emit asset URLs prefixed `/cards-v-chess/`. Task 5's `deploy` job depends on this; without it every asset 404s on Pages.

- [ ] **Step 1: Note the current asset URLs, so you can see the change take effect**

```bash
pnpm build && grep -oE '(src|href)="[^"]*"' dist/index.html
```

Expected now: `src="/assets/index-*.js"` — root-relative, which is wrong for a Pages project site served from `https://braydend.github.io/cards-v-chess/`.

- [ ] **Step 2: Convert `vite.config.ts` to the function form and add `base`**

`defineConfig` currently takes a plain object. Reading `command` requires the function form. Replace the whole file with:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this project at /cards-v-chess/, so production assets need
// that prefix or every URL 404s. Dev stays at the root.
const PAGES_BASE = '/cards-v-chess/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? PAGES_BASE : '/',
  plugins: [react()],
  test: {
    // The rules engine is pure TypeScript and needs no DOM. If a UI test ever
    // needs one, give that file its own environment via a docblock comment
    // rather than slowing the whole suite down.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
}))
```

Note the parentheses around the returned object — `({ command }) => ({ ... })`. Without them the body parses as a function block that returns nothing, and Vite silently uses defaults.

- [ ] **Step 3: Verify the production build is prefixed**

```bash
pnpm build && grep -oE '(src|href)="[^"]*"' dist/index.html
```

Expected:
```
src="/cards-v-chess/assets/index-ChuBmL6c.js"
href="/cards-v-chess/assets/index-BaBEJsgL.css"
```

- [ ] **Step 4: Verify dev is still served at the root**

```bash
pnpm dev --port 5199 &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5199/
kill %1
```

Expected: `200`. If this returns 404, `base` is being applied to dev as well — check the `command === 'build'` condition.

- [ ] **Step 5: Verify tests still run**

The config file was restructured, so confirm Vitest still picks it up.

```bash
pnpm test:run
```

Expected: 3 files, 38 tests, all passing.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts
git commit -m "Serve production builds from the GitHub Pages subpath

A Pages project site is served from /cards-v-chess/, so root-relative
asset URLs 404. Conditional on the Vite command so pnpm dev stays at the
root; this needs the function form of defineConfig to read it."
```

---

### Task 3: Enforce the `Math.random` determinism ban

**Files:**
- Modify: `eslint.config.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `pnpm lint` exits non-zero when `Math.random` appears in `src/game/**/*.ts` or `src/data/**/*.ts`. Task 5's `checks` job runs `pnpm lint`, which is what makes this unskippable.

CLAUDE.md calls this a hard rule — runs are seeded, so randomness must come from the PRNG carried in `GameState`. ESLint already enforces the *import* boundary in this same config block, but nothing catches `Math.random()`.

- [ ] **Step 1: Prove the gap exists — inject a violation and watch lint pass**

This is the "write the failing test" step. Append to `src/game/tick.ts`:

```ts

export function bad() { return Math.random() }
```

```bash
pnpm lint
```

Expected: **PASSES** (silent, exit 0). That is the bug — a determinism violation sails through. Leave the violation in place for Step 3.

- [ ] **Step 2: Add the rule**

In `eslint.config.js`, find the config block whose `files` is `['src/game/**/*.ts', 'src/data/**/*.ts']`. Add `no-restricted-properties` as the first entry in its `rules` object, directly above the existing `'no-restricted-imports'`:

```js
      // CLAUDE.md's determinism invariant: runs are seeded and the simulation
      // must stay reproducible, so randomness comes from a seeded PRNG carried
      // in GameState. Math.max and friends stay allowed — only random is banned.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Runs are seeded — src/game and src/data must draw randomness from the PRNG in GameState, never Math.random. See CLAUDE.md.',
        },
      ],
```

- [ ] **Step 3: Verify the rule catches the violation**

```bash
pnpm lint
```

Expected: **FAILS**, exit 1, with:
```
src/game/tick.ts
  143:32  error  'Math.random' is restricted from being used. Runs are seeded — ...  no-restricted-properties

✖ 1 problem (1 error, 0 warnings)
```

Exactly **one** error. If there are two or more, the rule is too broad — it should not be flagging `Math.max` on line 34.

- [ ] **Step 4: Remove the violation and verify lint is clean**

```bash
git checkout src/game/tick.ts
pnpm lint
```

Expected: silent, exit 0. `src/game/tick.ts:34` uses `Math.max` and must still pass — that is the check that the rule is precisely scoped.

- [ ] **Step 5: Confirm `src/game/tick.ts` is genuinely unmodified**

```bash
git status --short
```

Expected: `eslint.config.js` modified, and **nothing else**. If `src/game/tick.ts` still shows as modified, the injected function is still there — remove it.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.js
git commit -m "Enforce the Math.random ban in src/game and src/data

CLAUDE.md calls seeded determinism a hard rule, but only the renderer
import boundary was actually enforced — Math.random passed lint silently.
Scoped to the property, so Math.max in tick.ts keeps working.

ESLint rather than a workflow grep, so it fails at pnpm lint instead of
after a push. Known limitation: this matches the member expression, so an
aliased const { random } = Math slips through. It is here to stop the
accident, not a determined circumvention."
```

---

### Task 4: Add coverage with an honest denominator

**Files:**
- Modify: `package.json` (add `@vitest/coverage-v8`, add `test:coverage` script)
- Modify: `vite.config.ts` (add `test.coverage`)

**Interfaces:**
- Consumes: the function-form `vite.config.ts` from Task 2.
- Produces: `pnpm test:coverage` runs the suite with coverage and exits non-zero if a per-directory threshold is breached. Task 5's `checks` job runs this instead of `pnpm test:run`.

The subtle part, and the reason this task exists at all: **by default Vitest counts only files the tests import.** Reported that way the project looks like 92.6% statements. That default makes a threshold useless, because adding a brand-new untested `src/game/newThing.ts` moves the number not at all — no test imports it, so it is invisible. `coverage.include` must be explicit.

- [ ] **Step 1: Install the coverage provider**

```bash
pnpm add -D @vitest/coverage-v8
```

Expected: adds `@vitest/coverage-v8` at a version matching Vitest 4.x. It must match the Vitest major version.

- [ ] **Step 2: Add the `test:coverage` script to `package.json`**

Add directly after the `"test:run"` line:

```json
    "test:coverage": "vitest run --coverage",
```

- [ ] **Step 3: Observe the misleading default, so the fix has a baseline**

```bash
pnpm test:coverage
```

Expected: around **92.6% statements**, listing only files the tests reach — `game/board.ts`, `game/step.ts`, `state/simulation.ts`. Note what is *absent*: all of `src/scene/`, `src/ui/`, `App.tsx`, `main.tsx`. That flattering number is the problem.

- [ ] **Step 4: Add the coverage config**

In `vite.config.ts`, add a `coverage` key inside `test`, after the `include` line:

```ts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // `include` is set explicitly on purpose. By default coverage counts only
      // files the tests import, which means a brand-new untested file in
      // src/game/ would not move the number at all — the threshold would fail
      // to catch exactly what it exists to catch.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // The renderer is deliberately untested: it needs a browser, and the
        // engine boundary exists so the game is testable without one.
        'src/scene/**',
        'src/ui/**',
        'src/App.tsx',
        'src/main.tsx',
        // data/ is data, not code — a percentage over constant tables measures
        // nothing.
        'src/data/**',
      ],
      thresholds: {
        // A ratchet against regression, not a statement of the right level.
        // A considered baseline is a deliberate follow-up.
        'src/game/**': { statements: 85, branches: 90, functions: 85, lines: 90 },
        'src/state/**': { statements: 90, branches: 95, functions: 85, lines: 90 },
      },
    },
```

- [ ] **Step 5: Verify coverage passes with the honest denominator**

```bash
pnpm test:coverage
```

Expected: 38 tests pass, exit 0, and a summary near:
```
Statements   : 91.86% ( 113/123 )
Branches     : 97.77% ( 44/45 )
Functions    : 88.46% ( 23/26 )
Lines        : 93.45% ( 100/107 )
```
`src/game` should read 88.75 / 97.43 / 85.71 / 91.3 and `src/state` 97.67 / 100 / 91.66 / 97.36. No threshold error.

- [ ] **Step 6: Prove the thresholds actually bind**

A glob that matches nothing enforces nothing, silently. Verify the gate is real by demanding more than the code delivers:

```bash
pnpm vitest run --coverage --coverage.thresholds.'src/game/**'.statements=95
```

Expected: **FAILS** with exactly:
```
ERROR: Coverage for statements (88.75%) does not meet "src/game/**" threshold (95%)
```

The glob appearing in the message is the proof it bound. If instead this passes, the threshold key is not matching and the gate is fake — do not proceed.

- [ ] **Step 7: Confirm `dist/` and `coverage/` are untracked**

```bash
git status --short
```

Expected: only `package.json`, `pnpm-lock.yaml`, and `vite.config.ts` modified. If `coverage/` or `dist/` appear, stop — `.gitignore` already lists both, so something is wrong.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts
git commit -m "Gate coverage on the engine, with an explicit denominator

Vitest counts only test-imported files by default, which reported 92.6%
statements and — far worse — could not see a new untested file in
src/game/ at all. An explicit coverage.include fixes the denominator.

Thresholds are scoped per-directory because a global floor is meaningless
here: src/scene and src/ui are deliberately untested, since the engine
boundary exists so the game is testable without a browser. src/data is
excluded as constant tables.

Numbers sit just under current values: a regression ratchet, not a
baseline. A considered baseline is a follow-up."
```

---

### Task 5: The workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `.nvmrc` and `packageManager` (Task 1); the Pages `base` (Task 2); the `Math.random` rule (Task 3); `pnpm test:coverage` (Task 4).
- Produces: a required-check-capable job named `checks`, and a Pages deployment of `main`.

Every command this workflow runs is already proven green locally by Tasks 1–4, so a failure here is a workflow problem, not a code problem.

- [ ] **Step 1: Verify the full check sequence passes locally first**

Run exactly what CI will run, in order:

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build
```

Expected: all five succeed, exit 0. Do not write the workflow until this is green — otherwise you cannot tell a broken workflow from broken code.

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

# Least privilege by default. The deploy job widens this for itself only.
permissions:
  contents: read

concurrency:
  # Pushing twice to a branch should abandon the superseded run.
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    name: checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Must precede setup-node: the pnpm cache below needs the pnpm binary to
      # resolve the store path. Version comes from packageManager in package.json.
      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      # Four separate steps rather than one chained command, so a failure is
      # labelled with which check failed. They total ~4s; the cost is noise.
      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test:coverage

      - name: Build
        run: pnpm build

      # Only main deploys, so only main pays for the artifact.
      - name: Upload Pages artifact
        if: github.ref == 'refs/heads/main'
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    name: deploy
    needs: checks
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest

    permissions:
      contents: read
      pages: write
      id-token: write

    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    concurrency:
      # Killing an in-flight Pages deploy can leave the site half-updated, so
      # these queue rather than cancel. Matches GitHub's own Pages template.
      group: pages
      cancel-in-progress: false

    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Validate the YAML parses before pushing**

Use a real YAML parser, not a regex. A regex over indentation cannot tell a job name from
a trigger name — both sit at two spaces — so it will happily report `pull_request` and
`push` as jobs.

```bash
python3 -c "
import yaml
d = yaml.safe_load(open('.github/workflows/ci.yml'))
# PyYAML resolves the bare key \`on\` to boolean True under YAML 1.1. GitHub's own
# parser reads it as 'on' correctly; this is a quirk of the checker, not the file.
triggers = d[True] if True in d else d['on']
print('jobs:      ', list(d['jobs'].keys()))
print('triggers:  ', triggers)
print('deploy gate:', d['jobs']['deploy']['needs'], '|', d['jobs']['deploy']['if'])
print('top perms: ', d['permissions'])
"
```

Expected, exactly:
```
jobs:       ['checks', 'deploy']
triggers:   {'pull_request': None, 'push': {'branches': ['main']}}
deploy gate: checks | github.ref == 'refs/heads/main'
top perms:  {'contents': 'read'}
```

If `yaml` is unavailable, `pip install pyyaml` or fall back to checking only that the file
contains no tab characters (`grep -Pq '\t' .github/workflows/ci.yml && echo 'TABS - invalid'`)
— but a tab check alone does not verify structure, so prefer the parse.

- [ ] **Step 4: Commit and push the branch**

```bash
git add .github/workflows/ci.yml
git commit -m "Add CI pipeline with Pages deploy

Runs on pull requests and on pushes to main. The main run is not
redundant: it is what guards the deploy, via needs: checks. With branch
protection deliberately off, it is currently the only automated gate on
main, so a bad commit still cannot reach the live site.

One checks job rather than four parallel ones — the checks total ~4s
against ~20s of setup, so fanning out would be slower and would build
three extra times. The Pages artifact is uploaded from checks so deploy
does not repeat checkout, install, and build.

Pages permissions are scoped to the deploy job; the workflow default
stays contents: read."
git push -u origin ci
```

- [ ] **Step 5: Watch the run and confirm the branch behaviour**

```bash
gh run watch --exit-status || gh run view --log-failed
```

Expected on this branch (`ci`, not `main`):
- `checks` — **succeeds**.
- `deploy` — **skipped**. This is correct, and is the thing to verify. A `deploy` that runs on a non-`main` branch means the `if:` condition is wrong.

If `checks` fails, read the failing step. Step 1 proved the commands work locally, so suspect the workflow: pnpm/Node setup order, or the cache key.

- [ ] **Step 6: Open the pull request**

```bash
gh pr create --base main --title "Add CI pipeline with GitHub Pages deploy" --body "$(cat <<'BODY'
Implements [`docs/superpowers/specs/2026-08-05-ci-pipeline-design.md`](docs/superpowers/specs/2026-08-05-ci-pipeline-design.md).

Runs `lint`, `typecheck`, `test:coverage`, and `build` on every pull request and every push to `main`. `main` additionally deploys to GitHub Pages, gated on those checks passing.

Alongside the pipeline, two invariants that CLAUDE.md called hard rules but nothing enforced:

- **`Math.random` in `src/game/`** now fails `pnpm lint`. Verified by injecting a violation and watching it fail; `Math.max` in `tick.ts` still passes.
- **Coverage** now uses an explicit denominator. The default counted only test-imported files, reporting a flattering 92.6% and — the real problem — unable to see a new untested engine file at all. Thresholds are scoped to `src/game/` and `src/state/`, with the deliberately-untested renderer excluded. They sit just under current values: a regression ratchet, not a baseline.

Verify on this PR that `checks` runs and `deploy` is **skipped** — deploy is `main`-only.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 7: Merge, then confirm the deploy**

Merge the PR, then:

```bash
gh run watch --exit-status || gh run view --log-failed
gh run view --json conclusion,jobs --jq '.jobs[] | {name, conclusion}'
```

Expected on `main`: both `checks` and `deploy` succeed.

Then confirm the site actually serves:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://braydend.github.io/cards-v-chess/
```

Expected: `200`. A 404 most likely means the `base` from Task 2 did not make it in — re-check `dist/index.html` asset URLs.

Load the URL in a browser and confirm the board renders and pieces move. A 200 proves `index.html` is served; only a real load proves the asset paths resolve.

---

### Task 6: Document what CI enforces

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above, now merged and green.
- Produces: nothing consumed by later tasks.

Left until last on purpose: documenting a pipeline before it has run once risks documenting intent rather than behaviour.

- [ ] **Step 1: Add `test:coverage` to the Commands block**

In the `## Commands` section, after the `pnpm test:run` line:

```
pnpm test:coverage # Vitest with coverage + thresholds (what CI runs)
```

- [ ] **Step 2: Record the determinism rule as enforced**

In `## Invariants that constrain code`, the first bullet currently reads:

> - **`Math.random` must never appear in `src/game/`.** Runs are seeded and the simulation must stay reproducible. Randomness comes from a seeded PRNG carried in `GameState`.

Append to that bullet:

```
 **Enforced by ESLint** — a violation fails `pnpm lint`, and therefore CI.
```

- [ ] **Step 3: Add a CI section**

After the `## Commands` section:

```markdown
## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`: `lint`, `typecheck`,
`test:coverage`, `build`. Pushes to `main` also deploy to
[GitHub Pages](https://braydend.github.io/cards-v-chess/), gated on those checks passing.

Branch protection is currently **off**, so nothing blocks a direct push to `main` or the merge of a red
pull request. What CI does guarantee is that such a commit never reaches the live site — `deploy`
declares `needs: checks`. **The gate is on the deployment, not on the branch.**

CI enforces three things beyond "the tests pass":

- The **renderer boundary** — `src/game/` and `src/data/` importing React or Three.js fails `pnpm lint`.
- **Seeded determinism** — `Math.random` in those directories fails `pnpm lint`.
- **Engine coverage** — thresholds on `src/game/` and `src/state/`. `src/scene/`, `src/ui/`, and
  `src/data/` are excluded: the renderer needs a browser and is deliberately untested, and `data/` is
  constant tables.

Coverage sets `include` explicitly rather than relying on the default. The default counts only files the
tests import, so a new untested file in `src/game/` would not move the number at all. The current
thresholds are a **regression ratchet, not a baseline** — they sit just under what the code already does.
Defining a real baseline is an open follow-up; do not treat passing them as evidence of good coverage.
```

- [ ] **Step 4: Verify the claims in what you just wrote are true**

Documentation drift is the failure mode this repo already has three files to prevent. Check each claim:

```bash
grep -n "test:coverage" package.json          # the script exists
grep -n "no-restricted-properties" eslint.config.js   # the rule exists
grep -n "needs: checks" .github/workflows/ci.yml      # deploy really is gated
grep -n "src/state/\*\*" vite.config.ts               # the thresholds exist
```

All four must return a match. If any does not, fix `CLAUDE.md` to match reality rather than the other way round.

- [ ] **Step 5: Commit and push**

```bash
git add CLAUDE.md
git commit -m "Document what CI enforces

Records the test:coverage command, marks the Math.random invariant as
ESLint-enforced rather than convention, and states plainly that with
branch protection off the gate sits on the deployment rather than the
branch. Also notes the coverage thresholds are a ratchet, not a baseline,
so a future reader does not mistake passing them for good coverage."
git push
```

---

## Self-Review

**Spec coverage** — every decision in the spec maps to a task:

| Spec decision | Task |
| --- | --- |
| 1. Land CI on `main` | Done before planning: `init` merged (`ca4a9db`), branch rebased. |
| 2. One workflow, two jobs, both triggers | Task 5 |
| 3. Keep `typecheck` separate | Task 5, Step 2 (four labelled steps) |
| 4. Per-directory coverage thresholds | Task 4 |
| 5. `Math.random` in ESLint | Task 3 |
| 6. Official Pages actions + `base` | Task 2 (`base`), Task 5 (actions) |
| 7. Split concurrency config | Task 5, Step 2 (both blocks) |
| 8. One pinned Node version, pinned pnpm | Task 1 |
| Changes table: `CLAUDE.md` | Task 6 |
| Repository settings | Recorded in Global Constraints as done / deliberately skipped |
| Out of scope: Dependabot, bundle budget, PR previews, matrix | Absent by design |

**Placeholder scan** — no TBD/TODO. Every step has its literal file content, command, or expected output. Expected outputs are real values observed on this branch, not invented.

**Type consistency** — names used identically throughout: script `test:coverage`; job names `checks` and `deploy`; threshold globs `src/game/**` and `src/state/**`; constant `PAGES_BASE`; `.nvmrc` read via `node-version-file`.

**One risk flagged for the implementer:** Task 4's expected coverage percentages assume the suite is exactly the 38 tests present at `a218215`. If tests have been added since, the numbers will differ — what must hold is that thresholds pass (Step 5) and that they genuinely bind (Step 6). Step 6 is the load-bearing check; do not skip it because Step 5 was green.
