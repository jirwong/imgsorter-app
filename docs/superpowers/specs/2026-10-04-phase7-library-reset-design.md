# imgsorter-app — Phase 7 Design: Maintenance Tab + Library Index Reset

**Date:** 2026-10-04
**Status:** Draft for review
**Scope:** Phase 7 — add a **Maintenance** tab to the Preferences page with a
button that resets the scanned library index. The action needs a confirmation
modal. It clears the indexed files, the duplicate records, the scan metadata,
the keepers, and the thumbnail cache. It keeps the configured directories and
the application preferences.

## 1. Context

The app keeps two SQLite stores and one on-disk cache:

- **Photo DB** (`server/data/imgsorter.db`, `sampleDbPath()`): `entries` (one row
  per indexed file) and `records` (the duplicate summary). The engine's
  `DbService` creates these tables (`server/engine/services/db-service.ts`).
- **Config DB** (`server/data/app-config.db`, `appConfigStore`): configured
  directories, application preferences, per-directory last-scan
  (`directory_meta`), keepers, and the overall `last_scan` record.
- **Thumbnail cache** (`server/data/thumb-cache/`, `thumbnails.clearCache()`).

Today there is no way to empty the index. A user who wants a clean slate must
delete `imgsorter.db` by hand. This phase adds a guarded, in-app reset.

The Preferences page already has two tabs — **Application configuration** and
**Directories** (`app/features/preferences/PreferencesPage.tsx`). A third tab
fits the existing pattern.

## 2. Goals

- A **Maintenance** tab in Preferences.
- It shows the current indexed file count and total size.
- A **Reset library index** button opens a confirmation modal before acting.
- The button is disabled while a scan is running.
- The reset clears the index, duplicate records, scan metadata, keepers, and the
  thumbnail cache, and keeps directories and preferences.
- After a successful reset, a toast reports how many files were removed and the
  UI refreshes to show an empty index.

## 3. Non-goals

- No backup, snapshot, or undo.
- No per-directory reset (whole index only).
- No change to the existing "Clear preview cache" button on the Application
  configuration tab.
- No change to the scan, engine, or the `app-config.db` schema.
- No change to the committed fixture DB (`fixture.db`) or `pnpm seed`.

## 4. Technology

Unchanged: TanStack Start (`createServerFn`, route loaders), React 19, Mantine
v9, `@mantine/notifications`, `better-sqlite3` (server-only), Vitest (client
jsdom / server node), TypeScript strict. No new dependency.

## 5. Project structure (new/changed)

```
app/
  lib/
    types.ts                              # + ResetResult
  features/preferences/
    PreferencesPage.tsx                   # + Maintenance tab
    MaintenancePanel.tsx                  # NEW
    MaintenancePanel.test.tsx             # NEW
    PreferencesPage.test.tsx              # update
server/
  lib/
    reset.ts                              # NEW: createResetService + singleton
    reset.test.ts                         # NEW
    queries.ts                            # + clearIndex()
    queries.test.ts                       # + clearIndex test (temp DB)
    app-config.ts                         # + resetScanMetadata()
    app-config.test.ts                    # + resetScanMetadata test
  routes/
    maintenance.ts                        # NEW: resetLibraryIndex
```

## 6. Data model

### 6.1 `app/lib/types.ts`

```ts
export type ResetResult = {
  entries: number;
  records: number;
  thumbnails: number;
};
```

### 6.2 Photo DB clear — `server/lib/queries.ts`

Add:

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

`openWritable()` mirrors `openReadonly()` but opens the same `dbPath()` without
`readonly`. Deletes run in one transaction, `records` first, so a failure leaves
the previous index intact.

### 6.3 Config reset — `server/lib/app-config.ts`

Add `resetScanMetadata: () => void` to `AppConfigStore`:

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

This clears per-directory last-scan times and the overall last-scan record.
Keepers are cleared with the existing `setKeepers([])`.

## 7. Reset service — `server/lib/reset.ts`

`import '@tanstack/react-start/server-only';`

Small, testable pieces with injected deps:

```ts
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

The order is deliberate: clear the index first; only if that succeeds clear the
dependent metadata, keepers, and cache.

## 8. Server route — `server/routes/maintenance.ts` (new)

```ts
import { createServerFn } from '@tanstack/react-start';

