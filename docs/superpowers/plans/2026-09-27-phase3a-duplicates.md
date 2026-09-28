# Phase 3a Duplicates (Real Data + In-Memory Keepers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Duplicates page on real SQLite data (duplicate groups with their member files) and make "keepers" real in-memory selections, one per group.

**Architecture:** A new read-only `getDuplicateGroups()` in `server/lib/queries.ts` reads `records WHERE count > 1` and joins member rows from `entries` on `(hash, filename)`, label-mapping paths. It is exposed through a `createServerFn` wrapper (`server/routes/duplicates.ts`) and consumed by the `/duplicates` route loader, which passes props to a now props-driven `DuplicatesPage`. Keepers become local state in `DuplicatesPage`, keyed by group.

**Tech Stack:** TanStack Start (`createServerFn` + route loaders), React 19, Mantine v9, lucide-react, `better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-09-27-phase3a-duplicates-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24.
- Prettier 2-space, single quotes, semicolons, print width 120. No comments in new code.
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- Engine/`better-sqlite3` is server-only and must never enter a client bundle; server fns dynamically `import()` the query module inside the handler.
- Data source is the committed sample DB `server/data/imgsorter.db`, read-only. Do NOT run `pnpm seed`.
- Read queries open their own read-only connection via the existing `openReadonly()` and close it in `finally`.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; the agent never merges.
- Paths are stored in the DB as `@fixtures/...`; display mapping uses the existing `mapPathToDisplay`/`rootLabelOf` from `server/lib/labels.ts`.
- Non-goals (Phase 3a): scanning/progress (3b), keeper persistence/Reveal-Open actions (Phase 4), real Duplicates nav badge (3b), removing `app-context` mock plumbing (3b).

### Task 1: Duplicates on real data (query, server fn, loader, props-driven page)

**Files:**
- Modify: `app/lib/types.ts` (evolve `DuplicateGroup`)
- Modify: `app/lib/mock-data.ts` (remove `groups`)
- Modify: `app/lib/mock-data.test.ts` (drop group assertions)
- Modify: `server/lib/queries.ts` (add `getDuplicateGroups`)
- Modify: `server/lib/queries.test.ts` (add duplicate-group tests)
- Create: `server/routes/duplicates.ts`
- Modify: `app/routes/duplicates.tsx`
- Modify: `app/features/duplicates/DuplicatesPage.tsx`
- Modify: `app/features/duplicates/DuplicateGroupTable.tsx`
- Modify: `app/features/duplicates/DuplicatesPage.test.tsx`

**Interfaces:**
- Consumes: `openReadonly`, `toEntry`, `EntryRow` (already in `server/lib/queries.ts`); `mapPathToDisplay` (`server/lib/labels.ts`); `Entry` (`app/lib/types.ts`).
- Produces:
  - `type DuplicateGroup = { key: string; hash: string; name: string; count: number; size: number; redundantSpace: number; extension: string; directories: string[]; files: Entry[] }`
  - `function getDuplicateGroups(): DuplicateGroup[]` (in `server/lib/queries.ts`)
  - `const getDuplicateGroups` (`createServerFn`) in `server/routes/duplicates.ts`
  - `DuplicatesPage({ groups }: { groups: DuplicateGroup[] })`

- [ ] **Step 1: Evolve the `DuplicateGroup` type**

In `app/lib/types.ts`, replace the existing `DuplicateGroup` type (currently `{ hash; name; count; space: string; files }`) with:

```ts
export type DuplicateGroup = {
  key: string;
  hash: string;
  name: string;
  count: number;
  size: number;
  redundantSpace: number;
  extension: string;
  directories: string[];
  files: Entry[];
};
```

- [ ] **Step 2: Remove the mock `groups` export**

In `app/lib/mock-data.ts`, delete the `groups` constant:

```ts
export const groups: DuplicateGroup[] = [
  { hash: 'sha256-a1f9', name: 'mountain-lake.jpg', count: 5, space: '112.8 MB', files: entries.slice(0, 5) },
  { hash: 'sha256-b82c', name: 'shoreline.jpg', count: 3, space: '44.2 MB', files: entries.slice(5, 8) },
  { hash: 'sha256-c31e', name: 'forest-trail.jpg', count: 2, space: '9.7 MB', files: entries.slice(8, 10) },
];
```

Change its type-only import on line 1 from:

```ts
import type { DirectoryNode, DuplicateGroup, Entry, LogEntry } from './types';
```

to:

```ts
import type { DirectoryNode, Entry, LogEntry } from './types';
```

- [ ] **Step 3: Update `app/lib/mock-data.test.ts`**

Change the import on line 2 to:

```ts
import { directoryTree, entries, initialLogs, thumbs } from './mock-data';
```

Change the type import on line 3 to:

```ts
import type { DirectoryNode, Entry } from './types';
```

Delete the `isDuplicateGroup` helper (lines 22-31) and the test block:

```ts
  it('has 3 valid duplicate groups whose files are entries', () => {
    expect(groups).toHaveLength(3);
    expect(groups.every(isDuplicateGroup)).toBe(true);
    expect(groups[0].files).toEqual(entries.slice(0, 5));
  });
