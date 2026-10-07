# imgsorter-app — Phase 8 Design: Enabled-Directory Scoping

**Date:** 2026-10-04
**Status:** Draft for review
**Scope:** Phase 8 — make disabling a configured directory exclude that
directory's files from the whole app (Overview, Files, Browse, Analytics,
Duplicates, Directories, and the shell totals). Reads are filtered by the
enabled configured roots; nothing is deleted, so re-enabling restores the files
instantly.

## 1. Context

A scan only processes **enabled** configured directories
(`server/lib/scan-configured.ts:40`). But every read query in
`server/lib/queries.ts` ignores `enabled` and reads the `entries` table
directly. So files indexed while a directory was enabled stay visible on every
page after the directory is disabled.

The Phase 6 review flagged the visible symptom: `getDirectoryStats()` returns
directories from all entries while `getDirectoryIndex()` filters roots by
`enabled`, so folders under a disabled root appear in the Directories tree as
plain folders (no root / last-scan badge). The underlying problem is broader:
disabling a directory has no effect on what the app shows.

## 2. Goals

- Disabling a configured directory hides its files from **every** read path.
- Re-enabling restores them instantly (no rescan).
- The Directories and Browse trees, the Preferences per-directory counts, the
  shell totals, Overview, Files, Analytics, and Duplicates all agree.
- The filter is case- and separator-insensitive, and matches a directory and its
  subtree.

## 3. Non-goals

- No deletion of entries. The `entries` and `records` tables keep every row.
- No change to the scan, the engine, or the DB schema.
- No change to the committed fixture DB or `pnpm seed`.
- No UI redesign; the client renders whatever the server returns.

## 4. Technology

Unchanged: TanStack Start (`createServerFn`, route loaders), React 19, Mantine
v9, `better-sqlite3` (server-only), Vitest (client jsdom / server node),
TypeScript strict. No new dependency.

## 5. Project structure (new/changed)

```
server/
  lib/
    directory-scope.ts        # NEW: enabledRoots, isWithinRoots, scopeEntries
    directory-scope.test.ts   # NEW
    queries.ts                # read fns take roots and compute from scoped entries
    queries.test.ts           # update calls; add scope tests
    directory-index.ts        # getDirectoryIndex scopes stats by enabled roots
    directory-index.test.ts   # unchanged (pure builder)
  routes/
    overview.ts               # pass enabledRoots()
    files.ts                  # pass enabledRoots()
    browse.ts                 # pass enabledRoots()
    analytics.ts              # pass enabledRoots()
    duplicates.ts             # pass enabledRoots()
    shell.ts                  # pass enabledRoots()
    preferences.ts            # pass enabledRoots()
```

## 6. Scope model — `server/lib/directory-scope.ts`

`import '@tanstack/react-start/server-only';`

```ts
import type { Entry } from '../../app/lib/types';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import { appConfigStore } from './app-config';

export function enabledRoots(): string[] {
  return appConfigStore
    .get()
    .directories.indexed.filter((entry) => entry.enabled)
    .map((entry) => normalizeDirectoryPath(entry.path));
}

export function isWithinRoots(path: string, roots: string[]): boolean {
  const target = normalizeDirectoryPath(path).toLowerCase();
  return roots.some((root) => {
    const scope = normalizeDirectoryPath(root).toLowerCase();
    return target === scope || target.startsWith(`${scope}/`);
  });
}

export function scopeEntries<T extends { directory: string }>(rows: T[], roots: string[]): T[] {
  return rows.filter((row) => isWithinRoots(row.directory, roots));
}
```

- An **empty** roots list means **nothing** is in scope. With no enabled
  directories the app shows empty, which matches "disabled = hidden".
- Matching normalises separators and case, and includes the whole subtree.

## 7. Query layer — `server/lib/queries.ts`

Every read function takes the enabled roots and computes from **scoped entries**.
The `records` table is no longer read for listings; the duplicate summary is
derived from the scoped entries (Section 8).

- `listEntries(input, roots)`: fetch entries, map to `Entry`, `scopeEntries`,
  then `applyFilters`.
- `getDirectoryStats(roots)`: scope entries, group by `directory` →
  `{ path, fileCount, size }`.
- `getOverviewStats(roots)`: from scoped entries — `totalFiles`, `totalSize`;
  duplicate groups / redundant space / unique files (Section 8); `storageMap`
  (group by `rootLabelOf(directory)`); `largestFiles` (top 4 by size).
- `getShellData(roots)`: from scoped entries — `files`, `size`, `roots`,
  `extensions`, `duplicateGroups`.
