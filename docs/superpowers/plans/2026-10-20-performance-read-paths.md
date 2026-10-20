# Read-Path and Scan Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every read path in imgsorter-app fast at 350k+ entries, page large tables on the server, and remove the unused duplicate-records rebuild from scans.

**Architecture:** Add a read-only SQLite connection cache, an idempotent schema migration (virtual normalized-directory column plus indexes), and an index-friendly SQL scope predicate. Rewrite `server/lib/queries.ts` to filter, group, sort and page in SQL. A1 keeps every current output shape; A2 changes the transport to paged contracts; A3 stops the engine's records phase and derives duplicate stats from the read layer.

**Tech Stack:** TanStack Start, React 19, Mantine v9, better-sqlite3, TypeScript, Vitest, oxlint, Prettier, pnpm 11.20.0, Node >= 24.

**Spec:** `docs/superpowers/specs/2026-10-20-performance-read-paths-design.md`

## Global Constraints

- `server/engine/` stays vendored verbatim. No edits to any file under it.
- `better-sqlite3` never enters a client bundle.
- No new dependencies.
- New code has no comments.
- Prettier: 2 spaces, single quotes, semicolons, print width 120.
- Server read paths import `@tanstack/react-start/server-only` where they touch the database.
- All quality gates must pass before a PR is presented:
  `pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`, then `pnpm build`.
- Evidence over assertions: paste real command output in every PR.
- One branch and one PR per A1/A2/A3. Never merge.
- The approved spec travels with the A1 branch.

## Review Focus

These are the inputs most likely to break behaviour without a test shouting first. Each has a test in the task that owns the code.

1. **Windows drive roots.** A configured root like `G:` must include `G:/a.jpg` and its subtree but not `G2:/a.jpg`. Owned by Task 3.
2. **Backslash and case variants.** Stored directories may use `\` and different case; a root may arrive as `@FIXTURES/media/2025`. Owned by Tasks 3 and 4.
3. **Hidden and keeper JSON with backslashes.** `app-config.db` stores path arrays that may contain `\` and duplicates. Owned by Tasks 8 and 12.
4. **Paging boundaries.** Page 0, page past the end, pageSize outside the whitelist, and an empty database must normalize, not throw. Owned by Task 12.
5. **Reads during a scan.** A long-lived read connection must return the last committed snapshot while the engine writes. Owned by Task 2.

---

# PR A1 — Read foundations

## Task 1: Idempotent read schema

**Files:**
- Create: `server/lib/schema.ts`
- Create: `server/lib/schema.test.ts`
- Modify: `server/lib/scan-runner.ts` (call `ensureReadSchema` after the fixture rewrite)
- Modify: `server/lib/scan-configured.ts` (call `ensureReadSchema` before a run)

**Interfaces:**
- Produces: `ReadSchemaMissingError`, `ensureReadSchema(db: Database): void`

- [ ] **Step 1: Write the failing test**

`server/lib/schema.test.ts` creates a temp DB with the engine's `entries` DDL, runs `ensureReadSchema`, and asserts:

```ts
expect(columns(db).map((c) => c.name)).toContain('directory_norm');
expect(indexNames(db)).toEqual(expect.arrayContaining(['idx_entries_dir_norm', 'idx_entries_hash_filename']));
expect(() => ensureReadSchema(db)).not.toThrow();
expect(columns(db).filter((c) => c.name === 'directory_norm')).toHaveLength(1);
```

Also create a read-only DB without the column and assert `ensureReadSchema` throws `ReadSchemaMissingError`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run server/lib/schema.test.ts`
Expected: FAIL because `./schema` does not exist.

- [ ] **Step 3: Implement `ensureReadSchema`**

`server/lib/schema.ts`:

```ts
export class ReadSchemaMissingError extends Error {}

export function ensureReadSchema(db: Database): void
```

Use `PRAGMA table_info(entries)` to detect the column. If `entries` does not exist, return. If `directory_norm` is missing, run:

```sql
ALTER TABLE entries ADD COLUMN directory_norm TEXT
  GENERATED ALWAYS AS (lower(replace(directory, '\', '/'))) VIRTUAL
```

Always run:

```sql
CREATE INDEX IF NOT EXISTS idx_entries_dir_norm ON entries(directory_norm);
CREATE INDEX IF NOT EXISTS idx_entries_hash_filename ON entries(hash, filename);
```

Wrap SQLite failures in `ReadSchemaMissingError` with the original message as `cause`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run server/lib/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the fixture seed and the scan path**

In `server/lib/scan-runner.ts`, after the path-rewrite `UPDATE` and before `updateFileRecords()`, call `ensureReadSchema` on the same writable connection. Do not change `update_records` yet.

In `server/lib/scan-configured.ts`, before `deps.run`, open a writable connection to `runConfig.dbName` and call `ensureReadSchema`. Close it before the scan starts.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-10-20-performance-read-paths-design.md \
  docs/superpowers/plans/2026-10-20-performance-read-paths.md \
  server/lib/schema.ts server/lib/schema.test.ts server/lib/scan-runner.ts server/lib/scan-configured.ts
