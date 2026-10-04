# Phase 7 (Maintenance Tab + Library Index Reset) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Maintenance tab to Preferences with a guarded "Reset library index" action that clears the scanned files, duplicate records, scan metadata, keepers, and thumbnail cache, while keeping directories and preferences.

**Architecture:** A `resetService` composes small injected steps (clear index → clear scan metadata → clear keepers → clear thumbnail cache). A `resetLibraryIndex` server function exposes it. A `MaintenancePanel` renders the totals, a warning, a confirm modal, and calls the function.

**Tech Stack:** TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9, `@mantine/notifications`, `better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-10-04-phase7-library-reset-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24.
- Prettier 2-space, single quotes, semicolons, print width 120. **No comments in new code.**
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- `better-sqlite3` and engine code are server-only; never in a client bundle. Server fns dynamically `import()` server libs inside the handler.
- Never clear the committed fixture DB (`server/data/fixture.db`). The `clearIndex` test runs against a temporary copy.
- `pnpm check` runs `generate-routes` and may change `app/routeTree.gen.ts`. If that file changes and is not part of the task, restore it with `git restore app/routeTree.gen.ts`.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; never merge. All PR text is ASD-STE100.
- Task order: 1 → 2 → 3 → 4. Task 2 imports Task 1; Task 3 imports Task 2.

---

### Task 1: Server clear primitives (`clearIndex`, `resetScanMetadata`)

**Files:**
- Modify: `app/lib/types.ts`
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`
- Modify: `server/lib/app-config.ts`
- Modify: `server/lib/app-config.test.ts`

**Interfaces:**
- Produces: `ResetResult`; `clearIndex(): { entries: number; records: number }`; `appConfigStore.resetScanMetadata(): void`.

- [ ] **Step 1: Add the result type — `app/lib/types.ts`**

Append to the end of the file:

```ts
export type ResetResult = {
  entries: number;
  records: number;
  thumbnails: number;
};
```

- [ ] **Step 2: Write the failing `clearIndex` test — `server/lib/queries.test.ts`**

Add `copyFileSync, rmSync` to the existing `node:fs` import, add `fixtureDbPath` to a new import, and add `clearIndex` to the `./queries` import. Add this test inside the `describe`:

```ts
  it('clears every entry and record and returns the counts', () => {
    const copy = join(tmpdir(), `imgsorter-clear-${Date.now()}.db`);
    copyFileSync(fixtureDbPath(), copy);
    const previous = process.env.IMGSORTER_DB_PATH;
    process.env.IMGSORTER_DB_PATH = copy;
    try {
      expect(getDirectoryStats().length).toBeGreaterThan(0);
      const result = clearIndex();
      expect(result.entries).toBeGreaterThan(0);
      expect(result.records).toBeGreaterThan(0);
      expect(listEntries({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] })).toEqual([]);
      expect(getDirectoryStats()).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.IMGSORTER_DB_PATH;
      else process.env.IMGSORTER_DB_PATH = previous;
      rmSync(copy, { force: true });
    }
  });
```

Add the import line:

```ts
import { fixtureDbPath } from './db-path';
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run server/lib/queries.test.ts -t "clears every entry"`
Expected: FAIL — `clearIndex` is not exported.

- [ ] **Step 4: Implement `openWritable` and `clearIndex` — `server/lib/queries.ts`**

Add next to `openReadonly`:

```ts
function openWritable(): DatabaseType | null {
  const path = dbPath();
  if (!existsSync(path)) return null;
  return new Database(path);
}
```

Append the function at the end of the file:

```ts
export function clearIndex(): { entries: number; records: number } {
  const db = openWritable();
  if (!db) return { entries: 0, records: 0 };
  try {
    const clear = db.transaction(() => {
      const records = db.prepare(`DELETE FROM records`).run().changes;
      const entries = db.prepare(`DELETE FROM entries`).run().changes;
      return { entries, records };
    });
    return clear();
  } finally {
    db.close();
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing `resetScanMetadata` test — `server/lib/app-config.test.ts`**

Add inside the `describe`:

```ts
  it('resets the scan metadata', () => {
    store.recordLastScan({
      finishedAt: '2026-10-04T08:00:00.000Z',
      directories: 1,
      filesScanned: 5,
      entriesWritten: 5,
      duplicateGroups: 1,
      duplicateFiles: 2,
      errors: 0,
    });
    store.recordScannedDirectories(['C:/Media'], '2026-10-04T08:00:00.000Z');
    expect(store.getLastScan()).not.toBeNull();
    expect(Object.keys(store.get().directoryMeta).length).toBeGreaterThan(0);

    store.resetScanMetadata();

    expect(store.getLastScan()).toBeNull();
    expect(store.get().directoryMeta).toEqual({});
  });
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm exec vitest run server/lib/app-config.test.ts -t "resets the scan metadata"`
Expected: FAIL — `store.resetScanMetadata` is not a function.

- [ ] **Step 8: Implement `resetScanMetadata` — `server/lib/app-config.ts`**

Add to the `AppConfigStore` type after `recordLastScan`:

```ts
  resetScanMetadata: () => void;