- `getAnalyticsData(roots)`: from scoped entries — `rankedBySize` (all, size
  desc), `rankedByCopies` (duplicate groups, count desc).
- `getDuplicateGroups(roots)`: Section 8.
- `countEntriesByDirectory(root, roots)`: count scoped entries whose directory
  is `root` or under it. A disabled `root` yields 0.
- `getKeeperData(paths, roots)`: match entries within scope, so a keeper whose
  file is hidden counts as stale.

Unchanged (id/path lookups for native actions): `getEntryPathById`,
`getEntryPathsByIds`, `clearIndex`.

`roots` is a required parameter. Tests pass explicit roots (Section 10).

## 8. Duplicate derivation

Today `getDuplicateGroups` and the Overview duplicate metrics read the `records`
table, which the engine precomputes over **all** entries. To honour the scope,
derive duplicates from the scoped entries instead, using the same grouping the
engine uses (`hash`, `filename`, `size`, `extension`):

- A **duplicate group** is a group with more than one entry.
- `count` = group size; `size` = the group's size; `redundantSpace` =
  `(count - 1) * size`.
- `directories` = the distinct directories in the group.
- `files` = the group's entries.
- `uniqueFiles` (Overview) = the number of hash groups with exactly one entry
  and a non-null hash.

This keeps Duplicates consistent with the other pages: disabling a directory
removes its copies from the groups, and a group can drop below the duplicate
threshold.

## 9. Routes

Each read route loads the enabled roots and passes them:

```ts
const { enabledRoots } = await import('../lib/directory-scope');
const { getOverviewStats } = await import('../lib/queries');
return { data: getOverviewStats(enabledRoots()), ... };
```

Applies to `overview.ts`, `files.ts`, `browse.ts` (both `listEntries` and
`getDirectoryIndex`), `analytics.ts`, `duplicates.ts`, `shell.ts`, and
`preferences.ts` (`countEntriesByDirectory(entry.path, enabledRoots())`).

`server/lib/directory-index.ts`'s `getDirectoryIndex()` already loads
`appConfigStore`; it calls `getDirectoryStats(enabledRoots())`, so disabled
roots disappear from the Directories and Browse trees.

## 10. Testing & verification

- **`server/lib/directory-scope.test.ts`:** `isWithinRoots` matches the root
  itself and a subtree, ignores case and separators, and returns false for an
  empty roots list; `scopeEntries` filters a mixed list.
- **`server/lib/queries.test.ts`:** update every call to pass the fixture roots
  `['C:/Media', 'D:/Camera Imports']` (they cover all fixture directories).
  Add scope tests: with a narrower roots list (e.g. `['C:/Media/2024']`), the
  totals, listings, directory stats, analytics, and duplicates only include that
  subtree; `countEntriesByDirectory` returns 0 for a root outside the scope.
- **`server/lib/directory-index.test.ts`:** unchanged (pure builder). Optionally
  add a `getDirectoryStats`-scope assertion in `queries.test.ts`.
- **Gates:** `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`;
  `pnpm build`. Confirm no `better-sqlite3`/`sqlite` in `dist/client`.
- **Manual smoke:** index a directory, note the totals; disable it in
  Preferences; confirm every page (Overview, Files, Browse, Analytics,
  Duplicates, Directories, footer) drops it and the Preferences count shows 0;
  re-enable and confirm it returns with no rescan.

## 11. Task outline (detailed via writing-plans)

1. **Scope helper:** `server/lib/directory-scope.ts` (+ tests).
2. **Query layer:** thread `roots` through every read function; derive
   duplicates from scoped entries; update `queries.test.ts`.
3. **Routes + trees:** pass `enabledRoots()` from every read route; scope
   `getDirectoryIndex`.
4. **Final verification + docs:** full gates, build, manual smoke; record the
   phase in `AGENTS.md` and `docs/ROADMAP.md`.

## 12. Trade-offs & follow-ups

- Every read computes from all entries in JS rather than SQL aggregates. For a
  local library this is fine; a very large library could see slower Overview /
  Analytics queries. A later phase could push the scope into SQL.
- The `records` table stays (the engine still writes it for the scan summary)
  but is no longer read for listings. It is effectively write-only for reads.
- Keepers in a disabled directory become stale; re-enabling restores them.
- Files with a NULL hash (unverified) are not grouped as duplicates, because
  duplicate groups require a hash. This is a behaviour difference from the old
  `records`-based derivation.
- The scope is derived from `app-config.db` on every read; it is not cached.
