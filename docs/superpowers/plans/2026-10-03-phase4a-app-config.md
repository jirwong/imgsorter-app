# Phase 4a (app_config Persistence + Preferences Directory Management) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Preferences page a real, scan-proof SQLite store for its directory lists and application settings, and wire the page to load and save them.

**Architecture:** A new app-level `server/lib/app-config.ts` opens a dedicated `server/data/app-config.db` (`app_config` key/value table, JSON values), seeded with defaults and normalized server-side. A factory (`createAppConfigStore(dbPath)`) plus an app singleton mirrors `server/lib/scan.ts`; server fns in `server/routes/preferences.ts` expose get/save. The `/preferences` route loader reads the config; the page autosaves directories and saves application settings explicitly.

**Tech Stack:** TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9, `better-sqlite3` (server-only), Vitest (client jsdom / server node), TypeScript strict.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-10-03-phase4a-app-config-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24.
- Prettier 2-space, single quotes, semicolons, print width 120. **No comments in new code.**
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- Engine/`better-sqlite3` is server-only; never in a client bundle. Server fns dynamically `import()` server libs inside the handler.
- Config persists in `server/data/app-config.db`, which is **gitignored** and must survive both the UI scan and `pnpm seed` — scan/seed must never open it.
- The "local database name" field is display-only; the DB path stays `server/data/imgsorter.db`.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; never merge.
- Non-goals: scanning configured directories (4b), Reveal/Open (4c), keeper persistence (4d), filesystem validation, functional DB name.

---

### Task 1: Config types, defaults, store + server functions

**Files:**
- Modify: `app/lib/types.ts`
- Create: `app/lib/app-config-defaults.ts`
- Modify: `server/lib/db-path.ts`
- Modify: `server/lib/db-path.test.ts`
- Modify: `.gitignore`
- Create: `server/lib/app-config.ts`
- Create: `server/lib/app-config.test.ts`
- Create: `server/routes/preferences.ts`

**Interfaces:**
- Produces:
  - `IndexedDirectory = { path: string; enabled: boolean }`, `DirectoriesConfig`, `ApplicationConfig`, `AppConfig` (`app/lib/types.ts`)
  - `DEFAULT_APP_CONFIG: AppConfig` (`app/lib/app-config-defaults.ts`)
  - `appConfigDbPath(): string` (`server/lib/db-path.ts`)
  - `createAppConfigStore(dbPath: string): AppConfigStore`, `AppConfigStore`, `appConfigStore` (`server/lib/app-config.ts`)
  - `getAppConfig` (GET), `saveApplicationSettings` (POST), `saveDirectories` (POST) server fns (`server/routes/preferences.ts`)

- [ ] **Step 1: Add config types to `app/lib/types.ts`**

Append to the end of the file:

```ts
export type IndexedDirectory = { path: string; enabled: boolean };

export type DirectoriesConfig = {
  indexed: IndexedDirectory[];
  ignored: string[];
};

export type ApplicationConfig = {
  extensions: string;
  processDirectories: boolean;
  updateRecords: boolean;
  resyncDirectories: boolean;
  verifyFiles: boolean;
};

export type AppConfig = {
  directories: DirectoriesConfig;
  application: ApplicationConfig;
};
```

- [ ] **Step 2: Create `app/lib/app-config-defaults.ts`**

```ts
import type { AppConfig } from './types';

export const DEFAULT_APP_CONFIG: AppConfig = {
  directories: {
    indexed: [
      { path: 'C:/Media/2025', enabled: true },
      { path: 'D:/Camera Imports', enabled: true },
    ],
    ignored: ['C:/Media/2025/Cache', 'C:/Media/2024/Exports'],
  },
  application: {
    extensions: 'jpg, png, gif, jpeg, mp4, mov',
    processDirectories: true,
    updateRecords: true,
    resyncDirectories: false,
    verifyFiles: false,
  },
};
```

- [ ] **Step 3: Add `appConfigDbPath()` to `server/lib/db-path.ts`**

Add after `sampleDbPath()`:

```ts
export function appConfigDbPath(): string {
  return join(serverDir, 'data', 'app-config.db');
}
```

- [ ] **Step 4: Extend `server/lib/db-path.test.ts`**

Replace the import line:

