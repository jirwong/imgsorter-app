import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
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

  it('writes only to its own file', () => {
    store.saveDirectories({ indexed: [], ignored: [] });
    expect(readdirSync(dir)).toEqual(['app-config.db']);
  });

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

  it('ignores an invalid directory_meta value', () => {
    store.get();
    const raw = new Database(dbPath);
    raw.prepare(`UPDATE app_config SET value = '[]' WHERE key = 'directory_meta'`).run();
    raw.close();
    expect(store.get().directoryMeta).toEqual({});
  });

  it('defaults keepers to an empty list', () => {
    expect(store.getKeepers()).toEqual([]);
  });

  it('normalizes, de-duplicates, and round-trips keepers', () => {
    const saved = store.setKeepers([' C:\\Media\\A.jpg ', 'c:/media/a.jpg', '', 'C:\\Media\\B.jpg\\']);
    expect(saved).toEqual(['C:/Media/A.jpg', 'C:/Media/B.jpg']);
    expect(store.getKeepers()).toEqual(['C:/Media/A.jpg', 'C:/Media/B.jpg']);
  });

  it('keeps keepers when directories and settings are saved', () => {
    store.setKeepers(['C:/Media/A.jpg']);
    store.saveDirectories({ indexed: [], ignored: [] });
    store.saveApplication({ ...DEFAULT_APP_CONFIG.application, extensions: 'png' });
    expect(store.getKeepers()).toEqual(['C:/Media/A.jpg']);
  });

  it('ignores an invalid keepers value', () => {
    store.getKeepers();
    const raw = new Database(dbPath);
    raw.prepare(`UPDATE app_config SET value = '{}' WHERE key = 'keepers'`).run();
    raw.close();
    expect(store.getKeepers()).toEqual([]);
  });

  it('defaults hidden files to an empty list', () => {
    expect(store.getHidden()).toEqual([]);
  });

  it('normalizes, de-duplicates, and round-trips hidden files', () => {
    const saved = store.setHidden([' C:\\Media\\A.jpg ', 'c:/media/a.jpg', '', 'C:\\Media\\B.jpg\\']);
    expect(saved).toEqual(['C:/Media/A.jpg', 'C:/Media/B.jpg']);
    expect(store.getHidden()).toEqual(['C:/Media/A.jpg', 'C:/Media/B.jpg']);
  });

  it('keeps hidden files when directories and settings are saved', () => {
    store.setHidden(['C:/Media/A.jpg']);
    store.saveDirectories({ indexed: [], ignored: [] });
    store.saveApplication({ ...DEFAULT_APP_CONFIG.application, extensions: 'png' });
    expect(store.getHidden()).toEqual(['C:/Media/A.jpg']);
  });

  it('ignores an invalid hidden value', () => {
    store.getHidden();
    const raw = new Database(dbPath);
    raw.prepare(`UPDATE app_config SET value = '{}' WHERE key = 'hidden'`).run();
    raw.close();
    expect(store.getHidden()).toEqual([]);
  });

  it('defaults the last scan to null', () => {
    expect(store.getLastScan()).toBeNull();
  });

  it('round-trips the last scan', () => {
    const scan = {
      finishedAt: '2026-10-04T08:00:00.000Z',
      directories: 2,
      filesScanned: 100,
      entriesWritten: 98,
      duplicateGroups: 5,
      duplicateFiles: 12,
      errors: 2,
    };
    expect(store.recordLastScan(scan)).toEqual(scan);
    expect(store.getLastScan()).toEqual(scan);
  });

  it('reads a malformed last scan as null', () => {
    store.recordLastScan({
      finishedAt: '2026-10-04T08:00:00.000Z',
      directories: 1,
      filesScanned: 1,
      entriesWritten: 1,
      duplicateGroups: 0,
      duplicateFiles: 0,
      errors: 0,
    });
    const raw = new Database(dbPath);
    raw.prepare(`UPDATE app_config SET value = 'nope' WHERE key = 'last_scan'`).run();
    raw.close();
    expect(store.getLastScan()).toBeNull();
  });

  it('reads a wrong-shape last scan as null', () => {
    store.getLastScan();
    const raw = new Database(dbPath);
    raw.prepare(`INSERT OR REPLACE INTO app_config (key, value) VALUES ('last_scan', ?)`).run('{"finishedAt":1}');
    raw.close();
    expect(store.getLastScan()).toBeNull();
  });

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
    raw.prepare(`UPDATE app_config SET value = ? WHERE key = 'application'`).run(
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

  it('falls back to defaults when stored JSON is invalid', () => {
    store.get();
    const raw = new Database(dbPath);
    raw.prepare(`UPDATE app_config SET value = 'not json' WHERE key = 'application'`).run();
    raw.close();
    expect(store.get().application).toEqual(DEFAULT_APP_CONFIG.application);
  });

  it('resets the scan metadata', () => {
    store.recordLastScan({
      finishedAt: '2026-10-04T08:00:00.000Z',
      directories: 1,
      filesScanned: 5,
      entriesWritten: 5,
      duplicateGroups: 1,
      duplicateFiles: 2,
      errors: 0,
    });
    store.recordScannedDirectories(['C:/Media'], '2026-10-04T08:00:00.000Z');
    expect(store.getLastScan()).not.toBeNull();
    expect(Object.keys(store.get().directoryMeta).length).toBeGreaterThan(0);

    store.resetScanMetadata();

    expect(store.getLastScan()).toBeNull();
    expect(store.get().directoryMeta).toEqual({});
  });
});
