# Phase 1 — Static UI Port — Design

**Date:** 2026-09-02
**Status:** Approved by user (sections presented 2026-09-02)
**Repo:** `jirwong/imgsorter-app` (now the primary repo for the imgsorter product)

---

## 1. Background & source repositories

The imgsorter product is a local, single-user, dark-themed media-library tool: index local folders,
find duplicate files and where each copy lives, review them, and understand storage and backup
coverage. It was developed across two prototype repositories:

- **`jirwong/imgsorter-v2`** — a Node/TypeScript CLI that indexes local files into a SQLite database
  (better-sqlite3) using edge-SHA-256 hashes, and detects duplicates. Its core (`Runner`, phases,
  `DbService`, `ProgressEmitter`, `file-service`, config loading) is structured to be reusable, but it
  has **no read/query methods** for analytics and no library build. This engine will be **vendored**
  into the app during Phase 2; this app becomes the **primary** repo and the engine evolves here.
- **`jirwong/imgsorter-ui-v1`** — a v0.dev-generated mock of the full product UI: plain React/Vite,
  Mantine v9, all views and interactions in a single `App.tsx`, all data hardcoded mock data, no
  backend. This is the visual and behavioral contract the product wants. Its `HANDOVER.md` exists on
  an unmerged branch (`git show f125add:HANDOVER.md` in that repo) and describes the intended
  restructure.
- **`jirwong/basic-typescript-template`** — the user's default TypeScript-project conventions
  (pnpm, oxlint, prettier, vitest, lefthook, t3-env/zod, Node 24) which this project adopts where
  compatible.

## 2. Locked decisions (brainstorm outcomes)

| Decision | Choice |
|---|---|
| Form factor | **Local server app** — a Tanstack Start Node server on the user's machine (localhost); browser UI; engine runs in the server process with filesystem/sqlite access. |
| UI substrate | **Mantine v9** (as in the mock) with the mock's custom dark tokens. |
| Engine relationship | **Vendor** the imgsorter-v2 core into this repo (Phase 2). No cross-repo dependency; drift acceptable because this app is now the primary repo. |
| Repo primacy | **imgsorter-app is the primary repo.** The standalone imgsorter-v2 CLI is superseded. |
| Phase 1 scope | **Full static UI port first** — complete feature parity with the mock, all data mocked and isolated behind one module; no engine work in Phase 1. |
| Testing bar | **Full** — component (Testing Library) + unit tests, coverage thresholds, typecheck/lint/prettier/build green on every PR. |
| Structure | **Approach A: route-driven with shared libs** — each view is a route; page-specific pieces colocated with their route; shared chrome/components in `src/components/`; domain types/mock/helpers in `src/lib/`. |
| Roadmap | A **`docs/ROADMAP.md`** capturing the multi-phase plan (Phase 1–3+) is created in the first PR. |

## 3. Phase 1 goal

A faithful, modular Tanstack Start port of the `imgsorter-ui-v1` mock: every screen, every simulated
behavior, and every visual detail reproduced, with mock data quarantined behind a single
well-named module and pure logic extracted into unit-tested helpers. **"Done" = visual and
behavioral parity with the mock**, verifiable side-by-side.

The port is intentionally static. No filesystem access, no sqlite, no scan engine, no server
functions, no persistence, no real thumbnails, no keeper persistence, no export. Decorative
controls (Export, Reveal, Open file) render but stay inert exactly as in the mock. No new screens
or features beyond the mock.

## 4. Tech stack

- **Framework:** Tanstack Start, scaffolded from the official `create` template, trimmed to an
  **SPA-style client** (`ssr: false`). A localhost single-user tool gains nothing from SSR, and
  SPA mode avoids Mantine style-injection/flash complexity. Server routes are enabled in Phase 2
  when the engine lands. If scaffold friction arises, default SSR is an acceptable fallback with no
  change to page code.
