# AGENTS.md

Project instructions for imgsorter-app. These rules are binding on all agent
work in this repository. The user's explicit instructions always override these
rules.

## Objective

[INSERT YOUR OBJECTIVE HERE — TBD by user]

## Operating Rules

Source of truth: `artifacts/operating-rules.md`. Read it before starting any
work. The binding workflow is: **Strict Human-in-the-Loop with Sub-Agent PR
Review**.

### Phase 0: Brainstorming & Task Breakdown

1. Invoke the superpowers `brainstorming` skill before any creative/implementation
   work.
2. Analyze the repo structure, dependencies, and logic.
3. Draft a sequential implementation plan of small, atomic tasks (one task = one
   reviewable PR).
4. **STOP AND WAIT** for explicit approval. Do not write implementation code
   before approval.

### Phase 1: Iterative Execution (PR-by-PR)

Repeat for each approved task:

1. Create a branch off current `main`.
2. Implement.
3. Commit with a descriptive message; push the branch.
4. Open a PR with `gh` against this repository.
5. Dispatch a **fresh** sub-agent (no shared conversation state) with the PR URL,
   branch name, and the verbatim "Sub-Agent Review Instructions" block from
   `artifacts/operating-rules.md`.
6. The sub-agent checks out the branch, reviews, runs tests/lint/build (reporting
   actual output), posts comments via `gh`, and submits a verdict via `gh pr
review`.
7. Address every comment, push fixes, and reply on each thread.
8. Re-review until approved or **3 review rounds exhausted**. If 3 rounds pass
   without approval, STOP and escalate with a summary of unresolved comments.
9. **STOP AND WAIT.** Present the PR URL plus a summary of what changed and what
   the sub-agent approved.
10. The user reviews and merges **manually**. The agent never merges. Only after
    the merge may you pull `main` and begin the next task.

### Hard rules

- **Max 3 review rounds** per PR; never silently exceed the cap.
- **Evidence over assertions.** Run tests, lint, and build; report actual output
  before claiming anything passes. Do the same when resolving comments.
- **Fresh eyes.** The review sub-agent is always a separate, fresh agent.
- **Never merge.** No `gh pr merge`, no self-approval, no auto-approve.
- **Operational failures halt execution.** If push/PR/`gh` auth or any command
  errors unexpectedly, STOP and report; do not work around failures silently.
- **User's word overrides the loop.** Interjections, comments, or scope changes
  always take precedence.

## Repository Conventions

- Package manager: `pnpm` (v11.20.0). Node >= 24 required.
- Code style: Prettier 2-space, single quotes, semicolons, print width 120. No
  comments in new code.
