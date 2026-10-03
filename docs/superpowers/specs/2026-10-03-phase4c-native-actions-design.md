# imgsorter-app — Phase 4c Design: Native OS Actions (Reveal / Open) + Server-Side Folder Picker

**Date:** 2026-10-03
**Status:** Draft for review
**Scope:** Phase 4c only — make the `FilePreviewDrawer` **Reveal** and **Open file** buttons
real, and add a server-side native **folder picker** ("Browse…") to the Preferences
add-directory inputs. Keeper persistence (4d) is out of scope.

## 1. Context & source material

Phase 3b/4a/4b built a real scan and persisted Preferences. Two UI affordances are still
inert:

- `app/components/common/FilePreviewDrawer.tsx` renders **Reveal** and **Open file** buttons
  with **no handlers**. They only draw.
- `app/features/preferences/PreferencesPage.tsx` has two manual text inputs for adding
  directories. The user must type an absolute path by hand. There is no folder browser.

**Constraints found while exploring:**

- The drawer reads `selectedFile` (`Entry`) from `app/lib/app-context.tsx`. `Entry.id` is the
  app-DB row id. `Entry.path` is the **display** path: `server/lib/queries.ts` `toEntry` maps
  `@fixtures/...` to synthetic labels such as `C:/Media/2025/...`. The display path is not the
  true on-disk path when the source is the fixture DB.
- The app DB (`server/data/imgsorter.db`) holds **real** scan paths. The committed
  `fixture.db` holds `@fixtures/...` paths and is used by tests. Tests set
  `IMGSORTER_DB_PATH` to `fixture.db` (`vitest.config.ts`).
- The server is a local Node process launched by TanStack Start. It can start OS programs and
  show dialogs in the user's desktop session. It is not a remote server.
- There is **no toast system**. `@mantine/core` and `@mantine/hooks` are installed;
  `@mantine/notifications` is not.
- Existing server patterns: `server/routes/*.ts` use `createServerFn` with a **dynamic import**
  of the server-only library inside the handler (`server/routes/files.ts`). This keeps
  `better-sqlite3` out of the client bundle.
- Existing injectable-factory pattern: `server/lib/scan.ts` exports a factory plus a singleton.
  Tests inject fakes (`server/lib/scan.test.ts`).

**Decisions made during brainstorming:**

- **Resolve actions by entry `id` server-side.** The client sends only the row id. The server
  looks up the true path. This is the path-safety gate.
- **Always give feedback.** Reveal/Open show a success **and** error toast. This needs a toast
  system.
- **Add `@mantine/notifications`** (same v9 line) as the toast system.
- **"Browse…" on both add-directory inputs** (indexed and ignored). The picked path only fills
  the matching text input. The user still clicks "Add directory".
- **Implement Windows, macOS, and Linux.** A missing tool returns a clear *unsupported* result
  instead of failing silently.
- **Blocking dialog timeout is 5 minutes.** User cancel is a normal *canceled* result with no
  toast.
- **A missing file never starts an OS command.** It returns an error and shows a toast.

## 2. Goals

- The drawer's **Reveal** button opens the OS file manager with the file selected.
- The drawer's **Open file** button launches the file with the OS default application.
- The Preferences **Browse…** button opens the OS folder dialog from the local server and
  returns the picked absolute path into the text input.
- All OS actions are limited to paths that exist in the app database. The client cannot ask
  the server to act on an arbitrary path.
- Errors are visible to the user and never crash the server.
- Keep `better-sqlite3` and all OS code server-only.

## 3. Non-goals (Phase 4c)

- No keeper persistence (4d).
- No file operations that move, rename, copy, or delete files.
- No remote, network, UNC, or WSL-specific path handling.
- No in-app directory tree picker.
- No change to the scan, to `app_config`, or to the fixture seed.
- No toast for the picker's *canceled* result. Canceling is not an error.

## 4. Technology

