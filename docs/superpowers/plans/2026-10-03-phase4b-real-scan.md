# Phase 4b (Real Configured-Directory Scan + Per-Directory Stats) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the UI "Scan library" scan the real enabled directories from `app_config` (minus ignored) incrementally, record per-directory `lastScannedAt`, and show real per-directory file counts + last scan in Preferences — with the app DB split from a committed test fixture.

**Architecture:** Split `server/data/imgsorter.db` (app DB, gitignored) from `server/data/fixture.db` (committed test fixture) with an env-overridable query path. Add `server/lib/scan-configured.ts` (`createConfiguredScan` factory + `runConfiguredScan` singleton) that builds the engine `RunConfiguration` from `app_config`, refuses when unconfigured, runs incrementally, and records `lastScannedAt` under a new `directory_meta` key. `queries.countEntriesByDirectory` + `getPreferencesData` feed the Preferences rows.

**Tech Stack:** TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9, `better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-10-03-phase4b-real-scan-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24.
- Prettier 2-space, single quotes, semicolons, print width 120. **No comments in new code.**
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- Engine/`better-sqlite3` is server-only; never in a client bundle. Server fns dynamically `import()` server libs inside the handler.
- App DB `server/data/imgsorter.db` is **gitignored**; `server/data/fixture.db` is committed and used only by tests (via `IMGSORTER_DB_PATH`).
- The UI scan is **incremental** (no DB delete); the "Resync directories" toggle removes stale entries.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; never merge.
- Non-goals: Reveal/Open + folder picker (4c), keeper persistence (4d), Overview/Footer last-run, scan history.

---

### Task 1: Split the app DB from the committed test fixture

**Files:**
- Modify: `server/lib/db-path.ts`
- Modify: `server/lib/db-path.test.ts`
- Modify: `server/lib/scan-runner.ts`
- Modify: `scripts/seed.ts`
- Modify: `server/lib/queries.ts`
- Modify: `server/lib/queries.test.ts`
- Modify: `vitest.config.ts`
- Modify: `.gitignore`
- Regenerate `server/data/fixture.db`; untrack `server/data/imgsorter.db`

**Interfaces:**
- Produces: `fixtureDbPath(): string`; `runFixtureScan({ progress, signal, dbPath })`; env-overridable `queries` path; `countEntriesByDirectory(root): number`.

- [ ] **Step 1: Add `fixtureDbPath()` to `server/lib/db-path.ts`**

Add after `sampleDbPath()`:

```ts
export function fixtureDbPath(): string {
  return join(serverDir, 'data', 'fixture.db');
}
```

- [ ] **Step 2: Extend `server/lib/db-path.test.ts`**

Replace the import line:

```ts
import { appConfigDbPath, fixtureDbPath, fixturesDir, sampleDbPath, virtualToReal } from './db-path';
```

Add a test after the app-config test:

```ts
  it('derives the committed fixture db path under server/data', () => {
    expect(normalize(fixtureDbPath())).toMatch(/\/server\/data\/fixture\.db$/);
  });
```

- [ ] **Step 3: Parameterize the fixture runner — `server/lib/scan-runner.ts`**

Replace the import on line 11:

```ts
import { fixturesDir, virtualToReal } from './db-path';
```

Replace the deps type and the function signature + body references:

```ts
export type RunFixtureScanDeps = { progress: ProgressSink; signal: AbortSignal; dbPath: string };

