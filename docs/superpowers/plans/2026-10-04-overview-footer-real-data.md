# Cleanup A (Real Last-Scan Data + Dead Mock-Data Removal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist one last-scan record and show it in the footer, the Overview `LastRunCard`, and the Activity fallback; remove the static "Not backed up" metric; and delete dead mock data.

**Architecture:** Save one `last_scan` record in the scan-proof `app-config.db` at the end of a successful scan. The root shell loader returns it as `lastScan`. The footer, Overview, and Activity pages read it from the `__root__` loader and format the time with a new `formatRelativeTime` helper. Placeholder thumbnails move to their own file; `mock-data.ts` is deleted and tests use local fixtures.

**Tech Stack:** TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9, `better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-10-04-overview-footer-real-data-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24.
- Prettier 2-space, single quotes, semicolons, print width 120. **No comments in new code.**
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- Engine/`better-sqlite3` is server-only; never in a client bundle. Server fns dynamically `import()` server libs inside the handler.
- `app-config.db` is scan-proof; `last_scan` survives a scan and `pnpm seed`.
- No scan history, no per-phase timings, no backup feature, no Phase 5 thumbnails.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; never merge. All PR text is ASD-STE100.
- `pnpm check` runs `generate-routes` and may change `app/routeTree.gen.ts`. If that file changes and is not part of the task, restore it with `git restore app/routeTree.gen.ts`.

---

### Task 1: Last-scan store, scan record, and the relative-time helper

**Files:**
- Modify: `app/lib/types.ts`
- Modify: `app/lib/format.ts`
- Create: `app/lib/format.test.ts`
- Modify: `server/lib/app-config.ts`
- Modify: `server/lib/app-config.test.ts`
- Modify: `server/lib/scan-configured.ts`
- Modify: `server/lib/scan-configured.test.ts`

**Interfaces:**
- Produces: `LastScan`; `appConfigStore.getLastScan()`, `appConfigStore.recordLastScan(scan)`; the `recordLastScan` scan hook; `formatRelativeTime(iso, now?)`.

- [ ] **Step 1: Add the type — `app/lib/types.ts`**

Append to the end of the file:

```ts
export type LastScan = {
  finishedAt: string;
  directories: number;
  filesScanned: number;
  entriesWritten: number;
  duplicateGroups: number;
  duplicateFiles: number;
  errors: number;
};
```

- [ ] **Step 2: Write the failing store tests — `server/lib/app-config.test.ts`**

Add these tests inside the `describe`, after the `ignores an invalid keepers value` test:

```ts
  it('defaults the last scan to null', () => {
    expect(store.getLastScan()).toBeNull();
  });

  it('round-trips the last scan', () => {
    const scan = {
      finishedAt: '2026-10-04T08:00:00.000Z',
      directories: 2,
      filesScanned: 100,
      entriesWritten: 98,
      duplicateGroups: 5,
      duplicateFiles: 12,
      errors: 2,
    };
    expect(store.recordLastScan(scan)).toEqual(scan);
    expect(store.getLastScan()).toEqual(scan);
  });

  it('reads a malformed last scan as null', () => {
    store.recordLastScan({
      finishedAt: '2026-10-04T08:00:00.000Z',
      directories: 1,
      filesScanned: 1,
      entriesWritten: 1,
      duplicateGroups: 0,
      duplicateFiles: 0,
      errors: 0,
    });
    const raw = new Database(dbPath);
    raw.prepare(`UPDATE app_config SET value = 'nope' WHERE key = 'last_scan'`).run();
    raw.close();
    expect(store.getLastScan()).toBeNull();
  });
