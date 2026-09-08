# imgsorter-app — Phase 2 Design: Real SQLite Data on Read-Only Pages

**Date:** 2026-09-08
**Status:** Approved design
**Scope:** Phase 2 only — vendor the imgsorter-v2 engine server-side and wire the
read-only pages (Overview, Unique Files, Browse, Analytics) plus shell totals to
real SQLite data backed by a committed sample database. No interactive scanning,
no duplicates/keeper wiring, no preferences persistence.

## 1. Context & source material

This phase builds on the Phase 1 UI (TanStack Start, mock-data-driven) and the
imgsorter-v2 engine:

1. **imgsorter-app** — the current app. TanStack Start (SSR enabled, `getRouter()`
   in `app/router.tsx`), 7 routes, all data in-memory mock (`app/lib/mock-data.ts`).
   No server code, no `better-sqlite3`, single jsdom vitest config. Shell chrome
   totals (Sidebar "18,426 files · 2.4 GB", Footer totals) are hardcoded and
   duplicated.
2. **imgsorter-v2** — the engine at `C:\dev\repos\imgsorter-v2`. Node/TS,
   `better-sqlite3`. `Runner` orchestrates `scan → resync → records` phases.
   `DbService` owns two tables (`entries`, `records`) with only two read methods
   today (`getDuplicateStats`, `getFileEntriesByDirectory`) — all aggregate/queries
   for Overview/Files/Analytics are new. `FileService` does listing + edge hashing,
   `ProgressEmitter` streams typed events. No app_config table, no scan history,
   no backup concept. `RunConfiguration` is zod-validated.

**Decisions made during brainstorming:**

- **Data source:** a small deterministic fixture tree of dummy files scanned once by
  the vendored engine into a **committed sample DB** (`server/data/imgsorter.db`).
  Portable, reproducible in CI/tests, independent of real drives.
- **Page scope (real data this phase):** Overview `/`, Unique Files `/unique-files`,
  Browse `/browse`, Analytics `/analytics`.
- **Stays mock:** Duplicates `/duplicates` (Phase 3), Activity `/activity` (Phase 3),
  Preferences `/preferences` (Phase 4).
- **Chrome:** Sidebar scan-state and Footer totals become real; Duplicates nav badge
  (`3`) and Activity's "18,426 files indexed" stay static (their pages are mock).
- **Overview realism:** the 5 derivable metrics (total files, total size, duplicate
  groups, redundant space, unique files) are real; "Not backed up" and the Last Run
  card stay static (need backup + scan-history concepts).
- **Data path:** Approach B — a server function runs the *global* filters
  (query/dir/ext/selectedDirs) in SQL and returns matching entries; the client keeps
  `FilesTable`'s local filters/sorting and adds client-side pagination.
- **Path display:** a thin server-side label-map rewrites known fixture roots to
  clean labels (`…/Media/2025` → `C:/Media/2025`, `…/Camera Imports` →
  `D:/Camera Imports`) before rows reach the UI. DB stays real; presentation only.
- **SSR:** route `loader`s call the server functions — initial page is server-rendered,
  navigation/filter changes re-run via RPC. Header query is debounced (~300ms).
- **Seed:** `pnpm seed` is manual and the DB is committed; `pnpm check` verifies the
  DB matches the fixtures rather than auto-reseeding.

## 2. Goals

- Vendor the imgsorter-v2 engine into this repo's server side, ready for the read-only
  pages now and the interactive scan in Phase 3.
- Replace mock data on Overview, Unique Files, Browse, and Analytics with real values
  served from SQLite via TanStack Start server functions / route loaders.
- Make the shared shell totals (Sidebar scan-state, Footer) reflect the real database.
- Preserve visual parity with the Phase 1 UI (same components, shapes, layout); only the
  data source changes, plus client-side pagination where the dataset is no longer tiny.
- Keep the committed sample DB reproducible via a `pnpm seed` script and verifiable in `pnpm check`.

## 3. Non-goals (Phase 2)

- No interactive "Scan library" wiring, no progress streaming, no Activity realism (Phase 3).
- No Duplicates groups/keepers wiring or real badge count (Phase 3).
- No Preferences persistence or directory management (Phase 4).
- No real thumbnails/previews — file rows keep decorative Unsplash thumbs (Phase 5).
- No server-side pagination on the listing pages (client-side only in Phase 2; server
  paging is the Phase 3 migration path toward Approach A).

## 4. Technology

- TanStack Start (React 19, TS7 strict), Mantine v9, lucide-react — unchanged.
- Vendored engine: imgsorter-v2 `src/` (better-sqlite3, zod, yaml) under `server/engine/`.
- Node 24, pnpm. Vitest gains a node-environment project for server/engine tests.

## 5. Project structure (new/changed)

```
imgsorter-app/
  server/
    engine/                 # vendored imgsorter-v2 src (minus CLI/reporter)
      runner.ts
      services/db-service.ts
      services/file-service.ts
      phases/
      types/
      utilities/
      ...
    lib/
      queries.ts            # read-only query module (own better-sqlite3 connection)
      labels.ts             # fixture-root -> clean-label display mapping
      db-path.ts            # resolves the sample DB path for server & seed
    routes/
      overview.ts           # server fn(s): overview stats
      files.ts              # server fn(s): filtered entry listing
      analytics.ts          # server fn(s): size/copies rankings
      shell.ts              # server fn(s): global totals
    data/
      imgsorter.db          # committed sample DB
    .fixtures/              # gitignored, generated by seed, cleaned after
  scripts/
    seed.mjs                # generate fixtures, run engine scan, write DB, clean up
  app/
    routes/                 # loaders call server fns
    features/               # components read loader data; FilesTable gains pagination
    lib/                    # unchanged shapes; context still used by Duplicates
  vitest.config.ts          # jsdom project (client)
  vitest.node.config.ts     # node project (server/engine)
```

