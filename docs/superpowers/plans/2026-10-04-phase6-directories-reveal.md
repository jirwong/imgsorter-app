# Phase 6 (Library Directories + Native Reveal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a drive-rooted Directories page (index-derived tree with per-folder counts and actions), make Browse's directory filter drive-rooted, remove its dead collapse button, and fix Reveal so the OS file-manager window comes to the front.

**Architecture:** A pure `buildDirectoryIndex(roots, stats)` builder produces a drive-rooted `DirectoryNode[]` with subtree totals; a server wrapper merges configured roots (from `app-config.db`) with per-directory stats (from the photo DB). Browse and the new `/directories` route both consume it. The Windows reveal switches to a PowerShell `-EncodedCommand` that opens/selects and forces the window forward.

**Tech Stack:** TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9, `@mantine/notifications`, `better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-10-04-phase6-directories-reveal-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24.
- Prettier 2-space, single quotes, semicolons, print width 120. **No comments in new code.**
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- Engine/`better-sqlite3` is server-only; never in a client bundle. Server fns dynamically `import()` server libs inside the handler.
- `pnpm check` runs `generate-routes` and may change `app/routeTree.gen.ts`. If that file changes and is not part of the task, restore it with `git restore app/routeTree.gen.ts`.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; never merge. All PR text is ASD-STE100.
- Task order: 1 → 2 → 3 → 4 → 5. Task 3 (Directories page) imports `revealFolder`, which Task 2 adds.

---

### Task 1: Directory index (types, builder, stats, wrapper; remove tree.ts)

**Files:**
- Modify: `app/lib/types.ts`
- Create: `server/lib/directory-index.ts`
- Create: `server/lib/directory-index.test.ts`
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`
- Delete: `server/lib/tree.ts`
- Delete: `server/lib/tree.test.ts`

**Interfaces:**
- Produces: `DirectoryNode` (extended), `DirectoryStat`, `ConfiguredRoot`, `buildDirectoryIndex(roots, stats)`, `getDirectoryIndex()`, `getDirectoryStats()`.
- Consumes: `appConfigStore.get()`, `mapPathToDisplay`, `normalizeDirectoryPath`.

- [ ] **Step 1: Extend the shared types — `app/lib/types.ts`**

Replace the existing `DirectoryNode` block (lines 12–16) with:

```ts
export type DirectoryNode = {
  label: string;
  path: string;
  fileCount: number;
  size: number;
  lastScannedAt?: string;
  isRoot?: boolean;
  children: DirectoryNode[];
};

export type DirectoryStat = { path: string; fileCount: number; size: number };

export type ConfiguredRoot = { path: string; lastScannedAt?: string };
```

- [ ] **Step 2: Write the failing builder tests — create `server/lib/directory-index.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildDirectoryIndex } from './directory-index';

describe('buildDirectoryIndex', () => {
  it('builds drive-rooted nodes with a C:\\ label', () => {
    const tree = buildDirectoryIndex([], [{ path: 'C:/Media/2025', fileCount: 2, size: 300 }]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ label: 'C:\\', path: 'C:', fileCount: 2, size: 300 });
    expect(tree[0].children[0]).toMatchObject({ label: 'Media', path: 'C:/Media' });
  });

  it('inserts ancestor folders and aggregates subtree totals', () => {
    const tree = buildDirectoryIndex(
      [],
      [
        { path: 'C:/Media/2025/Trips', fileCount: 2, size: 300 },
        { path: 'C:/Media/2025/Library', fileCount: 3, size: 500 },
      ],
    );
    const media2025 = tree[0].children[0].children[0];
    expect(media2025.path).toBe('C:/Media/2025');
    expect(media2025.fileCount).toBe(5);
    expect(media2025.size).toBe(800);
    expect(media2025.children.map((node) => node.label)).toEqual(['Library', 'Trips']);
  });

  it('includes an empty configured root with its last scan', () => {
    const tree = buildDirectoryIndex([{ path: 'C:/Empty', lastScannedAt: '2026-10-04T08:00:00.000Z' }], []);
    const empty = tree[0].children[0];
    expect(empty).toMatchObject({
      path: 'C:/Empty',
      isRoot: true,
      lastScannedAt: '2026-10-04T08:00:00.000Z',
      fileCount: 0,
      size: 0,
    });
  });

  it('merges configured roots with file stats at the same path', () => {
    const tree = buildDirectoryIndex(
      [{ path: 'C:/Media', lastScannedAt: '2026-10-04T08:00:00.000Z' }],
      [{ path: 'C:/Media/2025', fileCount: 4, size: 100 }],
    );
    const media = tree[0].children[0];
    expect(media).toMatchObject({ isRoot: true, fileCount: 4, size: 100 });
    expect(media.lastScannedAt).toBe('2026-10-04T08:00:00.000Z');
  });
});
```

