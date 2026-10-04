import { describe, expect, it, vi } from 'vitest';
import type { ProgressSink } from '../engine/types/progress';
import type { RunConfiguration } from '../engine/types/configuration';
import type { RunSummary } from '../engine/types/run-summary';
import type { AppConfig } from '../../app/lib/types';
import { createConfiguredScan, NoDirectoriesConfiguredError, type RunConfiguredScanDeps } from './scan-configured';

const sink: ProgressSink = { emitProgress() {} };
const signal = new AbortController().signal;
const summary: RunSummary = {
  phases: [],
  filesScanned: 0,
  entriesWritten: 0,
  duplicateGroups: 0,
  duplicateFiles: 0,
  staleRemoved: 0,
  errors: [],
};

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    directories: { indexed: [{ path: 'C:/Photos', enabled: true }], ignored: ['C:/Photos/Cache'] },
    application: {
      extensions: 'jpg, .PNG ,',
      processDirectories: true,
      updateRecords: false,
      resyncDirectories: true,
      verifyFiles: true,
      generatePreviews: false,
    },
    directoryMeta: {},
    ...overrides,
  };
}

describe('createConfiguredScan', () => {
  it('builds the run configuration from app config and records the scan', async () => {
    const run = vi.fn(async (_config: RunConfiguration, _deps: RunConfiguredScanDeps) => summary);
    const recordScanned = vi.fn();
    const recordLastScan = vi.fn();
    const scan = createConfiguredScan({ getConfig: () => baseConfig(), recordScanned, recordLastScan, run });

    const result = await scan({ progress: sink, signal });

    expect(result).toBe(summary);
    expect(run).toHaveBeenCalledTimes(1);
    const [config] = run.mock.calls[0];
    expect(config.directories).toEqual(['C:/Photos']);
    expect(config.ignore_directories).toEqual(['C:/Photos/Cache']);
    expect(config.extensions).toEqual(['.jpg', '.png']);
    expect(config.update_records).toBe(false);
    expect(config.resync_directories).toBe(true);
    expect(config.resync_check_actual_file).toBe(true);
    expect(recordScanned).toHaveBeenCalledWith(['C:/Photos'], expect.any(String));
    expect(recordLastScan).toHaveBeenCalledTimes(1);
    expect(recordLastScan).toHaveBeenCalledWith({
      finishedAt: expect.any(String),
      directories: 1,
      filesScanned: 0,
      entriesWritten: 0,
      duplicateGroups: 0,
      duplicateFiles: 0,
      errors: 0,
    });
  });

  it('refuses when no directories are enabled', async () => {
    const run = vi.fn(async () => summary);
    const recordLastScan = vi.fn();
    const scan = createConfiguredScan({
      getConfig: () => baseConfig({ directories: { indexed: [{ path: 'C:/Photos', enabled: false }], ignored: [] } }),
      recordScanned: vi.fn(),
      recordLastScan,
      run,
    });
    await expect(scan({ progress: sink, signal })).rejects.toBeInstanceOf(NoDirectoriesConfiguredError);
    expect(run).not.toHaveBeenCalled();
    expect(recordLastScan).not.toHaveBeenCalled();
  });

  it('refuses when no extensions are configured', async () => {
    const run = vi.fn(async () => summary);
    const recordLastScan = vi.fn();
    const scan = createConfiguredScan({
      getConfig: () => baseConfig({ application: { ...baseConfig().application, extensions: '  ' } }),
      recordScanned: vi.fn(),
      recordLastScan,
      run,
    });
    await expect(scan({ progress: sink, signal })).rejects.toBeInstanceOf(NoDirectoriesConfiguredError);
    expect(run).not.toHaveBeenCalled();
    expect(recordLastScan).not.toHaveBeenCalled();
  });
});
