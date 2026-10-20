import '@tanstack/react-start/server-only';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { normalizeDirectoryKey, normalizeDirectoryPath } from '../../app/lib/directory-path';
import type {
  AnalyticsData,
  AnalyticsQuery,
  AnalyticsResult,
  CopyRankRow,
  DirectoryStat,
  DuplicateGroup,
  DuplicatesQuery,
  DuplicatesResult,
  Entry,
  FilesInput,
  FilesQuery,
  FilesResult,
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

const FILE_PAGE_SIZES = [10, 25, 50, 100] as const;

type FilePageSize = (typeof FILE_PAGE_SIZES)[number];

const ANALYTICS_PAGE_SIZES = [5, 10, 25, 50] as const;

type AnalyticsPageSize = (typeof ANALYTICS_PAGE_SIZES)[number];

const FILE_SORT_COLUMNS = new Map<FilesQuery['sortKey'], string>([
  ['filename', 'filename'],
  ['location', 'directory'],
  ['type', 'extension'],
  ['size', 'size'],
]);

const FILE_SIZE_FILTERS = new Map<FilesQuery['sizeFilter'], string>([
  ['all', '1'],
  ['under10', 'size < 10000000'],
  ['10to25', 'size >= 10000000 AND size <= 25000000'],
  ['over25', 'size > 25000000'],
]);

const DUPLICATE_COUNT_FILTERS = new Map<DuplicatesQuery['countFilter'], string>([
  ['all', '1'],
  ['2', 'm.n = 2'],
  ['3+', 'm.n >= 3'],
]);

const DUPLICATE_SIZE_FILTERS = new Map<DuplicatesQuery['sizeFilter'], string>([
  ['all', '1'],
  ['under10', 'm.size < 10000000'],
  ['10to25', 'm.size >= 10000000 AND m.size <= 25000000'],
  ['over25', 'm.size > 25000000'],
]);

const HIDDEN_MATCH_SQL = `lower(replace(path, '\\', '/')) IN (SELECT value FROM json_each(?))`;

function normalizePage(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function normalizePageSize(value: number): FilePageSize {
  return (FILE_PAGE_SIZES as readonly number[]).includes(value) ? (value as FilePageSize) : 10;
}

function normalizeAnalyticsPageSize(value: number): AnalyticsPageSize {
  return (ANALYTICS_PAGE_SIZES as readonly number[]).includes(value) ? (value as AnalyticsPageSize) : 10;
}

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

type FilesDirectoryCountRow = { directory: string; n: number; hidden: number };

type FilesExtensionCountRow = { extension: string; n: number };

export function listFilesPage(input: FilesQuery, roots: string[], hidden: string[]): FilesResult {
  const result = withRead((db) => {
    const scope = readScope(db, roots);
    const hiddenJson = JSON.stringify(hidden.map((path) => normalizeDirectoryKey(storagePath(db, path))));
    const hiddenFilter =
      input.hiddenMode === 'all'
        ? null
        : input.hiddenMode === 'hidden'
          ? HIDDEN_MATCH_SQL
          : `NOT (${HIDDEN_MATCH_SQL})`;

    const where: string[] = [scope.sql];
    const whereParams: (string | number)[] = [...scope.params];

    const search = escapeLike(input.query.trim().toLowerCase());
    if (search) {
      where.push(`(lower(filename) LIKE ? ESCAPE '\\' OR lower(path) LIKE ? ESCAPE '\\')`);
      whereParams.push(`%${search}%`, `%${search}%`);
    }

    const sizeFilter = FILE_SIZE_FILTERS.get(input.sizeFilter) ?? '1';
    if (sizeFilter !== '1') where.push(sizeFilter);

    const directoryFilter: string[] = [];
    const directoryParams: string[] = [];
    if (input.selectedDirs.length > 0) {
      const scopes = input.selectedDirs.map((directory) => subtreeClause(storagePath(db, directory)));
      directoryFilter.push(`(${scopes.map((item) => item.sql).join(' OR ')})`);
      directoryParams.push(...scopes.flatMap((item) => item.params));
    }

    const extensionFilter: string[] = [];
    const extensionParams: string[] = [];
    if (input.extensions.length > 0) {
      extensionFilter.push(`extension IN (${input.extensions.map(() => '?').join(', ')})`);
      extensionParams.push(...input.extensions);
    }

    const filteredWhere = [...where, ...directoryFilter, ...extensionFilter];
    const filteredParams = [...whereParams, ...directoryParams, ...extensionParams];
    const pageWhere = [...filteredWhere];
    const pageParams = [...filteredParams];
    if (hiddenFilter) {
      pageWhere.push(hiddenFilter);
      pageParams.push(hiddenJson);
    }
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const sortColumn = FILE_SORT_COLUMNS.get(input.sortKey) ?? 'directory';
    const direction = input.direction === 'desc' ? 'DESC' : 'ASC';
    const whereSql = pageWhere.join(' AND ');

    const total = db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE ${whereSql}`).get(...pageParams) as CountRow;
    const rows = db
      .prepare(
        `SELECT id, size, directory, extension, filename, birthtime, hash, path
        FROM entries
        WHERE ${whereSql}
        ORDER BY ${sortColumn} ${direction}, filename ASC, directory ASC
        LIMIT ? OFFSET ?`,
      )
      .all(...pageParams, pageSize, (page - 1) * pageSize) as EntryRow[];

    const directoryWhere = [...where, ...extensionFilter];
    const directoryWhereParams = [...whereParams, ...extensionParams];
    const directorySelect: string[] = [];
    const directoryCaseParams: string[] = [];
    if (input.hiddenMode === 'all') {
      directorySelect.push('COUNT(*) AS n');
    } else {
      const visible = input.hiddenMode === 'hidden' ? HIDDEN_MATCH_SQL : `NOT (${HIDDEN_MATCH_SQL})`;
      directorySelect.push(`SUM(CASE WHEN ${visible} THEN 1 ELSE 0 END) AS n`);
      directoryCaseParams.push(hiddenJson);
    }
    directorySelect.push(`SUM(CASE WHEN ${HIDDEN_MATCH_SQL} THEN 1 ELSE 0 END) AS hidden`);
    directoryCaseParams.push(hiddenJson);
    const directoryRows = db
      .prepare(
        `SELECT directory, ${directorySelect.join(', ')}
        FROM entries WHERE ${directoryWhere.join(' AND ')} GROUP BY directory ORDER BY directory`,
      )
      .all(...directoryCaseParams, ...directoryWhereParams) as FilesDirectoryCountRow[];

    const extensionWhere = [...where, ...directoryFilter];
    const extensionWhereParams = [...whereParams, ...directoryParams];
    if (hiddenFilter) {
      extensionWhere.push(hiddenFilter);
      extensionWhereParams.push(hiddenJson);
    }
    const extensionRows = db
      .prepare(
        `SELECT extension, COUNT(*) AS n
        FROM entries WHERE ${extensionWhere.join(' AND ')} GROUP BY extension ORDER BY extension`,
      )
      .all(...extensionWhereParams) as FilesExtensionCountRow[];

    const hiddenCount = db
      .prepare(`SELECT COUNT(*) AS n FROM entries WHERE ${[...filteredWhere, HIDDEN_MATCH_SQL].join(' AND ')}`)
      .get(...filteredParams, hiddenJson) as CountRow;

    return {
      files: rows.map(toEntry),
      total: total.n,
      directoryCounts: directoryRows
        .map((row) => ({ path: mapPathToDisplay(row.directory), count: row.n, hidden: row.hidden }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      extensionCounts: extensionRows.map((row) => ({ extension: row.extension, count: row.n })),
      hiddenCount: hiddenCount.n,
    };
  });
  return result ?? { files: [], total: 0, directoryCounts: [], extensionCounts: [], hiddenCount: 0 };
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

function copyRankRows(db: DatabaseType, scope: ScopeClause): CopyRankRow[] {
  return duplicateGroupRows(db, scope)
    .sort((a, b) => b.n - a.n || a.filename.localeCompare(b.filename))
    .map((row) => ({ name: row.filename, count: row.n }));
}

export function getAnalyticsDataSql(roots: string[]): AnalyticsData {
  const data = withRead((db) => {
    const scope = readScope(db, roots);
    const rankedBySize = db
      .prepare(`SELECT filename, size FROM entries WHERE ${scope.sql} ORDER BY size DESC, filename ASC`)
      .all(...scope.params) as { filename: string; size: number }[];
    return { rankedBySize, rankedByCopies: copyRankRows(db, scope) };
  });
  return data ?? { rankedBySize: [], rankedByCopies: [] };
}

export function getAnalyticsData(roots: string[]): AnalyticsData {
  return getAnalyticsDataSql(roots);
}

export function getAnalyticsPage(input: AnalyticsQuery, roots: string[]): AnalyticsResult {
  const result = withRead((db) => {
    const scope = readScope(db, roots);
    const sizePage = normalizePage(input.sizePage);
    const sizePageSize = normalizeAnalyticsPageSize(input.sizePageSize);
    const copiesPage = normalizePage(input.copiesPage);
    const copiesPageSize = normalizeAnalyticsPageSize(input.copiesPageSize);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE ${scope.sql}`).get(...scope.params) as CountRow;
    const rankedBySize = db
      .prepare(
        `SELECT filename, size FROM entries WHERE ${scope.sql}
        ORDER BY size DESC, filename ASC LIMIT ? OFFSET ?`,
      )
      .all(...scope.params, sizePageSize, (sizePage - 1) * sizePageSize) as { filename: string; size: number }[];
    const copies = copyRankRows(db, scope);
    return {
      rankedBySize,
      totalFiles: total.n,
      rankedByCopies: copies.slice((copiesPage - 1) * copiesPageSize, copiesPage * copiesPageSize),
      totalCopies: copies.length,
    };
  });
  return result ?? { rankedBySize: [], totalFiles: 0, rankedByCopies: [], totalCopies: 0 };
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

type DuplicatePageRow = {
  hash: string;
  filename: string;
  n: number;
  size: number;
  extension: string;
  visible: number;
};

type DuplicateDirectoryRow = { directory: string; n: number; hidden: number };

type DuplicateExtensionRow = { extension: string; n: number };

function duplicateRedundantSpace(row: DuplicatePageRow): number {
  return (row.n - 1) * row.size;
}

function duplicateMemberClause(input: DuplicatesQuery, hiddenJson: string, directoryJson: string): ScopeClause {
  const conditions: string[] = [];
  const params: string[] = [];
  if (input.hiddenMode !== 'all') {
    conditions.push(input.hiddenMode === 'hidden' ? HIDDEN_MATCH_SQL : `NOT (${HIDDEN_MATCH_SQL})`);
    params.push(hiddenJson);
  }
  const query = escapeLike(input.query.trim().toLowerCase());
  if (query) {
    conditions.push(`(lower(e.filename) LIKE ? ESCAPE '\\' OR lower(e.path) LIKE ? ESCAPE '\\')`);
    params.push(`%${query}%`, `%${query}%`);
  }
  if (input.selectedDirs.length > 0) {
    conditions.push(
      `lower(replace(e.directory, '\\', '/')) IN (SELECT lower(replace(value, '\\', '/')) FROM json_each(?))`,
    );
    params.push(directoryJson);
  }
  if (input.extensions.length > 0) {
    conditions.push(`e.extension IN (${input.extensions.map(() => '?').join(', ')})`);
    params.push(...input.extensions);
  }
  return { sql: conditions.length === 0 ? '1' : conditions.join(' AND '), params };
}

const DUPLICATE_SCOPED_SQL = (scopeSql: string) => `scoped AS MATERIALIZED (
  SELECT id, size, directory, extension, filename, birthtime, hash, path
  FROM entries WHERE ${scopeSql}
),
grouped AS (
  SELECT hash, filename, COUNT(*) AS n, MIN(id) AS first_id
  FROM scoped
  WHERE hash IS NOT NULL AND hash <> ''
  GROUP BY hash, filename
  HAVING COUNT(*) > 1
)`;

export function getDuplicateGroupsPage(
  input: DuplicatesQuery,
  roots: string[],
  hidden: string[],
  keeperPaths: string[],
): DuplicatesResult {
  const result = withRead((db) => {
    const scope = readScope(db, roots);
    const hiddenJson = JSON.stringify(hidden.map((path) => normalizeDirectoryKey(storagePath(db, path))));
    const directoryJson = JSON.stringify(
      input.selectedDirs.map((directory) => normalizeDirectoryKey(storagePath(db, directory))),
    );
    const member = duplicateMemberClause(input, hiddenJson, directoryJson);
    const countFilter = DUPLICATE_COUNT_FILTERS.get(input.countFilter) ?? '1';
    const sizeFilter = DUPLICATE_SIZE_FILTERS.get(input.sizeFilter) ?? '1';
    const keeperFilter =
      input.keeperFilter === 'with'
        ? 'EXISTS (SELECT 1 FROM keeper_keys k WHERE k.hash = m.hash AND k.filename = m.filename)'
        : input.keeperFilter === 'without'
          ? 'NOT EXISTS (SELECT 1 FROM keeper_keys k WHERE k.hash = m.hash AND k.filename = m.filename)'
          : '1';
    const keeperCte =
      input.keeperFilter === 'all'
        ? ''
        : `keeper_keys AS (
          SELECT DISTINCT hash, filename FROM scoped
          WHERE lower(replace(path, '\\', '/')) IN (SELECT lower(replace(value, '\\', '/')) FROM json_each(?))
        ),`;
    const keeperParams = keeperCte ? [JSON.stringify(keeperPaths)] : [];

    const rows = db
      .prepare(
        `WITH ${DUPLICATE_SCOPED_SQL(scope.sql)},
        group_meta AS (
          SELECT g.hash, g.filename, g.n, g.first_id, e.size, e.extension
          FROM grouped g JOIN scoped e ON e.id = g.first_id
        ),
        visible AS (
          SELECT e.hash, e.filename, COUNT(*) AS visible
          FROM scoped e JOIN grouped g ON e.hash = g.hash AND e.filename = g.filename
          WHERE ${member.sql}
          GROUP BY e.hash, e.filename
        ),
        ${keeperCte}
        filtered AS (
          SELECT m.hash, m.filename, m.n, m.size, m.extension, v.visible
          FROM group_meta m JOIN visible v ON v.hash = m.hash AND v.filename = m.filename
          WHERE ${countFilter} AND ${sizeFilter} AND ${keeperFilter}
        )
        SELECT hash, filename, n, size, extension, visible FROM filtered`,
      )
      .all(...scope.params, ...member.params, ...keeperParams) as DuplicatePageRow[];

    const ordered: (DuplicatePageRow & { key: string })[] = [];
    for (const row of rows) ordered.push({ ...row, key: `${row.hash}:${row.filename}` });
    const sortKey = input.sortKey === 'name' || input.sortKey === 'redundant' ? input.sortKey : 'count';
    const direction = input.direction === 'asc' ? 1 : -1;
    ordered.sort((a, b) => {
      const result =
        sortKey === 'name'
          ? a.filename.localeCompare(b.filename)
          : sortKey === 'redundant'
            ? duplicateRedundantSpace(a) - duplicateRedundantSpace(b)
            : a.n - b.n;
      if (result !== 0) return result * direction;
      return a.key.localeCompare(b.key);
    });
    const totalGroups = ordered.length;
    const totalFiles = ordered.reduce((sum, row) => sum + row.visible, 0);
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const paged = ordered.slice((page - 1) * pageSize, page * pageSize);

    let members: EntryRow[] = [];
    if (paged.length > 0) {
      members = db
        .prepare(
          `WITH ${DUPLICATE_SCOPED_SQL(scope.sql)},
          keys AS (SELECT value AS key FROM json_each(?))
          SELECT e.id, e.size, e.directory, e.extension, e.filename, e.birthtime, e.hash, e.path
          FROM scoped e JOIN keys k ON (e.hash || ':' || e.filename) = k.key
          WHERE ${member.sql}
          ORDER BY e.filename ASC, e.id ASC`,
        )
        .all(...scope.params, JSON.stringify(paged.map((row) => row.key)), ...member.params) as EntryRow[];
    }

    const groups = paged.map((row) => {
      const group: DuplicateGroup = {
        key: row.key,
        hash: row.hash,
        name: row.filename,
        count: row.n,
        size: row.size,
        redundantSpace: duplicateRedundantSpace(row),
        extension: row.extension,
        directories: [],
        files: [],
      };
      return group;
    });
    const groupByKey = new Map(groups.map((group) => [group.key, group]));
    for (const row of members) {
      const group = groupByKey.get(`${row.hash}:${row.filename}`);
      if (!group) continue;
      const entry = toEntry(row);
      group.files.push(entry);
      if (!group.directories.includes(entry.directory)) group.directories.push(entry.directory);
    }

    const directories = db
      .prepare(
        `WITH ${DUPLICATE_SCOPED_SQL(scope.sql)}
        SELECT e.directory AS directory,
          COUNT(DISTINCT e.hash || ':' || e.filename) AS n,
          SUM(CASE WHEN ${HIDDEN_MATCH_SQL} THEN 1 ELSE 0 END) AS hidden
        FROM scoped e JOIN grouped g ON e.hash = g.hash AND e.filename = g.filename
        GROUP BY e.directory
        ORDER BY e.directory`,
      )
      .all(...scope.params, hiddenJson) as DuplicateDirectoryRow[];

    const extensions = db
      .prepare(
        `WITH ${DUPLICATE_SCOPED_SQL(scope.sql)}
        SELECT e.extension AS extension, COUNT(*) AS n
        FROM scoped e JOIN grouped g ON e.hash = g.hash AND e.filename = g.filename
        GROUP BY e.extension
        ORDER BY e.extension`,
      )
      .all(...scope.params) as DuplicateExtensionRow[];

    return {
      groups,
      totalGroups,
      totalFiles,
      keepers: {} as KeeperMap,
      staleKeepers: 0,
      directoryCounts: directories
        .map((row) => ({
          path: mapPathToDisplay(row.directory),
          count: row.n,
          hidden: row.hidden,
          unit: 'group' as const,
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      extensionCounts: extensions.map((row) => ({ extension: row.extension, count: row.n })),
      hiddenCount: directories.reduce((sum, row) => sum + row.hidden, 0),
    };
  });
  const { keepers, stale } = getKeeperDataSql(keeperPaths, roots);
  if (!result) {
    return {
      groups: [],
      totalGroups: 0,
      totalFiles: 0,
      keepers,
      staleKeepers: stale.length,
      directoryCounts: [],
      extensionCounts: [],
      hiddenCount: 0,
    };
  }
  return { ...result, keepers, staleKeepers: stale.length };
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
