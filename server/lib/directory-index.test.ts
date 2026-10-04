import { describe, expect, it } from 'vitest';
import { buildDirectoryIndex } from './directory-index';

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
