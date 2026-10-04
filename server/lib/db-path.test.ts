import { describe, expect, it } from 'vitest';
import { appConfigDbPath, fixtureDbPath, fixturesDir, sampleDbPath, thumbCacheDir, virtualToReal } from './db-path';

function normalize(value: string): string {
  return value.replace(/\\/g, '/');
}

describe('db-path', () => {
  it('derives the sample db path under server/data', () => {
    expect(normalize(sampleDbPath())).toMatch(/\/server\/data\/imgsorter\.db$/);
  });

  it('derives the app config db path under server/data', () => {
    expect(normalize(appConfigDbPath())).toMatch(/\/server\/data\/app-config\.db$/);
  });

  it('derives the committed fixture db path under server/data', () => {
    expect(normalize(fixtureDbPath())).toMatch(/\/server\/data\/fixture\.db$/);
  });

  it('derives the fixtures dir under server/.fixtures', () => {
    expect(normalize(fixturesDir())).toMatch(/\/server\/\.fixtures$/);
  });

  it('derives the thumbnail cache dir under server/data', () => {
    expect(normalize(thumbCacheDir())).toMatch(/\/server\/data\/thumb-cache$/);
  });

  it('resolves a virtual fixture path under the fixtures dir', () => {
    expect(normalize(virtualToReal('@fixtures/Media/2025/a.jpg'))).toBe(`${normalize(fixturesDir())}/Media/2025/a.jpg`);
  });

  it('strips leading slashes after the prefix', () => {
    expect(normalize(virtualToReal('@fixtures///Media/a.jpg'))).toBe(`${normalize(fixturesDir())}/Media/a.jpg`);
  });

  it('throws for non-fixture virtual paths', () => {
    expect(() => virtualToReal('C:/Media/a.jpg')).toThrow();
  });
});