- **UI:** Mantine v9 (as the mock) + lucide-react icons + a small global token stylesheet + scoped
  CSS modules for bespoke pieces.
- **Conventions (from `basic-typescript-template`):** pnpm, oxlint, prettier (2-space, single
  quotes, print width 120, trailing commas all), vitest 4, lefthook + lint-staged, editorconfig,
  AGENTS.md, Conventional Commits, strict TypeScript, named exports only.
- **TypeScript version:** whatever the Tanstack Start template supports cleanly (may differ from the
  template's TS 7 pin, which is inert in a Node/esbuild setup but not necessarily safe in a Vite
  React app). Confirmed at scaffold time, not forced.
- **Runtime:** Node 24 (matching template `.nvmrc`/`.node-version`).

## 5. Repo structure

```
imgsorter-app/
  docs/ROADMAP.md                     ← multi-phase plan (created in PR task 1)
  docs/superpowers/specs/…            ← per-phase designs (this file)
  src/
    client.tsx / router.tsx           ← Tanstack Start entry
    lib/                              ← framework-free, fully unit-testable
      types.ts                        ← domain model (Entry, DuplicateGroup, DirectoryNode, …)
      mock-data.ts                    ← THE mock seam — all fake data generated here, nowhere else
      format.ts                       ← bytes/date/number formatting (mirrors mock's format())
      filters.ts                      ← query/directory/ext/count/size filtering + sorting (pure)
      duplicates.ts                   ← group-by-hash derivation, redundant-space math
      directory.ts                    ← directory-scope matching for the browse tree
      paginate.ts
      theme.ts                        ← ported Mantine dark theme + cyan palette tokens
    components/                       ← genuinely shared chrome
      layout/(app-shell, sidebar, topbar, status-footer)
      page-header.tsx                 ← eyebrow + title + subtitle + decorative Export
      file-details-drawer.tsx         ← global drawer
      files-table.tsx                 ← shared by Unique Files + Browse
      directory-tree.tsx              ← recursive checkbox tree (Browse)
      badges/metric-card/empty-state/…
    routes/
      __root.tsx                      ← AppShell layout + shared UI-state providers
      index.tsx                       ← Overview
      duplicates/index.tsx            ← route; page assembled from colocated files
      unique-files/index.tsx
      analytics/index.tsx
      browse/index.tsx
      activity/index.tsx
      preferences/index.tsx
```

Rules:

- **Route folder holds its page.** Larger pages colocate page-specific files next to their route
  (e.g. `routes/duplicates/{filters,duplicate-group-table,keeper-toggle}.tsx`); small pages keep
  everything in the route file. Non-route files in `routes/` must not match route-file conventions.
- `src/lib/**` is framework-free and purely testable; pages never import mock arrays directly.
- Shared chrome lives in `src/components/` only when used by 2+ pages; everything else is
  page-colocated.

## 6. Data architecture

### Domain model (`lib/types.ts`)

Mirrors the contracts the real engine will satisfy in Phase 2 (and imgsorter-v2's `FileEntry`):

- `Entry { id: number; size: number; directory: string; extension: string; filename: string;
  birthtime: string; hash: string | null; path: string }`
- `DuplicateGroup { hash: string; name: string; count: number; space: string; files: Entry[] }`
  (`space` preformatted as in the mock; the pure redundant-space computation lives in
  `lib/duplicates.ts`)
- `DirectoryNode { label: string; path: string; children?: DirectoryNode[] }`
- `ActivityLogEntry { time: string; event: string; directory: string; status: 'Running' |
  'Warning' | 'Complete' }`
- `ScanStatus` (`scanActive: boolean`), `IndexedDirectory { path; enabled; lastScan; files }`,
  `IgnoredDirectory = string`
- `Preferences { databaseName; extensions; processDirectories; updateRecords; resyncDirectories;
  verifyFiles }`
- Derived view shapes (overview metrics, storage map, last-run steps, rankings) typed from these.

### Mock seam (`lib/mock-data.ts`)

The **only** module that produces fake data. It generates the mock's full dataset (entries, hash
groups, directory tree, activity logs, preferences, directory configs, overview numbers) as plain
typed arrays/values and exports them as a single library object. The exact numbers/strings from the
mock (e.g. 18,426 files / 2.4 GB, the 3 duplicate groups, thumbnail URLs, scan strings) are
reproduced.

