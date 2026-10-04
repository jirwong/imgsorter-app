import type { AppConfig } from './types';

export const DEFAULT_APP_CONFIG: AppConfig = {
  directories: {
    indexed: [],
    ignored: [],
  },
  application: {
    extensions: 'jpg, png, gif, jpeg, mp4, mov',
    processDirectories: true,
    updateRecords: true,
    resyncDirectories: false,
    verifyFiles: false,
    generatePreviews: false,
  },
  directoryMeta: {},
};
