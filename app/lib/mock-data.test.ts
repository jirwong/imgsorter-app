import { describe, expect, it } from 'vitest';
import { directoryTree, entries, groups, initialLogs, thumbs } from './mock-data';
import type { DirectoryNode, DuplicateGroup, Entry } from './types';

function isEntry(e: Entry): boolean {
  return (
    typeof e.id === 'number' &&
    typeof e.size === 'number' &&
    typeof e.directory === 'string' &&
    typeof e.extension === 'string' &&
    typeof e.filename === 'string' &&
    typeof e.birthtime === 'string' &&
    (e.hash === null || typeof e.hash === 'string') &&
    typeof e.path === 'string'
  );
}

function isDirectoryNode(n: DirectoryNode): boolean {
  return typeof n.label === 'string' && typeof n.path === 'string';
}

function isDuplicateGroup(g: DuplicateGroup): boolean {
  return (
    typeof g.hash === 'string' &&
    typeof g.name === 'string' &&
    typeof g.count === 'number' &&
    typeof g.space === 'string' &&
    Array.isArray(g.files) &&
    g.files.every(isEntry)
  );
}

describe('mock-data', () => {
  it('has 18 valid entries', () => {
    expect(entries).toHaveLength(18);
    expect(entries.every(isEntry)).toBe(true);
  });

  it('entries keep the prototype id sequence', () => {
    expect(entries[0].id).toBe(1);
    expect(entries[17].id).toBe(18);
  });

  it('has 3 valid duplicate groups whose files are entries', () => {
    expect(groups).toHaveLength(3);
    expect(groups.every(isDuplicateGroup)).toBe(true);
    expect(groups[0].files).toEqual(entries.slice(0, 5));
  });

  it('has a valid 3-root directory tree', () => {
    expect(directoryTree).toHaveLength(3);
    expect(directoryTree.every(isDirectoryNode)).toBe(true);
    expect(directoryTree[0].label).toBe('Media (C:)');
  });

  it('has 6 thumbnails and 3 initial logs', () => {
    expect(thumbs).toHaveLength(6);
    expect(initialLogs).toHaveLength(3);
  });
});
