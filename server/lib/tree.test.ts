import { describe, expect, it } from 'vitest';
import { buildDirectoryTree } from './tree';

describe('buildDirectoryTree', () => {
  it('builds a nested tree and labels roots', () => {
    const tree = buildDirectoryTree([
      'C:/Media/2025/Trips',
      'C:/Media/2025/Library',
      'C:/Media/2024',
      'D:/Camera Imports',
    ]);
    expect(tree[0]).toMatchObject({ label: 'Media (C:)', path: 'C:/Media' });
    expect(tree[1]).toMatchObject({ label: 'Camera Imports (D:)', path: 'D:/Camera Imports' });
    const media2025 = tree[0].children?.find((n) => n.path === 'C:/Media/2025');
    expect(media2025?.children?.map((n) => n.label)).toEqual(['Library', 'Trips']);
  });
});
