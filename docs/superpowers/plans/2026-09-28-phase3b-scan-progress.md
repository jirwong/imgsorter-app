# Phase 3b (Real Scan + Progress Streaming) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the vendored engine from the UI ("Scan library") with live progress on Activity, allow cancelling, make the Duplicates nav badge real, and remove the dead mock plumbing in `app-context`.

**Architecture:** Extract the fixture-generation + engine-run logic out of `scripts/seed.ts` into `server/lib/fixtures.ts` and `server/lib/scan-runner.ts`. A server-only `server/lib/scan.ts` wraps that in an in-memory state machine (single run, `AbortController`) exposed through `startScan`/`getScanStatus`/`cancelScan` server fns. The client keeps a module-level scan store polled via `useSyncExternalStore`; Activity and the Sidebar render it, a `ScanRevalidator` invalidates the router on completion, and `app-context` loses its dead mock state.

**Tech Stack:** TanStack Start (`createServerFn`), React 19 (`useSyncExternalStore`), Mantine v9, `better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-09-28-phase3b-scan-progress-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24.
- Prettier 2-space, single quotes, semicolons, print width 120. No comments in new code.
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- Engine/`better-sqlite3` is server-only; never in a client bundle. Server fns dynamically `import()` server libs inside the handler.
- The scan is **fixture-driven** and writes the app DB `server/data/imgsorter.db`; it must reuse the deterministic fixture plan (1272 files / 24 groups).
- Running the scan (or `pnpm seed`) generates ~4.6GB of temp fixtures and rewrites the committed DB bytes; run it manually only, and `git restore server/data/imgsorter.db` afterwards.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; never merge.
- Non-goals: persisted scan config/directory management (Phase 4), scanning real user dirs, keeper persistence/actions (Phase 4).

### Task 1: Extract scan libs + ShellData.duplicateGroups

**Files:**
- Create: `server/lib/fixtures.ts`
- Create: `server/lib/scan-runner.ts`
- Modify: `scripts/seed.ts`
- Modify: `app/lib/types.ts` (`ShellData.duplicateGroups`)
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`

**Interfaces:**
- Produces:
  - `writeFixtureTree(): void`, `removeFixtureTree(): void` (`server/lib/fixtures.ts`)
  - `runFixtureScan({ progress, signal }): Promise<RunSummary>` (`server/lib/scan-runner.ts`)
  - `ShellData = { files; size; roots; extensions; duplicateGroups }`

- [ ] **Step 1: Create `server/lib/fixtures.ts`**

```ts
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFixtureFiles, fixtureBytes } from './fixture-plan';
import { fixturesDir, virtualToReal } from './db-path';

function fixtureContent(name: string, size: number): Buffer {
  const seed = fixtureBytes(name);
  const content = Buffer.alloc(size);
  for (let offset = 0; offset < size; offset += seed.length) {
    seed.copy(content, offset);
  }
  return content;
}

export function writeFixtureTree(): void {
  rmSync(fixturesDir(), { recursive: true, force: true });
  for (const file of buildFixtureFiles()) {
    const dir = virtualToReal(file.root);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file.name), fixtureContent(file.name, file.size));
  }
}

export function removeFixtureTree(): void {
  rmSync(fixturesDir(), { recursive: true, force: true });
}
```

- [ ] **Step 2: Create `server/lib/scan-runner.ts`**

