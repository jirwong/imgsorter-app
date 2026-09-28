# imgsorter-app — Phase 3b Design: Real Scan + Progress Streaming, Real Duplicates Badge, app-context Cleanup

**Date:** 2026-09-28
**Status:** Draft for review
**Scope:** Phase 3b only — drive the vendored engine from the UI ("Scan library"),
stream its progress live to the Activity page, allow cancelling, make the
Duplicates nav badge real, and remove the dead mock plumbing in `app-context`.
The scan is **fixture-driven** (it generates the deterministic fixture tree and
runs the real engine over it). No config persistence or directory management
(Phase 4).

## 1. Context & source material

Phase 2 wired the read-only pages to the committed sample DB; Phase 3a put the
Duplicates page on real data with in-memory keepers. Today:

- `scripts/seed.ts` generates the fixture tree, clears the DB, runs the vendored
  `Runner`, rewrites stored paths to `@fixtures/…`, and rebuilds `records`.
  This is the only caller of the engine.
- The Activity page is **entirely mock**: `app-context`'s `startScan()` just sets a
  boolean and prepends one log; `ActivityPage` renders a hardcoded 48% and never
  completes. `Sidebar`'s scan-state block is static, and the Duplicates badge is
  hardcoded `3`.
- `app-context` still computes `filtered` from the 18 mock `entries` (unused since
  Phase 2), exposes an unused `keepers` API (unused since 3a), and owns the mock
  scan state.

**Engine capabilities available** (`server/engine/`, already vendored):
- `Runner(config, { reporter, progress, signal })` runs `scan → resync → records`,
  emits `ProgressEvent`s through `ProgressSink`, and honours `AbortSignal`
  (`RunAbortedError` at safe points). `run()` is async and yields between file
  operations, so the node event loop stays responsive.
- `ProgressEvent`: `phaseStart`, `directoryStart`, `file {filesProcessed, totalFiles}`,
  `counts`. `RunSummary`: `filesScanned`, `entriesWritten`, `duplicateGroups`,
  `duplicateFiles`, `staleRemoved`, `errors`.

**Decisions made during brainstorming:**
- **Fixture-driven live scan:** "Scan library" generates the deterministic fixture
  tree and runs the real engine with live progress, writing the app DB
  (`server/data/imgsorter.db`) — the same data as `pnpm seed`, driven from the UI.
- **Transport:** in-memory server scan state + **client polling** (~400ms), not
  SSE/RawStream. Robust across the installed Start version.
- **Client state:** a small **module-level scan store** consumed via
  `useSyncExternalStore` (no new dependency), shared by all consumers.
- **Cancel:** included — the store/server wire the engine's `AbortSignal`.
- **Refactor (DRY):** extract fixture generation + engine run out of
  `scripts/seed.ts` into shared server libs so seed and the UI scan share one
  implementation.
- **Badge:** derive the real Duplicates count from `ShellData` (add
  `duplicateGroups`).
- **Cleanup:** remove dead `filtered`/`entries`/`keepers`/scan mock plumbing from
  `app-context`.

## 2. Goals

- Clicking "Scan library" runs the real engine over the fixture tree with live
  progress on Activity (progress %, current phase/file, completion summary).
- Allow cancelling a running scan; engine aborts at safe points.
- Duplicates nav badge reflects the real duplicate-group count.
- `app-context` holds only what is used (global header filters + selected file).
- Keep the engine/`better-sqlite3` strictly server-side.
- Backwards-compatible data: existing read-only pages keep working after a scan
  (paths still display as `C:/…` / `D:/…`).

## 3. Non-goals (Phase 3b)

- No persisted scan configuration or directory management (Phase 4).
- No scanning of arbitrary/real user directories; no directory picker.
- No keeper persistence or Reveal/Open actions (Phase 4).
- No server-side push (SSE/WebSocket); polling only.
- No change to the fixture content/shape (still 1272 files / 24 groups).

## 4. Technology

Unchanged: TanStack Start (`createServerFn`, route loaders, `useSyncExternalStore`
from React — no new dep), React 19, Mantine v9, `better-sqlite3` (server-only),
Vitest (client jsdom / server node), TypeScript strict.

## 5. Project structure (new/changed)