export async function runFixtureScan({ progress, signal, dbPath }: RunFixtureScanDeps): Promise<RunSummary> {
  writeFixtureTree();
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  mkdirSync(dirname(dbPath), { recursive: true });

  const config: RunConfiguration = {
    dbName: dbPath,
    extensions: ['.jpg', '.png', '.gif'],
    directories: [...FIXTURE_ROOTS].map(virtualToReal),
    ignore_directories: [],
    update_records: true,
    process_directories: true,
    resync_directories: false,
    resync_check_actual_file: false,
  };
```

In the post-processing block, replace both `sampleDbPath()` uses with `dbPath`:

```ts
  try {
    const db = new Database(dbPath);
    try {
      db.prepare(
        `UPDATE entries SET
           directory = replace(replace(directory, @root, '@fixtures'), char(92), '/'),
           path = replace(replace(path, @root, '@fixtures'), char(92), '/'),
           birthtime = '2025-0' || ((id % 8) + 1) || '-1' || (id % 9) || 'T10:24:00Z'`,
      ).run({ root: fixturesDir() });
    } finally {
      db.close();
    }

    const service = new DbService(dbPath);
    try {
      service.updateFileRecords();
    } finally {
      service.close();
    }
  } finally {
    removeFixtureTree();
  }
```

- [ ] **Step 4: Point the seed at the fixture DB — `scripts/seed.ts`**

Replace the imports and `main`:

```ts
import { expectedFixtureStats } from '../server/lib/fixture-plan';
import { fixtureDbPath } from '../server/lib/db-path';
import { runFixtureScan } from '../server/lib/scan-runner';

async function main(): Promise<void> {
  const summary = await runFixtureScan({
    progress: silentProgress(),
    signal: new AbortController().signal,
    dbPath: fixtureDbPath(),
  });

  const expected = expectedFixtureStats();
  console.log(
    `Seed complete: ${expected.totalFiles} files, ${expected.totalSize} bytes, ${expected.duplicateGroups} duplicate groups`,
  );
  console.log(`Scan summary: ${summary.filesScanned} scanned, ${summary.entriesWritten} written`);
}
```

(Keep `silentProgress` and the `main().catch(...)` tail unchanged.)

- [ ] **Step 5: Env-overridable path + missing-DB tolerance + root counts — replace `server/lib/queries.ts`**

```ts
import '@tanstack/react-start/server-only';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { applyFilters } from '../../app/lib/filter-pipeline';
import type {
  AnalyticsData,
  DirectoryNode,
  DuplicateGroup,
  Entry,
  FilesInput,
  OverviewData,
  ShellData,
} from '../../app/lib/types';
import { mapPathToDisplay, rootLabelOf } from './labels';
import { buildDirectoryTree } from './tree';
import { sampleDbPath } from './db-path';

type EntryRow = {
  id: number;
  size: number;
  directory: string;
  extension: string;
  filename: string;
  birthtime: string;
  hash: string | null;
  path: string;
};

function dbPath(): string {
  return process.env.IMGSORTER_DB_PATH ?? sampleDbPath();
}

function openReadonly(): DatabaseType | null {
  const path = dbPath();
  if (!existsSync(path)) return null;
  return new Database(path, { readonly: true });
}

function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    size: row.size,
    directory: mapPathToDisplay(row.directory),
    extension: row.extension,
    filename: row.filename,
    birthtime: row.birthtime,
    hash: row.hash,
    path: mapPathToDisplay(row.path),
  };
}

export function getOverviewStats(): OverviewData {
  const db = openReadonly();
  if (!db) {
    return {
      totalFiles: 0,
      totalSize: 0,
      duplicateGroups: 0,
      redundantSpace: 0,
      uniqueFiles: 0,
      storageMap: [],
      largestFiles: [],
    };
  }
  try {
    const totals = db.prepare(`SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS size FROM entries`).get() as {
      files: number;
      size: number;
    };
    const groups = db.prepare(`SELECT COUNT(*) AS n FROM records WHERE count > 1`).get() as { n: number };
    const redundant = db
      .prepare(`SELECT COALESCE(SUM((count - 1) * size), 0) AS space FROM records WHERE count > 1`)
      .get() as {
      space: number;
    };
    const unique = db
      .prepare(
        `SELECT COUNT(*) AS n FROM (SELECT hash FROM entries WHERE hash IS NOT NULL GROUP BY hash HAVING COUNT(*) = 1)`,
      )
      .get() as { n: number };
    const dirAgg = db.prepare(`SELECT directory, SUM(size) AS size FROM entries GROUP BY directory`).all() as {
      directory: string;
      size: number;
    }[];
    const largest = db
      .prepare(
        `SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries ORDER BY size DESC, filename ASC LIMIT 4`,
      )
      .all() as EntryRow[];

    const byRoot = new Map<string, number>();
    for (const row of dirAgg) {
      const label = rootLabelOf(mapPathToDisplay(row.directory));
      byRoot.set(label, (byRoot.get(label) ?? 0) + row.size);
    }
    const storageMap = [...byRoot.entries()]
      .map(([path, size]) => ({
        path,
        size,
        share: totals.size === 0 ? 0 : Math.round((size / totals.size) * 100),
      }))
      .sort((a, b) => b.size - a.size);

    return {
      totalFiles: totals.files,
      totalSize: totals.size,
      duplicateGroups: groups.n,
      redundantSpace: redundant.space,
      uniqueFiles: unique.n,
      storageMap,
      largestFiles: largest.map(toEntry),
    };
  } finally {
    db.close();
  }
}