- [ ] **Step 3: Run the builder tests to verify they fail**

Run: `pnpm exec vitest run server/lib/directory-index.test.ts`
Expected: FAIL — cannot resolve `./directory-index`.

- [ ] **Step 4: Implement the builder and wrapper — create `server/lib/directory-index.ts`**

```ts
import '@tanstack/react-start/server-only';
import type { ConfiguredRoot, DirectoryNode, DirectoryStat } from '../../app/lib/types';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import { appConfigStore } from './app-config';
import { getDirectoryStats } from './queries';

function nodeLabel(segments: string[]): string {
  if (segments.length === 1) {
    return /^[A-Za-z]:$/.test(segments[0]) ? `${segments[0]}\\` : segments[0];
  }
  return segments[segments.length - 1];
}

function ensureNode(index: Map<string, DirectoryNode>, path: string): DirectoryNode {
  const existing = index.get(path);
  if (existing) return existing;
  const segments = path.split('/');
  const node: DirectoryNode = { label: nodeLabel(segments), path, fileCount: 0, size: 0, children: [] };
  index.set(path, node);
  if (segments.length > 1) {
    ensureNode(index, segments.slice(0, -1).join('/')).children.push(node);
  }
  return node;
}

function aggregate(node: DirectoryNode): void {
  let fileCount = node.fileCount;
  let size = node.size;
  for (const child of node.children) {
    aggregate(child);
    fileCount += child.fileCount;
    size += child.size;
  }
  node.fileCount = fileCount;
  node.size = size;
}

function sortTree(nodes: DirectoryNode[]): void {
  nodes.sort((a, b) => a.label.localeCompare(b.label));
  for (const node of nodes) sortTree(node.children);
}

export function buildDirectoryIndex(roots: ConfiguredRoot[], stats: DirectoryStat[]): DirectoryNode[] {
  const index = new Map<string, DirectoryNode>();
  for (const stat of stats) {
    const path = normalizeDirectoryPath(stat.path);
    if (!path) continue;
    const node = ensureNode(index, path);
    node.fileCount += stat.fileCount;
    node.size += stat.size;
  }
  for (const root of roots) {
    const path = normalizeDirectoryPath(root.path);
    if (!path) continue;
    const node = ensureNode(index, path);
    node.isRoot = true;
    if (root.lastScannedAt) node.lastScannedAt = root.lastScannedAt;
  }
  const top = [...index.values()].filter((node) => !node.path.includes('/'));
  for (const node of top) aggregate(node);
  sortTree(top);
  return top;
}

export function getDirectoryIndex(): DirectoryNode[] {
  const config = appConfigStore.get();
  const roots: ConfiguredRoot[] = config.directories.indexed
    .filter((entry) => entry.enabled)
    .map((entry) => ({
      path: entry.path,
      lastScannedAt: config.directoryMeta[normalizeDirectoryPath(entry.path).toLowerCase()]?.lastScannedAt,
    }));
  return buildDirectoryIndex(roots, getDirectoryStats());
}
```

- [ ] **Step 5: Run the builder tests to verify they pass**

Run: `pnpm exec vitest run server/lib/directory-index.test.ts`
Expected: PASS.

- [ ] **Step 6: Add `getDirectoryStats` and remove the old tree — `server/lib/queries.ts`**

Add `DirectoryStat` to the type import from `../../app/lib/types`. Remove `DirectoryNode` from that import. Remove the `import { buildDirectoryTree } from './tree';` line. Replace the `getDirectoryTree` function with:

```ts
export function getDirectoryStats(): DirectoryStat[] {
  const db = openReadonly();
  if (!db) return [];
  try {
    const rows = db
      .prepare(`SELECT directory, COUNT(*) AS fileCount, SUM(size) AS size FROM entries GROUP BY directory`)
      .all() as { directory: string; fileCount: number; size: number }[];
    return rows.map((row) => ({
      path: mapPathToDisplay(row.directory),
      fileCount: row.fileCount,
      size: row.size,
    }));
  } finally {
    db.close();
  }
}
```

- [ ] **Step 7: Update the query tests — `server/lib/queries.test.ts`**

Replace the `getDirectoryTree` import with `getDirectoryStats`. Replace the `builds a directory tree from real directories` test with:

```ts
  it('returns one stat row per directory with counts and sizes', () => {
    const stats = getDirectoryStats();
    expect(stats.length).toBeGreaterThanOrEqual(2);
    const media = stats.find((row) => row.path === 'C:/Media/2025');
    expect(media?.fileCount).toBeGreaterThan(0);
    expect(media?.size).toBeGreaterThan(0);
  });
```

In the `returns empty shapes when the db is missing` test, replace `expect(getDirectoryTree()).toEqual([]);` with `expect(getDirectoryStats()).toEqual([]);`.

- [ ] **Step 8: Delete the old tree module**

Run:

```bash
trash server/lib/tree.ts server/lib/tree.test.ts
```

- [ ] **Step 9: Verify no references remain**

Run: `rg -n "getDirectoryTree|buildDirectoryTree" app server`
Expected: no output.

- [ ] **Step 10: Run the full check, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add app/lib/types.ts server/lib/directory-index.ts server/lib/directory-index.test.ts server/lib/queries.ts server/lib/queries.test.ts
git rm server/lib/tree.ts server/lib/tree.test.ts
git commit -m "feat: add the drive-rooted directory index"
```

---

### Task 2: Native reveal (Windows foreground) and revealFolder

**Files:**
- Modify: `server/lib/native-actions.ts`
- Modify: `server/lib/native-actions.test.ts`
- Modify: `server/routes/native.ts`

**Interfaces:**
- Produces: `buildWindowsRevealScript`, `buildRevealFolderCommand`, `revealFolder(path)` on `NativeActions`, `revealFolder` server fn; `NativeActionDeps.getConfiguredRoots`.

- [ ] **Step 1: Write the failing tests — `server/lib/native-actions.test.ts`**

Add `buildRevealFolderCommand` to the import list from `./native-actions`. Update `makeDeps` to add `getConfiguredRoots`:

```ts
function makeDeps(overrides: Partial<NativeActionDeps> = {}) {
  const spawned: NativeCommand[] = [];
  return {
    platform: 'win32',
    fileExists: () => true,
    getEntryPath: () => 'C:/Media/2025/a.jpg',
    getConfiguredRoots: () => ['C:/Media'],
    spawnDetached: (command: NativeCommand) => {
      spawned.push(command);
    },
    runAndCapture: vi.fn(async () => idle),
    spawned,
    ...overrides,
  };
}
```

Replace the `builds reveal commands per platform` test and the `sets verbatim arguments only for the Windows reveal command` test with:

```ts
  it('builds a Windows reveal as an encoded PowerShell command', () => {
    const command = buildRevealCommand('win32', 'C:\\My Photos\\a,b.jpg');
    expect(command?.command).toBe('powershell');
    expect(command?.args.slice(0, 2)).toEqual(['-NoProfile', '-EncodedCommand']);
    const script = Buffer.from(command!.args[2], 'base64').toString('utf16le');
    expect(script).toContain('Start-Process explorer');
    expect(script).toContain('/select,"');
    expect(buildRevealCommand('darwin', '/a.jpg')).toEqual({ command: 'open', args: ['-R', '/a.jpg'] });
    expect(buildRevealCommand('linux', '/dir/a.jpg')).toEqual({ command: 'xdg-open', args: ['/dir'] });
    expect(buildRevealCommand('freebsd', '/a.jpg')).toBeNull();
  });

  it('builds reveal-folder commands per platform', () => {
    const windows = buildRevealFolderCommand('win32', 'C:\\Media');
    expect(windows?.command).toBe('powershell');
    const script = Buffer.from(windows!.args[2], 'base64').toString('utf16le');
    expect(script).toContain('Start-Process explorer');
    expect(buildRevealFolderCommand('darwin', '/media')).toEqual({ command: 'open', args: ['/media'] });
    expect(buildRevealFolderCommand('linux', '/media')).toEqual({ command: 'xdg-open', args: ['/media'] });
    expect(buildRevealFolderCommand('freebsd', '/media')).toBeNull();
  });

  it('does not use verbatim arguments', () => {
    expect(detachedSpawnOptions({ command: 'explorer', args: ['x'] }).windowsVerbatimArguments).toBe(false);
  });
```

Update the `reveals a present file` test to assert the PowerShell command:

```ts
  it('reveals a present file', async () => {
    const deps = makeDeps();
    const actions = createNativeActions(deps);
    expect(await actions.reveal(1)).toEqual({ ok: true });
    expect(deps.spawned[0].command).toBe('powershell');
    expect(deps.spawned[0].args[1]).toBe('-EncodedCommand');
  });