Pages receive data as props or read it via selectors; they never import `mock-data.ts` directly,
so Phase 2 can swap the data source at the route boundary (a loader/server function) without
touching page internals. No abstract repository interface in Phase 1 (YAGNI).

### Pure selectors (all unit-tested)

- `format.ts` — byte formatting (`>1e9 → x.x GB` else `x.x MB`), date display (`birthtime.slice(0,10)`),
  number formatting with separators.
- `filters.ts` — query (filename + path, case-insensitive), directory, extension, count and size
  filters plus column sorting, matching the mock's Duplicates and Files behavior.
- `duplicates.ts` — group derivation (keyed by hash), `space`/redundant-space math
  (sum of `(count−2) × size` over count>2 groups for Overview), sort by count/size.
- `directory.ts` — directory-tree scope matching (`entry.directory === scope ||
  startsWith(scope + separator)`), used by Browse filtering.
- `paginate.ts` — page-size select + prev/next + page counter for Analytics.

## 7. Routing & shared UI state

Views map to routes: `/` Overview, `/duplicates`, `/unique-files`, `/analytics`, `/browse`,
`/activity`, `/preferences`. Sidebar nav highlights the active route.

State placement:

- **Topbar global filters** (`q`, `dir`, `ext`): only ever fed Unique Files + Browse in the mock.
  They become URL search params on those two routes; the topbar binds to them there and renders
  inert elsewhere (as today).
- **File-details drawer**: opened from Overview, Duplicates, Unique Files, Browse via a
  `FileDetailsProvider` mounted in `__root.tsx` exposing `openFile(entry)`; the drawer renders once
  in the app shell. No URL coupling in Phase 1.
- **Duplicates page**: its full filter state (search, directory multi-select, count/size/ext
  selects, sort, expanded groups, keepers) is page-local, mirroring mock interactions. Keepers
  persist in Phase 3.
- **Scan simulation**: the sidebar "Scan library" button is a layout-level action — it flips
  `ScanSimulationProvider` state (`scanActive`, event `logs`), routes to `/activity`, and appends a
  "Scan started / Running" log, replicating the mock's only cross-page interaction. Activity reads
  the same provider.
- **Preferences**: self-contained; tab selection maps to a `?tab=application|directories` search
  param (deep-linkable). Fields, validation messages, Saved badge, and Reset are component state.

## 8. Visual system

Port the mock's dark tokens into `lib/theme.ts` as a Mantine `createTheme`:

- Palette: background `#101318`, cards `#171b22` / `#1d232c`, primary cyan `#18c7d8` (custom 10-step
  ramp), muted `#8d98a8`, border `#2a323d`, text `#edf3f7`, orange `#f5a34a`, green status `#59d390`;
  sidebar `#12161c`, header `#141920`, hover `#202932`, keeper-row teal accents.
- Dark color scheme only; `fontFamily: Inter`, mono stacks for paths/hashes; `defaultRadius: 'md'`.
- A small global stylesheet for resets/tokens + scoped CSS modules for bespoke pieces (layout shell,
  thumbnails, eyebrow labels, keeper rows).
- Responsive breakpoints preserved (≈900/800/700/650 px) with the mobile title menu at ≤650 px.

Result is visually indistinguishable from the mock.

## 9. Shared components inventory

- Layout: `AppShell` (sidebar + topbar + scrollable content + footer), `Sidebar` (brand, Scan
  library button, status block, nav, pinned Preferences), `Topbar` (mobile title, global search,
  directory/extension selects, status pill), `StatusFooter`.
