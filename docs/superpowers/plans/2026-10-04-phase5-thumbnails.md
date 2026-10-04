# Phase 5 (Real Thumbnails/Previews + Opt-In Setting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real previews in the file drawer and the Overview largest-files list, generated with `sharp` and cached on disk, behind an opt-in setting that is off by default, with controls in Preferences and on the Overview page.

**Architecture:** A server-only `thumbnails` service resolves entry ids to real paths, serves a disk-cached WebP preview or generates one with `sharp` when the setting is on, and returns base64 data URLs through a `getThumbnails` server function. The setting `generatePreviews` lives in `app-config.db` with the other application settings; the Overview page has a quick autosave switch and Preferences has a switch plus a clear-cache action.

**Tech Stack:** TanStack Start (`createServerFn`, route loaders), React 19, Mantine v9, `@mantine/notifications`, `better-sqlite3` and `sharp` (server-only), Vitest (client jsdom / server node), TypeScript strict.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-10-04-phase5-thumbnails-design.md`.
- Package manager `pnpm` (v11.20.0); Node >= 24.
- Prettier 2-space, single quotes, semicolons, print width 120. **No comments in new code.**
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`; `pnpm build` must succeed at the end of an implementation task.
- `sharp` and `better-sqlite3` are server-only; never in a client bundle. Server fns dynamically `import()` server libs inside the handler.
- `generatePreviews` is **off by default**. Off still serves cached previews; it stops new generation only.
- Previews are for images only (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`). Videos and unreadable files show an icon.
- Cache folder `server/data/thumb-cache/` is gitignored.
- Operating rules (`artifacts/operating-rules.md`) bind execution: branch → PR → fresh sub-agent review (max 3 rounds) → STOP AND WAIT; never merge. All PR text is ASD-STE100.
- `pnpm check` runs `generate-routes` and may change `app/routeTree.gen.ts`. If that file changes and is not part of the task, restore it with `git restore app/routeTree.gen.ts`.

---

### Task 1: The `generatePreviews` setting

**Files:**
- Modify: `app/lib/types.ts`
- Modify: `app/lib/app-config-defaults.ts`
- Modify: `server/lib/app-config.ts`
- Modify: `server/lib/app-config.test.ts`
- Modify: `server/lib/scan-configured.test.ts`

**Interfaces:**
- Produces: `ApplicationConfig.generatePreviews: boolean` (default `false`), persisted and validated with the other application settings.

- [ ] **Step 1: Add the field — `app/lib/types.ts`**

Change `ApplicationConfig` to:

```ts
export type ApplicationConfig = {
  extensions: string;
  processDirectories: boolean;
  updateRecords: boolean;
  resyncDirectories: boolean;
  verifyFiles: boolean;
  generatePreviews: boolean;
};
```

- [ ] **Step 2: Default it off — `app/lib/app-config-defaults.ts`**

```ts
  application: {
    extensions: 'jpg, png, gif, jpeg, mp4, mov',
    processDirectories: true,
    updateRecords: true,
    resyncDirectories: false,
    verifyFiles: false,
    generatePreviews: false,
  },
```

- [ ] **Step 3: Keep the scan test literal valid — `server/lib/scan-configured.test.ts`**

In `baseConfig`, add the field:

```ts
    application: {
      extensions: 'jpg, .PNG ,',
      processDirectories: true,
      updateRecords: false,
      resyncDirectories: true,
      verifyFiles: true,
      generatePreviews: false,
    },
```

- [ ] **Step 4: Write the failing store tests — `server/lib/app-config.test.ts`**

Add these tests inside the `describe`, after the `reads a wrong-shape last scan as null` test:

```ts
  it('defaults previews to off', () => {
    expect(store.get().application.generatePreviews).toBe(false);
  });

  it('round-trips the preview setting', () => {
    const saved = store.saveApplication({ ...DEFAULT_APP_CONFIG.application, generatePreviews: true });
    expect(saved.application.generatePreviews).toBe(true);
    expect(store.get().application.generatePreviews).toBe(true);
  });

  it('reads a stored application without generatePreviews as off and keeps the other fields', () => {
    store.get();
    const raw = new Database(dbPath);
    raw
      .prepare(`UPDATE app_config SET value = ? WHERE key = 'application'`)
      .run(
        JSON.stringify({
          extensions: 'png',
          processDirectories: false,
          updateRecords: true,
          resyncDirectories: false,
          verifyFiles: false,
        }),
      );
    raw.close();
    expect(store.get().application).toEqual({
      extensions: 'png',
      processDirectories: false,
      updateRecords: true,
      resyncDirectories: false,
      verifyFiles: false,
      generatePreviews: false,
    });
  });
```

- [ ] **Step 5: Run the store tests to verify they fail**

Run: `pnpm exec vitest run server/lib/app-config.test.ts`
Expected: FAIL — `generatePreviews` is `undefined`, not `false`.

- [ ] **Step 6: Implement the setting — `server/lib/app-config.ts`**

In `normalizeApplication`, add:

```ts
    verifyFiles: resyncDirectories && Boolean(input.verifyFiles),
    generatePreviews: Boolean(input.generatePreviews),
```

In `isApplicationConfig`, accept a missing field and require a boolean when present:

```ts
function isApplicationConfig(value: unknown): value is ApplicationConfig {
  if (!isRecord(value)) return false;
  return (
    typeof value.extensions === 'string' &&
    typeof value.processDirectories === 'boolean' &&
    typeof value.updateRecords === 'boolean' &&
    typeof value.resyncDirectories === 'boolean' &&
    typeof value.verifyFiles === 'boolean' &&
    (value.generatePreviews === undefined || typeof value.generatePreviews === 'boolean')
  );
}
```

Normalize on read so an older stored value gains the field without losing the others:

```ts
function readConfig(db: DatabaseType): AppConfig {
  return {
    directories: readKey(db, DIRECTORY_KEY, DEFAULT_APP_CONFIG.directories, isDirectoriesConfig),
    application: normalizeApplication(
      readKey(db, APPLICATION_KEY, DEFAULT_APP_CONFIG.application, isApplicationConfig),
    ),
    directoryMeta: readKey(db, DIRECTORY_META_KEY, DEFAULT_APP_CONFIG.directoryMeta, isDirectoryMeta),
  };
}
```

- [ ] **Step 7: Run the store tests to verify they pass**

Run: `pnpm exec vitest run server/lib/app-config.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add app/lib/types.ts app/lib/app-config-defaults.ts server/lib/app-config.ts server/lib/app-config.test.ts server/lib/scan-configured.test.ts
git commit -m "feat: add an opt-in preview setting"
```

### Task 2: Thumbnail service, cache folder, and endpoint

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add sharp`)
- Modify: `.gitignore`
- Modify: `app/lib/types.ts`
- Modify: `app/lib/db-path.ts`
- Modify: `app/lib/db-path.test.ts`
- Create: `server/lib/thumbnails.ts`
- Create: `server/lib/thumbnails.test.ts`
- Create: `server/routes/thumbnails.ts`