```

- [ ] **Step 3: Run the store tests to verify they fail**

Run: `pnpm exec vitest run server/lib/app-config.test.ts`
Expected: FAIL — `store.getLastScan` is not a function.

- [ ] **Step 4: Implement the store methods — `server/lib/app-config.ts`**

Add the key next to the others:

```ts
const LAST_SCAN_KEY = 'last_scan';
```

Add `LastScan` to the type import from `../../app/lib/types`. Extend the store type:

```ts
export type AppConfigStore = {
  get: () => AppConfig;
  saveApplication: (input: ApplicationConfig) => AppConfig;
  saveDirectories: (input: DirectoriesConfig) => AppConfig;
  recordScannedDirectories: (paths: string[], at: string) => AppConfig;
  getKeepers: () => string[];
  setKeepers: (paths: string[]) => string[];
  getLastScan: () => LastScan | null;
  recordLastScan: (scan: LastScan) => LastScan;
};
```

Add a guard next to `isKeeperPaths`:

```ts
function isLastScan(value: unknown): value is LastScan {
  if (!isRecord(value)) return false;
  return (
    typeof value.finishedAt === 'string' &&
    typeof value.directories === 'number' &&
    typeof value.filesScanned === 'number' &&
    typeof value.entriesWritten === 'number' &&
    typeof value.duplicateGroups === 'number' &&
    typeof value.duplicateFiles === 'number' &&
    typeof value.errors === 'number'
  );
}
```

Add the two methods to the object returned by `createAppConfigStore`, after `setKeepers`:

```ts
    getLastScan: () => {
      const db = openStore(dbPath);
      try {
        const row = db.prepare(`SELECT value FROM app_config WHERE key = ?`).get(LAST_SCAN_KEY) as
          | { value: string }
          | undefined;
        if (!row) return null;
        try {
          const parsed = JSON.parse(row.value) as unknown;
          return isLastScan(parsed) ? parsed : null;
        } catch {
          return null;
        }
      } finally {
        db.close();
      }
    },
    recordLastScan: (scan) => {
      const db = openStore(dbPath);
      try {
        writeKey(db, LAST_SCAN_KEY, scan);
        return scan;
      } finally {
        db.close();
      }
    },
```

- [ ] **Step 5: Run the store tests to verify they pass**

Run: `pnpm exec vitest run server/lib/app-config.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing scan-record test — `server/lib/scan-configured.test.ts`**

Replace the whole file with:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ProgressSink } from '../engine/types/progress';
import type { RunConfiguration } from '../engine/types/configuration';
import type { RunSummary } from '../engine/types/run-summary';
import type { AppConfig } from '../../app/lib/types';
import { createConfiguredScan, NoDirectoriesConfiguredError, type RunConfiguredScanDeps } from './scan-configured';

const sink: ProgressSink = { emitProgress() {} };
const signal = new AbortController().signal;
const summary: RunSummary = {
  phases: [],
  filesScanned: 0,
  entriesWritten: 0,
  duplicateGroups: 0,
  duplicateFiles: 0,
  staleRemoved: 0,
  errors: [],
};

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    directories: { indexed: [{ path: 'C:/Photos', enabled: true }], ignored: ['C:/Photos/Cache'] },
    application: {
      extensions: 'jpg, .PNG ,',
      processDirectories: true,
      updateRecords: false,
      resyncDirectories: true,
      verifyFiles: true,
    },
    directoryMeta: {},
    ...overrides,
  };
}

