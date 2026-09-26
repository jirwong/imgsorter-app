import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DbService } from './services/db-service';
import { Runner } from './runner';
import type { Reporter } from './output/reporter';
import { ProgressEmitter } from './output/progress';
import type { RunConfiguration } from './types/configuration';

const silentReporter: Reporter = { debug() {}, info() {}, warn() {}, error() {}, printSummary() {} };

describe('vendored engine', () => {
  it('opens an in-memory db and builds records', () => {
    const service = new DbService(':memory:');
    service.insertFileEntries([
      {
        size: 10,
        directory: '/a',
        extension: '.txt',
        filename: 'x.txt',
        birthtime: new Date('2025-01-01T00:00:00Z'),
        hash: 'h1',
        path: '/a/x.txt',
      },
      {
        size: 10,
        directory: '/b',
        extension: '.txt',
        filename: 'x.txt',
        birthtime: new Date('2025-01-01T00:00:00Z'),
        hash: 'h1',
        path: '/b/x.txt',
      },
    ]);
    service.updateFileRecords();
    expect(service.getDuplicateStats()).toEqual({ duplicateGroups: 1, duplicateFiles: 1 });
    service.close();
  });

  it('runs the Runner over two temp directories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'imgsorter-engine-'));
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await mkdir(a, { recursive: true });
    await mkdir(b, { recursive: true });
    await writeFile(join(a, 'x.txt'), 'same content');
    await writeFile(join(b, 'x.txt'), 'same content');
    const config: RunConfiguration = {
      dbName: join(dir, 'test.db'),
      extensions: ['.txt'],
      directories: [a, b],
      ignore_directories: [],
      update_records: true,
      process_directories: true,
      resync_directories: false,
      resync_check_actual_file: false,
    };
    const runner = new Runner(config, {
      reporter: silentReporter,
      progress: new ProgressEmitter(),
      signal: new AbortController().signal,
    });
    const summary = await runner.run();
    runner.close();
    expect(summary.filesScanned).toBe(2);
    expect(summary.duplicateGroups).toBe(1);
    expect(summary.duplicateFiles).toBe(1);
  });
});
