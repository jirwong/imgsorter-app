import { describe, expect, it } from 'vitest';
import { applyFilters } from './filter-pipeline';
import type { Entry } from './types';

const e = (over: Partial<Entry>): Entry => ({
  id: 1,
  size: 100,
  directory: 'C:/Media/2025',
  extension: '.jpg',
  filename: 'photo.jpg',
  birthtime: '2025-01-01T10:24:00Z',
  hash: null,
  path: 'C:/Media/2025/Library/file.jpg',
  ...over,
});

describe('applyFilters', () => {
  const all = [
    e({
      id: 1,
      filename: 'sunset.jpg',
      path: 'C:/Media/2025/Library/a.jpg',
      directory: 'C:/Media/2025',
      extension: '.jpg',
    }),
    e({
      id: 2,
      filename: 'lake.png',
      path: 'C:/Media/2024/Library/b.png',
      directory: 'C:/Media/2024',
      extension: '.png',
    }),
    e({
      id: 3,
      filename: 'trail.jpg',
      path: 'D:/Camera Imports/Library/c.jpg',
      directory: 'D:/Camera Imports',
      extension: '.jpg',
    }),
  ];

  it('matches query against filename or path, case-insensitive', () => {
    expect(applyFilters(all, 'SUNSET', 'All directories', 'All types', [])).toEqual([all[0]]);
    expect(applyFilters(all, 'library/c', 'All directories', 'All types', [])).toEqual([all[2]]);
  });

  it('trims surrounding whitespace on query', () => {
    expect(applyFilters(all, '  sunset  ', 'All directories', 'All types', [])).toEqual([all[0]]);
  });

  it('returns an empty array when nothing matches the query', () => {
    expect(applyFilters(all, 'zzz-nothing-zzz', 'All directories', 'All types', [])).toEqual([]);
  });

  it('filters by exact directory', () => {
    expect(applyFilters(all, '', 'C:/Media/2024', 'All types', [])).toEqual([all[1]]);
  });

  it('filters by exact extension', () => {
    expect(applyFilters(all, '', 'All directories', '.png', [])).toEqual([all[1]]);
  });

  it('applies selectedDirs as OR-prefix scope', () => {
    expect(applyFilters(all, '', 'All directories', 'All types', ['C:/Media'])).toEqual([all[0], all[1]]);
    expect(applyFilters(all, '', 'All directories', 'All types', ['C:/Media/2025/Sub'])).toEqual([]);
  });

  it('matches deeper-nested directories within a selected scope', () => {
    const nested = e({
      id: 4,
      filename: 'nested.jpg',
      path: 'C:/Media/2025/Trips/Summer/nested.jpg',
      directory: 'C:/Media/2025/Trips/Summer',
    });
    expect(applyFilters([all[0], all[1], nested], '', 'All directories', 'All types', ['C:/Media/2025'])).toEqual([
      all[0],
      nested,
    ]);
  });

  it('returns all when every filter is at default', () => {
    expect(applyFilters(all, '', 'All directories', 'All types', [])).toEqual(all);
  });
});