Unchanged: TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9,
`better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict.
Added: `@mantine/notifications` (v9). OS work uses Node `node:child_process` only — no new
runtime dependency.

## 5. Project structure (new/changed)

```
server/
  lib/
    native-actions.ts          # NEW: platform command builders, spawn seam, picker guard
    native-actions.test.ts     # NEW: node tests
    queries.ts                 # + getEntryPathById(id)
    queries.test.ts            # + getEntryPathById cases
  routes/
    native.ts                  # NEW: revealEntry / openEntry / pickDirectory
app/
  lib/
    types.ts                   # + NativeActionResult / FolderPickResult
  components/common/
    FilePreviewDrawer.tsx      # wired buttons + busy state + toasts
    FilePreviewDrawer.test.tsx # + button cases
  features/preferences/
    PreferencesPage.tsx        # + two "Browse…" buttons
    PreferencesPage.test.tsx   # + browse cases
  routes/
    __root.tsx                 # + Notifications provider + styles.css
package.json                   # + @mantine/notifications
```

## 6. Data model & shared types

### 6.1 `app/lib/types.ts` additions

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

These types are client-safe. Importing them does not pull in any server code.

### 6.2 Path resolution (`server/lib/queries.ts`)

- `getEntryPathById(id: number): string | null` — read-only open. Runs
  `SELECT path FROM entries WHERE id = ?`. Returns the **raw** stored path, or `null` when the
  DB is missing or no row matches. The raw path is the true DB value, not the display-mapped
  value from `toEntry`.
- The native layer converts a raw path that starts with `@fixtures` to a real path with the
  existing `virtualToReal()` (`server/lib/db-path.ts`). Real paths pass through unchanged.

## 7. Server: native-actions module

### 7.1 `server/lib/native-actions.ts`

`import '@tanstack/react-start/server-only';`

The module is built from small, testable pieces:

- **Platform type:** `type Platform = 'win32' | 'darwin' | 'linux' | string`.
- **Command shape:** `type NativeCommand = { command: string; args: string[] }`.
- **Pure builders** (no side effects, return `null` for an unknown platform):
  - `buildRevealCommand(platform: Platform, filePath: string): NativeCommand | null`
  - `buildOpenCommand(platform: Platform, filePath: string): NativeCommand | null`
  - `buildFolderPickerCommand(platform: Platform): NativeCommand | null`
- **Exist check:** `fileExists(filePath: string): boolean` — `node:fs` `existsSync`, injectable.
- **Runner seams** (both use `child_process.spawn` with an **argument list, no shell**):
  - `spawnDetached(command: NativeCommand): void` — starts the process, does not wait, and
    detaches it. Used by Reveal/Open.
  - `runAndCapture(command: NativeCommand, options: { timeoutMs: number }): Promise<{ code:
    number | null; stdout: string; stderr: string; spawnFailed: boolean }>` — waits for exit,
    captures stdout/stderr, and kills the child on timeout. `spawnFailed` is true when the
    program cannot start (for example, `ENOENT`). Used by the picker.
- **Factory:** `createNativeActions(deps?: NativeActionDeps): NativeActions`, where
  `deps` may inject `platform`, `fileExists`, `getEntryPath`, `spawnDetached`, and
  `runAndCapture`. Mirrors `createScanService`.
- **Singleton:** `export const nativeActions = createNativeActions();`
- **Single-flight picker guard:** a boolean scoped to the created instance. A second
  `pickDirectory` while one is open returns `{ status: 'busy' }`. The flag clears in a
  `finally`.

### 7.2 Command table

| Platform | Reveal | Open |
| --- | --- | --- |
| Windows | `explorer /select,<path>` (one arg) | `cmd /c start "" "<path>"` |
| macOS | `open -R <path>` | `open <path>` |
| Linux | `xdg-open <parent dir>` | `xdg-open <path>` |

- Commands run with `spawn(command, args)` and `{ windowsHide: true }`. No shell.
- On Windows, `start` is a `cmd` builtin, so the `cmd /c` wrapper is required. Node quotes the
  path argument; a Windows path cannot contain `"`.