export function listEntries(input: FilesInput): Entry[] {
  const db = openReadonly();
  if (!db) return [];
  try {
    const rows = db
      .prepare(`SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries`)
      .all() as EntryRow[];
    return applyFilters(rows.map(toEntry), input.query, input.dir, input.ext, input.selectedDirs);
  } finally {
    db.close();
  }
}

export function getDirectoryTree(): DirectoryNode[] {
  const db = openReadonly();
  if (!db) return [];
  try {
    const rows = db.prepare(`SELECT DISTINCT directory FROM entries`).all() as { directory: string }[];
    return buildDirectoryTree(rows.map((row) => mapPathToDisplay(row.directory)));
  } finally {
    db.close();
  }
}

export function getAnalyticsData(): AnalyticsData {
  const db = openReadonly();
  if (!db) return { rankedBySize: [], rankedByCopies: [] };
  try {
    const rankedBySize = db.prepare(`SELECT filename, size FROM entries ORDER BY size DESC`).all() as {
      filename: string;
      size: number;
    }[];
    const rankedByCopies = db
      .prepare(`SELECT filename AS name, count FROM records WHERE count > 1 ORDER BY count DESC, filename ASC`)
      .all() as { name: string; count: number }[];
    return { rankedBySize, rankedByCopies };
  } finally {
    db.close();
  }
}

export function getShellData(): ShellData {
  const db = openReadonly();
  if (!db) return { files: 0, size: 0, roots: [], extensions: [], duplicateGroups: 0 };
  try {
    const totals = db.prepare(`SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS size FROM entries`).get() as {
      files: number;
      size: number;
    };
    const dirs = db.prepare(`SELECT DISTINCT directory FROM entries`).all() as { directory: string }[];
    const exts = db.prepare(`SELECT DISTINCT extension FROM entries ORDER BY extension`).all() as {
      extension: string;
    }[];
    const roots = [...new Set(dirs.map((row) => rootLabelOf(mapPathToDisplay(row.directory))))].sort();
    const groups = db.prepare(`SELECT COUNT(*) AS n FROM records WHERE count > 1`).get() as { n: number };
    return {
      files: totals.files,
      size: totals.size,
      roots,
      extensions: exts.map((row) => row.extension),
      duplicateGroups: groups.n,
    };
  } finally {
    db.close();
  }
}

export function getDuplicateGroups(): DuplicateGroup[] {
  const db = openReadonly();
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        `SELECT filename, hash, count, size, extension, directories FROM records WHERE count > 1 ORDER BY filename`,
      )
      .all() as {
      filename: string;
      hash: string;
      count: number;
      size: number;
      extension: string;
      directories: string;
    }[];
    const memberStmt = db.prepare(
      `SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries WHERE hash = ? AND filename = ? ORDER BY path`,
    );
    return rows.map((row) => {
      const files = memberStmt.all(row.hash, row.filename) as EntryRow[];
      return {
        key: `${row.hash}:${row.filename}`,
        hash: row.hash,
        name: row.filename,
        count: row.count,
        size: row.size,
        redundantSpace: (row.count - 1) * row.size,
        extension: row.extension,
        directories: (JSON.parse(row.directories) as string[]).map(mapPathToDisplay),
        files: files.map(toEntry),
      };
    });
  } finally {
    db.close();
  }
}