```

Add a `describe('createNativeActions revealFolder', ...)` block:

```ts
describe('createNativeActions revealFolder', () => {
  it('rejects a folder outside the configured roots', async () => {
    const deps = makeDeps();
    const actions = createNativeActions(deps);
    expect(await actions.revealFolder('C:/Elsewhere')).toEqual({ ok: false, reason: 'not-found' });
    expect(deps.spawned).toEqual([]);
  });

  it('returns missing when the folder is absent', async () => {
    const actions = createNativeActions(makeDeps({ fileExists: () => false }));
    expect(await actions.revealFolder('C:/Media')).toEqual({ ok: false, reason: 'missing' });
  });

  it('reveals a configured folder', async () => {
    const deps = makeDeps();
    const actions = createNativeActions(deps);
    expect(await actions.revealFolder('C:/Media/2025')).toEqual({ ok: true });
    expect(deps.spawned[0].command).toBe('powershell');
  });

  it('returns unsupported on an unknown platform', async () => {
    const actions = createNativeActions(makeDeps({ platform: 'freebsd' }));
    expect(await actions.revealFolder('C:/Media')).toEqual({ ok: false, reason: 'unsupported' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run server/lib/native-actions.test.ts`
Expected: FAIL — `buildRevealFolderCommand` is not exported; `revealFolder` is not a function.

- [ ] **Step 3: Implement the commands and action — `server/lib/native-actions.ts`**

Add to the imports:

```ts
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import { appConfigStore } from './app-config';
```

Add the encoder and script builders after `buildFolderPickerCommand`:

```ts
function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

export function buildWindowsRevealScript(targetPath: string, mode: 'select' | 'open'): string {
  const literal = targetPath.replace(/'/g, "''");
  return `
$ErrorActionPreference = 'SilentlyContinue'
$target = '${literal}'
$leaf = Split-Path -Leaf $target
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class ImgSorterReveal {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static IntPtr Find(string leaf) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var cls = new StringBuilder(256);
      GetClassName(h, cls, 256);
      if (cls.ToString() != "CabinetWClass") return true;
      var title = new StringBuilder(512);
      GetWindowText(h, title, 512);
      if (title.ToString().Contains(leaf)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static void Force(IntPtr h) {
    uint p1, p2;
    var fg = GetForegroundWindow();
    uint t1 = GetWindowThreadProcessId(fg, out p1);
    uint t2 = GetWindowThreadProcessId(h, out p2);
    AttachThreadInput(t1, t2, true);
    ShowWindow(h, 9);
    SetForegroundWindow(h);
    AttachThreadInput(t1, t2, false);
  }
}
"@
if ('${mode}' -eq 'select') { Start-Process explorer -ArgumentList ('/select,"' + $target + '"') } else { Start-Process explorer -ArgumentList ('"' + $target + '"') }
Start-Sleep -Milliseconds 900
$h = [ImgSorterReveal]::Find($leaf)
if ($h -ne [IntPtr]::Zero) { [ImgSorterReveal]::Force($h) }
`;
}
```

Replace `buildRevealCommand` with:

```ts
export function buildRevealCommand(platform: Platform, filePath: string): NativeCommand | null {
  switch (platform) {
    case 'win32':
      return {
        command: 'powershell',
        args: ['-NoProfile', '-EncodedCommand', encodePowerShell(buildWindowsRevealScript(filePath, 'select'))],
      };
    case 'darwin':
      return { command: 'open', args: ['-R', filePath] };
    case 'linux':
      return { command: 'xdg-open', args: [dirname(filePath)] };
    default:
      return null;
  }
}

export function buildRevealFolderCommand(platform: Platform, folderPath: string): NativeCommand | null {
  switch (platform) {
    case 'win32':
      return {
        command: 'powershell',
        args: ['-NoProfile', '-EncodedCommand', encodePowerShell(buildWindowsRevealScript(folderPath, 'open'))],
      };
    case 'darwin':
      return { command: 'open', args: [folderPath] };
    case 'linux':
      return { command: 'xdg-open', args: [folderPath] };
    default:
      return null;
  }
}
```

Add `getConfiguredRoots` to `NativeActionDeps`:

```ts
  getConfiguredRoots: () => string[];
```

Add `revealFolder` to `NativeActions`:

```ts
  revealFolder: (path: string) => Promise<NativeActionResult>;
```

Add `getConfiguredRoots` to `defaultDeps`:

```ts
    getConfiguredRoots: () =>
      appConfigStore.get().directories.indexed.filter((entry) => entry.enabled).map((entry) => entry.path),
```

Add the action inside `createNativeActions`, after `runAction`:

```ts
  const isWithinRoots = (path: string): boolean => {
    const target = normalizeDirectoryPath(path).toLowerCase();
    return deps.getConfiguredRoots().some((root) => {
      const scope = normalizeDirectoryPath(root).toLowerCase();
      return target === scope || target.startsWith(`${scope}/`);
    });
  };

  const revealFolder = async (path: string): Promise<NativeActionResult> => {
    try {
      if (!isWithinRoots(path)) return { ok: false, reason: 'not-found' };
      const realPath = path.startsWith('@fixtures') ? virtualToReal(path) : path;
      if (!deps.fileExists(realPath)) return { ok: false, reason: 'missing' };
      const command = buildRevealFolderCommand(deps.platform, realPath);
      if (!command) return { ok: false, reason: 'unsupported' };
      deps.spawnDetached(command);
      return { ok: true };
    } catch (error) {
      console.error('Reveal folder failed', error);
      return { ok: false, reason: 'error' };
    }
  };
```

Add `revealFolder` to the returned object:

```ts
    reveal: (id) => runAction(id, 'reveal'),
    open: (id) => runAction(id, 'open'),
    revealFolder,
    pickDirectory,
```

- [ ] **Step 4: Add the server function — `server/routes/native.ts`**

Append:

```ts
export const revealFolder = createServerFn({ method: 'POST' })
  .validator((input: { path: string }) => input)
  .handler(async ({ data }) => {
    const { nativeActions } = await import('../lib/native-actions');
    return nativeActions.revealFolder(data.path);
  });
```

- [ ] **Step 5: Run the native tests to verify they pass**

Run: `pnpm exec vitest run server/lib/native-actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full check, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add server/lib/native-actions.ts server/lib/native-actions.test.ts server/routes/native.ts
git commit -m "feat: bring the revealed window to the front"
```

---

### Task 3: Directories page, route, and sidebar item

**Files:**
- Create: `server/routes/directories.ts`
- Create: `app/routes/directories.tsx`
- Create: `app/features/directories/DirectoriesPage.tsx`
- Create: `app/features/directories/DirectoryTreeTable.tsx`
- Create: `app/features/directories/DirectoriesPage.test.tsx`
- Modify: `app/components/common/Sidebar.tsx`

**Interfaces:**
- Consumes: `DirectoryNode`, `getDirectoryIndex` (Task 1); `revealFolder` server fn (Task 2).
- Produces: `getDirectoriesData()`, `/directories` route, `DirectoriesPage`, `DirectoryTreeTable`.

- [ ] **Step 1: Add the server function — create `server/routes/directories.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';

export const getDirectoriesData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getDirectoryIndex } = await import('../lib/directory-index');
  return { tree: getDirectoryIndex() };
});
```

- [ ] **Step 2: Add the route — create `app/routes/directories.tsx`**

```tsx
import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { DirectoriesPage } from '../features/directories/DirectoriesPage';
import { getDirectoriesData } from '../../server/routes/directories';

export const Route = createFileRoute('/directories')({
  loader: async () => getDirectoriesData(),
  component: DirectoriesRoute,
});

function DirectoriesRoute() {
  const { tree } = useLoaderData({ from: '/directories' });
  return <DirectoriesPage tree={tree} />;
}
```

- [ ] **Step 3: Add the page — create `app/features/directories/DirectoriesPage.tsx`**

```tsx
import { PageHeading } from '../../components/common/PageHeading';
import { DirectoryTreeTable } from './DirectoryTreeTable';
import type { DirectoryNode } from '../../lib/types';

export function DirectoriesPage({ tree }: { tree: DirectoryNode[] }) {
  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Directories"
        subtitle="Every indexed folder and subfolder in your library."
      />
      <DirectoryTreeTable tree={tree} />
    </>
  );
}
```

- [ ] **Step 4: Add the tree table — create `app/features/directories/DirectoryTreeTable.tsx`**

```tsx
import { useState, type ReactElement } from 'react';
import { ActionIcon, Button, Group, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ChevronDown, ChevronRight, Copy, FolderOpen, ListFilter } from 'lucide-react';
import { useRouter } from '@tanstack/react-router';
import { formatBytes, formatRelativeTime } from '../../lib/format';
import { revealFolder } from '../../../server/routes/native';
import type { DirectoryNode, NativeActionFailure } from '../../lib/types';

const FAILURE_MESSAGES: Record<NativeActionFailure, string> = {
  'not-found': 'Folder not found.',
  missing: 'Folder not found.',
  unsupported: 'This action is not supported here.',
  error: 'The action failed.',
};

export function DirectoryTreeTable({ tree }: { tree: DirectoryNode[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const node of tree) initial[node.path] = true;
    return initial;
  });

  const reveal = (path: string) => {
    void revealFolder({ data: { path } })
      .then((result) => {
        if (result.ok) notifications.show({ color: 'cyan', message: 'Folder shown in the file manager.' });
        else notifications.show({ color: 'red', message: FAILURE_MESSAGES[result.reason] });
      })
      .catch(() => notifications.show({ color: 'red', message: 'The action failed.' }));
  };

  const filterBrowse = (path: string) => {
    void router.navigate({ to: '/browse', search: { selectedDirs: [path] } });
  };

  const copyPath = (path: string) => {
    void navigator.clipboard
      .writeText(path)
      .then(() => notifications.show({ color: 'cyan', message: 'Path copied.' }))
      .catch(() => notifications.show({ color: 'red', message: 'Could not copy the path.' }));
  };

  const rows: ReactElement[] = [];
  const render = (node: DirectoryNode, depth: number): void => {
    const hasChildren = node.children.length > 0;
    const isOpen = open[node.path] ?? false;
    rows.push(
      <Table.Tr key={node.path}>
        <Table.Td>
          <Group gap="xs" style={{ paddingLeft: depth * 16 }}>
            {hasChildren ? (
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.label}`}
                onClick={() => setOpen((state) => ({ ...state, [node.path]: !isOpen }))}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </ActionIcon>
            ) : (
              <span className="directory-spacer" />
            )}
            <FolderOpen size={15} />
            <Text size="sm">{node.label}</Text>
          </Group>
        </Table.Td>
        <Table.Td>{node.fileCount.toLocaleString('en-US')}</Table.Td>
        <Table.Td>{formatBytes(node.size)}</Table.Td>
        <Table.Td>{node.isRoot && node.lastScannedAt ? formatRelativeTime(node.lastScannedAt) : ''}</Table.Td>
        <Table.Td>
          <Group gap={4} justify="flex-end">
            <Button variant="subtle" size="xs" leftSection={<FolderOpen size={13} />} onClick={() => reveal(node.path)}>
              Reveal
            </Button>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<ListFilter size={13} />}
              onClick={() => filterBrowse(node.path)}
            >
              Filter
            </Button>
            <Button variant="subtle" size="xs" leftSection={<Copy size={13} />} onClick={() => copyPath(node.path)}>
              Copy path
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>,
    );
    if (hasChildren && isOpen) for (const child of node.children) render(child, depth + 1);
  };
  for (const node of tree) render(node, 0);

  if (tree.length === 0) return <Text c="dimmed">No directories indexed yet.</Text>;

  return (
    <Table className="directories-table">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Folder</Table.Th>
          <Table.Th>Files</Table.Th>
          <Table.Th>Size</Table.Th>
          <Table.Th>Last scan</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>{rows}</Table.Tbody>
    </Table>
  );
}
```

- [ ] **Step 5: Add the sidebar item — `app/components/common/Sidebar.tsx`**

Add `FolderTree` to the `lucide-react` import. Add the item after Browse in `navItems`:

```ts
  { label: 'Directories', to: '/directories', icon: FolderTree },
```

- [ ] **Step 6: Write the page test — create `app/features/directories/DirectoriesPage.test.tsx`**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { DirectoryNode } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  revealFolder: vi.fn(),
  navigate: vi.fn(),
  notifyShow: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('../../../server/routes/native', () => ({ revealFolder: mocks.revealFolder }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: mocks.notifyShow } }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useRouter: () => ({ navigate: mocks.navigate }) };
});

import { DirectoriesPage } from './DirectoriesPage';

const tree: DirectoryNode[] = [
  {
    label: 'C:\\',
    path: 'C:',
    fileCount: 7,
    size: 7_000,
    children: [
      {
        label: 'Media',
        path: 'C:/Media',
        fileCount: 7,
        size: 7_000,
        isRoot: true,
        lastScannedAt: '2026-10-04T08:00:00.000Z',
        children: [{ label: '2025', path: 'C:/Media/2025', fileCount: 7, size: 7_000, children: [] }],
      },
    ],
  },
];

function renderPage() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <DirectoriesPage tree={tree} />
    </MantineProvider>,
  );
}

describe('DirectoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revealFolder.mockResolvedValue({ ok: true });
    mocks.writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: mocks.writeText }, configurable: true });
  });

  it('renders drive, folder, and count rows', () => {
    renderPage();
    expect(screen.getByText('C:\\')).toBeInTheDocument();
    expect(screen.getByText('Media')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
  });

  it('reveals a folder', async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Reveal' })[0]);
    await waitFor(() => expect(mocks.revealFolder).toHaveBeenCalledWith({ data: { path: 'C:' } }));
  });

  it('filters Browse by a folder', () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Filter' })[0]);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/browse', search: { selectedDirs: ['C:'] } });
  });

  it('copies a path', async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy path' })[0]);
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith('C:'));
  });
});
```

- [ ] **Step 7: Run the page test to verify it passes**

Run: `pnpm exec vitest run app/features/directories/DirectoriesPage.test.tsx`
Expected: PASS.

- [ ] **Step 8: Run the full check, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add server/routes/directories.ts app/routes/directories.tsx app/features/directories app/components/common/Sidebar.tsx app/routeTree.gen.ts
git commit -m "feat: add the Directories page"
```