```
server/
  lib/
    fixtures.ts      # NEW: writeFixtureTree()/removeFixtureTree() (extracted from seed)
    scan-runner.ts   # NEW: runFixtureScan({ progress, signal }) -> RunSummary (engine run + post-processing)
    scan.ts          # NEW: createScanService(runScan) state machine + app singleton
    queries.ts       # getShellData gains duplicateGroups
  routes/
    scan.ts          # NEW: startScan / getScanStatus / cancelScan server fns
scripts/
  seed.ts            # refactored to reuse fixtures.ts + scan-runner.ts
app/
  lib/
    types.ts         # NEW: ScanState/ScanRunStatus; ShellData.duplicateGroups
    scan-store.ts    # NEW: module store + useScanStatus (useSyncExternalStore)
    app-context.tsx  # cleaned: remove filtered/entries/keepers/scan mock state
  features/activity/ActivityPage.tsx   # real progress + Cancel + summary
  components/common/Sidebar.tsx        # real startScan + scan-state + real badge
  routes/__root.tsx                     # mount scan revalidation on terminal status
```

## 6. Server scan module

### 6.1 Fixture + engine libs (extracted)
- `server/lib/fixtures.ts`: `writeFixtureTree(): void` and
  `removeFixtureTree(): void`, moved from `scripts/seed.ts` (uses
  `buildFixtureFiles`/`fixtureBytes`/`virtualToReal`/`fixturesDir`).
- `server/lib/scan-runner.ts`: `runFixtureScan({ progress, signal }): Promise<RunSummary>`
  — deletes the DB (+wal/shm), writes the fixture tree, runs `Runner` with a silent
  reporter, rewrites `entries` paths to `@fixtures/…` + synthetic birthtimes,
  calls `DbService.updateFileRecords()`, removes the fixture tree, and returns the
  `RunSummary`.
- `scripts/seed.ts` becomes a thin CLI wrapper over those two libs (prints expected
  stats + summary). Behaviour is unchanged.

