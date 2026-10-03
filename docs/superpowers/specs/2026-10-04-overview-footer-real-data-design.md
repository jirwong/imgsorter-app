# imgsorter-app — Cleanup A Design: Real Last-Scan Data + Dead Mock-Data Removal

**Date:** 2026-10-04
**Status:** Draft for review
**Scope:** Cleanup A only — replace the static "last scan" text in the footer, the Overview
`LastRunCard`, and the Activity fallback with one persisted last-scan record; remove the static
"Not backed up" metric; and delete dead mock data. Keeper delete non-keepers (Cleanup B) is out
of scope.

## 1. Context & source material

Phase 4 is complete. Three places still show made-up scan text, and one Overview metric has no
data source:

- `app/components/common/AppFooter.tsx` shows a hardcoded `Last scan 2 minutes ago · 4 warnings`.
- `app/features/overview/LastRunCard.tsx` shows a hardcoded title, fake per-phase timings from
  `runSteps`, and `4 files could not be read`.
- `app/features/overview/OverviewPage.tsx` has a static `Not backed up / 2,184 / attention` metric.
- `app/features/activity/ActivityPage.tsx` shows `Last run completed today` when idle.

**Real data that exists today:**

- `directory_meta` in `app-config.db` holds a per-directory `lastScannedAt` (Phase 4b).
- The in-memory scan service (`server/lib/scan.ts`) holds the current/last run summary, but it
  resets when the server restarts.
- The photo DB holds file/size totals.

**Real data that does not exist:** persisted scan history, per-phase timings, a backup concept,
and a persisted error count.

**Decisions made during brainstorming:**

- **Persist one last-scan record** in `app-config.db` (new `last_scan` key) at the end of a
  successful scan. No history.
- **Footer:** `Last scan <relative time>`, plus `· N errors` only when errors exist; `No scan yet`
  when there is none.
- **LastRunCard:** the last scan time and summary rows (directories, files scanned, entries
  written, duplicate groups); an error row only when errors exist. Remove the fake per-phase
  timings and the fake "4 files" line.
- **Remove** the `Not backed up` metric.
- **Activity fallback:** the saved last-scan time, or `No scan has run yet`.
- **Full purge** of `app/lib/mock-data.ts`; keep placeholder thumbnails in a new file until Phase 5.

## 2. Goals

- The footer, the Overview card, and the Activity page show the real last-scan facts.
- The last-scan record survives a reload, a server restart, and `pnpm seed`.
- No page shows fake scan text or a fake "Not backed up" metric.
- Dead mock data is gone; tests use local fixtures.
- Keep `better-sqlite3` server-only.

## 3. Non-goals (Cleanup A)

- No scan history (a list of past runs) and no per-phase timings.
- No backup feature.
- No real thumbnails/previews (Phase 5); placeholder thumbnails stay for now.
- No change to the scan engine, to the scan flow, or to `app_config` shapes other than the new
  `last_scan` key.
- No keeper delete action (Cleanup B).

## 4. Technology

Unchanged: TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9,
`@mantine/notifications`, `better-sqlite3` (server-only), Vitest (client jsdom / server node),
TypeScript strict.

## 5. Project structure (new/changed)

```
app/
  lib/
    types.ts                          # + LastScan
    format.ts                         # + formatRelativeTime
    format.test.ts                    # NEW
    placeholder-thumbs.ts             # NEW: moved `thumbs`
    mock-data.ts                      # DELETE
    mock-data.test.ts                 # DELETE
  components/common/
    AppFooter.tsx                     # real last-scan text
    app-shell.test.tsx                # + footer assertions
  features/overview/
    LastRunCard.tsx                   # summary rows + error row
    OverviewPage.tsx                  # remove Not backed up; pass lastScan
    OverviewPage.test.tsx
  features/activity/
    ActivityPage.tsx                  # idle fallback
    ActivityPage.test.tsx
  features/browse/BrowsePage.test.tsx # local fixtures
  features/files/FilesPage.test.tsx   # local fixtures
server/
  lib/
    app-config.ts                     # + getLastScan / recordLastScan
    app-config.test.ts
    scan-configured.ts                # + recordLastScan dep
    scan-configured.test.ts
  routes/
    shell.ts                          # + lastScan
```

