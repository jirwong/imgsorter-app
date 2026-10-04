# GitHub Actions CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions CI workflow, a gitleaks secret-scanning workflow, a Dependabot config, and a PR template, matching the `basic-typescript-template` setup and adapted to this repo.

**Architecture:** One `check` job on `ubuntu-latest` runs the same gates as local `pnpm check` (plus `generate-routes` before typecheck and a coverage run) and a production build. Two more `.github` files add secret scanning and dependency updates, and a PR template standardizes PRs.

**Tech Stack:** GitHub Actions, pnpm 11, Node 24, Vitest coverage (`@vitest/coverage-v8`).

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-10-04-github-actions-ci-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24; CI pins `24.12.0`.
- Prettier 2-space, single quotes, semicolons, print width 120. **No comments in new code.**
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- No application behavior, engine, database, or `lefthook.yml` changes.
- `pnpm check` runs `generate-routes` and may change `app/routeTree.gen.ts`. If that file changes and is not part of the task, restore it with `git restore app/routeTree.gen.ts`.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; never merge. All PR text is ASD-STE100.
- Action pins: `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7`, `gitleaks/gitleaks-action@v3`.

---

### Task 1: `test:coverage` script and the CI workflow

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: the `test:coverage` script; the `CI` workflow.

- [ ] **Step 1: Add the coverage script — `package.json`**

Add to `scripts`, after `"test:watch"`:

```json
    "test:coverage": "vitest run --coverage",
```

- [ ] **Step 2: Run the coverage script to verify it works**

Run: `pnpm test:coverage`
Expected: the test suite runs with coverage; a `coverage/` report is written; exit 0. If it fails for missing config, confirm `@vitest/coverage-v8` is installed (it is a devDependency) and re-run.

- [ ] **Step 3: Add the CI workflow — create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: pnpm/action-setup@v6

      - uses: actions/setup-node@v7
        with:
          node-version: 24.12.0
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        env:
          CI: true

      - name: Generate routes
        run: pnpm generate-routes

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm format:check

      - name: Test
        run: pnpm test

      - name: Coverage
        run: pnpm test:coverage

      - name: Build
        run: pnpm build
```

- [ ] **Step 4: Validate the YAML and run the step sequence locally**

Run: `pnpm exec prettier --check .github/workflows/ci.yml`
Expected: "All matched files use Prettier code style!"

Run the exact CI step sequence locally:

```bash
pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:coverage && pnpm build
```

Expected: every step passes; `pnpm build` succeeds.

Run: `git restore app/routeTree.gen.ts` only if `generate-routes` changed it and the change is not part of this task.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/ci.yml
git commit -m "ci: add the CI workflow and the coverage script"
```

---

### Task 2: gitleaks workflow, Dependabot config, and PR template

**Files:**
- Create: `.github/workflows/gitleaks.yml`
- Create: `.github/dependabot.yml`
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Add the secret-scanning workflow — create `.github/workflows/gitleaks.yml`**

```yaml
name: Secret scanning

on:
  push:
    branches: [main]
  pull_request:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: gitleaks/gitleaks-action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Add the Dependabot config — create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: '/'
    schedule:
      interval: weekly
    ignore:
      - dependency-name: '@types/node'
    groups:
      dev-dependencies:
        patterns:
          - '*'
        update-types:
          - 'minor'
          - 'patch'
  - package-ecosystem: github-actions
    directory: '/'
    schedule:
      interval: monthly
```

- [ ] **Step 3: Add the PR template — create `.github/pull_request_template.md`**

```markdown
## Description

<!-- Briefly describe the change and why it is needed. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Chore / tooling
- [ ] Documentation
- [ ] Dependency update

## How has this been tested?

- [ ] `pnpm check` passes (typecheck + lint + test + format)

## Checklist

- [ ] My code follows the project's code style (Prettier)
- [ ] I have run `pnpm check` locally
- [ ] I have updated the docs (README/AGENTS/CLAUDE) if needed
- [ ] Commit message follows [Conventional Commits](https://www.conventionalcommits.org/)
```

- [ ] **Step 4: Validate the YAML and Markdown**

Run: `pnpm exec prettier --check .github/workflows/gitleaks.yml .github/dependabot.yml .github/pull_request_template.md`
Expected: "All matched files use Prettier code style!"

- [ ] **Step 5: Run the full gates, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

```bash
git add .github/workflows/gitleaks.yml .github/dependabot.yml .github/pull_request_template.md
git commit -m "ci: add secret scanning, Dependabot, and a PR template"
```

---

### Task 3: Final verification and docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Run the full gate set and build**

Run: `pnpm check`
Expected: `generate-routes`, typecheck, lint, tests, and format all pass.

Run: `pnpm build`
Expected: build succeeds.

Run: `rg -l "better-sqlite3|sqlite" dist/client`
Expected: no output.

- [ ] **Step 2: Confirm the workflow files exist and are valid**

Run: `pnpm exec prettier --check ".github/**/*.yml" ".github/**/*.md"`
Expected: "All matched files use Prettier code style!"

- [ ] **Step 3: Record CI in `AGENTS.md`**

Add a bullet under "Current Plan State", after the Phase 6 bullet:

```
- CI — **added**: a GitHub Actions `CI` workflow runs `generate-routes`, typecheck,
  lint, format check, tests, coverage, and a build on every push to `main` and every
  PR; a `Secret scanning` gitleaks workflow, a Dependabot config, and a PR template
  are also in place. Spec at
  `docs/superpowers/specs/2026-10-04-github-actions-ci-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-github-actions-ci.md`.
```

- [ ] **Step 4: Record CI in `docs/ROADMAP.md`**

Add a bullet under the "Design decisions (cross-phase)" section:

```
- **CI:** GitHub Actions run the local quality gates (`generate-routes`, typecheck,
  lint, format check, tests, coverage) and a build on push to `main` and PRs, plus
  gitleaks secret scanning and Dependabot. See
  [2026-10-04-github-actions-ci-design.md](superpowers/specs/2026-10-04-github-actions-ci-design.md).
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/ROADMAP.md
git commit -m "docs: record the CI setup"
```

## Self-Review Checklist

1. **Spec coverage:**
   - `test:coverage` script → Task 1 Step 1.
   - `ci.yml` with the exact step order → Task 1 Step 3.
   - `gitleaks.yml` → Task 2 Step 1.
   - `dependabot.yml` → Task 2 Step 2.
   - PR template → Task 2 Step 3.
   - Verification + docs → Task 3.
2. **Placeholder scan:** every step has the full file content or an exact command; no TBD/TODO.
3. **Type consistency:** the `test:coverage` script name matches the CI step; the action pins match the spec; the workflow names (`CI`, `Secret scanning`) match the docs bullets.
4. **Risk note:** the first real CI run is the true test of the native-dependency install (`better-sqlite3`, `sharp`) on `ubuntu-latest`; the spec records the fallback (`apt-get install -y build-essential python3`).