### 6.2 Scan service (`server/lib/scan.ts`)
- Shared types (in `app/lib/types.ts`, client-visible):
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
    summary: { filesScanned: number; entriesWritten: number; duplicateGroups: number; duplicateFiles: number; errors: number } | null;
    error: string | null;
    log: LogEntry[];
  };
  ```
- `createScanService(runScan)` returns `{ start(): ScanState; status(): ScanState; cancel(): void }`.
  - `start()`: no-op returning current state if already `running`; else resets to a
    fresh running state, creates an `AbortController`, and kicks off `runScan` in the
    background (not awaited).
  - A `ProgressEmitter` listener updates `phase`/`filesProcessed`/`totalFiles`/
    `currentFile`/`currentDirectory` and appends compact `LogEntry`s (phase starts,
    directory starts, completion — capped ~50, newest first).
  - On resolve → `completed` + `summary`; on `RunAbortedError` → `cancelled`; on other
    throw → `error`.
  - `cancel()`: aborts the controller if running.
- The **app singleton** is `createScanService(runFixtureScan)`.
- Injectable `runScan` keeps the state machine unit-testable without generating the
  ~4.6GB fixture tree.

### 6.3 Server functions (`server/routes/scan.ts`)
- `startScan` (POST) → `service.start()`.
- `getScanStatus` (GET) → `service.status()`.
- `cancelScan` (POST) → `service.cancel()` then `service.status()`.
All dynamically import `../lib/scan` inside the handler (server-only guard).

### 6.4 Shell data
- `getShellData()` adds `duplicateGroups` (`records WHERE count > 1` count) to
  `ShellData`, so the Sidebar badge is real.

## 7. Client

### 7.1 Scan store (`app/lib/scan-store.ts`)
- Module-level store holding the latest `ScanState`, with `subscribe`/`getSnapshot`,
  a ref-counted poller (start on first subscriber, stop on last), and a
  `useScanStatus()` hook built on `useSyncExternalStore`. Polls `getScanStatus`
  every ~400ms; exposes `startScan()` and `cancelScan()` helpers that call the
  server fns and immediately refresh the snapshot.
- Polling on a terminal transition stops; a small `ScanRevalidator` mounted in
  `__root` calls `router.invalidate()` when status goes `running → terminal`, so
  Overview/Duplicates/shell totals re-run their loaders after a scan.

### 7.2 Activity page
- Replaced mock with store data: status badge (`Running`/`Complete`/`Cancelled`/
  `No active scan`), progress bar (`running`: `round(filesProcessed/totalFiles*100)`
  when `totalFiles` known; `completed`: 100), title/detail from `phase`/
  `currentDirectory`/`currentFile`, a completion summary (files scanned, entries
  written, duplicate groups, errors) from `summary`, and a **Cancel** button while
  running. The event list renders the store's `log` (kept `LogEntry`-shaped so the
  existing rows/layout stay).

### 7.3 Sidebar
- "Scan library" calls the store's real `startScan()` then navigates to `/activity`.
- The scan-state block reflects real status/progress instead of the static
  `INDEXING COMPLETE / 100%`.
- The Duplicates badge uses `ShellData.duplicateGroups` (real count).

### 7.4 `app-context` cleanup
- Remove `filtered`, the `entries`/`applyFilters` import, `keepers`/`toggleKeeper`/
  `setKeepers`, and the mock scan (`scanActive`/`logs`/`startScan`).
- Keep `query`/`setQuery`/`dir`/`setDir`/`ext`/`setExt`/`selectedDirs`/
  `toggleSelectedDir`/`clearSelectedDirs`/`selectedFile`/`setSelectedFile`.

## 8. Lifecycle / data flow

1. Sidebar "Scan library" → `startScan` server fn → service starts the engine in the
   background, returns `running`.
2. Activity (and Sidebar) subscribe to the store; poller hits `getScanStatus`;
   progress updates render live.
3. Cancel → `cancelScan` → `AbortController.abort()` → engine stops → `cancelled`.
4. Complete → `completed` + summary; `ScanRevalidator` invalidates the router;
   loaders re-read the DB (badge/Overview/Duplicates reflect the new scan).

## 9. Testing & verification

- **Server (node), `server/lib/scan.test.ts`:** `createScanService` with a fake
  `runScan` — start sets `running`; progress events update counts/phase and append
  log entries; resolve → `completed` + summary; a second `start()` while running is a
  no-op; `cancel()` aborts → `cancelled`. Assert the fake `runScan` receives the
  `AbortSignal` and a `ProgressSink`.
- **Server (node), `queries.test.ts`:** `getShellData().duplicateGroups` = 24.
- **Client (jsdom):** `app/lib/scan-store.test.ts` — `useSyncExternalStore` hook
  subscribes, polls a mocked `getScanStatus`, and reflects updates (fake timers);
  `ActivityPage.test.tsx` — renders progress/summary from a supplied state and shows
  Cancel while running; `app-shell`/Sidebar badge shows the real count; `app-context`
  consumers still render after cleanup.
- **Gates:** `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build`
  (no `better-sqlite3` in `dist/client`); manual/`curl` smoke of `/activity`.
- The heavy `runFixtureScan` (engine over ~4.6GB fixtures) is not unit-tested; its
  engine path remains covered by `pnpm seed` and the existing DB-parity tests.

## 10. Task outline (detailed via writing-plans)

1. Extract `fixtures.ts` + `scan-runner.ts`; refactor `seed.ts`; add
   `ShellData.duplicateGroups` (+ test).
2. `scan.ts` service + `server/routes/scan.ts` server fns + service tests.
3. `scan-store.ts` (store + `useScanStatus`) + store tests + `ScanRevalidator`.
4. Activity page real progress + Cancel + summary (+ test).
5. Sidebar real start/scan-state + real badge; `app-context` cleanup (+ tests).
6. Final verification (`pnpm check`, `pnpm build`, SSR/curl smoke).

## 11. Trade-offs & follow-ups

- A UI scan rewrites the committed `server/data/imgsorter.db` bytes (logical content
  equals `pnpm seed`), so `git` shows it dirty; `pnpm seed`/`git restore` resets it.
- The background scan runs in-process, assuming a long-lived local server (fine for
  this tool; not serverless-safe).
- Polling is not true push; at ~400ms it reads as live.
- Phase 4 replaces the fixture-driven scan source with persisted `app_config`
  directories and adds keeper persistence + Reveal/Open actions.