```

- [ ] **Step 4: Write the failing server test**

In `server/lib/queries.test.ts`, add `getDuplicateGroups` to the import:

```ts
import { getAnalyticsData, getDirectoryTree, getDuplicateGroups, getOverviewStats, getShellData, listEntries } from './queries';
```

Add this test inside the existing `describe('queries against the committed sample db', ...)` block:

```ts
  it('returns 24 duplicate groups with their member files', () => {
    const groups = getDuplicateGroups();
    expect(groups).toHaveLength(expected.duplicateGroups);
    expect(groups.filter((g) => g.count === 2)).toHaveLength(8);
    expect(groups.filter((g) => g.count === 3)).toHaveLength(8);
    expect(groups.filter((g) => g.count === 4)).toHaveLength(8);
    for (const group of groups) {
      expect(group.files).toHaveLength(group.count);
      expect(group.files.every((f) => f.hash === group.hash && f.filename === group.name)).toBe(true);
      expect(group.files.every((f) => f.directory.startsWith('C:/') || f.directory.startsWith('D:/'))).toBe(true);
      expect(group.size).toBe(6_400);
      expect(group.redundantSpace).toBe((group.count - 1) * group.size);
    }
    const totalRedundant = groups.reduce((sum, g) => sum + g.redundantSpace, 0);
    expect(totalRedundant).toBe(expected.redundantSpace);
  });
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm exec vitest run server/lib/queries.test.ts`
Expected: FAIL — `getDuplicateGroups` is not exported (`TypeError: getDuplicateGroups is not a function`).

- [ ] **Step 6: Implement `getDuplicateGroups`**

In `server/lib/queries.ts`, add `DuplicateGroup` to the type import:

```ts
import type { AnalyticsData, DirectoryNode, DuplicateGroup, Entry, FilesInput, OverviewData, ShellData } from '../../app/lib/types';
```

Append this function at the end of the file:

```ts
export function getDuplicateGroups(): DuplicateGroup[] {
  const db = openReadonly();
  try {
    const rows = db
      .prepare(`SELECT filename, hash, count, size, extension, directories FROM records WHERE count > 1 ORDER BY filename`)
      .all() as {
      filename: string;
      hash: string;
      count: number;
      size: number;
      extension: string;
      directories: string;
    }[];
    const memberStmt = db.prepare(
      `SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries WHERE hash = ? AND filename = ? ORDER BY path`,
    );
    return rows.map((row) => {
      const files = memberStmt.all(row.hash, row.filename) as EntryRow[];
      return {
        key: `${row.hash}:${row.filename}`,
        hash: row.hash,
        name: row.filename,
        count: row.count,
        size: row.size,
        redundantSpace: (row.count - 1) * row.size,
        extension: row.extension,
        directories: (JSON.parse(row.directories) as string[]).map(mapPathToDisplay),
        files: files.map(toEntry),
      };
    });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 7: Run the server test to verify it passes**

Run: `pnpm exec vitest run server/lib/queries.test.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 8: Create the server function**

Create `server/routes/duplicates.ts`:

```ts
import { createServerFn } from '@tanstack/react-start';

export const getDuplicateGroups = createServerFn({ method: 'GET' }).handler(async () => {
  const { getDuplicateGroups: load } = await import('../lib/queries');
  return load();
});
```

- [ ] **Step 9: Wire the route loader**

Replace `app/routes/duplicates.tsx` with:

```tsx
import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { DuplicatesPage } from '../features/duplicates/DuplicatesPage';
import { useFilterSearchParams } from '../lib/filter-sync';
import { getDuplicateGroups } from '../../server/routes/duplicates';

export const Route = createFileRoute('/duplicates')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === 'string' ? search.query : undefined,
    dir: typeof search.dir === 'string' ? search.dir : undefined,
    ext: typeof search.ext === 'string' ? search.ext : undefined,
  }),
  loader: async () => getDuplicateGroups(),
  component: DuplicatesRoute,
});