```ts
import { appConfigDbPath, fixturesDir, sampleDbPath, virtualToReal } from './db-path';
```

Add a test after the sample-db test:

```ts
  it('derives the app config db path under server/data', () => {
    expect(normalize(appConfigDbPath())).toMatch(/\/server\/data\/app-config\.db$/);
  });
```

- [ ] **Step 5: Ignore the config DB in `.gitignore`**

Add after the existing `server/data/*.db-wal` line:

```
server/data/app-config.db
```

- [ ] **Step 6: Write the failing store test**

Create `server/lib/app-config.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_APP_CONFIG } from '../../app/lib/app-config-defaults';
import { createAppConfigStore, type AppConfigStore } from './app-config';

describe('createAppConfigStore', () => {
  let dir: string;
  let dbPath: string;
  let store: AppConfigStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'imgsorter-config-'));
    dbPath = join(dir, 'app-config.db');
    store = createAppConfigStore(dbPath);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('seeds defaults on first open', () => {
    expect(store.get()).toEqual(DEFAULT_APP_CONFIG);
  });

  it('persists application settings', () => {
    const saved = store.saveApplication({ ...DEFAULT_APP_CONFIG.application, extensions: 'png', updateRecords: false });
    expect(saved.application.extensions).toBe('png');
    expect(saved.application.updateRecords).toBe(false);
    expect(store.get().application.extensions).toBe('png');
  });

  it('clears verifyFiles when resync is disabled', () => {
    const saved = store.saveApplication({
      ...DEFAULT_APP_CONFIG.application,
      resyncDirectories: false,
      verifyFiles: true,
    });
    expect(saved.application.verifyFiles).toBe(false);
  });

  it('normalizes and de-duplicates directories', () => {
    const saved = store.saveDirectories({
      indexed: [
        { path: ' C:\\Media\\New ', enabled: true },
        { path: 'c:/media/new', enabled: false },
        { path: '', enabled: true },
      ],
      ignored: ['C:\\Media\\Old\\', 'c:/media/old'],
    });
    expect(saved.directories.indexed).toEqual([{ path: 'C:/Media/New', enabled: true }]);
    expect(saved.directories.ignored).toEqual(['C:/Media/Old']);
  });

  it('drops indexed entries that are also ignored', () => {
    const saved = store.saveDirectories({
      indexed: [{ path: 'C:/Media/Keep', enabled: true }],
      ignored: ['c:/media/keep'],
    });
    expect(saved.directories.indexed).toEqual([]);
    expect(saved.directories.ignored).toEqual(['C:/Media/Keep']);
  });

  it('falls back to defaults when stored JSON is invalid', () => {
    store.get();
    const raw = new Database(dbPath);
    raw.prepare(`UPDATE app_config SET value = 'not json' WHERE key = 'application'`).run();
    raw.close();
    expect(store.get().application).toEqual(DEFAULT_APP_CONFIG.application);
  });
});
```

- [ ] **Step 7: Run the store test to verify it fails**

Run: `pnpm exec vitest run server/lib/app-config.test.ts`
Expected: FAIL — `./app-config` cannot be found.

- [ ] **Step 8: Implement `server/lib/app-config.ts`**

