# Phase 4c (Native OS Actions + Server-Side Folder Picker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `FilePreviewDrawer`'s Reveal / Open file buttons real, and add a server-side native folder picker ("Browse…") to the Preferences add-directory inputs.

**Architecture:** Add `server/lib/native-actions.ts` with pure platform command builders, injectable spawn seams, a single-flight picker guard, and a `createNativeActions` factory plus `nativeActions` singleton (mirrors `server/lib/scan.ts`). Add `server/routes/native.ts` with `createServerFn` wrappers that dynamically import the server-only module. Resolve action targets by entry id through a new `queries.getEntryPathById`. The client wires the drawer buttons and the two Preferences inputs and shows toasts through a new `@mantine/notifications` provider.

**Tech Stack:** TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9, `@mantine/notifications`, `better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict, Node `node:child_process`.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-10-03-phase4c-native-actions-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24.
- Prettier 2-space, single quotes, semicolons, print width 120. **No comments in new code.**
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- Engine/`better-sqlite3` is server-only; never in a client bundle. Server fns dynamically `import()` server libs inside the handler.
- The client sends only an entry **id**. The server derives every file path from the app DB.
- OS commands run through `child_process.spawn` with an argument list. **No shell.**
- The picker is single-flight and has a **300000 ms** timeout. Cancel is not an error.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; never merge. All PR text is ASD-STE100.
- Non-goals: keeper persistence (4d), file move/delete operations, remote/UNC/WSL paths, an in-app directory browser, changes to the scan or `app_config`.
- `pnpm check` runs `generate-routes` and may change `app/routeTree.gen.ts`. If that file changes and is not part of the task, restore it with `git restore app/routeTree.gen.ts`.

---

### Task 1: Native command layer + entry-path lookup

**Files:**
- Modify: `app/lib/types.ts`
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`
- Create: `server/lib/native-actions.ts`
- Create: `server/lib/native-actions.test.ts`

**Interfaces:**
- Consumes: `virtualToReal(path)` from `./db-path`.
- Produces: `NativeActionFailure`, `NativeActionResult`, `FolderPickResult` (types); `getEntryPathById(id): string | null`; `Platform`, `NativeCommand`, `RunCaptureResult`, `NativeActionDeps`, `NativeActions`; `buildRevealCommand`, `buildOpenCommand`, `buildFolderPickerCommand`, `createNativeActions(deps?)`, `nativeActions`.

- [ ] **Step 1: Add the shared result types — `app/lib/types.ts`**

Append to the end of the file:

```ts
export type NativeActionFailure = 'not-found' | 'missing' | 'unsupported' | 'error';

export type NativeActionResult = { ok: true } | { ok: false; reason: NativeActionFailure };

export type FolderPickResult =
  | { status: 'picked'; path: string }
  | { status: 'canceled' }
  | { status: 'busy' }
  | { status: 'timeout' }
  | { status: 'unsupported' }
  | { status: 'error' };
```

- [ ] **Step 2: Write the failing lookup test — `server/lib/queries.test.ts`**

Add `getEntryPathById` to the import block from `./queries` (keep alphabetical order, after `getEntryPathById` sits between `getDuplicateGroups` and `getOverviewStats`):

```ts
import {
  countEntriesByDirectory,
  getAnalyticsData,
  getDirectoryTree,
  getDuplicateGroups,
  getEntryPathById,
  getOverviewStats,
  getShellData,
  listEntries,
} from './queries';
```

Add this test inside the `describe` block, after the `counts entries under a root` test:

```ts
  it('reads the raw stored path for an entry id', () => {
    const [entry] = getOverviewStats().largestFiles;
    const path = getEntryPathById(entry.id);
    expect(typeof path).toBe('string');
    expect(path).toContain('@fixtures');
    expect(getEntryPathById(99999999)).toBeNull();
  });
```

- [ ] **Step 3: Run the lookup test to verify it fails**

Run: `pnpm exec vitest run server/lib/queries.test.ts`
Expected: FAIL — `getEntryPathById` is not exported.

- [ ] **Step 4: Implement `getEntryPathById` — `server/lib/queries.ts`**

