import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it('formats gigabytes with one decimal', () => {
    expect(formatBytes(2_400_000_000)).toBe('2.4 GB');
  });

  it('formats megabytes with one decimal', () => {
    expect(formatBytes(44_200_000)).toBe('44.2 MB');
  });

  it('formats small values as MB', () => {
    expect(formatBytes(9_700_000)).toBe('9.7 MB');
  });
});