export function countEntriesByDirectory(root: string): number {
  const db = openReadonly();
  if (!db) return 0;
  try {
    const normalized = root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const escaped = normalized.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM entries
         WHERE lower(replace(directory, char(92), '/')) = ?
            OR lower(replace(directory, char(92), '/')) LIKE ? ESCAPE '\\'`,
      )
      .get(normalized, `${escaped}/%`) as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}
```

- [ ] **Step 6: Update `server/lib/queries.test.ts`**

Add imports at the top:

```ts
import { tmpdir } from 'node:os';
import { join } from 'node:path';
```

Add `countEntriesByDirectory` to the existing import from `./queries`. Add two tests inside the describe:

```ts
  it('counts entries under a root case- and separator-insensitively', () => {
    const trips = countEntriesByDirectory('@fixtures/Media/2025/Trips');
    const media = countEntriesByDirectory('@fixtures/Media/2025');
    expect(media).toBeGreaterThan(trips);
    expect(countEntriesByDirectory('@FIXTURES/media/2025')).toBe(media);
    expect(countEntriesByDirectory('@fixtures/Media/2025/nope')).toBe(0);
  });

  it('returns empty shapes when the db is missing', () => {
    const previous = process.env.IMGSORTER_DB_PATH;
    process.env.IMGSORTER_DB_PATH = join(tmpdir(), 'imgsorter-missing-xyz.db');
    try {
      expect(getShellData()).toEqual({ files: 0, size: 0, roots: [], extensions: [], duplicateGroups: 0 });
      expect(listEntries({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] })).toEqual([]);
    } finally {
      process.env.IMGSORTER_DB_PATH = previous;
    }
  });
```

- [ ] **Step 7: Point the server test project at the fixture DB — `vitest.config.ts`**

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'client',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          include: ['app/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          globals: true,
          include: ['server/**/*.test.{ts,tsx}'],
          env: {
            IMGSORTER_DB_PATH: fileURLToPath(new URL('./server/data/fixture.db', import.meta.url)),
          },
        },
      },
    ],
  },
});
```

- [ ] **Step 8: Ignore the app DB — `.gitignore`**

Add after the `server/data/app-config.db` line:

```
server/data/imgsorter.db
```

- [ ] **Step 9: Generate the fixture DB and untrack the app DB**

Run:

```bash
pnpm seed
git add server/data/fixture.db
git rm --cached server/data/imgsorter.db
trash server/data/imgsorter.db
```

Expected: `pnpm seed` prints `Seed complete: 1272 files, 46360800 bytes, 24 duplicate groups` and writes `server/data/fixture.db`; `imgsorter.db` is removed from the index and from disk (the app starts empty).

- [ ] **Step 10: Run the full check + build**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass (21 test files); build succeeds with no `better-sqlite3` in `dist/client`.

- [ ] **Step 11: Commit**

```bash
git add server/lib/db-path.ts server/lib/db-path.test.ts server/lib/scan-runner.ts scripts/seed.ts server/lib/queries.ts server/lib/queries.test.ts vitest.config.ts .gitignore server/data/fixture.db
git commit -m "refactor: split app db from committed test fixture"
```

### Task 2: Config-driven incremental scan

**Files:**
- Modify: `app/lib/types.ts`
- Modify: `app/lib/app-config-defaults.ts`
- Modify: `server/lib/app-config.ts`
- Modify: `server/lib/app-config.test.ts`
- Create: `server/lib/scan-configured.ts`
- Create: `server/lib/scan-configured.test.ts`
- Modify: `server/lib/scan.ts`
- Modify: `app/features/preferences/PreferencesPage.test.tsx`

**Interfaces:**
- Consumes: `appConfigStore`, `AppConfig`, `sampleDbPath()`.
- Produces: `DirectoryMeta`, `AppConfig.directoryMeta`; `appConfigStore.recordScannedDirectories(paths, at)`; `createConfiguredScan(deps)`, `runConfiguredScan`, `NoDirectoriesConfiguredError`.

- [ ] **Step 1: Add `DirectoryMeta` + `directoryMeta` — `app/lib/types.ts`**

Append:

```ts
export type DirectoryMeta = Record<string, { lastScannedAt: string }>;
```

Change the `AppConfig` type to:

```ts
export type AppConfig = {
  directories: DirectoriesConfig;
  application: ApplicationConfig;
  directoryMeta: DirectoryMeta;
};
```

- [ ] **Step 2: Update defaults — `app/lib/app-config-defaults.ts`**

Replace the object so indexed/ignored are empty and `directoryMeta` is present:

```ts
export const DEFAULT_APP_CONFIG: AppConfig = {
  directories: {
    indexed: [],
    ignored: [],
  },
  application: {
    extensions: 'jpg, png, gif, jpeg, mp4, mov',
    processDirectories: true,
    updateRecords: true,
    resyncDirectories: false,
    verifyFiles: false,
  },
  directoryMeta: {},
};
```

- [ ] **Step 3: Write the failing store tests — append to `server/lib/app-config.test.ts`**

Add after the `writes only to its own file` test:

```ts
  it('records last-scanned metadata per directory', () => {
    const saved = store.recordScannedDirectories(['C:\\Photos\\'], '2026-10-03T12:00:00.000Z');
    expect(saved.directoryMeta['c:/photos']).toEqual({ lastScannedAt: '2026-10-03T12:00:00.000Z' });
    expect(store.get().directoryMeta['c:/photos']).toEqual({ lastScannedAt: '2026-10-03T12:00:00.000Z' });
  });

  it('keeps directory metadata when directories are saved', () => {
    store.recordScannedDirectories(['C:/Photos'], '2026-10-03T12:00:00.000Z');
    const saved = store.saveDirectories({ indexed: [], ignored: [] });
    expect(saved.directoryMeta['c:/photos']).toEqual({ lastScannedAt: '2026-10-03T12:00:00.000Z' });
  });