```

Add the method to the object returned by `createAppConfigStore`, after `recordLastScan`:

```ts
    resetScanMetadata: () => {
      const db = openStore(dbPath);
      try {
        writeKey(db, DIRECTORY_META_KEY, {});
        db.prepare(`DELETE FROM app_config WHERE key = ?`).run(LAST_SCAN_KEY);
      } finally {
        db.close();
      }
    },
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm exec vitest run server/lib/app-config.test.ts server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 10: Run the full check, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add app/lib/types.ts server/lib/queries.ts server/lib/queries.test.ts server/lib/app-config.ts server/lib/app-config.test.ts
git commit -m "feat: add index clear and scan-metadata reset primitives"
```

---

### Task 2: Reset service and server function

**Files:**
- Create: `server/lib/reset.ts`
- Create: `server/lib/reset.test.ts`
- Create: `server/routes/maintenance.ts`

**Interfaces:**
- Consumes: `clearIndex`, `appConfigStore.resetScanMetadata`, `appConfigStore.setKeepers`, `thumbnails.clearCache`, `ResetResult`.
- Produces: `createResetService(deps)`, `resetService`, `resetLibraryIndex` server fn.

- [ ] **Step 1: Write the failing service tests — create `server/lib/reset.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createResetService, type ResetDeps } from './reset';

function makeDeps(): ResetDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    clearIndex: vi.fn(() => {
      calls.push('clearIndex');
      return { entries: 5, records: 3 };
    }),
    resetScanMetadata: vi.fn(() => {
      calls.push('resetScanMetadata');
    }),
    clearKeepers: vi.fn(() => {
      calls.push('clearKeepers');
    }),
    clearThumbnails: vi.fn(() => {
      calls.push('clearThumbnails');
      return 2;
    }),
  };
}