```ts
import Database from 'better-sqlite3';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { Runner } from '../engine/runner';
import type { Reporter } from '../engine/output/reporter';
import type { ProgressSink } from '../engine/types/progress';
import type { RunConfiguration } from '../engine/types/configuration';
import type { RunSummary } from '../engine/types/run-summary';
import { DbService } from '../engine/services/db-service';
import { FIXTURE_ROOTS } from './fixture-plan';
import { fixturesDir, sampleDbPath, virtualToReal } from './db-path';
import { removeFixtureTree, writeFixtureTree } from './fixtures';

const silentReporter: Reporter = { debug() {}, info() {}, warn() {}, error() {}, printSummary() {} };

export type RunFixtureScanDeps = { progress: ProgressSink; signal: AbortSignal };

export async function runFixtureScan({ progress, signal }: RunFixtureScanDeps): Promise<RunSummary> {
  writeFixtureTree();
  rmSync(sampleDbPath(), { force: true });
  rmSync(`${sampleDbPath()}-wal`, { force: true });
  rmSync(`${sampleDbPath()}-shm`, { force: true });
  mkdirSync(dirname(sampleDbPath()), { recursive: true });

  const config: RunConfiguration = {
    dbName: sampleDbPath(),
    extensions: ['.jpg', '.png', '.gif'],
    directories: [...FIXTURE_ROOTS].map(virtualToReal),
    ignore_directories: [],
    update_records: true,
    process_directories: true,
    resync_directories: false,
    resync_check_actual_file: false,
  };

  const runner = new Runner(config, { reporter: silentReporter, progress, signal });
  let summary: RunSummary | null = null;
  let failure: unknown = null;
  try {
    summary = await runner.run();
  } catch (error) {
    failure = error;
  } finally {
    runner.close();
  }

  const db = new Database(sampleDbPath());
  db.prepare(
    `UPDATE entries SET
       directory = replace(replace(directory, @root, '@fixtures'), char(92), '/'),
       path = replace(replace(path, @root, '@fixtures'), char(92), '/'),
       birthtime = '2025-0' || ((id % 8) + 1) || '-1' || (id % 9) || 'T10:24:00Z'`,
  ).run({ root: fixturesDir() });
  db.close();

  const service = new DbService(sampleDbPath());
  service.updateFileRecords();
  service.close();

  removeFixtureTree();

  if (failure) {
    throw failure;
  }
  return summary as RunSummary;
}
```

- [ ] **Step 3: Refactor `scripts/seed.ts`**

Replace the whole file with:

```ts
import { expectedFixtureStats } from '../server/lib/fixture-plan';
import { runFixtureScan } from '../server/lib/scan-runner';

async function main(): Promise<void> {
  const summary = await runFixtureScan({ progress: silentProgress(), signal: new AbortController().signal });

  const expected = expectedFixtureStats();
  console.log(
    `Seed complete: ${expected.totalFiles} files, ${expected.totalSize} bytes, ${expected.duplicateGroups} duplicate groups`,
  );
  console.log(`Scan summary: ${summary.filesScanned} scanned, ${summary.entriesWritten} written`);
}

function silentProgress() {
  return { emitProgress() {} };
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Add `duplicateGroups` to `ShellData` and `getShellData`**

In `app/lib/types.ts`, change the `ShellData` type to:

```ts
export type ShellData = { files: number; size: number; roots: string[]; extensions: string[]; duplicateGroups: number };
```

In `server/lib/queries.ts` `getShellData`, add a duplicate-groups count and include it in the return. Replace the function body's final lines:

```ts
    const roots = [...new Set(dirs.map((row) => rootLabelOf(mapPathToDisplay(row.directory))))].sort();
    const groups = db.prepare(`SELECT COUNT(*) AS n FROM records WHERE count > 1`).get() as { n: number };
    return {
      files: totals.files,
      size: totals.size,
      roots,
      extensions: exts.map((row) => row.extension),
      duplicateGroups: groups.n,
    };
```

- [ ] **Step 5: Update `server/lib/queries.test.ts`**

In the `'returns shell totals and options'` test, add:

```ts
    expect(shell.duplicateGroups).toBe(expected.duplicateGroups);
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass (18 test files / 49 tests).

Run: `pnpm seed`
Expected: `Seed complete: 1272 files, 4636080000 bytes, 24 duplicate groups` / `Scan summary: 1272 scanned, 1272 written`.
Then restore the committed DB: `git restore server/data/imgsorter.db`.

- [ ] **Step 7: Commit**

```bash
git add server/lib/fixtures.ts server/lib/scan-runner.ts scripts/seed.ts app/lib/types.ts server/lib/queries.ts server/lib/queries.test.ts
git commit -m "refactor: extract fixture/scan libs and add shell duplicate group count"
```

### Task 2: Scan service + server functions

