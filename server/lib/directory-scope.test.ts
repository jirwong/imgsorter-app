import { describe, expect, it } from 'vitest';
import { isWithinRoots, scopeEntries } from './directory-scope';

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

describe('scopeEntries', () => {
  it('keeps only rows within the roots', () => {
    const rows = [
      { directory: 'C:/Media/2025', name: 'a' },
      { directory: 'D:/Camera Imports', name: 'b' },
    ];
    expect(scopeEntries(rows, ['C:/Media'])).toEqual([{ directory: 'C:/Media/2025', name: 'a' }]);
  });
});
