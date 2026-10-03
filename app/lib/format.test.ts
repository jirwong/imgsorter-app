import { describe, expect, it } from 'vitest';
import { formatBytes, formatRelativeTime } from './format';

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

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-04T12:00:00.000Z');
  const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString();

  it('formats seconds, minutes, hours, and days', () => {
    expect(formatRelativeTime(ago(5_000), now)).toBe('just now');
    expect(formatRelativeTime(ago(60_000), now)).toBe('1 minute ago');
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(60 * 60_000), now)).toBe('1 hour ago');
    expect(formatRelativeTime(ago(3 * 60 * 60_000), now)).toBe('3 hours ago');
    expect(formatRelativeTime(ago(24 * 60 * 60_000), now)).toBe('1 day ago');
    expect(formatRelativeTime(ago(5 * 24 * 60 * 60_000), now)).toBe('5 days ago');
  });

  it('treats a future time as just now', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 60_000).toISOString(), now)).toBe('just now');
  });
});
