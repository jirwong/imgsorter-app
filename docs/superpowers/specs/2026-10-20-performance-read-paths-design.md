# imgsorter-app — Phase 11 Design: Read-Path and Scan Performance

**Date:** 2026-10-20
**Status:** Draft for review
**Scope:** Phase 11 — make every read path fast enough for a large library, fix
the multi-second Preferences directory toggle, stop shipping whole-library
payloads to the browser, and remove the unused duplicate-records rebuild from
the scan.

## 1. Context

The app is used with large libraries. The current database holds **355,675
entries** across 13 configured directories. Performance degrades badly at that
size.

Measured on 2026-10-19 against the real `server/data/imgsorter.db`:

| Operation | Time |
| --- | --- |
| `SELECT * FROM entries` with no `WHERE` | 398 ms |
| `toEntry` mapping (two `mapPathToDisplay` calls per row) | 404 ms |
| `isWithinRoots` filter in JS | 138 ms |
| `groupDuplicates` over in-scope rows | 1 ms |
| `getPreferencesData` (13 directories × full table read) | 11,409 ms |
| One Preferences toggle (root loader + preferences loader) | 11,921 ms |
| Engine `dedupStmt` (`GROUP BY` over `entries`) | 2,310 ms |
| `updateFileRecords` output size | 117,710 rows |

The root cause is not the duplicate calculation. Every read function in
`server/lib/queries.ts` loads the entire `entries` table into JavaScript and
filters, groups and sorts there:

- `readScopedRows` runs `SELECT ... FROM entries` with no `WHERE`
  (`server/lib/queries.ts:61-72`).
- `getPreferencesData` calls `countEntriesByDirectory` once per configured
  directory (`server/routes/preferences.ts:10-13`), and each call re-reads the
  whole table. This is the O(D × N) cost that makes the toggle take 12 seconds.
- `openReadonly` opens a new SQLite connection on every call
  (`server/lib/queries.ts:36-40`).
- The Unique Files page sends every entry to the browser and pages on the
  client (`app/routes/unique-files.tsx:8-18`, `app/features/files/FilesTable.tsx`).
- Analytics sends a full sorted list and renders 10 rows
  (`app/features/analytics/AnalyticsPage.tsx:15-26`).
- Duplicates sends all 112,765 groups with every member file
  (`server/routes/duplicates.ts:5-13`).
- The engine rebuilds the `records` table on every scan even though no page
  reads it.

Hashing during scans costs about **0.88 ms per file** (measured on 200 local
files): roughly 79 s per 90,000 files and 5.2 min per 355,675 files.

## 2. Goals

- A Preferences enable/disable toggle responds in under 150 ms at 355k entries.
- Every read path filters in SQL and returns only what the page needs.
- Unique Files, Browse, Duplicates and Analytics use server-side paging.
- The browser never receives the whole library for a paged table.
- The scan stops doing work no read path uses.
- All existing observable behaviour is preserved, including duplicate
  semantics (same hash and same filename).
- Existing tests and quality gates pass.

**Targets** (to be confirmed with the bench script in each PR):

| Path | Target |
| --- | --- |
| Preferences toggle | < 150 ms |
| Preferences loader | < 300 ms |
| Shell totals | < 200 ms |
| Overview | < 300 ms |
| Unique Files first page (server) | < 300 ms |
| Duplicates first page (server) | < 500 ms |
| Analytics | < 200 ms |

## 3. Non-goals

- No edits to `server/engine/`. It stays vendored verbatim.
- No parallel hashing, no change to hash semantics, no full-file hashing.
- No FTS5 or other new search index. Text search keeps `LIKE`.
- No aggregate tables and no triggers. Counts are computed by indexed SQL.
- No UI redesign beyond paging controls and count wiring.
- No change to keeper or hidden semantics.
- No URL/search-param state for table filters.

## 4. Technology