---

### Task 4: Drive-rooted Browse tree, remove the dead button

**Files:**
- Modify: `server/routes/browse.ts`
- Modify: `app/components/common/DirectoryTree.tsx`
- Create: `app/components/common/DirectoryTree.test.tsx`
- Modify: `app/features/browse/BrowsePage.test.tsx`

**Interfaces:**
- Consumes: `getDirectoryIndex` (Task 1), `DirectoryNode` (Task 1).

- [ ] **Step 1: Use the index in Browse — `server/routes/browse.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';
import type { FilesInput } from '../../app/lib/types';

export const getBrowseData = createServerFn({ method: 'POST' })
  .validator((input: FilesInput) => input)
  .handler(async ({ data }) => {
    const { listEntries } = await import('../lib/queries');
    const { getDirectoryIndex } = await import('../lib/directory-index');
    return { files: listEntries(data), tree: getDirectoryIndex() };
  });
```

- [ ] **Step 2: Replace the tree component — `app/components/common/DirectoryTree.tsx`**

```tsx
import { useState, type ReactElement } from 'react';
import { Checkbox, Text } from '@mantine/core';
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import type { DirectoryNode } from '../../lib/types';
import { useApp } from '../../lib/app-context';

export function DirectoryTree({ tree }: { tree: DirectoryNode[] }) {
  const { selectedDirs, toggleSelectedDir } = useApp();
  const [nodeOpen, setNodeOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const node of tree) initial[node.path] = true;
    return initial;
  });

  const render = (node: DirectoryNode, depth: number): ReactElement => {
    const hasChildren = node.children.length > 0;
    const isOpen = nodeOpen[node.path] ?? false;
    return (
      <div key={node.path}>
        <div className="directory-node" style={{ paddingLeft: depth * 14 }}>
          <button
            className="directory-expand"
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.label}`}
            onClick={() => hasChildren && setNodeOpen((state) => ({ ...state, [node.path]: !isOpen }))}
          >
            {hasChildren ? (
              isOpen ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )
            ) : (
              <span className="directory-spacer" />
            )}
          </button>
          <Checkbox
            checked={selectedDirs.includes(node.path)}
            onChange={() => toggleSelectedDir(node.path)}
            aria-label={`Filter ${node.label}`}
          />
          <FolderOpen size={14} />
          <Text size="xs">{node.label}</Text>
        </div>
        {hasChildren && isOpen && node.children.map((child) => render(child, depth + 1))}
      </div>
    );
  };

  return (
    <aside className="browse-directory-filter">
      <Text className="eyebrow" mb="sm">
        DIRECTORY FILTER
      </Text>
      {tree.map((node) => render(node, 0))}
    </aside>
  );
}
```

- [ ] **Step 3: Write the tree test — create `app/components/common/DirectoryTree.test.tsx`**

```tsx
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider } from '../../lib/app-context';
import { DirectoryTree } from './DirectoryTree';
import type { DirectoryNode } from '../../lib/types';

