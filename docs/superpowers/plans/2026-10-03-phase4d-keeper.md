# Phase 4d (Keeper Persistence + Keeper Filter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the one-per-group keeper selection in `app-config.db`, add a `All groups / With keeper / Without keeper` filter, and warn about saved keepers that no longer match a group.

**Architecture:** Store keepers as a flat `string[]` of raw file paths under a new `keepers` key in the scan-proof `app-config.db`. On read, `queries.getKeeperData` joins `entries` to `records` to build a `groupKey → id` map and a stale list. A new `DuplicatesPage` initializes from the loader, autosaves on each toggle, applies a keeper filter, and shows an inline stale warning with Clear.

**Tech Stack:** TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9, `@mantine/notifications`, `better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-10-03-phase4d-keeper-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24.
- Prettier 2-space, single quotes, semicolons, print width 120. **No comments in new code.**
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- Engine/`better-sqlite3` is server-only; never in a client bundle. Server fns dynamically `import()` server libs inside the handler.
- `app-config.db` is scan-proof; keepers never live in the photo DB.
- Keeper identity is the **raw file path**; matching is case- and separator-insensitive via `lower(replace(path, char(92), '/'))`.
- Autosave on toggle. One keeper per group. Stale keepers show a warning with Clear.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; never merge. All PR text is ASD-STE100.
- `pnpm check` runs `generate-routes` and may change `app/routeTree.gen.ts`. If that file changes and is not part of the task, restore it with `git restore app/routeTree.gen.ts`.

---

### Task 1: Keeper store + keeper queries

**Files:**
- Modify: `app/lib/types.ts`
- Modify: `server/lib/app-config.ts`
- Modify: `server/lib/app-config.test.ts`
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`

**Interfaces:**
- Produces: `KeeperMap`, `DuplicatesData`; `appConfigStore.getKeepers()`, `appConfigStore.setKeepers(paths)`; `getEntryPathsByIds(ids)`, `getKeeperData(paths)`.

- [ ] **Step 1: Add shared types — `app/lib/types.ts`**

Append to the end of the file:

```ts
export type KeeperMap = Record<string, number>;

export type DuplicatesData = { groups: DuplicateGroup[]; keepers: KeeperMap; staleKeepers: number };
```

- [ ] **Step 2: Write the failing store tests — `server/lib/app-config.test.ts`**

Add these tests inside the `describe`, after the `ignores an invalid directory_meta value` test:

```ts
  it('defaults keepers to an empty list', () => {
    expect(store.getKeepers()).toEqual([]);
  });

  it('normalizes, de-duplicates, and round-trips keepers', () => {
    const saved = store.setKeepers([' C:\\Media\\A.jpg ', 'c:/media/a.jpg', '', 'C:\\Media\\B.jpg\\']);
    expect(saved).toEqual(['C:/Media/A.jpg', 'C:/Media/B.jpg']);
    expect(store.getKeepers()).toEqual(['C:/Media/A.jpg', 'C:/Media/B.jpg']);
  });

  it('keeps keepers when directories and settings are saved', () => {
    store.setKeepers(['C:/Media/A.jpg']);
    store.saveDirectories({ indexed: [], ignored: [] });
    store.saveApplication({ ...DEFAULT_APP_CONFIG.application, extensions: 'png' });
    expect(store.getKeepers()).toEqual(['C:/Media/A.jpg']);
  });

  it('ignores an invalid keepers value', () => {
    store.getKeepers();
    const raw = new Database(dbPath);
    raw.prepare(`UPDATE app_config SET value = '{}' WHERE key = 'keepers'`).run();
    raw.close();
    expect(store.getKeepers()).toEqual([]);
  });
```

- [ ] **Step 3: Run the store tests to verify they fail**

Run: `pnpm exec vitest run server/lib/app-config.test.ts`
Expected: FAIL — `store.getKeepers` is not a function.

- [ ] **Step 4: Implement keepers in the store — `server/lib/app-config.ts`**

Add the key next to the other key constants:

```ts
const KEEPERS_KEY = 'keepers';
```

