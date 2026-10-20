import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyFilters } from '../../app/lib/filter-pipeline';
import type { DirectoryStat, DuplicatesQuery, FilesInput, FilesQuery } from '../../app/lib/types';
import { fixtureDbPath } from './db-path';
import { closeReadConnections } from './db';
import { buildFixtureFiles, expectedFixtureStats } from './fixture-plan';
import { toStoragePath } from './labels';
import {
  clearIndex,
  countEntriesByDirectory,
  getAnalyticsData,
  getAnalyticsDataSql,
  getAnalyticsPage,
  getDirectoryStats,
  getDirectoryStatsSql,
  getDuplicateGroups,
  getDuplicateGroupsPage,
  getDuplicateGroupsSql,
  getDuplicateStats,
  getEntryPathById,
  getEntryPathsByIds,
  getKeeperData,
  getKeeperDataSql,
  getOverviewStats,
  getOverviewStatsSql,
  getPreferencesCounts,
  getShellData,
  getShellDataSql,
  listEntries,
  listEntriesSql,
  listFilesPage,
} from './queries';

const ROOTS = ['C:/Media', 'D:/Camera Imports'];

const EMPTY_QUERY: FilesQuery = {
  query: '',
  selectedDirs: [],
  lockedDirs: [],
  extensions: [],
  sizeFilter: 'all',
  hiddenMode: 'active',
  page: 1,
  pageSize: 10,
  sortKey: 'location',
  direction: 'asc',
};

const EMPTY_DUP_QUERY: DuplicatesQuery = {
  query: '',
  selectedDirs: [],
  extensions: [],
  sizeFilter: 'all',
  countFilter: 'all',
  keeperFilter: 'all',
  hiddenMode: 'active',
  page: 1,
  pageSize: 10,
  sortKey: 'count',
  direction: 'desc',
};

type TempEntry = {
  directory: string;
  filename: string;
  hash: string | null;
  path: string;
  size?: number;
  extension?: string;
};

