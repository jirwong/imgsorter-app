# imgsorter-app — Roadmap

Living, cross-phase plan for imgsorter-app. Each phase gets its own detailed
spec under `docs/superpowers/specs/` written at the start of that phase. This
document tracks the overall sequence, what each phase delivers, dependencies,
and current status.

Status legend: `[ ]` planned · `[~]` in progress · `[x]` complete

## Phase overview

| Phase | Scope | Delivers | Status |
| ----- | ----- | -------- | ------ |
| 1 | TanStack Start UI recreation (mock data) | Modular, URL-routed UI; parity with imgsorter-ui-v1 prototype | `[x]` |
| 2 | Vendor engine server-side; wire read-only pages (Overview, Unique Files, Browse, Analytics) + shell totals to real SQLite data | Real data on read-only pages | `[x]` |
| 3 | Duplicates feature (groups, filters, keepers) + real scan with progress streaming (Activity) | Working duplicate detection + live scan | `[x]` |
| 4 | Preferences persistence (`app_config`) + directory management + native OS actions (Reveal/Open, folder picker) + keeper persistence | Full config persistence + actions | `[x]` |
| 5 | Real thumbnails/previews (optional) | Polish | `[x]` |
| 6 | Indexed directory tree page + drive-rooted Browse filter + native Reveal foreground fix | Directories page + working Reveal | `[x]` |
| 7 | Maintenance tab + guarded library index reset | In-app reset with confirmation | `[x]` |

*Phase ordering and boundaries are provisional and will be refined as each
phase's brainstorm runs.*

- **6 — Library directories + native reveal:** a drive-rooted, index-derived
  **Directories** page with per-folder subtree counts and actions (Reveal /
  Filter Browse / Copy path); Browse's filter tree becomes drive-rooted and
  loses its dead collapse button; Windows **Reveal** forces the file-manager
  window to the front. Spec:
  [2026-10-04-phase6-directories-reveal-design.md](superpowers/specs/2026-10-04-phase6-directories-reveal-design.md).

- **7 — Maintenance + library reset:** a Preferences **Maintenance** tab shows the
  indexed totals and a guarded **Reset library index** action (confirmation modal,
  disabled during a scan) that clears the scanned files, duplicate records, scan
  metadata, keepers, and thumbnail cache while keeping directories and preferences.
  Spec:
  [2026-10-04-phase7-library-reset-design.md](superpowers/specs/2026-10-04-phase7-library-reset-design.md).

## Phase 4 sub-phases

Phase 4 is split into four independently shippable sub-phases (each gets its own
spec → plan → PR loop):

- **4a — `app_config` persistence + Preferences directory management:** a dedicated,
  scan-proof `app-config.db` store, and the Preferences page wired to load/save it.
  Spec: [2026-10-03-phase4a-app-config-design.md](superpowers/specs/2026-10-03-phase4a-app-config-design.md). **Complete.**
- **4b — Scan configured directories:** replace the fixture-driven scan source with the
  persisted `app_config` directories; surface real per-directory counts / last scan.
  Spec: [2026-10-03-phase4b-real-scan-design.md](superpowers/specs/2026-10-03-phase4b-real-scan-design.md). **Complete.**
- **4c — Native OS actions:** make `FilePreviewDrawer`'s **Reveal** / **Open file** real, and
  add a **server-side native folder picker** — a "Browse…" button next to the Preferences
  add-directory input that opens the OS folder dialog from the local server and returns the
  picked absolute path (Windows-first, with macOS/Linux fallbacks).
  Spec: [2026-10-03-phase4c-native-actions-design.md](superpowers/specs/2026-10-03-phase4c-native-actions-design.md). **Complete.**
- **4d — Keeper persistence:** persist the one-per-group keeper selection.
  Spec: [2026-10-03-phase4d-keeper-design.md](superpowers/specs/2026-10-03-phase4d-keeper-design.md). **Complete.**

## Dependencies

- Phase 2 depends on Phase 1 (the modular UI + shared types must exist).
- Phase 3 depends on Phase 2 (real data must flow before duplicate/scan work).
- Phase 4 depends on Phase 3 (scan lifecycle must be real before persisting
  preferences/history meaningfully).
- Phase 5 is independent and can slot in anywhere after Phase 2.

## Design decisions (cross-phase)

- **Engine integration:** imgsorter-v2 source is copied/vendored into this repo's
  server side (Phase 2). It is Node-only (better-sqlite3 native module) and must
  live on the server, never leaked into client bundles.
- **Persistence:** preferences and indexed/ignored directories live in a dedicated,
  app-owned SQLite store (`server/data/app-config.db`, Phase 4a), kept separate from the
  engine's photo DB so scans/`pnpm seed` cannot wipe it. (Supersedes the earlier
  "engine-managed `app_config`" proposal.)
- **State management:** no TanStack Store. Local `useState` + TanStack Router
  search params + one context. Revisit `useSyncExternalStore`/store in Phase 3 for
  the scan-progress stream.
- **CI:** GitHub Actions run the local quality gates (`generate-routes`, typecheck,
  lint, format check, tests, coverage) and a build on push to `main` and PRs, plus
  gitleaks secret scanning and Dependabot. See
  [2026-10-04-github-actions-ci-design.md](superpowers/specs/2026-10-04-github-actions-ci-design.md).

## Detailed specs

| Phase | Spec |
| ----- | ---- |
| 1 | [2026-09-02-phase1-ui-recreation-design.md](superpowers/specs/2026-09-02-phase1-ui-recreation-design.md) |
| 2 | [2026-09-08-phase2-real-data-design.md](superpowers/specs/2026-09-08-phase2-real-data-design.md) |
| 3 | [2026-09-27-phase3a-duplicates-design.md](superpowers/specs/2026-09-27-phase3a-duplicates-design.md) · [2026-09-28-phase3b-scan-progress-design.md](superpowers/specs/2026-09-28-phase3b-scan-progress-design.md) |
| 4a | [2026-10-03-phase4a-app-config-design.md](superpowers/specs/2026-10-03-phase4a-app-config-design.md) |
| 4b | [2026-10-03-phase4b-real-scan-design.md](superpowers/specs/2026-10-03-phase4b-real-scan-design.md) |
| 4c | [2026-10-03-phase4c-native-actions-design.md](superpowers/specs/2026-10-03-phase4c-native-actions-design.md) |
| 4d | [2026-10-03-phase4d-keeper-design.md](superpowers/specs/2026-10-03-phase4d-keeper-design.md) |
| 5 | [2026-10-04-phase5-thumbnails-design.md](superpowers/specs/2026-10-04-phase5-thumbnails-design.md) |
| 6 | [2026-10-04-phase6-directories-reveal-design.md](superpowers/specs/2026-10-04-phase6-directories-reveal-design.md) |
| 7 | [2026-10-04-phase7-library-reset-design.md](superpowers/specs/2026-10-04-phase7-library-reset-design.md) |

## How to add a phase

1. Refine this roadmap entry (scope, deliverables, dependencies).
2. Run the brainstorming skill for that phase → write a detailed spec in
   `docs/superpowers/specs/`.
3. Run the writing-plans skill → implementation plan.
4. Execute per the operating rules (branch → PR → sub-agent review → merge).
5. Mark the phase complete here.
