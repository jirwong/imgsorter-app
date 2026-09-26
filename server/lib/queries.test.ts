import { describe, expect, it } from 'vitest';
import { buildFixtureFiles, expectedFixtureStats } from './fixture-plan';
import { getAnalyticsData, getDirectoryTree, getOverviewStats, getShellData, listEntries } from './queries';

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
    expect(shell.roots).toContain('C:/Media/2025');
    expect(shell.extensions).toEqual(['.gif', '.jpg', '.png']);
  });
});