**Files:**
- Modify: `app/lib/types.ts` (`ScanRunStatus`, `ScanState`)
- Create: `server/lib/scan.ts`
- Create: `server/routes/scan.ts`
- Create: `server/lib/scan.test.ts`

**Interfaces:**
- Consumes: `runFixtureScan` (Task 1); `ProgressEmitter`, `RunAbortedError`, `RunSummary`, `ProgressEvent`, `LogEntry`.
- Produces:
  - `type ScanRunStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error'`
  - `type ScanState = { status; phase; filesProcessed; totalFiles; currentFile; currentDirectory; startedAt; finishedAt; summary; error; log }`
  - `type RunScan = (deps: { progress: ProgressEmitter; signal: AbortSignal }) => Promise<RunSummary>`
  - `createScanService(runScan: RunScan): { start(): ScanState; status(): ScanState; cancel(): void }`
  - `scanService` (app singleton) and server fns `startScan` (POST), `getScanStatus` (GET), `cancelScan` (POST)

- [ ] **Step 1: Add scan types to `app/lib/types.ts`**

Append:

```ts
export type ScanRunStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';

export type ScanState = {
  status: ScanRunStatus;
  phase: 'scan' | 'resync' | 'records' | null;
  filesProcessed: number;
  totalFiles: number | null;
  currentFile: string | null;
  currentDirectory: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  summary: {
    filesScanned: number;
    entriesWritten: number;
    duplicateGroups: number;
    duplicateFiles: number;
    errors: number;
  } | null;
  error: string | null;
  log: LogEntry[];
};
```

- [ ] **Step 2: Write the failing service test**

Create `server/lib/scan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RunAbortedError } from '../engine/phases/abort';
import { createScanService, type RunScan } from './scan';

describe('createScanService', () => {
  it('runs a scan, tracks progress, and completes with a summary', async () => {
    let emit: ((event: unknown) => void) | null = null;
    const runScan: RunScan = async ({ progress }) => {
      emit = (event) => progress.emitProgress(event as never);
      return {
        phases: [],
        filesScanned: 3,
        entriesWritten: 3,
        duplicateGroups: 1,
        duplicateFiles: 1,
        staleRemoved: 0,
        errors: [],
      };
    };
    const service = createScanService(runScan);
    expect(service.status().status).toBe('idle');

    service.start();
    expect(service.status().status).toBe('running');

    emit?.({
      type: 'file',
      phase: 'scan',
      directory: 'C:/Media',
      currentFile: 'C:/Media/a.jpg',
      filesProcessed: 2,
      totalFiles: 3,
    });
    expect(service.status().filesProcessed).toBe(2);

    await Promise.resolve();
    await Promise.resolve();
    const done = service.status();
    expect(done.status).toBe('completed');
    expect(done.summary?.duplicateGroups).toBe(1);
  });

  it('ignores a second start while running', () => {
    const runScan: RunScan = () => new Promise(() => {});
    const service = createScanService(runScan);
    service.start();
    service.start();
    expect(service.status().status).toBe('running');
  });

  it('cancels a running scan', async () => {
    const runScan: RunScan = ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new RunAbortedError()));
      });
    const service = createScanService(runScan);
    service.start();
    service.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(service.status().status).toBe('cancelled');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run server/lib/scan.test.ts`
Expected: FAIL — `./scan` has no exported member `createScanService`.

- [ ] **Step 4: Implement `server/lib/scan.ts`**