function runWithTempEntries(rows: TempEntry[], run: () => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'imgsorter-keeper-'));
  const path = join(dir, 'keeper.db');
  const db = new Database(path);
  db.exec(`
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      size INTEGER,
      directory TEXT,
      extension TEXT,
      filename TEXT,
      birthtime TEXT,
      hash TEXT,
      path TEXT,
      UNIQUE(path)
    );
  `);
  const insert = db.prepare(
    `INSERT INTO entries (size, directory, extension, filename, birthtime, hash, path) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    insert.run(
      row.size ?? 10,
      row.directory,
      row.extension ?? '.jpg',
      row.filename,
      '2025-01-01T00:00:00Z',
      row.hash,
      row.path,
    );
  }
  db.close();
  const previous = process.env.IMGSORTER_DB_PATH;
  process.env.IMGSORTER_DB_PATH = path;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.IMGSORTER_DB_PATH;
    else process.env.IMGSORTER_DB_PATH = previous;
    closeReadConnections();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('queries against the committed sample db', () => {
  const expected = expectedFixtureStats(buildFixtureFiles());

  it('matches the fixture plan totals', () => {
    const stats = getOverviewStats(ROOTS);
    expect(stats.totalFiles).toBe(expected.totalFiles);
    expect(stats.totalSize).toBe(expected.totalSize);
    expect(stats.duplicateGroups).toBe(expected.duplicateGroups);
    expect(stats.redundantSpace).toBe(expected.redundantSpace);
    expect(stats.uniqueFiles).toBe(expected.uniqueFiles);
  });

  it('returns a three-root storage map', () => {
    const stats = getOverviewStats(ROOTS);
    expect(stats.storageMap).toHaveLength(3);
    const sum = stats.storageMap.reduce((total, row) => total + row.share, 0);
    expect(sum).toBeGreaterThanOrEqual(98);
    expect(sum).toBeLessThanOrEqual(102);
  });

  it('returns 4 largest files sorted by size desc', () => {
    const stats = getOverviewStats(ROOTS);
    expect(stats.largestFiles).toHaveLength(4);
    const sizes = stats.largestFiles.map((e) => e.size);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });

  it('maps display paths', () => {
    const [file] = getOverviewStats(ROOTS).largestFiles;
    expect(file.directory).toMatch(/^(C:\/Media\/2025|C:\/Media\/2024|D:\/Camera Imports)/);
  });

  it('filters entries with the shared pipeline', () => {
    const all = listEntries({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] }, ROOTS);
    expect(all).toHaveLength(expected.totalFiles);
    const scoped = listEntries(
      {
        query: '',
        dir: 'All directories',
        ext: 'All types',
        selectedDirs: ['C:/Media/2025'],
      },
      ROOTS,
    );
    expect(scoped.every((e) => e.directory.startsWith('C:/Media/2025'))).toBe(true);
  });

  it('filters in SQL and matches the shared pipeline', () => {
    const all = listEntriesSql({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] }, ROOTS);
    expect(all).toHaveLength(expected.totalFiles);
    const scoped = listEntriesSql(
      { query: '', dir: 'All directories', ext: 'All types', selectedDirs: ['C:/Media/2025'] },
      ROOTS,
    );
    expect(scoped.every((e) => e.directory.startsWith('C:/Media/2025'))).toBe(true);
  });

  it('matches the shared filter pipeline across the filter matrix', () => {
    const all = listEntriesSql({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] }, ROOTS);
    const byId = (rows: typeof all) => [...rows].sort((a, b) => a.id - b.id);
    const inputs: FilesInput[] = [
      { query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] },
      { query: 'duplicate', dir: 'All directories', ext: 'All types', selectedDirs: [] },
      { query: '  LIBRARY  ', dir: 'All directories', ext: 'All types', selectedDirs: [] },
      { query: '.gif', dir: 'All directories', ext: 'All types', selectedDirs: [] },
      { query: 'no-such-file', dir: 'All directories', ext: 'All types', selectedDirs: [] },
      { query: '', dir: 'C:/Media', ext: 'All types', selectedDirs: [] },
      { query: '', dir: 'C:/Media/2025', ext: 'All types', selectedDirs: [] },
      { query: '', dir: 'C:/Media/2025/Library', ext: 'All types', selectedDirs: [] },
      { query: '', dir: 'D:/Camera Imports', ext: 'All types', selectedDirs: [] },
      { query: '', dir: 'All directories', ext: '.png', selectedDirs: [] },
      { query: '', dir: 'All directories', ext: '.jpg', selectedDirs: ['C:/Media/2024'] },
      { query: 'duplicate-1', dir: 'C:/Media/2025', ext: '.jpg', selectedDirs: ['C:/Media/2025/Trips'] },
      {
        query: '',
        dir: 'All directories',
        ext: 'All types',
        selectedDirs: ['C:/Media/2024', 'D:/Camera Imports'],
      },
    ];
    for (const input of inputs) {
      const actual = listEntriesSql(input, ROOTS);
      const expectedRows = applyFilters(all, input.query, input.dir, input.ext, input.selectedDirs);
      expect(byId(actual)).toEqual(byId(expectedRows));
    }
  });

  it('matches a path-only query through the lower(path) branch', () => {
    const rows = listEntriesSql({ query: '2025', dir: 'All directories', ext: 'All types', selectedDirs: [] }, ROOTS);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((entry) => entry.path.toLowerCase().includes('2025'))).toBe(true);
    expect(rows.every((entry) => !entry.filename.toLowerCase().includes('2025'))).toBe(true);
  });

  it('returns the first page with an exact total', () => {
    const page = listFilesPage({ ...EMPTY_QUERY, page: 1, pageSize: 10 }, ROOTS, []);
    expect(page.files).toHaveLength(10);
    expect(page.total).toBe(expected.totalFiles);
  });

  it('normalizes an invalid page and page size', () => {
    const page = listFilesPage({ ...EMPTY_QUERY, page: 0, pageSize: 999 as never }, ROOTS, []);
    expect(page.files).toHaveLength(10);
    expect(page.total).toBe(expected.totalFiles);
  });

  it('filters files into each size band on a temp database', () => {
    runWithTempEntries(
      [
        { directory: 'C:/Sizes', filename: 'small.jpg', hash: null, path: 'C:/Sizes/small.jpg', size: 9_000_000 },
        {
          directory: 'C:/Sizes',
          filename: 'middle.jpg',
          hash: null,
          path: 'C:/Sizes/middle.jpg',
          size: 15_000_000,
        },
        { directory: 'C:/Sizes', filename: 'large.jpg', hash: null, path: 'C:/Sizes/large.jpg', size: 26_000_000 },
      ],
      () => {
        const roots = ['C:/Sizes'];
        const under = listFilesPage({ ...EMPTY_QUERY, sizeFilter: 'under10' }, roots, []);
        expect(under.files.map((file) => file.filename)).toEqual(['small.jpg']);
        expect(under.total).toBe(1);
        const middle = listFilesPage({ ...EMPTY_QUERY, sizeFilter: '10to25' }, roots, []);
        expect(middle.files.map((file) => file.filename)).toEqual(['middle.jpg']);
        expect(middle.total).toBe(1);
        const over = listFilesPage({ ...EMPTY_QUERY, sizeFilter: 'over25' }, roots, []);
        expect(over.files.map((file) => file.filename)).toEqual(['large.jpg']);
        expect(over.total).toBe(1);
      },
    );
  });

  it('falls back for unknown sort keys and size filters', () => {
    const page = listFilesPage(
      { ...EMPTY_QUERY, sortKey: 'constructor' as never, sizeFilter: 'constructor' as never },
      ROOTS,
      [],
    );
    expect(page.files).toHaveLength(10);
    expect(page.total).toBe(expected.totalFiles);
  });

  it('filters hidden paths that use backslashes and mixed case', () => {
    const target = getOverviewStats(ROOTS).largestFiles[0];
    const hidden = [target.path.toUpperCase().replace(/\//g, '\\')];
    const page = listFilesPage({ ...EMPTY_QUERY, hiddenMode: 'active', page: 1, pageSize: 10 }, ROOTS, hidden);
    expect(page.files.some((file) => file.id === target.id)).toBe(false);
    expect(page.total).toBe(expected.totalFiles - 1);
    expect(page.hiddenCount).toBe(1);
    expect(page.directoryCounts.find((row) => row.path === target.directory)?.hidden).toBe(1);
    const onlyHidden = listFilesPage({ ...EMPTY_QUERY, hiddenMode: 'hidden', page: 1, pageSize: 10 }, ROOTS, hidden);
    expect(onlyHidden.files.map((file) => file.id)).toEqual([target.id]);
    expect(onlyHidden.total).toBe(1);
  });

  it('includes hidden rows when the hidden mode is all', () => {
    const target = getOverviewStats(ROOTS).largestFiles[0];
    const hidden = [target.path.toUpperCase().replace(/\//g, '\\')];
    const all = listFilesPage({ ...EMPTY_QUERY, hiddenMode: 'all', page: 1, pageSize: 10 }, ROOTS, hidden);
    expect(all.total).toBe(expected.totalFiles);
    expect(all.hiddenCount).toBe(1);
    const exact = listFilesPage({ ...EMPTY_QUERY, hiddenMode: 'all', query: target.filename }, ROOTS, hidden);
    expect(exact.files.map((file) => file.id)).toEqual([target.id]);
  });

  it('keeps hidden files on a browse page', () => {
    const lockedDirs = ['C:/Media'];
    const visible = listFilesPage({ ...EMPTY_QUERY, lockedDirs, pageSize: 100 }, ROOTS, []);
    const target = visible.files[0];
    expect(target).toBeDefined();
    const hidden = [target.path.toUpperCase().replace(/\//g, '\\')];
    const page = listFilesPage({ ...EMPTY_QUERY, lockedDirs, hiddenMode: 'all', pageSize: 100 }, ROOTS, hidden);
    expect(page.files.some((file) => file.id === target.id)).toBe(true);
    expect(page.hiddenCount).toBe(1);
  });

  it('skips the hidden predicate when the hidden list is empty', () => {
    const active = listFilesPage({ ...EMPTY_QUERY, hiddenMode: 'active' }, ROOTS, []);
    expect(active.total).toBe(expected.totalFiles);
    expect(active.hiddenCount).toBe(0);
    expect(active.directoryCounts.every((row) => row.hidden === 0)).toBe(true);
    const all = listFilesPage({ ...EMPTY_QUERY, hiddenMode: 'all' }, ROOTS, []);
    expect(all.total).toBe(expected.totalFiles);
    expect(all.hiddenCount).toBe(0);
    expect(listFilesPage({ ...EMPTY_QUERY, hiddenMode: 'hidden' }, ROOTS, [])).toEqual({
      files: [],
      total: 0,
      directoryCounts: [],
      extensionCounts: [],
      hiddenCount: 0,
    });
  });

  it('returns a non-overlapping second page', () => {
    const first = listFilesPage({ ...EMPTY_QUERY, page: 1, pageSize: 10 }, ROOTS, []);
    const second = listFilesPage({ ...EMPTY_QUERY, page: 2, pageSize: 10 }, ROOTS, []);
    expect(second.files).toHaveLength(10);
    const firstIds = new Set(first.files.map((file) => file.id));
    expect(second.files.every((file) => !firstIds.has(file.id))).toBe(true);
  });

  it('returns directory and extension counts that match the scope', () => {
    const page = listFilesPage({ ...EMPTY_QUERY, page: 1, pageSize: 10 }, ROOTS, []);
    expect(page.directoryCounts.reduce((n, row) => n + row.count, 0)).toBe(expected.totalFiles);
    expect(page.extensionCounts.reduce((n, row) => n + row.count, 0)).toBe(expected.totalFiles);
    expect(page.directoryCounts.every((row) => row.path.startsWith('C:/') || row.path.startsWith('D:/'))).toBe(true);
  });

  it('returns an empty page past the end', () => {
    const page = listFilesPage({ ...EMPTY_QUERY, page: 10000, pageSize: 100 }, ROOTS, []);
    expect(page.files).toEqual([]);
    expect(page.total).toBe(expected.totalFiles);
  });

  it('searches filenames and filters extensions', () => {
    const page = listFilesPage({ ...EMPTY_QUERY, query: 'duplicate', extensions: ['.jpg'] }, ROOTS, []);
    expect(page.total).toBeGreaterThan(0);
    expect(page.files.every((file) => file.filename.includes('duplicate') && file.extension === '.jpg')).toBe(true);
    expect(page.extensionCounts.map((row) => row.extension)).toEqual(['.jpg']);
  });

  it('sorts pages through the whitelisted columns', () => {
    const page = listFilesPage({ ...EMPTY_QUERY, sortKey: 'filename', direction: 'desc' }, ROOTS, []);
    const filenames = page.files.map((file) => file.filename);
    expect(filenames).toEqual([...filenames].sort().reverse());
    const bySize = listFilesPage({ ...EMPTY_QUERY, sortKey: 'size', direction: 'desc' }, ROOTS, []);
    const sizes = bySize.files.map((file) => file.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it('narrows the locked tree with the directory picker', () => {
    const treeOnly = listFilesPage({ ...EMPTY_QUERY, lockedDirs: ['C:/Media'], pageSize: 100 }, ROOTS, []);
    expect(treeOnly.files.some((file) => file.directory.startsWith('C:/Media/2024'))).toBe(true);
    const narrowed = listFilesPage(
      { ...EMPTY_QUERY, selectedDirs: ['C:/Media/2025'], lockedDirs: ['C:/Media'], pageSize: 100 },
      ROOTS,
      [],
    );
    expect(narrowed.total).toBeGreaterThan(0);
    expect(narrowed.total).toBeLessThan(treeOnly.total);
    expect(narrowed.files.every((file) => file.directory.startsWith('C:/Media/2025'))).toBe(true);
  });

  it('scopes the directory picker counts to the locked tree', () => {
    const tree = listFilesPage({ ...EMPTY_QUERY, lockedDirs: ['C:/Media/2025'], pageSize: 10 }, ROOTS, []);
    const page = listFilesPage(
      { ...EMPTY_QUERY, selectedDirs: ['C:/Media/2025/Trips'], lockedDirs: ['C:/Media/2025'], pageSize: 10 },
      ROOTS,
      [],
    );
    expect(page.total).toBeGreaterThan(0);
    expect(page.files.every((file) => file.directory.startsWith('C:/Media/2025/Trips'))).toBe(true);
    expect(page.directoryCounts.every((row) => row.path.startsWith('C:/Media/2025'))).toBe(true);
    expect(page.directoryCounts.reduce((n, row) => n + row.count, 0)).toBe(tree.total);
    expect(page.extensionCounts.reduce((n, row) => n + row.count, 0)).toBe(page.total);
  });

  it('keeps picker counts when a directory filter hides the page', () => {
    const page = listFilesPage({ ...EMPTY_QUERY, selectedDirs: ['C:/Media/2025'], page: 1, pageSize: 10 }, ROOTS, []);
    expect(page.files.every((file) => file.directory.startsWith('C:/Media/2025'))).toBe(true);
    expect(page.total).toBeGreaterThan(0);
    expect(page.total).toBeLessThan(expected.totalFiles);
    expect(page.directoryCounts.reduce((n, row) => n + row.count, 0)).toBe(expected.totalFiles);
    expect(page.extensionCounts.reduce((n, row) => n + row.count, 0)).toBe(page.total);
  });

  it('orders listings by directory then filename', () => {
    const rows = listEntriesSql({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] }, ROOTS);
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      const previousDir = toStoragePath(previous.directory);
      const currentDir = toStoragePath(current.directory);
      expect(previousDir < currentDir || (previousDir === currentDir && previous.filename <= current.filename)).toBe(
        true,
      );
    }
  });

  it('treats LIKE metacharacters literally in a query', () => {
    const dir = mkdtempSync(join(tmpdir(), 'imgsorter-like-'));
    const path = join(dir, 'like.db');
    const db = new Database(path);
    db.exec(`
      CREATE TABLE entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        size INTEGER,
        directory TEXT,
        extension TEXT,
        filename TEXT,
        birthtime TEXT,
        hash TEXT,
        path TEXT,
        UNIQUE(path)
      );
    `);
    const insert = db.prepare(
      `INSERT INTO entries (size, directory, extension, filename, birthtime, hash, path) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const filename of ['IMG21.jpg', 'IMG_1.jpg', '100%.jpg']) {
      insert.run(10, 'C:/Custom', '.jpg', filename, '2025-01-01T00:00:00Z', null, `C:/Custom/${filename}`);
    }
    db.close();
    const previous = process.env.IMGSORTER_DB_PATH;
    process.env.IMGSORTER_DB_PATH = path;
    try {
      const input = (query: string): FilesInput => ({
        query,
        dir: 'All directories',
        ext: 'All types',
        selectedDirs: [],
      });
      expect(listEntriesSql(input('IMG_1'), ['C:/Custom']).map((entry) => entry.filename)).toEqual(['IMG_1.jpg']);
      expect(listEntriesSql(input('%'), ['C:/Custom']).map((entry) => entry.filename)).toEqual(['100%.jpg']);
    } finally {
      if (previous === undefined) delete process.env.IMGSORTER_DB_PATH;
      else process.env.IMGSORTER_DB_PATH = previous;
      closeReadConnections();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns one stat row per directory with counts and sizes', () => {
    const stats = getDirectoryStats(ROOTS);
    expect(stats.length).toBeGreaterThanOrEqual(2);
    const media = stats.find((row) => row.path === 'C:/Media/2025/Library');
    expect(media?.fileCount).toBeGreaterThan(0);
    expect(media?.size).toBeGreaterThan(0);
  });

  it('groups directory stats in SQL', () => {
    const stats = getDirectoryStatsSql(ROOTS);
    expect(stats.find((row) => row.path === 'C:/Media/2025/Library')?.fileCount).toBeGreaterThan(0);
  });

  it('matches the shared directory totals', () => {
    const all = listEntriesSql({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] }, ROOTS);
    const expectedStats = new Map<string, DirectoryStat>();
    for (const entry of all) {
      const row = expectedStats.get(entry.directory) ?? { path: entry.directory, fileCount: 0, size: 0 };
      row.fileCount += 1;
      row.size += entry.size;
      expectedStats.set(entry.directory, row);
    }
    const stats = getDirectoryStatsSql(ROOTS);
    expect(stats).toHaveLength(expectedStats.size);
    for (const row of stats) {
      expect(row).toEqual(expectedStats.get(row.path));
    }
  });

  it('delegates listEntries and getDirectoryStats to the SQL reads', () => {
    const input: FilesInput = { query: 'duplicate', dir: 'All directories', ext: '.jpg', selectedDirs: [] };
    expect(listEntries(input, ROOTS)).toEqual(listEntriesSql(input, ROOTS));
    expect(getDirectoryStats(ROOTS)).toEqual(getDirectoryStatsSql(ROOTS));
  });

  it('returns analytics rankings', () => {
    const data = getAnalyticsData(ROOTS);
    expect(data.rankedBySize.length).toBe(expected.totalFiles);
    expect(data.rankedByCopies.length).toBe(expected.duplicateGroups);
  });

  it('returns full analytics rankings from SQL', () => {
    const data = getAnalyticsDataSql(ROOTS);
    expect(data.rankedBySize.length).toBe(expected.totalFiles);
    expect(data.rankedByCopies.length).toBe(expected.duplicateGroups);
    const sizes = data.rankedBySize.map((row) => row.size);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    for (let index = 1; index < data.rankedBySize.length; index += 1) {
      const previous = data.rankedBySize[index - 1];
      const current = data.rankedBySize[index];
      if (previous.size !== current.size) continue;
      expect(previous.filename <= current.filename).toBe(true);
    }
    const counts = data.rankedByCopies.map((row) => row.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    for (let index = 1; index < data.rankedByCopies.length; index += 1) {
      const previous = data.rankedByCopies[index - 1];
      const current = data.rankedByCopies[index];
      if (previous.count !== current.count) continue;
      expect(previous.name <= current.name).toBe(true);
    }
    expect(data).toEqual(getAnalyticsData(ROOTS));
  });

  it('returns one page of each ranking with exact totals', () => {
    const result = getAnalyticsPage({ sizePage: 1, sizePageSize: 10, copiesPage: 1, copiesPageSize: 10 }, ROOTS);
    expect(result.rankedBySize).toHaveLength(10);
    expect(result.totalFiles).toBe(expected.totalFiles);
    expect(result.rankedByCopies).toHaveLength(10);
    expect(result.totalCopies).toBe(expected.duplicateGroups);
  });

  it('continues both analytics rankings on page two', () => {
    const full = getAnalyticsDataSql(ROOTS);
    const result = getAnalyticsPage({ sizePage: 2, sizePageSize: 10, copiesPage: 2, copiesPageSize: 10 }, ROOTS);
    expect(result.rankedBySize).toEqual(full.rankedBySize.slice(10, 20));
    expect(result.rankedByCopies).toEqual(full.rankedByCopies.slice(10, 20));
    expect(result.totalFiles).toBe(full.rankedBySize.length);
    expect(result.totalCopies).toBe(full.rankedByCopies.length);
  });

  it('normalizes invalid analytics pages and page sizes', () => {
    const full = getAnalyticsDataSql(ROOTS);
    const result = getAnalyticsPage(
      { sizePage: 0, sizePageSize: 999 as never, copiesPage: -3, copiesPageSize: 7 as never },
      ROOTS,
    );
    expect(result.rankedBySize).toEqual(full.rankedBySize.slice(0, 10));
    expect(result.rankedByCopies).toEqual(full.rankedByCopies.slice(0, 10));
    expect(result.totalFiles).toBe(full.rankedBySize.length);
    expect(result.totalCopies).toBe(full.rankedByCopies.length);
  });

  it('returns an empty analytics page past the end', () => {
    const result = getAnalyticsPage(
      { sizePage: 10_000, sizePageSize: 50, copiesPage: 10_000, copiesPageSize: 50 },
      ROOTS,
    );
    expect(result.rankedBySize).toEqual([]);
    expect(result.totalFiles).toBe(expected.totalFiles);
    expect(result.rankedByCopies).toEqual([]);
    expect(result.totalCopies).toBe(expected.duplicateGroups);
  });

  it('pages the copies ranking in SQL with exact totals', () => {
    const full = getAnalyticsDataSql(ROOTS).rankedByCopies;
    const first = getAnalyticsPage({ sizePage: 1, sizePageSize: 10, copiesPage: 1, copiesPageSize: 10 }, ROOTS);
    const second = getAnalyticsPage({ sizePage: 1, sizePageSize: 10, copiesPage: 2, copiesPageSize: 10 }, ROOTS);
    const third = getAnalyticsPage({ sizePage: 1, sizePageSize: 10, copiesPage: 3, copiesPageSize: 10 }, ROOTS);
    expect(full).toHaveLength(expected.duplicateGroups);
    expect(first.rankedByCopies).toEqual(full.slice(0, 10));
    expect(second.rankedByCopies).toEqual(full.slice(10, 20));
    expect(third.rankedByCopies).toEqual(full.slice(20, 30));
    expect(second.rankedByCopies[0]).toEqual({ name: 'duplicate-12.jpg', count: 3 });
    expect(first.totalCopies).toBe(expected.duplicateGroups);
    expect(second.totalCopies).toBe(expected.duplicateGroups);
    expect(third.totalCopies).toBe(expected.duplicateGroups);
    const names = [...first.rankedByCopies, ...second.rankedByCopies, ...third.rankedByCopies].map((row) => row.name);
    expect(new Set(names).size).toBe(names.length);
    const counts = full.map((row) => row.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('clamps a huge page value on files, duplicates and analytics', () => {
    const files = listFilesPage({ ...EMPTY_QUERY, page: 1e20 }, ROOTS, []);
    expect(files.files).toEqual([]);
    expect(files.total).toBe(expected.totalFiles);
    const duplicates = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, page: 1e20 }, ROOTS, [], []);
    expect(duplicates.groups).toEqual([]);
    expect(duplicates.totalGroups).toBe(expected.duplicateGroups);
    const analytics = getAnalyticsPage(
      { sizePage: 1e20, sizePageSize: 10, copiesPage: 1e20, copiesPageSize: 10 },
      ROOTS,
    );
    expect(analytics.rankedBySize).toEqual([]);
    expect(analytics.totalFiles).toBe(expected.totalFiles);
    expect(analytics.rankedByCopies).toEqual([]);
    expect(analytics.totalCopies).toBe(expected.duplicateGroups);
  });

  it('returns shell totals', () => {
    const shell = getShellData(ROOTS);
    expect(shell.files).toBe(expected.totalFiles);
    expect(shell.size).toBe(expected.totalSize);
    expect(shell.duplicateGroups).toBe(expected.duplicateGroups);
  });

  it('computes shell totals in SQL and matches the fixture plan', () => {
    expect(getShellDataSql(ROOTS)).toEqual({
      files: expected.totalFiles,
      size: expected.totalSize,
      duplicateGroups: expected.duplicateGroups,
    });
  });

  it('computes overview totals in SQL and matches the fixture plan', () => {
    const stats = getOverviewStatsSql(ROOTS);
    expect(stats.totalFiles).toBe(expected.totalFiles);
    expect(stats.totalSize).toBe(expected.totalSize);
    expect(stats.duplicateGroups).toBe(expected.duplicateGroups);
    expect(stats.redundantSpace).toBe(expected.redundantSpace);
    expect(stats.uniqueFiles).toBe(expected.uniqueFiles);
  });

  it('returns 24 duplicate groups with their member files', () => {
    const groups = getDuplicateGroups(ROOTS);
    expect(groups).toHaveLength(expected.duplicateGroups);
    expect(groups.filter((g) => g.count === 2)).toHaveLength(8);
    expect(groups.filter((g) => g.count === 3)).toHaveLength(8);
    expect(groups.filter((g) => g.count === 4)).toHaveLength(8);
    for (const group of groups) {
      expect(group.files).toHaveLength(group.count);
      expect(group.files.every((f) => f.hash === group.hash && f.filename === group.name)).toBe(true);
      expect(group.files.every((f) => f.directory.startsWith('C:/') || f.directory.startsWith('D:/'))).toBe(true);
      expect(group.directories.every((d) => d.startsWith('C:/') || d.startsWith('D:/'))).toBe(true);
      expect(group.size).toBe(6_400);
      expect(group.redundantSpace).toBe((group.count - 1) * group.size);
    }
    const totalRedundant = groups.reduce((sum, g) => sum + g.redundantSpace, 0);
    expect(totalRedundant).toBe(expected.redundantSpace);
  });

  it('counts duplicate groups and redundant files from the read layer', () => {
    const stats = getDuplicateStats(ROOTS);
    expect(stats.duplicateGroups).toBe(24);
    expect(stats.duplicateFiles).toBeGreaterThan(0);
  });

  it('matches the old JS grouping exactly', () => {
    const groups = getDuplicateGroupsSql(ROOTS);
    expect(groups).toHaveLength(expected.duplicateGroups);
    expect(groups.filter((g) => g.count === 2)).toHaveLength(8);
    expect(groups.filter((g) => g.count === 3)).toHaveLength(8);
    expect(groups.filter((g) => g.count === 4)).toHaveLength(8);
    for (const group of groups) {
      expect(group.files).toHaveLength(group.count);
      expect(group.files.every((f) => f.hash === group.hash && f.filename === group.name)).toBe(true);
      expect(group.size).toBe(6_400);
      expect(group.redundantSpace).toBe((group.count - 1) * group.size);
    }
  });

  it('returns one page of duplicate groups and an exact total', () => {
    const all = getDuplicateGroups(ROOTS);
    const totalFiles = all.reduce((sum, group) => sum + group.count, 0);
    const page = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, page: 1, pageSize: 10 }, ROOTS, [], []);
    expect(page.groups).toHaveLength(10);
    expect(page.totalGroups).toBe(expected.duplicateGroups);
    expect(page.totalFiles).toBe(totalFiles);
    expect(page.groups.every((group) => group.files.length === group.count)).toBe(true);
    expect(page.groups.every((group) => group.redundantSpace === (group.count - 1) * group.size)).toBe(true);
    expect(page.keepers).toEqual({});
    expect(page.staleKeepers).toBe(0);
    const second = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, page: 2, pageSize: 10 }, ROOTS, [], []);
    expect(second.groups).toHaveLength(10);
    const firstKeys = new Set(page.groups.map((group) => group.key));
    expect(second.groups.every((group) => !firstKeys.has(group.key))).toBe(true);
  });

  it('filters duplicate groups by count and size', () => {
    const twos = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, countFilter: '2', pageSize: 100 }, ROOTS, [], []);
    expect(twos.totalGroups).toBe(8);
    expect(twos.groups.every((group) => group.count === 2)).toBe(true);
    const threes = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, countFilter: '3+', pageSize: 100 }, ROOTS, [], []);
    expect(threes.totalGroups).toBe(16);
    expect(threes.groups.every((group) => group.count >= 3)).toBe(true);
    const under = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, sizeFilter: 'under10', pageSize: 100 }, ROOTS, [], []);
    expect(under.totalGroups).toBe(expected.duplicateGroups);
    const middle = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, sizeFilter: '10to25', pageSize: 100 }, ROOTS, [], []);
    expect(middle.totalGroups).toBe(0);
    expect(middle.groups).toEqual([]);
    expect(middle.totalFiles).toBe(0);
  });

  it('filters duplicate groups by keeper membership', () => {
    const [group] = getDuplicateGroups(ROOTS);
    const id = group.files[0].id;
    const raw = getEntryPathsByIds([id])[0];
    const keeperPaths = [raw, raw];
    const withKeeper = getDuplicateGroupsPage(
      { ...EMPTY_DUP_QUERY, keeperFilter: 'with', pageSize: 100 },
      ROOTS,
      [],
      keeperPaths,
    );
    expect(withKeeper.totalGroups).toBe(1);
    expect(withKeeper.groups.map((item) => item.key)).toEqual([group.key]);
    expect(withKeeper.keepers[group.key]).toBe(id);
    expect(withKeeper.staleKeepers).toBe(0);
    const without = getDuplicateGroupsPage(
      { ...EMPTY_DUP_QUERY, keeperFilter: 'without', pageSize: 100 },
      ROOTS,
      [],
      keeperPaths,
    );
    expect(without.totalGroups).toBe(expected.duplicateGroups - 1);
    expect(without.groups.some((item) => item.key === group.key)).toBe(false);
  });

  it('filters hidden duplicate members that use backslashes and mixed case', () => {
    const all = getDuplicateGroups(ROOTS);
    const totalFiles = all.reduce((sum, group) => sum + group.count, 0);
    const group = all.find((item) => item.count === 3) as (typeof all)[number];
    const target = group.files[0];
    const hidden = [target.path.toUpperCase().replace(/\//g, '\\')];
    const page = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, pageSize: 100 }, ROOTS, hidden, []);
    const filtered = page.groups.find((item) => item.key === group.key);
    expect(filtered?.count).toBe(group.count);
    expect(filtered?.files.map((file) => file.id)).not.toContain(target.id);
    expect(filtered?.files).toHaveLength(group.count - 1);
    expect(filtered?.redundantSpace).toBe((group.count - 1) * group.size);
    expect(page.totalGroups).toBe(expected.duplicateGroups);
    expect(page.totalFiles).toBe(totalFiles - 1);
    expect(page.hiddenCount).toBe(1);
    const directory = page.directoryCounts.find((row) => row.path === target.directory);
    expect(directory?.hidden).toBe(1);
    expect(directory?.unit).toBe('group');
    const onlyHidden = getDuplicateGroupsPage(
      { ...EMPTY_DUP_QUERY, hiddenMode: 'hidden', pageSize: 100 },
      ROOTS,
      hidden,
      [],
    );
    expect(onlyHidden.totalGroups).toBe(1);
    expect(onlyHidden.totalFiles).toBe(1);
    expect(onlyHidden.groups[0].key).toBe(group.key);
    expect(onlyHidden.groups[0].count).toBe(group.count);
    expect(onlyHidden.groups[0].files.map((file) => file.id)).toEqual([target.id]);
  });

  it('filters duplicate members by directory', () => {
    const all = getDuplicateGroups(ROOTS);
    const group = all.find((item) => item.count === 4) as (typeof all)[number];
    const directory = group.files[group.files.length - 1].directory;
    const expectedGroups = all.filter((item) => item.files.some((file) => file.directory === directory));
    const page = getDuplicateGroupsPage(
      { ...EMPTY_DUP_QUERY, selectedDirs: [directory], pageSize: 100 },
      ROOTS,
      [],
      [],
    );
    expect(expectedGroups.length).toBe(8);
    expect(page.totalGroups).toBe(expectedGroups.length);
    expect(page.groups.every((item) => item.files.every((file) => file.directory === directory))).toBe(true);
    expect(page.groups.every((item) => item.files.length < item.count)).toBe(true);
    expect(page.directoryCounts.reduce((sum, row) => sum + row.count, 0)).toBeGreaterThan(page.totalGroups);
  });

  it('orders duplicate pages with localeCompare and a key tie-break', () => {
    runWithTempEntries(
      [
        { directory: 'C:/Case', filename: 'Apple.jpg', hash: 'upper', path: 'C:/Case/upper-1.jpg' },
        { directory: 'C:/Case', filename: 'Apple.jpg', hash: 'upper', path: 'C:/Case/upper-2.jpg' },
        { directory: 'C:/Case', filename: 'apple.jpg', hash: 'lower', path: 'C:/Case/lower-1.jpg' },
        { directory: 'C:/Case', filename: 'apple.jpg', hash: 'lower', path: 'C:/Case/lower-2.jpg' },
        { directory: 'C:/Case', filename: 'same.jpg', hash: 'b', path: 'C:/Case/same-b1.jpg' },
        { directory: 'C:/Case', filename: 'same.jpg', hash: 'b', path: 'C:/Case/same-b2.jpg' },
        { directory: 'C:/Case', filename: 'same.jpg', hash: 'a', path: 'C:/Case/same-a1.jpg' },
        { directory: 'C:/Case', filename: 'same.jpg', hash: 'a', path: 'C:/Case/same-a2.jpg' },
      ],
      () => {
        const page = getDuplicateGroupsPage(
          { ...EMPTY_DUP_QUERY, pageSize: 10, sortKey: 'name', direction: 'asc' },
          ['C:/Case'],
          [],
          [],
        );
        expect(page.groups.map((group) => group.key)).toEqual([
          'lower:apple.jpg',
          'upper:Apple.jpg',
          'a:same.jpg',
          'b:same.jpg',
        ]);
      },
    );
  });

  it('sorts the full duplicate set before slicing each page', () => {
    const countFirst = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, page: 1, pageSize: 10 }, ROOTS, [], []);
    expect(countFirst.groups.map((group) => group.count)).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 3, 3]);
    const countSecond = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, page: 2, pageSize: 10 }, ROOTS, [], []);
    expect(countSecond.groups.map((group) => group.count)).toEqual([3, 3, 3, 3, 3, 3, 2, 2, 2, 2]);
    const countThird = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, page: 3, pageSize: 10 }, ROOTS, [], []);
    expect(countThird.groups.map((group) => group.count)).toEqual([2, 2, 2, 2]);
    const redundantFirst = getDuplicateGroupsPage(
      { ...EMPTY_DUP_QUERY, page: 1, pageSize: 10, sortKey: 'redundant', direction: 'desc' },
      ROOTS,
      [],
      [],
    );
    expect(redundantFirst.groups.map((group) => group.key)).toEqual(countFirst.groups.map((group) => group.key));
    const names = getDuplicateGroups(ROOTS).map((group) => group.key);
    const nameFirst = getDuplicateGroupsPage(
      { ...EMPTY_DUP_QUERY, page: 1, pageSize: 10, sortKey: 'name', direction: 'asc' },
      ROOTS,
      [],
      [],
    );
    expect(nameFirst.groups.map((group) => group.key)).toEqual(names.slice(0, 10));
    const nameSecond = getDuplicateGroupsPage(
      { ...EMPTY_DUP_QUERY, page: 2, pageSize: 10, sortKey: 'name', direction: 'asc' },
      ROOTS,
      [],
      [],
    );
    expect(nameSecond.groups.map((group) => group.key)).toEqual(names.slice(10, 20));
  });

  it('reports every duplicate extension before paging', () => {
    const rows: TempEntry[] = [];
    for (let index = 1; index <= 11; index += 1) {
      const name = `a-${String(index).padStart(2, '0')}.jpg`;
      const hash = `h${String(index).padStart(2, '0')}`;
      rows.push({ directory: 'C:/Ext', filename: name, hash, path: `C:/Ext/${name}` });
      rows.push({ directory: 'C:/Ext/Sub', filename: name, hash, path: `C:/Ext/Sub/${name}` });
    }
    rows.push({ directory: 'C:/Ext', filename: 'z.png', hash: 'h12', path: 'C:/Ext/z.png', extension: '.png' });
    rows.push({ directory: 'C:/Ext/Sub', filename: 'z.png', hash: 'h12', path: 'C:/Ext/Sub/z.png', extension: '.png' });
    runWithTempEntries(rows, () => {
      const page = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, page: 1, pageSize: 10 }, ['C:/Ext'], [], []);
      expect(page.groups.map((group) => group.name)).not.toContain('z.png');
      expect(page.extensionCounts).toEqual([
        { extension: '.jpg', count: 22 },
        { extension: '.png', count: 2 },
      ]);
    });
  });

  it('normalizes a duplicate page and page size', () => {
    const page = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, page: 0, pageSize: 999 as never }, ROOTS, [], []);
    expect(page.groups).toHaveLength(10);
    expect(page.totalGroups).toBe(expected.duplicateGroups);
  });

  it('keeps the hidden count global when the hidden group is off the page', () => {
    const all = getDuplicateGroups(ROOTS);
    const group = all.find((item) => item.count === 3) as (typeof all)[number];
    const target = group.files[0];
    const hidden = [target.path.toUpperCase().replace(/\//g, '\\')];
    const page = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, page: 10000, pageSize: 100 }, ROOTS, hidden, []);
    expect(page.groups).toEqual([]);
    expect(page.hiddenCount).toBe(1);
    expect(page.directoryCounts.reduce((sum, row) => sum + row.hidden, 0)).toBe(1);
  });

  it('skips the duplicate hidden predicate when the hidden list is empty', () => {
    const active = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, hiddenMode: 'active' }, ROOTS, [], []);
    expect(active.totalGroups).toBe(expected.duplicateGroups);
    expect(active.hiddenCount).toBe(0);
    expect(active.directoryCounts.every((row) => row.hidden === 0)).toBe(true);
    const onlyHidden = getDuplicateGroupsPage(
      { ...EMPTY_DUP_QUERY, hiddenMode: 'hidden', pageSize: 100 },
      ROOTS,
      [],
      [],
    );
    expect(onlyHidden.groups).toEqual([]);
    expect(onlyHidden.totalGroups).toBe(0);
    expect(onlyHidden.totalFiles).toBe(0);
    expect(onlyHidden.hiddenCount).toBe(0);
  });

  it('returns an empty duplicate page past the end', () => {
    const all = getDuplicateGroups(ROOTS);
    const totalFiles = all.reduce((sum, group) => sum + group.count, 0);
    const page = getDuplicateGroupsPage({ ...EMPTY_DUP_QUERY, page: 10000, pageSize: 100 }, ROOTS, [], []);
    expect(page.groups).toEqual([]);
    expect(page.totalGroups).toBe(expected.duplicateGroups);
    expect(page.totalFiles).toBe(totalFiles);
    expect(page.hiddenCount).toBe(0);
  });

  it('counts entries under a root case- and separator-insensitively', () => {
    const trips = countEntriesByDirectory('@fixtures/Media/2025/Trips');
    const media = countEntriesByDirectory('@fixtures/Media/2025');
    expect(media).toBeGreaterThan(trips);
    expect(countEntriesByDirectory('@FIXTURES/media/2025')).toBe(media);
    expect(countEntriesByDirectory('@fixtures/Media/2025/nope')).toBe(0);
  });

  it('counts indexed entries regardless of enabled state', () => {
    const media = countEntriesByDirectory('@fixtures/Media/2025');
    expect(media).toBeGreaterThan(0);
    expect(countEntriesByDirectory('@FIXTURES/media/2025')).toBe(media);
    expect(countEntriesByDirectory('@fixtures/Media/2025/nope')).toBe(0);
  });

  it('folds preferences counts from one directory grouping', () => {
    const counts = getPreferencesCounts(['C:/Media/2025', 'D:/Camera Imports', 'C:/Nope']);
    expect(counts['C:/Media/2025']).toBeGreaterThan(0);
    expect(counts['D:/Camera Imports']).toBeGreaterThan(0);
    expect(counts['C:/Media/2025']).toBe(countEntriesByDirectory('C:/Media/2025'));
    expect(counts['D:/Camera Imports']).toBe(countEntriesByDirectory('D:/Camera Imports'));
    expect(counts['C:/Nope']).toBe(0);
    expect(getPreferencesCounts([])).toEqual({});
  });

  it('reads the raw stored path for an entry id', () => {
    const [entry] = getOverviewStats(ROOTS).largestFiles;
    const path = getEntryPathById(entry.id);
    expect(typeof path).toBe('string');
    expect(path).toContain('@fixtures');
    expect(getEntryPathById(99999999)).toBeNull();
  });

  it('maps entry ids to raw paths and drops unknown ids', () => {
    const [group] = getDuplicateGroups(ROOTS);
    const id = group.files[0].id;
    const paths = getEntryPathsByIds([id, 99999999]);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('@fixtures');
  });

  it('resolves saved keeper paths and reports stale paths', () => {
    const [group] = getDuplicateGroups(ROOTS);
    const id = group.files[0].id;
    const raw = getEntryPathsByIds([id])[0];
    const { keepers, stale } = getKeeperData([raw, '@fixtures/does/not/exist.jpg'], ROOTS);
    expect(keepers[group.key]).toBe(id);
    expect(stale).toEqual(['@fixtures/does/not/exist.jpg']);
  });

  it('returns empty keeper data for empty input', () => {
    expect(getKeeperData([], ROOTS)).toEqual({ keepers: {}, stale: [] });
  });

  it('matches saved keeper paths case- and separator-insensitively', () => {
    const [group] = getDuplicateGroups(ROOTS);
    const id = group.files[0].id;
    const raw = getEntryPathsByIds([id])[0];
    const variant = `${raw.toUpperCase().replace(/\//g, '\\')}\\`;
    const { keepers, stale } = getKeeperData([variant], ROOTS);
    expect(keepers[group.key]).toBe(id);
    expect(stale).toEqual([]);
  });

  it('resolves keepers in SQL with case- and separator-insensitive duplicate input', () => {
    const [group] = getDuplicateGroups(ROOTS);
    const id = group.files[0].id;
    const raw = getEntryPathsByIds([id])[0];
    const variant = `${raw.toUpperCase().replace(/\//g, '\\')}\\`;
    const missing = '@fixtures/does/not/exist.jpg';
    expect(getKeeperDataSql([variant, variant], ROOTS)).toEqual({ keepers: { [group.key]: id }, stale: [] });
    expect(getKeeperDataSql([raw, missing], ROOTS)).toEqual({ keepers: { [group.key]: id }, stale: [missing] });
    expect(getKeeperDataSql([missing, missing], ROOTS)).toEqual({ keepers: {}, stale: [missing, missing] });
    expect(getKeeperDataSql([raw], ['C:/Nope'])).toEqual({ keepers: {}, stale: [] });
    expect(getKeeperDataSql([], ROOTS)).toEqual({ keepers: {}, stale: [] });
    expect(getKeeperDataSql([variant, missing, missing], ROOTS)).toEqual({
      keepers: { [group.key]: id },
      stale: [missing, missing],
    });
  });

  it('matches a keeper path with a non-ASCII segment when the casing is identical', () => {
    runWithTempEntries(
      [
        { directory: 'C:/Users/Ü/Bilder', filename: 'x.jpg', hash: 'abc', path: 'C:/Users/Ü/Bilder/x.jpg' },
        { directory: 'C:/Users/Ü/Archiv', filename: 'x.jpg', hash: 'abc', path: 'C:/Users/Ü/Archiv/x.jpg' },
      ],
      () => {
        expect(getKeeperDataSql(['C:/Users/Ü/Bilder/x.jpg'], ['C:/Users/Ü'])).toEqual({
          keepers: { 'abc:x.jpg': 1 },
          stale: [],
        });
      },
    );
  });

  it('reports a matching keeper without a hash as stale', () => {
    runWithTempEntries([{ directory: 'C:/NoHash', filename: 'x.jpg', hash: null, path: 'C:/NoHash/x.jpg' }], () => {
      expect(getKeeperDataSql(['C:/NoHash/x.jpg'], ['C:/NoHash'])).toEqual({
        keepers: {},
        stale: ['C:/NoHash/x.jpg'],
      });
    });
  });

  it('reads a library whose entries store real display paths', () => {
    runWithTempEntries(
      [
        { directory: 'C:/Media/2025', filename: 'a.jpg', hash: null, path: 'C:/Media/2025/a.jpg' },
        { directory: 'C:/Media/2025/Sub', filename: 'a.jpg', hash: 'dup', path: 'C:/Media/2025/Sub/a.jpg' },
        { directory: 'C:/Media/2025/Sub2', filename: 'a.jpg', hash: 'dup', path: 'C:/Media/2025/Sub2/a.jpg' },
      ],
      () => {
        const roots = ['C:/Media/2025'];
        expect(getShellData(roots)).toEqual({ files: 3, size: 30, duplicateGroups: 1 });
        const all = listEntries({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] }, roots);
        expect(all.map((entry) => entry.path)).toEqual([
          'C:/Media/2025/a.jpg',
          'C:/Media/2025/Sub/a.jpg',
          'C:/Media/2025/Sub2/a.jpg',
        ]);
        const selected = listEntries(
          { query: '', dir: 'C:/Media/2025/Sub', ext: 'All types', selectedDirs: [] },
          roots,
        );
        expect(selected.map((entry) => entry.path)).toEqual(['C:/Media/2025/Sub/a.jpg']);
        expect(getPreferencesCounts(roots)).toEqual({ 'C:/Media/2025': 3 });
      },
    );
  });

  it('orders duplicate groups with localeCompare and the copies ranking with BINARY order', () => {
    runWithTempEntries(
      [
        { directory: 'C:/Case', filename: 'Apple.jpg', hash: 'upper', path: 'C:/Case/upper-1.jpg' },
        { directory: 'C:/Case', filename: 'Apple.jpg', hash: 'upper', path: 'C:/Case/upper-2.jpg' },
        { directory: 'C:/Case', filename: 'apple.jpg', hash: 'lower', path: 'C:/Case/lower-1.jpg' },
        { directory: 'C:/Case', filename: 'apple.jpg', hash: 'lower', path: 'C:/Case/lower-2.jpg' },
      ],
      () => {
        expect('Apple.jpg'.localeCompare('apple.jpg')).toBeGreaterThan(0);
        const roots = ['C:/Case'];
        expect(getDuplicateGroups(roots).map((group) => group.name)).toEqual(['apple.jpg', 'Apple.jpg']);
        expect(getAnalyticsDataSql(roots).rankedByCopies.map((row) => row.name)).toEqual(['Apple.jpg', 'apple.jpg']);
        expect(
          getAnalyticsPage({ sizePage: 1, sizePageSize: 10, copiesPage: 1, copiesPageSize: 10 }, roots).rankedByCopies,
        ).toEqual([
          { name: 'Apple.jpg', count: 2 },
          { name: 'apple.jpg', count: 2 },
        ]);
      },
    );
  });

  it('preserves a keeper whose file is outside the enabled roots', () => {
    const [group] = getDuplicateGroups(ROOTS);
    const id = group.files[0].id;
    const raw = getEntryPathsByIds([id])[0];
    expect(getKeeperData([raw], ['C:/Nope'])).toEqual({ keepers: {}, stale: [] });
    const scoped = getKeeperData([raw], ROOTS);
    expect(scoped.keepers[group.key]).toBe(id);
    expect(scoped.stale).toEqual([]);
  });

  it('excludes directories outside the enabled roots', () => {
    const scoped = getOverviewStats(['C:/Media/2024']);
    const all = getOverviewStats(ROOTS);
    expect(scoped.totalFiles).toBeLessThan(all.totalFiles);
    const dirs = getDirectoryStats(['C:/Media/2024']).map((row) => row.path);
    expect(dirs.every((path) => path.startsWith('C:/Media/2024'))).toBe(true);
    expect(countEntriesByDirectory('C:/Media/2025/Library')).toBeGreaterThan(0);
  });

  it('returns empty results for an empty roots list', () => {
    expect(getOverviewStats([]).totalFiles).toBe(0);
    expect(getDirectoryStats([])).toEqual([]);
    expect(getDirectoryStatsSql([])).toEqual([]);
    expect(listEntriesSql({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] }, [])).toEqual([]);
    expect(getDuplicateGroups([])).toEqual([]);
    expect(getShellData([])).toEqual({ files: 0, size: 0, duplicateGroups: 0 });
  });

  it('returns empty shapes when the db is missing', () => {
    const previous = process.env.IMGSORTER_DB_PATH;
    process.env.IMGSORTER_DB_PATH = join(tmpdir(), 'imgsorter-missing-xyz.db');
    try {
      expect(getShellData(ROOTS)).toEqual({ files: 0, size: 0, duplicateGroups: 0 });
      expect(listEntries({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] }, ROOTS)).toEqual([]);
      expect(getDirectoryStats(ROOTS)).toEqual([]);
      expect(getDuplicateGroups(ROOTS)).toEqual([]);
      expect(getAnalyticsData(ROOTS)).toEqual({ rankedBySize: [], rankedByCopies: [] });
      expect(getAnalyticsDataSql(ROOTS)).toEqual({ rankedBySize: [], rankedByCopies: [] });
      expect(getAnalyticsPage({ sizePage: 1, sizePageSize: 10, copiesPage: 1, copiesPageSize: 10 }, ROOTS)).toEqual({
        rankedBySize: [],
        totalFiles: 0,
        rankedByCopies: [],
        totalCopies: 0,
      });
      expect(getOverviewStats(ROOTS)).toEqual({
        totalFiles: 0,
        totalSize: 0,
        duplicateGroups: 0,
        redundantSpace: 0,
        uniqueFiles: 0,
        storageMap: [],
        largestFiles: [],
      });
      expect(countEntriesByDirectory('C:/Photos')).toBe(0);
      expect(getPreferencesCounts(['C:/Photos'])).toEqual({ 'C:/Photos': 0 });
      expect(listFilesPage(EMPTY_QUERY, ROOTS, [])).toEqual({
        files: [],
        total: 0,
        directoryCounts: [],
        extensionCounts: [],
        hiddenCount: 0,
      });
    } finally {
      if (previous === undefined) {
        delete process.env.IMGSORTER_DB_PATH;
      } else {
        process.env.IMGSORTER_DB_PATH = previous;
      }
    }
  });

  it('clears every entry and record and returns the counts', () => {
    const copy = join(tmpdir(), `imgsorter-clear-${Date.now()}.db`);
    copyFileSync(fixtureDbPath(), copy);
    const previous = process.env.IMGSORTER_DB_PATH;
    process.env.IMGSORTER_DB_PATH = copy;
    try {
      expect(getDirectoryStats(ROOTS).length).toBeGreaterThan(0);
      const result = clearIndex();
      expect(result.entries).toBeGreaterThan(0);
      expect(result.records).toBeGreaterThan(0);
      expect(listEntries({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] }, ROOTS)).toEqual([]);
      expect(getDirectoryStats(ROOTS)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.IMGSORTER_DB_PATH;
      else process.env.IMGSORTER_DB_PATH = previous;
      closeReadConnections();
      rmSync(copy, { force: true });
    }
  });
});