Unchanged: TanStack Start (`createServerFn`, route loaders), React 19, Mantine
v9, `better-sqlite3` (server-only), Vitest (client jsdom / server node),
TypeScript strict, oxlint, Prettier. No new dependency.

## 5. Decisions recorded during brainstorming

- Phase scope: read paths plus scan, phased as three PRs.
- The app may add indexes and a generated column to the engine database. It may
  not add aggregate tables.
- Unique Files and Browse move to full server-side paging.
- The vendored engine stays verbatim.
- Preferences counts show the indexed count for every configured directory,
  independent of enabled state. This is an explicit exception to the Phase 8
  rule that disabled roots are hidden from every read.
- Delivery is three PRs: A1 read foundations, A2 paged read paths, A3 scan.

## 6. Project structure (new/changed)

```
server/
  lib/
    db.ts                     # NEW: read connection cache, withRead
    db.test.ts                # NEW
    schema.ts                 # NEW: ensureReadSchema, idempotent migration
    schema.test.ts            # NEW
    scope-sql.ts              # NEW: SQL scope predicate + parameter builder
    scope-sql.test.ts         # NEW
    queries.ts                # rewritten to SQL; same outputs in A1
    queries.test.ts           # parity tests against the old JS grouping
    labels.ts                 # add a reverse display->storage mapping
    directory-index.ts        # uses scoped SQL stats
    scan-configured.ts        # records off; duplicate stats from the read layer
    scan-runner.ts            # fixture seed stops building records; applies the read schema
  routes/
    files.ts                  # paged input and output
    browse.ts                 # paged input and output plus tree
    duplicates.ts             # paged groups
    analytics.ts              # limited rankings
    preferences.ts            # single-query counts
    shell.ts                  # aggregate query
    overview.ts               # aggregate query
app/
  features/
    files/FilesTable.tsx      # server-paged table
    files/FilesPage.tsx       # paged state
    browse/BrowsePage.tsx     # paged state
    duplicates/DuplicatesPage.tsx  # paged groups
    analytics/AnalyticsPage.tsx    # paged rankings
    preferences/PreferencesPage.tsx # remove the records switch
  lib/types.ts                # paged query/response types
scripts/
  bench.ts                    # NEW: synthetic large DB benchmark
docs/superpowers/specs/       # this document
server/data/fixture.db        # regenerated once with the read schema
```

## 7. Read foundations

### 7.1 Schema additions

`server/lib/schema.ts` exports `ensureReadSchema(db)` and is idempotent:

```sql
ALTER TABLE entries ADD COLUMN directory_norm TEXT
  GENERATED ALWAYS AS (lower(replace(directory, '\', '/'))) VIRTUAL;

CREATE INDEX IF NOT EXISTS idx_entries_dir_norm ON entries(directory_norm);
CREATE INDEX IF NOT EXISTS idx_entries_hash_filename ON entries(hash, filename);
```

- The column is **VIRTUAL** because SQLite cannot add a STORED generated column
  with `ALTER TABLE`, and a virtual column does not rewrite the 355k-row table.
- The engine inserts and updates do not name the column, so its writes stay
  valid and the column is recomputed automatically.
- Column existence is checked with `PRAGMA table_xinfo(entries)` before the
  `ALTER TABLE`. `table_info` omits virtual generated columns, so it would never
  see `directory_norm` and the migration would fail on a second run.
- `ensureReadSchema` runs lazily on the first read access, before the read
  connection is opened: `withRead` opens a short-lived writable connection,
  migrates once per process, then opens the reader. The scan path calls it before
  starting a run. The fixture seed path (`server/lib/scan-runner.ts`, called by
  `scripts/seed.ts`) calls it so the committed fixture gains the column and
  indexes.
- If a read finds the column missing and cannot migrate, it throws a clear
  `ReadSchemaMissingError`. There is no silent fallback path.
- A missing database file is not an error. `withRead` reports "no database" and
  callers return their existing empty results.