```

- [ ] **Step 4: Run the store tests to verify they fail**

Run: `pnpm exec vitest run server/lib/app-config.test.ts`
Expected: FAIL — `recordScannedDirectories` is not a function.

- [ ] **Step 5: Add `directory_meta` to `server/lib/app-config.ts`**

Add the key constant next to the others:

```ts
const DIRECTORY_META_KEY = 'directory_meta';
```

Add a guard next to `isDirectoriesConfig`:

```ts
function isDirectoryMeta(value: unknown): value is DirectoryMeta {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (entry) => isRecord(entry) && typeof entry.lastScannedAt === 'string',
  );
}
```

Add `recordScannedDirectories` to the store type:

```ts
export type AppConfigStore = {
  get: () => AppConfig;
  saveApplication: (input: ApplicationConfig) => AppConfig;
  saveDirectories: (input: DirectoriesConfig) => AppConfig;
  recordScannedDirectories: (paths: string[], at: string) => AppConfig;
};
```

Import the type:

```ts
import type { AppConfig, ApplicationConfig, DirectoriesConfig, DirectoryMeta, IndexedDirectory } from '../../app/lib/types';
```

Extend `readConfig` to include metadata:

```ts
function readConfig(db: DatabaseType): AppConfig {
  return {
    directories: readKey(db, DIRECTORY_KEY, DEFAULT_APP_CONFIG.directories, isDirectoriesConfig),
    application: readKey(db, APPLICATION_KEY, DEFAULT_APP_CONFIG.application, isApplicationConfig),
    directoryMeta: readKey(db, DIRECTORY_META_KEY, DEFAULT_APP_CONFIG.directoryMeta, isDirectoryMeta),
  };
}
```

Add the method to the returned object (after `saveDirectories`):

```ts
    recordScannedDirectories: (paths, at) => {
      const db = openStore(dbPath);
      try {
        const meta = readKey(db, DIRECTORY_META_KEY, DEFAULT_APP_CONFIG.directoryMeta, isDirectoryMeta);
        const next: DirectoryMeta = { ...meta };
        for (const path of paths) {
          next[normalizePath(path).toLowerCase()] = { lastScannedAt: at };
        }
        writeKey(db, DIRECTORY_META_KEY, next);
        return readConfig(db);
      } finally {
        db.close();
      }
    },
