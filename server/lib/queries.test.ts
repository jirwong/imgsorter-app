import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyFilters } from '../../app/lib/filter-pipeline';
import type { DirectoryStat, FilesInput } from '../../app/lib/types';
import { fixtureDbPath } from './db-path';
import { closeReadConnections } from './db';
import { buildFixtureFiles, expectedFixtureStats } from './fixture-plan';
import { toStoragePath } from './labels';
import {
  clearIndex,
  countEntriesByDirectory,
  getAnalyticsData,
  getAnalyticsDataSql,
  getDirectoryStats,
  getDirectoryStatsSql,
  getDuplicateGroups,
  getDuplicateGroupsSql,
  getEntryPathById,
  getEntryPathsByIds,
  getKeeperData,
  getKeeperDataSql,
  getOverviewStats,
  getOverviewStatsSql,
  getShellData,
  getShellDataSql,
  listEntries,
  listEntriesSql,
} from './queries';

const ROOTS = ['C:/Media', 'D:/Camera Imports'];

type TempEntry = { directory: string; filename: string; hash: string | null; path: string };

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
    insert.run(10, row.directory, '.jpg', row.filename, '2025-01-01T00:00:00Z', row.hash, row.path);
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

  it('counts entries under a root case- and separator-insensitively', () => {
    const trips = countEntriesByDirectory('@fixtures/Media/2025/Trips', ROOTS);
    const media = countEntriesByDirectory('@fixtures/Media/2025', ROOTS);
    expect(media).toBeGreaterThan(trips);
    expect(countEntriesByDirectory('@FIXTURES/media/2025', ROOTS)).toBe(media);
    expect(countEntriesByDirectory('@fixtures/Media/2025/nope', ROOTS)).toBe(0);
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
    expect(countEntriesByDirectory('C:/Media/2025/Library', ['C:/Media/2024'])).toBe(0);
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
      expect(getOverviewStats(ROOTS)).toEqual({
        totalFiles: 0,
        totalSize: 0,
        duplicateGroups: 0,
        redundantSpace: 0,
        uniqueFiles: 0,
        storageMap: [],
        largestFiles: [],
      });
      expect(countEntriesByDirectory('C:/Photos', ROOTS)).toBe(0);
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
