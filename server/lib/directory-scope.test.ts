import { describe, expect, it, vi } from 'vitest';
import { enabledRoots, isWithinRoots } from './directory-scope';

vi.mock('./app-config', () => ({
  appConfigStore: {
    get: () => ({
      directories: {
        indexed: [
          { path: 'C:\\Media', enabled: true },
          { path: 'D:\\Other', enabled: false },
        ],
        ignored: [],
      },
      directoryMeta: {},
    }),
  },
}));

describe('enabledRoots', () => {
  it('returns the normalized paths of enabled directories only', () => {
    expect(enabledRoots()).toEqual(['C:/Media']);
  });
});

describe('isWithinRoots', () => {
  it('matches a root and its subtree, case- and separator-insensitively', () => {
    const roots = ['C:/Media'];
    expect(isWithinRoots('C:/Media', roots)).toBe(true);
    expect(isWithinRoots('C:\\Media\\2025', roots)).toBe(true);
    expect(isWithinRoots('c:/media/2025/a.jpg', roots)).toBe(true);
    expect(isWithinRoots('C:/Other', roots)).toBe(false);
    expect(isWithinRoots('C:/Media2', roots)).toBe(false);
  });

  it('returns false for an empty roots list', () => {
    expect(isWithinRoots('C:/Media', [])).toBe(false);
  });
});