## 6. Data model & storage

### 6.1 `app/lib/types.ts`

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

`ShellData` does not change. The root shell route returns the shell shape plus `lastScan`.

### 6.2 Store (`server/lib/app-config.ts`)

- New key: `const LAST_SCAN_KEY = 'last_scan'`.
- Extend `AppConfigStore`:
  ```ts
  getLastScan: () => LastScan | null;
  recordLastScan: (scan: LastScan) => LastScan;
  ```
- `getLastScan()` reads the key directly. A missing row, malformed JSON, or a wrong shape returns
  `null`. It does **not** write a default.
- `recordLastScan(scan)` writes the value and returns it.
- A guard `isLastScan(value)` checks every field is a string or number as typed.
- The other store methods never touch `last_scan`.

### 6.3 Scan record (`server/lib/scan-configured.ts`)

- Add `recordLastScan: (scan: LastScan) => void` to `ConfiguredScanDeps`.
- After a successful `deps.run(...)`, compute `at = new Date().toISOString()` and:
  - `deps.recordScanned(directories, at)` (unchanged);
  - `deps.recordLastScan({ finishedAt: at, directories: directories.length, filesScanned:
    summary.filesScanned, entriesWritten: summary.entriesWritten, duplicateGroups:
    summary.duplicateGroups, duplicateFiles: summary.duplicateFiles, errors: summary.errors.length })`.
- The singleton wires `recordLastScan: (scan) => appConfigStore.recordLastScan(scan)`.
- A refusal (no directories or no extensions) throws before any record. An aborted run never
  reaches the record.

## 7. Server route

`server/routes/shell.ts`:

```ts
export const getShellData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getShellData: loadShell } = await import('../lib/queries');
  const { appConfigStore } = await import('../lib/app-config');
  return { ...loadShell(), lastScan: appConfigStore.getLastScan() };
});
```

The client reads this through the existing `__root__` loader. `ScanRevalidator` already calls
`router.invalidate()` on a terminal scan, so the footer and card refresh after a scan.

## 8. Client

### 8.1 `formatRelativeTime` (`app/lib/format.ts`)

```ts
export function formatRelativeTime(iso: string, now: Date = new Date()): string
```

- `diff = max(0, now - iso)`.
- `< 60s` → `just now`.
- `< 60m` → `N minute(s) ago`.
- `< 24h` → `N hour(s) ago`.
- otherwise → `N day(s) ago`.
- Uses `Math.floor` so values progress cleanly.

### 8.2 `AppFooter.tsx`

- Reads `{ files, size, lastScan }` from `useLoaderData({ from: '__root__' })`.
- Right side:
  - `lastScan` null → `No scan yet`;
  - else → `Last scan ${formatRelativeTime(lastScan.finishedAt)}` and, when `lastScan.errors > 0`,
    append ` · ${lastScan.errors} errors`.

### 8.3 `LastRunCard.tsx`

- Props: `{ lastScan: LastScan | null }`.
- Null: eyebrow `LAST RUN`, heading `No scan yet`, short helper text.
- Else: eyebrow `LAST RUN`, heading `Last scan ${formatRelativeTime(finishedAt)}`, then rows:
  - `Directories` → `directories`,
  - `Files scanned` → `filesScanned.toLocaleString('en-US')`,
  - `Entries written` → `entriesWritten.toLocaleString('en-US')`,
  - `Duplicate groups` → `duplicateGroups`.
- An orange row `N errors during the scan` appears only when `errors > 0`.
- Removes the `runSteps` import.

### 8.4 `OverviewPage.tsx`