describe('createConfiguredScan', () => {
  it('builds the run configuration from app config and records the scan', async () => {
    const run = vi.fn(async (_config: RunConfiguration, _deps: RunConfiguredScanDeps) => summary);
    const recordScanned = vi.fn();
    const recordLastScan = vi.fn();
    const scan = createConfiguredScan({ getConfig: () => baseConfig(), recordScanned, recordLastScan, run });

    const result = await scan({ progress: sink, signal });

    expect(result).toBe(summary);
    expect(run).toHaveBeenCalledTimes(1);
    const [config] = run.mock.calls[0];
    expect(config.directories).toEqual(['C:/Photos']);
    expect(config.ignore_directories).toEqual(['C:/Photos/Cache']);
    expect(config.extensions).toEqual(['.jpg', '.png']);
    expect(config.update_records).toBe(false);
    expect(config.resync_directories).toBe(true);
    expect(config.resync_check_actual_file).toBe(true);
    expect(recordScanned).toHaveBeenCalledWith(['C:/Photos'], expect.any(String));
    expect(recordLastScan).toHaveBeenCalledWith({
      finishedAt: expect.any(String),
      directories: 1,
      filesScanned: 0,
      entriesWritten: 0,
      duplicateGroups: 0,
      duplicateFiles: 0,
      errors: 0,
    });
  });

  it('refuses when no directories are enabled', async () => {
    const run = vi.fn(async () => summary);
    const recordLastScan = vi.fn();
    const scan = createConfiguredScan({
      getConfig: () => baseConfig({ directories: { indexed: [{ path: 'C:/Photos', enabled: false }], ignored: [] } }),
      recordScanned: vi.fn(),
      recordLastScan,
      run,
    });
    await expect(scan({ progress: sink, signal })).rejects.toBeInstanceOf(NoDirectoriesConfiguredError);
    expect(run).not.toHaveBeenCalled();
    expect(recordLastScan).not.toHaveBeenCalled();
  });

  it('refuses when no extensions are configured', async () => {
    const run = vi.fn(async () => summary);
    const recordLastScan = vi.fn();
    const scan = createConfiguredScan({
      getConfig: () => baseConfig({ application: { ...baseConfig().application, extensions: '  ' } }),
      recordScanned: vi.fn(),
      recordLastScan,
      run,
    });
    await expect(scan({ progress: sink, signal })).rejects.toBeInstanceOf(NoDirectoriesConfiguredError);
    expect(run).not.toHaveBeenCalled();
    expect(recordLastScan).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run the scan test to verify it fails**

Run: `pnpm exec vitest run server/lib/scan-configured.test.ts`
Expected: FAIL — `recordLastScan` is not a property of `ConfiguredScanDeps`.

- [ ] **Step 8: Implement the scan record hook — `server/lib/scan-configured.ts`**

Add `LastScan` to the type import from `../../app/lib/types`. Extend the deps type:

```ts
export type ConfiguredScanDeps = {
  getConfig: () => AppConfig;
  recordScanned: (paths: string[], at: string) => void;
  recordLastScan: (scan: LastScan) => void;
  run: (config: RunConfiguration, deps: RunConfiguredScanDeps) => Promise<RunSummary>;
};
```

Replace the tail of `createConfiguredScan`:

```ts
    const summary = await deps.run(runConfig, { progress, signal });
    const at = new Date().toISOString();
    deps.recordScanned(directories, at);
    deps.recordLastScan({
      finishedAt: at,
      directories: directories.length,
      filesScanned: summary.filesScanned,
      entriesWritten: summary.entriesWritten,
      duplicateGroups: summary.duplicateGroups,
      duplicateFiles: summary.duplicateFiles,
      errors: summary.errors.length,
    });
    return summary;
```

Add the hook to the singleton:

```ts
export const runConfiguredScan = createConfiguredScan({
  getConfig: () => appConfigStore.get(),
  recordScanned: (paths, at) => {
    appConfigStore.recordScannedDirectories(paths, at);
  },
  recordLastScan: (scan) => {
    appConfigStore.recordLastScan(scan);
  },
  run: async (config, { progress, signal }) => {
    const runner = new Runner(config, { reporter: silentReporter, progress, signal });
    try {
      return await runner.run();
    } finally {
      runner.close();
    }
  },
});
```

- [ ] **Step 9: Run the scan test to verify it passes**

Run: `pnpm exec vitest run server/lib/scan-configured.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the failing helper test — create `app/lib/format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './format';

const now = new Date('2026-10-04T12:00:00.000Z');
const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString();

describe('formatRelativeTime', () => {
  it('formats seconds, minutes, hours, and days', () => {
    expect(formatRelativeTime(ago(5_000), now)).toBe('just now');
    expect(formatRelativeTime(ago(60_000), now)).toBe('1 minute ago');
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(60 * 60_000), now)).toBe('1 hour ago');
    expect(formatRelativeTime(ago(3 * 60 * 60_000), now)).toBe('3 hours ago');
    expect(formatRelativeTime(ago(24 * 60 * 60_000), now)).toBe('1 day ago');
    expect(formatRelativeTime(ago(5 * 24 * 60 * 60_000), now)).toBe('5 days ago');
  });

  it('treats a future time as just now', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 60_000).toISOString(), now)).toBe('just now');
  });
});
```

- [ ] **Step 11: Run the helper test to verify it fails**

Run: `pnpm exec vitest run app/lib/format.test.ts`
Expected: FAIL — `formatRelativeTime` is not exported.

- [ ] **Step 12: Implement the helper — `app/lib/format.ts`**

Append:

```ts
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - new Date(iso).getTime());
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
```

- [ ] **Step 13: Run the helper test to verify it passes**

Run: `pnpm exec vitest run app/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 14: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add app/lib/types.ts app/lib/format.ts app/lib/format.test.ts server/lib/app-config.ts server/lib/app-config.test.ts server/lib/scan-configured.ts server/lib/scan-configured.test.ts
git commit -m "feat: persist the last scan summary in app config"
```

### Task 2: Client wiring for the last scan

**Files:**
- Modify: `server/routes/shell.ts`
- Modify: `app/components/common/AppFooter.tsx`
- Modify: `app/components/common/app-shell.test.tsx`
- Modify: `app/features/overview/LastRunCard.tsx`
- Modify: `app/features/overview/OverviewPage.tsx`
- Modify: `app/features/overview/OverviewPage.test.tsx`
- Modify: `app/features/activity/ActivityPage.tsx`
- Modify: `app/features/activity/ActivityPage.test.tsx`

**Interfaces:**
- Consumes: `LastScan` and `formatRelativeTime` (Task 1).
- Produces: the root shell loader with `lastScan`; the real footer, Overview card, and Activity fallback.

- [ ] **Step 1: Add `lastScan` to the shell loader — `server/routes/shell.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';