```ts
import '@tanstack/react-start/server-only';
import { RunAbortedError } from '../engine/phases/abort';
import { ProgressEmitter } from '../engine/output/progress';
import type { ProgressEvent } from '../engine/types/progress';
import type { RunSummary } from '../engine/types/run-summary';
import type { LogEntry, ScanState } from '../../app/lib/types';
import { runFixtureScan } from './scan-runner';

const MAX_LOG = 50;

export type RunScan = (deps: { progress: ProgressEmitter; signal: AbortSignal }) => Promise<RunSummary>;

export type ScanService = {
  start: () => ScanState;
  status: () => ScanState;
  cancel: () => void;
};

function now(): string {
  return new Date().toTimeString().slice(0, 8);
}

function initialState(): ScanState {
  return {
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
}

export function createScanService(runScan: RunScan): ScanService {
  let state = initialState();
  let controller: AbortController | null = null;

  const pushLog = (entry: LogEntry): void => {
    state = { ...state, log: [entry, ...state.log].slice(0, MAX_LOG) };
  };

  const onProgress = (event: ProgressEvent): void => {
    switch (event.type) {
      case 'phaseStart':
        state = { ...state, phase: event.phase };
        pushLog({ time: now(), event: `Phase: ${event.phase}`, directory: '', status: 'Running' });
        break;
      case 'directoryStart':
        state = { ...state, currentDirectory: event.directory };
        pushLog({ time: now(), event: 'Scanning directory', directory: event.directory, status: 'Running' });
        break;
      case 'file':
        state = {
          ...state,
          phase: event.phase,
          currentDirectory: event.directory,
          currentFile: event.currentFile,
          filesProcessed: event.filesProcessed,
          totalFiles: event.totalFiles,
        };
        break;
      case 'counts':
        state = { ...state, filesProcessed: event.filesProcessed, totalFiles: event.totalFiles };
        break;
      default:
        break;
    }
  };

  return {
    status: () => state,
    cancel: () => {
      controller?.abort();
    },
    start: () => {
      if (state.status === 'running') return state;

      controller = new AbortController();
      const progress = new ProgressEmitter();
      progress.on(onProgress);
      state = { ...initialState(), status: 'running', startedAt: now() };
      pushLog({ time: now(), event: 'Scan started', directory: 'Fixture tree', status: 'Running' });

      runScan({ progress, signal: controller.signal })
        .then((summary) => {
          state = {
            ...state,
            status: 'completed',
            phase: null,
            currentFile: null,
            currentDirectory: null,
            finishedAt: now(),
            filesProcessed: summary.filesScanned,
            totalFiles: summary.filesScanned,
            summary: {
              filesScanned: summary.filesScanned,
              entriesWritten: summary.entriesWritten,
              duplicateGroups: summary.duplicateGroups,
              duplicateFiles: summary.duplicateFiles,
              errors: summary.errors.length,
            },
          };
          pushLog({ time: now(), event: 'Scan completed', directory: '', status: 'Complete' });
        })
        .catch((error: unknown) => {
          if (error instanceof RunAbortedError) {
            state = { ...state, status: 'cancelled', currentFile: null, currentDirectory: null, finishedAt: now() };
            pushLog({ time: now(), event: 'Scan cancelled', directory: '', status: 'Warning' });
            return;
          }
          state = {
            ...state,
            status: 'error',
            finishedAt: now(),
            error: error instanceof Error ? error.message : String(error),
          };
          pushLog({ time: now(), event: 'Scan failed', directory: '', status: 'Warning' });
        });

      return state;
    },
  };
}

export const scanService = createScanService(({ progress, signal }) => runFixtureScan({ progress, signal }));
```

- [ ] **Step 5: Run the service test to verify it passes**

Run: `pnpm exec vitest run server/lib/scan.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Create the server functions**

Create `server/routes/scan.ts`:

```ts
import { createServerFn } from '@tanstack/react-start';

export const startScan = createServerFn({ method: 'POST' }).handler(async () => {
  const { scanService } = await import('../lib/scan');
  return scanService.start();
});

export const getScanStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const { scanService } = await import('../lib/scan');
  return scanService.status();
});

