import '@tanstack/react-start/server-only';
import { Runner } from '../engine/runner';
import type { Reporter } from '../engine/output/reporter';
import type { ProgressSink } from '../engine/types/progress';
import type { RunConfiguration } from '../engine/types/configuration';
import type { RunSummary } from '../engine/types/run-summary';
import type { AppConfig } from '../../app/lib/types';
import { appConfigStore } from './app-config';
import { sampleDbPath } from './db-path';

const silentReporter: Reporter = { debug() {}, info() {}, warn() {}, error() {}, printSummary() {} };

export type RunConfiguredScanDeps = { progress: ProgressSink; signal: AbortSignal };

export type ConfiguredScanDeps = {
  getConfig: () => AppConfig;
  recordScanned: (paths: string[], at: string) => void;
  run: (config: RunConfiguration, deps: RunConfiguredScanDeps) => Promise<RunSummary>;
};

export class NoDirectoriesConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoDirectoriesConfiguredError';
  }
}

function parseExtensions(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
    .map((part) => (part.startsWith('.') ? part : `.${part}`));
}

export function createConfiguredScan(deps: ConfiguredScanDeps): (deps: RunConfiguredScanDeps) => Promise<RunSummary> {
  return async ({ progress, signal }) => {
    const config = deps.getConfig();
    const directories = config.directories.indexed.filter((entry) => entry.enabled).map((entry) => entry.path);
    const extensions = parseExtensions(config.application.extensions);

    if (directories.length === 0) {
      throw new NoDirectoriesConfiguredError('No enabled directories configured');
    }
    if (extensions.length === 0) {
      throw new NoDirectoriesConfiguredError('No file extensions configured');
    }

    const runConfig: RunConfiguration = {
      dbName: sampleDbPath(),
      extensions,
      directories,
      ignore_directories: config.directories.ignored,
      update_records: config.application.updateRecords,
      process_directories: config.application.processDirectories,
      resync_directories: config.application.resyncDirectories,
      resync_check_actual_file: config.application.verifyFiles,
    };

    const summary = await deps.run(runConfig, { progress, signal });
    deps.recordScanned(directories, new Date().toISOString());
    return summary;
  };
}

export const runConfiguredScan = createConfiguredScan({
  getConfig: () => appConfigStore.get(),
  recordScanned: (paths, at) => {
    appConfigStore.recordScannedDirectories(paths, at);
  },
  run: async (config, { progress, signal }) => {
    const runner = new Runner(config, { reporter: silentReporter, progress, signal });
    try {
      return await runner.run();
    } finally {
      runner.close();
    }
  },
});
