# imgsorter-app — Design: GitHub Actions CI

**Date:** 2026-10-04
**Status:** Draft for review
**Scope:** Add the GitHub Actions setup used by the `basic-typescript-template`
repository (`jirwong/basic-typescript-template`), adapted to this repo: a CI
workflow, a gitleaks secret-scanning workflow, a Dependabot config, and a PR
template. No tag/release automation.

## 1. Context

imgsorter-app has **no CI**: there is no `.github/` directory and no other CI
config (GitLab, CircleCI, Travis, etc.). The only automation is `lefthook.yml`,
which runs lint-staged on pre-commit and `pnpm check` on pre-push locally.

The reference repo, `jirwong/basic-typescript-template`, provides four
`.github` artifacts to mirror:

- `.github/workflows/ci.yml` — one `check` job on push to `main` and all PRs:
  checkout, pnpm, Node, install, then `typecheck`, `lint`, `format:check`,
  `test`, `test:coverage`, `build`.
- `.github/workflows/gitleaks.yml` — secret scanning on the same triggers.
- `.github/dependabot.yml` — weekly npm updates and monthly GitHub Actions
  updates.
- `.github/pull_request_template.md` — description / type-of-change / testing /
  checklist.

## 2. Goals

- Run the same quality gates in CI that `pnpm check` runs locally, plus a
  production build, on every push to `main` and every PR.
- Scan pushes and PRs for committed secrets.
- Keep dependencies and Actions patched via Dependabot.
- Give PRs a consistent template.
- Keep the local and CI gates aligned so a green local `pnpm check` predicts a
  green CI run.

## 3. Non-goals

- No tag/release automation, artifact publishing, or deployment workflow.
- No Node-version matrix, no test sharding, and no native-dependency caching
  beyond pnpm's own cache.
- No changes to application behavior, the engine, the database, or `lefthook.yml`.

## 4. Files

```
.github/
  workflows/
    ci.yml                  # NEW
    gitleaks.yml            # NEW
  dependabot.yml            # NEW
  pull_request_template.md  # NEW
package.json                # + "test:coverage": "vitest run --coverage"
```

## 5. CI workflow (`.github/workflows/ci.yml`)

- **Triggers:** `push` to `main`; all `pull_request`.
- **Job:** `check`, `runs-on: ubuntu-latest`.
- **Steps, in order:**
  1. `actions/checkout@v7`
  2. `pnpm/action-setup@v6` (reads `packageManager: pnpm@11.20.0`)
  3. `actions/setup-node@v7` — `node-version: 24.12.0`, `cache: pnpm`
  4. `pnpm install --frozen-lockfile` with `CI: true`
  5. `pnpm generate-routes` — **added for this repo**; `tsr generate` must run
     before `typecheck` because the route tree is generated, not committed
  6. `pnpm typecheck`
  7. `pnpm lint`
  8. `pnpm format:check`
  9. `pnpm test`
  10. `pnpm test:coverage`
  11. `pnpm build`

Steps mirror the template; the only structural addition is the
`generate-routes` step required by this repo's tooling.

## 6. `test:coverage` script

`package.json` gains:

```json
"test:coverage": "vitest run --coverage"
```

`@vitest/coverage-v8` is already a devDependency, so no new package is needed.
This is the only source change outside `.github/`.

## 7. gitleaks workflow (`.github/workflows/gitleaks.yml`)

Verbatim from the template:

- Triggers: `push` to `main`; all `pull_request`.
- Steps: `actions/checkout@v7` with `fetch-depth: 0`, then
  `gitleaks/gitleaks-action@v3` with `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

## 8. Dependabot config (`.github/dependabot.yml`)

Verbatim from the template:

- `npm`, directory `/`, weekly, ignoring `@types/node`, grouping dev-dependency
  minor/patch updates.
- `github-actions`, directory `/`, monthly.

## 9. PR template (`.github/pull_request_template.md`)

Mirror the template's sections (Description; Type of change; How has this been
tested — `pnpm check`; Checklist), adapted to this repo's conventions
(`pnpm check`, Conventional Commits).

## 10. Risks & follow-ups

- **Native deps on `ubuntu-latest`.** `better-sqlite3` and `sharp` are native
  modules. They normally install from prebuilt binaries on `ubuntu-latest`
  (Node 24). If the first real CI run fails at `pnpm install`, the fix is to add
  an `apt-get install -y build-essential python3` step before install. This is
  the one thing to watch on the first run.
- **`prepare: lefthook install`** runs during `pnpm install`. Checkout provides
  `.git`, so it is harmless; if it ever errors, set `LEFTHOOK=0` for the install
  step.
- **gitleaks licensing.** `gitleaks-action@v3` is free for public repos; a
  private repo under an organization needs a `GITLEAKS_LICENSE` secret. This
  repo is a personal repo, so no license is expected to be required.
- **Action version pins.** The template pins `checkout@v7`,
  `pnpm/action-setup@v6`, `setup-node@v7`, `gitleaks-action@v3`. These are
  copied as-is; Dependabot's Actions updates will keep them current.
- **Node pin drift.** CI pins `24.12.0` while `package.json` engines allow
  `>=24`. The pin matches the template; a future change can align them.

## 11. Verification

- `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` passes.
- `pnpm test:coverage` runs and produces a coverage report.
- `pnpm build` succeeds.
- YAML is valid and, once pushed, the `CI` and `Secret scanning` workflows run
  green on the PR (this is the real confirmation of the native-dep risk).

## 12. Task outline (detailed via writing-plans)

1. **Script:** add `test:coverage` to `package.json`; run it locally.
2. **CI workflow:** add `.github/workflows/ci.yml`; run the step sequence
   locally.
3. **gitleaks + Dependabot + PR template:** add the three remaining `.github`
   files.
4. **Final verification + docs:** run the full gate set and build; note CI in
   `AGENTS.md` if appropriate.