```ts
import '@tanstack/react-start/server-only';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { DEFAULT_APP_CONFIG } from '../../app/lib/app-config-defaults';
import type { AppConfig, ApplicationConfig, DirectoriesConfig, IndexedDirectory } from '../../app/lib/types';
import { appConfigDbPath } from './db-path';

const DIRECTORY_KEY = 'directories';
const APPLICATION_KEY = 'application';

export type AppConfigStore = {
  get: () => AppConfig;
  saveApplication: (input: ApplicationConfig) => AppConfig;
  saveDirectories: (input: DirectoriesConfig) => AppConfig;
};

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

function dedupePaths(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const path = normalizePath(value);
    if (path.length === 0) continue;
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(path);
  }
  return result;
}

function normalizeDirectories(input: DirectoriesConfig): DirectoriesConfig {
  const ignored = dedupePaths(input.ignored);
  const ignoredKeys = new Set(ignored.map((path) => path.toLowerCase()));
  const indexed: IndexedDirectory[] = [];
  const seen = new Set<string>();
  for (const entry of input.indexed) {
    const path = normalizePath(entry.path);
    if (path.length === 0) continue;
    const key = path.toLowerCase();
    if (seen.has(key) || ignoredKeys.has(key)) continue;
    seen.add(key);
    indexed.push({ path, enabled: Boolean(entry.enabled) });
  }
  return { indexed, ignored };
}

function normalizeApplication(input: ApplicationConfig): ApplicationConfig {
  const resyncDirectories = Boolean(input.resyncDirectories);
  return {
    extensions: input.extensions.trim(),
    processDirectories: Boolean(input.processDirectories),
    updateRecords: Boolean(input.updateRecords),
    resyncDirectories,
    verifyFiles: resyncDirectories && Boolean(input.verifyFiles),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isApplicationConfig(value: unknown): value is ApplicationConfig {
  if (!isRecord(value)) return false;
  return (
    typeof value.extensions === 'string' &&
    typeof value.processDirectories === 'boolean' &&
    typeof value.updateRecords === 'boolean' &&
    typeof value.resyncDirectories === 'boolean' &&
    typeof value.verifyFiles === 'boolean'
  );
}

function isDirectoriesConfig(value: unknown): value is DirectoriesConfig {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.indexed) || !Array.isArray(value.ignored)) return false;
  const indexed = value.indexed as unknown[];
  const ignored = value.ignored as unknown[];
  return (
    indexed.every((entry) => isRecord(entry) && typeof entry.path === 'string' && typeof entry.enabled === 'boolean') &&
    ignored.every((entry) => typeof entry === 'string')
  );
}

function openStore(dbPath: string): DatabaseType {
  const db = new Database(dbPath);
  db.prepare(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`).run();
  return db;
}

function writeKey(db: DatabaseType, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO app_config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, JSON.stringify(value));
}

function readKey<T>(db: DatabaseType, key: string, fallback: T, is: (value: unknown) => value is T): T {
  const row = db.prepare(`SELECT value FROM app_config WHERE key = ?`).get(key) as { value: string } | undefined;
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (is(parsed)) return parsed;
      writeKey(db, key, fallback);
    } catch {
      writeKey(db, key, fallback);
    }
  } else {
    writeKey(db, key, fallback);
  }
  return structuredClone(fallback);
}

function readConfig(db: DatabaseType): AppConfig {
  return {
    directories: readKey(db, DIRECTORY_KEY, DEFAULT_APP_CONFIG.directories, isDirectoriesConfig),
    application: readKey(db, APPLICATION_KEY, DEFAULT_APP_CONFIG.application, isApplicationConfig),
  };
}

export function createAppConfigStore(dbPath: string): AppConfigStore {
  return {
    get: () => {
      const db = openStore(dbPath);
      try {
        return readConfig(db);
      } finally {
        db.close();
      }
    },
    saveApplication: (input) => {
      const db = openStore(dbPath);
      try {
        writeKey(db, APPLICATION_KEY, normalizeApplication(input));
        return readConfig(db);
      } finally {
        db.close();
      }
    },
    saveDirectories: (input) => {
      const db = openStore(dbPath);
      try {
        writeKey(db, DIRECTORY_KEY, normalizeDirectories(input));
        return readConfig(db);
      } finally {
        db.close();
      }
    },
  };
}

