import { copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureDbPath } from './db-path';
import { buildFixtureFiles, expectedFixtureStats } from './fixture-plan';
import {
  clearIndex,
  countEntriesByDirectory,
  getAnalyticsData,
  getDirectoryStats,
  getDuplicateGroups,
  getEntryPathById,
  getEntryPathsByIds,
  getKeeperData,
  getOverviewStats,
  getShellData,
  listEntries,
} from './queries';

const ROOTS = ['C:/Media', 'D:/Camera Imports'];

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

  it('returns one stat row per directory with counts and sizes', () => {
    const stats = getDirectoryStats(ROOTS);
    expect(stats.length).toBeGreaterThanOrEqual(2);
    const media = stats.find((row) => row.path === 'C:/Media/2025/Library');
    expect(media?.fileCount).toBeGreaterThan(0);
    expect(media?.size).toBeGreaterThan(0);
  });

  it('returns analytics rankings', () => {
    const data = getAnalyticsData(ROOTS);
    expect(data.rankedBySize.length).toBe(expected.totalFiles);
    expect(data.rankedByCopies.length).toBe(expected.duplicateGroups);
  });

  it('returns shell totals and options', () => {
    const shell = getShellData(ROOTS);
    expect(shell.files).toBe(expected.totalFiles);
    expect(shell.size).toBe(expected.totalSize);
    expect(shell.duplicateGroups).toBe(expected.duplicateGroups);
    expect(shell.roots).toContain('C:/Media/2025');
    expect(shell.extensions).toEqual(['.gif', '.jpg', '.png']);
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
    expect(getDuplicateGroups([])).toEqual([]);
    expect(getShellData([])).toEqual({ files: 0, size: 0, roots: [], extensions: [], duplicateGroups: 0 });
  });

  it('returns empty shapes when the db is missing', () => {
    const previous = process.env.IMGSORTER_DB_PATH;
    process.env.IMGSORTER_DB_PATH = join(tmpdir(), 'imgsorter-missing-xyz.db');
    try {
      expect(getShellData(ROOTS)).toEqual({ files: 0, size: 0, roots: [], extensions: [], duplicateGroups: 0 });
      expect(listEntries({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] }, ROOTS)).toEqual([]);
      expect(getDirectoryStats(ROOTS)).toEqual([]);
      expect(getDuplicateGroups(ROOTS)).toEqual([]);
      expect(getAnalyticsData(ROOTS)).toEqual({ rankedBySize: [], rankedByCopies: [] });
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
      rmSync(copy, { force: true });
    }
  });
});
