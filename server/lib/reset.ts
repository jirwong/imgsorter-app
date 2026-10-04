import '@tanstack/react-start/server-only';
import type { ResetResult } from '../../app/lib/types';
import { appConfigStore } from './app-config';
import { clearIndex } from './queries';
import { thumbnails } from './thumbnails';

export type ResetDeps = {
  clearIndex: () => { entries: number; records: number };
  resetScanMetadata: () => void;
  clearKeepers: () => void;
  clearThumbnails: () => number;
};

export function createResetService(deps: ResetDeps): { reset: () => ResetResult } {
  return {
    reset: () => {
      const index = deps.clearIndex();
      deps.resetScanMetadata();
      deps.clearKeepers();
      const thumbs = deps.clearThumbnails();
      return { entries: index.entries, records: index.records, thumbnails: thumbs };
    },
  };
}

export const resetService = createResetService({
  clearIndex,
  resetScanMetadata: () => appConfigStore.resetScanMetadata(),
  clearKeepers: () => {
    appConfigStore.setKeepers([]);
  },
  clearThumbnails: () => thumbnails.clearCache(),
});