Add this function at the end of the file, after `countEntriesByDirectory`:

```ts
export function getEntryPathById(id: number): string | null {
  const db = openReadonly();
  if (!db) return null;
  try {
    const row = db.prepare(`SELECT path FROM entries WHERE id = ?`).get(id) as { path: string } | undefined;
    return row?.path ?? null;
  } finally {
    db.close();
  }
}
```

- [ ] **Step 5: Run the lookup test to verify it passes**

Run: `pnpm exec vitest run server/lib/queries.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing native-actions test — create `server/lib/native-actions.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  buildFolderPickerCommand,
  buildOpenCommand,
  buildRevealCommand,
  createNativeActions,
  type NativeActionDeps,
  type NativeCommand,
  type RunCaptureResult,
} from './native-actions';

const idle: RunCaptureResult = { code: 0, stdout: '', stderr: '', spawnFailed: false, timedOut: false };

function makeDeps(overrides: Partial<NativeActionDeps> = {}) {
  const spawned: NativeCommand[] = [];
  return {
    platform: 'win32',
    fileExists: () => true,
    getEntryPath: () => 'C:/Media/2025/a.jpg',
    spawnDetached: (command: NativeCommand) => {
      spawned.push(command);
    },
    runAndCapture: vi.fn(async () => idle),
    spawned,
    ...overrides,
  };
}

describe('command builders', () => {
  it('builds reveal commands per platform', () => {
    expect(buildRevealCommand('win32', 'C:\\a.jpg')).toEqual({ command: 'explorer', args: ['/select,C:\\a.jpg'] });
    expect(buildRevealCommand('darwin', '/a.jpg')).toEqual({ command: 'open', args: ['-R', '/a.jpg'] });
    expect(buildRevealCommand('linux', '/dir/a.jpg')).toEqual({ command: 'xdg-open', args: ['/dir'] });
    expect(buildRevealCommand('freebsd', '/a.jpg')).toBeNull();
  });

  it('builds open commands per platform', () => {
    expect(buildOpenCommand('win32', 'C:\\a&b.jpg')).toEqual({ command: 'explorer', args: ['C:\\a&b.jpg'] });
    expect(buildOpenCommand('darwin', '/a.jpg')).toEqual({ command: 'open', args: ['/a.jpg'] });
    expect(buildOpenCommand('linux', '/a.jpg')).toEqual({ command: 'xdg-open', args: ['/a.jpg'] });
    expect(buildOpenCommand('freebsd', '/a.jpg')).toBeNull();
  });

  it('builds folder picker commands per platform', () => {
    expect(buildFolderPickerCommand('win32')?.command).toBe('powershell');
    expect(buildFolderPickerCommand('darwin')).toEqual({
      command: 'osascript',
      args: ['-e', 'POSIX path of (choose folder)'],
    });
    expect(buildFolderPickerCommand('linux')).toEqual({
      command: 'zenity',
      args: ['--file-selection', '--directory'],
    });
    expect(buildFolderPickerCommand('freebsd')).toBeNull();
  });
});