Extend the store type:

```ts
export type AppConfigStore = {
  get: () => AppConfig;
  saveApplication: (input: ApplicationConfig) => AppConfig;
  saveDirectories: (input: DirectoriesConfig) => AppConfig;
  recordScannedDirectories: (paths: string[], at: string) => AppConfig;
  getKeepers: () => string[];
  setKeepers: (paths: string[]) => string[];
};
```

Add a guard next to `isDirectoryMeta`:

```ts
function isKeeperPaths(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
```

Add a normalizer next to `normalizeDirectories`:

```ts
function normalizeKeepers(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of paths) {
    const path = normalizeDirectoryPath(value);
    if (path.length === 0) continue;
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(path);
  }
  return result;
}
```

Add the two methods to the object returned by `createAppConfigStore`, after `recordScannedDirectories`:

```ts
    getKeepers: () => {
      const db = openStore(dbPath);
      try {
        return readKey<string[]>(db, KEEPERS_KEY, [], isKeeperPaths);
      } finally {
        db.close();
      }
    },
    setKeepers: (paths) => {
      const db = openStore(dbPath);
      try {
        const next = normalizeKeepers(paths);
        writeKey(db, KEEPERS_KEY, next);
        return next;
      } finally {
        db.close();
      }
    },
```

- [ ] **Step 5: Run the store tests to verify they pass**

Run: `pnpm exec vitest run server/lib/app-config.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing query tests — `server/lib/queries.test.ts`**

Add `getEntryPathsByIds` and `getKeeperData` to the import from `./queries` (alphabetical: after `getEntryPathById`):

```ts
import {
  countEntriesByDirectory,
  getAnalyticsData,
  getDirectoryTree,
  getDuplicateGroups,
  getEntryPathById,
  getEntryPathsByIds,
  getKeeperData,
  getOverviewStats,
  getShellData,
  listEntries,
} from './queries';
```

Add these tests inside the `describe`, after the `reads the raw stored path for an entry id` test:

```ts
  it('maps entry ids to raw paths and drops unknown ids', () => {
    const [group] = getDuplicateGroups();
    const id = group.files[0].id;
    const paths = getEntryPathsByIds([id, 99999999]);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('@fixtures');
  });

  it('resolves saved keeper paths and reports stale paths', () => {
    const [group] = getDuplicateGroups();
    const id = group.files[0].id;
    const raw = getEntryPathsByIds([id])[0];
    const { keepers, stale } = getKeeperData([raw, '@fixtures/does/not/exist.jpg']);
    expect(keepers[group.key]).toBe(id);
    expect(stale).toEqual(['@fixtures/does/not/exist.jpg']);
  });

  it('returns empty keeper data for empty input', () => {
    expect(getKeeperData([])).toEqual({ keepers: {}, stale: [] });
  });
```

- [ ] **Step 7: Run the query tests to verify they fail**

Run: `pnpm exec vitest run server/lib/queries.test.ts`
Expected: FAIL — `getKeeperData` / `getEntryPathsByIds` are not functions.

- [ ] **Step 8: Implement the query functions — `server/lib/queries.ts`**

Add `KeeperMap` to the type import from `../../app/lib/types`. Add these two functions at the end of the file, after `getEntryPathById`:

```ts
export function getEntryPathsByIds(ids: number[]): string[] {
  if (ids.length === 0) return [];
  const db = openReadonly();
  if (!db) return [];
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const rows = db.prepare(`SELECT path FROM entries WHERE id IN (${placeholders})`).all(...ids) as {
      path: string;
    }[];
    return rows.map((row) => row.path);
  } finally {
    db.close();
  }
}