export const appConfigStore = createAppConfigStore(appConfigDbPath());
```

- [ ] **Step 9: Run the store test to verify it passes**

Run: `pnpm exec vitest run server/lib/app-config.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 10: Create `server/routes/preferences.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';
import type { ApplicationConfig, DirectoriesConfig } from '../../app/lib/types';

export const getAppConfig = createServerFn({ method: 'GET' }).handler(async () => {
  const { appConfigStore } = await import('../lib/app-config');
  return appConfigStore.get();
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

- [ ] **Step 11: Run the full check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass (21 test files now).

- [ ] **Step 12: Commit**

```bash
git add app/lib/types.ts app/lib/app-config-defaults.ts server/lib/db-path.ts server/lib/db-path.test.ts .gitignore server/lib/app-config.ts server/lib/app-config.test.ts server/routes/preferences.ts
git commit -m "feat: add app_config store and preferences server functions"
```

### Task 2: Wire the Preferences page to the store

**Files:**
- Modify: `app/routes/preferences.tsx`
- Modify: `app/features/preferences/PreferencesPage.tsx`
- Modify: `app/features/preferences/PreferencesPage.test.tsx`
- Modify: `app/lib/mock-data.ts`

**Interfaces:**
- Consumes: `getAppConfig`, `saveApplicationSettings`, `saveDirectories` (Task 1); `AppConfig`, `ApplicationConfig`, `IndexedDirectory`, `DEFAULT_APP_CONFIG` (Task 1).
- Produces: `PreferencesPage({ config }: { config: AppConfig })`; `/preferences` loader returns `AppConfig`.

- [ ] **Step 1: Replace `app/features/preferences/PreferencesPage.test.tsx`**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DEFAULT_APP_CONFIG } from '../../lib/app-config-defaults';

const mocks = vi.hoisted(() => ({
  saveDirectories: vi.fn(),
  saveApplicationSettings: vi.fn(),
}));

vi.mock('../../../server/routes/preferences', () => ({
  saveDirectories: mocks.saveDirectories,
  saveApplicationSettings: mocks.saveApplicationSettings,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useRouter: () => ({ invalidate: vi.fn(async () => {}) }) };
});

import { PreferencesPage } from './PreferencesPage';

function renderPage() {
  render(
    <MantineProvider defaultColorScheme="dark">
      <PreferencesPage config={DEFAULT_APP_CONFIG} />
    </MantineProvider>,
  );
}

describe('PreferencesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the application tab with a disabled database name', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Application configuration' })).toBeInTheDocument();
    expect(screen.getByLabelText('Local database name')).toBeDisabled();
  });

  it('shows configured directories on the directories tab', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    expect(screen.getByText('Directories included in scans')).toBeInTheDocument();
    expect(screen.getByText('C:/Media/2025')).toBeInTheDocument();
  });

  it('saves a new indexed directory', async () => {
    mocks.saveDirectories.mockResolvedValue({
      directories: {
        indexed: [{ path: 'C:/Media/New', enabled: true }],
        ignored: DEFAULT_APP_CONFIG.directories.ignored,
      },
      application: DEFAULT_APP_CONFIG.application,
    });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Directories' }));
    fireEvent.change(screen.getByLabelText('Add indexed directory'), { target: { value: 'C:/Media/New' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add directory' })[0]);
    await waitFor(() => expect(mocks.saveDirectories).toHaveBeenCalledTimes(1));
    expect(mocks.saveDirectories.mock.calls[0][0].data.indexed).toContainEqual({ path: 'C:/Media/New', enabled: true });
  });

  it('saves application settings', async () => {
    mocks.saveApplicationSettings.mockResolvedValue({
      directories: DEFAULT_APP_CONFIG.directories,
      application: { ...DEFAULT_APP_CONFIG.application, extensions: 'png' },
    });
    renderPage();
    fireEvent.change(screen.getByLabelText('File extensions'), { target: { value: 'png' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(mocks.saveApplicationSettings).toHaveBeenCalledTimes(1));
    expect(mocks.saveApplicationSettings.mock.calls[0][0].data.extensions).toBe('png');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run app/features/preferences/PreferencesPage.test.tsx`
Expected: FAIL — `PreferencesPage` does not accept a `config` prop and still reads mock data.