describe('createNativeActions reveal and open', () => {
  it('returns not-found for an unknown id', async () => {
    const actions = createNativeActions(makeDeps({ getEntryPath: () => null }));
    expect(await actions.reveal(99)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('returns missing when the file is absent', async () => {
    const actions = createNativeActions(makeDeps({ fileExists: () => false }));
    expect(await actions.reveal(1)).toEqual({ ok: false, reason: 'missing' });
  });

  it('reveals a present file', async () => {
    const deps = makeDeps();
    const actions = createNativeActions(deps);
    expect(await actions.reveal(1)).toEqual({ ok: true });
    expect(deps.spawned).toEqual([{ command: 'explorer', args: ['/select,C:/Media/2025/a.jpg'] }]);
  });

  it('opens a present file', async () => {
    const deps = makeDeps();
    const actions = createNativeActions(deps);
    expect(await actions.open(1)).toEqual({ ok: true });
    expect(deps.spawned).toEqual([{ command: 'explorer', args: ['C:/Media/2025/a.jpg'] }]);
  });

  it('maps fixture paths before the existence check', async () => {
    const fileExists = vi.fn(() => true);
    const actions = createNativeActions(makeDeps({ getEntryPath: () => '@fixtures/Media/2025/a.jpg', fileExists }));
    await actions.reveal(1);
    expect(fileExists).toHaveBeenCalledWith(expect.stringContaining('.fixtures'));
  });

  it('returns unsupported on an unknown platform', async () => {
    const actions = createNativeActions(makeDeps({ platform: 'freebsd' }));
    expect(await actions.reveal(1)).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('createNativeActions pickDirectory', () => {
  const picked: RunCaptureResult = {
    code: 0,
    stdout: 'C:/Media/Picked/\n',
    stderr: '',
    spawnFailed: false,
    timedOut: false,
  };

  it('returns the picked path without a trailing separator', async () => {
    const actions = createNativeActions(makeDeps({ runAndCapture: vi.fn(async () => picked) }));
    expect(await actions.pickDirectory()).toEqual({ status: 'picked', path: 'C:/Media/Picked' });
  });

  it('returns canceled for empty output', async () => {
    const actions = createNativeActions(makeDeps({ runAndCapture: vi.fn(async () => ({ ...picked, stdout: '' })) }));
    expect(await actions.pickDirectory()).toEqual({ status: 'canceled' });
  });

  it('returns timeout when the dialog times out', async () => {
    const actions = createNativeActions(
      makeDeps({ runAndCapture: vi.fn(async () => ({ ...picked, stdout: '', timedOut: true })) }),
    );
    expect(await actions.pickDirectory()).toEqual({ status: 'timeout' });
  });

  it('returns unsupported when the picker cannot start', async () => {
    const actions = createNativeActions(
      makeDeps({ runAndCapture: vi.fn(async () => ({ ...picked, stdout: '', spawnFailed: true })) }),
    );
    expect(await actions.pickDirectory()).toEqual({ status: 'unsupported' });
  });

  it('falls back to kdialog on Linux', async () => {
    const runAndCapture = vi
      .fn<(command: NativeCommand, timeoutMs: number) => Promise<RunCaptureResult>>()
      .mockResolvedValueOnce({ ...picked, stdout: '', spawnFailed: true })
      .mockResolvedValueOnce({ ...picked, stdout: '/home/user/pics' });
    const actions = createNativeActions(makeDeps({ platform: 'linux', runAndCapture }));
    expect(await actions.pickDirectory()).toEqual({ status: 'picked', path: '/home/user/pics' });
    expect(runAndCapture).toHaveBeenNthCalledWith(2, { command: 'kdialog', args: ['--getexistingdirectory'] }, 300000);
  });

  it('returns busy while a dialog is open', async () => {
    let resolveCapture!: (result: RunCaptureResult) => void;
    const runAndCapture = vi.fn(() => new Promise<RunCaptureResult>((resolve) => (resolveCapture = resolve)));
    const actions = createNativeActions(makeDeps({ runAndCapture }));
    const first = actions.pickDirectory();
    expect(await actions.pickDirectory()).toEqual({ status: 'busy' });
    resolveCapture(picked);
    expect(await first).toEqual({ status: 'picked', path: 'C:/Media/Picked' });
  });

  it('returns error when the picker throws', async () => {
    const runAndCapture = vi.fn(
      async (): Promise<RunCaptureResult> => {
        throw new Error('picker failed');
      },
    );
    const actions = createNativeActions(makeDeps({ runAndCapture }));
    expect(await actions.pickDirectory()).toEqual({ status: 'error' });
  });
});
```

- [ ] **Step 7: Run the native-actions test to verify it fails**

Run: `pnpm exec vitest run server/lib/native-actions.test.ts`
Expected: FAIL — `./native-actions` cannot be found.

- [ ] **Step 8: Implement `server/lib/native-actions.ts`**

```ts
import '@tanstack/react-start/server-only';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FolderPickResult, NativeActionResult } from '../../app/lib/types';
import { virtualToReal } from './db-path';
import { getEntryPathById } from './queries';

export type Platform = string;
export type NativeCommand = { command: string; args: string[] };

export type RunCaptureResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  spawnFailed: boolean;
  timedOut: boolean;
};

export type NativeActionDeps = {
  platform: Platform;
  fileExists: (path: string) => boolean;
  getEntryPath: (id: number) => string | null;
  spawnDetached: (command: NativeCommand) => void;
  runAndCapture: (command: NativeCommand, timeoutMs: number) => Promise<RunCaptureResult>;
};

export type NativeActions = {
  reveal: (id: number) => Promise<NativeActionResult>;
  open: (id: number) => Promise<NativeActionResult>;
  pickDirectory: () => Promise<FolderPickResult>;
};

const PICKER_TIMEOUT_MS = 300000;

const WINDOWS_FOLDER_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms;',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
  "$dialog.Description = 'Select a folder';",
  'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }',
].join(' ');

export function buildRevealCommand(platform: Platform, filePath: string): NativeCommand | null {
  switch (platform) {
    case 'win32':
      return { command: 'explorer', args: [`/select,${filePath}`] };
    case 'darwin':
      return { command: 'open', args: ['-R', filePath] };
    case 'linux':
      return { command: 'xdg-open', args: [dirname(filePath)] };
    default:
      return null;
  }
}

export function buildOpenCommand(platform: Platform, filePath: string): NativeCommand | null {
  switch (platform) {
    case 'win32':
      return { command: 'explorer', args: [filePath] };
    case 'darwin':
      return { command: 'open', args: [filePath] };
    case 'linux':
      return { command: 'xdg-open', args: [filePath] };
    default:
      return null;
  }
}

export function buildFolderPickerCommand(platform: Platform): NativeCommand | null {
  switch (platform) {
    case 'win32':
      return { command: 'powershell', args: ['-STA', '-NoProfile', '-Command', WINDOWS_FOLDER_SCRIPT] };
    case 'darwin':
      return { command: 'osascript', args: ['-e', 'POSIX path of (choose folder)'] };
    case 'linux':
      return { command: 'zenity', args: ['--file-selection', '--directory'] };
    default:
      return null;
  }
}

function stripTrailingSeparator(path: string): string {
  if (path === '/' || /^[A-Za-z]:[\\/]$/.test(path)) return path;
  return path.replace(/[\\/]+$/, '');
}

function toPickResult(result: RunCaptureResult): FolderPickResult {
  if (result.timedOut) return { status: 'timeout' };
  if (result.spawnFailed) return { status: 'unsupported' };
  const path = result.stdout.trim();
  if (!path) return { status: 'canceled' };
  return { status: 'picked', path: stripTrailingSeparator(path) };
}

function defaultSpawnDetached(command: NativeCommand): void {
  const child = spawn(command.command, command.args, { windowsHide: true, detached: true });
  child.on('error', () => {});
  child.unref();
}

function defaultRunAndCapture(command: NativeCommand, timeoutMs: number): Promise<RunCaptureResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(command.command, command.args, { windowsHide: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const finish = (result: RunCaptureResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', () => finish({ code: null, stdout, stderr, spawnFailed: true, timedOut: false }));
    child.on('close', (code) => finish({ code, stdout, stderr, spawnFailed: false, timedOut }));
  });
}

function defaultDeps(): NativeActionDeps {
  return {
    platform: process.platform,
    fileExists: (path) => existsSync(path),
    getEntryPath: (id) => getEntryPathById(id),
    spawnDetached: defaultSpawnDetached,
    runAndCapture: defaultRunAndCapture,
  };
}

export function createNativeActions(overrides: Partial<NativeActionDeps> = {}): NativeActions {
  const deps: NativeActionDeps = { ...defaultDeps(), ...overrides };
  let picking = false;

  const runAction = async (id: number, kind: 'reveal' | 'open'): Promise<NativeActionResult> => {
    try {
      const stored = deps.getEntryPath(id);
      if (!stored) return { ok: false, reason: 'not-found' };
      const realPath = stored.startsWith('@fixtures') ? virtualToReal(stored) : stored;
      if (!deps.fileExists(realPath)) return { ok: false, reason: 'missing' };
      const command =
        kind === 'reveal'
          ? buildRevealCommand(deps.platform, realPath)
          : buildOpenCommand(deps.platform, realPath);
      if (!command) return { ok: false, reason: 'unsupported' };
      deps.spawnDetached(command);
      return { ok: true };
    } catch (error) {
      console.error('Native action failed', error);
      return { ok: false, reason: 'error' };
    }
  };

  const pickDirectory = async (): Promise<FolderPickResult> => {
    if (picking) return { status: 'busy' };
    picking = true;
    try {
      const command = buildFolderPickerCommand(deps.platform);
      if (!command) return { status: 'unsupported' };
      const result = await deps.runAndCapture(command, PICKER_TIMEOUT_MS);
      if (deps.platform === 'linux' && result.spawnFailed) {
        return toPickResult(
          await deps.runAndCapture({ command: 'kdialog', args: ['--getexistingdirectory'] }, PICKER_TIMEOUT_MS),
        );
      }
      return toPickResult(result);
    } catch (error) {
      console.error('Folder picker failed', error);
      return { status: 'error' };
    } finally {
      picking = false;
    }
  };

  return {
    reveal: (id) => runAction(id, 'reveal'),
    open: (id) => runAction(id, 'open'),
    pickDirectory,
  };
}

export const nativeActions = createNativeActions();
```

- [ ] **Step 9: Run the native-actions test to verify it passes**

Run: `pnpm exec vitest run server/lib/native-actions.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 10: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass; build succeeds.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add app/lib/types.ts server/lib/queries.ts server/lib/queries.test.ts server/lib/native-actions.ts server/lib/native-actions.test.ts
git commit -m "feat: add native OS action command layer and entry-path lookup"
```

### Task 2: Server endpoints, drawer wiring, and toasts

**Files:**
- Create: `server/routes/native.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (via `pnpm add`)
- Modify: `app/routes/__root.tsx`
- Modify: `app/components/common/FilePreviewDrawer.tsx`
- Modify: `app/components/common/FilePreviewDrawer.test.tsx`

**Interfaces:**
- Consumes: `nativeActions` (Task 1), `NativeActionFailure` (Task 1).
- Produces: `revealEntry`, `openEntry`, `pickDirectory` server fns; the wired drawer.

- [ ] **Step 1: Add the notifications dependency**

Run: `pnpm add @mantine/notifications@^9.5.2`
Expected: `package.json` gains `"@mantine/notifications": "^9.5.2"`; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Create `server/routes/native.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';

export const revealEntry = createServerFn({ method: 'POST' })
  .validator((input: { id: number }) => input)
  .handler(async ({ data }) => {
    const { nativeActions } = await import('../lib/native-actions');
    return nativeActions.reveal(data.id);
  });

export const openEntry = createServerFn({ method: 'POST' })
  .validator((input: { id: number }) => input)
  .handler(async ({ data }) => {
    const { nativeActions } = await import('../lib/native-actions');
    return nativeActions.open(data.id);
  });

export const pickDirectory = createServerFn({ method: 'GET' }).handler(async () => {
  const { nativeActions } = await import('../lib/native-actions');
  return nativeActions.pickDirectory();
});
```

- [ ] **Step 3: Mount the toast provider — `app/routes/__root.tsx`**

Add two imports after `import '@mantine/core/styles.css';`:

```tsx
import '@mantine/notifications/styles.css';
import { Notifications } from '@mantine/notifications';
```

Mount the provider as the first child of `MantineProvider`:

```tsx
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <Notifications position="top-right" />
          <AppProvider>
```

- [ ] **Step 4: Replace the failing drawer test — `app/components/common/FilePreviewDrawer.test.tsx`**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider, useApp } from '../../lib/app-context';
import type { Entry } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  revealEntry: vi.fn(),
  openEntry: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/native', () => ({
  revealEntry: mocks.revealEntry,
  openEntry: mocks.openEntry,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: mocks.notifyShow },
}));

