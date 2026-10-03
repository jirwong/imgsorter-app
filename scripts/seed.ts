import { expectedFixtureStats } from '../server/lib/fixture-plan';
import { fixtureDbPath } from '../server/lib/db-path';
import { runFixtureScan } from '../server/lib/scan-runner';

async function main(): Promise<void> {
  const summary = await runFixtureScan({
    progress: silentProgress(),
    signal: new AbortController().signal,
    dbPath: fixtureDbPath(),
  });

  const expected = expectedFixtureStats();
  console.log(
    `Seed complete: ${expected.totalFiles} files, ${expected.totalSize} bytes, ${expected.duplicateGroups} duplicate groups`,
  );
  console.log(`Scan summary: ${summary.filesScanned} scanned, ${summary.entriesWritten} written`);
}

function silentProgress() {
  return { emitProgress() {} };
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