export function getKeeperData(paths: string[]): { keepers: KeeperMap; stale: string[] } {
  const keepers: KeeperMap = {};
  if (paths.length === 0) return { keepers, stale: [] };
  const db = openReadonly();
  if (!db) return { keepers, stale: [] };
  try {
    const storedByKey = new Map<string, string>();
    for (const path of paths) {
      storedByKey.set(normalizeDirectoryPath(path).toLowerCase(), path);
    }
    const keys = [...storedByKey.keys()];
    const placeholders = keys.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT e.id AS id, e.path AS path, e.hash AS hash, e.filename AS filename, r.count AS count
         FROM entries e
         LEFT JOIN records r ON r.hash = e.hash AND r.filename = e.filename
         WHERE lower(replace(e.path, char(92), '/')) IN (${placeholders})`,
      )
      .all(...keys) as { id: number; path: string; hash: string; filename: string; count: number | null }[];
    const matched = new Set<string>();
    for (const row of rows) {
      if (row.count !== null && row.count > 1) {
        keepers[`${row.hash}:${row.filename}`] = row.id;
        matched.add(normalizeDirectoryPath(row.path).toLowerCase());
      }
    }
    const stale = paths.filter((path) => !matched.has(normalizeDirectoryPath(path).toLowerCase()));
    return { keepers, stale };
  } finally {
    db.close();
  }
}
```

- [ ] **Step 9: Run the query tests to verify they pass**

Run: `pnpm exec vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 10: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add app/lib/types.ts server/lib/app-config.ts server/lib/app-config.test.ts server/lib/queries.ts server/lib/queries.test.ts
git commit -m "feat: persist keepers in app config and resolve them from the photo db"
```

### Task 2: Endpoints, route, and the keeper-aware Duplicates page

**Files:**
- Modify: `server/routes/duplicates.ts`
- Modify: `app/routes/duplicates.tsx`
- Create: `app/features/duplicates/keeper-filter.ts`
- Create: `app/features/duplicates/keeper-filter.test.ts`
- Modify: `app/features/duplicates/DuplicatesPage.tsx`
- Modify: `app/features/duplicates/DuplicatesPage.test.tsx`

**Interfaces:**
- Consumes: `KeeperMap`, `DuplicatesData` (Task 1); `appConfigStore.getKeepers/setKeepers`, `getDuplicateGroups`, `getEntryPathsByIds`, `getKeeperData` (Task 1).
- Produces: `getDuplicatesData`, `saveKeepers`, `clearStaleKeepers`; `matchesKeeperFilter`, `KeeperFilterValue`; `DuplicatesPage({ groups, initialKeepers, initialStaleKeepers })`.

- [ ] **Step 1: Replace the route endpoints — `server/routes/duplicates.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import type { DuplicatesData, KeeperMap } from '../../app/lib/types';

function keeperKey(path: string): string {
  return normalizeDirectoryPath(path).toLowerCase();
}

export const getDuplicatesData = createServerFn({ method: 'GET' }).handler(async (): Promise<DuplicatesData> => {
  const { getDuplicateGroups, getKeeperData } = await import('../lib/queries');
  const { appConfigStore } = await import('../lib/app-config');
  const groups = getDuplicateGroups();
  const { keepers, stale } = getKeeperData(appConfigStore.getKeepers());
  return { groups, keepers, staleKeepers: stale.length };
});

export const saveKeepers = createServerFn({ method: 'POST' })
  .validator((input: { keepers: KeeperMap }) => input)
  .handler(async ({ data }) => {
    const { getEntryPathsByIds } = await import('../lib/queries');
    const { appConfigStore } = await import('../lib/app-config');
    const paths = getEntryPathsByIds(Object.values(data.keepers));
    appConfigStore.setKeepers(paths);
    return { saved: paths.length };
  });

export const clearStaleKeepers = createServerFn({ method: 'POST' }).handler(async () => {
  const { getKeeperData } = await import('../lib/queries');
  const { appConfigStore } = await import('../lib/app-config');
  const { stale } = getKeeperData(appConfigStore.getKeepers());
  const staleKeys = new Set(stale.map((path) => keeperKey(path)));
  const remaining = appConfigStore.getKeepers().filter((path) => !staleKeys.has(keeperKey(path)));
  appConfigStore.setKeepers(remaining);
  return { staleKeepers: 0 };
});
```

- [ ] **Step 2: Update the route loader — `app/routes/duplicates.tsx`**

Replace the import and the body:

```tsx
import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { DuplicatesPage } from '../features/duplicates/DuplicatesPage';
import { useFilterSearchParams } from '../lib/filter-sync';
import { getDuplicatesData } from '../../server/routes/duplicates';

export const Route = createFileRoute('/duplicates')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === 'string' ? search.query : undefined,
    dir: typeof search.dir === 'string' ? search.dir : undefined,
    ext: typeof search.ext === 'string' ? search.ext : undefined,
  }),
  loader: async () => getDuplicatesData(),
  component: DuplicatesRoute,
});

function DuplicatesRoute() {
  useFilterSearchParams();
  const { groups, keepers, staleKeepers } = useLoaderData({ from: '/duplicates' });
  return <DuplicatesPage groups={groups} initialKeepers={keepers} initialStaleKeepers={staleKeepers} />;
}
```

- [ ] **Step 3: Write the failing filter helper test — create `app/features/duplicates/keeper-filter.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { DuplicateGroup } from '../../lib/types';
import { matchesKeeperFilter } from './keeper-filter';

const group = { key: 'h1:dup.jpg' } as DuplicateGroup;

describe('matchesKeeperFilter', () => {
  it('handles the three values', () => {
    expect(matchesKeeperFilter(group, {}, 'All groups')).toBe(true);
    expect(matchesKeeperFilter(group, {}, 'With keeper')).toBe(false);
    expect(matchesKeeperFilter(group, {}, 'Without keeper')).toBe(true);
    expect(matchesKeeperFilter(group, { 'h1:dup.jpg': 1 }, 'With keeper')).toBe(true);
    expect(matchesKeeperFilter(group, { 'h1:dup.jpg': 1 }, 'Without keeper')).toBe(false);
  });
});
```

- [ ] **Step 4: Run the helper test to verify it fails**

Run: `pnpm exec vitest run app/features/duplicates/keeper-filter.test.ts`
Expected: FAIL — `./keeper-filter` cannot be found.

- [ ] **Step 5: Implement the filter helper — create `app/features/duplicates/keeper-filter.ts`**

```ts
import type { DuplicateGroup, KeeperMap } from '../../lib/types';

export type KeeperFilterValue = 'All groups' | 'With keeper' | 'Without keeper';

export function matchesKeeperFilter(group: DuplicateGroup, keepers: KeeperMap, filter: KeeperFilterValue): boolean {
  if (filter === 'With keeper') return Boolean(keepers[group.key]);
  if (filter === 'Without keeper') return !keepers[group.key];
  return true;
}
```

- [ ] **Step 6: Run the helper test to verify it passes**

Run: `pnpm exec vitest run app/features/duplicates/keeper-filter.test.ts`
Expected: PASS.

- [ ] **Step 7: Replace the page test — `app/features/duplicates/DuplicatesPage.test.tsx`**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import type { DuplicateGroup, Entry, KeeperMap } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  saveKeepers: vi.fn(),
  clearStaleKeepers: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/duplicates', () => ({
  saveKeepers: mocks.saveKeepers,
  clearStaleKeepers: mocks.clearStaleKeepers,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: mocks.notifyShow },
}));