import { FilePreviewDrawer } from './FilePreviewDrawer';

const selected: Entry = {
  id: 7,
  size: 2048,
  directory: 'C:/Media/2025',
  extension: 'jpg',
  filename: 'a.jpg',
  birthtime: '2025-01-01T00:00:00Z',
  hash: 'abc',
  path: 'C:/Media/2025/a.jpg',
};

function Harness() {
  const { setSelectedFile } = useApp();
  useEffect(() => {
    setSelectedFile(selected);
  }, [setSelectedFile]);
  return <FilePreviewDrawer />;
}

function renderDrawer() {
  return render(
    <MantineProvider defaultColorScheme="dark">
      <AppProvider>
        <Harness />
      </AppProvider>
    </MantineProvider>,
  );
}

describe('FilePreviewDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing while closed', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <FilePreviewDrawer />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.queryByText('File details')).not.toBeInTheDocument();
  });

  it('reveals the selected file and shows a success toast', async () => {
    mocks.revealEntry.mockResolvedValue({ ok: true });
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal' }));
    await waitFor(() => expect(mocks.revealEntry).toHaveBeenCalledWith({ data: { id: 7 } }));
    expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'cyan' }));
  });

  it('shows an error toast when reveal fails', async () => {
    mocks.revealEntry.mockResolvedValue({ ok: false, reason: 'missing' });
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal' }));
    await waitFor(() =>
      expect(mocks.notifyShow).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'red', message: 'File not found.' }),
      ),
    );
  });

  it('opens the selected file', async () => {
    mocks.openEntry.mockResolvedValue({ ok: true });
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: 'Open file' }));
    await waitFor(() => expect(mocks.openEntry).toHaveBeenCalledWith({ data: { id: 7 } }));
    expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'cyan' }));
  });
});
```

- [ ] **Step 5: Run the drawer test to verify it fails**

Run: `pnpm exec vitest run app/components/common/FilePreviewDrawer.test.tsx`
Expected: FAIL — the buttons have no handlers, so `revealEntry` / `openEntry` are never called.

- [ ] **Step 6: Wire the drawer — `app/components/common/FilePreviewDrawer.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Button, Drawer, Group, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { FileImage, FolderOpen } from 'lucide-react';
import { useApp } from '../../lib/app-context';
import { thumbs } from '../../lib/mock-data';
import { formatBytes } from '../../lib/format';
import { openEntry, revealEntry } from '../../../server/routes/native';
import type { NativeActionFailure } from '../../lib/types';

