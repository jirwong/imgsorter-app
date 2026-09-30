import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ScanState } from './types';

const idle: ScanState = {
  status: 'idle',
  phase: null,
  filesProcessed: 0,
  totalFiles: null,
  currentFile: null,
  currentDirectory: null,
  startedAt: null,
  finishedAt: null,
  summary: null,
  error: null,
  log: [],
};

const getScanStatus = vi.fn(async () => idle);
vi.mock('../../server/routes/scan', () => ({
  getScanStatus,
  startScan: vi.fn(async () => idle),
  cancelScan: vi.fn(async () => idle),
}));

describe('useScanStatus', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls the server status while mounted', async () => {
    const running: ScanState = { ...idle, status: 'running', filesProcessed: 1, totalFiles: 5 };
    getScanStatus.mockResolvedValueOnce(idle).mockResolvedValue(running);
    const { useScanStatus } = await import('./scan-store');

    const { result, unmount } = renderHook(() => useScanStatus());
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.status).toBe('running');
    expect(result.current.filesProcessed).toBe(1);

    unmount();
  });
});