### 7.2 Read connection

`server/lib/db.ts` keeps a cache of read-only connections keyed by the absolute
database path. The key matters because tests change `IMGSORTER_DB_PATH` at
runtime.

```ts
withRead<T>(fn: (db: Database) => T): T
closeReadConnections(): void
```

- Each cached connection is opened with `{ readonly: true }` and
  `PRAGMA query_only = ON`, plus `mmap_size` and `cache_size` tuning.
- WAL mode is already enabled by the engine. In WAL, each statement starts a
  fresh read transaction, so a cached reader still sees the latest commit.
- `closeReadConnections()` exists for tests and for the reset path.
- All query functions become synchronous around one `withRead` call. No
  connection is opened per query.

### 7.3 SQL scope predicate

`server/lib/scope-sql.ts` converts a list of normalized roots into a parameterized
fragment:

```sql
(directory_norm = lower(?) OR (directory_norm >= lower(?) AND directory_norm < lower(?)))
```

with parameters `root`, `root + '/'`, `root + '0'`.

- `root/` to `root0` is the exact half-open range for descendants, because `/`
  (0x2F) is the character immediately before `0` (0x30).
- Multiple roots become an `OR` of the same three-parameter group. SQLite's OR
  optimization uses `idx_entries_dir_norm`.
- An empty roots list yields `0` (nothing in scope), matching Phase 8.
- Roots are normalized (forward slashes, trailing slash removed) without
  lowercasing. Both the column and the parameters pass through SQLite `lower()`,
  so ASCII comparison is case-insensitive and non-ASCII casing stays consistent.
- Fixture roots are display paths. `server/lib/labels.ts` gains a reverse
  mapping (`C:/Media` → `@fixtures/Media`) so the predicate uses stored values.
  Result rows still pass through `mapPathToDisplay` for display.

## 8. Query layer and duplicate parity

Every function in `server/lib/queries.ts` is rewritten to filter in SQL. In A1
the public signatures and return shapes stay the same, so the UI keeps working.

| Function | New implementation |
| --- | --- |
| `getOverviewStats` | `COUNT(*)`, `SUM(size)`, duplicate and unique subqueries, `GROUP BY directory` bucketed to roots in JS, largest files with `ORDER BY size DESC, filename ASC LIMIT 4` |
| `getShellData` | scalar aggregate queries over the scoped set |
| `getDirectoryStats` | `GROUP BY directory` with `COUNT(*)` and `SUM(size)` |
| `getAnalyticsData` | `ORDER BY` in SQL; A1 returns the same full lists, A2 adds `LIMIT` for the requested top-N |
| `listEntries` | A1: SQL `WHERE` plus `ORDER BY`, same full list; A2: adds `LIMIT`/`OFFSET` and `COUNT(*)` |
| `getDuplicateGroups` | A1: SQL grouping plus all members, same groups and order; A2: pages the groups |
| `getKeeperData` | keepers matched in SQL against the scoped set |
| `countIndexedEntriesByDirectory` | counts all indexed entries for a directory, regardless of enabled state |

### 8.1 Duplicate rule

The current JS key is `` `${hash}\u0000${filename}` `` and falsy hashes are
skipped (`server/lib/queries.ts:89-97`). The SQL equivalent is:

```sql
SELECT hash, filename, COUNT(*) AS n, MIN(id) AS first_id
FROM entries
WHERE <scope> AND hash IS NOT NULL AND hash <> ''
GROUP BY hash, filename
HAVING COUNT(*) > 1
```

- `size` and `extension` come from the group's lowest-id member, matching the
  current "first row wins" behaviour.
- `directories` is the distinct set of member directories.
- `redundantSpace = (n - 1) × size`.
- `uniqueFiles` is the number of `hash` values with exactly one entry.
- A parity test asserts the SQL result equals the old JS `groupDuplicates`
  output on the fixture, including order and tie-breaks.

### 8.2 Hidden and keeper filters