- Always verify work before claiming completion:
  `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
  `pnpm build` must succeed at the end of an implementation task.
- Engine code (`server/engine/`) is vendored verbatim from imgsorter-v2 and is
  server-only. `better-sqlite3` must never enter a client bundle.
- `pnpm seed` regenerates the committed test fixture DB (`server/data/fixture.db`).
  The app DB (`server/data/imgsorter.db`) is gitignored local state. Run manually only;
  never run it casually.
- Fixture files under `server/.fixtures/` are gitignored; the committed DB is not.

## Current Plan State

- Phase 1 (UI recreation) — complete.
- Phase 2 (vendor engine + wire read-only pages to real SQLite) — **complete**
  (PRs #15–#26). Plan at `docs/superpowers/plans/2026-09-08-phase2-real-data.md`;
  spec at `docs/superpowers/specs/2026-09-08-phase2-real-data-design.md`.
- Phase 3 (duplicates feature + real scan with progress streaming) — **complete**
  (Phase 3a PRs #28–#29; Phase 3b PRs #30–#35 plus this finalization PR). Specs at
  `docs/superpowers/specs/2026-09-27-phase3a-duplicates-design.md` and
  `docs/superpowers/specs/2026-09-28-phase3b-scan-progress-design.md`; plan at
  `docs/superpowers/plans/2026-09-28-phase3b-scan-progress.md`. Drives the vendored
  engine from the UI ("Scan library") with in-memory progress polling, cancel, a real
  Duplicates badge, and no dead mock plumbing in `app-context`.
- Phase 4 (Preferences persistence via `app_config`, directory management, native OS
  actions, keeper persistence) — **complete**, split into 4a–4d. **4a**
  (`app_config` persistence + Preferences directory management), **4b**
  (real configured-directory scan; app DB local + committed `fixture.db`; per-directory
  counts/last scan), **4c** (native Reveal / Open actions and a server-side folder picker;
  toasts via `@mantine/notifications`), and **4d** (keeper persistence in `app-config.db`,
  a keeper filter, and a stale-keeper warning). Specs at
  `docs/superpowers/specs/2026-10-03-phase4a-app-config-design.md`,
  `docs/superpowers/specs/2026-10-03-phase4b-real-scan-design.md`,
  `docs/superpowers/specs/2026-10-03-phase4c-native-actions-design.md`, and
  `docs/superpowers/specs/2026-10-03-phase4d-keeper-design.md`; plans at
  `docs/superpowers/plans/2026-10-03-phase4a-app-config.md`,
  `docs/superpowers/plans/2026-10-03-phase4b-real-scan.md`,
  `docs/superpowers/plans/2026-10-03-phase4c-native-actions.md`, and
  `docs/superpowers/plans/2026-10-03-phase4d-keeper.md`.
- Post-Phase-4 cleanup A — **complete**: one persisted `last_scan` record in `app-config.db`
  drives the footer, the Overview `LastRunCard`, and the Activity fallback; the static
  "Not backed up" metric is removed; dead mock data is deleted. Spec at
  `docs/superpowers/specs/2026-10-04-overview-footer-real-data-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-overview-footer-real-data.md`. Cleanup B (keeper delete
  non-keepers) was skipped.
- Phase 5 (real thumbnails/previews) — **complete**: `sharp` generates small WebP previews,
  cached in the gitignored `server/data/thumb-cache/`, shown in the file drawer and the
  Overview largest-files list behind the opt-in `generatePreviews` setting (off by default).
  Spec at `docs/superpowers/specs/2026-10-04-phase5-thumbnails-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-phase5-thumbnails.md`.
- Phase 6 (library directories + native reveal) — **complete**: a drive-rooted,
  index-derived Directories page with subtree counts and Reveal / Filter Browse /
  Copy path actions; Browse's directory filter is drive-rooted and its dead
  collapse button is removed; Windows Reveal forces the file-manager window to
  the front. Spec at
  `docs/superpowers/specs/2026-10-04-phase6-directories-reveal-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-phase6-directories-reveal.md`.
- CI — **added**: a GitHub Actions `CI` workflow runs `generate-routes`, typecheck,
  lint, format check, tests, coverage, and a build on every push to `main` and every
  PR; a `Secret scanning` gitleaks workflow, a Dependabot config, and a PR template
  are also in place. Spec at
  `docs/superpowers/specs/2026-10-04-github-actions-ci-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-github-actions-ci.md`.
- Phase 7 (maintenance tab + library index reset) — **complete**: a Preferences
  **Maintenance** tab shows the indexed totals and a guarded **Reset library index**
  action (confirmation modal; disabled during a scan) that clears the scanned files,
  duplicate records, scan metadata, keepers, and thumbnail cache, and keeps
  directories and preferences. Spec at
  `docs/superpowers/specs/2026-10-04-phase7-library-reset-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-phase7-library-reset.md`.
- Phase 8 (enabled-directory scoping) — **complete**: disabling a configured
  directory hides its files from every read path (Overview, Files, Browse,
  Analytics, Duplicates, Directories, shell totals, Preferences counts);
  re-enabling restores them with no rescan. Reads filter by the enabled roots;
  nothing is deleted. Spec at
  `docs/superpowers/specs/2026-10-04-phase8-enabled-directory-scope-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-phase8-enabled-directory-scope.md`.
- Roadmap: `docs/ROADMAP.md`.