git commit -m "feat: add the idempotent read schema"
```

## Task 2: Read connection cache

**Files:**
- Create: `server/lib/db.ts`
- Create: `server/lib/db.test.ts`

**Interfaces:**
- Consumes: `ensureReadSchema` from Task 1.
- Produces: `withRead<T>(fn: (db: Database) => T): T | null`, `closeReadConnections(): void`, `readDbPath(): string`

- [ ] **Step 1: Write the failing tests**

`server/lib/db.test.ts`:

```ts
it('returns null when the database file is missing');
it('reuses the same connection object for the same path');
it('opens a new connection after closeReadConnections');
it('does not share connections across paths');
it('applies query_only and sees committed writes');
```

The reuse test captures the connection in two calls and asserts `expect(second).toBe(first)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run server/lib/db.test.ts`
Expected: FAIL because `./db` does not exist.

- [ ] **Step 3: Implement the cache**

`server/lib/db.ts`:

```ts
export function readDbPath(): string
export function withRead<T>(fn: (db: Database) => T): T | null
export function closeReadConnections(): void
```

- Resolve the path with `process.env.IMGSORTER_DB_PATH ?? sampleDbPath()`.
- If the file does not exist, return `null`.
- Keep `Map<string, Database>`. On a cache miss: open a writable connection, call `ensureReadSchema`, close it, then open `{ readonly: true }`, run `PRAGMA query_only = ON`, `PRAGMA mmap_size = 268435456`, `PRAGMA cache_size = -65536`, and cache it.
- `closeReadConnections()` closes and clears every cached connection.
- Expose the cache only through these functions.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run server/lib/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/db.ts server/lib/db.test.ts
git commit -m "feat: cache read-only database connections"
```

## Task 3: SQL scope predicate

**Files:**
- Create: `server/lib/scope-sql.ts`
- Create: `server/lib/scope-sql.test.ts`

**Interfaces:**
- Produces: `type ScopeClause = { sql: string; params: string[] }`, `scopeClause(roots: string[]): ScopeClause`, `subtreeClause(root: string): ScopeClause`

- [ ] **Step 1: Write the failing tests**

Assert the generated SQL and parameters, then compare the SQL result with `isWithinRoots` on a sample directory list:

```ts
expect(scopeClause([])).toEqual({ sql: '0', params: [] });
expect(scopeClause(['c:/media'])).toEqual({
  sql: '(directory_norm = ? OR (directory_norm >= ? AND directory_norm < ?))',
  params: ['c:/media', 'c:/media/', 'c:/media0'],
});
```

Include a `G:` drive case: `g:/a.jpg` matches `G:`; `g2:/a.jpg` does not. Include a case-and-separator case: `C:\\Media\\2025\\A.JPG` matches `c:/media/2025`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run server/lib/scope-sql.test.ts`
Expected: FAIL because `./scope-sql` does not exist.

- [ ] **Step 3: Implement the predicate**

Normalize each root with `normalizeDirectoryKey` from `app/lib/directory-path`. Emit the group `(directory_norm = ? OR (directory_norm >= ? AND directory_norm < ?))` with `[root, root + '/', root + '0']`. Join multiple groups with `' OR '` and wrap the result in parentheses. Return `{ sql: '0', params: [] }` for an empty list.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run server/lib/scope-sql.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/scope-sql.ts server/lib/scope-sql.test.ts
git commit -m "feat: add an index-friendly SQL scope predicate"
```

## Task 4: Display-to-storage path mapping

**Files:**
- Modify: `server/lib/labels.ts`
- Modify: `server/lib/labels.test.ts`

**Interfaces:**
- Produces: `toStoragePath(displayPath: string): string`, `toStorageRoots(roots: string[]): string[]`

- [ ] **Step 1: Write the failing tests**

Add assertions to `server/lib/labels.test.ts`:

```ts
expect(toStoragePath('C:/Media/2025/Trips/a.jpg')).toBe('@fixtures/Media/2025/Trips/a.jpg');
expect(toStoragePath('d:\\camera imports\\x.jpg')).toBe('@fixtures/Camera Imports/x.jpg');
expect(toStoragePath('Z:/Archive/x.jpg')).toBe('Z:/Archive/x.jpg');
expect(toStorageRoots(['C:/Media', 'Z:/Archive'])).toEqual(['@fixtures/Media', 'Z:/Archive']);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run server/lib/labels.test.ts`
Expected: FAIL because `toStoragePath` is not exported.

- [ ] **Step 3: Implement the mapping**

Derive a reverse table from `ROOT_LABELS`: match each `label` as a prefix, case-insensitively and after normalizing backslashes, and return `prefix + remainder`. Leave unknown paths unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run server/lib/labels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/labels.ts server/lib/labels.test.ts
git commit -m "feat: map display paths back to stored paths"
```

## Task 5: Shell and Overview aggregates

**Files:**
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`

**Interfaces:**
- Consumes: `withRead`, `scopeClause`, `toStorageRoots`.
- Produces: `getShellDataSql(roots: string[]): ShellData`, `getOverviewStatsSql(roots: string[]): OverviewData`, and `duplicateGroupRows(db: Database, scope: ScopeClause): DuplicateGroupRow[]` (internal, exported for reuse and tests). The existing `getShellData` and `getOverviewStats` become one-line delegates with unchanged shapes.

