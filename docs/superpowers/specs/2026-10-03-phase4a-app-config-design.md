# imgsorter-app — Phase 4a Design: app_config Persistence + Preferences Directory Management

**Date:** 2026-10-03
**Status:** Draft for review
**Scope:** Phase 4a only — give the Preferences page a real, scan-proof place to remember
the indexed/ignored directory lists and the application settings (extensions + toggles).
Scanning configured directories (4b), Reveal/Open actions (4c), and keeper persistence
(4d) are out of scope.

## 1. Context & source material

Phase 3 finished the real scan and progress streaming. Today:

- `app/features/preferences/PreferencesPage.tsx` is **entirely local state** over the
  `preferences` object in `app/lib/mock-data.ts`. "Save preferences" only flips a boolean;
  directory add/remove/enable mutate in-memory state. Nothing persists.
- There is **no `app_config` table**: the vendored engine's `DbService` creates only
  `entries` + `records`. The roadmap's "`app_config` managed by the engine" is aspirational.
- Both `pnpm seed` and the UI scan (`server/lib/scan-runner.ts`) **delete and rebuild**
  `server/data/imgsorter.db`, so any config stored in that file would be wiped.
- The vendored engine (`server/engine/`) is kept **verbatim**; we should not modify it.

**Decisions made during brainstorming:**

- **Split Phase 4** into 4a–4d; design 4a first (this spec).
- **4a persists** directory lists (indexed with `enabled`, and ignored) **and** application
  settings (extensions + the four toggles). The "local database name" field is **display-only**.
- Config must **survive scans and `pnpm seed`**.
- **Storage: a separate SQLite file** (`app-config.db`) in its own app-level module, so the
  scan never touches it and the vendored engine stays verbatim.
- **Save model:** directories autosave; application settings persist on "Save preferences".
- **Row metadata** (`N files · Last scan …`) is a **placeholder** in 4a; real stats arrive in 4b.
- First open **seeds defaults** matching today's mock.

## 2. Goals

- Preferences (directories + application settings) persists across page reloads, dev-server
  restarts, UI scans, and `pnpm seed`.
- The Preferences page reads its initial state from the persisted store and writes changes to it.
- Directory lists are normalized/validated server-side so stored data is always tidy.
- Keep `better-sqlite3` strictly server-side.
- No change to the fixture-driven scan or to any other page.

## 3. Non-goals (Phase 4a)

- No scanning of configured directories; the scan stays fixture-driven (4b).
- No Reveal/Open OS actions (4c); no keeper persistence (4d).
- No functional "local database name" (the DB path stays `server/data/imgsorter.db`).
- No filesystem existence validation of directory paths.
- No scan history / last-scan timestamps.
- No concurrency control beyond simple last-write-wins.

## 4. Technology

Unchanged: TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9,
`better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict.

## 5. Project structure (new/changed)

```
server/
  lib/
    app-config.ts          # NEW: createAppConfigStore(dbPath) + appConfigStore singleton
    app-config.test.ts     # NEW: node tests (temp DB path)
    db-path.ts             # appConfigDbPath()
  routes/
    preferences.ts         # NEW: getAppConfig / saveApplicationSettings / saveDirectories
app/
  lib/
    types.ts               # NEW: IndexedDirectory / DirectoriesConfig / ApplicationConfig / AppConfig
    app-config-defaults.ts # NEW: DEFAULT_APP_CONFIG (shared by server + client)
    mock-data.ts           # remove the now-unused `preferences` export
  routes/
    preferences.tsx        # loader -> getAppConfig(); pass config prop
  features/preferences/
    PreferencesPage.tsx    # read/store via loader + server fns; DB name disabled
    PreferencesPage.test.tsx
