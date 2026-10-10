import { describe, expect, it } from 'vitest';
import { normalizeDirectoryKey, normalizeDirectoryPath } from './directory-path';

describe('normalizeDirectoryPath', () => {
  it('trims, converts backslashes, and strips trailing slashes', () => {
    expect(normalizeDirectoryPath(' C:\\Media\\2025\\ ')).toBe('C:/Media/2025');
    expect(normalizeDirectoryPath('C:/Media//')).toBe('C:/Media');
  });
});

describe('normalizeDirectoryKey', () => {
  it('lowercases the normalized path', () => {
    expect(normalizeDirectoryKey(' C:\\Media\\2025\\ ')).toBe('c:/media/2025');
    expect(normalizeDirectoryKey('c:/media/2025')).toBe('c:/media/2025');
  });
});
