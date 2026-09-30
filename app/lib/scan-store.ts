import { useSyncExternalStore } from 'react';
import {
  cancelScan as cancelScanRequest,
  getScanStatus,
  startScan as startScanRequest,
} from '../../server/routes/scan';
import type { ScanState } from './types';

const POLL_MS = 400;

const idleState: ScanState = {
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

let state: ScanState = idleState;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let refCount = 0;

function emit(next: ScanState): void {
  state = next;
  for (const listener of listeners) listener();
}

async function poll(): Promise<void> {
  try {
    emit(await getScanStatus());
  } catch {
    return;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  refCount += 1;
  if (refCount === 1) {
    void poll();
    timer = setInterval(() => void poll(), POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    refCount -= 1;
    if (refCount === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): ScanState {
  return state;
}

export function useScanStatus(): ScanState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function startScan(): Promise<void> {
  emit(await startScanRequest());
}

export async function cancelScan(): Promise<void> {
  emit(await cancelScanRequest());
}
