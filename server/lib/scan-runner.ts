import Database from 'better-sqlite3';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { Runner } from '../engine/runner';
import type { Reporter } from '../engine/output/reporter';
import type { ProgressSink } from '../engine/types/progress';
import type { RunConfiguration } from '../engine/types/configuration';
import type { RunSummary } from '../engine/types/run-summary';
import { DbService } from '../engine/services/db-service';
import { FIXTURE_ROOTS } from './fixture-plan';
import { fixturesDir, sampleDbPath, virtualToReal } from './db-path';
import { removeFixtureTree, writeFixtureTree } from './fixtures';

const silentReporter: Reporter = { debug() {}, info() {}, warn() {}, error() {}, printSummary() {} };

export type RunFixtureScanDeps = { progress: ProgressSink; signal: AbortSignal; dbPath?: string };

export async function runFixtureScan({
  progress,
  signal,
  dbPath = sampleDbPath(),
}: RunFixtureScanDeps): Promise<RunSummary> {
  writeFixtureTree();
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  mkdirSync(dirname(dbPath), { recursive: true });

  const config: RunConfiguration = {
    dbName: dbPath,
    extensions: ['.jpg', '.png', '.gif'],
    directories: [...FIXTURE_ROOTS].map(virtualToReal),
    ignore_directories: [],
    update_records: true,
    process_directories: true,
    resync_directories: false,
    resync_check_actual_file: false,
  };

  const runner = new Runner(config, { reporter: silentReporter, progress, signal });
  let summary: RunSummary | null = null;
  let failure: unknown = null;
  let failed = false;
  try {
    summary = await runner.run();
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    runner.close();
  }

  try {
    const db = new Database(dbPath);
    try {
      db.prepare(
        `UPDATE entries SET
           directory = replace(replace(directory, @root, '@fixtures'), char(92), '/'),
           path = replace(replace(path, @root, '@fixtures'), char(92), '/'),
           birthtime = '2025-0' || ((id % 8) + 1) || '-1' || (id % 9) || 'T10:24:00Z'`,
      ).run({ root: fixturesDir() });
    } finally {
      db.close();
    }

    const service = new DbService(dbPath);
    try {
      service.updateFileRecords();
    } finally {
      service.close();
    }
  } finally {
    removeFixtureTree();
  }

  if (failed) {
    throw failure;
  }
  if (!summary) {
    throw new Error('Scan completed without a summary');
  }
  return summary;
}