- On Linux, "Reveal" cannot reliably select a file across file managers, so it opens the
  parent directory.
- On any other platform, the builders return `null`. Reveal/Open then return
  `{ ok: false, reason: 'unsupported' }`.

### 7.3 Folder picker commands

| Platform | Command | Notes |
| --- | --- | --- |
| Windows | `powershell -STA -NoProfile -Command "<script>"` | `System.Windows.Forms.FolderBrowserDialog`; prints `SelectedPath` or nothing on cancel |
| macOS | `osascript -e 'POSIX path of (choose folder)'` | Cancel exits non-zero |
| Linux | `zenity --file-selection --directory` | Falls back to `kdialog --getexistingdirectory` if `zenity` is missing |

- The picker waits for process exit, up to **300000 ms (5 minutes)**.
- On timeout: kill the child, return `{ status: 'timeout' }`.
- If the picker command cannot start (`spawnFailed`, for example no `zenity` on Linux, or an
  unknown platform): on Linux try `kdialog` next; if that also cannot start, return
  `{ status: 'unsupported' }`.
- On a normal exit:
  - a non-empty path → `{ status: 'picked', path }`;
  - an empty path → `{ status: 'canceled' }` (macOS/Linux non-zero exit and Windows empty
    stdout both mean cancel);
  - a thrown error → `{ status: 'error' }`.
