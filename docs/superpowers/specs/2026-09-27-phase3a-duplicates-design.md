# imgsorter-app — Phase 3a Design: Duplicates on Real Data + In-Memory Keepers

**Date:** 2026-09-27
**Status:** Draft for review
**Scope:** Phase 3a only — put the Duplicates page on real SQLite data (duplicate
groups with their member files) and make "keepers" real in-memory selections, one
per group. No scanning, no persistence, no Reveal/Open actions, no real nav badge,
no app-context mock cleanup.

## 1. Context & source material

Phase 3a follows Phase 2 (real data on the read-only pages, PRs #15–#26) and
precedes Phase 3b (real scan + progress streaming). Phase 3 was split during
brainstorming so each half gets its own spec → plan → PR loop.

Current state relevant to 3a:

- `app/routes/duplicates.tsx` — route with `validateSearch` + `useFilterSearchParams`;
  no loader.
- `app/features/duplicates/` — `DuplicatesPage.tsx` imports the mock `groups`
  from `app/lib/mock-data.ts`; keeps local filters; reads `keepers` from `useApp()`.
  `DuplicateGroupTable.tsx`, `DirectoryPicker.tsx`, `KeepToggle.tsx` are presentational.
- `app/lib/types.ts` — `DuplicateGroup { hash; name; count; space: string; files }`.
- `server/lib/queries.ts` — read-only query module (Phase 2); **no duplicates query**.
- SQLite `records` (filename, hash, count, directories JSON, extension, size;
  `UNIQUE(filename, hash)`) has **24 rows with `count > 1`**; member files live in
  `entries` keyed by `(hash, filename)`.

**Decisions made during brainstorming:**

- **Split:** Phase 3 = 3a (Duplicates real data + keepers) + 3b (real scan + progress
  streaming, **plus** real Duplicates nav badge and removal of dead `filtered`/
  `entries` mock plumbing from `app-context`).
- **Data source:** the committed sample DB (`server/data/imgsorter.db`), read-only,
  consistent with Phase 2. No scan in 3a.
- **Keepers:** in-memory, **one per group**; persistence and Reveal/Open actions
  are Phase 4.
- **Approach A:** one new `getDuplicateGroups()` query + a `createServerFn` wrapper +
  a route loader; member files fetched eagerly (24 groups × ≤4 files is trivial).
- **Keeper state location:** local to `DuplicatesPage` (not the global `app-context`).
- **Type/mock handling:** evolve `DuplicateGroup` to the real numeric shape and delete
  the now-unused mock `groups` (update `mock-data.test.ts`).

## 2. Goals

- Show real duplicate groups (with their member files) on `/duplicates`.
- Real client-side filters (search, extension, directory picker, count, size) over
  real groups.
- Real per-group redundant space; in-memory keeper selection (one per group) with a
  live summary.
- Preserve the Phase 1 visual layout and components; only the data source and keeper
  semantics change.
- Match Phase 2 architecture: server fn + route loader + props-driven components; the
  engine/`better-sqlite3` never enters the client bundle.

## 3. Non-goals (Phase 3a)

- No scanning, no progress streaming, no Activity changes (3b).
- No keeper persistence and no Reveal/Open/copy/delete actions (Phase 4).
- No real Duplicates nav badge (3b).
- No removal of dead mock plumbing in `app-context` (`filtered`, `entries`, `keepers`)
  (3b).
- No server-side duplicates filtering/pagination (stays client-side, as today).
- No thumbnail/preview changes (Phase 5).

## 4. Technology

Unchanged: TanStack Start (`createServerFn` + route loaders), React 19, Mantine v9,
lucide-react, `better-sqlite3` (server-only), Vitest (client jsdom / server node),
TypeScript strict, Prettier 2-space.

## 5. Data layer

### 5.1 `getDuplicateGroups()` (`server/lib/queries.ts`)

Returns `DuplicateGroup[]`:

1. `SELECT filename, hash, count, size, extension, directories FROM records WHERE count > 1 ORDER BY filename`.
2. For each group, fetch member files:
   `SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries WHERE hash = ? AND filename = ? ORDER BY path`,
   projected through the existing `toEntry` (which applies `mapPathToDisplay`).
3. `directories`: the `records.directories` JSON array, each entry `mapPathToDisplay`-ed.
4. `redundantSpace = (count - 1) * size`.
5. `key = \`${hash}:${filename}\``.

Opens its own **read-only** connection via the existing `openReadonly()` helper and
closes it in `finally`, like the other queries. Assumes non-null `hash` (true for the
committed seed); null-hash groups are out of scope for 3a.

### 5.2 Server function — `server/routes/duplicates.ts`

```ts
export const getDuplicateGroups = createServerFn({ method: 'GET' }).handler(async () => {
  const { getDuplicateGroups: load } = await import('../lib/queries');
  return load();
});
```

### 5.3 Route loader — `app/routes/duplicates.tsx`

Keep `validateSearch`; add `loader: async () => getDuplicateGroups()`; keep
`useFilterSearchParams()` (header filter → URL sync); pass the result to the page via
`useLoaderData({ from: '/duplicates' })`.

## 6. Types

Evolve `DuplicateGroup` in `app/lib/types.ts` (replaces the display-string `space`):

```ts
export type DuplicateGroup = {
  key: string; // `${hash}:${filename}` — stable key + keeper key
  hash: string;
  name: string; // filename
  count: number;
  size: number; // per-file bytes (uniform within a group)
  redundantSpace: number; // (count - 1) * size
  extension: string;
  directories: string[]; // display labels
  files: Entry[]; // display-mapped member files
};
```

Delete `export const groups` from `app/lib/mock-data.ts` and drop the group assertions
from `app/lib/mock-data.test.ts`.

## 7. Client wiring

- **`DuplicatesPage`** becomes `({ groups }: { groups: DuplicateGroup[] })`; drops the
  `mock-data` import. Row selection still uses `useApp().setSelectedFile` for the
  preview drawer (unchanged). Local filter state is unchanged (`fileQuery`, `extension`,
  `appliedDirectories`, `countFilter`, `sizeFilter`). `visibleGroups` re-filters each
  group's `files` (query/dirs/extension), then keeps groups with ≥1 visible file and a
  matching count/size filter; the size filter now uses the group's numeric `size`.
  `visibleFiles` = sum of visible group file counts.
- **`DuplicateGroupTable`** updated to the new type: sort keys `count` / `name` /
  `redundantSpace` (numeric; replaces `parseFloat(space)`), redundant space rendered
  with `formatBytes`; expanded rows show the real member files.
- **`DirectoryPicker`** options derived from real group directories; otherwise unchanged.

## 8. Keepers (in-memory, one per group)

- Local state in `DuplicatesPage`: `keeperByGroup: Record<string, number>`
  (group `key` → kept `Entry.id`).
- `toggleKeeper(groupKey, entryId)`:
  - same id already kept → remove the key (toggle off);
  - otherwise set `keeperByGroup[groupKey] = entryId` (replace; one keeper per group).
- `DuplicateGroupTable` receives `keeperByGroup` + `onToggleKeeper(groupKey, entryId)`;
  `KeepToggle` renders keeper state from `keeperByGroup[g.key] === e.id`.
- Summary line: `{visibleGroups.length} groups · {visibleFiles} files · {keepers} keepers`
  where `keepers` counts groups with a selection.
- No persistence (resets on reload). The `app-context` keepers API is no longer used by
  Duplicates and is removed in 3b.

## 9. Testing & verification

**Server** (`server/lib/queries.test.ts`, node project):
- `getDuplicateGroups()` returns **24** groups; counts are 8×2, 8×3, 8×4; each group's
  `files.length === count`; every member's `hash`/`filename` match the group;
  `directories` and member `directory` are display labels (`C:/…`, `D:/…`).
- Total `redundantSpace` = `48 * 640_000 = 30_720_000`, matching
  `expectedFixtureStats(buildFixtureFiles())`.

**Client** (`app/features/duplicates/DuplicatesPage.test.tsx`, jsdom):
- Renders a real-shaped `DuplicateGroup[]`; asserts the summary (`N groups · M files ·
  0 keepers`) and a group name.
- Keeper interaction: toggling sets 1 keeper; toggling a different file in the same
  group keeps the total at 1 (moves it); toggling the same file clears it.
- `mock-data.test.ts` updated (no `groups`).

**Gates:** `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build`;
SSR smoke of `/duplicates` shows real groups.

## 10. Task outline (detailed plan via writing-plans)

1. Evolve `DuplicateGroup`; delete mock `groups`; fix `mock-data.test.ts`.
2. `getDuplicateGroups()` query + `server/routes/duplicates.ts`.
3. `DuplicatesPage`/`DuplicateGroupTable`/`DirectoryPicker` on real props (numeric
   redundant space; real filters).
4. Keeper selection one-per-group (local state) + live summary.
5. Server + client tests; `/duplicates` route loader.
6. Final verification (`pnpm check`, `pnpm build`, SSR smoke).

## 11. Follow-ups (recorded, not Phase 3a)

- **3b:** real engine scan + progress streaming to Activity; real Duplicates nav badge;
  remove dead `filtered`/`entries`/`keepers` from `app-context`.
- **Phase 4:** keeper persistence, Reveal/Open actions, `app_config` preferences.