.gitignore                 # ignore server/data/app-config.db
```

## 6. Storage & data model

### 6.1 File & table

- Path: `server/data/app-config.db` via a new `appConfigDbPath()` in `server/lib/db-path.ts`.
- Gitignored (`server/data/app-config.db`; the existing `*.db-shm` / `*.db-wal` patterns
  already cover its sidecar files).
- Table: `app_config(key TEXT PRIMARY KEY, value TEXT NOT NULL)`. Values are JSON strings.
- The store opens the file per operation, ensures the schema, seeds missing keys, performs the
  operation, and closes — avoiding long-lived connections under dev HMR.

### 6.2 Shapes (`app/lib/types.ts`)

```ts
export type IndexedDirectory = { path: string; enabled: boolean };
export type DirectoriesConfig = { indexed: IndexedDirectory[]; ignored: string[] };
export type ApplicationConfig = {
  extensions: string;
  processDirectories: boolean;
  updateRecords: boolean;
  resyncDirectories: boolean;
  verifyFiles: boolean;
};
export type AppConfig = { directories: DirectoriesConfig; application: ApplicationConfig };
```

Keys in the table: `directories` → `DirectoriesConfig`; `application` → `ApplicationConfig`.

### 6.3 Defaults (`app/lib/app-config-defaults.ts`)

`DEFAULT_APP_CONFIG` matching today's mock:

- `directories.indexed`: `C:/Media/2025` (enabled), `D:/Camera Imports` (enabled)
- `directories.ignored`: `C:/Media/2025/Cache`, `C:/Media/2024/Exports`
- `application`: `extensions: 'jpg, png, gif, jpeg, mp4, mov'`; `processDirectories: true`,
  `updateRecords: true`, `resyncDirectories: false`, `verifyFiles: false`

The module is client-safe (no server-only imports) so both the server store and the client's
"Reset to defaults" use it.

### 6.4 Normalization (server-authoritative)

- `normalizePath`: trim; `\` → `/`; strip trailing `/`.
- Drop empty paths; de-duplicate case-insensitively (keep first).
- **Ignored wins:** remove any indexed entry whose path also appears in ignored.
- Coerce `enabled` and the four toggles to booleans; trim `extensions`.
- On read: malformed JSON or wrong shape falls back to the default for that key and rewrites it.

## 7. Server module & server functions

### 7.1 `server/lib/app-config.ts`

- `import '@tanstack/react-start/server-only';`
- `createAppConfigStore(dbPath: string): AppConfigStore` where
  `AppConfigStore = { get(): AppConfig; saveApplication(input: ApplicationConfig): AppConfig; saveDirectories(input: DirectoriesConfig): AppConfig }`.
  Each saver normalizes, writes both/all affected keys, and returns the resulting `AppConfig`.
- `export const appConfigStore = createAppConfigStore(appConfigDbPath());`
- The factory/singleton split mirrors `server/lib/scan.ts` and lets tests point at a temp file.

### 7.2 `server/routes/preferences.ts`

Following the `files.ts` pattern (`.validator(...).handler(({ data }) => ...)`, dynamic server-only import):

- `getAppConfig` (GET) → `appConfigStore.get()`
- `saveApplicationSettings` (POST, `data: ApplicationConfig`) → `appConfigStore.saveApplication(data)`
- `saveDirectories` (POST, `data: DirectoriesConfig`) → `appConfigStore.saveDirectories(data)`

Alias the imports inside the handler where names collide (`getAppConfig` vs the lib's `get`).

## 8. Client

### 8.1 Route (`app/routes/preferences.tsx`)

- `loader: async () => getAppConfig()`, component `<PreferencesPage config={config} />`
  (`useLoaderData({ from: '/preferences' })`), mirroring `/` and `/duplicates`.

### 8.2 `PreferencesPage`

- Takes `config: AppConfig`; removes the `mock-data` `preferences` import.
- **Directories tab (autosave):** add / remove / enable-toggle call `saveDirectories`
  (with the next list) and then `router.invalidate()` so the loader re-reads. Keeps the
  existing empty-path / already-configured messages and placeholders
  (`— files · Not scanned yet`).
- **Application tab (explicit Save):** local form state seeded from `config.application`;
  "Save preferences" calls `saveApplicationSettings` + invalidate and shows the "Saved" badge;
  "Reset to defaults" resets the form to `DEFAULT_APP_CONFIG.application` client-side only.
- The "local database name" input is **disabled**, with helper text noting the fixed path.

## 9. Lifecycle / data flow

1. Open `/preferences` → route loader calls `getAppConfig` → store opens `app-config.db`,
   seeds defaults if missing, returns `AppConfig`.
2. Add/remove/toggle a directory → `saveDirectories` normalizes + persists →
   `router.invalidate()` → loader re-reads → UI reflects the stored list.
3. Edit application settings → "Save preferences" → `saveApplicationSettings` persists →
   invalidate → "Saved" badge.
4. "Scan library" / `pnpm seed` rebuild `imgsorter.db` only; `app-config.db` is untouched, so
   settings remain.

## 10. Testing & verification

- **Server (node), `server/lib/app-config.test.ts`** (temp DB path via the factory):
  fresh file seeds defaults; `saveApplication` round-trips; `saveDirectories` normalizes
  (`\`→`/`, trailing slash, blanks, case-insensitive dupes) and enforces ignored-wins; malformed
  JSON falls back to defaults; the store uses only its own file (isolation).
- **Client (jsdom), `PreferencesPage.test.tsx`:** renders from a supplied `config`; adding a
  directory calls the directories server fn; "Save preferences" calls the settings server fn;
  "Reset to defaults" changes the form without persisting.
- **Gates:** `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build`
  (no `better-sqlite3`/`sqlite` in `dist/client`).
- **Manual smoke:** add/remove/toggle a directory and save settings; refresh → persists;
  run "Scan library"; run `pnpm seed`; confirm both still persist. `git restore` the committed
  DB afterward.

## 11. Task outline (detailed via writing-plans)

1. Types + defaults + `appConfigDbPath()` + `.gitignore`; server `app-config.ts` store with
   tests; `server/routes/preferences.ts` server fns.
2. Wire `/preferences` loader + `PreferencesPage` to load/save (directories autosave,
   settings Save, disabled DB name, placeholders); update client tests.
3. Final verification (`pnpm check`, `pnpm build`, manual persist smoke) + record Phase 4a
   progress in `ROADMAP.md`/`AGENTS.md` (Phase 4 stays in progress; 4b–4d remain).

## 12. Trade-offs & follow-ups

- Two SQLite files; `app-config.db` is dev-local/gitignored, so fresh clones start at defaults.
- A second `better-sqlite3` opener exists, but stays server-only (build check guards leaks).
- Validation is hand-rolled (no zod); small and covered by tests.
- Wording drift from the roadmap: `app_config` is app-owned in its own file rather than
  engine-managed, chosen deliberately so scans cannot erase it.
- Phase 4b will make the scan read these directories (replacing the fixture tree source) and
  can surface real per-directory counts / last-scan; 4c/4d add Reveal/Open and keepers.