function DuplicatesRoute() {
  useFilterSearchParams();
  const groups = useLoaderData({ from: '/duplicates' });
  return <DuplicatesPage groups={groups} />;
}
```

- [ ] **Step 10: Make `DuplicatesPage` props-driven**

Replace the top of `app/features/duplicates/DuplicatesPage.tsx` (imports + signature + the `sizeFilter` lines that read `g.files[0].size`) with the version below; the JSX body is unchanged except the size filter now uses the group's numeric `size`. Full file:

```tsx
import { useMemo, useState } from 'react';
import { Group, Select, Text, TextInput } from '@mantine/core';
import { Search } from 'lucide-react';
import { PageHeading } from '../../components/common/PageHeading';
import { DuplicateGroupTable } from './DuplicateGroupTable';
import { DirectoryPicker } from './DirectoryPicker';
import { useApp } from '../../lib/app-context';
import type { DuplicateGroup } from '../../lib/types';

export function DuplicatesPage({ groups }: { groups: DuplicateGroup[] }) {
  const { keepers, toggleKeeper, setSelectedFile } = useApp();
  const [fileQuery, setFileQuery] = useState('');
  const [extension, setExtension] = useState('All extensions');
  const [appliedDirectories, setAppliedDirectories] = useState<string[]>([]);
  const [countFilter, setCountFilter] = useState('All counts');
  const [sizeFilter, setSizeFilter] = useState('All sizes');

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
              (sizeFilter === 'Over 25 MB' && g.size > 25000000)),
        ),
    [fileQuery, extension, appliedDirectories, countFilter, sizeFilter, groups],
  );

  const visibleFiles = useMemo(() => visibleGroups.reduce((n, g) => n + g.files.length, 0), [visibleGroups]);

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
          <Text size="xs" c="dimmed" className="filter-count">
            {visibleGroups.length} groups · {visibleFiles} files · {keepers.length} keepers
          </Text>
        </Group>
        <DuplicateGroupTable
          groups={visibleGroups}
          keepers={keepers}
          onToggleKeeper={toggleKeeper}
          onSelect={setSelectedFile}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 11: Update `DuplicateGroupTable` for the new shape**

In `app/features/duplicates/DuplicateGroupTable.tsx`:

Replace the `sorted` sort body to use the numeric `redundantSpace` (replaces `parseFloat(a.space)`):

```tsx
  const sorted = useMemo(
    () =>
      [...groups].sort((a, b) => {
        const av = sortKey === 'count' ? a.count : sortKey === 'redundant' ? a.redundantSpace : a.name;
        const bv = sortKey === 'count' ? b.count : sortKey === 'redundant' ? b.redundantSpace : b.name;
        const result =
          typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return direction === 'asc' ? result : -result;
      }),
    [groups, sortKey, direction],
  );
```

