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
| 8 | Enabled-directory scoping | Disabled directories hide from every page | `[x]` |
| 9 | Hidden files (`app-config.db` `hidden` key; hide/unhide on Unique Files + Duplicates; bulk actions; hidden filters/counts) | Curate files without deleting them | `[x]` |
| 10 | UI polish pass (page size + column sorting, preview copy actions, header filter/export removal, sidebar/content/directory-picker refinements, path-handling fixes) | Refined UI | `[x]` |
| 11 | Read-path and scan performance (read cache + indexes, indexed SQL reads, server-side paging, records phase off) | Fast reads + no unused scan work | `[x]` |

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

- **8 — Enabled-directory scoping:** disabling a configured directory now hides
  its files from every read path (Overview, Files, Browse, Analytics, Duplicates,
  Directories, shell totals, Preferences counts); re-enabling restores them with no
  rescan. Reads are filtered by the enabled roots; nothing is deleted. Spec:
  [2026-10-04-phase8-enabled-directory-scope-design.md](superpowers/specs/2026-10-04-phase8-enabled-directory-scope-design.md).
  (Phase 8 landed in PRs #82–#85.)

- **9 — Hidden files:** hidden file paths persist in `app-config.db` (the `hidden`
  key) and can be hidden or unhidden one at a time or in bulk from the Unique Files
  and Duplicates pages, without deleting anything. Duplicates gains a hidden filter,
  a hidden count, and per-directory hidden counts in the directory picker. Landed in
  PRs #89, #90, #92, #93 (persistence, Unique Files hide UI, bulk actions,
  multi-select) and #102–#104 (Duplicates hidden filter and counts).

- **10 — UI polish and refinements:** the Files table gained a 100-row page size and
  column sorting; the file preview gained copy-directory and copy-path actions; the
  header filters and the export button were removed; the sidebar was reordered and
  the content widened; the directory picker was widened and shows per-directory
  hidden counts; Browse scrolling and excluded-directory / resync path handling were
  fixed. Landed in PRs #86–#88 and #94–#101.

- **11 — Read-path and scan performance:** every read path filters in indexed SQL
  behind a cached read-only connection; Unique Files, Browse, Duplicates and
  Analytics page on the server; the Preferences directory toggle is one grouped
  read; and the scan no longer builds the unused duplicate `records` table.
  Measured on the synthetic 350k-row bench: Duplicates first page 125 ms and
  Preferences counts 25–28 ms per root meet their targets; Unique Files 630 ms,
  Analytics 402 ms, shell 580 ms and Overview 1,423 ms still miss
  300/200/200/300 ms. Aggregate tables or a cache for those paths are a known
  follow-up. Landed in PRs #108 (A1), #109 (A2), and the A3 scan PR. Spec:
  [2026-10-20-performance-read-paths-design.md](superpowers/specs/2026-10-20-performance-read-paths-design.md);
  plan:
  [2026-10-20-performance-read-paths.md](superpowers/plans/2026-10-20-performance-read-paths.md).

*Phases 9 and 10 have no spec or plan document. This roadmap records them
retrospectively.*

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
- Phase 9 depends on Phase 4a (the `app-config.db` store) and Phase 3 (Duplicates).
- Phase 10 is a UI pass over the phases 1–8 pages and introduces no new data paths.
- Phase 11 depends on Phases 2 and 8 (real data and enabled-root scoping must exist
  before pushing the scope into SQL).

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
| 8 | [2026-10-04-phase8-enabled-directory-scope-design.md](superpowers/specs/2026-10-04-phase8-enabled-directory-scope-design.md) |
| 9 | *(no spec — retrospective; landed in PRs #89, #90, #92, #93, #102–#104)* |
| 10 | *(no spec — retrospective; landed in PRs #86–#88, #94–#101)* |
| 11 | [2026-10-20-performance-read-paths-design.md](superpowers/specs/2026-10-20-performance-read-paths-design.md) |

## How to add a phase

1. Refine this roadmap entry (scope, deliverables, dependencies).
2. Run the brainstorming skill for that phase → write a detailed spec in
   `docs/superpowers/specs/`.
3. Run the writing-plans skill → implementation plan.
4. Execute per the operating rules (branch → PR → sub-agent review → merge).
5. Mark the phase complete here.
