import { describe, expect, it } from 'vitest';
import { mapPathToDisplay, rootLabelOf } from './labels';

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
});