**Interfaces:**
- Consumes: `ApplicationConfig.generatePreviews` (Task 1); `getEntryPathById` (`server/lib/queries.ts`); `virtualToReal`, `thumbCacheDir` (`server/lib/db-path.ts`); `appConfigStore` (`server/lib/app-config.ts`).
- Produces: `ThumbnailMap`; `thumbCacheDir()`; `createThumbnailService(deps)`, `thumbnails`; `getThumbnails`, `clearThumbnailCache`.

- [ ] **Step 1: Add the image dependency**

Run: `pnpm add sharp`
Expected: `package.json` gains `"sharp"`; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add the shared type — `app/lib/types.ts`**

Append:

```ts
export type ThumbnailMap = Record<number, string>;
```

- [ ] **Step 3: Write the failing cache-dir test — `server/lib/db-path.test.ts`**

Replace the import line:

```ts
import { appConfigDbPath, fixtureDbPath, fixturesDir, sampleDbPath, thumbCacheDir, virtualToReal } from './db-path';
```

Add a test after the fixture-db test:

```ts
  it('derives the thumbnail cache dir under server/data', () => {
    expect(normalize(thumbCacheDir())).toMatch(/\/server\/data\/thumb-cache$/);
  });
```

- [ ] **Step 4: Run the cache-dir test to verify it fails**

Run: `pnpm exec vitest run server/lib/db-path.test.ts`
Expected: FAIL — `thumbCacheDir` is not exported.

- [ ] **Step 5: Implement `thumbCacheDir` — `app/lib/db-path.ts`**

Add after `appConfigDbPath()`:

```ts
export function thumbCacheDir(): string {
  return join(serverDir, 'data', 'thumb-cache');
}
```

- [ ] **Step 6: Run the cache-dir test to verify it passes**

Run: `pnpm exec vitest run server/lib/db-path.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing service test — create `server/lib/thumbnails.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createThumbnailService, type ThumbnailDeps } from './thumbnails';

function makeDeps(overrides: Partial<ThumbnailDeps> = {}) {
  const written: string[] = [];
  const resize = vi.fn(async () => Buffer.from('img'));
  const deps: ThumbnailDeps = {
    cacheDir: 'C:/cache',
    getEntryPath: () => 'C:/Media/a.jpg',
    statFile: () => ({ size: 100, mtimeMs: 1000 }),
    resize,
    readCache: () => null,
    writeCache: (file) => {
      written.push(file);
    },
    readSetting: () => true,
    removeCacheFiles: () => 0,
    ...overrides,
  };
  return { deps, resize, written };
}

const dataUrl = (data: string): string => `data:image/webp;base64,${Buffer.from(data).toString('base64')}`;

describe('createThumbnailService', () => {
  it('returns a cached preview without resizing', async () => {
    const { deps, resize } = makeDeps({ readCache: () => Buffer.from('cached') });
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({ 1: dataUrl('cached') });
    expect(resize).not.toHaveBeenCalled();
  });

  it('generates and caches a preview when enabled', async () => {
    const { deps, resize, written } = makeDeps();
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({ 1: dataUrl('img') });
    expect(resize).toHaveBeenCalledWith('C:/Media/a.jpg');
    expect(written).toHaveLength(1);
    expect(written[0]).toMatch(/\.webp$/);
  });

  it('returns nothing when disabled and not cached', async () => {
    const { deps, resize } = makeDeps({ readSetting: () => false });
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({});
    expect(resize).not.toHaveBeenCalled();
  });

  it('serves a cached preview when disabled', async () => {
    const { deps } = makeDeps({ readSetting: () => false, readCache: () => Buffer.from('cached') });
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({ 1: dataUrl('cached') });
  });

  it('skips non-image files', async () => {
    const { deps, resize } = makeDeps({ getEntryPath: () => 'C:/Media/clip.mp4' });
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({});
    expect(resize).not.toHaveBeenCalled();
  });

  it('skips unknown ids and missing files', async () => {
    const unknown = createThumbnailService(makeDeps({ getEntryPath: () => null }).deps);
    expect(await unknown.getThumbnails([1])).toEqual({});
    const missing = createThumbnailService(makeDeps({ statFile: () => null }).deps);
    expect(await missing.getThumbnails([1])).toEqual({});
  });

  it('skips a file that fails to resize', async () => {
    const resize = vi.fn(async () => {
      throw new Error('bad image');
    });
    const { deps } = makeDeps({ resize });
    const service = createThumbnailService(deps);
    expect(await service.getThumbnails([1])).toEqual({});
  });

  it('clears the cache', () => {
    const service = createThumbnailService(makeDeps({ removeCacheFiles: () => 3 }).deps);
    expect(service.clearCache()).toBe(3);
  });
});
```

- [ ] **Step 8: Run the service test to verify it fails**

Run: `pnpm exec vitest run server/lib/thumbnails.test.ts`
Expected: FAIL — `./thumbnails` cannot be found.

- [ ] **Step 9: Implement `server/lib/thumbnails.ts`**

```ts
import '@tanstack/react-start/server-only';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import type { ThumbnailMap } from '../../app/lib/types';
import { appConfigStore } from './app-config';
import { thumbCacheDir, virtualToReal } from './db-path';
import { getEntryPathById } from './queries';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const THUMB_WIDTH = 256;

