import '@tanstack/react-start/server-only';
import { RunAbortedError } from '../engine/phases/abort';
import { ProgressEmitter } from '../engine/output/progress';
import type { ProgressEvent } from '../engine/types/progress';
import type { RunSummary } from '../engine/types/run-summary';
import type { LogEntry, ScanState } from '../../app/lib/types';
import { runConfiguredScan } from './scan-configured';

const MAX_LOG = 50;

export type RunScan = (deps: { progress: ProgressEmitter; signal: AbortSignal }) => Promise<RunSummary>;

export type ScanService = {
  start: () => ScanState;
  status: () => ScanState;
  cancel: () => void;
};

function now(): string {
  return new Date().toTimeString().slice(0, 8);
}

function initialState(): ScanState {
  return {
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
}

export function createScanService(runScan: RunScan): ScanService {
  let state = initialState();
  let controller: AbortController | null = null;

  const pushLog = (entry: LogEntry): void => {
    state = { ...state, log: [entry, ...state.log].slice(0, MAX_LOG) };
  };

  const onProgress = (event: ProgressEvent): void => {
    switch (event.type) {
      case 'phaseStart':
        state = { ...state, phase: event.phase };
        pushLog({ time: now(), event: `Phase: ${event.phase}`, directory: '', status: 'Running' });
        break;
      case 'directoryStart':
        state = { ...state, currentDirectory: event.directory };
        pushLog({ time: now(), event: 'Scanning directory', directory: event.directory, status: 'Running' });
        break;
      case 'file':
        state = {
          ...state,
          phase: event.phase,
          currentDirectory: event.directory,
          currentFile: event.currentFile,
          filesProcessed: event.filesProcessed,
          totalFiles: event.totalFiles,
        };
        break;
      case 'counts':
        state = { ...state, filesProcessed: event.filesProcessed, totalFiles: event.totalFiles };
        break;
      default:
        break;
    }
  };

  return {
    status: () => state,
    cancel: () => {
      controller?.abort();
    },
    start: () => {
      if (state.status === 'running') return state;

      controller = new AbortController();
      const progress = new ProgressEmitter();
      progress.on(onProgress);
      state = { ...initialState(), status: 'running', startedAt: now() };
      pushLog({ time: now(), event: 'Scan started', directory: 'Fixture tree', status: 'Running' });

      runScan({ progress, signal: controller.signal })
        .then((summary) => {
          state = {
            ...state,
            status: 'completed',
            phase: null,
            currentFile: null,
            currentDirectory: null,
            finishedAt: now(),
            filesProcessed: summary.filesScanned,
            totalFiles: summary.filesScanned,
            summary: {
              filesScanned: summary.filesScanned,
              entriesWritten: summary.entriesWritten,
              duplicateGroups: summary.duplicateGroups,
              duplicateFiles: summary.duplicateFiles,
              errors: summary.errors.length,
            },
          };
          pushLog({ time: now(), event: 'Scan completed', directory: '', status: 'Complete' });
        })
        .catch((error: unknown) => {
          if (error instanceof RunAbortedError) {
            state = { ...state, status: 'cancelled', currentFile: null, currentDirectory: null, finishedAt: now() };
            pushLog({ time: now(), event: 'Scan cancelled', directory: '', status: 'Warning' });
            return;
          }
          state = {
            ...state,
            status: 'error',
            finishedAt: now(),
            error: error instanceof Error ? error.message : String(error),
          };
          pushLog({ time: now(), event: 'Scan failed', directory: '', status: 'Warning' });
        });

      return state;
    },
  };
}

export const scanService = createScanService(({ progress, signal }) => runConfiguredScan({ progress, signal }));
