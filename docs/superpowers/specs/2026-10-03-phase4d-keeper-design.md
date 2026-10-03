# imgsorter-app — Phase 4d Design: Keeper Persistence + Keeper Filter

**Date:** 2026-10-03
**Status:** Draft for review
**Scope:** Phase 4d only — persist the one-per-group keeper selection, add a keeper filter, and
warn about saved keepers that no longer match a group. This closes Phase 4.

## 1. Context & source material

Phase 3a made "keepers" real **in memory**: `app/features/duplicates/DuplicatesPage.tsx` holds
`keeperByGroup: Record<string, number>` in local `useState`, keyed by `group.key`
(`${hash}:${filename}`) with the file `id` as the value. The state enforces **one keeper per
group**. `DuplicateGroupTable` marks the kept row and `KeepToggle` shows `Keep` / `Keeper`.
A reload loses the selection, and `pnpm seed` / a rescan is unrelated because nothing is saved.

Phase 4a added a dedicated, scan-proof store: `server/data/app-config.db`, wrapped by
`server/lib/app-config.ts` (`createAppConfigStore`). Phase 4b/4c did not touch keepers.

**Constraints found while exploring:**

- The engine's `entries` table is keyed by `path`. A resync can delete and reinsert rows, so a
  row `id` is **not** stable across scans. A path is the natural key.
- `server/lib/queries.ts` `toEntry` maps `@fixtures/...` to synthetic display paths. Real scan
  paths pass through unchanged. Storage must use the **raw** DB path, not the display path.
- `server/lib/queries.ts` `countEntriesByDirectory` already compares paths case- and
  separator-insensitively with `lower(replace(directory, char(92), '/'))`. Keeper matching
  should use the same rule.
- The app has `@mantine/notifications` (Phase 4c) for toasts.
- The engine is vendored verbatim and its DB is rebuilt by real scans; keepers cannot live there.

**Decisions made during brainstorming:**

- **Persist the selection only.** Keepers still have no file action. Add a **keeper filter**.
- **Storage: `app-config.db`, new `keepers` key**, a flat `string[]` of raw file paths.
- **Identity: the file path**, not the row id.
- **Save model: autosave on each toggle.** No Save button. Optimistic update.
- **Keepers are selected only on expanded duplicate rows.** No new selection surface.
- **Stale keepers show a warning** with a Clear action.
- **Filter form:** `All groups` / `With keeper` / `Without keeper`.

## 2. Goals

- The keeper selection for a group persists across reloads, dev restarts, UI scans, and
  `pnpm seed`.
- The Duplicates page reads its initial keepers from the store and saves changes to it.
- The page can filter groups by keeper state.
- Saved keepers that no longer match a duplicate group are visible and can be cleared.
- Keep `better-sqlite3` server-only.

## 3. Non-goals (Phase 4d)

- No file delete, move, copy, or "delete non-keepers" action.
- No keeper selection outside the expanded duplicate rows.
- No user accounts or per-machine profiles.
- No scan history or "last kept" timestamps.
- No change to the engine, to `app_config` shapes, or to the scan.

## 4. Technology

Unchanged: TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9,
`@mantine/notifications`, `better-sqlite3` (server-only), Vitest (client jsdom / server node),
TypeScript strict.

## 5. Project structure (new/changed)

```
app/
  lib/types.ts                                  # + KeeperMap, DuplicatesData
  routes/duplicates.tsx                         # loader -> getDuplicatesData
  features/duplicates/DuplicatesPage.tsx        # props, autosave, filter, warning
  features/duplicates/DuplicatesPage.test.tsx   # + keeper cases
server/
  lib/app-config.ts                             # + getKeepers / setKeepers
  lib/app-config.test.ts                        # + keeper tests
  lib/queries.ts                                # + getKeeperData / getEntryPathsByIds
  lib/queries.test.ts                           # + keeper query tests
  routes/duplicates.ts                          # getDuplicatesData / saveKeepers / clearStaleKeepers
```

`DuplicateGroupTable.tsx` and `KeepToggle.tsx` do not change.

## 6. Data model & shared types

### 6.1 `app/lib/types.ts`

```ts
export type KeeperMap = Record<string, number>;
export type DuplicatesData = { groups: DuplicateGroup[]; keepers: KeeperMap; staleKeepers: number };
```

`AppConfig` does **not** change. Keepers are not part of the Preferences payload.

