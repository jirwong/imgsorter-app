# imgsorter-app — Phase 6 Design: Library Directories + Native Reveal

**Date:** 2026-10-04
**Status:** Draft for review
**Scope:** Phase 6 — add a dedicated **Directories** page that shows the indexed
folder tree (drives, folders, subfolders) with per-folder counts and actions;
make Browse's directory filter drive-rooted and remove its dead collapse button;
and fix **Reveal** so the OS file-manager window comes to the front.

## 1. Context

Three problems and one request drive this phase.

**Directories view.** Today the only folder hierarchy is Browse's left filter.
It is built from `entries.directory` only (`server/lib/tree.ts`), so it shows
folders that directly contain files, and its top nodes are relabelled by
`TOP_LABELS` ("Media (C:)", "Camera Imports (D:)", "Archive (Z:)"). There is no
place to see the full indexed directory tree, and no drive nodes.

**Browse filter.** The user wants Browse to show drives (`C:\`, `D:\`, …). The
`ChevronsUpDown` button next to "DIRECTORY FILTER"
(`app/components/common/DirectoryTree.tsx:45`) has no `onClick`; it is an
unfinished control. The user chose to remove it.

**Reveal.** The drawer's Reveal works at the server level: it opens the folder
and selects the file (verified live: `SelectedCount: 1, Selected: BIrth
Certificate.jpg`). But the Explorer window opens **behind** and never activates.
Windows foreground-lock blocks a background server process from stealing focus,
and each click stacks a new window. The user sees a green toast and nothing
opens.

## 2. Goals

- A **Directories** page that lists all indexed directories, including
  subfolders, as a drive-rooted, expandable tree table.
- Each row shows subtree file count and size; configured roots show last scan.
- Each row offers **Reveal folder**, **Filter Browse**, and **Copy path**.
- Browse's filter tree becomes drive-rooted and includes all indexed folders.
- The dead collapse button is removed.
- **Reveal** opens, selects, and brings the OS file-manager window to the front
  on Windows; macOS/Linux behaviour is unchanged.

## 3. Non-goals

- No live filesystem walk; the tree comes from the index DB plus configured
  roots.
- No add/remove/edit of directories on the new page; Preferences stays the
  manager.
- No sorting or text search on the tree table (a later phase can add it).
- No change to **Open file**.
- No change to the scan, engine, or DB schema.

## 4. Technology

Unchanged: TanStack Start (`createServerFn`, route loaders), React 19, Mantine
v9, `@mantine/notifications`, `better-sqlite3` (server-only), Vitest (client
jsdom / server node), TypeScript strict. No new dependency.

## 5. Project structure (new/changed)

```
app/
  lib/
    types.ts                              # DirectoryNode gains fields
  components/common/
    DirectoryTree.tsx                     # drive-rooted; dead button removed
    DirectoryTree.test.tsx                # NEW
  features/directories/
    DirectoriesPage.tsx                   # NEW
    DirectoriesPage.test.tsx              # NEW
    DirectoryTreeTable.tsx                # NEW
  features/browse/
    BrowsePage.tsx                        # unchanged shape (tree prop)
    BrowsePage.test.tsx                   # drive-rooted fixture
  routes/
    directories.tsx                       # NEW
  components/common/Sidebar.tsx           # + Directories item
server/
  lib/
    directory-index.ts                    # NEW: pure builder + getDirectoryIndex
    directory-index.test.ts               # NEW
    queries.ts                            # + getDirectoryStats()
    queries.test.ts                       # update tree assertions
    tree.ts                               # DELETE
    tree.test.ts                          # DELETE
    native-actions.ts                     # Windows foreground reveal + revealFolder
    native-actions.test.ts                # update
  routes/
    browse.ts                             # tree from getDirectoryIndex
    directories.ts                        # NEW: getDirectoriesData
    native.ts                             # + revealFolder server fn
```

## 6. Data model

### 6.1 `app/lib/types.ts`

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

`children` becomes required (empty array for leaves). The `TOP_LABELS`
relabelling is dropped.

### 6.2 Paths

All paths are display paths (`mapPathToDisplay`), already used across the app.
A path splits into segments on `/`; the first segment is the drive (`C:`). The
drive node label is `C:\`; deeper nodes use the segment name.

## 7. Directory index (`server/lib/directory-index.ts`)

`import '@tanstack/react-start/server-only';`

### 7.1 Pure builder

```ts
export function buildDirectoryIndex(roots: ConfiguredRoot[], stats: DirectoryStat[]): DirectoryNode[];
```

1. Create a node for every ancestor of every stat path and every root path.
   A node's `path` is the joined segments; `label` is the last segment, except a
   drive root which is `C:\`.
2. Accumulate each stat's `fileCount` and `size` as **direct** values on its
   leaf node.
3. Mark each configured root: `isRoot = true`, `lastScannedAt`.
4. Post-order aggregate: `fileCount` and `size` become direct + children totals.
5. Sort children by `label`; sort top-level roots by `path`.

A configured root with no files still creates its node chain, so empty roots
appear with their last-scan time.

### 7.2 Server wrapper

```ts
export function getDirectoryIndex(): DirectoryNode[];
```

- Roots: `appConfigStore.get().directories.indexed.filter((d) => d.enabled)`,
  mapped to display paths, with `lastScannedAt` from
  `directoryMeta[normalizeDirectoryPath(path).toLowerCase()]`.
- Stats: `getDirectoryStats()`.
- Returns `buildDirectoryIndex(roots, stats)`.

### 7.3 `server/lib/queries.ts`

Add:

```ts
export function getDirectoryStats(): DirectoryStat[] {
  // SELECT directory, COUNT(*) AS fileCount, SUM(size) AS size FROM entries GROUP BY directory
  // map each directory through mapPathToDisplay
}
```

`getDirectoryTree` and `buildDirectoryTree` are removed.

## 8. Server routes

### 8.1 `server/routes/browse.ts`

```ts
export const getBrowseData = createServerFn({ method: 'POST' })
  .validator((input: FilesInput) => input)
  .handler(async ({ data }) => {
    const { listEntries } = await import('../lib/queries');
    const { getDirectoryIndex } = await import('../lib/directory-index');
    return { files: listEntries(data), tree: getDirectoryIndex() };
  });
```

### 8.2 `server/routes/directories.ts` (new)

```ts
export const getDirectoriesData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getDirectoryIndex } = await import('../lib/directory-index');
  return { tree: getDirectoryIndex() };
});
```

## 9. Client

### 9.1 `app/routes/directories.tsx` (new)

```tsx
export const Route = createFileRoute('/directories')({
  loader: async () => getDirectoriesData(),
  component: DirectoriesRoute,
});
```

Passes `tree` to `DirectoriesPage`.

### 9.2 `DirectoriesPage.tsx` (new)

- Heading: eyebrow "LIBRARY OVERVIEW", title "Directories", subtitle about
  indexed folders.
- Renders `DirectoryTreeTable` with the tree.

### 9.3 `DirectoryTreeTable.tsx` (new)

- Expandable rows (drive → folder → subfolder), same chevron pattern as
  `DirectoryTree`.
- Columns: **Folder**, **Files**, **Size**, **Last scan**, **Actions**.
- `Files` and `Size` show subtree totals (`formatBytes` for size).
- `Last scan` shows `formatRelativeTime(lastScannedAt)` for root rows, blank
  otherwise.
- Actions per row:
  - **Reveal folder** → `revealFolder({ data: { path } })`; cyan toast on
    success, red toast on failure (reuse the drawer's failure messages).
  - **Filter Browse** → `router.navigate({ to: '/browse', search: { selectedDirs: [path] } })`.
  - **Copy path** → `navigator.clipboard.writeText(path)` then a cyan toast.
- Empty tree shows a short "No directories indexed yet." message.

### 9.4 `DirectoryTree.tsx` (Browse filter)

- Remove the `ChevronsUpDown` button and its `Group` wrapper stays for the
  eyebrow only.
- Render drive-rooted nodes from `DirectoryNode[]`; checkboxes still toggle
  `selectedDirs`.
- Default-open drives that have children.

### 9.5 `Sidebar.tsx`

Add `{ label: 'Directories', to: '/directories', icon: FolderTree }` after
Browse.

## 10. Native reveal (`server/lib/native-actions.ts`)

### 10.1 Windows foreground fix

Replace the Windows reveal command with a PowerShell call that opens/selects and
then forces the window to the front. Use `-EncodedCommand` (base64 UTF-16LE) to
avoid quoting problems.

`buildWindowsRevealScript(targetPath, mode)` returns a script that:

1. `Start-Process explorer -ArgumentList '<args>'` where args are
   `/select,"<file>"` for `mode = 'select'` and `"<folder>"` for `mode = 'open'`.
2. Sleeps briefly.
3. Finds the top-level window of class `CabinetWClass` whose title contains the
   target's leaf name.
4. Forces it forward with `ShowWindow(SW_RESTORE)` +
   `AttachThreadInput(fgThread, targetThread, true)` + `SetForegroundWindow` +
   `AttachThreadInput(..., false)`.

`buildRevealCommand('win32', path)` returns
`{ command: 'powershell', args: ['-NoProfile', '-EncodedCommand', encoded] }`.
This applies to the existing file Reveal and to folder Reveal.

macOS keeps `open -R <file>` / `open <folder>`; Linux keeps `xdg-open`.
`buildOpenCommand` is unchanged.

### 10.2 Folder reveal action

Add to `NativeActions`:

```ts
revealFolder: (path: string) => Promise<NativeActionResult>;
```

- Validate the path is inside a configured root (case-insensitive prefix after
  normalisation). If not, return `{ ok: false, reason: 'not-found' }`.
- Check `fileExists(path)`; return `{ ok: false, reason: 'missing' }` if absent.
- Build the command with `mode = 'open'`; return `{ ok: false, reason:
  'unsupported' }` on an unknown platform.
- `NativeActionDeps` gains `getConfiguredRoots: () => string[]`.

### 10.3 `server/routes/native.ts`

Add:

```ts
export const revealFolder = createServerFn({ method: 'POST' })
  .validator((input: { path: string }) => input)
  .handler(async ({ data }) => {
    const { nativeActions } = await import('../lib/native-actions');
    return nativeActions.revealFolder(data.path);
  });