export type ThumbnailDeps = {
  cacheDir: string;
  getEntryPath: (id: number) => string | null;
  statFile: (path: string) => { size: number; mtimeMs: number } | null;
  resize: (path: string) => Promise<Buffer>;
  readCache: (file: string) => Buffer | null;
  writeCache: (file: string, data: Buffer) => void;
  readSetting: () => boolean;
  removeCacheFiles: () => number;
};

export type ThumbnailService = {
  getThumbnails: (ids: number[]) => Promise<ThumbnailMap>;
  clearCache: () => number;
};

function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.includes(path.slice(dot).toLowerCase());
}

function cacheKey(path: string, size: number, mtimeMs: number): string {
  return createHash('sha256').update(`${normalizeDirectoryPath(path).toLowerCase()}:${size}:${mtimeMs}`).digest('hex');
}

function toDataUrl(data: Buffer): string {
  return `data:image/webp;base64,${data.toString('base64')}`;
}

export function createThumbnailService(deps: ThumbnailDeps): ThumbnailService {
  return {
    getThumbnails: async (ids) => {
      const result: ThumbnailMap = {};
      if (ids.length === 0) return result;
      const enabled = deps.readSetting();
      for (const id of ids) {
        const stored = deps.getEntryPath(id);
        if (!stored) continue;
        const realPath = stored.startsWith('@fixtures') ? virtualToReal(stored) : stored;
        if (!isImagePath(realPath)) continue;
        const stat = deps.statFile(realPath);
        if (!stat) continue;
        const file = join(deps.cacheDir, `${cacheKey(realPath, stat.size, stat.mtimeMs)}.webp`);
        const cached = deps.readCache(file);
        if (cached) {
          result[id] = toDataUrl(cached);
          continue;
        }
        if (!enabled) continue;
        try {
          const data = await deps.resize(realPath);
          deps.writeCache(file, data);
          result[id] = toDataUrl(data);
        } catch {
          continue;
        }
      }
      return result;
    },
    clearCache: () => deps.removeCacheFiles(),
  };
}

function defaultDeps(): ThumbnailDeps {
  const cacheDir = thumbCacheDir();
  return {
    cacheDir,
    getEntryPath: (id) => getEntryPathById(id),
    statFile: (path) => {
      try {
        const stat = statSync(path);
        return { size: stat.size, mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    },
    resize: async (path) => {
      const data = await sharp(path)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: 75 })
        .toBuffer();
      return data;
    },
    readCache: (file) => {
      try {
        return readFileSync(file);
      } catch {
        return null;
      }
    },
    writeCache: (file, data) => {
      try {
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(file, data);
      } catch {
        return;
      }
    },
    readSetting: () => appConfigStore.get().application.generatePreviews,
    removeCacheFiles: () => {
      if (!existsSync(cacheDir)) return 0;
      let removed = 0;
      for (const name of readdirSync(cacheDir)) {
        try {
          rmSync(join(cacheDir, name), { force: true });
          removed += 1;
        } catch {
          continue;
        }
      }
      return removed;
    },
  };
}

export const thumbnails = createThumbnailService(defaultDeps());
```

- [ ] **Step 10: Run the service test to verify it passes**

Run: `pnpm exec vitest run server/lib/thumbnails.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 11: Create the endpoint — `server/routes/thumbnails.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';

export const getThumbnails = createServerFn({ method: 'POST' })
  .validator((input: { ids: number[] }) => input)
  .handler(async ({ data }) => {
    const { thumbnails } = await import('../lib/thumbnails');
    return thumbnails.getThumbnails(data.ids);
  });

export const clearThumbnailCache = createServerFn({ method: 'POST' }).handler(async () => {
  const { thumbnails } = await import('../lib/thumbnails');
  return { removed: thumbnails.clearCache() };
});
```

- [ ] **Step 12: Ignore the cache folder — `.gitignore`**

Add after the `server/data/app-config.db` line:

```
server/data/thumb-cache/
```