- [ ] **Step 3: Replace `app/features/preferences/PreferencesPage.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { Badge, Button, Card, Checkbox, Group, Switch, Tabs, Text, TextInput } from '@mantine/core';
import { FolderOpen, ShieldCheck } from 'lucide-react';
import { useRouter } from '@tanstack/react-router';
import { PageHeading } from '../../components/common/PageHeading';
import { DEFAULT_APP_CONFIG } from '../../lib/app-config-defaults';
import { saveApplicationSettings, saveDirectories } from '../../../server/routes/preferences';
import type { AppConfig, ApplicationConfig, IndexedDirectory } from '../../lib/types';

export function PreferencesPage({ config }: { config: AppConfig }) {
  const router = useRouter();
  const [indexed, setIndexed] = useState<IndexedDirectory[]>(config.directories.indexed);
  const [ignored, setIgnored] = useState<string[]>(config.directories.ignored);
  const [indexedPath, setIndexedPath] = useState('');
  const [ignoredPath, setIgnoredPath] = useState('');
  const [message, setMessage] = useState('');
  const [application, setApplication] = useState<ApplicationConfig>(config.application);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('application');

  const activeCount = useMemo(() => indexed.filter((item) => item.enabled).length, [indexed]);

  const persistDirectories = async (nextIndexed: IndexedDirectory[], nextIgnored: string[]): Promise<void> => {
    const result = await saveDirectories({ data: { indexed: nextIndexed, ignored: nextIgnored } });
    setIndexed(result.directories.indexed);
    setIgnored(result.directories.ignored);
    await router.invalidate();
  };

  const addIndexed = () => {
    const path = indexedPath.trim();
    if (!path) {
      setMessage('Enter an indexed directory path first.');
      return;
    }
    if (indexed.some((item) => item.path === path) || ignored.includes(path)) {
      setMessage('That directory is already configured.');
      return;
    }
    setMessage('');
    setIndexedPath('');
    void persistDirectories([...indexed, { path, enabled: true }], ignored);
  };

  const addIgnored = () => {
    const path = ignoredPath.trim();
    if (!path) {
      setMessage('Enter an ignored directory path first.');
      return;
    }
    if (indexed.some((item) => item.path === path) || ignored.includes(path)) {
      setMessage('That directory is already configured.');
      return;
    }
    setMessage('');
    setIgnoredPath('');
    void persistDirectories(indexed, [...ignored, path]);
  };

  const resetDefaults = () => {
    setApplication(DEFAULT_APP_CONFIG.application);
    setSaved(false);
  };

  const saveApplication = async (): Promise<void> => {
    const result = await saveApplicationSettings({ data: application });
    setApplication(result.application);
    setSaved(true);
    await router.invalidate();
  };

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Preferences"
        subtitle="Explore preferences across your indexed media library."
      />
      <div className="preferences-page">
        <div className="preferences-intro">
          <div>
            <Text className="eyebrow">PREFERENCES</Text>
            <h2>Library indexing</h2>
            <Text c="dimmed" size="sm">
              Configure application behavior and directory scope.
            </Text>
          </div>
        </div>
        <Tabs value={activeTab} onChange={(value) => setActiveTab(value ?? 'application')} className="preferences-tabs">
          <Tabs.List>
            <Tabs.Tab value="application">Application configuration</Tabs.Tab>
            <Tabs.Tab value="directories">Directories</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {activeTab === 'directories' && (
          <>
            <Card className="directories-panel">
              <Group justify="space-between" mb="md">
                <div>
                  <Text className="eyebrow">INDEXED DIRECTORIES</Text>
                  <h3>Directories included in scans</h3>
                </div>
                <Badge color="cyan">{activeCount} active</Badge>
              </Group>
              <Group align="flex-end" mb="md">
                <TextInput
                  className="directory-add-input"
                  label="Add indexed directory"
                  placeholder="C:/Media/Projects"
                  value={indexedPath}
                  onChange={(event) => setIndexedPath(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addIndexed();
                  }}
                />
                <Button onClick={addIndexed}>Add directory</Button>
              </Group>
              <div className="preference-list">
                {indexed.map((item) => (
                  <div className="preference-row" key={item.path}>
                    <Checkbox
                      checked={item.enabled}
                      onChange={() =>
                        void persistDirectories(
                          indexed.map((current) =>
                            current.path === item.path ? { ...current, enabled: !current.enabled } : current,
                          ),
                          ignored,
                        )
                      }
                      aria-label={`Enable ${item.path}`}
                    />
                    <FolderOpen size={16} />
                    <div className="preference-path">
                      <Text size="sm">{item.path}</Text>
                      <Text size="xs" c="dimmed">
                        — files · Not scanned yet
                      </Text>
                    </div>
                    <Button
                      variant="subtle"
                      size="xs"
                      color="red"
                      onClick={() => void persistDirectories(indexed.filter((current) => current.path !== item.path), ignored)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="directories-panel">
              <Group justify="space-between" mb="md">
                <div>
                  <Text className="eyebrow">GLOBALLY IGNORED DIRECTORIES</Text>
                  <h3>Excluded from every scan</h3>
                </div>
                <Badge variant="light">{ignored.length} ignored</Badge>
              </Group>
              <Text size="xs" c="orange" mb="md">
                Ignored directories always take precedence over indexed directories.
              </Text>
              <Group align="flex-end" mb="md">
                <TextInput
                  className="directory-add-input"
                  label="Add globally ignored directory"
                  placeholder="C:/Media/Projects/Cache"
                  value={ignoredPath}
                  onChange={(event) => setIgnoredPath(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addIgnored();
                  }}
                />
                <Button onClick={addIgnored}>Add directory</Button>
              </Group>
              <div className="preference-list">
                {ignored.map((path) => (
                  <div className="preference-row" key={path}>
                    <ShieldCheck size={16} />
                    <div className="preference-path">
                      <Text size="sm">{path}</Text>
                      <Text size="xs" c="dimmed">
                        Global exclusion
                      </Text>
                    </div>
                    <Button
                      variant="subtle"
                      size="xs"
                      color="red"
                      onClick={() => void persistDirectories(indexed, ignored.filter((item) => item !== path))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {activeTab === 'application' && (
          <Card className="indexing-settings-card application-panel">
            <Group justify="space-between" mb="md">
              <div>
                <Text className="eyebrow">INDEXING SETTINGS</Text>
                <h3>Application configuration</h3>
              </div>
              {saved && <Badge color="cyan">Saved</Badge>}
            </Group>
            <div className="settings-grid">
              <TextInput
                label="Local database name"
                description="Fixed at server/data/imgsorter.db."
                value="server/data/imgsorter.db"
                disabled
              />
              <TextInput
                label="File extensions"
                description="Comma-separated extensions to include."
                value={application.extensions}
                onChange={(event) => {
                  setApplication((current) => ({ ...current, extensions: event.currentTarget.value }));
                  setSaved(false);
                }}
              />
            </div>
            <div className="settings-options">
              <div className="setting-row">
                <div>
                  <Text size="sm">Process configured directories</Text>
                  <Text size="xs" c="dimmed">
                    Scan and index files from enabled directories.
                  </Text>
                </div>
                <Switch
                  checked={application.processDirectories}
                  onChange={(event) => {
                    setApplication((current) => ({ ...current, processDirectories: event.currentTarget.checked }));
                    setSaved(false);
                  }}
                  aria-label="Process configured directories"
                />
              </div>
              <div className="setting-row">
                <div>
                  <Text size="sm">Update duplicate records</Text>
                  <Text size="xs" c="dimmed">
                    Rebuild the duplicate summary after indexing.
                  </Text>
                </div>
                <Switch
                  checked={application.updateRecords}
                  onChange={(event) => {
                    setApplication((current) => ({ ...current, updateRecords: event.currentTarget.checked }));
                    setSaved(false);
                  }}
                  aria-label="Update duplicate records"
                />
              </div>
              <div className="setting-row">
                <div>
                  <Text size="sm">Resync directories</Text>
                  <Text size="xs" c="dimmed">
                    Remove entries for files that no longer exist or moved outside the app.
                  </Text>
                </div>
                <Switch
                  checked={application.resyncDirectories}
                  onChange={(event) => {
                    const resyncDirectories = event.currentTarget.checked;
                    setApplication((current) => ({
                      ...current,
                      resyncDirectories,
                      verifyFiles: resyncDirectories ? current.verifyFiles : false,
                    }));
                    setSaved(false);
                  }}
                  aria-label="Resync directories"
                />
              </div>
              {application.resyncDirectories && (
                <div className="setting-row">
                  <div>
                    <Text size="sm">Verify actual files</Text>
                    <Text size="xs" c="dimmed">
                      Check each stored entry directly against the filesystem. More accurate, but slower.
                    </Text>
                  </div>
                  <Switch
                    checked={application.verifyFiles}
                    onChange={(event) => {
                      setApplication((current) => ({ ...current, verifyFiles: event.currentTarget.checked }));
                      setSaved(false);
                    }}
                    aria-label="Verify actual files"
                  />
                </div>
              )}
            </div>
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" onClick={resetDefaults}>
                Reset to defaults
              </Button>
              <Button color="cyan" onClick={() => void saveApplication()}>
                Save preferences
              </Button>
            </Group>
          </Card>
        )}

        {message && (
          <Text size="xs" c="orange">
            {message}
          </Text>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Wire the route — replace `app/routes/preferences.tsx`**

```tsx
import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { PreferencesPage } from '../features/preferences/PreferencesPage';
import { getAppConfig } from '../../server/routes/preferences';

