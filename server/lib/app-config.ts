import '@tanstack/react-start/server-only';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { DEFAULT_APP_CONFIG } from '../../app/lib/app-config-defaults';
import type {
  AppConfig,
  ApplicationConfig,
  DirectoriesConfig,
  DirectoryMeta,
  IndexedDirectory,
} from '../../app/lib/types';
import { appConfigDbPath } from './db-path';

const DIRECTORY_KEY = 'directories';
const APPLICATION_KEY = 'application';
const DIRECTORY_META_KEY = 'directory_meta';

export type AppConfigStore = {
  get: () => AppConfig;
  saveApplication: (input: ApplicationConfig) => AppConfig;
  saveDirectories: (input: DirectoriesConfig) => AppConfig;
  recordScannedDirectories: (paths: string[], at: string) => AppConfig;
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

function isDirectoryMeta(value: unknown): value is DirectoryMeta {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => isRecord(entry) && typeof entry.lastScannedAt === 'string');
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
    directoryMeta: readKey(db, DIRECTORY_META_KEY, DEFAULT_APP_CONFIG.directoryMeta, isDirectoryMeta),
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
  };
}

export const appConfigStore = createAppConfigStore(appConfigDbPath());