describe('createResetService', () => {
  it('clears everything in order and returns the counts', () => {
    const deps = makeDeps();
    const service = createResetService(deps);
    expect(service.reset()).toEqual({ entries: 5, records: 3, thumbnails: 2 });
    expect(deps.calls).toEqual(['clearIndex', 'resetScanMetadata', 'clearKeepers', 'clearThumbnails']);
  });

  it('stops when clearing the index fails', () => {
    const deps = makeDeps();
    deps.clearIndex.mockImplementation(() => {
      throw new Error('boom');
    });
    const service = createResetService(deps);
    expect(() => service.reset()).toThrow('boom');
    expect(deps.resetScanMetadata).not.toHaveBeenCalled();
    expect(deps.clearKeepers).not.toHaveBeenCalled();
    expect(deps.clearThumbnails).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run server/lib/reset.test.ts`
Expected: FAIL — cannot resolve `./reset`.

- [ ] **Step 3: Implement the service — create `server/lib/reset.ts`**

```ts
import '@tanstack/react-start/server-only';
import type { ResetResult } from '../../app/lib/types';
import { appConfigStore } from './app-config';
import { clearIndex } from './queries';
import { thumbnails } from './thumbnails';

export type ResetDeps = {
  clearIndex: () => { entries: number; records: number };
  resetScanMetadata: () => void;
  clearKeepers: () => void;
  clearThumbnails: () => number;
};

export function createResetService(deps: ResetDeps): { reset: () => ResetResult } {
  return {
    reset: () => {
      const index = deps.clearIndex();
      deps.resetScanMetadata();
      deps.clearKeepers();
      const thumbs = deps.clearThumbnails();
      return { entries: index.entries, records: index.records, thumbnails: thumbs };
    },
  };
}

export const resetService = createResetService({
  clearIndex,
  resetScanMetadata: () => appConfigStore.resetScanMetadata(),
  clearKeepers: () => {
    appConfigStore.setKeepers([]);
  },
  clearThumbnails: () => thumbnails.clearCache(),
});
```

- [ ] **Step 4: Run the service tests to verify they pass**

Run: `pnpm exec vitest run server/lib/reset.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the server function — create `server/routes/maintenance.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';

export const resetLibraryIndex = createServerFn({ method: 'POST' }).handler(async () => {
  const { resetService } = await import('../lib/reset');
  return resetService.reset();
});
```

- [ ] **Step 6: Run the full check, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add server/lib/reset.ts server/lib/reset.test.ts server/routes/maintenance.ts
git commit -m "feat: add the library reset service and server function"
```

---

### Task 3: Maintenance panel and tab

**Files:**
- Create: `app/features/preferences/MaintenancePanel.tsx`
- Create: `app/features/preferences/MaintenancePanel.test.tsx`
- Modify: `app/features/preferences/PreferencesPage.tsx`
- Modify: `app/features/preferences/PreferencesPage.test.tsx`

**Interfaces:**
- Consumes: `resetLibraryIndex` (Task 2), `useScanStatus`, `formatBytes`, the `__root__` loader `{ files, size }`.
- Produces: `MaintenancePanel`; the Maintenance tab.

- [ ] **Step 1: Write the failing panel test — create `app/features/preferences/MaintenancePanel.test.tsx`**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ScanState } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  resetLibraryIndex: vi.fn(),
  invalidate: vi.fn(async () => {}),
  notifyShow: vi.fn(),
  scan: { status: 'idle' } as { status: string },
  shell: { files: 1272, size: 391_000_000 },
}));

vi.mock('../../../server/routes/maintenance', () => ({ resetLibraryIndex: mocks.resetLibraryIndex }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: mocks.notifyShow } }));
vi.mock('../../lib/scan-store', () => ({ useScanStatus: () => mocks.scan as unknown as ScanState }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useRouter: () => ({ invalidate: mocks.invalidate }), useLoaderData: () => mocks.shell };
});

import { MaintenancePanel } from './MaintenancePanel';

function renderPanel() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <MaintenancePanel />
    </MantineProvider>,
  );
}

describe('MaintenancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scan.status = 'idle';
    mocks.resetLibraryIndex.mockResolvedValue({ entries: 1272, records: 24, thumbnails: 3 });
  });

  it('shows the indexed totals and a warning', () => {
    renderPanel();
    expect(screen.getByText('1,272 files · 391.0 MB indexed')).toBeInTheDocument();
    expect(screen.getByText(/This action is permanent/)).toBeInTheDocument();
  });

  it('opens the confirmation modal and resets on confirm', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset library index' }));
    expect(screen.getByText('Reset library index?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(mocks.resetLibraryIndex).toHaveBeenCalledTimes(1));
    expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'cyan' }));
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it('disables reset while a scan is running', () => {
    mocks.scan.status = 'running';
    renderPanel();
    expect(screen.getByRole('button', { name: 'Reset library index' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run app/features/preferences/MaintenancePanel.test.tsx`
Expected: FAIL — cannot resolve `./MaintenancePanel`.

- [ ] **Step 3: Implement the panel — create `app/features/preferences/MaintenancePanel.tsx`**

```tsx
import { useState } from 'react';
import { Button, Card, Group, Modal, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CircleAlert } from 'lucide-react';
import { useLoaderData, useRouter } from '@tanstack/react-router';
import { formatBytes } from '../../lib/format';
import { useScanStatus } from '../../lib/scan-store';
import { resetLibraryIndex } from '../../../server/routes/maintenance';

export function MaintenancePanel() {
  const router = useRouter();
  const { files, size } = useLoaderData({ from: '__root__' });
  const scan = useScanStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const running = scan.status === 'running';

  const reset = () => {
    setBusy(true);
    void resetLibraryIndex()
      .then((result) => {
        setConfirmOpen(false);
        notifications.show({ color: 'cyan', message: `Library index reset (${result.entries} files removed).` });
        return router.invalidate();
      })
      .catch(() => notifications.show({ color: 'red', message: 'Could not reset the library index.' }))
      .finally(() => setBusy(false));
  };

  return (
    <Card className="indexing-settings-card application-panel">
      <Text className="eyebrow">MAINTENANCE</Text>
      <h3>Library index</h3>
      <Text size="sm" c="dimmed">
        Reset removes every scanned file record. Your directories and preferences stay.
      </Text>
      <Text size="sm" mt="md">
        {files.toLocaleString('en-US')} files · {formatBytes(size)} indexed
      </Text>
      <Text size="xs" c="orange" mt="md">
        <CircleAlert size={13} /> This action is permanent. There is no undo.
      </Text>
      <Group justify="flex-end" mt="md">
        <Button color="red" disabled={busy || running} onClick={() => setConfirmOpen(true)}>
          Reset library index
        </Button>
      </Group>
      {running && (
        <Text size="xs" c="dimmed" mt="xs">
          A scan is running. Wait for it to finish before you reset.
        </Text>
      )}
      <Modal opened={confirmOpen} onClose={() => setConfirmOpen(false)} title="Reset library index?">
        <Text size="sm">
          This clears the indexed files, the duplicate records, the keepers, the preview cache, and the scan
          history. Your configured directories and preferences stay.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="subtle" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button color="red" loading={busy} onClick={reset}>
            Reset
          </Button>
        </Group>
      </Modal>
    </Card>
  );
}
```

- [ ] **Step 4: Run the panel test to verify it passes**

Run: `pnpm exec vitest run app/features/preferences/MaintenancePanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the tab — `app/features/preferences/PreferencesPage.tsx`**

Add the import:

```tsx
import { MaintenancePanel } from './MaintenancePanel';
```

Add the tab to `Tabs.List`:

```tsx
            <Tabs.Tab value="maintenance">Maintenance</Tabs.Tab>
```

Add the panel next to the directories block:

```tsx
        {activeTab === 'maintenance' && <MaintenancePanel />}
```

- [ ] **Step 6: Update the Preferences page test — `app/features/preferences/PreferencesPage.test.tsx`**

Add `useLoaderData` to the router mock so `MaintenancePanel` can render:

```tsx
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useRouter: () => ({ invalidate: vi.fn(async () => {}) }),
    useLoaderData: () => ({ files: 0, size: 0 }),
  };
});
```

Add a test inside the `describe`:

```tsx
  it('shows the Maintenance tab', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Maintenance' }));
    expect(screen.getByText('Library index')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset library index' })).toBeInTheDocument();
  });
```

If the existing `vi.mock('@tanstack/react-router', ...)` already returns `useLoaderData`, merge the two fields instead of duplicating the mock.

- [ ] **Step 7: Run the Preferences and panel tests to verify they pass**

Run: `pnpm exec vitest run app/features/preferences`
Expected: PASS.

- [ ] **Step 8: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

Run: `pnpm build`
Expected: build succeeds. Confirm no `better-sqlite3`/`sqlite` in `dist/client`.

```bash
git add app/features/preferences/MaintenancePanel.tsx app/features/preferences/MaintenancePanel.test.tsx app/features/preferences/PreferencesPage.tsx app/features/preferences/PreferencesPage.test.tsx
git commit -m "feat: add the Maintenance tab with a guarded index reset"
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

Run `pnpm dev`. Note the current file count. Open Preferences → Maintenance → Reset library index → confirm. Confirm the toast, that Overview/Files/Browse show empty, the footer shows 0 files, and Preferences still lists the configured directories. Run a scan and confirm the index rebuilds.

- [ ] **Step 3: Record the phase in `docs/ROADMAP.md`**

Add a row to the phase table:

```
| 7 | Maintenance tab + guarded library index reset | In-app reset with confirmation | `[x]` |
```

Add a bullet under the phase table:

```
- **7 — Maintenance + library reset:** a Preferences **Maintenance** tab shows the
  indexed totals and a guarded **Reset library index** action (confirmation modal,
  disabled during a scan) that clears the scanned files, duplicate records, scan
  metadata, keepers, and thumbnail cache while keeping directories and preferences.
  Spec:
  [2026-10-04-phase7-library-reset-design.md](superpowers/specs/2026-10-04-phase7-library-reset-design.md).
```

- [ ] **Step 4: Record the phase in `AGENTS.md`**

Add a bullet under "Current Plan State" after the CI bullet:

```
- Phase 7 (maintenance tab + library index reset) — **complete**: a Preferences
  **Maintenance** tab shows the indexed totals and a guarded **Reset library index**
  action (confirmation modal; disabled during a scan) that clears the scanned files,
  duplicate records, scan metadata, keepers, and thumbnail cache, and keeps
  directories and preferences. Spec at
  `docs/superpowers/specs/2026-10-04-phase7-library-reset-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-phase7-library-reset.md`.
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/ROADMAP.md
git commit -m "docs: record Phase 7 complete"
```

## Self-Review Checklist

1. **Spec coverage:**
   - `ResetResult` → Task 1 Step 1.
   - `clearIndex` → Task 1 Steps 2–5.
   - `resetScanMetadata` → Task 1 Steps 6–9.
   - `createResetService` + `resetService` → Task 2.
   - `resetLibraryIndex` server fn → Task 2 Step 5.
   - Maintenance panel + modal + disabled-while-scanning → Task 3.
   - Tab wiring → Task 3 Step 5.
   - Docs → Task 4.
2. **Placeholder scan:** every step has full code or an exact command; no TBD/TODO.
3. **Type consistency:** `ResetResult` fields (`entries`, `records`, `thumbnails`) match across the type, service, and UI toast; `clearIndex` returns `{ entries, records }`; `resetScanMetadata` is on `AppConfigStore`; `resetLibraryIndex` name matches between the server fn and the panel; `useLoaderData`/`useScanStatus` imports match the repo.
4. **Ordering:** Task 2 imports Task 1's `clearIndex` and `resetScanMetadata`; Task 3 imports Task 2's `resetLibraryIndex`.
