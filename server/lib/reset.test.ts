import { describe, expect, it, vi } from 'vitest';
import { createResetService, type ResetDeps } from './reset';

function makeDeps(): ResetDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    clearIndex: vi.fn(() => {
      calls.push('clearIndex');
      return { entries: 5, records: 3 };
    }),
    resetScanMetadata: vi.fn(() => {
      calls.push('resetScanMetadata');
    }),
    clearKeepers: vi.fn(() => {
      calls.push('clearKeepers');
    }),
    clearThumbnails: vi.fn(() => {
      calls.push('clearThumbnails');
      return 2;
    }),
  };
}

describe('createResetService', () => {
  it('clears everything in order and returns the counts', () => {
    const deps = makeDeps();
    const service = createResetService(deps);
    expect(service.reset()).toEqual({ entries: 5, records: 3, thumbnails: 2 });
    expect(deps.calls).toEqual(['clearIndex', 'resetScanMetadata', 'clearKeepers', 'clearThumbnails']);
  });

  it('stops when clearing the index fails', () => {
    const deps = makeDeps();
    vi.mocked(deps.clearIndex).mockImplementation(() => {
      throw new Error('boom');
    });
    const service = createResetService(deps);
    expect(() => service.reset()).toThrow('boom');
    expect(deps.resetScanMetadata).not.toHaveBeenCalled();
    expect(deps.clearKeepers).not.toHaveBeenCalled();
    expect(deps.clearThumbnails).not.toHaveBeenCalled();
  });
});
