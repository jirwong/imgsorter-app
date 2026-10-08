import { describe, expect, it, vi } from 'vitest';
import { buildDirectoryIndex, getDirectoryIndex } from './directory-index';
import { getDirectoryStats } from './queries';

vi.mock('./app-config', () => ({
  appConfigStore: {
    get: () => ({
      directories: {
        indexed: [{ path: 'C:\\Media', enabled: true }],
        ignored: [],
      },
      directoryMeta: {},
    }),
  },
}));

vi.mock('./queries', () => ({
  getDirectoryStats: vi.fn(() => []),
}));

describe('buildDirectoryIndex', () => {
  it('builds drive-rooted nodes with a C:\\ label', () => {
    const tree = buildDirectoryIndex([], [{ path: 'C:/Media/2025', fileCount: 2, size: 300 }]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ label: 'C:\\', path: 'C:', fileCount: 2, size: 300 });
    expect(tree[0].children[0]).toMatchObject({ label: 'Media', path: 'C:/Media' });
  });

  it('inserts ancestor folders and aggregates subtree totals', () => {
    const tree = buildDirectoryIndex(
      [],
      [
        { path: 'C:/Media/2025/Trips', fileCount: 2, size: 300 },
        { path: 'C:/Media/2025/Library', fileCount: 3, size: 500 },
      ],
    );
    const media2025 = tree[0].children[0].children[0];
    expect(media2025.path).toBe('C:/Media/2025');
    expect(media2025.fileCount).toBe(5);
    expect(media2025.size).toBe(800);
    expect(media2025.children.map((node) => node.label)).toEqual(['Library', 'Trips']);
  });

  it('includes an empty configured root with its last scan', () => {
    const tree = buildDirectoryIndex([{ path: 'C:/Empty', lastScannedAt: '2026-10-04T08:00:00.000Z' }], []);
    const empty = tree[0].children[0];
    expect(empty).toMatchObject({
      path: 'C:/Empty',
      isRoot: true,
      lastScannedAt: '2026-10-04T08:00:00.000Z',
      fileCount: 0,
      size: 0,
    });
  });

  it('marks configured roots and their descendants as in the library', () => {
    const tree = buildDirectoryIndex([{ path: 'C:/Media' }], [{ path: 'C:/Media/2025', fileCount: 1, size: 10 }]);
    const drive = tree[0];
    const media = drive.children[0];
    expect(drive.inLibrary).toBeUndefined();
    expect(media.inLibrary).toBe(true);
    expect(media.children[0].inLibrary).toBe(true);
  });

  it('merges configured roots with file stats at the same path', () => {
    const tree = buildDirectoryIndex(
      [{ path: 'C:/Media', lastScannedAt: '2026-10-04T08:00:00.000Z' }],
      [{ path: 'C:/Media/2025', fileCount: 4, size: 100 }],
    );
    const media = tree[0].children[0];
    expect(media).toMatchObject({ isRoot: true, fileCount: 4, size: 100 });
    expect(media.lastScannedAt).toBe('2026-10-04T08:00:00.000Z');
  });
});

describe('getDirectoryIndex', () => {
  it('scopes the stats to the enabled roots', () => {
    getDirectoryIndex();
    expect(getDirectoryStats).toHaveBeenCalledWith(['C:/Media']);
  });
});