Replace the group row `key={g.hash}` and its expand toggle/indicator with `g.key`:

```tsx
          {sorted.map((g) => (
            <Fragment key={g.key}>
              <Table.Tr className="group-row" onClick={() => setExpanded(expanded === g.key ? null : g.key)}>
                <Table.Td>
                  <Group gap={6}>
                    <span className="chevron">
                      {expanded === g.key ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <Badge size="xs" color={g.count > 2 ? 'orange' : 'gray'}>
                      ×{g.count}
                    </Badge>
                    <Text size="xs" fw={600}>
                      {g.name}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td colSpan={5}>
                  <Text size="xs" c="dimmed">
                    {g.hash} · {formatBytes(g.redundantSpace)} redundant
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {g.files.length} visible
                  </Text>
                </Table.Td>
              </Table.Tr>
              {expanded === g.key &&
                g.files.map((e) => (
```

(The member-row block below is unchanged.)

- [ ] **Step 12: Update the Duplicates page test (smoke, props-driven)**

Replace `app/features/duplicates/DuplicatesPage.test.tsx` with:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { DuplicatesPage } from './DuplicatesPage';
import type { DuplicateGroup, Entry } from '../../lib/types';

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

describe('DuplicatesPage', () => {
  it('renders the provided groups with a zero-keeper summary', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <DuplicatesPage groups={groups} />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).toBeInTheDocument();
    expect(screen.getByText('dup.jpg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 13: Run the full check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass (18 test files; server project now includes the new duplicate-group test).

- [ ] **Step 14: Commit**

```bash
git add app/lib/types.ts app/lib/mock-data.ts app/lib/mock-data.test.ts server/lib/queries.ts server/lib/queries.test.ts server/routes/duplicates.ts app/routes/duplicates.tsx app/features/duplicates
git commit -m "feat: wire Duplicates to real sqlite group data"
```

### Task 2: Keeper selection — one per group, in-memory

**Files:**
- Modify: `app/features/duplicates/DuplicatesPage.tsx`
- Modify: `app/features/duplicates/DuplicateGroupTable.tsx`
- Modify: `app/features/duplicates/DuplicatesPage.test.tsx`

**Interfaces:**
- Consumes: `DuplicateGroup` (Task 1); `DuplicatesPage` (Task 1).
- Produces:
  - `DuplicateGroupTable` props: `{ groups: DuplicateGroup[]; keeperByGroup: Record<string, number>; onToggleKeeper: (groupKey: string, id: number) => void; onSelect: (e: Entry) => void }`
  - `DuplicatesPage` holds keeper state locally; no longer reads `keepers`/`toggleKeeper` from `app-context`.

- [ ] **Step 1: Write the failing keeper test**

Replace `app/features/duplicates/DuplicatesPage.test.tsx` with:

```tsx
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { DuplicatesPage } from './DuplicatesPage';
import type { DuplicateGroup, Entry } from '../../lib/types';

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

function renderPage() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <AppProvider>
        <DuplicatesPage groups={groups} />
      </AppProvider>
    </MantineProvider>,
  );
}

describe('DuplicatesPage keepers', () => {
  it('allows at most one keeper per group', () => {
    renderPage();
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).toBeInTheDocument();

    fireEvent.click(screen.getByText('dup.jpg'));
    expect(screen.getAllByRole('button', { name: 'Keep' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    expect(screen.getByText('1 groups · 2 files · 1 keepers')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    expect(screen.getByText('1 groups · 2 files · 1 keepers')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keeper' }));
    expect(screen.getByText('1 groups · 2 files · 0 keepers')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run app/features/duplicates/DuplicatesPage.test.tsx`
Expected: FAIL — the page still reads `keepers`/`toggleKeeper` from `app-context`, so toggling does not update the summary (the `1 keepers` assertion fails).

- [ ] **Step 3: Add local keeper state + handoff in `DuplicatesPage`**

In `app/features/duplicates/DuplicatesPage.tsx`:

Replace the `useApp()` line:

```tsx
  const { keepers, toggleKeeper, setSelectedFile } = useApp();
```

with:

```tsx
  const { setSelectedFile } = useApp();
  const [keeperByGroup, setKeeperByGroup] = useState<Record<string, number>>({});
```

Add this handler immediately after the `visibleFiles` memo (before `return`):

```tsx
  const toggleKeeper = (groupKey: string, id: number) =>
    setKeeperByGroup((current) => {
      if (current[groupKey] === id) {
        const next = { ...current };
        delete next[groupKey];
        return next;
      }
      return { ...current, [groupKey]: id };
    });
```

Replace the summary count expression `{keepers.length} keepers` with:

```tsx
            {Object.keys(keeperByGroup).length} keepers
```

Replace the `<DuplicateGroupTable ... />` props:

```tsx
        <DuplicateGroupTable
          groups={visibleGroups}
          keeperByGroup={keeperByGroup}
          onToggleKeeper={toggleKeeper}
          onSelect={setSelectedFile}
        />
```

- [ ] **Step 4: Update `DuplicateGroupTable` to per-group keepers**

In `app/features/duplicates/DuplicateGroupTable.tsx`, replace the props type:

```tsx
export type DuplicateGroupTableProps = {
  groups: DuplicateGroup[];
  keeperByGroup: Record<string, number>;
  onToggleKeeper: (groupKey: string, id: number) => void;
  onSelect: (e: Entry) => void;
};
```

Replace the function signature:

```tsx
export function DuplicateGroupTable({ groups, keeperByGroup, onToggleKeeper, onSelect }: DuplicateGroupTableProps) {
```

Replace the member row class and the `KeepToggle` usage:

```tsx
                  <Table.Tr key={e.id} className={keeperByGroup[g.key] === e.id ? 'keeper-row' : ''}>
```

```tsx
                        <KeepToggle
                          keeper={keeperByGroup[g.key] === e.id}
                          onToggle={() => onToggleKeeper(g.key, e.id)}
                        />
```

- [ ] **Step 5: Run the keeper test to verify it passes**

Run: `pnpm exec vitest run app/features/duplicates/DuplicatesPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass (18 test files / 49 tests).

- [ ] **Step 7: Production build + SSR smoke**

Run: `pnpm build`
Expected: client + SSR build succeed; `grep -rl "sqlite" dist/client` returns nothing.

Then (manual/agent): `pnpm dev`, curl `http://localhost:3000/duplicates` (HTTP 200) and confirm the page renders real group rows (e.g. `duplicate-17.jpg`, `×4`); kill the dev server and confirm nothing listens on :3000.

- [ ] **Step 8: Commit**

```bash
git add app/features/duplicates
git commit -m "feat: one-per-group in-memory keepers on Duplicates"
```

## Self-Review Checklist

1. **Spec coverage:**
   - Data layer (`getDuplicateGroups`, server fn, loader) → Task 1.
   - Types evolved + mock `groups` removed + `mock-data.test` fixed → Task 1.
   - Props-driven page + numeric redundant space + real filters → Task 1.
   - Keepers one-per-group, in-memory, local → Task 2.
   - Tests (server parity + client keeper interaction) → Tasks 1 & 2.
   - Non-goals (scan, badge, app-context cleanup, persistence) → not in this plan, tracked for 3b/Phase 4.
2. **Placeholder scan:** every step has full code/commands; no TBD/TODO.
3. **Type consistency:** `DuplicateGroup` shape defined once in Task 1 and used by the query, server fn, loader, page, table, and tests; `getDuplicateGroups` name is consistent across `queries.ts`, `server/routes/duplicates.ts`, and the loader; `keeperByGroup`/`onToggleKeeper(groupKey, id)` names match between `DuplicatesPage` and `DuplicateGroupTable`.