const tree: DirectoryNode[] = [
  {
    label: 'C:\\',
    path: 'C:',
    fileCount: 1,
    size: 10,
    children: [{ label: 'Media', path: 'C:/Media', fileCount: 1, size: 10, children: [] }],
  },
];

function renderTree() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <AppProvider>
        <DirectoryTree tree={tree} />
      </AppProvider>
    </MantineProvider>,
  );
}

describe('DirectoryTree', () => {
  it('renders drive-rooted nodes and has no collapse button', () => {
    renderTree();
    expect(screen.getByText('C:\\')).toBeInTheDocument();
    expect(screen.getByText('Media')).toBeInTheDocument();
    expect(screen.queryByLabelText('Collapse directory filter')).not.toBeInTheDocument();
  });

  it('toggles a directory into the filter', () => {
    renderTree();
    fireEvent.click(screen.getByLabelText('Filter C:\\'));
    expect(screen.getByLabelText('Filter C:\\')).toBeChecked();
  });
});
```

- [ ] **Step 4: Update the Browse test fixture — `app/features/browse/BrowsePage.test.tsx`**

Replace the `tree` constant with:

```tsx
const tree: DirectoryNode[] = [
  {
    label: 'C:\\',
    path: 'C:',
    fileCount: 2,
    size: 12_800,
    children: [{ label: 'Media', path: 'C:/Media', fileCount: 2, size: 12_800, children: [] }],
  },
];
```

- [ ] **Step 5: Run the tree and Browse tests to verify they pass**

Run: `pnpm exec vitest run app/components/common/DirectoryTree.test.tsx app/features/browse/BrowsePage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full check, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add server/routes/browse.ts app/components/common/DirectoryTree.tsx app/components/common/DirectoryTree.test.tsx app/features/browse/BrowsePage.test.tsx
git commit -m "feat: make the Browse directory filter drive-rooted"
```

---

### Task 5: Final verification and docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Run the full check**

Run: `pnpm check`
Expected: `generate-routes`, typecheck, lint, tests, and format all pass.

- [ ] **Step 2: Production build + client safety**

Run: `pnpm build`
Expected: build succeeds.

Run: `rg -l "better-sqlite3|sqlite" dist/client`
Expected: no output.

- [ ] **Step 3: Manual smoke**

Run `pnpm dev`. Open **Directories**; expand a drive to a subfolder; click **Reveal** and confirm the Explorer window comes to the front with the folder open. Click **Filter** and confirm Browse opens with that folder selected. Click **Copy path** and confirm the toast. Confirm Browse shows `C:\` / `D:\` roots and has no collapse button. In the file drawer, click **Reveal** and confirm Explorer comes to the front with the file selected.

- [ ] **Step 4: Record the phase in `docs/ROADMAP.md`**

Add a row to the phase table:

```
| 6 | Indexed directory tree page + drive-rooted Browse filter + native Reveal foreground fix | Directories page + working Reveal | `[x]` |
```

Add a bullet under the phase table:

```
- **6 — Library directories + native reveal:** a drive-rooted, index-derived
  **Directories** page with per-folder subtree counts and actions (Reveal /
  Filter Browse / Copy path); Browse's filter tree becomes drive-rooted and
  loses its dead collapse button; Windows **Reveal** forces the file-manager
  window to the front. Spec:
  [2026-10-04-phase6-directories-reveal-design.md](superpowers/specs/2026-10-04-phase6-directories-reveal-design.md).