- Removes `STATIC_METRIC`; the metric grid has 5 real metrics.
- Reads `lastScan` from `useLoaderData({ from: '__root__' })` and passes it to `<LastRunCard
  lastScan={lastScan} />`.
- Keeps the placeholder thumbnails for the largest-files list (imported from
  `app/lib/placeholder-thumbs.ts`).

### 8.5 `ActivityPage.tsx`

- Reads `lastScan` from `useLoaderData({ from: '__root__' })`.
- Idle with no in-memory summary: `lastScan` exists → `Last scan ${formatRelativeTime(...)}`;
  else → `No scan has run yet`.

### 8.6 Mock-data full purge

- Delete `app/lib/mock-data.ts` and `app/lib/mock-data.test.ts`.
- Move `thumbs` to `app/lib/placeholder-thumbs.ts`; update `OverviewPage.tsx` and
  `FilePreviewDrawer.tsx` imports.
- Move the `entries` sample data into `BrowsePage.test.tsx`, `FilesPage.test.tsx`, and
  `OverviewPage.test.tsx` as local fixtures.
- Remove `directoryTree`, `initialLogs`, `headerDirOptions`, `headerExtOptions`, `metricRows`,
  `storageRows`, `runSteps`, and `largestFiles`.

## 9. Lifecycle / data flow

1. "Scan library" runs and completes → `scan-configured` saves `last_scan` in `app-config.db`.
2. `ScanRevalidator` invalidates the router → the root loader returns the new `lastScan`.
3. The footer, Overview card, and Activity fallback show the new facts.
4. A page reload or server restart reads the same record.
5. `pnpm seed` rebuilds the photo DB only; `last_scan` stays.

## 10. Testing & verification

- **`server/lib/app-config.test.ts`:** `getLastScan` defaults to `null`; `recordLastScan`
  round-trips all fields; a malformed value reads as `null`.
- **`server/lib/scan-configured.test.ts`:** the injected `recordLastScan` is called once with the
  summary fields; it is not called when the scan is refused.
- **`app/lib/format.test.ts`:** `formatRelativeTime` for seconds, minutes, hours, and days with an
  injected `now`; a future timestamp reads as `just now`.
- **`app/components/common/app-shell.test.tsx`:** the mocked root loader includes `lastScan`; the
  footer shows the relative text and `· N errors`; a null `lastScan` shows `No scan yet`.
- **`app/features/overview/OverviewPage.test.tsx`:** `Not backed up` is gone; the card shows the
  summary rows; the error row appears only when `errors > 0`.
- **`app/features/activity/ActivityPage.test.tsx`:** the idle fallback uses the saved last-scan time.
- **Purge:** the three component tests use local fixtures; `mock-data.test.ts` is deleted.
- **Gates:** `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build`.
  Confirm `better-sqlite3` and `sqlite` are absent from `dist/client`.
- **Manual smoke:** run a scan; confirm the footer, Overview card, and Activity page show the new
  time and counts; reload and restart the dev server; confirm the values stay.

## 11. Task outline (detailed via writing-plans)

1. **Server + helper:** `LastScan` type; `app-config` `getLastScan` / `recordLastScan` (+ tests);
   `scan-configured` record hook (+ tests); `formatRelativeTime` (+ tests).
2. **Client wiring:** shell route `lastScan`; footer; Overview card and page; Activity fallback
   (+ tests).
3. **Mock-data full purge:** move `thumbs`; migrate test fixtures; delete `mock-data.ts` and its
   test.
4. **Final verification + docs:** `pnpm check`, `pnpm build`, manual smoke; a short note in
   `AGENTS.md`.

## 12. Trade-offs & follow-ups

- One record only; there is no run history. A later phase can add history if needed.
- The record is written after `recordScannedDirectories`. A store write failure rejects the scan
  promise, matching the existing behavior.
- `formatRelativeTime` uses whole units and floors; it does not show an exact timestamp. A future
  tooltip could show the exact time.
- Placeholder thumbnails remain until Phase 5.
- Cleanup B (keeper delete non-keepers) is the next cycle.
