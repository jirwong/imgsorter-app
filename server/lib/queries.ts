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

export type DuplicateGroupRow = { hash: string; filename: string; n: number; firstId: number };

type CountRow = { n: number };

type KeeperRow = {
  pathKey: string;
  id: number | null;
  hash: string | null;
  filename: string | null;
  scoped: number;
  allCount: number;
  scopedCount: number;
};

const fixturePathChecks = new WeakMap<DatabaseType, boolean>();

function storesFixturePaths(db: DatabaseType): boolean {
  const cached = fixturePathChecks.get(db);
  if (cached !== undefined) return cached;
  const row = db.prepare(`SELECT 1 AS n FROM entries WHERE path LIKE '@fixtures/%' LIMIT 1`).get();
  const found = row !== undefined;
  fixturePathChecks.set(db, found);
  return found;
}

export function storagePath(db: DatabaseType, path: string): string {
  return storesFixturePaths(db) ? toStoragePath(path) : path;
}

export function storageRoots(db: DatabaseType, roots: string[]): string[] {
  return storesFixturePaths(db) ? toStorageRoots(roots) : roots;
}

function readScope(db: DatabaseType, roots: string[]): ScopeClause {
  return scopeClause(storageRoots(db, roots));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function filterClause(db: DatabaseType, input: FilesInput): ScopeClause {
  const conditions: string[] = [];
  const params: string[] = [];
  const query = escapeLike(input.query.trim().toLowerCase());
  if (query) {
    conditions.push(`(lower(filename) LIKE ? ESCAPE '\\' OR lower(path) LIKE ? ESCAPE '\\')`);
    params.push(`%${query}%`, `%${query}%`);
  }
  if (input.dir !== 'All directories') {
    const scope = subtreeClause(storagePath(db, input.dir));
    conditions.push(scope.sql);
    params.push(...scope.params);
  }
  if (input.ext !== 'All types') {
    conditions.push(`extension = ?`);
    params.push(input.ext);
  }
  if (input.selectedDirs.length > 0) {
    const scopes = input.selectedDirs.map((dir) => subtreeClause(storagePath(db, dir)));
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

export function getOverviewStatsSql(roots: string[]): OverviewData {
  const stats = withRead((db) => {
    const scope = readScope(db, roots);
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
    const scope = readScope(db, roots);
    const filter = filterClause(db, input);
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
    const scope = readScope(db, roots);
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
    const scope = readScope(db, roots);
    const rankedBySize = db
      .prepare(`SELECT filename, size FROM entries WHERE ${scope.sql} ORDER BY size DESC, filename ASC`)
      .all(...scope.params) as { filename: string; size: number }[];
    const rankedByCopies = duplicateGroupRows(db, scope)
      .sort((a, b) => b.n - a.n || a.filename.localeCompare(b.filename))
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
    const scope = readScope(db, roots);
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

export function getDuplicateGroupsSql(roots: string[]): DuplicateGroup[] {
  const groups = withRead((db) => {
    const scope = readScope(db, roots);
    const rows = db
      .prepare(
        `WITH scoped AS MATERIALIZED (
          SELECT id, size, directory, extension, filename, birthtime, hash, path
          FROM entries WHERE ${scope.sql}
        ),
        groups AS (
          SELECT hash, filename, COUNT(*) AS n, MIN(id) AS firstId
          FROM scoped
          WHERE hash IS NOT NULL AND hash <> ''
          GROUP BY hash, filename
          HAVING COUNT(*) > 1
        ),
        keys AS (SELECT hash, filename FROM groups),
        members AS (
          SELECT e.id, e.size, e.directory, e.extension, e.filename, e.birthtime, e.hash, e.path
          FROM scoped e JOIN keys k ON e.hash = k.hash AND e.filename = k.filename
        )
        SELECT id, size, directory, extension, filename, birthtime, hash, path
        FROM members
        ORDER BY filename ASC, id ASC`,
      )
      .all(...scope.params) as EntryRow[];
    const byKey = new Map<string, DuplicateGroup>();
    const result: DuplicateGroup[] = [];
    for (const row of rows) {
      const hash = String(row.hash);
      const key = `${hash}:${row.filename}`;
      const entry = toEntry(row);
      const group = byKey.get(key);
      if (group) {
        group.files.push(entry);
        group.count += 1;
        if (!group.directories.includes(entry.directory)) group.directories.push(entry.directory);
        continue;
      }
      const created: DuplicateGroup = {
        key,
        hash,
        name: row.filename,
        count: 1,
        size: row.size,
        redundantSpace: 0,
        extension: row.extension,
        directories: [entry.directory],
        files: [entry],
      };
      byKey.set(key, created);
      result.push(created);
    }
    for (const group of result) group.redundantSpace = (group.count - 1) * group.size;
    result.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
    return result;
  });
  return groups ?? [];
}

export function getDuplicateGroups(roots: string[]): DuplicateGroup[] {
  return getDuplicateGroupsSql(roots);
}

export function countEntriesByDirectory(root: string): number {
  const count = withRead((db) => {
    const scope = subtreeClause(storagePath(db, root));
    return db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE ${scope.sql}`).get(...scope.params) as CountRow;
  });
  return count?.n ?? 0;
}

type DirectoryCountRow = { directory_norm: string; n: number };

export function getPreferencesCounts(directories: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const directory of directories) {
    counts[directory] = 0;
  }
  if (directories.length === 0) return counts;
  const data = withRead((db) => {
    const targets = new Map<string, string>();
    for (const directory of directories) {
      targets.set(directory, normalizeDirectoryPath(storagePath(db, directory)).toLowerCase());
    }
    const rows = db
      .prepare(`SELECT directory_norm, COUNT(*) AS n FROM entries GROUP BY directory_norm`)
      .all() as DirectoryCountRow[];
    return { targets, rows };
  });
  if (!data) return counts;
  for (const row of data.rows) {
    const directory = normalizeDirectoryPath(row.directory_norm).toLowerCase();
    for (const [path, target] of data.targets) {
      if (directory === target || directory.startsWith(`${target}/`)) counts[path] += row.n;
    }
  }
  return counts;
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

export function getKeeperDataSql(paths: string[], roots: string[]): { keepers: KeeperMap; stale: string[] } {
  const keepers: KeeperMap = {};
  if (paths.length === 0) return { keepers, stale: [] };
  const keys = [...new Set(paths.map(normalizeDirectoryPath))];
  const rows = withRead((db) => {
    const scope = readScope(db, roots);
    return db
      .prepare(
        `WITH scoped AS MATERIALIZED (
          SELECT id, hash, filename FROM entries WHERE ${scope.sql}
        ),
        all_counts AS (
          SELECT hash, filename, COUNT(*) AS n
          FROM entries
          WHERE hash IS NOT NULL AND hash <> ''
          GROUP BY hash, filename
        ),
        scoped_counts AS (
          SELECT hash, filename, COUNT(*) AS n
          FROM scoped
          WHERE hash IS NOT NULL AND hash <> ''
          GROUP BY hash, filename
        ),
        lookup(path_key) AS (SELECT value AS path_key FROM json_each(?))
        SELECT
          l.path_key AS pathKey,
          e.id,
          e.hash,
          e.filename,
          (sc.id IS NOT NULL) AS scoped,
          COALESCE(a.n, 0) AS allCount,
          COALESCE(s.n, 0) AS scopedCount
        FROM lookup l
        LEFT JOIN entries e ON lower(replace(e.path, '\\', '/')) = lower(l.path_key)
        LEFT JOIN scoped sc ON sc.id = e.id
        LEFT JOIN all_counts a ON a.hash = e.hash AND a.filename = e.filename
        LEFT JOIN scoped_counts s ON s.hash = e.hash AND s.filename = e.filename
        ORDER BY e.id ASC`,
      )
      .all(...scope.params, JSON.stringify(keys)) as KeeperRow[];
  });
  if (!rows) return { keepers, stale: [] };
  const byKey = new Map<string, KeeperRow>();
  for (const row of rows) {
    if (row.id !== null) byKey.set(row.pathKey, row);
  }
  const stale: string[] = [];
  for (const path of paths) {
    const found = byKey.get(normalizeDirectoryPath(path));
    if (!found || found.id === null || !found.hash || !found.filename) {
      stale.push(path);
      continue;
    }
    const key = `${found.hash}:${found.filename}`;
    if (found.allCount <= 1) {
      stale.push(path);
      continue;
    }
    if (found.scoped === 1 && found.scopedCount > 1) keepers[key] = found.id;
  }
  return { keepers, stale };
}

export function getKeeperData(paths: string[], roots: string[]): { keepers: KeeperMap; stale: string[] } {
  return getKeeperDataSql(paths, roots);
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