const FAILURE_MESSAGES: Record<NativeActionFailure, string> = {
  'not-found': 'File not found.',
  missing: 'File not found.',
  unsupported: 'This action is not supported here.',
  error: 'The action failed.',
};

export function FilePreviewDrawer() {
  const { selectedFile, setSelectedFile } = useApp();
  const [busy, setBusy] = useState<'reveal' | 'open' | null>(null);

  useEffect(() => {
    setBusy(null);
  }, [selectedFile]);

  const run = async (kind: 'reveal' | 'open'): Promise<void> => {
    if (!selectedFile) return;
    setBusy(kind);
    try {
      const result =
        kind === 'reveal'
          ? await revealEntry({ data: { id: selectedFile.id } })
          : await openEntry({ data: { id: selectedFile.id } });
      if (result.ok) {
        notifications.show({
          color: 'cyan',
          message: kind === 'reveal' ? 'File shown in the file manager.' : 'Opened in the default application.',
        });
      } else {
        notifications.show({ color: 'red', message: FAILURE_MESSAGES[result.reason] });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer
      opened={!!selectedFile}
      onClose={() => setSelectedFile(null)}
      position="right"
      size={360}
      title="File details"
    >
      {selectedFile && (
        <>
          <div
            className="drawer-thumb"
            style={{ backgroundImage: `url(${thumbs[(selectedFile.id || 1) % thumbs.length]})` }}
          />
          <Text className="eyebrow" mt="lg">
            PATH
          </Text>
          <Text size="sm" className="path">
            {selectedFile.path}
          </Text>
          <Table mt="lg">
            <Table.Tbody>
              {(
                [
                  ['Size', formatBytes(selectedFile.size)],
                  ['Extension', selectedFile.extension],
                  ['Created', selectedFile.birthtime],
                  ['Hash', selectedFile.hash || 'NULL — unverified'],
                ] as const
              ).map(([label, value]) => (
                <Table.Tr key={label}>
                  <Table.Td c="dimmed">{label}</Table.Td>
                  <Table.Td>{value}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group mt="xl">
            <Button
              leftSection={<FolderOpen size={15} />}
              color="cyan"
              loading={busy === 'reveal'}
              disabled={busy !== null}
              onClick={() => void run('reveal')}
            >
              Reveal
            </Button>
            <Button
              variant="light"
              leftSection={<FileImage size={15} />}
              loading={busy === 'open'}
              disabled={busy !== null}
              onClick={() => void run('open')}
            >
              Open file
            </Button>
          </Group>
        </>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 7: Run the drawer test to verify it passes**

Run: `pnpm exec vitest run app/components/common/FilePreviewDrawer.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 8: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass. Verify the client bundle has no `better-sqlite3`/`sqlite`:

Run: `rg -l "better-sqlite3|sqlite" dist/client`
Expected: no output.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add server/routes/native.ts package.json pnpm-lock.yaml app/routes/__root.tsx app/components/common/FilePreviewDrawer.tsx app/components/common/FilePreviewDrawer.test.tsx
git commit -m "feat: wire reveal/open actions and add notification toasts"
```

### Task 3: Preferences "Browse…" folder picker

**Files:**
- Modify: `app/features/preferences/PreferencesPage.tsx`
- Modify: `app/features/preferences/PreferencesPage.test.tsx`

**Interfaces:**
- Consumes: `pickDirectory` server fn (Task 2), `FolderPickResult` (Task 1).
- Produces: the two "Browse…" buttons.

- [ ] **Step 1: Write the failing picker tests — `app/features/preferences/PreferencesPage.test.tsx`**

Replace the `mocks` block, add the native and notifications mocks, and add two tests:

```tsx
const mocks = vi.hoisted(() => ({
  saveDirectories: vi.fn(),
  saveApplicationSettings: vi.fn(),
  pickDirectory: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/preferences', () => ({
  saveDirectories: mocks.saveDirectories,
  saveApplicationSettings: mocks.saveApplicationSettings,
}));

vi.mock('../../../server/routes/native', () => ({
  pickDirectory: mocks.pickDirectory,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: mocks.notifyShow },
}));
```

Add these tests inside the `describe` block, after the `saves application settings` test:

```tsx
  it('fills the indexed input with the picked folder', async () => {
    mocks.pickDirectory.mockResolvedValue({ status: 'picked', path: 'C:/Media/Picked' });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Browse…' })[0]);
    await waitFor(() => expect(screen.getByLabelText('Add indexed directory')).toHaveValue('C:/Media/Picked'));
  });

  it('does not change the input when the picker is canceled', async () => {
    mocks.pickDirectory.mockResolvedValue({ status: 'canceled' });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Browse…' })[0]);
    await waitFor(() => expect(mocks.pickDirectory).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Add indexed directory')).toHaveValue('');
    expect(mocks.notifyShow).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the page test to verify it fails**

Run: `pnpm exec vitest run app/features/preferences/PreferencesPage.test.tsx`
Expected: FAIL — no "Browse…" button exists.

- [ ] **Step 3: Add the Browse buttons — `app/features/preferences/PreferencesPage.tsx`**

Add the imports:

```tsx
import { notifications } from '@mantine/notifications';
import { pickDirectory } from '../../../server/routes/native';
```

Add a `browsing` state next to the other `useState` calls:

```tsx
  const [browsing, setBrowsing] = useState<'indexed' | 'ignored' | null>(null);
```

Add the `browse` handler after `addIgnored`:

```tsx
  const browse = async (target: 'indexed' | 'ignored'): Promise<void> => {
    setBrowsing(target);
    try {
      const result = await pickDirectory();
      if (result.status === 'picked') {
        if (target === 'indexed') setIndexedPath(result.path);
        else setIgnoredPath(result.path);
        return;
      }
      if (result.status === 'canceled') return;
      const message =
        result.status === 'busy'
          ? 'A folder dialog is already open.'
          : result.status === 'timeout'
            ? 'The folder dialog timed out.'
            : result.status === 'unsupported'
              ? 'The folder picker is not available.'
              : 'The folder picker failed.';
      notifications.show({ color: 'red', message });
    } finally {
      setBrowsing(null);
    }
  };
```

Add a Browse button between the indexed `TextInput` and its Add button:

```tsx
                <Button
                  variant="default"
                  loading={browsing === 'indexed'}
                  disabled={browsing !== null}
                  onClick={() => void browse('indexed')}
                >
                  Browse…
                </Button>
```

Add a Browse button between the ignored `TextInput` and its Add button:

```tsx
                <Button
                  variant="default"
                  loading={browsing === 'ignored'}
                  disabled={browsing !== null}
                  onClick={() => void browse('ignored')}
                >
                  Browse…
                </Button>
```

- [ ] **Step 4: Run the page test to verify it passes**

Run: `pnpm exec vitest run app/features/preferences/PreferencesPage.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass; no `better-sqlite3`/`sqlite` in `dist/client`.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add app/features/preferences/PreferencesPage.tsx app/features/preferences/PreferencesPage.test.tsx
git commit -m "feat: add native folder picker Browse buttons to Preferences"
```

### Task 4: Final verification + Phase 4c docs

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

Run `pnpm dev`. In Preferences add a small real folder with a few images and scan it. Open a file in the drawer. Click **Reveal**; the OS file manager opens with the file selected. Click **Open file**; the default application opens it. In Preferences, click **Browse…** next to each input; pick a folder and confirm the input fills. Cancel a dialog and confirm nothing changes. Delete a scanned file on disk, reopen its drawer entry, and click **Reveal**; confirm the "File not found." toast.

- [ ] **Step 4: Record Phase 4c progress**

In `docs/ROADMAP.md`, append to the 4c bullet:

```
  Spec: [2026-10-03-phase4c-native-actions-design.md](superpowers/specs/2026-10-03-phase4c-native-actions-design.md). **Complete.**
```

Add to the "Detailed specs" table:

```
| 4c | [2026-10-03-phase4c-native-actions-design.md](superpowers/specs/2026-10-03-phase4c-native-actions-design.md) |
```

In `AGENTS.md` "Current Plan State", mark **4c complete** (Reveal/Open plus the server-side native folder picker) and note 4d (keeper persistence) as next.

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md AGENTS.md
git commit -m "docs: record Phase 4c complete"
```

## Self-Review Checklist

1. **Spec coverage:**
   - Reveal/Open server actions + path safety by id → Task 1 (`getEntryPathById`, `native-actions`) and Task 2 (routes, drawer).
   - OS commands for Windows/macOS/Linux + unsupported result → Task 1.
   - Folder picker for all platforms with Linux fallback + timeout + single-flight → Task 1 and Task 3.
   - Toasts on success/error and a silent cancel → Task 2 (dependency + provider) and Task 3.
   - "Browse…" on both inputs, fill text only → Task 3.
   - Verification + docs → Task 4.
2. **Placeholder scan:** every step has full code or an exact command; no TBD/TODO.
3. **Type consistency:** `NativeActionResult` / `FolderPickResult` / `NativeActionFailure` defined in Task 1 and used in Tasks 2–3; `createNativeActions` / `buildRevealCommand` / `buildOpenCommand` / `buildFolderPickerCommand` / `RunCaptureResult` / `NativeActionDeps` names match between module and tests; `revealEntry` / `openEntry` / `pickDirectory` consistent between routes and clients; `getEntryPathById` consistent between queries and tests.
4. **Risk notes:** `pnpm add` updates `pnpm-lock.yaml`. `buildRevealCommand` uses `dirname`, so the Linux reveal test uses a POSIX path. The Windows PowerShell picker and fire-and-forget spawns are not unit-tested against real processes; the command builders and injected seams are the tested boundary.
