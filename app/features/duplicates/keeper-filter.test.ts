import { describe, expect, it } from 'vitest';
import type { DuplicateGroup } from '../../lib/types';
import { matchesKeeperFilter } from './keeper-filter';

const group = { key: 'h1:dup.jpg' } as DuplicateGroup;

describe('matchesKeeperFilter', () => {
  it('handles the three values', () => {
    expect(matchesKeeperFilter(group, {}, 'All groups')).toBe(true);
    expect(matchesKeeperFilter(group, {}, 'With keeper')).toBe(false);
    expect(matchesKeeperFilter(group, {}, 'Without keeper')).toBe(true);
    expect(matchesKeeperFilter(group, { 'h1:dup.jpg': 1 }, 'With keeper')).toBe(true);
    expect(matchesKeeperFilter(group, { 'h1:dup.jpg': 1 }, 'Without keeper')).toBe(false);
  });
});