### 6.2 Store (`server/lib/app-config.ts`)

- New key: `const KEEPERS_KEY = 'keepers'`.
- Extend `AppConfigStore`:
  ```ts
  getKeepers: () => string[];
  setKeepers: (paths: string[]) => string[];
  ```
- `getKeepers()` uses `readKey` with default `[]` and a guard `isKeeperPaths` (an array of
  strings). Malformed JSON falls back to `[]` and rewrites the key.
- `setKeepers(paths)` normalizes, writes `KEEPERS_KEY`, and returns the stored list.
- **Normalization** (`normalizeKeeperPath`): trim; `\` → `/`; strip one or more trailing `/`;
  drop empty strings. De-duplicate **case-insensitively**, keep the first spelling.
- `saveDirectories`, `saveApplication`, and `recordScannedDirectories` never touch
  `KEEPERS_KEY`.

### 6.3 Queries (`server/lib/queries.ts`)

- `getEntryPathsByIds(ids: number[]): string[]` — read-only; returns the **raw** `path` for each
  known id. Unknown ids are dropped. Empty input returns `[]`.
- `getKeeperData(paths: string[]): { keepers: KeeperMap; stale: string[] }` — read-only:
  - Normalize the input to lowercase `\`→`/` keys.
  - Query:
    ```sql
    SELECT e.id, e.path, e.hash, e.filename, r.count
    FROM entries e
    LEFT JOIN records r ON r.hash = e.hash AND r.filename = e.filename
    WHERE lower(replace(e.path, char(92), '/')) IN (<normalized keys>)
    ```
  - A row with `r.count > 1` → `keepers[`${e.hash}:${e.filename}`] = e.id`.
  - A row with no match, or with `r.count <= 1` → the stored path is **stale**.
  - `stale` holds the stored path spellings (the original input strings), so a caller can
    subtract them from `getKeepers()`.
  - Empty input or a missing DB returns `{ keepers: {}, stale: [] }`.
  - Only one normal form is needed per key; de-duplicate keys before the query.

## 7. Server routes

`server/routes/duplicates.ts`, following the `preferences.ts` / `files.ts` pattern (dynamic
`import()` of server libs inside the handler):

- `getDuplicatesData` (GET) →
  `{ groups: getDuplicateGroups(), keepers, staleKeepers: stale.length }` where
  `{ keepers, stale } = getKeeperData(appConfigStore.getKeepers())`.
  Replaces the old `getDuplicateGroups` export.
- `saveKeepers` (POST, `data: { keepers: KeeperMap }`) →
  - `ids = Object.values(data.keepers)`;
  - `paths = getEntryPathsByIds(ids)`;
  - `appConfigStore.setKeepers(paths)`;
  - return `{ saved: paths.length }` (the client ignores the body).
- `clearStaleKeepers` (POST, no data) →
  - `{ stale } = getKeeperData(appConfigStore.getKeepers())`;
  - build the stale key set (`normalizeKeeperPath(stalePath).toLowerCase()`) and store the
    saved paths whose key is **not** in that set;
  - return `{ staleKeepers: 0 }`.

## 8. Client

### 8.1 Route (`app/routes/duplicates.tsx`)

- `loader: async () => getDuplicatesData()`.
- `DuplicatesRoute` reads `{ groups, keepers, staleKeepers }` and passes them to the page:
  `<DuplicatesPage groups={groups} initialKeepers={keepers} initialStaleKeepers={staleKeepers} />`.
- Keep the existing `validateSearch` and `useFilterSearchParams`.

### 8.2 `DuplicatesPage.tsx`

- Props: `{ groups: DuplicateGroup[]; initialKeepers: KeeperMap; initialStaleKeepers: number }`.
- `const [keeperByGroup, setKeeperByGroup] = useState<KeeperMap>(initialKeepers)`.
- `const [staleKeepers, setStaleKeepers] = useState(initialStaleKeepers)`.
- `const [keeperFilter, setKeeperFilter] = useState('All groups')`.
- `toggleKeeper(groupKey, id)`:
  - compute `next` (same toggle rule as today);
  - `setKeeperByGroup(next)`;
  - `void saveKeepers({ data: { keepers: next } })`
    - `.then(() => setStaleKeepers(0))` (the store now holds only current paths);
    - `.catch(() => notifications.show({ color: 'red', message: 'Could not save keepers.' }))`.
- `clearStale()`:
  - `clearStaleKeepers()`
    - `.then(() => setStaleKeepers(0))`;
    - `.catch(() => notifications.show({ color: 'red', message: 'Could not clear keepers.' }))`.
- **Keeper filter** in the `visibleGroups` memo, after the existing filters:
  - `All groups` → no extra filter;
  - `With keeper` → `Boolean(keeperByGroup[g.key])`;
  - `Without keeper` → `!keeperByGroup[g.key]`.
- Filter bar: add a `Select` (size `xs`) with values `['All groups', 'With keeper', 'Without keeper']`.
- Stale warning: when `staleKeepers > 0`, render an inline warning above the table, for example a
  Mantine `Alert` with `color="orange"`:
  `"{n} saved keepers no longer match a group."` plus a `Button` "Clear saved keepers" that
  calls `clearStale()`.
- The existing count text `N groups · N files · N keepers` stays; `keepers` counts the whole
  `keeperByGroup` map.

## 9. Lifecycle / data flow

1. Open `/duplicates` → loader `getDuplicatesData` → store keeps + join → `{ groups, keepers,
   staleKeepers }` → page state.
2. Click Keep/Keeper → local map updates → `saveKeepers` → server maps ids to raw paths →
   `app-config.db` → stale warning clears.
3. Click "Clear saved keepers" → `clearStaleKeepers` → store drops the stale paths.
4. "Scan library" / `pnpm seed` rebuild the photo DB only; keepers remain in `app-config.db`.
5. After a scan, a kept path that still exists in a duplicate group resolves again; one that
   does not becomes stale and shows the warning.

## 10. Testing & verification

- **`server/lib/app-config.test.ts` (node, temp DB path):**
  - `getKeepers` defaults to `[]`; `setKeepers` round-trips.
  - `setKeepers` trims, `\`→`/`, strips trailing `/`, drops blanks, de-duplicates
    case-insensitively.
  - `saveDirectories` / `saveApplication` leave `getKeepers` intact.
- **`server/lib/queries.test.ts` (node, fixture DB via `IMGSORTER_DB_PATH`):**
  - `getEntryPathsByIds` returns raw paths for known ids and drops unknown ids.
  - `getKeeperData` maps a real fixture duplicate path to `keepers[groupKey]` and reports a
    made-up path as stale; an empty input returns empty shapes.
- **`app/features/duplicates/DuplicatesPage.test.tsx` (jsdom):**
  - renders `initialKeepers` as the starting state;
  - a Keep click calls `saveKeepers` with the next map and clears the warning on resolve;
  - a failed save shows a red toast;
  - the keeper filter hides `With keeper` / `Without keeper` groups correctly;
  - the stale warning shows for a positive count and the Clear button calls `clearStaleKeepers`.
  - Mock `server/routes/duplicates` and `@mantine/notifications`.
- **Gates:** `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build`.
  Confirm `better-sqlite3` and `sqlite` are absent from `dist/client`.
- **Manual smoke:** on `/duplicates`, keep a file in a group; reload and confirm the keeper stays;
  use the three filter values; run "Scan library" and confirm the keeper survives; delete a kept
  file and rescan, then confirm the inline warning and the Clear button.

## 11. Task outline (detailed via writing-plans)

1. **Store + queries:** `KeeperMap` / `DuplicatesData` types; `app-config` `getKeepers` /
   `setKeepers` (+ tests); `queries` `getKeeperData` / `getEntryPathsByIds` (+ tests).
2. **Endpoints + page:** `getDuplicatesData` / `saveKeepers` / `clearStaleKeepers`; route loader;
   `DuplicatesPage` initialization, autosave, keeper filter, and stale warning (+ tests).
3. **Final verification + docs:** `pnpm check`, `pnpm build`, manual smoke; record 4d and Phase 4
   complete in `ROADMAP.md` / `AGENTS.md`.

## 12. Trade-offs & follow-ups

- Keepers are a flat path set, so the store cannot tell which group a path came from. The read
  join derives the group, which is enough and avoids stale group keys.
- Autosave replaces the whole set on each toggle, so stale paths drop on the next toggle. Until
  then the warning shows them and Clear removes them.
- Path matching is case- and separator-insensitive, so a Windows path is treated as one path
  regardless of drive-letter case or separator.
- The keeper map is display-only; a future phase may add a real "delete non-keepers" action.
- `getDuplicatesData` opens the app-config store and the photo DB. Both are read-only and short.