import { DuplicatesPage } from './DuplicatesPage';

const entry = (id: number, directory: string): Entry => ({
  id,
  size: 6_400,
  directory,
  extension: '.jpg',
  filename: 'dup.jpg',
  birthtime: '2025-02-11T10:24:00Z',
  hash: 'h1',
  path: `${directory}/dup.jpg`,
});

const groups: DuplicateGroup[] = [
  {
    key: 'h1:dup.jpg',
    hash: 'h1',
    name: 'dup.jpg',
    count: 2,
    size: 6_400,
    redundantSpace: 6_400,
    extension: '.jpg',
    directories: ['C:/Media/2025/Trips', 'C:/Media/2025/Library'],
    files: [entry(1, 'C:/Media/2025/Trips'), entry(2, 'C:/Media/2025/Library')],
  },
];

function renderPage(initialKeepers: KeeperMap = {}, initialStaleKeepers = 0) {
  render(
    <MantineProvider defaultColorScheme="dark">
      <AppProvider>
        <DuplicatesPage groups={groups} initialKeepers={initialKeepers} initialStaleKeepers={initialStaleKeepers} />
      </AppProvider>
    </MantineProvider>,
  );
}

describe('DuplicatesPage keepers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveKeepers.mockResolvedValue({ saved: 1 });
    mocks.clearStaleKeepers.mockResolvedValue({ staleKeepers: 0 });
  });

  it('allows at most one keeper per group and saves on toggle', async () => {
    renderPage();
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).toBeInTheDocument();

    fireEvent.click(screen.getByText('dup.jpg'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    expect(screen.getByText('1 groups · 2 files · 1 keepers')).toBeInTheDocument();
    await waitFor(() => expect(mocks.saveKeepers).toHaveBeenCalledTimes(1));
    expect(mocks.saveKeepers.mock.calls[0][0].data.keepers['h1:dup.jpg']).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Keeper' }));
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).toBeInTheDocument();
  });

  it('starts from supplied keepers', () => {
    renderPage({ 'h1:dup.jpg': 2 });
    expect(screen.getByText('1 groups · 2 files · 1 keepers')).toBeInTheDocument();
    fireEvent.click(screen.getByText('dup.jpg'));
    const libraryRow = screen.getByText('C:/Media/2025/Library').closest('tr') as HTMLElement;
    expect(within(libraryRow).getByRole('button', { name: 'Keeper' })).toBeInTheDocument();
  });

  it('shows an error toast when the save fails', async () => {
    mocks.saveKeepers.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(screen.getByText('dup.jpg'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    await waitFor(() => expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' })));
  });

  it('shows the stale warning and clears it', async () => {
    renderPage({}, 2);
    expect(screen.getByText('2 saved keepers no longer match a group.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved keepers' }));
    await waitFor(() => expect(mocks.clearStaleKeepers).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText('2 saved keepers no longer match a group.')).not.toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 8: Run the page test to verify it fails**

Run: `pnpm exec vitest run app/features/duplicates/DuplicatesPage.test.tsx`
Expected: FAIL — `DuplicatesPage` does not accept the new props and the warning/Select are missing.

- [ ] **Step 9: Replace the page — `app/features/duplicates/DuplicatesPage.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { Alert, Button, Group, Select, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Search } from 'lucide-react';
import { PageHeading } from '../../components/common/PageHeading';
import { DuplicateGroupTable } from './DuplicateGroupTable';
import { DirectoryPicker } from './DirectoryPicker';
import { matchesKeeperFilter, type KeeperFilterValue } from './keeper-filter';
import { useApp } from '../../lib/app-context';
import { clearStaleKeepers, saveKeepers } from '../../../server/routes/duplicates';
import type { DuplicateGroup, KeeperMap } from '../../lib/types';

export function DuplicatesPage({
  groups,
  initialKeepers,
  initialStaleKeepers,
}: {
  groups: DuplicateGroup[];
  initialKeepers: KeeperMap;
  initialStaleKeepers: number;
}) {
  const { setSelectedFile } = useApp();
  const [keeperByGroup, setKeeperByGroup] = useState<KeeperMap>(initialKeepers);
  const [staleKeepers, setStaleKeepers] = useState(initialStaleKeepers);
  const [fileQuery, setFileQuery] = useState('');
  const [extension, setExtension] = useState('All extensions');
  const [appliedDirectories, setAppliedDirectories] = useState<string[]>([]);
  const [countFilter, setCountFilter] = useState('All counts');
  const [sizeFilter, setSizeFilter] = useState('All sizes');
  const [keeperFilter, setKeeperFilter] = useState<KeeperFilterValue>('All groups');

  const directories = useMemo(() => [...new Set(groups.flatMap((g) => g.files.map((e) => e.directory)))], [groups]);
  const extensions = useMemo(() => [...new Set(groups.flatMap((g) => g.files.map((e) => e.extension)))], [groups]);
  const directoryOptions = useMemo(
    () =>
      directories.map((d) => ({
        value: d,
        label: d,
        count: groups.filter((g) => g.files.some((e) => e.directory === d)).length,
      })),
    [directories, groups],
  );

  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          files: g.files.filter(
            (e) =>
              (!fileQuery || `${e.filename} ${e.path}`.toLowerCase().includes(fileQuery.toLowerCase())) &&
              (appliedDirectories.length === 0 || appliedDirectories.includes(e.directory)) &&
              (extension === 'All extensions' || e.extension === extension),
          ),
        }))
        .filter(
          (g) =>
            g.files.length &&
            (countFilter === 'All counts' ||
              (countFilter === '2 files' && g.count === 2) ||
              (countFilter === '3+ files' && g.count >= 3)) &&
            (sizeFilter === 'All sizes' ||
              (sizeFilter === 'Under 10 MB' && g.size < 10000000) ||
              (sizeFilter === '10–25 MB' && g.size >= 10000000 && g.size <= 25000000) ||
              (sizeFilter === 'Over 25 MB' && g.size > 25000000)) &&
            matchesKeeperFilter(g, keeperByGroup, keeperFilter),
        ),
    [fileQuery, extension, appliedDirectories, countFilter, sizeFilter, keeperFilter, keeperByGroup, groups],
  );

  const visibleFiles = useMemo(() => visibleGroups.reduce((n, g) => n + g.files.length, 0), [visibleGroups]);

  const toggleKeeper = (groupKey: string, id: number) => {
    const next = { ...keeperByGroup };
    if (next[groupKey] === id) delete next[groupKey];
    else next[groupKey] = id;
    setKeeperByGroup(next);
    void saveKeepers({ data: { keepers: next } })
      .then(() => setStaleKeepers(0))
      .catch(() => notifications.show({ color: 'red', message: 'Could not save keepers.' }));
  };

  const clearStale = () => {
    void clearStaleKeepers()
      .then(() => setStaleKeepers(0))
      .catch(() => notifications.show({ color: 'red', message: 'Could not clear keepers.' }));
  };

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Duplicates"
        subtitle="Explore duplicates across your indexed media library."
      />
      <div className="duplicates-view">
        <Group className="duplicate-filters" gap="8" wrap="wrap">
          <TextInput
            size="xs"
            placeholder="Filter filename or path"
            value={fileQuery}
            onChange={(event) => setFileQuery(event.currentTarget.value)}
            leftSection={<Search size={14} />}
          />
          <DirectoryPicker applied={appliedDirectories} options={directoryOptions} onApply={setAppliedDirectories} />
          <Select
            size="xs"
            value={countFilter}
            onChange={(v) => setCountFilter(v ?? 'All counts')}
            data={['All counts', '2 files', '3+ files']}
          />
          <Select
            size="xs"
            value={sizeFilter}
            onChange={(v) => setSizeFilter(v ?? 'All sizes')}
            data={['All sizes', 'Under 10 MB', '10–25 MB', 'Over 25 MB']}
          />
          <Select
            size="xs"
            value={extension}
            onChange={(v) => setExtension(v ?? 'All extensions')}
            data={['All extensions', ...extensions]}
          />
          <Select
            size="xs"
            aria-label="Keeper filter"
            value={keeperFilter}
            onChange={(v) => setKeeperFilter((v as KeeperFilterValue) ?? 'All groups')}
            data={['All groups', 'With keeper', 'Without keeper']}
          />
          <Text size="xs" c="dimmed" className="filter-count">
            {visibleGroups.length} groups · {visibleFiles} files · {Object.keys(keeperByGroup).length} keepers
          </Text>
        </Group>
        {staleKeepers > 0 && (
          <Alert color="orange" variant="light" mb="md">
            <Group justify="space-between">
              <Text size="sm">{staleKeepers} saved keepers no longer match a group.</Text>
              <Button size="xs" variant="light" color="orange" onClick={clearStale}>
                Clear saved keepers
              </Button>
            </Group>
          </Alert>
        )}
        <DuplicateGroupTable
          groups={visibleGroups}
          keeperByGroup={keeperByGroup}
          onToggleKeeper={toggleKeeper}
          onSelect={setSelectedFile}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 10: Run the page test to verify it passes**

Run: `pnpm exec vitest run app/features/duplicates/DuplicatesPage.test.tsx app/features/duplicates/keeper-filter.test.ts`
Expected: PASS.

- [ ] **Step 11: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass. Confirm no `better-sqlite3`/`sqlite` in `dist/client`.

```bash
git add server/routes/duplicates.ts app/routes/duplicates.tsx app/features/duplicates/keeper-filter.ts app/features/duplicates/keeper-filter.test.ts app/features/duplicates/DuplicatesPage.tsx app/features/duplicates/DuplicatesPage.test.tsx
git commit -m "feat: persist and filter keepers on the duplicates page"
```

### Task 3: Final verification + Phase 4d docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Run the full check**

Run: `pnpm check`
Expected: `generate-routes`, typecheck, lint, tests, and format all pass.

- [ ] **Step 2: Production build + client safety**

Run: `pnpm build`
Expected: build succeeds. Verify:

Run: `rg -l "better-sqlite3|sqlite" dist/client`
Expected: no output.

- [ ] **Step 3: Manual smoke**

Run `pnpm dev`. On `/duplicates`, keep a file in a group. Reload; the keeper stays. Try all three keeper filter values. Run "Scan library"; the keeper stays. Delete a kept file on disk, rescan, and confirm the inline warning and that "Clear saved keepers" removes it.

- [ ] **Step 4: Record Phase 4d and Phase 4 complete**

In `docs/ROADMAP.md`:
- In the phase overview table, change the Phase 4 status from `[~]` to `[x]`.
- Change the 4d bullet to add the spec link and **Complete.**:
  ```
  - **4d — Keeper persistence:** persist the one-per-group keeper selection.
    Spec: [2026-10-03-phase4d-keeper-design.md](superpowers/specs/2026-10-03-phase4d-keeper-design.md). **Complete.**
  ```
- Add to the "Detailed specs" table:
  ```
  | 4d | [2026-10-03-phase4d-keeper-design.md](superpowers/specs/2026-10-03-phase4d-keeper-design.md) |
  ```

In `AGENTS.md` "Current Plan State", change the Phase 4 bullet to **complete** (4a–4d), add the 4d spec and plan links, and state that Phase 5 is next.

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md AGENTS.md
git commit -m "docs: record Phase 4d and Phase 4 complete"
```

## Self-Review Checklist

1. **Spec coverage:**
   - `KeeperMap` / `DuplicatesData` types → Task 1 Step 1.
   - `app-config` `getKeepers` / `setKeepers` + normalization → Task 1.
   - `queries` `getEntryPathsByIds` / `getKeeperData` (join, stale) → Task 1.
   - Endpoints `getDuplicatesData` / `saveKeepers` / `clearStaleKeepers` → Task 2.
   - Route loader + page props → Task 2.
   - Autosave on toggle, error toast, stale clearing → Task 2.
   - Keeper filter (`All groups` / `With keeper` / `Without keeper`) → Task 2 (helper + page).
   - Inline stale warning + Clear → Task 2.
   - Verification + docs → Task 3.
2. **Placeholder scan:** every step has full code or an exact command; no TBD/TODO.
3. **Type consistency:** `KeeperMap` / `DuplicatesData` defined in Task 1 and used in Task 2; `getKeeperData` returns `{ keepers, stale }` in both tasks; `saveKeepers` takes `{ keepers: KeeperMap }` and returns `{ saved }`; `clearStaleKeepers` returns `{ staleKeepers }`; `matchesKeeperFilter(group, keepers, filter)` and `KeeperFilterValue` named the same in the helper and the page.
4. **Risk notes:** `getKeeperData` returns stale `[]` when the DB is missing (matches the spec); path matching is case- and separator-insensitive; the page test mocks the server route and notifications; the keeper `Select` interaction itself is covered by the pure `matchesKeeperFilter` test.