export const resetLibraryIndex = createServerFn({ method: 'POST' }).handler(async () => {
  const { resetService } = await import('../lib/reset');
  return resetService.reset();
});
```

## 9. Client

### 9.1 `PreferencesPage.tsx`

- Add `<Tabs.Tab value="maintenance">Maintenance</Tabs.Tab>`.
- Render `{activeTab === 'maintenance' && <MaintenancePanel />}`.

### 9.2 `MaintenancePanel.tsx` (new)

- Read the totals from the root loader: `const { files, size } = useLoaderData({ from: '__root__' });`
- Read the scan state: `const scan = useScanStatus();` and treat
  `scan.status === 'running'` as busy.
- State: `const [confirmOpen, setConfirmOpen] = useState(false);` and
  `const [busy, setBusy] = useState(false);`.
- Render a `Card`:
  - eyebrow "MAINTENANCE", heading "Library index", a short description.
  - the current totals (`files.toLocaleString('en-US')` and `formatBytes(size)`).
  - a warning: the action is permanent; directories and preferences are kept.
  - a red **Reset library index** button, `disabled={busy || scan.status === 'running'}`,
    with helper text when a scan is running.
- Confirmation `Modal` (`opened={confirmOpen}`):
  - title "Reset library index?".
  - body lists what is cleared (indexed files, duplicate records, keepers,
    preview cache, scan history) and what is kept (directories, preferences).
  - `Cancel` closes; a red `Reset` button calls the handler below.
- Confirm handler:

```ts
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
```

### 9.3 Scan store

The panel uses the existing `useScanStatus()` from `app/lib/scan-store.ts`; no
change to the store.

## 10. Lifecycle / data flow

1. Open Preferences → **Maintenance** → the panel shows the current file count
   and size from the root loader.
2. Click **Reset library index** → the confirmation modal opens.
3. Click **Reset** → `resetLibraryIndex` → `resetService.reset()`:
   clear `entries` + `records`; clear `directory_meta` + `last_scan`; clear
   keepers; clear the thumbnail cache.
4. A cyan toast reports the removed file count; `router.invalidate()` refreshes
   the root loader and the Preferences loader, so the counts, footer, Overview,
   and other pages show an empty index.
5. Configured directories and preferences are unchanged; a later scan rebuilds
   the index.

## 11. Testing & verification

- **`server/lib/reset.test.ts` (injected deps):** `reset` calls every dep once,
  in order, and returns `{ entries, records, thumbnails }` from the deps; a
  thrown `clearIndex` stops the chain (metadata/keepers/thumbnails not cleared).
- **`server/lib/queries.test.ts`:** `clearIndex` deletes all rows and returns the
  counts. Run it against a **temporary copy** of the fixture DB (copy
  `fixture.db` to a temp file, point `IMGSORTER_DB_PATH` at it, clear, assert,
  restore the env). Never clear the shared fixture DB.
- **`server/lib/app-config.test.ts`:** `resetScanMetadata` empties `directoryMeta`
  and makes `getLastScan()` return null; keepers are untouched by it.
- **`app/features/preferences/MaintenancePanel.test.tsx`:** renders the totals;
  the button opens the modal; confirming calls `resetLibraryIndex` and shows the
  toast; the button is disabled while `useScanStatus` reports `running`.
- **`app/features/preferences/PreferencesPage.test.tsx`:** the Maintenance tab
  renders the panel.
- **Gates:** `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`;
  `pnpm build`. Confirm no `better-sqlite3`/`sqlite` in `dist/client`.
- **Manual smoke:** note the current file count; reset; confirm the toast and
  that Overview/Files/Browse show empty and the footer shows 0 files; confirm
  Preferences still lists the configured directories; run a scan and confirm the
  index rebuilds.

## 12. Task outline (detailed via writing-plans)

1. **Server clear primitives:** `ResetResult` type; `clearIndex()` (+ temp-DB
   test); `appConfigStore.resetScanMetadata()` (+ test).
2. **Reset service + route:** `server/lib/reset.ts` (+ tests);
   `server/routes/maintenance.ts`.
3. **Maintenance UI:** `MaintenancePanel` with the confirmation modal; wire the
   tab into `PreferencesPage`; tests.
4. **Final verification + docs:** full gates, build, manual smoke; record the
   phase in `AGENTS.md` and `docs/ROADMAP.md`.

## 13. Trade-offs & follow-ups

- The reset is **irreversible**. There is no backup and no undo; the confirmation
  modal is the only guard.
- Keepers are cleared, so a user re-picks keepers after re-scanning. This avoids
  stale keepers (a Phase 6 review noted stale keeper handling).
- Only a full reset exists; a per-directory reset is a possible follow-up.
- The panel shows the totals from the root loader; they refresh only after
  `router.invalidate()`.
