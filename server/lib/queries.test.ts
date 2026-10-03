import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFixtureFiles, expectedFixtureStats } from './fixture-plan';
import {
  countEntriesByDirectory,
  getAnalyticsData,
  getDirectoryTree,
  getDuplicateGroups,
  getEntryPathById,
  getOverviewStats,
  getShellData,
  listEntries,
} from './queries';

describe('queries against the committed sample db', () => {
  const expected = expectedFixtureStats(buildFixtureFiles());

  it('matches the fixture plan totals', () => {
    const stats = getOverviewStats();
    expect(stats.totalFiles).toBe(expected.totalFiles);
    expect(stats.totalSize).toBe(expected.totalSize);
    expect(stats.duplicateGroups).toBe(expected.duplicateGroups);
    expect(stats.redundantSpace).toBe(expected.redundantSpace);
    expect(stats.uniqueFiles).toBe(expected.uniqueFiles);
  });

  it('returns a three-root storage map', () => {
    const stats = getOverviewStats();
    expect(stats.storageMap).toHaveLength(3);
    const sum = stats.storageMap.reduce((total, row) => total + row.share, 0);
    expect(sum).toBeGreaterThanOrEqual(98);
    expect(sum).toBeLessThanOrEqual(102);
  });

  it('returns 4 largest files sorted by size desc', () => {
    const stats = getOverviewStats();
    expect(stats.largestFiles).toHaveLength(4);
    const sizes = stats.largestFiles.map((e) => e.size);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });

  it('maps display paths', () => {
    const [file] = getOverviewStats().largestFiles;
    expect(file.directory).toMatch(/^(C:\/Media\/2025|C:\/Media\/2024|D:\/Camera Imports)/);
  });

  it('filters entries with the shared pipeline', () => {
    const all = listEntries({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] });
    expect(all).toHaveLength(expected.totalFiles);
    const scoped = listEntries({
      query: '',
      dir: 'All directories',
      ext: 'All types',
      selectedDirs: ['C:/Media/2025'],
    });
    expect(scoped.every((e) => e.directory.startsWith('C:/Media/2025'))).toBe(true);
  });

  it('builds a directory tree from real directories', () => {
    const tree = getDirectoryTree();
    expect(tree.length).toBeGreaterThanOrEqual(2);
    expect(tree[0].label).toBe('Media (C:)');
  });

  it('returns analytics rankings', () => {
    const data = getAnalyticsData();
    expect(data.rankedBySize.length).toBe(expected.totalFiles);
    expect(data.rankedByCopies.length).toBe(expected.duplicateGroups);
  });

  it('returns shell totals and options', () => {
    const shell = getShellData();
    expect(shell.files).toBe(expected.totalFiles);
    expect(shell.size).toBe(expected.totalSize);
    expect(shell.duplicateGroups).toBe(expected.duplicateGroups);
    expect(shell.roots).toContain('C:/Media/2025');
    expect(shell.extensions).toEqual(['.gif', '.jpg', '.png']);
  });

  it('returns 24 duplicate groups with their member files', () => {
    const groups = getDuplicateGroups();
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
    const trips = countEntriesByDirectory('@fixtures/Media/2025/Trips');
    const media = countEntriesByDirectory('@fixtures/Media/2025');
    expect(media).toBeGreaterThan(trips);
    expect(countEntriesByDirectory('@FIXTURES/media/2025')).toBe(media);
    expect(countEntriesByDirectory('@fixtures/Media/2025/nope')).toBe(0);
  });

  it('reads the raw stored path for an entry id', () => {
    const [entry] = getOverviewStats().largestFiles;
    const path = getEntryPathById(entry.id);
    expect(typeof path).toBe('string');
    expect(path).toContain('@fixtures');
    expect(getEntryPathById(99999999)).toBeNull();
  });

  it('returns empty shapes when the db is missing', () => {
    const previous = process.env.IMGSORTER_DB_PATH;
    process.env.IMGSORTER_DB_PATH = join(tmpdir(), 'imgsorter-missing-xyz.db');
    try {
      expect(getShellData()).toEqual({ files: 0, size: 0, roots: [], extensions: [], duplicateGroups: 0 });
      expect(listEntries({ query: '', dir: 'All directories', ext: 'All types', selectedDirs: [] })).toEqual([]);
      expect(getDirectoryTree()).toEqual([]);
      expect(getDuplicateGroups()).toEqual([]);
      expect(getAnalyticsData()).toEqual({ rankedBySize: [], rankedByCopies: [] });
      expect(getOverviewStats()).toEqual({
        totalFiles: 0,
        totalSize: 0,
        duplicateGroups: 0,
        redundantSpace: 0,
        uniqueFiles: 0,
        storageMap: [],
        largestFiles: [],
      });
      expect(countEntriesByDirectory('C:/Photos')).toBe(0);
    } finally {
      if (previous === undefined) {
        delete process.env.IMGSORTER_DB_PATH;
      } else {
        process.env.IMGSORTER_DB_PATH = previous;
      }
    }
  });
});