- [ ] **Step 13: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass. Confirm no `sharp`, `better-sqlite3`, or `sqlite` in `dist/client`.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add package.json pnpm-lock.yaml .gitignore app/lib/types.ts app/lib/db-path.ts app/lib/db-path.test.ts server/lib/thumbnails.ts server/lib/thumbnails.test.ts server/routes/thumbnails.ts
git commit -m "feat: add a cached thumbnail service"
```

### Task 3: Previews in the drawer and the Overview list

**Files:**
- Modify: `app/components/common/FilePreviewDrawer.tsx`
- Modify: `app/components/common/FilePreviewDrawer.test.tsx`
- Modify: `app/features/overview/OverviewPage.tsx`
- Modify: `app/features/overview/OverviewPage.test.tsx`
- Modify: `app/styles.css`
- Delete: `app/lib/placeholder-thumbs.ts`

**Interfaces:**
- Consumes: `getThumbnails` (Task 2); `ThumbnailMap` (Task 2).
- Produces: the drawer and Overview render real previews with an icon fallback.

- [ ] **Step 1: Replace the drawer — `app/components/common/FilePreviewDrawer.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Button, Drawer, Group, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { FileImage, FolderOpen } from 'lucide-react';
import { useApp } from '../../lib/app-context';
import { formatBytes } from '../../lib/format';
import { openEntry, revealEntry } from '../../../server/routes/native';
import { getThumbnails } from '../../../server/routes/thumbnails';
import type { NativeActionFailure } from '../../lib/types';

const FAILURE_MESSAGES: Record<NativeActionFailure, string> = {
  'not-found': 'File not found.',
  missing: 'File not found.',
  unsupported: 'This action is not supported here.',
  error: 'The action failed.',
};