export const Route = createFileRoute('/preferences')({
  loader: async () => getAppConfig(),
  component: PreferencesRoute,
});

function PreferencesRoute() {
  const config = useLoaderData({ from: '/preferences' });
  return <PreferencesPage config={config} />;
}
```

- [ ] **Step 5: Run the page test to verify it passes**

Run: `pnpm exec vitest run app/features/preferences/PreferencesPage.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Remove the unused `preferences` export from `app/lib/mock-data.ts`**

Delete the trailing block:

```ts
export const preferences = {
  indexed: [
    { path: 'C:/Media/2025', enabled: true, lastScan: 'Today, 09:42', files: '12,842' },
    { path: 'D:/Camera Imports', enabled: true, lastScan: 'Today, 09:40', files: '5,584' },
  ],
  ignored: ['C:/Media/2025/Cache', 'C:/Media/2024/Exports'],
  databaseName: 'local.db',
  extensions: 'jpg, png, gif, jpeg, mp4, mov',
};
```

(Make sure the preceding `largestFiles` export keeps its trailing newline.)

- [ ] **Step 7: Run the full check**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: all pass (21 test files).

- [ ] **Step 8: Commit**

```bash
git add app/routes/preferences.tsx app/features/preferences app/lib/mock-data.ts
git commit -m "feat: persist Preferences via app_config store"
```

