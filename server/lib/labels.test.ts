import { describe, expect, it } from 'vitest';
import { mapPathToDisplay, rootLabelOf, toStoragePath, toStorageRoots } from './labels';

describe('labels', () => {
  it('maps fixture paths to clean labels', () => {
    expect(mapPathToDisplay('@fixtures/Media/2025/Trips/a.jpg')).toBe('C:/Media/2025/Trips/a.jpg');
    expect(mapPathToDisplay('@fixtures/Media/2024/archive-1.png')).toBe('C:/Media/2024/archive-1.png');
    expect(mapPathToDisplay('@fixtures/Camera Imports/import-1.jpg')).toBe('D:/Camera Imports/import-1.jpg');
  });

  it('maps backslash paths', () => {
    expect(mapPathToDisplay('@fixtures\\Media\\2025\\a.jpg')).toBe('C:/Media/2025/a.jpg');
  });

  it('leaves unknown paths unchanged', () => {
    expect(mapPathToDisplay('Z:/Archive/x.jpg')).toBe('Z:/Archive/x.jpg');
  });

  it('resolves root labels', () => {
    expect(rootLabelOf('C:/Media/2025/Trips')).toBe('C:/Media/2025');
    expect(rootLabelOf('D:/Camera Imports/x')).toBe('D:/Camera Imports');
  });

  it('maps display paths back to stored paths', () => {
    expect(toStoragePath('C:/Media/2025/Trips/a.jpg')).toBe('@fixtures/Media/2025/Trips/a.jpg');
    expect(toStoragePath('d:\\camera imports\\x.jpg')).toBe('@fixtures/Camera Imports/x.jpg');
    expect(toStoragePath('Z:/Archive/x.jpg')).toBe('Z:/Archive/x.jpg');
  });

  it('maps a root-level display path with no remainder', () => {
    expect(toStoragePath('C:/Media/2025')).toBe('@fixtures/Media/2025');
  });

  it('maps display roots to stored roots', () => {
    expect(toStorageRoots(['C:/Media', 'Z:/Archive'])).toEqual(['@fixtures/Media', 'Z:/Archive']);
    expect(toStorageRoots(['C:/Media/2025', 'D:/Camera Imports'])).toEqual([
      '@fixtures/Media/2025',
      '@fixtures/Camera Imports',
    ]);
  });
});