export const getShellData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getShellData: loadShell } = await import('../lib/queries');
  const { appConfigStore } = await import('../lib/app-config');
  return { ...loadShell(), lastScan: appConfigStore.getLastScan() };
});
```

- [ ] **Step 2: Replace the footer — `app/components/common/AppFooter.tsx`**

```tsx
import { Group } from '@mantine/core';
import { Database, HardDrive } from 'lucide-react';
import { useLoaderData } from '@tanstack/react-router';
import { formatBytes, formatRelativeTime } from '../../lib/format';

export function AppFooter() {
  const { files, size, lastScan } = useLoaderData({ from: '__root__' });
  const scanText = lastScan
    ? `Last scan ${formatRelativeTime(lastScan.finishedAt)}${lastScan.errors > 0 ? ` · ${lastScan.errors} errors` : ''}`
    : 'No scan yet';

  return (
    <footer>
      <Group gap="lg">
        <span>
          <Database size={13} /> {files.toLocaleString('en-US')} files
        </span>
        <span>
          <HardDrive size={13} /> {formatBytes(size)} indexed
        </span>
      </Group>
      <span>{scanText}</span>
    </footer>
  );
}
```

- [ ] **Step 3: Update the shell test — `app/components/common/app-shell.test.tsx`**

Replace the whole file with:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { LastScan } from '../../lib/types';

const shell = vi.hoisted(() => ({
  data: {
    files: 1272,
    size: 391_000_000,
    roots: [] as string[],
    extensions: [] as string[],
    duplicateGroups: 24,
    lastScan: null as LastScan | null,
  },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLoaderData: () => shell.data,
    useRouter: () => ({ navigate: vi.fn() }),
    Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
  };
});

vi.mock('../../lib/scan-store', () => ({
  useScanStatus: () => ({
    status: 'idle',
    phase: null,
    filesProcessed: 0,
    totalFiles: null,
    currentFile: null,
    currentDirectory: null,
    startedAt: null,
    finishedAt: null,
    summary: null,
    error: null,
    log: [],
  }),
  startScan: vi.fn(),
}));

import { MantineProvider } from '@mantine/core';
import { AppFooter } from './AppFooter';
import { Sidebar } from './Sidebar';

const scan: LastScan = {
  finishedAt: new Date().toISOString(),
  directories: 2,
  filesScanned: 1272,
  entriesWritten: 1272,
  duplicateGroups: 24,
  duplicateFiles: 60,
  errors: 4,
};

describe('app shell', () => {
  beforeEach(() => {
    shell.data.lastScan = null;
  });

  it('renders real footer totals', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppFooter />
      </MantineProvider>,
    );
    expect(screen.getByText('1,272 files')).toBeInTheDocument();
    expect(screen.getByText('391.0 MB indexed')).toBeInTheDocument();
  });

  it('shows the real duplicate group badge', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <Sidebar />
      </MantineProvider>,
    );
    expect(screen.getByText('24')).toBeInTheDocument();
  });

  it('shows the last scan and its errors', () => {
    shell.data.lastScan = scan;
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppFooter />
      </MantineProvider>,
    );
    expect(screen.getByText(/Last scan .* · 4 errors/)).toBeInTheDocument();
  });

  it('shows no scan yet when there is no record', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppFooter />
      </MantineProvider>,
    );
    expect(screen.getByText('No scan yet')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the shell test to verify it passes**

Run: `pnpm exec vitest run app/components/common/app-shell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Replace the Overview card — `app/features/overview/LastRunCard.tsx`**

