import { describe, expect, it } from 'vitest';
import { normalizeDirectoryPath } from './directory-path';

describe('normalizeDirectoryPath', () => {
  it('trims, converts backslashes, and strips trailing slashes', () => {
    expect(normalizeDirectoryPath(' C:\\Media\\2025\\ ')).toBe('C:/Media/2025');
    expect(normalizeDirectoryPath('C:/Media//')).toBe('C:/Media');
  });
});