- [ ] **Step 1: Write the failing tests**

Add to `server/lib/queries.test.ts`:

```ts
it('computes shell totals in SQL and matches the fixture plan', () => {
  expect(getShellDataSql(ROOTS)).toEqual({
    files: expected.totalFiles,
    size: expected.totalSize,
    duplicateGroups: expected.duplicateGroups,
  });
});

it('computes overview totals in SQL and matches the fixture plan', () => {
  const stats = getOverviewStatsSql(ROOTS);
  expect(stats.totalFiles).toBe(expected.totalFiles);
  expect(stats.totalSize).toBe(expected.totalSize);
  expect(stats.duplicateGroups).toBe(expected.duplicateGroups);
  expect(stats.redundantSpace).toBe(expected.redundantSpace);
  expect(stats.uniqueFiles).toBe(expected.uniqueFiles);
});
```

The existing assertions in `queries.test.ts` remain the oracle for the delegates.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: FAIL because `getShellDataSql` is not exported.

- [ ] **Step 3: Implement the SQL reads**

In `server/lib/queries.ts`:

- Add `function readScope(roots: string[]): ScopeClause` that maps display roots through `toStorageRoots` and calls `scopeClause`.
- Add `duplicateGroupRows(db, scope)` returning `{ hash, filename, n, firstId }[]` from the grouped duplicate query. Tasks 5, 7, 8 and 18 reuse it.
- `getShellDataSql` runs one `withRead` call with three scalar queries over `entries WHERE <scope>`: `COUNT(*)`, `COALESCE(SUM(size), 0)`, and the duplicate-group count.
- `getOverviewStatsSql` runs one `withRead` call:
  - totals: `COUNT(*)`, `COALESCE(SUM(size), 0)`
  - duplicate groups: `SELECT COUNT(*)` over `duplicateGroupRows`
  - redundant space: join `duplicateGroupRows` to the first member and sum `(n - 1) * size`
  - unique files: `SELECT COUNT(*) FROM (SELECT hash FROM entries WHERE <scope> AND hash IS NOT NULL GROUP BY hash HAVING COUNT(*) = 1)`
  - storage map: `SELECT directory, COUNT(*) AS n, SUM(size) AS bytes FROM entries WHERE <scope> GROUP BY directory`, bucketed by `rootLabelOf` in JS.
  - largest files: `SELECT ... ORDER BY size DESC, filename ASC LIMIT 4`.
- Return the same object shape. Keep `toEntry` for row mapping.
- Make `getShellData` and `getOverviewStats` delegate to the new functions.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/queries.ts server/lib/queries.test.ts
git commit -m "perf: compute shell and overview totals in SQL"
```

## Task 6: Filtered listings and directory stats

**Files:**
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`

**Interfaces:**
- Produces: `listEntriesSql(input: FilesInput, roots: string[]): Entry[]` and `getDirectoryStatsSql(roots: string[]): DirectoryStat[]`. The existing `listEntries` and `getDirectoryStats` become delegates with unchanged shapes.

- [ ] **Step 1: Write the failing tests**

```ts
it('filters in SQL and matches the shared pipeline', () => {
  const all = listEntriesSql({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] }, ROOTS);
  expect(all).toHaveLength(expected.totalFiles);
  const scoped = listEntriesSql(
    { query: '', dir: 'All directories', ext: 'All types', selectedDirs: ['C:/Media/2025'] },
    ROOTS,
  );
  expect(scoped.every((e) => e.directory.startsWith('C:/Media/2025'))).toBe(true);
});

it('groups directory stats in SQL', () => {
  const stats = getDirectoryStatsSql(ROOTS);
  expect(stats.find((row) => row.path === 'C:/Media/2025/Library')?.fileCount).toBeGreaterThan(0);
});
```

Add a filter matrix test comparing `listEntriesSql` with `applyFilters` for query, dir, ext and selectedDirs combinations.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: FAIL because `listEntriesSql` is not exported.

- [ ] **Step 3: Implement the SQL filters**

- `listEntriesSql` builds `WHERE <scope>` plus:
  - query: `(lower(filename) LIKE ? OR lower(path) LIKE ?)` with `%${query.toLowerCase()}%`
  - dir: a `subtreeClause` group
  - ext: `extension = ?`
  - selectedDirs: an OR of `subtreeClause` groups
  - then `ORDER BY directory, filename` (the old stable order) and map rows through `toEntry`.
- `getDirectoryStatsSql` runs `SELECT directory, COUNT(*) AS fileCount, SUM(size) AS size FROM entries WHERE <scope> GROUP BY directory`.
- Make `listEntries` and `getDirectoryStats` delegate.
- Remove the `applyFilters` import from `queries.ts`. Keep the module for the test oracle only.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/queries.ts server/lib/queries.test.ts
git commit -m "perf: filter listings and directory stats in SQL"
```

## Task 7: Analytics rankings

**Files:**
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`

