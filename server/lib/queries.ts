import '@tanstack/react-start/server-only';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import type {
  AnalyticsData,
  DirectoryStat,
  DuplicateGroup,
  Entry,
  FilesInput,
  KeeperMap,
  OverviewData,
  ShellData,
} from '../../app/lib/types';
import { mapPathToDisplay, rootLabelOf, toStoragePath, toStorageRoots } from './labels';
import { isWithinRoots } from './directory-scope';
import { sampleDbPath } from './db-path';
import { withRead } from './db';
import { scopeClause, subtreeClause } from './scope-sql';
import type { ScopeClause } from './scope-sql';

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

function openWritable(): DatabaseType | null {
  const path = dbPath();
  if (!existsSync(path)) return null;
  return new Database(path);
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

function readScopedRows(roots: string[]): EntryRow[] {
  const db = openReadonly();
  if (!db) return [];
  try {
    const rows = db
      .prepare(`SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries`)
      .all() as EntryRow[];
    return rows.filter((row) => isWithinRoots(mapPathToDisplay(row.directory), roots));
  } finally {
    db.close();
  }
}

function readEntries(roots: string[]): Entry[] {
  return readScopedRows(roots).map(toEntry);
}

export type DuplicateGroupRow = { hash: string; filename: string; n: number; firstId: number };

type CountRow = { n: number };

function readScope(roots: string[]): ScopeClause {
  return scopeClause(toStorageRoots(roots));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function filterClause(input: FilesInput): ScopeClause {
  const conditions: string[] = [];
  const params: string[] = [];
  const query = escapeLike(input.query.trim().toLowerCase());
  if (query) {
    conditions.push(`(lower(filename) LIKE ? ESCAPE '\\' OR lower(path) LIKE ? ESCAPE '\\')`);
    params.push(`%${query}%`, `%${query}%`);
  }
  if (input.dir !== 'All directories') {
    const scope = subtreeClause(toStoragePath(input.dir));
    conditions.push(scope.sql);
    params.push(...scope.params);
  }
  if (input.ext !== 'All types') {
    conditions.push(`extension = ?`);
    params.push(input.ext);
  }
  if (input.selectedDirs.length > 0) {
    const scopes = input.selectedDirs.map((dir) => subtreeClause(toStoragePath(dir)));
    conditions.push(`(${scopes.map((scope) => scope.sql).join(' OR ')})`);
    params.push(...scopes.flatMap((scope) => scope.params));
  }
  return { sql: conditions.length === 0 ? '1' : conditions.join(' AND '), params };
}

function duplicateGroupSql(scope: ScopeClause): string {
  return `SELECT hash, filename, COUNT(*) AS n, MIN(id) AS firstId
    FROM entries
    WHERE ${scope.sql} AND hash IS NOT NULL AND hash <> ''
    GROUP BY hash, filename
    HAVING COUNT(*) >= 2`;
}

export function duplicateGroupRows(db: DatabaseType, scope: ScopeClause): DuplicateGroupRow[] {
  return db.prepare(duplicateGroupSql(scope)).all(...scope.params) as DuplicateGroupRow[];
}

function storageMapRows(
  totalSize: number,
  directories: { directory: string; n: number; bytes: number }[],
): OverviewData['storageMap'] {
  const byRoot = new Map<string, number>();
  for (const { directory, bytes } of directories) {
    const label = rootLabelOf(mapPathToDisplay(directory));
    byRoot.set(label, (byRoot.get(label) ?? 0) + bytes);
  }
  return [...byRoot.entries()]
    .map(([path, size]) => ({ path, size, share: totalSize === 0 ? 0 : Math.round((size / totalSize) * 100) }))
    .sort((a, b) => b.size - a.size);
}

type DuplicateGrouping = {
  key: string;
  hash: string;
  name: string;
  count: number;
  size: number;
  extension: string;
  directories: string[];
  files: Entry[];
};

function groupDuplicates(entries: Entry[]): DuplicateGrouping[] {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (!entry.hash) continue;
    const key = `${entry.hash}\u0000${entry.filename}`;
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  const result: DuplicateGrouping[] = [];
  for (const files of groups.values()) {
    if (files.length < 2) continue;
    const first = files[0];
    result.push({
      key: `${first.hash}:${first.filename}`,
      hash: first.hash as string,
      name: first.filename,
      count: files.length,
      size: first.size,
      extension: first.extension,
      directories: [...new Set(files.map((file) => file.directory))],
      files,
    });
  }
  return result;
}

export function getOverviewStatsSql(roots: string[]): OverviewData {
  const stats = withRead((db) => {
    const scope = readScope(roots);
    const files = db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE ${scope.sql}`).get(...scope.params) as CountRow;
    const size = db
      .prepare(`SELECT COALESCE(SUM(size), 0) AS n FROM entries WHERE ${scope.sql}`)
      .get(...scope.params) as CountRow;
    const groups = duplicateGroupRows(db, scope);
    const redundant = db
      .prepare(
        `SELECT COALESCE(SUM((g.n - 1) * e.size), 0) AS n
        FROM (${duplicateGroupSql(scope)}) AS g
        JOIN entries AS e ON e.id = g.firstId`,
      )
      .get(...scope.params) as CountRow;
    const unique = db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
        SELECT hash FROM entries
        WHERE ${scope.sql} AND hash IS NOT NULL AND hash <> ''
        GROUP BY hash HAVING COUNT(*) = 1
      )`,
      )
      .get(...scope.params) as CountRow;
    const directories = db
      .prepare(
        `SELECT directory, COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes
        FROM entries WHERE ${scope.sql} GROUP BY directory`,
      )
      .all(...scope.params) as { directory: string; n: number; bytes: number }[];
    const largest = db
      .prepare(
        `SELECT id, size, directory, extension, filename, birthtime, hash, path
        FROM entries WHERE ${scope.sql} ORDER BY size DESC, filename ASC LIMIT 4`,
      )
      .all(...scope.params) as EntryRow[];
    const totalSize = size.n;
    return {
      totalFiles: files.n,
      totalSize,
      duplicateGroups: groups.length,
      redundantSpace: redundant.n,
      uniqueFiles: unique.n,
      storageMap: storageMapRows(totalSize, directories),
      largestFiles: largest.map(toEntry),
    };
  });
  if (stats) return stats;
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

export function getOverviewStats(roots: string[]): OverviewData {
  return getOverviewStatsSql(roots);
}

export function listEntriesSql(input: FilesInput, roots: string[]): Entry[] {
  const entries = withRead((db) => {
    const scope = readScope(roots);
    const filter = filterClause(input);
    const rows = db
      .prepare(
        `SELECT id, size, directory, extension, filename, birthtime, hash, path
        FROM entries
        WHERE ${scope.sql} AND ${filter.sql}
        ORDER BY directory, filename`,
      )
      .all(...scope.params, ...filter.params) as EntryRow[];
    return rows.map(toEntry);
  });
  return entries ?? [];
}

export function listEntries(input: FilesInput, roots: string[]): Entry[] {
  return listEntriesSql(input, roots);
}

export function getDirectoryStatsSql(roots: string[]): DirectoryStat[] {
  const stats = withRead((db) => {
    const scope = readScope(roots);
    const rows = db
      .prepare(
        `SELECT directory, COUNT(*) AS fileCount, COALESCE(SUM(size), 0) AS size
        FROM entries WHERE ${scope.sql} GROUP BY directory`,
      )
      .all(...scope.params) as { directory: string; fileCount: number; size: number }[];
    return rows.map((row) => ({ path: mapPathToDisplay(row.directory), fileCount: row.fileCount, size: row.size }));
  });
  return stats ?? [];
}

export function getDirectoryStats(roots: string[]): DirectoryStat[] {
  return getDirectoryStatsSql(roots);
}

export function getAnalyticsDataSql(roots: string[]): AnalyticsData {
  const data = withRead((db) => {
    const scope = readScope(roots);
    const rankedBySize = db
      .prepare(`SELECT filename, size FROM entries WHERE ${scope.sql} ORDER BY size DESC, filename ASC`)
      .all(...scope.params) as { filename: string; size: number }[];
    const rankedByCopies = duplicateGroupRows(db, scope)
      .sort((a, b) => b.n - a.n || (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0))
      .map((row) => ({ name: row.filename, count: row.n }));
    return { rankedBySize, rankedByCopies };
  });
  return data ?? { rankedBySize: [], rankedByCopies: [] };
}

export function getAnalyticsData(roots: string[]): AnalyticsData {
  return getAnalyticsDataSql(roots);
}

export function getShellDataSql(roots: string[]): ShellData {
  const shell = withRead((db) => {
    const scope = readScope(roots);
    const files = db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE ${scope.sql}`).get(...scope.params) as CountRow;
    const size = db
      .prepare(`SELECT COALESCE(SUM(size), 0) AS n FROM entries WHERE ${scope.sql}`)
      .get(...scope.params) as CountRow;
    const duplicateGroups = db
      .prepare(`SELECT COUNT(*) AS n FROM (${duplicateGroupSql(scope)})`)
      .get(...scope.params) as CountRow;
    return { files: files.n, size: size.n, duplicateGroups: duplicateGroups.n };
  });
  return shell ?? { files: 0, size: 0, duplicateGroups: 0 };
}

export function getShellData(roots: string[]): ShellData {
  return getShellDataSql(roots);
}

export function getDuplicateGroups(roots: string[]): DuplicateGroup[] {
  return groupDuplicates(readEntries(roots))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => ({
      key: group.key,
      hash: group.hash,
      name: group.name,
      count: group.count,
      size: group.size,
      redundantSpace: (group.count - 1) * group.size,
      extension: group.extension,
      directories: group.directories,
      files: group.files,
    }));
}

export function countEntriesByDirectory(root: string, roots: string[]): number {
  const normalized = normalizeDirectoryPath(mapPathToDisplay(root)).toLowerCase();
  return readEntries(roots).filter(
    (entry) =>
      entry.directory.toLowerCase() === normalized || entry.directory.toLowerCase().startsWith(`${normalized}/`),
  ).length;
}

export function getEntryPathById(id: number): string | null {
  const db = openReadonly();
  if (!db) return null;
  try {
    const row = db.prepare(`SELECT path FROM entries WHERE id = ?`).get(id) as { path: string } | undefined;
    return row?.path ?? null;
  } finally {
    db.close();
  }
}

export function getEntryPathsByIds(ids: number[]): string[] {
  if (ids.length === 0) return [];
  const db = openReadonly();
  if (!db) return [];
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const rows = db.prepare(`SELECT path FROM entries WHERE id IN (${placeholders})`).all(...ids) as {
      path: string;
    }[];
    return rows.map((row) => row.path);
  } finally {
    db.close();
  }
}

export function getKeeperData(paths: string[], roots: string[]): { keepers: KeeperMap; stale: string[] } {
  const keepers: KeeperMap = {};
  if (paths.length === 0) return { keepers, stale: [] };
  const db = openReadonly();
  if (!db) return { keepers, stale: [] };
  try {
    const rows = db
      .prepare(`SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries`)
      .all() as EntryRow[];
    const allCounts = new Map<string, number>();
    const scopedCounts = new Map<string, number>();
    const byPath = new Map<string, { row: EntryRow; scoped: boolean }>();
    for (const row of rows) {
      const scoped = isWithinRoots(mapPathToDisplay(row.directory), roots);
      if (row.hash) {
        const key = `${row.hash}:${row.filename}`;
        allCounts.set(key, (allCounts.get(key) ?? 0) + 1);
        if (scoped) scopedCounts.set(key, (scopedCounts.get(key) ?? 0) + 1);
      }
      byPath.set(normalizeDirectoryPath(row.path).toLowerCase(), { row, scoped });
    }
    const stale: string[] = [];
    for (const path of paths) {
      const found = byPath.get(normalizeDirectoryPath(path).toLowerCase());
      if (!found || !found.row.hash) {
        stale.push(path);
        continue;
      }
      const key = `${found.row.hash}:${found.row.filename}`;
      if ((allCounts.get(key) ?? 0) <= 1) {
        stale.push(path);
        continue;
      }
      if (found.scoped && (scopedCounts.get(key) ?? 0) > 1) keepers[key] = found.row.id;
    }
    return { keepers, stale };
  } finally {
    db.close();
  }
}

export function clearIndex(): { entries: number; records: number } {
  const db = openWritable();
  if (!db) return { entries: 0, records: 0 };
  try {
    const clear = db.transaction(() => {
      const records = db.prepare(`DELETE FROM records`).run().changes;
      const entries = db.prepare(`DELETE FROM entries`).run().changes;
      return { entries, records };
    });
    return clear();
  } finally {
    db.close();
  }
}