## 6. Vendored engine + sample data

### 6.1 Vendoring
Copy imgsorter-v2 `src/` into `server/engine/` verbatim, removing the CLI entry
(`src/index.ts`, `src/cli.ts`, `src/output/reporter.ts` / `CliReporter` and its
nanospinner/commander deps). Keep `Runner`, `DbService`, `FileService`,
`ProgressEmitter`, phases, types, config/utilities. The app drives `Runner`
programmatically (Phase 3) and `DbService` reads now. Add the vendored runtime deps
(`better-sqlite3`, `yaml`, `zod`) to `package.json`.

### 6.2 Fixture generation & seed
`scripts/seed.mjs` (Node, run via `pnpm seed`):
1. Generates a deterministic tree of dummy files into `server/.fixtures/` — real bytes
   so the engine's edge hashing produces genuine duplicate groups. Target ~2,000 files
   across ~8 directories, with a handful of intentional duplicate groups (identical
   content copied into multiple directories) and a couple of large files so every
   Overview metric is non-trivial. A fixed RNG seed keeps it reproducible.
2. Builds a `RunConfiguration` and runs the vendored `Runner` over the fixture tree,
   writing `server/data/imgsorter.db`.
3. Deletes `server/.fixtures/` (gitignored).
The committed `server/data/imgsorter.db` is the source the app reads at runtime.

### 6.3 Path label mapping
`server/lib/labels.ts` maps recorded fixture root prefixes to clean labels used only
for display (Location column, Storage Map, directory filters):
- fixture root `Media/2025` → `C:/Media/2025`
- fixture root `Media/2024` → `C:/Media/2024`
- fixture root `Camera Imports` → `D:/Camera Imports`
The DB retains real paths; the mapping applies when projecting rows into the client
`Entry` shape. Global directory filters operate on the mapped labels.

## 7. Server data layer

### 7.1 Read methods on DbService
Add read-only methods (raw SQL via the engine's prepared-statement pattern) for:
- Overview: `getTotals()` (file count, total size), `getDuplicateGroups()` /
  `getRedundantSpace()` (from `records` where `count > 1`), `getUniqueFiles()` (entries
  whose hash occurs exactly once), `getStorageMap()` (per root/top directory: size
  share), `getLargestFiles(n)`.
- Files/Browse: `getEntriesFiltered(query, dir, ext, selectedDirs)` applying the same
  semantics as the current `applyFilters` (`filter-pipeline.ts`).
- Analytics: `getRankedBySize(page, pageSize)`, `getRankedByCopies(page, pageSize)`.

The runtime opens its **own read-only better-sqlite3 connection** on the sample DB
(WAL allows concurrent readers; the engine's write-oriented connection is unused in
Phase 2).

### 7.2 Server functions
Expose the queries as TanStack Start `createServerFn`s in `server/routes/*.ts`
(`overview.ts`, `files.ts`, `analytics.ts`, `shell.ts`), mapping DB rows to the existing
client `Entry` / `DuplicateGroup` shapes so React components are unchanged. Native/engine
code is server-only; `createServerFn` (or a `server-only` guard) prevents it leaking into
client bundles.

## 8. Client wiring

- **Overview (`/`):** route `loader` calls the overview server fn → real metrics
  (total files, total size, duplicate groups, redundant space, unique files) + storage
  map + largest files. "Not backed up" and Last Run card remain static.
- **Unique Files (`/unique-files`) & Browse (`/browse`):** each route `loader` reads the
  validated URL search params (query/dir/ext/selectedDirs) and calls the files server fn
  (global filters in SQL), returning matching entries. `FilesTable` keeps its local
  filters + sorting and adds **client-side pagination**. Header query is debounced (~300ms).
- **Analytics (`/analytics`):** real "ranked by size" and "ranked by copies" via server
  fns, keeping the existing inline pagination.
- **Sidebar/Footer:** totals from the shell server fn.

The `AppContext` `filtered` memo and `applyFilters` remain in place for Duplicates
(still mock) and are untouched. Global header filters stay the single source for the
header inputs via the existing filter-sync hooks.

## 9. Testing & verification

- Add a **node-environment vitest project** (`vitest.node.config.ts`, or vitest
  `projects`) for `server/` + engine tests (current config is jsdom-only, unsuitable
  for `better-sqlite3`/`node:fs`). Client tests stay in jsdom.
- Server tests cover: the new read queries against the committed sample DB, the
  label-mapping, and the engine's Runner reading from the sample DB.
- `pnpm check` stays green (typecheck, lint, test, format) and includes a seed/DB
  parity check so a stale fixture doesn't silently break metrics.
- `pnpm build` must produce a working SSR production build.

## 10. Open items resolved

- Data path Approach B (server-filtered set + client pagination) — confirmed.
- Browse included with Files — confirmed.
- Shell totals real; deferred-page numbers static — confirmed.
- 5 Overview metrics real; "Not backed up" + Last Run static — confirmed.
- Fixture-root → clean-label display mapping — confirmed.
- SSR via route loaders, `pnpm seed` manual + DB committed — confirmed.
