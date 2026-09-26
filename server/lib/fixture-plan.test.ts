import { describe, expect, it } from 'vitest';
import { buildFixtureFiles, expectedFixtureStats, FIXTURE_ROOTS } from './fixture-plan';

describe('fixture-plan', () => {
  it('is deterministic', () => {
    const a = buildFixtureFiles()
      .map((f) => `${f.root}|${f.name}|${f.size}`)
      .join('\n');
    const b = buildFixtureFiles()
      .map((f) => `${f.root}|${f.name}|${f.size}`)
      .join('\n');
    expect(a).toBe(b);
  });

  it('produces the expected shape', () => {
    const files = buildFixtureFiles();
    expect(files.length).toBe(1272);
    const stats = expectedFixtureStats(files);
    expect(stats.uniqueFiles).toBe(1200);
    expect(stats.duplicateGroups).toBe(24);
    expect(stats.redundantSpace).toBe(48 * 640_000);
    expect(new Set(files.map((f) => f.root))).toEqual(new Set(FIXTURE_ROOTS));
  });
});