```

## 11. Lifecycle / data flow

1. Open `/directories` or `/browse` → loader calls `getDirectoryIndex`.
2. The server merges configured roots (with last scan) and indexed directory
   stats into a drive-rooted tree with subtree totals.
3. The page renders the tree; expanding a node reveals children already in the
   payload.
4. Reveal folder → `revealFolder` → PowerShell opens/selects and forces the
   Explorer window forward.
5. Filter Browse → navigation to `/browse` with `selectedDirs`, which the
   existing filter pipeline applies (folder and subtree).
6. Copy path → clipboard write plus toast.

## 12. Testing & verification

- **`server/lib/directory-index.test.ts` (pure):**
  - builds drives as top-level nodes with label `C:\`;
  - inserts ancestor folders for deep stats;
  - aggregates subtree `fileCount`/`size` correctly;
  - includes a configured root with zero files, marked `isRoot` with
    `lastScannedAt`;
  - sorts children by label.
- **`server/lib/queries.test.ts`:** `getDirectoryStats` returns one row per
  directory with counts and sizes; update the old tree assertions.
- **`server/lib/native-actions.test.ts`:** Windows reveal builds a `powershell`
  `-EncodedCommand`; macOS/Linux reveal commands unchanged; `revealFolder`
  rejects a path outside the configured roots, rejects a missing folder, and
  builds the command for a valid folder; unsupported platform returns
  `unsupported`.
- **`app/features/directories/DirectoriesPage.test.tsx`:** renders drive and
  folder rows with counts; Reveal folder calls `revealFolder`; Filter Browse
  navigates with `selectedDirs`; Copy path writes to the clipboard.
- **`app/components/common/DirectoryTree.test.tsx`:** renders drive roots;
  checking a node calls `toggleSelectedDir`; no collapse button exists.
- **`app/features/browse/BrowsePage.test.tsx`:** update the tree fixture to the
  new shape.
- **Gates:** `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`;
  `pnpm build`. Confirm no `better-sqlite3`/`sqlite` in `dist/client`.
- **Manual smoke:** open Directories, expand to a subfolder, Reveal it (Explorer
  comes to the front and the folder opens), Filter Browse, Copy path. Confirm
  Browse shows `C:\` / `D:\` roots and the dead button is gone.

## 13. Task outline (detailed via writing-plans)

1. **Directory index:** types; `buildDirectoryIndex` + tests; `getDirectoryStats`;
   `getDirectoryIndex`; remove `tree.ts`.
2. **Directories page:** `getDirectoriesData`, `/directories` route,
   `DirectoriesPage`, `DirectoryTreeTable`, Sidebar item, tests.
3. **Browse tree:** drive-rooted `DirectoryTree`, remove dead button, update
   Browse test.
4. **Native reveal:** Windows foreground script for file Reveal; `revealFolder`
   action + validation + server fn + tests.
5. **Final verification + docs:** full gates, build, manual smoke; update
   `AGENTS.md` and `ROADMAP.md`.

## 14. Trade-offs & follow-ups

- The Windows foreground fix uses a PowerShell `-EncodedCommand` with a small
  C# `Add-Type`. It is heavier than a plain `explorer` spawn but it is the only
  reliable way to activate the window from a background server process. It is
  Windows-only; macOS/Linux stay simple.
- The tree is index-derived, so folders that contain no files appear only if
  they are configured roots. A later phase could walk the filesystem.
- The page is read-only; directory management stays in Preferences.
- The tree table has no sort/search yet.
