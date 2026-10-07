# Phase 8 (Enabled-Directory Scoping) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disabling a configured directory hides its files from every read path (Overview, Files, Browse, Analytics, Duplicates, Directories, shell totals, Preferences counts). Re-enabling restores them instantly. Nothing is deleted.

**Architecture:** A `directory-scope` module gives the enabled roots and a pure subtree predicate. Every read query takes the roots and computes from scoped entries; duplicate groups are derived from the scoped entries instead of the precomputed `records` table. Every read route passes `enabledRoots()`.

**Tech Stack:** TanStack Start (`createServerFn`, route loaders), `better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-10-04-phase8-enabled-directory-scope-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24.
- Prettier 2-space, single quotes, semicolons, print width 120. **No comments in new code.**
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- `better-sqlite3` is server-only; never in a client bundle.
- **Never clear the committed fixture DB** (`server/data/fixture.db`).
- `pnpm check` runs `generate-routes` and may change `app/routeTree.gen.ts`. If that file changes and is not part of the task, restore it with `git restore app/routeTree.gen.ts`.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; never merge. All PR text is ASD-STE100.
- Task order: 1 → 2 → 3 → 4. Task 2 imports Task 1; Task 3 imports Task 2.
- Fixture roots for tests: `['C:/Media', 'D:/Camera Imports']` (they cover all fixture directories: `C:/Media/2025/*`, `C:/Media/2024`, `D:/Camera Imports`).

---

### Task 1: Scope helper

**Files:**
- Create: `server/lib/directory-scope.ts`
- Create: `server/lib/directory-scope.test.ts`

**Interfaces:**
- Produces: `enabledRoots(): string[]`, `isWithinRoots(path: string, roots: string[]): boolean`, `scopeEntries<T extends { directory: string }>(rows: T[], roots: string[]): T[]`.

- [ ] **Step 1: Write the failing tests — create `server/lib/directory-scope.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isWithinRoots, scopeEntries } from './directory-scope';

describe('isWithinRoots', () => {
  it('matches a root and its subtree, case- and separator-insensitively', () => {
    const roots = ['C:/Media'];
    expect(isWithinRoots('C:/Media', roots)).toBe(true);
    expect(isWithinRoots('C:\\Media\\2025', roots)).toBe(true);
    expect(isWithinRoots('c:/media/2025/a.jpg', roots)).toBe(true);
    expect(isWithinRoots('C:/Other', roots)).toBe(false);
    expect(isWithinRoots('C:/Media2', roots)).toBe(false);
  });

  it('returns false for an empty roots list', () => {
    expect(isWithinRoots('C:/Media', [])).toBe(false);
  });
});

describe('scopeEntries', () => {
  it('keeps only rows within the roots', () => {
    const rows = [
      { directory: 'C:/Media/2025', name: 'a' },
      { directory: 'D:/Camera Imports', name: 'b' },
    ];
    expect(scopeEntries(rows, ['C:/Media'])).toEqual([{ directory: 'C:/Media/2025', name: 'a' }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run server/lib/directory-scope.test.ts`
Expected: FAIL — cannot resolve `./directory-scope`.

- [ ] **Step 3: Implement the module — create `server/lib/directory-scope.ts`**

```ts
import '@tanstack/react-start/server-only';
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run server/lib/directory-scope.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full check, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add server/lib/directory-scope.ts server/lib/directory-scope.test.ts
git commit -m "feat: add the enabled-directory scope helper"
```

---

### Task 2: Scoped read queries

**Files:**
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`

**Interfaces:**
- Consumes: `isWithinRoots` (Task 1).
- Produces: every read function takes `roots: string[]`; duplicates derive from scoped entries.

- [ ] **Step 1: Add the scoped readers and duplicate grouping — `server/lib/queries.ts`**

Add to the imports:

```ts
import { isWithinRoots } from './directory-scope';
```

Add after `toEntry`:

```ts
function readScopedRows(roots: string[]): EntryRow[] {
  const db = openReadonly();
  if (!db) return [];
  try {
    const rows = db
      .prepare(`SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries`)
      .all() as EntryRow[];
    return rows.filter((row) => isWithinRoots(mapPathToDisplay(row.directory), roots));
  } finally {
    db.close();
  }
}

function readEntries(roots: string[]): Entry[] {
  return readScopedRows(roots).map(toEntry);
}

type DuplicateGrouping = {
  key: string;
  hash: string;
  name: string;
  count: number;
  size: number;
  extension: string;
  directories: string[];
  files: Entry[];
};

function groupDuplicates(entries: Entry[]): DuplicateGrouping[] {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (!entry.hash) continue;
    const key = `${entry.hash}\u0000${entry.filename}`;
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  const result: DuplicateGrouping[] = [];
  for (const files of groups.values()) {
    if (files.length < 2) continue;
    const first = files[0];
    result.push({
      key: `${first.hash}:${first.filename}`,
      hash: first.hash as string,
      name: first.filename,
      count: files.length,
      size: first.size,
      extension: first.extension,
      directories: [...new Set(files.map((file) => file.directory))],
      files,
    });
  }
  return result;
}
```

- [ ] **Step 2: Rewrite `getOverviewStats` — `server/lib/queries.ts`**

Replace the whole function with:

```ts
export function getOverviewStats(roots: string[]): OverviewData {
  const entries = readEntries(roots);
  const totalFiles = entries.length;
  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
  const groups = groupDuplicates(entries);
  const redundantSpace = groups.reduce((sum, group) => sum + (group.count - 1) * group.size, 0);

  const hashCounts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.hash) hashCounts.set(entry.hash, (hashCounts.get(entry.hash) ?? 0) + 1);
  }
  const uniqueFiles = [...hashCounts.values()].filter((count) => count === 1).length;

  const byRoot = new Map<string, number>();
  for (const entry of entries) {
    const label = rootLabelOf(entry.directory);
    byRoot.set(label, (byRoot.get(label) ?? 0) + entry.size);
  }
  const storageMap = [...byRoot.entries()]
    .map(([path, size]) => ({ path, size, share: totalSize === 0 ? 0 : Math.round((size / totalSize) * 100) }))
    .sort((a, b) => b.size - a.size);

  const largestFiles = [...entries]
    .sort((a, b) => b.size - a.size || a.filename.localeCompare(b.filename))
    .slice(0, 4);

  return {
    totalFiles,
    totalSize,
    duplicateGroups: groups.length,
    redundantSpace,
    uniqueFiles,
    storageMap,
    largestFiles,
  };
}
```

- [ ] **Step 3: Rewrite `listEntries` — `server/lib/queries.ts`**

Replace with:

```ts
export function listEntries(input: FilesInput, roots: string[]): Entry[] {
  return applyFilters(readEntries(roots), input.query, input.dir, input.ext, input.selectedDirs);
}
```

- [ ] **Step 4: Rewrite `getDirectoryStats` — `server/lib/queries.ts`**

Replace with:

```ts
export function getDirectoryStats(roots: string[]): DirectoryStat[] {
  const totals = new Map<string, DirectoryStat>();
  for (const entry of readEntries(roots)) {
    const existing = totals.get(entry.directory);
    if (existing) {
      existing.fileCount += 1;
      existing.size += entry.size;
    } else {
      totals.set(entry.directory, { path: entry.directory, fileCount: 1, size: entry.size });
    }
  }
  return [...totals.values()];
}
```

- [ ] **Step 5: Rewrite `getAnalyticsData` — `server/lib/queries.ts`**

Replace with:

```ts
export function getAnalyticsData(roots: string[]): AnalyticsData {
  const entries = readEntries(roots);
  const rankedBySize = [...entries]
    .sort((a, b) => b.size - a.size)
    .map((entry) => ({ filename: entry.filename, size: entry.size }));
  const rankedByCopies = groupDuplicates(entries)
    .map((group) => ({ name: group.name, count: group.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { rankedBySize, rankedByCopies };
}
```

- [ ] **Step 6: Rewrite `getShellData` — `server/lib/queries.ts`**

Replace with:

```ts
export function getShellData(roots: string[]): ShellData {
  const entries = readEntries(roots);
  const files = entries.length;
  const size = entries.reduce((sum, entry) => sum + entry.size, 0);
  const rootLabels = [...new Set(entries.map((entry) => rootLabelOf(entry.directory)))].sort();
  const extensions = [...new Set(entries.map((entry) => entry.extension))].sort();
  const duplicateGroups = groupDuplicates(entries).length;
  return { files, size, roots: rootLabels, extensions, duplicateGroups };
}
```

- [ ] **Step 7: Rewrite `getDuplicateGroups` — `server/lib/queries.ts`**

Replace with:

```ts
export function getDuplicateGroups(roots: string[]): DuplicateGroup[] {
  return groupDuplicates(readEntries(roots))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => ({
      key: group.key,
      hash: group.hash,
      name: group.name,
      count: group.count,
      size: group.size,
      redundantSpace: (group.count - 1) * group.size,
      extension: group.extension,
      directories: group.directories,
      files: group.files,
    }));
}
```

- [ ] **Step 8: Rewrite `countEntriesByDirectory` — `server/lib/queries.ts`**

Replace with:

```ts
export function countEntriesByDirectory(root: string, roots: string[]): number {
  const normalized = normalizeDirectoryPath(root).toLowerCase();
  return readEntries(roots).filter(
    (entry) =>
      entry.directory.toLowerCase() === normalized || entry.directory.toLowerCase().startsWith(`${normalized}/`),
  ).length;
}
```

- [ ] **Step 9: Rewrite `getKeeperData` — `server/lib/queries.ts`**

Replace with:

```ts
export function getKeeperData(paths: string[], roots: string[]): { keepers: KeeperMap; stale: string[] } {
  const keepers: KeeperMap = {};
  if (paths.length === 0) return { keepers, stale: [] };
  const rows = readScopedRows(roots);
  const counts = new Map<string, number>();
  const byPath = new Map<string, EntryRow>();
  for (const row of rows) {
    byPath.set(normalizeDirectoryPath(row.path).toLowerCase(), row);
    if (row.hash) {
      const key = `${row.hash}:${row.filename}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const stale: string[] = [];
  for (const path of paths) {
    const row = byPath.get(normalizeDirectoryPath(path).toLowerCase());
    if (!row || !row.hash) {
      stale.push(path);
      continue;
    }
    const key = `${row.hash}:${row.filename}`;
    if ((counts.get(key) ?? 0) > 1) keepers[key] = row.id;
    else stale.push(path);
  }
  return { keepers, stale };
}
```

Leave `getEntryPathById`, `getEntryPathsByIds`, `clearIndex`, `openReadonly`, `openWritable`, `dbPath`, `toEntry` unchanged.

- [ ] **Step 10: Update the query tests — `server/lib/queries.test.ts`**

Add a constant after the imports:

```ts
const ROOTS = ['C:/Media', 'D:/Camera Imports'];
```

Pass `ROOTS` to every read call:
- `getOverviewStats()` → `getOverviewStats(ROOTS)`
- `listEntries({...})` → `listEntries({...}, ROOTS)`
- `getDirectoryStats()` → `getDirectoryStats(ROOTS)`
- `getAnalyticsData()` → `getAnalyticsData(ROOTS)`
- `getShellData()` → `getShellData(ROOTS)`
- `getDuplicateGroups()` → `getDuplicateGroups(ROOTS)`
- `countEntriesByDirectory('@fixtures/Media/2025/Trips')` → `countEntriesByDirectory('@fixtures/Media/2025/Trips', ROOTS)`
- `getKeeperData([raw, '@fixtures/does/not/exist.jpg'])` → `getKeeperData([raw, '@fixtures/does/not/exist.jpg'], ROOTS)`
- `getKeeperData([])` → `getKeeperData([], ROOTS)`
- `getKeeperData([variant])` → `getKeeperData([variant], ROOTS)`
- In the missing-db test, pass `ROOTS` to `getShellData`, `listEntries`, `getDirectoryStats`, `getDuplicateGroups`, `getAnalyticsData`, `getOverviewStats`, and `countEntriesByDirectory`.

Add scope tests inside the `describe`:

```ts
  it('excludes directories outside the enabled roots', () => {
    const scoped = getOverviewStats(['C:/Media/2024']);
    const all = getOverviewStats(ROOTS);
    expect(scoped.totalFiles).toBeLessThan(all.totalFiles);
    const dirs = getDirectoryStats(['C:/Media/2024']).map((row) => row.path);
    expect(dirs.every((path) => path.startsWith('C:/Media/2024'))).toBe(true);
    expect(countEntriesByDirectory('C:/Media/2025/Library', ['C:/Media/2024'])).toBe(0);
  });

  it('returns empty results for an empty roots list', () => {
    expect(getOverviewStats([]).totalFiles).toBe(0);
    expect(getDirectoryStats([])).toEqual([]);
    expect(getDuplicateGroups([])).toEqual([]);
    expect(getShellData([])).toEqual({ files: 0, size: 0, roots: [], extensions: [], duplicateGroups: 0 });
  });
```

- [ ] **Step 11: Run the query tests to verify they pass**

Run: `pnpm exec vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 12: Run the full check, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add server/lib/queries.ts server/lib/queries.test.ts
git commit -m "feat: scope the read queries to enabled directories"
```

---

### Task 3: Routes and the directory index

**Files:**
- Modify: `server/lib/directory-index.ts`
- Modify: `server/routes/overview.ts`
- Modify: `server/routes/files.ts`
- Modify: `server/routes/browse.ts`
- Modify: `server/routes/analytics.ts`
- Modify: `server/routes/duplicates.ts`
- Modify: `server/routes/shell.ts`
- Modify: `server/routes/preferences.ts`

**Interfaces:**
- Consumes: `enabledRoots` (Task 1), the scoped queries (Task 2).

- [ ] **Step 1: Scope the directory index — `server/lib/directory-index.ts`**

In `getDirectoryIndex`, pass the roots to `getDirectoryStats`:

```ts
export function getDirectoryIndex(): DirectoryNode[] {
  const config = appConfigStore.get();
  const roots: ConfiguredRoot[] = config.directories.indexed
    .filter((entry) => entry.enabled)
    .map((entry) => ({
      path: entry.path,
      lastScannedAt: config.directoryMeta[normalizeDirectoryPath(entry.path).toLowerCase()]?.lastScannedAt,
    }));
  const scope = roots.map((root) => normalizeDirectoryPath(root.path));
  return buildDirectoryIndex(roots, getDirectoryStats(scope));
}
```

- [ ] **Step 2: Pass the roots from every read route**

`server/routes/overview.ts`:

```ts
export const getOverviewData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getOverviewStats } = await import('../lib/queries');
  const { enabledRoots } = await import('../lib/directory-scope');
  const { appConfigStore } = await import('../lib/app-config');
  return { data: getOverviewStats(enabledRoots()), previewsEnabled: appConfigStore.get().application.generatePreviews };
});
```

`server/routes/files.ts`:

```ts
export const getFilesData = createServerFn({ method: 'POST' })
  .validator((input: FilesInput) => input)
  .handler(async ({ data }) => {
    const { listEntries } = await import('../lib/queries');
    const { enabledRoots } = await import('../lib/directory-scope');
    return { files: listEntries(data, enabledRoots()) };
  });
```

(Keep the existing function name; the body is what changes.)

`server/routes/browse.ts`:

```ts
export const getBrowseData = createServerFn({ method: 'POST' })
  .validator((input: FilesInput) => input)
  .handler(async ({ data }) => {
    const { listEntries } = await import('../lib/queries');
    const { enabledRoots } = await import('../lib/directory-scope');
    const { getDirectoryIndex } = await import('../lib/directory-index');
    return { files: listEntries(data, enabledRoots()), tree: getDirectoryIndex() };
  });
```

`server/routes/analytics.ts`: add `const { enabledRoots } = await import('../lib/directory-scope');` and call `loadAnalytics(enabledRoots())`.

`server/routes/shell.ts`: add the import and call `loadShell(enabledRoots())`.

`server/routes/duplicates.ts`:

```ts
export const getDuplicatesData = createServerFn({ method: 'GET' }).handler(async (): Promise<DuplicatesData> => {
  const { getDuplicateGroups, getKeeperData } = await import('../lib/queries');
  const { enabledRoots } = await import('../lib/directory-scope');
  const { appConfigStore } = await import('../lib/app-config');
  const roots = enabledRoots();
  const groups = getDuplicateGroups(roots);
  const { keepers, stale } = getKeeperData(appConfigStore.getKeepers(), roots);
  return { groups, keepers, staleKeepers: stale.length };
});
```

In `clearStaleKeepers`, pass roots to `getKeeperData`:

```ts
export const clearStaleKeepers = createServerFn({ method: 'POST' }).handler(async () => {
  const { getKeeperData } = await import('../lib/queries');
  const { enabledRoots } = await import('../lib/directory-scope');
  const { appConfigStore } = await import('../lib/app-config');
  const { stale } = getKeeperData(appConfigStore.getKeepers(), enabledRoots());
  const staleKeys = new Set(stale.map((path) => keeperKey(path)));
  const remaining = appConfigStore.getKeepers().filter((path) => !staleKeys.has(keeperKey(path)));
  appConfigStore.setKeepers(remaining);
  return { staleKeepers: 0 };
});
```

`server/routes/preferences.ts`: add the import and call `countEntriesByDirectory(entry.path, enabledRoots())`. Compute `enabledRoots()` once before the loop.

- [ ] **Step 3: Verify no read call is left unscoped**

Run: `rg -n "getOverviewStats\(\)|listEntries\([^)]*\)|getAnalyticsData\(\)|getDuplicateGroups\(\)|getShellData\(\)|getDirectoryStats\(\)|countEntriesByDirectory\([^,)]*\)|getKeeperData\([^,)]*\)" server`
Expected: no output (every read call passes roots). The `getEntryPathById`/`getEntryPathsByIds` lookups are not in this list.

- [ ] **Step 4: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

Run: `pnpm build`
Expected: build succeeds. Confirm no `better-sqlite3`/`sqlite` in `dist/client`.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add server/lib/directory-index.ts server/routes/overview.ts server/routes/files.ts server/routes/browse.ts server/routes/analytics.ts server/routes/duplicates.ts server/routes/shell.ts server/routes/preferences.ts
git commit -m "feat: scope every read route to enabled directories"
```

---

### Task 4: Final verification and docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Run the full check + build**

Run: `pnpm check`
Expected: `generate-routes`, typecheck, lint, tests, and format all pass.

Run: `pnpm build`
Expected: build succeeds.

Run: `rg -l "better-sqlite3|sqlite" dist/client`
Expected: no output.

- [ ] **Step 2: Manual smoke**

Run `pnpm dev`. Note the totals. Disable a configured directory in Preferences. Confirm Overview, Files, Browse, Analytics, Duplicates, Directories, and the footer all drop it, and the Preferences count shows 0. Re-enable and confirm it returns with no rescan.

- [ ] **Step 3: Record the phase in `docs/ROADMAP.md`**

Add a row to the phase table:

```
| 8 | Enabled-directory scoping | Disabled directories hide from every page | `[x]` |
```

Add a bullet under the phase table:

```
- **8 — Enabled-directory scoping:** disabling a configured directory now hides
  its files from every read path (Overview, Files, Browse, Analytics, Duplicates,
  Directories, shell totals, Preferences counts); re-enabling restores them with no
  rescan. Reads are filtered by the enabled roots; nothing is deleted. Spec:
  [2026-10-04-phase8-enabled-directory-scope-design.md](superpowers/specs/2026-10-04-phase8-enabled-directory-scope-design.md).
```

- [ ] **Step 4: Record the phase in `AGENTS.md`**

Add a bullet under "Current Plan State" after the Phase 7 bullet:

```
- Phase 8 (enabled-directory scoping) — **complete**: disabling a configured
  directory hides its files from every read path (Overview, Files, Browse,
  Analytics, Duplicates, Directories, shell totals, Preferences counts);
  re-enabling restores them with no rescan. Reads filter by the enabled roots;
  nothing is deleted. Spec at
  `docs/superpowers/specs/2026-10-04-phase8-enabled-directory-scope-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-phase8-enabled-directory-scope.md`.
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/ROADMAP.md
git commit -m "docs: record Phase 8 complete"
```

## Self-Review Checklist

1. **Spec coverage:**
   - `enabledRoots` / `isWithinRoots` / `scopeEntries` → Task 1.
   - Scoped reads + duplicate derivation → Task 2.
   - Routes + `getDirectoryIndex` → Task 3.
   - Docs → Task 4.
2. **Placeholder scan:** every step has full code or an exact command; no TBD/TODO.
3. **Type consistency:** every read function gains `roots: string[]`; `groupDuplicates` returns `DuplicateGrouping` mapped to `DuplicateGroup`; `getKeeperData(paths, roots)` keeps the `{ keepers, stale }` shape; `countEntriesByDirectory(root, roots)`; `enabledRoots()` returns normalized paths.
4. **Ordering:** Task 2 imports Task 1's `isWithinRoots`; Task 3 imports Task 1's `enabledRoots` and Task 2's scoped queries.
5. **Fixture note:** the fixture has 0 null hashes and 24 duplicate groups by `(hash, filename)`, so the new derivation matches the existing assertions.