**Interfaces:**
- Produces: `getAnalyticsDataSql(roots: string[]): AnalyticsData`. The existing `getAnalyticsData` becomes a delegate with unchanged shape in A1.

- [ ] **Step 1: Write the failing tests**

```ts
it('returns full analytics rankings from SQL', () => {
  const data = getAnalyticsDataSql(ROOTS);
  expect(data.rankedBySize.length).toBe(expected.totalFiles);
  expect(data.rankedByCopies.length).toBe(expected.duplicateGroups);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: FAIL because `getAnalyticsDataSql` is not exported.

- [ ] **Step 3: Implement**

- `rankedBySize`: `SELECT filename, size FROM entries WHERE <scope> ORDER BY size DESC, filename ASC`.
- `rankedByCopies`: `duplicateGroupRows` ordered by `n DESC, filename ASC`, projected to `{ name, count }`.
- Make `getAnalyticsData` delegate.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/queries.ts server/lib/queries.test.ts
git commit -m "perf: compute analytics rankings in SQL"
```

## Task 8: Duplicate groups and keepers

**Files:**
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`

**Interfaces:**
- Produces: `getDuplicateGroupsSql(roots: string[]): DuplicateGroup[]` and `getKeeperDataSql(paths: string[], roots: string[]): { keepers: KeeperMap; stale: string[] }`. The existing functions become delegates with unchanged shapes in A1.

- [ ] **Step 1: Write the failing tests**

```ts
it('matches the old JS grouping exactly', () => {
  const groups = getDuplicateGroupsSql(ROOTS);
  expect(groups).toHaveLength(expected.duplicateGroups);
  expect(groups.filter((g) => g.count === 2)).toHaveLength(8);
  expect(groups.filter((g) => g.count === 3)).toHaveLength(8);
  expect(groups.filter((g) => g.count === 4)).toHaveLength(8);
  for (const group of groups) {
    expect(group.files).toHaveLength(group.count);
    expect(group.files.every((f) => f.hash === group.hash && f.filename === group.name)).toBe(true);
    expect(group.size).toBe(6_400);
    expect(group.redundantSpace).toBe((group.count - 1) * group.size);
  }
});
```

Add a keeper test with a backslash-and-uppercase variant, and a duplicate entry in the input list.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: FAIL because `getDuplicateGroupsSql` is not exported.

- [ ] **Step 3: Implement**

- `getDuplicateGroupsSql`: one `withRead` call. Use a CTE chain:
  - `scoped AS MATERIALIZED (SELECT ... FROM entries WHERE <scope>)`
  - `groups AS (SELECT hash, filename, COUNT(*) AS n, MIN(id) AS first_id FROM scoped WHERE hash IS NOT NULL AND hash <> '' GROUP BY hash, filename HAVING COUNT(*) > 1)`
  - `keys AS (SELECT hash, filename FROM groups)`
  - `members AS (SELECT e.* FROM scoped e JOIN keys k ON e.hash = k.hash AND e.filename = k.filename)`
  - select groups joined to the first member for `size` and `extension`; order by `filename ASC`.
  - Map members into `files`, derive `directories` as distinct `directory`, and set `key` to `` `${hash}:${filename}` ``.
- `getKeeperDataSql`: one `withRead` call. Normalize input paths with `normalizeDirectoryKey`, match against `lower(replace(path, '\', '/'))`, and use the same duplicate grouping for counts. Preserve the current semantics:
  - a keeper is stale if its path is absent, has no hash, or is no longer a duplicate anywhere
  - a keeper outside the enabled roots is neither kept nor stale
  - keepers in scope with a scoped group count greater than 1 are kept.
- Make `getDuplicateGroups` and `getKeeperData` delegate.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/queries.ts server/lib/queries.test.ts
git commit -m "perf: compute duplicate groups and keepers in SQL"
```

## Task 9: Preferences counts

**Files:**
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`
- Modify: `server/routes/preferences.ts`

**Interfaces:**
- Produces: `countEntriesByDirectory(root: string): number` and `getPreferencesCounts(directories: string[]): Record<string, number>`
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

```ts
it('counts indexed entries regardless of enabled state', () => {
  const media = countEntriesByDirectory('@fixtures/Media/2025');
  expect(media).toBeGreaterThan(0);
  expect(countEntriesByDirectory('@FIXTURES/media/2025')).toBe(media);
  expect(countEntriesByDirectory('@fixtures/Media/2025/nope')).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: FAIL because the second argument is still required.

- [ ] **Step 3: Implement**

- Change the signature to `countEntriesByDirectory(root: string): number`.
- Run `SELECT COUNT(*) AS n FROM entries WHERE <subtreeClause(toStoragePath(root))>`.
- In `server/routes/preferences.ts`, replace the loop with one `getPreferencesCounts(directories)` call that reads `GROUP BY directory_norm` once and folds subtree counts in JS. Export `getPreferencesCounts(directories: string[]): Record<string, number>` from `queries.ts`. The route passes `config.directories.indexed.map((entry) => entry.path)`.
- In `queries.test.ts`, change the scope assertion at line 172 to `expect(countEntriesByDirectory('C:/Media/2025/Library')).toBeGreaterThan(0)` because counts no longer depend on enabled roots. Change the missing-db call to one argument.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/queries.ts server/lib/queries.test.ts server/routes/preferences.ts
git commit -m "perf: count preferences directories in one read"
```

## Task 10: Fixture regeneration and benchmark

**Files:**
- Create: `scripts/bench.ts`
- Modify: `package.json` (`bench` script)
- Regenerate: `server/data/fixture.db`

**Interfaces:**
- Produces: `pnpm bench` that prints per-path timings.

- [ ] **Step 1: Write the benchmark**

`scripts/bench.ts` creates a temp directory, builds a synthetic `entries` DB with 350,000 rows across three roots, applies `ensureReadSchema`, sets `IMGSORTER_DB_PATH` to it, and times:

- `getShellData`
- `getOverviewStats`
- `getPreferencesCounts` for the three synthetic roots
- `listEntries` for the first 100 rows
- `getDuplicateGroups`
- `getAnalyticsData`

Print one line per measurement in milliseconds. Remove the temp DB at the end.

- [ ] **Step 2: Add the script**

In `package.json`, add `"bench": "tsx scripts/bench.ts"`.

- [ ] **Step 3: Regenerate the fixture**

Run: `pnpm seed`
Expected: the fixture is rewritten with the read schema and the seed summary prints.

Tests that run before this step migrate the committed fixture in place through `withRead`. This step makes that change permanent and keeps the working tree clean for every later run.

- [ ] **Step 4: Verify the fixture**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: PASS.

Run: `pnpm bench`
Expected: every read path prints a time; the preferences count is a single-digit or low-double-digit multiple of one query, not 13 full scans.

- [ ] **Step 5: Commit**

```bash
git add scripts/bench.ts package.json server/data/fixture.db
git commit -m "test: add a large-library read benchmark"
```

---

# PR A2 — Paged read paths

### Spec refinement recorded here

`FilesQuery` gains `sizeFilter: 'all' | 'under10' | '10to25' | 'over25'`. The
current "count" filter is a no-op (`All counts` and `Unique only` both pass
every row) and is removed. Duplicates gains the same `sizeFilter`, plus
`countFilter: 'all' | '2' | '3+'` and `keeperFilter: 'all' | 'with' | 'without'`.

## Task 11: Paged contract types

**Files:**
- Modify: `app/lib/types.ts`

- [ ] **Step 1: Add the types**

```ts
export type FilesQuery = {
  query: string;
  selectedDirs: string[];
  extensions: string[];
  sizeFilter: 'all' | 'under10' | '10to25' | 'over25';
  hiddenMode: 'active' | 'hidden' | 'all';
  page: number;
  pageSize: 10 | 25 | 50 | 100;
  sortKey: 'filename' | 'location' | 'type' | 'size';
  direction: 'asc' | 'desc';
};

export type FilesResult = {
  files: Entry[];
  total: number;
  directoryCounts: { path: string; count: number; hidden: number }[];
  extensionCounts: { extension: string; count: number }[];
  hiddenCount: number;
};

export type DuplicatesQuery = {
  query: string;
  selectedDirs: string[];
  extensions: string[];
  sizeFilter: 'all' | 'under10' | '10to25' | 'over25';
  countFilter: 'all' | '2' | '3+';
  keeperFilter: 'all' | 'with' | 'without';
  hiddenMode: 'active' | 'hidden' | 'all';
  page: number;
  pageSize: 10 | 25 | 50 | 100;
};

export type DuplicatesResult = {
  groups: DuplicateGroup[];
  totalGroups: number;
  totalFiles: number;
  keepers: KeeperMap;
  staleKeepers: number;
  directoryCounts: { path: string; count: number; hidden: number; unit: 'group' }[];
  hiddenCount: number;
};

export type AnalyticsQuery = {
  sizePage: number;
  sizePageSize: 5 | 10 | 25 | 50;
  copiesPage: number;
  copiesPageSize: 5 | 10 | 25 | 50;
};

export type AnalyticsResult = {
  rankedBySize: SizeRankRow[];
  totalFiles: number;
  rankedByCopies: CopyRankRow[];
  totalCopies: number;
};
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. The new types are additive.

- [ ] **Step 3: Commit**

```bash
git add app/lib/types.ts
git commit -m "feat: add paged read contracts"
```

## Task 12: Paged files query and route

**Files:**
- Modify: `server/lib/queries.ts`
- Modify: `server/routes/files.ts`
- Modify: `server/routes/browse.ts`
- Modify: `server/lib/queries.test.ts`

**Interfaces:**
- Consumes: `FilesQuery`, `FilesResult` from Task 11.
- Produces: `listFilesPage(input: FilesQuery, roots: string[], hidden: string[]): FilesResult`
- Produces: `getFilesPage` and `getBrowseData` server functions returning `FilesResult` (Browse adds `tree`).

- [ ] **Step 1: Write the failing tests**

```ts
it('returns the first page with an exact total', () => {
  const page = listFilesPage({ ...EMPTY_QUERY, page: 1, pageSize: 10 }, ROOTS, []);
  expect(page.files).toHaveLength(10);
  expect(page.total).toBe(expected.totalFiles);
});

it('normalizes an invalid page and page size', () => {
  const page = listFilesPage({ ...EMPTY_QUERY, page: 0, pageSize: 999 as never }, ROOTS, []);
  expect(page.files).toHaveLength(10);
});

it('filters by size and hidden mode', () => {
  const page = listFilesPage({ ...EMPTY_QUERY, sizeFilter: 'over25', page: 1, pageSize: 10 }, ROOTS, []);
  expect(page.files.every((f) => f.size > 25000000)).toBe(true);
});

it('filters hidden paths that use backslashes and mixed case', () => {
  const target = getOverviewStats(ROOTS).largestFiles[0];
  const hidden = [target.path.toUpperCase().replace(/\//g, '\\')];
  const page = listFilesPage({ ...EMPTY_QUERY, hiddenMode: 'active', page: 1, pageSize: 10 }, ROOTS, hidden);
  expect(page.files.some((f) => f.id === target.id)).toBe(false);
  expect(page.hiddenCount).toBe(1);
});

it('returns directory and extension counts that match the scope', () => {
  const page = listFilesPage({ ...EMPTY_QUERY, page: 1, pageSize: 10 }, ROOTS, []);
  expect(page.directoryCounts.reduce((n, d) => n + d.count, 0)).toBe(expected.totalFiles);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: FAIL because `listFilesPage` is not exported.

- [ ] **Step 3: Implement**

- `listFilesPage`:
  - clamp `page` to `>= 1`; clamp `pageSize` to one of `10, 25, 50, 100` (default 25)
  - map `hiddenMode` to a hidden predicate; pass the `hidden` argument as `JSON.stringify(hidden)` to `json_each`
  - build the `WHERE` from scope, query, selectedDirs, extensions, size range and hidden
  - run `SELECT COUNT(*)`, the page query with `ORDER BY` from a whitelist (`filename`, `directory`, `extension`, `size`) plus `filename` as a tiebreak, and `LIMIT ? OFFSET ?`
  - run `directoryCounts` and `extensionCounts` aggregates over the same `WHERE` minus the directory filter (and minus the extension filter for the extension counts)
  - return `{ files, total, directoryCounts, extensionCounts, hiddenCount }`
- `server/routes/files.ts`: add `getFilesPage`. Leave `getFilteredEntries` in place so the Unique Files route keeps compiling until Task 13.
- `server/routes/browse.ts`: `getBrowseData` calls `listFilesPage` and adds `tree: getDirectoryIndex()`.
- Keep `listEntries` for now; remove it in Task 13 when no route uses it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/queries.ts server/lib/queries.test.ts server/routes/files.ts server/routes/browse.ts
git commit -m "feat: add server-side files paging"
```

## Task 13: Unique Files client paging

**Files:**
- Modify: `app/features/files/FilesTable.tsx`
- Modify: `app/features/files/FilesPage.tsx`
- Modify: `app/routes/unique-files.tsx`
- Modify: `app/features/files/FilesPage.test.tsx`

**Interfaces:**
- Consumes: `FilesQuery`, `FilesResult`, `getFilesPage`.
- Produces: `FilesTable` props `{ data: FilesResult; loading: boolean; onQueryChange: (query: FilesQuery) => void; hidden actions; onSelect }`.

- [ ] **Step 1: Write the failing tests**

Update `FilesPage.test.tsx` to render with a `FilesResult` and assert:

```ts
it('requests a new page when Next is clicked');
it('resets to page 1 when a filter changes');
it('renders the total from the server, not the row count');
it('renders directory counts from the result');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run app/features/files/FilesPage.test.tsx`
Expected: FAIL because `FilesTable` still expects `files`.

- [ ] **Step 3: Implement**

- `FilesTable` keeps its local filter inputs but no longer filters or slices a full list. It builds a `FilesQuery` from its state and calls `onQueryChange` when filters, sort or page change.
- `FilesTable` renders `data.files`; `pageCount = Math.ceil(data.total / pageSize)`; Previous/Next change `page` and call `onQueryChange`.
- `FilesPage` owns the `FilesQuery` state, initializes it and the first page from loader data, calls `getFilesPage` only when the query changes, and shows a loading state.
- Remove `getFilteredEntries` and `listEntries` once nothing imports them.
- `unique-files.tsx` loads the first page and passes it to `FilesPage`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run app/features/files/FilesPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/features/files/FilesTable.tsx app/features/files/FilesPage.tsx \
  app/routes/unique-files.tsx app/features/files/FilesPage.test.tsx
git commit -m "feat: page Unique Files on the server"
```

## Task 14: Browse client paging

**Files:**
- Modify: `app/features/browse/BrowsePage.tsx`
- Modify: `app/routes/browse.tsx`

**Interfaces:**
- Consumes: `FilesResult & { tree: DirectoryNode[] }`, `getBrowseData`.

- [ ] **Step 1: Write the failing test**

Update `app/features/browse/BrowsePage.test.tsx` to assert that changing a filter calls `getBrowseData` with the new query and that the tree still renders.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run app/features/browse/BrowsePage.test.tsx`
Expected: FAIL because `BrowsePage` still takes `files`.

- [ ] **Step 3: Implement**

`BrowsePage` mirrors `FilesPage`: owns `FilesQuery`, initializes from the loader page, calls `getBrowseData` only on change, passes `data` to `FilesTable`, and keeps the tree. `browse.tsx` validates `selectedDirs` from search params as today and loads the first page.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run app/features/browse/BrowsePage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/features/browse/BrowsePage.tsx app/features/browse/BrowsePage.test.tsx app/routes/browse.tsx
git commit -m "feat: page Browse on the server"
```

## Task 15: Duplicates paging

**Files:**
- Modify: `server/lib/queries.ts`
- Modify: `server/routes/duplicates.ts`
- Modify: `app/features/duplicates/DuplicatesPage.tsx`
- Modify: `app/routes/duplicates.tsx`
- Modify: `server/lib/queries.test.ts`
- Modify: `app/features/duplicates/DuplicatesPage.test.tsx`

**Interfaces:**
- Consumes: `DuplicatesQuery`, `DuplicatesResult`.
- Produces: `getDuplicateGroupsPage(input: DuplicatesQuery, roots: string[], hidden: string[], keeperPaths: string[]): DuplicatesResult`
- Produces: `getDuplicatesData` accepting a `DuplicatesQuery`.

- [ ] **Step 1: Write the failing tests**

```ts
it('returns one page of groups and an exact total', () => {
  const page = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, page: 1, pageSize: 10 }, ROOTS, [], []);
  expect(page.groups.length).toBeLessThanOrEqual(10);
  expect(page.totalGroups).toBe(expected.duplicateGroups);
  expect(page.groups.every((g) => g.files.length === g.count)).toBe(true);
});
```

Add a hidden-path test using a backslash-and-uppercase variant of one member path, and a keeper test with a duplicate entry in `keeperPaths`.

Client test: changing the keeper filter calls the server with `keeperFilter: 'with'` and renders the returned page.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run server/lib/queries.test.ts app/features/duplicates/DuplicatesPage.test.tsx`
Expected: FAIL because the paged function does not exist.

- [ ] **Step 3: Implement**

- `getDuplicateGroupsPage` extends Task 8's CTE chain with group-level filters before paging: `countFilter`, `sizeFilter`, `keeperFilter` (matching `keeperPaths` through `json_each`), then `LIMIT`/`OFFSET`; member-level filters (`hiddenMode`, directory, query, extension) go inside `scoped` so totals stay exact. Hidden paths use the `hidden` argument through `json_each`.
- Return `groups`, `totalGroups`, `totalFiles`, `keepers`, `staleKeepers`, `directoryCounts` (unit `group`), and `hiddenCount`.
- `server/routes/duplicates.ts` changes to `{ method: 'POST' }` with a validator for `DuplicatesQuery`. It passes `hiddenService.get()` and `appConfigStore.getKeepers()` to the query.
- `DuplicatesPage` owns the query state, initializes from the loader page, calls `getDuplicatesData` only on change, and keeps the optimistic hide/unhide and keeper saves. The selected-file set stays local.
- `duplicates.tsx` loads the first page.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run server/lib/queries.test.ts app/features/duplicates/DuplicatesPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/queries.ts server/lib/queries.test.ts server/routes/duplicates.ts \
  app/features/duplicates/DuplicatesPage.tsx app/features/duplicates/DuplicatesPage.test.tsx \
  app/routes/duplicates.tsx
git commit -m "feat: page duplicate groups on the server"
```

## Task 16: Analytics paging

**Files:**
- Modify: `server/lib/queries.ts`
- Modify: `server/routes/analytics.ts`
- Modify: `app/features/analytics/AnalyticsPage.tsx`
- Modify: `app/features/analytics/AnalyticsPage.test.tsx`
- Modify: `app/routes/analytics.tsx`
- Modify: `server/lib/queries.test.ts`

**Interfaces:**
- Consumes: `AnalyticsQuery`, `AnalyticsResult`.
- Produces: `getAnalyticsPage(input: AnalyticsQuery, roots: string[]): AnalyticsResult`

- [ ] **Step 1: Write the failing tests**

```ts
it('returns one page of each ranking with exact totals', () => {
  const result = getAnalyticsPage({ sizePage: 1, sizePageSize: 10, copiesPage: 1, copiesPageSize: 10 }, ROOTS);
  expect(result.rankedBySize).toHaveLength(10);
  expect(result.totalFiles).toBe(expected.totalFiles);
  expect(result.rankedByCopies).toHaveLength(10);
  expect(result.totalCopies).toBe(expected.duplicateGroups);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: FAIL because `getAnalyticsPage` is not exported.

- [ ] **Step 3: Implement**

- `getAnalyticsPage` clamps pages and sizes to `5, 10, 25, 50`, runs `ORDER BY ... LIMIT ? OFFSET ?` for both rankings, and returns exact totals.
- `server/routes/analytics.ts` changes to `{ method: 'POST' }` with a validator.
- `AnalyticsPage` owns both page states, initializes from the loader page, and fetches only on change. `analytics.tsx` loads the first page.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/queries.ts server/lib/queries.test.ts server/routes/analytics.ts \
  app/features/analytics/AnalyticsPage.tsx app/routes/analytics.tsx
git commit -m "feat: page analytics rankings on the server"
```

## Task 17: Preferences toggle

**Files:**
- Modify: `app/features/preferences/PreferencesPage.tsx`
- Modify: `app/features/preferences/PreferencesPage.test.tsx`

**Interfaces:**
- Consumes: `saveDirectories`, `getPreferencesCounts` via the route.

- [ ] **Step 1: Write the failing tests**

```ts
it('disables the checkbox while the save is in flight');
it('keeps the toggled state after the server responds');
it('shows the indexed count for a disabled directory');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run app/features/preferences/PreferencesPage.test.tsx`
Expected: FAIL because the checkbox has no pending state.

- [ ] **Step 3: Implement**

- Track `savingPath: string | null`; disable that row's checkbox and Remove button while saving.
- Apply the optimistic state, call `saveDirectories`, reconcile from `result.directories.indexed`, then `router.invalidate()`.
- Render `counts[item.path]` from the server for every row, including disabled rows.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run app/features/preferences/PreferencesPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/features/preferences/PreferencesPage.tsx app/features/preferences/PreferencesPage.test.tsx
git commit -m "perf: make the directory toggle single-read and race-safe"
```

---

# PR A3 — Scan

## Task 18: Turn off the records phase

**Files:**
- Modify: `server/lib/scan-configured.ts`
- Modify: `server/lib/queries.ts`
- Modify: `app/features/preferences/PreferencesPage.tsx`
- Modify: `app/lib/app-config-defaults.ts`
- Modify: `server/lib/scan-configured.test.ts`
- Modify: `app/features/preferences/PreferencesPage.test.tsx`

**Interfaces:**
- Produces: `runConfiguredScan` always sets `update_records: false` and fills `duplicateGroups` and `duplicateFiles` from the read layer after the run.

- [ ] **Step 1: Write the failing tests**

```ts
it('never enables the records phase', () => {
  expect(capturedConfig.update_records).toBe(false);
});

it('fills duplicate stats from the read layer', async () => {
  expect(summary.duplicateGroups).toBe(24);
  expect(summary.duplicateFiles).toBeGreaterThan(0);
});

it('does not render the update-records switch');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run server/lib/scan-configured.test.ts app/features/preferences/PreferencesPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- In `scan-configured.ts`, set `update_records: false`, and after `deps.run` compute `getDuplicateStats(directories)` from the read layer. Return a summary with those values, and store them in `last_scan`.
- Add `getDuplicateStats(roots: string[]): { duplicateGroups: number; duplicateFiles: number }` to `queries.ts`. It reuses `duplicateGroupRows` from Task 5: `duplicateGroups` is the row count, and `duplicateFiles` is `SUM(n - 1)`.
- Remove the "Update duplicate records" switch from `PreferencesPage`.
- Keep `updateRecords` in the config type for backward compatibility, default `false`, and normalize it to `false` on save.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run server/lib/scan-configured.test.ts app/features/preferences/PreferencesPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/scan-configured.ts server/lib/scan-configured.test.ts \
  server/lib/queries.ts app/features/preferences/PreferencesPage.tsx \
  app/features/preferences/PreferencesPage.test.tsx app/lib/app-config-defaults.ts
git commit -m "perf: stop building unused duplicate records"
```

## Task 19: Seed, fixture, and docs

**Files:**
- Modify: `server/lib/scan-runner.ts`
- Modify: `server/lib/queries.test.ts`
- Regenerate: `server/data/fixture.db`
- Modify: `AGENTS.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Stop the seed from building records**

In `server/lib/scan-runner.ts`, set `update_records: false` and remove the `DbService.updateFileRecords()` call. Keep `ensureReadSchema` after the path rewrite.

- [ ] **Step 2: Update the reset assertion**

In `queries.test.ts`, the `clearIndex` test currently expects `records` to be greater than 0. Change it to `expect(result.records).toBe(0)` after the fixture is regenerated.

- [ ] **Step 3: Regenerate and verify**

Run: `pnpm seed`
Expected: the fixture is rewritten without records.

Run: `pnpm vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 4: Update the docs**

Add Phase 11 to `AGENTS.md` and `docs/ROADMAP.md` with the spec and plan paths, the three PRs, and the measured outcomes.

- [ ] **Step 5: Run every gate**

Run: `pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: PASS.

Run: `pnpm build`
Expected: PASS, and `dist/client` contains no `better-sqlite3`.

- [ ] **Step 6: Commit**

```bash
git add server/lib/scan-runner.ts server/lib/queries.test.ts server/data/fixture.db \
  AGENTS.md docs/ROADMAP.md
git commit -m "chore: seed without duplicate records and record phase 11"
```

---

## Final verification for each PR

- [ ] `pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
- [ ] `pnpm build`
- [ ] `pnpm bench` and paste the output in the PR body
- [ ] No `better-sqlite3` in `dist/client`
- [ ] Present the PR URL and wait for review and manual merge
