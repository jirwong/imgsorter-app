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
    expect(saved.directories.ignored).toEqual(['c:/media/keep']);
  });

  it('falls back to defaults when stored JSON is invalid', () => {
    store.get();
    const raw = new Database(dbPath);
    raw.prepare(`UPDATE app_config SET value = 'not json' WHERE key = 'application'`).run();
    raw.close();
    expect(store.get().application).toEqual(DEFAULT_APP_CONFIG.application);
  });
});