export const cancelScan = createServerFn({ method: 'POST' }).handler(async () => {
  const { scanService } = await import('../lib/scan');
  scanService.cancel();
  return scanService.status();
});
```

- [ ] **Step 7: Run the full check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass (19 test files now).

- [ ] **Step 8: Commit**

```bash
git add app/lib/types.ts server/lib/scan.ts server/lib/scan.test.ts server/routes/scan.ts
git commit -m "feat: add server scan service and server functions"
```

### Task 3: Client scan store + revalidation

**Files:**
- Create: `app/lib/scan-store.ts`
- Create: `app/lib/scan-store.test.ts`
- Create: `app/components/common/ScanRevalidator.tsx`
- Modify: `app/routes/__root.tsx`

**Interfaces:**
- Consumes: `getScanStatus`, `startScan`, `cancelScan` server fns (Task 2); `ScanState`.
- Produces: `useScanStatus(): ScanState`, `startScan(): Promise<void>`, `cancelScan(): Promise<void>`; `ScanRevalidator`.

- [ ] **Step 1: Write the failing store test**

Create `app/lib/scan-store.test.ts`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ScanState } from './types';

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

const getScanStatus = vi.fn(async () => idle);
vi.mock('../../server/routes/scan', () => ({
  getScanStatus,
  startScan: vi.fn(async () => idle),
  cancelScan: vi.fn(async () => idle),
}));

describe('useScanStatus', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls the server status while mounted', async () => {
    const running: ScanState = { ...idle, status: 'running', filesProcessed: 1, totalFiles: 5 };
    getScanStatus.mockResolvedValueOnce(idle).mockResolvedValue(running);
    const { useScanStatus } = await import('./scan-store');

    const { result, unmount } = renderHook(() => useScanStatus());
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.status).toBe('running');
    expect(result.current.filesProcessed).toBe(1);

    unmount();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run app/lib/scan-store.test.ts`
Expected: FAIL — `./scan-store` not found.

- [ ] **Step 3: Implement `app/lib/scan-store.ts`**

```ts
import { useSyncExternalStore } from 'react';
import { cancelScan as cancelScanRequest, getScanStatus, startScan as startScanRequest } from '../../server/routes/scan';
import type { ScanState } from './types';

const POLL_MS = 400;

const idleState: ScanState = {
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

let state: ScanState = idleState;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let refCount = 0;

function emit(next: ScanState): void {
  state = next;
  for (const listener of listeners) listener();
}

async function poll(): Promise<void> {
  try {
    emit(await getScanStatus());
  } catch {
    // transient poll errors are ignored; the next tick retries
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  refCount += 1;
  if (refCount === 1) {
    void poll();
    timer = setInterval(() => void poll(), POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    refCount -= 1;
    if (refCount === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): ScanState {
  return state;
}

export function useScanStatus(): ScanState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function startScan(): Promise<void> {
  emit(await startScanRequest());
}

export async function cancelScan(): Promise<void> {
  emit(await cancelScanRequest());
}
```

- [ ] **Step 4: Run the store test to verify it passes**

Run: `pnpm exec vitest run app/lib/scan-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `ScanRevalidator` and mount it**

Create `app/components/common/ScanRevalidator.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useScanStatus } from '../../lib/scan-store';

export function ScanRevalidator() {
  const router = useRouter();
  const status = useScanStatus().status;
  const previous = useRef(status);

  useEffect(() => {
    const settled = status === 'completed' || status === 'cancelled' || status === 'error';
    if (previous.current === 'running' && settled) {
      void router.invalidate();
    }
    previous.current = status;
  }, [status, router]);

  return null;
}
```

In `app/routes/__root.tsx`, add the import and mount it inside `AppProvider` next to `FilePreviewDrawer`:

```tsx
import { ScanRevalidator } from '../components/common/ScanRevalidator';
```

```tsx
            <FilePreviewDrawer />
            <ScanRevalidator />
```

- [ ] **Step 6: Run the full check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/lib/scan-store.ts app/lib/scan-store.test.ts app/components/common/ScanRevalidator.tsx app/routes/__root.tsx
git commit -m "feat: add client scan store and router revalidation"
```

### Task 4: Activity page — real progress + Cancel

**Files:**
- Modify: `app/features/activity/ActivityPage.tsx`
- Modify: `app/features/activity/ActivityPage.test.tsx`

**Interfaces:**
- Consumes: `useScanStatus`, `cancelScan` (Task 3); `ScanState`.
- Produces: `ActivityPage()` reading the scan store (no `app-context`).

- [ ] **Step 1: Write the failing test**

