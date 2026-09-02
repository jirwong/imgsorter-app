# imgsorter-app — Roadmap

Living, cross-phase plan for imgsorter-app. Each phase gets its own detailed
spec under `docs/superpowers/specs/` written at the start of that phase. This
document tracks the overall sequence, what each phase delivers, dependencies,
and current status.

Status legend: `[ ]` planned · `[~]` in progress · `[x]` complete

## Phase overview

| Phase | Scope | Delivers | Status |
| ----- | ----- | -------- | ------ |
| 1 | TanStack Start UI recreation (mock data) | Modular, URL-routed UI; parity with imgsorter-ui-v1 prototype | `[ ]` |
| 2 | Vendor engine server-side; wire read-only pages (Overview, Files, Analytics) to real SQLite data | Real data on read-only pages | `[ ]` |
| 3 | Duplicates feature (groups, filters, keepers) + real scan with progress streaming (Activity) | Working duplicate detection + live scan | `[ ]` |
| 4 | Preferences persistence (`app_config`) + directory management + Reveal/Open/keeper actions | Full config persistence + actions | `[ ]` |
| 5 | Real thumbnails/previews (optional) | Polish | `[ ]` |

*Phase ordering and boundaries are provisional and will be refined as each
phase's brainstorm runs.*

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
- **Persistence:** SQLite `app_config` table managed by the engine (single source
  of truth) for preferences, indexed/ignored directories, scan history (Phase 4).
- **State management:** no TanStack Store. Local `useState` + TanStack Router
  search params + one context. Revisit `useSyncExternalStore`/store in Phase 3 for
  the scan-progress stream.

## Detailed specs

| Phase | Spec |
| ----- | ---- |
| 1 | [2026-09-02-phase1-ui-recreation-design.md](superpowers/specs/2026-09-02-phase1-ui-recreation-design.md) |

## How to add a phase

1. Refine this roadmap entry (scope, deliverables, dependencies).
2. Run the brainstorming skill for that phase → write a detailed spec in
   `docs/superpowers/specs/`.
3. Run the writing-plans skill → implementation plan.
4. Execute per the operating rules (branch → PR → sub-agent review → merge).
5. Mark the phase complete here.