Hidden paths and keepers live in `app-config.db` as JSON arrays. Paged queries
filter them in SQL by expanding the array with `json_each`:

```sql
NOT EXISTS (SELECT 1 FROM json_each(:hidden) WHERE value = entries.path)
```

One parameter carries the whole list, so there is no parameter-count limit and
no temporary table. The read connection stays read-only with `query_only = ON`.
This keeps page totals exact instead of filtering only the returned page.

### 8.3 Preferences counts

`getPreferencesData` uses one `GROUP BY directory_norm` read and folds subtree
counts in JS. Counts include every indexed entry for the directory and do not
depend on `enabled`. The enabled state is shown separately in the UI.

## 9. Paged read contracts

### 9.1 Types

```ts
type FilesQuery = {
  query: string;
  selectedDirs: string[];
  extensions: string[];
  hiddenMode: 'active' | 'hidden' | 'all';
  page: number;
  pageSize: 10 | 25 | 50 | 100;
  sortKey: 'filename' | 'location' | 'type' | 'size';
  direction: 'asc' | 'desc';
};

type FilesResult = {
  files: Entry[];
  total: number;
  directoryCounts: { path: string; count: number; hidden: number }[];
  extensionCounts: { extension: string; count: number }[];
  hiddenCount: number;
};
```

- Duplicates returns `{ groups, totalGroups, totalFiles, keepers, staleKeepers,
  directoryCounts, hiddenCount }`.
- Browse returns `FilesResult` plus `tree`.
- Analytics returns `{ rankedBySize, rankedByCopies, totalFiles }`, each ranking
  limited to the requested top-N.

### 9.2 Query rules

- Filters, sort and paging all run in SQL.
- Sort columns come from a fixed whitelist and are never interpolated from raw
  input. Direction is `ASC` or `DESC` from a closed set.
- Page and page size are clamped. Invalid input normalizes; it does not throw.
- Text search uses `LIKE` on `filename` and `path`. A leading wildcard cannot
  use an index; FTS5 is a later option.
- Picker counts come from aggregate queries over the same `WHERE` minus the
  directory or extension filter, so counts match what the table would show.
- `getDuplicateGroups` uses one CTE chain in this order: scoped rows, then
  grouped duplicate keys with group-level filters, then the requested page,
  then the member rows for that page. Group filters (count, size, extension,
  keeper) are applied before paging; member filters (directory, hidden) are
  applied inside the member CTE and also before paging, so totals stay exact.
- `app/lib/filter-pipeline.ts` leaves the production path. Its test remains as
  the parity oracle for the SQL filter, and no server module imports it.

### 9.3 Client behaviour

- The route loader supplies the first page.
- Subsequent pages, sorts and filters call the server function directly, the
  same way the Duplicates page already calls `saveKeepers`.
- Filter state stays local. Page resets to 1 when a filter changes.
- `FilesTable` receives a page and totals, not the library. `DirectoryPicker`
  receives counts.
- Missing database yields an empty page with `total: 0`.
- Query failure shows a toast; the table does not render half a page.

## 10. Preferences and the toggle

- The loader uses one `GROUP BY directory_norm` read.
- The toggle updates optimistically, calls `saveDirectories`, then
  `router.invalidate()`.
- The root loader must re-run because enabled roots drive shell totals. Both
  loaders are now index-backed, so a full invalidate is acceptable.
- The checkbox is disabled while its save is in flight, and the server response
  reconciles the local state.
- Target: under 150 ms from click to settled state at 355k entries.

## 11. Scan

The engine stays verbatim, so this change is small.

- `update_records` is set to `false` unconditionally in
  `server/lib/scan-configured.ts`. The `records` table is never read by a page.
  This removes the measured 2.3 s rebuild and about 117k writes per scan.
- The "Update duplicate records" switch is removed from Preferences.
- After the scan, duplicate stats come from the read-layer duplicate query and
  fill `last_scan` and the run summary. The footer, Overview and Activity keep
  showing real numbers.