Replace `app/features/activity/ActivityPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ScanState } from '../../lib/types';

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

vi.mock('../../lib/scan-store', () => ({
  useScanStatus: () => running,
  cancelScan: vi.fn(),
}));

import { ActivityPage } from './ActivityPage';

describe('ActivityPage', () => {
  it('renders live progress and a cancel action while running', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <ActivityPage />
      </MantineProvider>,
    );
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel scan' })).toBeInTheDocument();
    expect(screen.getByText('Scan started')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run app/features/activity/ActivityPage.test.tsx`
Expected: FAIL — the current page renders mock text, not `50%` / `Cancel scan`.

- [ ] **Step 3: Replace `app/features/activity/ActivityPage.tsx`**

```tsx
import { Badge, Button, Card, Group, Progress, Text } from '@mantine/core';
import { PageHeading } from '../../components/common/PageHeading';
import { cancelScan, useScanStatus } from '../../lib/scan-store';

const STATUS_LABEL: Record<string, string> = {
  idle: 'No active scan',
  running: 'Running',
  completed: 'Complete',
  cancelled: 'Cancelled',
  error: 'Failed',
};

export function ActivityPage() {
  const scan = useScanStatus();

  const running = scan.status === 'running';
  const percent =
    scan.summary !== null
      ? 100
      : running && scan.totalFiles
        ? Math.round((scan.filesProcessed / scan.totalFiles) * 100)
        : 0;
  const badgeColor =
    scan.status === 'running' ? 'cyan' : scan.status === 'cancelled' || scan.status === 'error' ? 'orange' : 'gray';

  const title = running ? `Indexing · ${scan.phase ?? 'scan'}` : STATUS_LABEL[scan.status] ?? 'Scan';
  const detail = running
    ? `${scan.filesProcessed.toLocaleString('en-US')}${scan.totalFiles ? ` of ${scan.totalFiles.toLocaleString('en-US')}` : ''} files · ${scan.currentFile ?? scan.currentDirectory ?? 'starting…'}`
    : scan.summary
      ? `${scan.summary.filesScanned.toLocaleString('en-US')} files scanned · ${scan.summary.entriesWritten.toLocaleString('en-US')} written · ${scan.summary.duplicateGroups} duplicate groups · ${scan.summary.errors} errors`
      : scan.error
        ? scan.error
        : 'Last run completed today';

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Activity"
        subtitle="Explore activity across your indexed media library."
      />
      <div className="activity-page">
        <div className="activity-heading">
          <div>
            <Text className="eyebrow">ACTIVITY</Text>
            <h2>Scan activity</h2>
            <Text c="dimmed" size="sm">
              Monitor current and previous indexing runs.
            </Text>
          </div>
          <Group gap="sm">
            {running && (
              <Button size="xs" variant="light" color="orange" onClick={() => void cancelScan()}>
                Cancel scan
              </Button>
            )}
            <Badge color={badgeColor}>{STATUS_LABEL[scan.status] ?? 'Scan'}</Badge>
          </Group>
        </div>
        <Card className="scan-progress-card">
          <Group justify="space-between">
            <div>
              <Text className="eyebrow">CURRENT SCAN</Text>
              <h3>{title}</h3>
            </div>
            <Text size="sm" c={running ? 'cyan' : 'dimmed'}>
              {percent}%
            </Text>
          </Group>
          <Progress value={percent} color="cyan" mt="md" />
          <Text size="xs" c="dimmed" mt="sm">
            {detail}
          </Text>
        </Card>
        <Card>
          <Text className="eyebrow">EVENT LOG</Text>
          <h3>Recent events</h3>
          <div className="activity-log">
            {scan.log.map((log, index) => (
              <div className="activity-log-row" key={`${log.time}-${index}`}>
                <Text size="xs" c="dimmed">
                  {log.time}
                </Text>
                <div>
                  <Text size="sm">{log.event}</Text>
                  <Text size="xs" c="dimmed">
                    {log.directory}
                  </Text>
                </div>
                <Badge
                  variant="light"
                  color={log.status === 'Warning' ? 'orange' : log.status === 'Running' ? 'cyan' : 'gray'}
                >
                  {log.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run app/features/activity/ActivityPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/features/activity
git commit -m "feat: Activity page renders live scan progress with cancel"
```

