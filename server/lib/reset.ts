import '@tanstack/react-start/server-only';
import type { ResetResult } from '../../app/lib/types';
import { appConfigStore } from './app-config';
import { clearIndex } from './queries';
import { scanService } from './scan';
import { thumbnails } from './thumbnails';

export type ResetDeps = {
  isScanning: () => boolean;
  clearIndex: () => { entries: number; records: number };
  resetScanMetadata: () => void;
  clearKeepers: () => void;
  clearHidden: () => void;
  clearThumbnails: () => number;
};

export function createResetService(deps: ResetDeps): { reset: () => ResetResult } {
  return {
    reset: () => {
      if (deps.isScanning()) throw new Error('A scan is running.');
      const index = deps.clearIndex();
      deps.resetScanMetadata();
      deps.clearKeepers();
      deps.clearHidden();
      const thumbs = deps.clearThumbnails();
      return { entries: index.entries, records: index.records, thumbnails: thumbs };
    },
  };
}

export const resetService = createResetService({
  isScanning: () => scanService.status().status === 'running',
  clearIndex,
  resetScanMetadata: () => appConfigStore.resetScanMetadata(),
  clearKeepers: () => {
    appConfigStore.setKeepers([]);
  },
  clearHidden: () => {
    appConfigStore.setHidden([]);
  },
  clearThumbnails: () => thumbnails.clearCache(),
});
