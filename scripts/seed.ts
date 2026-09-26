import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import Database from 'better-sqlite3';
import { Runner } from '../server/engine/runner';
import type { Reporter } from '../server/engine/output/reporter';
import { ProgressEmitter } from '../server/engine/output/progress';
import type { RunConfiguration } from '../server/engine/types/configuration';
import { DbService } from '../server/engine/services/db-service';
import { buildFixtureFiles, expectedFixtureStats, fixtureBytes, FIXTURE_ROOTS } from '../server/lib/fixture-plan';
import { fixturesDir, sampleDbPath, virtualToReal } from '../server/lib/db-path';

const silentReporter: Reporter = { debug() {}, info() {}, warn() {}, error() {}, printSummary() {} };

function fixtureContent(name: string, size: number): Buffer {
  const seed = fixtureBytes(name);
  const content = Buffer.alloc(size);
  for (let offset = 0; offset < size; offset += seed.length) {
    seed.copy(content, offset);
  }
  return content;
}

function writeFixtureFiles(): void {
  rmSync(fixturesDir(), { recursive: true, force: true });
  for (const file of buildFixtureFiles()) {
    const dir = virtualToReal(file.root);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file.name), fixtureContent(file.name, file.size));
  }
}

async function main(): Promise<void> {
  writeFixtureFiles();
  rmSync(sampleDbPath(), { force: true });
  rmSync(`${sampleDbPath()}-wal`, { force: true });
  rmSync(`${sampleDbPath()}-shm`, { force: true });
  mkdirSync(dirname(sampleDbPath()), { recursive: true });

  const config: RunConfiguration = {
    dbName: sampleDbPath(),
    extensions: ['.jpg', '.png', '.gif'],
    directories: [...FIXTURE_ROOTS].map(virtualToReal),
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

  const db = new Database(sampleDbPath());
  db.prepare(
    `UPDATE entries SET
       directory = replace(replace(directory, @root, '@fixtures'), char(92), '/'),
       path = replace(replace(path, @root, '@fixtures'), char(92), '/'),
       birthtime = '2025-0' || ((id % 8) + 1) || '-1' || (id % 9) || 'T10:24:00Z'`,
  ).run({ root: fixturesDir() });
  db.close();

  const service = new DbService(sampleDbPath());
  service.updateFileRecords();
  service.close();

  await rm(fixturesDir(), { recursive: true, force: true });

  const expected = expectedFixtureStats();
  console.log(
    `Seed complete: ${expected.totalFiles} files, ${expected.totalSize} bytes, ${expected.duplicateGroups} duplicate groups`,
  );
  console.log(`Scan summary: ${summary.filesScanned} scanned, ${summary.entriesWritten} written`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