export function FilePreviewDrawer() {
  const { selectedFile, setSelectedFile } = useApp();
  const [busy, setBusy] = useState<'reveal' | 'open' | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    setBusy(null);
  }, [selectedFile]);

  useEffect(() => {
    const id = selectedFile?.id;
    if (!id) {
      setThumb(null);
      return;
    }
    let active = true;
    getThumbnails({ data: { ids: [id] } })
      .then((map) => {
        if (active) setThumb(map[id] ?? null);
      })
      .catch(() => {
        if (active) setThumb(null);
      });
    return () => {
      active = false;
    };
  }, [selectedFile]);

  const run = async (kind: 'reveal' | 'open'): Promise<void> => {
    if (!selectedFile) return;
    setBusy(kind);
    try {
      const result =
        kind === 'reveal'
          ? await revealEntry({ data: { id: selectedFile.id } })
          : await openEntry({ data: { id: selectedFile.id } });
      if (result.ok) {
        notifications.show({
          color: 'cyan',
          message: kind === 'reveal' ? 'File shown in the file manager.' : 'Opened in the default application.',
        });
      } else {
        notifications.show({ color: 'red', message: FAILURE_MESSAGES[result.reason] });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer
      opened={!!selectedFile}
      onClose={() => setSelectedFile(null)}
      position="right"
      size={360}
      title="File details"
    >
      {selectedFile && (
        <>
          {thumb ? (
            <div className="drawer-thumb" style={{ backgroundImage: `url(${thumb})` }} />
          ) : (
            <div className="drawer-thumb drawer-thumb-empty">
              <FileImage size={40} />
            </div>
          )}
          <Text className="eyebrow" mt="lg">
            PATH
          </Text>
          <Text size="sm" className="path">
            {selectedFile.path}
          </Text>
          <Table mt="lg">
            <Table.Tbody>
              {(
                [
                  ['Size', formatBytes(selectedFile.size)],
                  ['Extension', selectedFile.extension],
                  ['Created', selectedFile.birthtime],
                  ['Hash', selectedFile.hash || 'NULL — unverified'],
                ] as const
              ).map(([label, value]) => (
                <Table.Tr key={label}>
                  <Table.Td c="dimmed">{label}</Table.Td>
                  <Table.Td>{value}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group mt="xl">
            <Button
              leftSection={<FolderOpen size={15} />}
              color="cyan"
              loading={busy === 'reveal'}
              disabled={busy !== null}
              onClick={() => void run('reveal')}
            >
              Reveal
            </Button>
            <Button
              variant="light"
              leftSection={<FileImage size={15} />}
              loading={busy === 'open'}
              disabled={busy !== null}
              onClick={() => void run('open')}
            >
              Open file
            </Button>
          </Group>
        </>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 2: Update the drawer test — `app/components/common/FilePreviewDrawer.test.tsx`**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AppProvider, useApp } from '../../lib/app-context';
import type { Entry } from '../../lib/types';

const mocks = vi.hoisted(() => ({
  revealEntry: vi.fn(),
  openEntry: vi.fn(),
  getThumbnails: vi.fn(),
  notifyShow: vi.fn(),
}));

vi.mock('../../../server/routes/native', () => ({
  revealEntry: mocks.revealEntry,
  openEntry: mocks.openEntry,
}));

vi.mock('../../../server/routes/thumbnails', () => ({
  getThumbnails: mocks.getThumbnails,
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: mocks.notifyShow },
}));

import { FilePreviewDrawer } from './FilePreviewDrawer';

const selected: Entry = {
  id: 7,
  size: 2048,
  directory: 'C:/Media/2025',
  extension: 'jpg',
  filename: 'a.jpg',
  birthtime: '2025-01-01T00:00:00Z',
  hash: 'abc',
  path: 'C:/Media/2025/a.jpg',
};

function Harness() {
  const { setSelectedFile } = useApp();
  useEffect(() => {
    setSelectedFile(selected);
  }, [setSelectedFile]);
  return <FilePreviewDrawer />;
}

function renderDrawer() {
  return render(
    <MantineProvider defaultColorScheme="dark">
      <AppProvider>
        <Harness />
      </AppProvider>
    </MantineProvider>,
  );
}

describe('FilePreviewDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getThumbnails.mockResolvedValue({});
  });

  it('renders nothing while closed', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AppProvider>
          <FilePreviewDrawer />
        </AppProvider>
      </MantineProvider>,
    );
    expect(screen.queryByText('File details')).not.toBeInTheDocument();
  });

  it('reveals the selected file and shows a success toast', async () => {
    mocks.revealEntry.mockResolvedValue({ ok: true });
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal' }));
    await waitFor(() => expect(mocks.revealEntry).toHaveBeenCalledWith({ data: { id: 7 } }));
    expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'cyan' }));
  });

  it('shows an error toast when reveal fails', async () => {
    mocks.revealEntry.mockResolvedValue({ ok: false, reason: 'missing' });
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal' }));
    await waitFor(() =>
      expect(mocks.notifyShow).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'red', message: 'File not found.' }),
      ),
    );
  });

  it('opens the selected file', async () => {
    mocks.openEntry.mockResolvedValue({ ok: true });
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: 'Open file' }));
    await waitFor(() => expect(mocks.openEntry).toHaveBeenCalledWith({ data: { id: 7 } }));
    expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'cyan' }));
  });

  it('renders the fetched preview', async () => {
    mocks.getThumbnails.mockResolvedValue({ 7: 'data:image/webp;base64,AAAA' });
    const { container } = renderDrawer();
    await waitFor(() => expect(mocks.getThumbnails).toHaveBeenCalledWith({ data: { ids: [7] } }));
    await waitFor(() => expect(container.querySelector('.drawer-thumb-empty')).not.toBeInTheDocument());
  });

  it('shows the placeholder when there is no preview', async () => {
    const { container } = renderDrawer();
    await waitFor(() => expect(container.querySelector('.drawer-thumb-empty')).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run the drawer test to verify it passes**

Run: `pnpm exec vitest run app/components/common/FilePreviewDrawer.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 4: Update the Overview page — `app/features/overview/OverviewPage.tsx`**

Replace the whole file with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Group, Text } from '@mantine/core';
import { ChevronRight, ImageIcon } from 'lucide-react';
import { useLoaderData, useRouter } from '@tanstack/react-router';
import { PageHeading } from '../../components/common/PageHeading';
import { MetricCard } from './MetricCard';
import { StorageMap } from './StorageMap';
import { LastRunCard } from './LastRunCard';
import { formatBytes } from '../../lib/format';
import { getThumbnails } from '../../../server/routes/thumbnails';
import type { OverviewData, ThumbnailMap } from '../../lib/types';

export function OverviewPage({ data }: { data: OverviewData }) {
  const router = useRouter();
  const { lastScan } = useLoaderData({ from: '__root__' });
  const [thumbById, setThumbById] = useState<ThumbnailMap>({});
  const ids = useMemo(() => data.largestFiles.map((entry) => entry.id), [data.largestFiles]);

  useEffect(() => {
    let active = true;
    getThumbnails({ data: { ids } })
      .then((map) => {
        if (active) setThumbById(map);
      })
      .catch(() => {
        if (active) setThumbById({});
      });
    return () => {
      active = false;
    };
  }, [ids]);

  const metrics: [string, string, string][] = [
    ['Total files', data.totalFiles.toLocaleString('en-US'), ''],
    ['Total size', formatBytes(data.totalSize), ''],
    ['Duplicate groups', String(data.duplicateGroups), ''],
    ['Redundant space', formatBytes(data.redundantSpace), ''],
    ['Unique files', data.uniqueFiles.toLocaleString('en-US'), ''],
  ];

  return (
    <>
      <PageHeading
        eyebrow="LIBRARY OVERVIEW"
        title="Overview"
        subtitle="A quiet view of what your library is keeping, duplicating, and missing."
        showExport
      />
      <div className="metric-grid">
        {metrics.map(([label, value, note]) => (
          <MetricCard key={label} label={label} value={value} note={note} />
        ))}
      </div>
      <div className="two-col">
        <StorageMap rows={data.storageMap} />
        <LastRunCard lastScan={lastScan} />
      </div>
      <Card className="compact-list">
        <Group justify="space-between">
          <div>
            <Text className="eyebrow">AT A GLANCE</Text>
            <h2>Largest files</h2>
          </div>
          <Button variant="subtle" size="xs" onClick={() => router.navigate({ to: '/analytics' })}>
            View analytics <ChevronRight size={14} />
          </Button>
        </Group>
        {data.largestFiles.map((entry) => (
          <Group justify="space-between" className="file-row" key={entry.id}>
            <Group>
              {thumbById[entry.id] ? (
                <img src={thumbById[entry.id]} alt="" />
              ) : (
                <span className="thumb-placeholder">
                  <ImageIcon size={18} />
                </span>
              )}
              <div>
                <Text size="sm">{entry.filename}</Text>
                <Text size="xs" c="dimmed">
                  {entry.directory}
                </Text>
              </div>
            </Group>
            <Text size="sm">{formatBytes(entry.size)}</Text>
          </Group>
        ))}
      </Card>
    </>
  );
}
```

- [ ] **Step 5: Update the Overview test — `app/features/overview/OverviewPage.test.tsx`**

Add the thumbnails mock near the other mocks and update the file:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Entry, LastScan, OverviewData } from '../../lib/types';

const shell = vi.hoisted(() => ({ lastScan: null as LastScan | null }));
const mocks = vi.hoisted(() => ({ getThumbnails: vi.fn() }));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useRouter: () => ({ navigate: vi.fn() }),
    useLoaderData: () => ({ lastScan: shell.lastScan }),
  };
});

vi.mock('../../../server/routes/thumbnails', () => ({ getThumbnails: mocks.getThumbnails }));