```

- [ ] **Step 6: Run the store tests to verify they pass**

Run: `pnpm exec vitest run server/lib/app-config.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing configured-scan test — create `server/lib/scan-configured.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ProgressSink } from '../engine/types/progress';
import type { RunSummary } from '../engine/types/run-summary';
import type { AppConfig } from '../../app/lib/types';
import { createConfiguredScan, NoDirectoriesConfiguredError, type ConfiguredScanDeps } from './scan-configured';

const sink: ProgressSink = { emitProgress() {} };
const signal = new AbortController().signal;
const summary: RunSummary = {
  phases: [],
  filesScanned: 0,
  entriesWritten: 0,
  duplicateGroups: 0,
  duplicateFiles: 0,
  staleRemoved: 0,
  errors: [],
};

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    directories: { indexed: [{ path: 'C:/Photos', enabled: true }], ignored: ['C:/Photos/Cache'] },
    application: {
      extensions: 'jpg, .PNG ,',
      processDirectories: true,
      updateRecords: false,
      resyncDirectories: true,
      verifyFiles: true,
    },
    directoryMeta: {},
    ...overrides,
  };
}

describe('createConfiguredScan', () => {
  it('builds the run configuration from app config and records the scan', async () => {
    const run = vi.fn(async () => summary);
    const recordScanned = vi.fn();
    const scan = createConfiguredScan({ getConfig: () => baseConfig(), recordScanned, run });

    const result = await scan({ progress: sink, signal });

    expect(result).toBe(summary);
    expect(run).toHaveBeenCalledTimes(1);
    const [config] = run.mock.calls[0];
    expect(config.directories).toEqual(['C:/Photos']);
    expect(config.ignore_directories).toEqual(['C:/Photos/Cache']);
    expect(config.extensions).toEqual(['.jpg', '.png']);
    expect(config.update_records).toBe(false);
    expect(config.resync_directories).toBe(true);
    expect(config.resync_check_actual_file).toBe(true);
    expect(recordScanned).toHaveBeenCalledWith(['C:/Photos'], expect.any(String));
  });

  it('refuses when no directories are enabled', async () => {
    const run = vi.fn(async () => summary);
    const scan = createConfiguredScan({
      getConfig: () => baseConfig({ directories: { indexed: [{ path: 'C:/Photos', enabled: false }], ignored: [] } }),
      recordScanned: vi.fn(),
      run,
    });
    await expect(scan({ progress: sink, signal })).rejects.toBeInstanceOf(NoDirectoriesConfiguredError);
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses when no extensions are configured', async () => {
    const run = vi.fn(async () => summary);
    const scan = createConfiguredScan({
      getConfig: () => baseConfig({ application: { ...baseConfig().application, extensions: '  ' } }),
      recordScanned: vi.fn(),
      run,
    });
    await expect(scan({ progress: sink, signal })).rejects.toBeInstanceOf(NoDirectoriesConfiguredError);
    expect(run).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run the configured-scan test to verify it fails**

Run: `pnpm exec vitest run server/lib/scan-configured.test.ts`
Expected: FAIL — `./scan-configured` cannot be found.

- [ ] **Step 9: Implement `server/lib/scan-configured.ts`**

```ts
import '@tanstack/react-start/server-only';
import { Runner } from '../engine/runner';
import type { Reporter } from '../engine/output/reporter';
import type { ProgressSink } from '../engine/types/progress';
import type { RunConfiguration } from '../engine/types/configuration';
import type { RunSummary } from '../engine/types/run-summary';
import type { AppConfig } from '../../app/lib/types';
import { appConfigStore } from './app-config';
import { sampleDbPath } from './db-path';

const silentReporter: Reporter = { debug() {}, info() {}, warn() {}, error() {}, printSummary() {} };

export type RunConfiguredScanDeps = { progress: ProgressSink; signal: AbortSignal };

export type ConfiguredScanDeps = {
  getConfig: () => AppConfig;
  recordScanned: (paths: string[], at: string) => void;
  run: (config: RunConfiguration, deps: RunConfiguredScanDeps) => Promise<RunSummary>;
};

export class NoDirectoriesConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoDirectoriesConfiguredError';
  }
}

function parseExtensions(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
    .map((part) => (part.startsWith('.') ? part : `.${part}`));
}

export function createConfiguredScan(deps: ConfiguredScanDeps): (deps: RunConfiguredScanDeps) => Promise<RunSummary> {
  return async ({ progress, signal }) => {
    const config = deps.getConfig();
    const directories = config.directories.indexed.filter((entry) => entry.enabled).map((entry) => entry.path);
    const extensions = parseExtensions(config.application.extensions);

    if (directories.length === 0) {
      throw new NoDirectoriesConfiguredError('No enabled directories configured');
    }
    if (extensions.length === 0) {
      throw new NoDirectoriesConfiguredError('No file extensions configured');
    }

    const runConfig: RunConfiguration = {
      dbName: sampleDbPath(),
      extensions,
      directories,
      ignore_directories: config.directories.ignored,
      update_records: config.application.updateRecords,
      process_directories: config.application.processDirectories,
      resync_directories: config.application.resyncDirectories,
      resync_check_actual_file: config.application.verifyFiles,
    };

    const summary = await deps.run(runConfig, { progress, signal });
    deps.recordScanned(directories, new Date().toISOString());
    return summary;
  };
}

export const runConfiguredScan = createConfiguredScan({
  getConfig: () => appConfigStore.get(),
  recordScanned: (paths, at) => {
    appConfigStore.recordScannedDirectories(paths, at);
  },
  run: async (config, { progress, signal }) => {
    const runner = new Runner(config, { reporter: silentReporter, progress, signal });
    try {
      return await runner.run();
    } finally {
      runner.close();
    }
  },
});
```

- [ ] **Step 10: Run the configured-scan test to verify it passes**

Run: `pnpm exec vitest run server/lib/scan-configured.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 11: Wire the scan service — `server/lib/scan.ts`**

Replace the `runFixtureScan` import:

```ts
import { runConfiguredScan } from './scan-configured';
```

Replace the singleton line:

```ts
export const scanService = createScanService(({ progress, signal }) => runConfiguredScan({ progress, signal }));
```

- [ ] **Step 12: Fix the Preferences page test fixture for the new empty defaults**

In `app/features/preferences/PreferencesPage.test.tsx`, `DEFAULT_APP_CONFIG` now has no directories, so the "shows configured directories" test would fail. Add a local config and use it in `renderPage`:

```tsx
const config = {
  ...DEFAULT_APP_CONFIG,
  directories: { indexed: [{ path: 'C:/Media/2025', enabled: true }], ignored: [] },
};

function renderPage() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <PreferencesPage config={config} />
    </MantineProvider>,
  );
}
```

- [ ] **Step 13: Run the full check + build**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass (22 test files); build succeeds.

- [ ] **Step 14: Commit**

```bash
git add app/lib/types.ts app/lib/app-config-defaults.ts server/lib/app-config.ts server/lib/app-config.test.ts server/lib/scan-configured.ts server/lib/scan-configured.test.ts server/lib/scan.ts app/features/preferences/PreferencesPage.test.tsx
git commit -m "feat: scan configured directories incrementally from app_config"
```

### Task 3: Preferences per-directory stats

**Files:**
- Modify: `server/routes/preferences.ts`
- Modify: `app/routes/preferences.tsx`
- Modify: `app/features/preferences/PreferencesPage.tsx`
- Modify: `app/features/preferences/PreferencesPage.test.tsx`

**Interfaces:**
- Consumes: `countEntriesByDirectory` (Task 1), `AppConfig.directoryMeta` (Task 2).
- Produces: `getPreferencesData` server fn; `PreferencesPage({ config, counts })`.

- [ ] **Step 1: Replace `server/routes/preferences.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';
import type { ApplicationConfig, DirectoriesConfig } from '../../app/lib/types';

export const getPreferencesData = createServerFn({ method: 'GET' }).handler(async () => {
  const { appConfigStore } = await import('../lib/app-config');
  const { countEntriesByDirectory } = await import('../lib/queries');
  const config = appConfigStore.get();
  const counts: Record<string, number> = {};
  for (const entry of config.directories.indexed) {
    counts[entry.path] = countEntriesByDirectory(entry.path);
  }
  return { config, counts };
});

export const saveApplicationSettings = createServerFn({ method: 'POST' })
  .validator((input: ApplicationConfig) => input)
  .handler(async ({ data }) => {
    const { appConfigStore } = await import('../lib/app-config');
    return appConfigStore.saveApplication(data);
  });

export const saveDirectories = createServerFn({ method: 'POST' })
  .validator((input: DirectoriesConfig) => input)
  .handler(async ({ data }) => {
    const { appConfigStore } = await import('../lib/app-config');
    return appConfigStore.saveDirectories(data);
  });
```

- [ ] **Step 2: Update the route — `app/routes/preferences.tsx`**

```tsx
import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { PreferencesPage } from '../features/preferences/PreferencesPage';
import { getPreferencesData } from '../../server/routes/preferences';

export const Route = createFileRoute('/preferences')({
  loader: async () => getPreferencesData(),
  component: PreferencesRoute,
});

function PreferencesRoute() {
  const { config, counts } = useLoaderData({ from: '/preferences' });
  return <PreferencesPage config={config} counts={counts} />;
}
```

- [ ] **Step 3: Render real stats — `app/features/preferences/PreferencesPage.tsx`**

Change the component signature and add two helpers above it:

```tsx
function metaKey(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function formatScanTime(iso: string | undefined): string {
  if (!iso) return 'Not scanned yet';
  return `Last scan ${new Date(iso).toLocaleString()}`;
}

export function PreferencesPage({ config, counts }: { config: AppConfig; counts: Record<string, number> }) {
```

Replace the indexed-row metadata block:

```tsx
                    <div className="preference-path">
                      <Text size="sm">{item.path}</Text>
                      <Text size="xs" c="dimmed">
                        {counts[item.path] ?? 0} files · {formatScanTime(config.directoryMeta[metaKey(item.path)]?.lastScannedAt)}
                      </Text>
                    </div>
```

- [ ] **Step 4: Update `app/features/preferences/PreferencesPage.test.tsx`**

Replace the `config` fixture and `renderPage`, and add a stats assertion:

```tsx
const config = {
  ...DEFAULT_APP_CONFIG,
  directories: {
    indexed: [
      { path: 'C:/Media/2025', enabled: true },
      { path: 'D:/Camera Imports', enabled: true },
    ],
    ignored: [],
  },
  directoryMeta: { 'c:/media/2025': { lastScannedAt: '2026-10-03T12:00:00.000Z' } },
};

const counts = { 'C:/Media/2025': 42, 'D:/Camera Imports': 0 };

function renderPage() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <PreferencesPage config={config} counts={counts} />
    </MantineProvider>,
  );
}
```

Add to the "shows configured directories" test:

```tsx
    expect(screen.getByText(/42 files/)).toBeInTheDocument();
    expect(screen.getByText(/Last scan/)).toBeInTheDocument();
    expect(screen.getByText(/Not scanned yet/)).toBeInTheDocument();
```

- [ ] **Step 5: Run the page test to verify it passes**

Run: `pnpm exec vitest run app/features/preferences/PreferencesPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full check + build**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass; build succeeds with no `better-sqlite3`/`sqlite` in `dist/client`.

- [ ] **Step 7: Commit**

```bash
git add server/routes/preferences.ts app/routes/preferences.tsx app/features/preferences/PreferencesPage.tsx app/features/preferences/PreferencesPage.test.tsx
git commit -m "feat: show real per-directory counts and last scan in Preferences"
```

### Task 4: Final verification + Phase 4b docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Run the full check**

Run: `pnpm check`
Expected: generate-routes, typecheck, lint, tests (22 files), format all pass.

- [ ] **Step 2: Production build + client-safety**

Run: `pnpm build`
Expected: build succeeds; `rg -l "better-sqlite3|sqlite" dist/client` returns nothing.

- [ ] **Step 3: Manual scan smoke**

Run `pnpm dev`; in Preferences add a small real folder containing a few images (and, if you like, a duplicate copy elsewhere), enable it, then click "Scan library". Expected: Activity shows progress then a summary; Overview/Duplicates/Footer reflect the scanned files; Preferences shows real `N files · Last scan …`. Run `pnpm seed` and confirm the app DB is untouched (the library stays as scanned). Clean up the test folder and `trash server/data/imgsorter.db` if you want to reset to empty.

- [ ] **Step 4: Record Phase 4b progress**

In `docs/ROADMAP.md`, update the 4b bullet to note it is **complete** and add the spec link:

```
- **4b — Scan configured directories:** replace the fixture-driven scan source with the
  persisted `app_config` directories; surface real per-directory counts / last scan.
  Spec: [2026-10-03-phase4b-real-scan-design.md](superpowers/specs/2026-10-03-phase4b-real-scan-design.md). **Complete.**
```

Add to the "Detailed specs" table:

```
| 4b | [2026-10-03-phase4b-real-scan-design.md](superpowers/specs/2026-10-03-phase4b-real-scan-design.md) |
```

In `AGENTS.md` "Current Plan State", extend the Phase 4 bullet: mark **4b complete** (real configured-directory scan; app DB local + committed `fixture.db`; per-directory counts/last scan), and note 4c (Reveal/Open + native folder picker) as next.

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md AGENTS.md
git commit -m "docs: record Phase 4b complete"
```

## Self-Review Checklist

1. **Spec coverage:**
   - DB split (fixtureDbPath, seed→fixture, env override, missing-DB tolerance, gitignore, committed fixture) → Task 1.
   - `directory_meta` + `recordScannedDirectories` → Task 2.
   - `runConfiguredScan` (build config, refusal, incremental, record) + service wiring → Task 2.
   - `countEntriesByDirectory` → Task 1; `getPreferencesData` + page rendering → Task 3.
   - Empty defaults → Task 2; verification + docs → Task 4.
2. **Placeholder scan:** every step has full code/commands; no TBD/TODO.
3. **Type consistency:** `DirectoryMeta`/`AppConfig.directoryMeta` defined once (Task 2) and used by the store, `runConfiguredScan`, the route, and the page; `createConfiguredScan`/`runConfiguredScan`/`NoDirectoriesConfiguredError`/`ConfiguredScanDeps` names match between module and tests; `fixtureDbPath`/`countEntriesByDirectory`/`getPreferencesData` consistent across tasks.
4. **Risk notes:** Task 1 commits a regenerated `fixture.db` and untracks `imgsorter.db`; the manual scan smoke in Task 4 needs `pnpm dev` and a real folder. Server tests share the read-only fixture DB via `IMGSORTER_DB_PATH`.