- The returned path is trimmed and stripped of one trailing separator (`/` or `\`), except for
  a drive root such as `C:\` or the filesystem root `/`.
- `pickDirectory()` returns the `FolderPickResult` union.

### 7.4 Action methods

- `reveal(id: number): Promise<NativeActionResult>`
- `open(id: number): Promise<NativeActionResult>`

Shared logic:

1. `path = getEntryPathById(id)`. If `null` → `{ ok: false, reason: 'not-found' }`.
2. Real path = `virtualToReal(path)` when `path` starts with `@fixtures`, else `path`.
3. If `!fileExists(realPath)` → `{ ok: false, reason: 'missing' }`.
4. Build the command with `buildRevealCommand` or `buildOpenCommand`. If it is `null` →
   `{ ok: false, reason: 'unsupported' }`.
5. `spawnDetached(command)`; do not wait for completion.
6. Return `{ ok: true }`. Any thrown error → `{ ok: false, reason: 'error' }` and a server log.

## 8. Server routes

`server/routes/native.ts` (new), following the `files.ts` pattern:

- `import { createServerFn } from '@tanstack/react-start';`
- `revealEntry` (POST, `data: { id: number }`) → `await import('../lib/native-actions')` →
  `nativeActions.reveal(data.id)`
- `openEntry` (POST, `data: { id: number }`) → `nativeActions.open(data.id)`
- `pickDirectory` (GET, no data) → `nativeActions.pickDirectory()`

All three import the server-only library **inside the handler**.

## 9. Client changes

### 9.1 Toast provider (`app/routes/__root.tsx`)

- Add `import '@mantine/notifications/styles.css';` and mount `<Notifications position="top-right" />`
  inside `MantineProvider`.

### 9.2 `FilePreviewDrawer.tsx`

- Add local `busy: 'reveal' | 'open' | null` state.
- Reveal button: `onClick` calls `revealEntry({ data: { id: selectedFile.id } })`. On `ok`,
  `notifications.show({ color: 'cyan', message: 'File shown in the file manager.' })`. On
  failure, show a short error message mapped from `reason`
  (`not-found`/`missing` → "File not found."; `unsupported` → "This action is not supported
  here."; `error` → "The action failed."). Clear `busy` in `finally`.
- Open button: same, with `openEntry` and "Opened in the default application.".
- Each button is disabled while any action is busy.

### 9.3 `PreferencesPage.tsx`

- Add a "Browse…" `Button` next to each add-directory `TextInput` (indexed and ignored).
- On click, `pickDirectory()`. While waiting, disable that button.
  - `status: 'picked'` → set the matching text state to `path`.
  - `status: 'canceled'` → do nothing, no toast.
  - `status: 'busy'` → error toast "A folder dialog is already open.".
  - `status: 'timeout'` → error toast "The folder dialog timed out.".
  - `status: 'unsupported'` → error toast "The folder picker is not available.".
  - `status: 'error'` → error toast "The folder picker failed.".

## 10. Lifecycle / data flow

1. User opens the drawer for a file → clicks **Reveal**/**Open file** → client sends the id →
   server resolves the path from the app DB → server checks the file → server starts the OS
   command → client toasts the result.
2. User clicks **Browse…** next to an add-directory input → server opens the folder dialog and
   waits → on pick, the path fills the input → the user clicks **Add directory** (unchanged
   autosave flow from 4a).
3. Nothing in this phase changes the scan, the app-config store, or the fixture seed.

## 11. Testing & verification

- **`server/lib/native-actions.test.ts` (node, injected deps):**
  - `buildRevealCommand` / `buildOpenCommand` / `buildFolderPickerCommand` for `win32`,
    `darwin`, and `linux` return the expected command and argument list.
  - `reveal`/`open`: unknown id → `not-found`; missing file → `missing`; present file →
    `ok: true` and the injected spawn was called with the built command.
  - `pickDirectory`: picked path is trimmed and de-slashed; empty output → `canceled`;
    spawn failure → `unsupported`; a thrown error → `error`; a second concurrent call →
    `busy`; timeout → `timeout` and the child is killed.
- **`server/lib/queries.test.ts`:** `getEntryPathById` returns a known fixture row's raw path
  and `null` for an unknown id.
- **`app/components/common/FilePreviewDrawer.test.tsx` (jsdom):** with a `selectedFile`, the
  Reveal and Open buttons call the matching server function with `{ id }` and show a success
  toast; an `{ ok: false }` result shows an error toast. Mock `server/routes/native` and
  `@mantine/notifications`.
- **`app/features/preferences/PreferencesPage.test.tsx` (jsdom):** "Browse…" calls
  `pickDirectory`; `picked` fills the matching input; `canceled` leaves the input unchanged.
- **Gates:** `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build`
  succeeds. Confirm `better-sqlite3` and `sqlite` are absent from `dist/client`.
- **Manual smoke (user machine):** open a file in the drawer → Reveal selects it, Open launches
  it; add a directory with "Browse…"; cancel the dialog and confirm no change; try a file that
  was deleted after the scan and confirm the error toast.

## 12. Task outline (detailed via writing-plans)

1. **Native command layer + lookup:** `app/lib/types.ts` result types;
   `server/lib/queries.ts` `getEntryPathById` (+ tests); `server/lib/native-actions.ts`
   builders, spawn seam, picker guard, action methods (+ tests).
2. **Endpoints + drawer + toasts:** `server/routes/native.ts`; add `@mantine/notifications`
   and the provider in `__root.tsx`; wire `FilePreviewDrawer` buttons and toasts (+ tests).
3. **Preferences Browse:** add the two "Browse…" buttons and picker handling (+ tests).
4. **Final verification + docs:** `pnpm check`, `pnpm build`, manual smoke; record 4c progress
   in `ROADMAP.md`/`AGENTS.md` (Phase 4 stays in progress; 4d remains).

## 13. Trade-offs & follow-ups

- The server starts OS programs. This is safe because the server is local and every path comes
  from the app DB. It would be unsafe on a remote host; that is out of scope.
- The Windows picker starts Windows PowerShell; startup is a little slow, and the dialog can
  appear behind the browser. The user can alt-tab to it.
- Linux "Reveal" opens the parent folder, not a selected file. This is a platform limit.
- `@mantine/notifications` is a new dependency on the existing Mantine v9 line.
- A blocking HTTP request stays open while the folder dialog is open. The 5-minute timeout
  bounds it. Only one dialog can be open at a time.
- Phase 4d adds keeper persistence.