import { MantineProvider } from '@mantine/core';
import { OverviewPage } from './OverviewPage';

const entries: Entry[] = [1, 2, 3, 4].map((id) => ({
  id,
  size: 6_400,
  directory: 'C:/Media/2025',
  extension: '.jpg',
  filename: `file-${id}.jpg`,
  birthtime: '2025-01-01T00:00:00Z',
  hash: `h${id}`,
  path: `C:/Media/2025/file-${id}.jpg`,
}));

const data: OverviewData = {
  totalFiles: 1272,
  totalSize: 391_000_000,
  duplicateGroups: 24,
  redundantSpace: 307_200,
  uniqueFiles: 1200,
  storageMap: [
    { path: 'C:/Media/2025', share: 52, size: 200_000_000 },
    { path: 'C:/Media/2024', share: 30, size: 120_000_000 },
    { path: 'D:/Camera Imports', share: 18, size: 71_000_000 },
  ],
  largestFiles: entries,
};

const scan: LastScan = {
  finishedAt: new Date().toISOString(),
  directories: 2,
  filesScanned: 1272,
  entriesWritten: 1272,
  duplicateGroups: 24,
  duplicateFiles: 60,
  errors: 3,
};

function renderPage() {
  return render(
    <MantineProvider defaultColorScheme="dark">
      <OverviewPage data={data} />
    </MantineProvider>,
  );
}

describe('OverviewPage', () => {
  beforeEach(() => {
    shell.lastScan = null;
    vi.clearAllMocks();
    mocks.getThumbnails.mockResolvedValue({});
  });

  it('renders heading, real metrics, and largest files', () => {
    renderPage();
    expect(
      screen.getByText('A quiet view of what your library is keeping, duplicating, and missing.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total files')).toBeInTheDocument();
    expect(screen.getByText('1,272')).toBeInTheDocument();
    expect(screen.queryByText('Not backed up')).not.toBeInTheDocument();
    expect(screen.getAllByText('C:/Media/2025').length).toBeGreaterThan(0);
    expect(screen.getByText('Largest files')).toBeInTheDocument();
  });

  it('shows the last run summary and errors', () => {
    shell.lastScan = scan;
    renderPage();
    expect(screen.getByText(/Last scan /)).toBeInTheDocument();
    expect(screen.getByText('Directories')).toBeInTheDocument();
    expect(screen.getByText('Files scanned')).toBeInTheDocument();
    expect(screen.getByText(/3 errors during the scan/)).toBeInTheDocument();
  });

  it('shows no scan yet without a record', () => {
    renderPage();
    expect(screen.getByText('No scan yet')).toBeInTheDocument();
  });

  it('renders fetched previews', async () => {
    mocks.getThumbnails.mockResolvedValue({ 1: 'data:image/webp;base64,AAAA' });
    const { container } = renderPage();
    await waitFor(() => expect(mocks.getThumbnails).toHaveBeenCalledWith({ data: { ids: [1, 2, 3, 4] } }));
    await waitFor(() => expect(container.querySelector('.file-row img')).toBeInTheDocument());
  });

  it('shows placeholders when there is no preview', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('.thumb-placeholder')).toHaveLength(4);
  });
});
```

- [ ] **Step 6: Add the placeholder styles — `app/styles.css`**

Add after the `.drawer-thumb` rule:

```css
.drawer-thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #171b22;
  color: #6b7686;
}
```

Add after the `.file-row img` rule:

```css
.file-row .thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 5px;
  background: #171b22;
  color: #6b7686;
}
```

- [ ] **Step 7: Delete the placeholder thumbnails**

Run:

```bash
trash app/lib/placeholder-thumbs.ts
```

- [ ] **Step 8: Verify no references remain**

Run: `rg -n "placeholder-thumbs" app server`
Expected: no output.

- [ ] **Step 9: Run the client tests to verify they pass**

Run: `pnpm exec vitest run app/components/common/FilePreviewDrawer.test.tsx app/features/overview/OverviewPage.test.tsx`
Expected: PASS.

- [ ] **Step 10: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass. Confirm no `sharp`/`better-sqlite3`/`sqlite` in `dist/client`.

```bash
git add app/components/common/FilePreviewDrawer.tsx app/components/common/FilePreviewDrawer.test.tsx app/features/overview/OverviewPage.tsx app/features/overview/OverviewPage.test.tsx app/styles.css app/lib/placeholder-thumbs.ts
git commit -m "feat: show real previews in the drawer and overview"
```

### Task 4: Preview controls (Preferences and Overview)

**Files:**
- Modify: `server/routes/preferences.ts`
- Modify: `server/routes/overview.ts`
- Modify: `app/routes/index.tsx`
- Modify: `app/features/overview/OverviewPage.tsx`
- Modify: `app/features/overview/OverviewPage.test.tsx`
- Modify: `app/features/preferences/PreferencesPage.tsx`
- Modify: `app/features/preferences/PreferencesPage.test.tsx`

**Interfaces:**
- Consumes: `clearThumbnailCache` (Task 2); `generatePreviews` (Task 1).
- Produces: `setPreviewsEnabled`; the Overview quick switch; the Preferences switch and clear action.

- [ ] **Step 1: Add `setPreviewsEnabled` — `server/routes/preferences.ts`**

Append:

```ts
export const setPreviewsEnabled = createServerFn({ method: 'POST' })
  .validator((input: { enabled: boolean }) => input)
  .handler(async ({ data }) => {
    const { appConfigStore } = await import('../lib/app-config');
    const config = appConfigStore.get();
    const saved = appConfigStore.saveApplication({ ...config.application, generatePreviews: data.enabled });
    return { enabled: saved.application.generatePreviews };
  });
