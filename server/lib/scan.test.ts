import { describe, expect, it } from 'vitest';
import { RunAbortedError } from '../engine/phases/abort';
import { createScanService, type RunScan } from './scan';

describe('createScanService', () => {
  it('runs a scan, tracks progress, and completes with a summary', async () => {
    const sink: { emit: (event: unknown) => void } = { emit: () => {} };
    const runScan: RunScan = async ({ progress }) => {
      sink.emit = (event) => progress.emitProgress(event as never);
      return {
        phases: [],
        filesScanned: 3,
        entriesWritten: 3,
        duplicateGroups: 1,
        duplicateFiles: 1,
        staleRemoved: 0,
        errors: [],
      };
    };
    const service = createScanService(runScan);
    expect(service.status().status).toBe('idle');

    service.start();
    expect(service.status().status).toBe('running');

    sink.emit({
      type: 'file',
      phase: 'scan',
      directory: 'C:/Media',
      currentFile: 'C:/Media/a.jpg',
      filesProcessed: 2,
      totalFiles: 3,
    });
    expect(service.status().filesProcessed).toBe(2);

    await Promise.resolve();
    await Promise.resolve();
    const done = service.status();
    expect(done.status).toBe('completed');
    expect(done.summary?.duplicateGroups).toBe(1);
  });

  it('ignores a second start while running', () => {
    const runScan: RunScan = () => new Promise(() => {});
    const service = createScanService(runScan);
    service.start();
    service.start();
    expect(service.status().status).toBe('running');
  });

  it('cancels a running scan', async () => {
    const runScan: RunScan = ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new RunAbortedError()));
      });
    const service = createScanService(runScan);
    service.start();
    service.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(service.status().status).toBe('cancelled');
  });
});