```tsx
import { Card, Group, Text } from '@mantine/core';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import { formatRelativeTime } from '../../lib/format';
import type { LastScan } from '../../lib/types';

const ROWS: [keyof Pick<LastScan, 'directories' | 'filesScanned' | 'entriesWritten' | 'duplicateGroups'>, string][] = [
  ['directories', 'Directories'],
  ['filesScanned', 'Files scanned'],
  ['entriesWritten', 'Entries written'],
  ['duplicateGroups', 'Duplicate groups'],
];

export function LastRunCard({ lastScan }: { lastScan: LastScan | null }) {
  return (
    <Card>
      <Text className="eyebrow">LAST RUN</Text>
      {lastScan ? (
        <>
          <h2>Last scan {formatRelativeTime(lastScan.finishedAt)}</h2>
          <div className="run-list">
            {ROWS.map(([key, label]) => (
              <Group justify="space-between" key={key}>
                <span>
                  <ShieldCheck size={14} />
                  {label}
                </span>
                <Text size="xs" c="dimmed">
                  {lastScan[key].toLocaleString('en-US')}
                </Text>
              </Group>
            ))}
          </div>
          {lastScan.errors > 0 && (
            <Text size="xs" c="orange" mt="lg">
              <CircleAlert size={13} /> {lastScan.errors} errors during the scan
            </Text>
          )}
        </>
      ) : (
        <>
          <h2>No scan yet</h2>
          <Text size="xs" c="dimmed" mt="sm">
            Run a scan to see the last run summary.
          </Text>
        </>
      )}
    </Card>
  );
}
```

- [ ] **Step 6: Update the Overview page — `app/features/overview/OverviewPage.tsx`**

Replace the whole file with:

```tsx
import { Button, Card, Group, Text } from '@mantine/core';
import { ChevronRight } from 'lucide-react';
import { useLoaderData, useRouter } from '@tanstack/react-router';
import { PageHeading } from '../../components/common/PageHeading';
import { MetricCard } from './MetricCard';
import { StorageMap } from './StorageMap';
import { LastRunCard } from './LastRunCard';
import { formatBytes } from '../../lib/format';
import { thumbs } from '../../lib/mock-data';
import type { OverviewData } from '../../lib/types';

export function OverviewPage({ data }: { data: OverviewData }) {
  const router = useRouter();
  const { lastScan } = useLoaderData({ from: '__root__' });

  const metrics: [string, string, string][] = [
    ['Total files', data.totalFiles.toLocaleString('en-US'), ''],
    ['Total size', formatBytes(data.totalSize), ''],
    ['Duplicate groups', String(data.duplicateGroups), ''],
    ['Redundant space', formatBytes(data.redundantSpace), ''],
    ['Unique files', data.uniqueFiles.toLocaleString('en-US'), ''],
  ];

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Overview"
        subtitle="A quiet view of what your library is keeping, duplicating, and missing."
        showExport
      />
      <div className="metric-grid">
        {metrics.map(([label, value, note]) => (
          <MetricCard key={label} label={label} value={value} note={note} />
        ))}
      </div>
      <div className="two-col">
        <StorageMap rows={data.storageMap} />
        <LastRunCard lastScan={lastScan} />
      </div>
      <Card className="compact-list">
        <Group justify="space-between">
          <div>
            <Text className="eyebrow">AT A GLANCE</Text>
            <h2>Largest files</h2>
          </div>
          <Button variant="subtle" size="xs" onClick={() => router.navigate({ to: '/analytics' })}>
            View analytics <ChevronRight size={14} />
          </Button>
        </Group>
        {data.largestFiles.map((entry, i) => (
          <Group justify="space-between" className="file-row" key={entry.id}>
            <Group>
              <img src={thumbs[i % thumbs.length]} alt="" />
              <div>
                <Text size="sm">{entry.filename}</Text>
                <Text size="xs" c="dimmed">
                  {entry.directory}
                </Text>
              </div>
            </Group>
            <Text size="sm">{formatBytes(entry.size)}</Text>
          </Group>
        ))}
      </Card>
    </>
  );
}
```

- [ ] **Step 7: Update the Overview test — `app/features/overview/OverviewPage.test.tsx`**

Replace the whole file with:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LastScan } from '../../lib/types';