### Task 3: Final verification + Phase 4a docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Run the full check**

Run: `pnpm check`
Expected: generate-routes, typecheck, lint, tests (21 files), format all pass.

- [ ] **Step 2: Production build + client-safety**

Run: `pnpm build`
Expected: build succeeds; `rg -l "better-sqlite3|sqlite" dist/client` returns nothing.

- [ ] **Step 3: Manual persistence smoke**

Run: `pnpm dev`; open `/preferences`. Add a directory, toggle one, save application settings; refresh → changes persist. Run "Scan library" from the Sidebar, then `pnpm seed`; reopen `/preferences` → changes still persist (config is not wiped). Kill the dev server, then `git restore server/data/imgsorter.db` (the scan rewrote it). Delete `server/data/app-config.db` only if you want to reset to defaults.

- [ ] **Step 4: Record Phase 4a progress**

In `docs/ROADMAP.md`: set the Phase 4 row status `[ ]` → `[~]`, and add to the "Detailed specs" table:

```
| 4a | [2026-10-03-phase4a-app-config-design.md](superpowers/specs/2026-10-03-phase4a-app-config-design.md) |
```

In `AGENTS.md` "Current Plan State", add after the Phase 3 bullet:

```
- Phase 4 (Preferences persistence via `app_config`, real-directory scanning, Reveal/Open,
  keeper actions) — in progress. 4a (app_config persistence + Preferences directory
  management) complete; spec at
  `docs/superpowers/specs/2026-10-03-phase4a-app-config-design.md`, plan at
  `docs/superpowers/plans/2026-10-03-phase4a-app-config.md`. Next: 4b (scan configured
  directories).
```

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md AGENTS.md
git commit -m "docs: record Phase 4a complete"
```

## Self-Review Checklist

1. **Spec coverage:**
   - Types + defaults + `appConfigDbPath()` + `.gitignore` → Task 1.
   - Store (factory + singleton) + normalization + defaults/corruption fallback + isolation → Task 1.
   - `getAppConfig` / `saveApplicationSettings` / `saveDirectories` server fns → Task 1.
   - `/preferences` loader + page autosave/Save + disabled DB name + placeholders + mock removal → Task 2.
   - Verification + docs → Task 3.
2. **Placeholder scan:** every step has full code/commands; no TBD/TODO.
3. **Type consistency:** `AppConfig`/`DirectoriesConfig`/`ApplicationConfig`/`IndexedDirectory` defined once (Task 1) and used by the store, server fns, route, and page; `createAppConfigStore`/`appConfigStore`/`AppConfigStore` names match; `getAppConfig`/`saveApplicationSettings`/`saveDirectories` match between server fns and the page; `DEFAULT_APP_CONFIG` is shared.
4. **Risk notes:** the manual persist-across-scan smoke needs `pnpm dev`; a UI scan rewrites the committed DB (restore afterward). `app-config.db` is gitignored so tests must use a temp path (Task 1's factory).