- `pnpm seed` stops producing records. `server/lib/scan-runner.ts` drops its
  `updateFileRecords` call, sets `update_records: false`, and applies the read
  schema after it rewrites the fixture paths. The reset path still clears the
  table for existing databases.
- Pragma tuning applies only to the app's read connection. The engine opens its
  own connection, so scan I/O settings cannot change without editing the
  engine.
- Hashing stays serial at about 0.88 ms per file.

## 12. Testing and verification

- **Schema tests:** `ensureReadSchema` adds the column and indexes, is
  idempotent, and throws the documented error when it cannot migrate.
- **Connection tests:** the same absolute path reuses one connection;
  `closeReadConnections()` forces a reopen; different paths do not share.
- **Scope tests:** the SQL predicate matches the root and its subtree, ignores
  case and separators, excludes siblings, and returns nothing for empty roots.
  Results equal `isWithinRoots`.
- **Parity tests:** SQL duplicates, overview totals, analytics rankings and
  directory counts equal the old JS results on the fixture.
- **Paging tests:** first, middle and last page; page past the end; invalid
  page, size and sort; empty database; filter and count agreement.
- **Toggle test:** one invalidate cycle issues a bounded number of reads,
  guarding against the O(D × N) regression.
- **Concurrency test:** reads succeed while a scan writes.
- **Fixture:** regenerated once with the read schema. Writable tests keep the
  copy-to-temp pattern.
- **Benchmark:** `scripts/bench.ts` builds a synthetic ~350k-entry database in a
  temporary directory and times each read path. Run before and after; record the
  output in each PR.
- **Gates:** `pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test &&
  pnpm format:check`, then `pnpm build`. Confirm no `better-sqlite3` in
  `dist/client`.

## 13. PR split

Each PR is its own branch, reviewed by a fresh sub-agent, with at most three
review rounds.

1. **A1 — Read foundations.** `db.ts`, `schema.ts`, `scope-sql.ts`, labels
   reverse mapping, SQL rewrite of `queries.ts` with unchanged outputs, fixture
   regeneration, bench script, parity tests.
2. **A2 — Paged read paths.** New types and contracts, routes, `FilesTable`,
   Browse, Duplicates, Analytics, Preferences counts and toggle, hidden/keeper
   JSON-list filters.
3. **A3 — Scan.** Records phase off, switch removed, duplicate stats from the
   read layer, `last_scan` and summary wiring, tests. Also records Phase 11 in
   `AGENTS.md` and `docs/ROADMAP.md`.

A1 lands first and leaves every page working. A2 changes only the transport
shape. A3 is independent of both.

## 14. Trade-offs and follow-ups

- **Index write cost:** the generated-column index adds a little work per scan
  row. Against 0.88 ms per file for hashing, it is negligible.
- **No engine speedup:** scan time stays dominated by serial hashing. A later
  phase can propose an upstream engine change for bounded parallel hashing.
- **`LIKE` search:** a leading wildcard scans the scoped rows. Acceptable for a
  local library; FTS5 is the documented follow-up if search becomes slow.
- **Preferences exception:** indexed counts ignore enabled state. This is a
  deliberate exception to Phase 8 and is documented here.
- **Relationship to Phase 8's trade-off:** Phase 8 accepted JS filtering and
  named "push the scope into SQL" as a later phase. This is that phase.
- **Stale `records` table:** it remains on disk for existing databases and is
  cleared by reset, but nothing writes or reads it after A3.
- **Case folding:** the generated column and the scope parameters both use
  SQLite `lower()`, which folds ASCII only. ASCII directories are
  case-insensitive; non-ASCII directories are case-sensitive but consistent, so
  a correctly cased configured root still matches its subtree. Windows paths in
  practice are mostly ASCII; a later phase can add a custom collation or a
  JS-maintained normalized column.