const shell = vi.hoisted(() => ({ lastScan: null as LastScan | null }));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useRouter: () => ({ navigate: vi.fn() }),
    useLoaderData: () => ({ lastScan: shell.lastScan }),
  };
});

import { MantineProvider } from '@mantine/core';
import { OverviewPage } from './OverviewPage';
import { entries } from '../../lib/mock-data';
import type { OverviewData } from '../../lib/types';

const data: OverviewData = {
  totalFiles: 1272,
  totalSize: 391_000_000,
  duplicateGroups: 24,
  redundantSpace: 307_200,
  uniqueFiles: 1200,
  storageMap: [
    { path: 'C:/Media/2025', share: 52, size: 200_000_000 },
    { path: 'C:/Media/2024', share: 30, size: 120_000_000 },
    { path: 'D:/Camera Imports', share: 18, size: 71_000_000 },
  ],
  largestFiles: entries.slice(0, 4),
};

const scan: LastScan = {
  finishedAt: new Date().toISOString(),
  directories: 2,
  filesScanned: 1272,
  entriesWritten: 1272,
  duplicateGroups: 24,
  duplicateFiles: 60,
  errors: 3,
};

function renderPage() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <OverviewPage data={data} />
    </MantineProvider>,
  );
}

describe('OverviewPage', () => {
  beforeEach(() => {
    shell.lastScan = null;
  });

  it('renders heading, real metrics, and largest files', () => {
    renderPage();
    expect(
      screen.getByText('A quiet view of what your library is keeping, duplicating, and missing.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total files')).toBeInTheDocument();
    expect(screen.getByText('1,272')).toBeInTheDocument();
    expect(screen.queryByText('Not backed up')).not.toBeInTheDocument();
    expect(screen.getAllByText('C:/Media/2025').length).toBeGreaterThan(0);
    expect(screen.getByText('Largest files')).toBeInTheDocument();
  });

  it('shows the last run summary and errors', () => {
    shell.lastScan = scan;
    renderPage();
    expect(screen.getByText(/Last scan /)).toBeInTheDocument();
    expect(screen.getByText('Directories')).toBeInTheDocument();
    expect(screen.getByText('Files scanned')).toBeInTheDocument();
    expect(screen.getByText(/3 errors during the scan/)).toBeInTheDocument();
  });

  it('shows no scan yet without a record', () => {
    renderPage();
    expect(screen.getByText('No scan yet')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Update the Activity page — `app/features/activity/ActivityPage.tsx`**

Change the imports and the idle fallback:

```tsx
import { Badge, Button, Card, Group, Progress, Text } from '@mantine/core';
import { useLoaderData } from '@tanstack/react-router';
import { PageHeading } from '../../components/common/PageHeading';
import { cancelScan, useScanStatus } from '../../lib/scan-store';
import { formatRelativeTime } from '../../lib/format';
```

Inside the component, after `const scan = useScanStatus();`:

```tsx
  const { lastScan } = useLoaderData({ from: '__root__' });
```

Replace the final fallback in the `detail` expression:

```tsx
      : lastScan
        ? `Last scan ${formatRelativeTime(lastScan.finishedAt)}`
        : 'No scan has run yet';
```

- [ ] **Step 9: Update the Activity test — `app/features/activity/ActivityPage.test.tsx`**

Replace the whole file with:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { LastScan, ScanState } from '../../lib/types';

const running: ScanState = {
  status: 'running',
  phase: 'scan',
  filesProcessed: 5,
  totalFiles: 10,
  currentFile: 'C:/Media/a.jpg',
  currentDirectory: 'C:/Media/2025',
  startedAt: '10:00:00',
  finishedAt: null,
  summary: null,
  error: null,
  log: [{ time: '10:00:00', event: 'Scan started', directory: 'Fixture tree', status: 'Running' }],
};

const idle: ScanState = {
  status: 'idle',
  phase: null,
  filesProcessed: 0,
  totalFiles: null,
  currentFile: null,
  currentDirectory: null,
  startedAt: null,
  finishedAt: null,
  summary: null,
  error: null,
  log: [],
};

const holder = vi.hoisted(() => ({
  scan: undefined as unknown as ScanState,
  lastScan: null as LastScan | null,
}));

vi.mock('../../lib/scan-store', () => ({
  useScanStatus: () => holder.scan,
  cancelScan: vi.fn(),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useLoaderData: () => ({ lastScan: holder.lastScan }) };
});

import { ActivityPage } from './ActivityPage';

const scan: LastScan = {
  finishedAt: new Date().toISOString(),
  directories: 2,
  filesScanned: 1272,
  entriesWritten: 1272,
  duplicateGroups: 24,
  duplicateFiles: 60,
  errors: 0,
};

function renderPage() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <ActivityPage />
    </MantineProvider>,
  );
}

describe('ActivityPage', () => {
  beforeEach(() => {
    holder.scan = running;
    holder.lastScan = null;
  });

  it('renders live progress and a cancel action while running', () => {
    renderPage();
    expect(screen.getAllByText('Running')).toHaveLength(2);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel scan' })).toBeInTheDocument();
    expect(screen.getByText('Scan started')).toBeInTheDocument();
  });

  it('shows the saved last scan when idle', () => {
    holder.scan = idle;
    holder.lastScan = scan;
    renderPage();
    expect(screen.getByText(/Last scan /)).toBeInTheDocument();
  });

  it('shows no scan has run yet when idle and empty', () => {
    holder.scan = idle;
    renderPage();
    expect(screen.getByText('No scan has run yet')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run the client tests to verify they pass**

Run: `pnpm exec vitest run app/components/common/app-shell.test.tsx app/features/overview/OverviewPage.test.tsx app/features/activity/ActivityPage.test.tsx`
Expected: PASS.

- [ ] **Step 11: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass. Confirm no `better-sqlite3`/`sqlite` in `dist/client`.

```bash
git add server/routes/shell.ts app/components/common/AppFooter.tsx app/components/common/app-shell.test.tsx app/features/overview/LastRunCard.tsx app/features/overview/OverviewPage.tsx app/features/overview/OverviewPage.test.tsx app/features/activity/ActivityPage.tsx app/features/activity/ActivityPage.test.tsx
git commit -m "feat: show real last-scan data in the footer, overview, and activity"
```

### Task 3: Mock-data full purge

**Files:**
- Create: `app/lib/placeholder-thumbs.ts`
- Delete: `app/lib/mock-data.ts`
- Delete: `app/lib/mock-data.test.ts`
- Modify: `app/features/overview/OverviewPage.tsx`
- Modify: `app/components/common/FilePreviewDrawer.tsx`
- Modify: `app/features/browse/BrowsePage.test.tsx`
- Modify: `app/features/files/FilesPage.test.tsx`
- Modify: `app/features/overview/OverviewPage.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `thumbs` from `app/lib/placeholder-thumbs.ts`; no `mock-data` module.

- [ ] **Step 1: Create `app/lib/placeholder-thumbs.ts`**

```ts
export const thumbs = [
  'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=200&q=70',
  'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=200&q=70',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&q=70',
  'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=200&q=70',
  'https://images.unsplash.com/photo-1511497584788-876760111969?w=200&q=70',
  'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=200&q=70',
];
```

- [ ] **Step 2: Point the two consumers at the new file**

In `app/features/overview/OverviewPage.tsx`, replace:

```tsx
import { thumbs } from '../../lib/mock-data';
```

with:

```tsx
import { thumbs } from '../../lib/placeholder-thumbs';
```

In `app/components/common/FilePreviewDrawer.tsx`, replace:

```tsx
import { thumbs } from '../../lib/mock-data';
```

with:

```tsx
import { thumbs } from '../../lib/placeholder-thumbs';
```

- [ ] **Step 3: Replace the Browse test fixtures — `app/features/browse/BrowsePage.test.tsx`**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { BrowsePage } from './BrowsePage';
import type { DirectoryNode, Entry } from '../../lib/types';

const files: Entry[] = [1, 2].map((id) => ({
  id,
  size: 6_400,
  directory: 'C:/Media/2025',
  extension: '.jpg',
  filename: `file-${id}.jpg`,
  birthtime: '2025-01-01T00:00:00Z',
  hash: `h${id}`,
  path: `C:/Media/2025/file-${id}.jpg`,
}));

const tree: DirectoryNode[] = [{ label: 'Media (C:)', path: 'C:/Media' }];

describe('BrowsePage', () => {
  it('renders directory filter and results', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <BrowsePage files={files} tree={tree} />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('DIRECTORY FILTER')).toBeInTheDocument();
    expect(screen.getByText('2 files found')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Replace the Files test fixtures — `app/features/files/FilesPage.test.tsx`**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { FilesPage } from './FilesPage';
import type { Entry } from '../../lib/types';

const files: Entry[] = [1, 2].map((id) => ({
  id,
  size: 6_400,
  directory: 'C:/Media/2025',
  extension: '.jpg',
  filename: `file-${id}.jpg`,
  birthtime: '2025-01-01T00:00:00Z',
  hash: `h${id}`,
  path: `C:/Media/2025/file-${id}.jpg`,
}));

describe('FilesPage', () => {
  it('renders rows from the provided files', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <FilesPage files={files} />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.getByText('2 files found')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Replace the Overview test `entries` fixture**

In `app/features/overview/OverviewPage.test.tsx`, replace the import line:

```tsx
import { entries } from '../../lib/mock-data';
```

with a local fixture placed near the other fixtures:

```tsx
const entries: Entry[] = [1, 2, 3, 4].map((id) => ({
  id,
  size: 6_400,
  directory: 'C:/Media/2025',
  extension: '.jpg',
  filename: `file-${id}.jpg`,
  birthtime: '2025-01-01T00:00:00Z',
  hash: `h${id}`,
  path: `C:/Media/2025/file-${id}.jpg`,
}));
```

Add `Entry` to the type import in that file:

```tsx
import type { Entry, LastScan, OverviewData } from '../../lib/types';
```

- [ ] **Step 6: Delete the mock-data module and its test**

Run:

```bash
trash app/lib/mock-data.ts app/lib/mock-data.test.ts
```

- [ ] **Step 7: Verify no references remain**

Run: `rg -n "mock-data" app server`
Expected: no output.

- [ ] **Step 8: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass. Confirm no `better-sqlite3`/`sqlite` in `dist/client`.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add app/lib/placeholder-thumbs.ts app/features/overview/OverviewPage.tsx app/components/common/FilePreviewDrawer.tsx app/features/browse/BrowsePage.test.tsx app/features/files/FilesPage.test.tsx app/features/overview/OverviewPage.test.tsx
git rm app/lib/mock-data.ts app/lib/mock-data.test.ts
git commit -m "refactor: remove dead mock data"
```

### Task 4: Final verification + docs

**Files:**
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

Run `pnpm dev`. Run a scan. Confirm the footer shows `Last scan just now` (or a relative time), the Overview card shows the summary rows, and the Activity page shows the last-scan time when idle. Reload the page and restart the dev server; the values stay. Confirm the Overview has no `Not backed up` card.

- [ ] **Step 4: Record the cleanup in `AGENTS.md`**

Add a bullet under "Current Plan State", after the Phase 4 bullet:

```
- Post-Phase-4 cleanup A — **complete**: one persisted `last_scan` record in `app-config.db`
  drives the footer, the Overview `LastRunCard`, and the Activity fallback; the static
  "Not backed up" metric is removed; dead mock data is deleted. Spec at
  `docs/superpowers/specs/2026-10-04-overview-footer-real-data-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-overview-footer-real-data.md`. Cleanup B (keeper delete
  non-keepers) is next.
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record post-Phase-4 cleanup A"
```

## Self-Review Checklist

1. **Spec coverage:**
   - `LastScan` type → Task 1 Step 1.
   - `app-config` `getLastScan` / `recordLastScan` → Task 1.
   - Scan record hook → Task 1.
   - `formatRelativeTime` → Task 1.
   - Shell loader `lastScan` → Task 2.
   - Footer, Overview card, Activity fallback → Task 2.
   - Remove "Not backed up" → Task 2 Step 6.
   - Mock-data full purge → Task 3.
   - Verification + docs → Task 4.
2. **Placeholder scan:** every step has full code or an exact command; no TBD/TODO.
3. **Type consistency:** `LastScan` defined in Task 1 and used in Tasks 2–3; `getLastScan` /
   `recordLastScan` names match between store, tests, and the scan hook; `formatRelativeTime`
   matches between helper, tests, footer, card, and Activity; `recordLastScan` matches between
   `ConfiguredScanDeps`, the tests, and the singleton.
4. **Risk notes:** the scan test replaces the whole file to add `recordLastScan`; the shell and
   Overview tests use `vi.hoisted` holders to vary `lastScan`; `mock-data.test.ts` is deleted and
   its assertions are not replaced (the module is gone); placeholder thumbnails remain until
   Phase 5.
