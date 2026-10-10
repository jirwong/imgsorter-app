import { describe, expect, it } from 'vitest';
import { buildIgnoredSet, isIgnored, normalizePath } from './path-helpers';

describe('normalizePath', () => {
  it('treats backslash and forward-slash paths as equal', () => {
    expect(normalizePath('C:\\Users\\jirwo\\Pictures')).toBe(normalizePath('C:/Users/jirwo/Pictures'));
  });

  it('trims trailing separators and ignores case', () => {
    expect(normalizePath('C:/Media/Old/')).toBe('c:/media/old');
    expect(normalizePath('C:\\Media\\Old\\')).toBe('c:/media/old');
  });
});

describe('isIgnored', () => {
  it('matches an ignored directory regardless of separator style', () => {
    const ignored = buildIgnoredSet(['C:/Users/jirwo/Pictures/Luminar Neo Catalog']);
    expect(isIgnored('C:\\Users\\jirwo\\Pictures\\Luminar Neo Catalog', ignored)).toBe(true);
  });

  it('does not match a sibling directory', () => {
    const ignored = buildIgnoredSet(['C:/Users/jirwo/Pictures/Luminar Neo Catalog']);
    expect(isIgnored('C:\\Users\\jirwo\\Pictures\\Other', ignored)).toBe(false);
  });
});