### Task 5: Sidebar real start/scan-state/badge + app-context cleanup

**Files:**
- Modify: `app/components/common/Sidebar.tsx`
- Modify: `app/lib/app-context.tsx`
- Modify: `app/components/common/app-shell.test.tsx`

**Interfaces:**
- Consumes: `useScanStatus`, `startScan` (Task 3); `ShellData.duplicateGroups`.
- Produces: `AppContextValue` without `filtered`/`keepers`/`scanActive`/`logs`/`startScan`; Sidebar with real start/scan-state/badge.

- [ ] **Step 1: Replace `app/lib/app-context.tsx`**

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type { Entry } from './types';

export type AppContextValue = {
  query: string;
  setQuery: (v: string) => void;
  dir: string;
  setDir: (v: string) => void;
  ext: string;
  setExt: (v: string) => void;
  selectedDirs: string[];
  setSelectedDirs: (dirs: string[]) => void;
  toggleSelectedDir: (path: string) => void;
  clearSelectedDirs: () => void;
  selectedFile: Entry | null;
  setSelectedFile: (e: Entry | null) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }): ReactElement {
  const [query, setQuery] = useState('');
  const [dir, setDir] = useState('All directories');
  const [ext, setExt] = useState('All types');
  const [selectedDirs, setSelectedDirs] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<Entry | null>(null);

  const toggleSelectedDir = useCallback((path: string) => {
    setSelectedDirs((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path],
    );
  }, []);

  const clearSelectedDirs = useCallback(() => setSelectedDirs([]), []);

  const value = useMemo<AppContextValue>(
    () => ({
      query,
      setQuery,
      dir,
      setDir,
      ext,
      setExt,
      selectedDirs,
      setSelectedDirs,
      toggleSelectedDir,
      clearSelectedDirs,
      selectedFile,
      setSelectedFile,
    }),
    [query, dir, ext, selectedDirs, toggleSelectedDir, clearSelectedDirs, selectedFile],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within <AppProvider>');
  }
  return ctx;
}
```

- [ ] **Step 2: Replace `app/components/common/Sidebar.tsx`**

```tsx
import { Badge, Button, Group, Progress, Text, ThemeIcon } from '@mantine/core';
import {
  Activity,
  Archive,
  BarChart3,
  FileImage,
  LayoutGrid,
  Settings2,
  Sparkles,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { Link, useLoaderData, useRouter } from '@tanstack/react-router';
import { startScan, useScanStatus } from '../../lib/scan-store';
import { formatBytes } from '../../lib/format';

const navItems: { label: string; to: string; icon: LucideIcon }[] = [
  { label: 'Overview', to: '/', icon: BarChart3 },
  { label: 'Duplicates', to: '/duplicates', icon: Archive },
  { label: 'Unique Files', to: '/unique-files', icon: Sparkles },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
  { label: 'Browse', to: '/browse', icon: LayoutGrid },
  { label: 'Activity', to: '/activity', icon: Activity },
];

export function Sidebar() {
  const router = useRouter();
  const { files, size, duplicateGroups } = useLoaderData({ from: '__root__' });
  const scan = useScanStatus();

  const running = scan.status === 'running';
  const percent = running && scan.totalFiles ? Math.round((scan.filesProcessed / scan.totalFiles) * 100) : running ? 0 : 100;

  const handleScan = () => {
    void startScan();
    router.navigate({ to: '/activity' as string });
  };

  return (
    <aside>
      <div className="brand">
        <ThemeIcon size={34} radius="md" color="cyan">
          <FileImage size={20} />
        </ThemeIcon>
        <div>
          <b>imgsorter</b>
          <small>v2 / local library</small>
        </div>
      </div>
      <Button leftSection={<Upload size={16} />} fullWidth color="cyan" className="scan" onClick={handleScan}>
        Scan library
      </Button>
      <div className="scan-state">
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {running ? 'INDEXING' : 'INDEXING COMPLETE'}
          </Text>
          <Text size="xs" c="cyan">
            {percent}%
          </Text>
        </Group>
        <Progress value={percent} color="cyan" size="xs" mt={7} />
        <Text size="xs" c="dimmed" mt={8}>
          {files.toLocaleString('en-US')} files · {formatBytes(size)}
        </Text>
      </div>
      <nav>
        {navItems.map(({ label, to, icon: Icon }) => (
          <Link key={label} to={to} activeProps={{ className: 'active' }}>
            <Icon size={17} />
            {label}
            {label === 'Duplicates' && (
              <Badge size="xs" color="orange">
                {duplicateGroups}
              </Badge>
            )}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Link to={'/preferences' as string} activeProps={{ className: 'active' }}>
          <Settings2 size={16} />
          Preferences
        </Link>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Update `app/components/common/app-shell.test.tsx`**

Replace the `useLoaderData` mock return and add the Duplicates badge assertion:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLoaderData: () => ({ files: 1272, size: 391_000_000, roots: [], extensions: [], duplicateGroups: 24 }),
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

describe('app shell', () => {
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
});
```

- [ ] **Step 4: Run the full check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

- [ ] **Step 5: Production build**

Run: `pnpm build`
Expected: client + SSR build succeed; `grep -rl "sqlite" dist/client` returns nothing.

- [ ] **Step 6: Commit**

```bash
git add app/components/common/Sidebar.tsx app/lib/app-context.tsx app/components/common/app-shell.test.tsx
git commit -m "feat: real scan controls + duplicate badge; prune app-context mock state"
```

### Task 6: Final verification + mark Phase 3 complete

**Files:**
- Modify: `docs/ROADMAP.md` (Phase 3 → `[x]`)
- Modify: `AGENTS.md` (Current Plan State)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Run the full check**

Run: `pnpm check`
Expected: typecheck, lint, tests (client + server), format all pass.

- [ ] **Step 2: Production build + client-safety**

Run: `pnpm build`
Expected: build succeeds; `grep -rl "better-sqlite3\|sqlite" dist/client` returns nothing.

- [ ] **Step 3: Manual scan smoke**

Run: `pnpm dev`; open `/activity`, click "Scan library" (or via curl `POST /_serverFn/...` is impractical — verify in the browser). Expected: progress advances live, then completes with a summary; the Duplicates badge and Footer totals refresh. Cancel a second run and confirm it stops. Kill the dev server. Then `git restore server/data/imgsorter.db` (the scan rewrote it).

- [ ] **Step 4: Mark Phase 3 complete**

In `docs/ROADMAP.md`, set the Phase 3 row status `[ ]` → `[x]`. In `AGENTS.md` "Current Plan State", mark Phase 3 complete (PRs) and note Phase 4 as next.

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md AGENTS.md
git commit -m "docs: mark Phase 3 complete"
```

## Self-Review Checklist

1. **Spec coverage:**
   - Fixture/scan libs extracted + seed refactor → Task 1.
   - `ShellData.duplicateGroups` → Task 1; real badge → Task 5.
   - Scan service + server fns (`startScan`/`getScanStatus`/`cancelScan`) + state machine tests → Task 2.
   - Client store + `useSyncExternalStore` + revalidation → Task 3.
   - Activity real progress + Cancel + summary → Task 4.
   - `app-context` cleanup → Task 5.
   - Phase 3 completion (roadmap) → Task 6.
2. **Placeholder scan:** every step has full code/commands; no TBD/TODO.
3. **Type consistency:** `ScanState`/`ScanRunStatus` defined once (Task 2) and used by the service, store, Activity, and Sidebar; `runFixtureScan`/`createScanService`/`scanService` names are consistent; `useScanStatus`/`startScan`/`cancelScan` names match between the store and its consumers; `ShellData.duplicateGroups` is added in Task 1 and read in Task 5.
4. **Risk notes:** the heavy `runFixtureScan` path is verified manually via `pnpm seed` and the browser scan (Task 6), not unit tests; a UI scan rewrites the committed DB (restore afterwards).