- `PageHeader` (eyebrow, title, subtitle, decorative Export).
- `FileDetailsDrawer` (path/size/ext/created/hash, Reveal/Open inert).
- `FilesTable` (shared by Unique Files + Browse; filename/dir/ext/size/date columns, sort, open
  file, unique-mode Preview action column).
- `DirectoryTree` (recursive checkbox tree).
- Small shared: `MetricCard`, `DuplicateBadge`, `StatusBadge`, `EmptyState`. (`KeepToggle` is
  Duplicates-only and is colocated with that route, per the shared-components rule.)

## 10. Testing

Vitest 4 + jsdom + `@testing-library/react` (`user-event`, `jest-dom`); a shared
`renderWithMantine` test wrapper.

- `lib/**` pure modules: thorough unit tests (highest-value coverage).
- Pages/components: behavioral tests — render with mock data, assert content and interactions
  (nav highlighting, Overview cards, duplicate expand/keeper/drawer-open, files-table filtering,
  directory-tree scope matching, activity scan simulation, preferences add/remove/save/reset/tab).
- 80% coverage thresholds (template default), typecheck, lint, prettier check, and build green on
  every PR.

## 11. Phase 1 PR breakdown (execution order)

Each task is one independent PR under the operating-rule review loop. Task 1 is the only hard
prerequisite; tasks 2–3 enable 4–10.

| # | Task | Delivers |
|---|------|----------|
| 1 | Scaffold | Tanstack Start SPA template; pnpm/oxlint/prettier/vitest/lefthook/editorconfig; AGENTS.md; CI workflow; `docs/ROADMAP.md`; placeholder shell |
| 2 | Theme + layout chrome | `theme.ts` tokens; MantineProvider; AppShell (sidebar/topbar/footer); nav wiring; PageHeader; `FileDetailsProvider` + global drawer |
| 3 | Data layer | `types.ts`; `mock-data.ts` seam; pure helpers (`format`, `filters`, `duplicates`, `directory`, `paginate`) + unit tests |
| 4 | Overview | metric cards, storage map, last-run, at-a-glance largest files, open-file → drawer |
| 5 | Duplicates | filters (search/dir/count/size/ext), sortable expandable groups, keepers, preview → drawer |
| 6 | Unique Files + Analytics | shared `FilesTable`, Unique Files, Analytics rankings + pagination |
| 7 | Browse | recursive `DirectoryTree` + path-scope filtering + files table |
| 8 | Activity | scan-simulation provider, event log, status badge, sidebar "Scan library" interaction |
| 9 | Preferences | two tabs, indexed/ignored directory add-remove + validation, app settings, Save/Reset, `?tab=` param |
| 10 | Polish + parity pass | responsive, empty states, a11y labels, final visual/behavioral parity vs mock |

## 12. Roadmap (Phase 2+) — recorded intent

Recorded so later phases keep direction; details are designed when each phase starts.

- **Phase 2 — Engine integration & real indexing.** Vendor the imgsorter-v2 core into the app; add
  the missing sqlite read/query layer (biggest files/folders, group-by-hash, unique set, storage
  totals, per-directory sizes); expose server routes/functions; run real scans with progress
  (Activity); Preferences persist to a real config; Overview metrics and Browse/Unique Files read
  the real DB.
- **Phase 3+ — Feature-by-feature with real data.** Each as its own PR cycle: real duplicate
  grouping + keeper state (UI-state only, not written back); live thumbnail/preview endpoint;
  analytics queries; backup-coverage view (introduces the backup-path concept the CLI lacks);
  CSV/JSON export.
- Standing non-goals (from the imgsorter-v2 electron spec and this brainstorm): no delete/move of
  files, no light mode, no multi-user/auth, no editing of DB rows from the UI.

`docs/ROADMAP.md` (PR task 1) will capture this at a level appropriate for a repo-reader.