```

- [ ] **Step 5: Record the phase in `AGENTS.md`**

Add a bullet under "Current Plan State" after the Phase 5 bullet:

```
- Phase 6 (library directories + native reveal) — **complete**: a drive-rooted,
  index-derived Directories page with subtree counts and Reveal / Filter Browse /
  Copy path actions; Browse's directory filter is drive-rooted and its dead
  collapse button is removed; Windows Reveal forces the file-manager window to
  the front. Spec at
  `docs/superpowers/specs/2026-10-04-phase6-directories-reveal-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-phase6-directories-reveal.md`.
```

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md docs/ROADMAP.md
git commit -m "docs: record Phase 6 complete"
```

## Self-Review Checklist

1. **Spec coverage:**
   - `DirectoryNode`/`DirectoryStat`/`ConfiguredRoot` types → Task 1 Step 1.
   - `buildDirectoryIndex` + `getDirectoryIndex` + `getDirectoryStats` → Task 1.
   - Remove `tree.ts` → Task 1 Step 8.
   - Windows foreground reveal + `revealFolder` + validation + server fn → Task 2.
   - Directories page/route/table/sidebar → Task 3.
   - Browse drive-rooted + dead button removal → Task 4.
   - Docs → Task 5.
2. **Placeholder scan:** every step has full code or an exact command; no TBD/TODO.
3. **Type consistency:** `DirectoryNode` fields (`fileCount`, `size`, `lastScannedAt`, `isRoot`, `children`) are identical across the type, builder, tests, and UI; `buildDirectoryIndex(roots, stats)` signature matches callers; `revealFolder(path)` name matches between `NativeActions`, the server fn, and the page; `getConfiguredRoots` is in `NativeActionDeps` and `makeDeps`; `getDirectoryStats` is imported from `queries` and `getDirectoryIndex` from `directory-index`.
4. **Ordering:** Task 3 imports `revealFolder` from `server/routes/native`, which Task 2 adds. Task order is 1 → 2 → 3 → 4 → 5.