```

- [ ] **Step 2: Return the setting from the Overview loader — `server/routes/overview.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';

export const getOverviewData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getOverviewStats } = await import('../lib/queries');
  const { appConfigStore } = await import('../lib/app-config');
  return { data: getOverviewStats(), previewsEnabled: appConfigStore.get().application.generatePreviews };
});
```

- [ ] **Step 3: Pass the setting — `app/routes/index.tsx`**

```tsx
function IndexComponent() {
  const { data, previewsEnabled } = useLoaderData({ from: '/' });
  return <OverviewPage data={data} previewsEnabled={previewsEnabled} />;
}
```

- [ ] **Step 4: Add the Overview switch — `app/features/overview/OverviewPage.tsx`**

Change the imports to add `Switch` and the settings function:

```tsx
import { Button, Card, Group, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { setPreviewsEnabled } from '../../../server/routes/preferences';
```

Change the component signature and add the state and handler:

```tsx
export function OverviewPage({ data, previewsEnabled }: { data: OverviewData; previewsEnabled: boolean }) {
  const router = useRouter();
  const { lastScan } = useLoaderData({ from: '__root__' });
  const [enabled, setEnabled] = useState(previewsEnabled);
  const [thumbById, setThumbById] = useState<ThumbnailMap>({});
  const ids = useMemo(() => data.largestFiles.map((entry) => entry.id), [data.largestFiles]);

  useEffect(() => {
    let active = true;
    getThumbnails({ data: { ids } })
      .then((map) => {
        if (active) setThumbById(map);
      })
      .catch(() => {
        if (active) setThumbById({});
      });
    return () => {
      active = false;
    };
  }, [ids, enabled]);

  const togglePreviews = (value: boolean) => {
    void setPreviewsEnabled({ data: { enabled: value } })
      .then((result) => setEnabled(result.enabled))
      .catch(() => notifications.show({ color: 'red', message: 'Could not update the preview setting.' }));
  };
```

Add the switch to the "Largest files" header group:

```tsx
          <Group gap="sm">
            <Switch
              size="xs"
              checked={enabled}
              onChange={(event) => togglePreviews(event.currentTarget.checked)}
              aria-label="Generate thumbnail previews"
            />
            <Button variant="subtle" size="xs" onClick={() => router.navigate({ to: '/analytics' })}>
              View analytics <ChevronRight size={14} />
            </Button>
          </Group>
```

- [ ] **Step 5: Update the Overview test — `app/features/overview/OverviewPage.test.tsx`**

Add a preferences mock and a switch test, and pass the new prop:

```tsx
const mocks = vi.hoisted(() => ({ getThumbnails: vi.fn(), setPreviewsEnabled: vi.fn() }));

vi.mock('../../../server/routes/thumbnails', () => ({ getThumbnails: mocks.getThumbnails }));
vi.mock('../../../server/routes/preferences', () => ({ setPreviewsEnabled: mocks.setPreviewsEnabled }));
```

In `beforeEach`, add `mocks.setPreviewsEnabled.mockResolvedValue({ enabled: true });`.

Change `renderPage` to:

```tsx
function renderPage(previewsEnabled = false) {
  return render(
    <MantineProvider defaultColorScheme="dark">
      <OverviewPage data={data} previewsEnabled={previewsEnabled} />
    </MantineProvider>,
  );
}
```

Add:

```tsx
  it('toggles previews from the Overview switch', async () => {
    renderPage(false);
    fireEvent.click(screen.getByRole('switch', { name: 'Generate thumbnail previews' }));
    await waitFor(() => expect(mocks.setPreviewsEnabled).toHaveBeenCalledWith({ data: { enabled: true } }));
  });
```

Add `fireEvent` to the `@testing-library/react` import.

- [ ] **Step 6: Run the Overview test to verify it passes**

Run: `pnpm exec vitest run app/features/overview/OverviewPage.test.tsx`
Expected: PASS.

- [ ] **Step 7: Add the Preferences switch and clear action — `app/features/preferences/PreferencesPage.tsx`**

Add the import:

```tsx
import { clearThumbnailCache } from '../../../server/routes/thumbnails';
```

Add the clear handler after `saveApplication`:

```tsx
  const clearCache = () => {
    void clearThumbnailCache()
      .then((result) => notifications.show({ color: 'cyan', message: `Preview cache cleared (${result.removed} files).` }))
      .catch(() => notifications.show({ color: 'red', message: 'Could not clear the preview cache.' }));
  };
```

Add a switch row inside `settings-options`, after the `verifyFiles` block:

```tsx
              <div className="setting-row">
                <div>
                  <Text size="sm">Generate thumbnail previews</Text>
                  <Text size="xs" c="dimmed">
                    Build small preview images for the drawer and Overview. Off by default. Cached previews still show
                    when off.
                  </Text>
                </div>
                <Switch
                  checked={application.generatePreviews}
                  onChange={(event) => {
                    setApplication((current) => ({ ...current, generatePreviews: event.currentTarget.checked }));
                    setSaved(false);
                  }}
                  aria-label="Generate thumbnail previews"
                />
              </div>
```

Add the clear button to the action group:

```tsx
            <Group justify="flex-end" mt="md">
              <Button variant="subtle" color="orange" onClick={clearCache}>
                Clear preview cache
              </Button>
              <Button variant="subtle" onClick={resetDefaults}>
                Reset to defaults
              </Button>
              <Button color="cyan" onClick={() => void saveApplication()}>
                Save preferences
              </Button>
            </Group>
```

- [ ] **Step 8: Update the Preferences test — `app/features/preferences/PreferencesPage.test.tsx`**

Add the thumbnails mock and two tests. Add to `mocks`:

```tsx
const mocks = vi.hoisted(() => ({
  saveDirectories: vi.fn(),
  saveApplicationSettings: vi.fn(),
  pickDirectory: vi.fn(),
  clearThumbnailCache: vi.fn(),
  notifyShow: vi.fn(),
}));
```

Add the module mock:

```tsx
vi.mock('../../../server/routes/thumbnails', () => ({
  clearThumbnailCache: mocks.clearThumbnailCache,
}));
```

Add to `beforeEach`: `mocks.clearThumbnailCache.mockResolvedValue({ removed: 2 });`.

Add tests:

```tsx
  it('saves the preview setting with the application form', async () => {
    mocks.saveApplicationSettings.mockResolvedValue({
      directories: DEFAULT_APP_CONFIG.directories,
      application: { ...DEFAULT_APP_CONFIG.application, generatePreviews: true },
    });
    renderPage();
    fireEvent.click(screen.getByRole('switch', { name: 'Generate thumbnail previews' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(mocks.saveApplicationSettings).toHaveBeenCalledTimes(1));
    expect(mocks.saveApplicationSettings.mock.calls[0][0].data.generatePreviews).toBe(true);
  });

  it('clears the preview cache', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Clear preview cache' }));
    await waitFor(() => expect(mocks.clearThumbnailCache).toHaveBeenCalledTimes(1));
    expect(mocks.notifyShow).toHaveBeenCalledWith(expect.objectContaining({ color: 'cyan' }));
  });
```

- [ ] **Step 9: Run the Preferences test to verify it passes**

Run: `pnpm exec vitest run app/features/preferences/PreferencesPage.test.tsx`
Expected: PASS.

- [ ] **Step 10: Run the full check + build, then commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build`
Expected: all pass. Confirm no `sharp`/`better-sqlite3`/`sqlite` in `dist/client`.

Run: `git restore app/routeTree.gen.ts` only if it changed and is not part of this task.

```bash
git add server/routes/preferences.ts server/routes/overview.ts app/routes/index.tsx app/features/overview/OverviewPage.tsx app/features/overview/OverviewPage.test.tsx app/features/preferences/PreferencesPage.tsx app/features/preferences/PreferencesPage.test.tsx
git commit -m "feat: add preview controls to preferences and the overview"
```

### Task 5: Final verification + Phase 5 docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Run the full check**

Run: `pnpm check`
Expected: `generate-routes`, typecheck, lint, tests, and format all pass.

- [ ] **Step 2: Production build + client safety**

Run: `pnpm build`
Expected: build succeeds. Verify:

Run: `rg -l "sharp|better-sqlite3|sqlite" dist/client`
Expected: no output.

- [ ] **Step 3: Manual smoke**

Run `pnpm dev`. Turn previews on in Preferences. Open a real image in the drawer and see it. See the Overview largest-files previews. Reload and restart the dev server; previews come from the cache. Turn the setting off from the Overview switch; cached previews stay, a new file shows an icon. Clear the cache in Preferences.

- [ ] **Step 4: Record Phase 5 complete**

In `docs/ROADMAP.md`:
- Change the Phase 5 overview row status from `[ ]` to `[x]`.
- Add to the "Detailed specs" table:
  ```
  | 5 | [2026-10-04-phase5-thumbnails-design.md](superpowers/specs/2026-10-04-phase5-thumbnails-design.md) |
  ```

In `AGENTS.md` "Current Plan State", add a Phase 5 bullet after the Cleanup A bullet:

```
- Phase 5 (real thumbnails/previews) — **complete**: `sharp` generates small WebP previews,
  cached in the gitignored `server/data/thumb-cache/`, shown in the file drawer and the
  Overview largest-files list behind the opt-in `generatePreviews` setting (off by default).
  Spec at `docs/superpowers/specs/2026-10-04-phase5-thumbnails-design.md`; plan at
  `docs/superpowers/plans/2026-10-04-phase5-thumbnails.md`.
```

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md AGENTS.md
git commit -m "docs: record Phase 5 complete"
```

## Self-Review Checklist

1. **Spec coverage:**
   - `ApplicationConfig.generatePreviews` (off by default) + normalize/validate → Task 1.
   - `sharp` dependency, `thumbCacheDir`, `.gitignore`, `server/lib/thumbnails.ts`, `server/routes/thumbnails.ts` → Task 2.
   - Drawer and Overview previews + icon fallback; delete `placeholder-thumbs.ts` → Task 3.
   - Preferences switch + clear action; Overview quick switch; `setPreviewsEnabled`; loader field → Task 4.
   - Verification + docs → Task 5.
2. **Placeholder scan:** every step has full code or an exact command; no TBD/TODO.
3. **Type consistency:** `ThumbnailMap` defined in Task 2 and used in Tasks 3–4; `createThumbnailService` / `ThumbnailDeps` / `getThumbnails` / `clearThumbnailCache` / `setPreviewsEnabled` names match between module, routes, and clients; `generatePreviews` matches between the type, defaults, store, and UI.
4. **Risk notes:** `sharp` is a new native dependency; if `pnpm add sharp` or `pnpm build` fails, halt and report. The `thumbnails.test.ts` uses an injected seam, so it needs no real images. The Overview page is edited in Tasks 3 and 4; Task 4 branches after Task 3 merges. `placeholder-thumbs.ts` is removed in Task 3.
