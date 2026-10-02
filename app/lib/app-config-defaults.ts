import type { AppConfig } from './types';

export const DEFAULT_APP_CONFIG: AppConfig = {
  directories: {
    indexed: [
      { path: 'C:/Media/2025', enabled: true },
      { path: 'D:/Camera Imports', enabled: true },
    ],
    ignored: ['C:/Media/2025/Cache', 'C:/Media/2024/Exports'],
  },
  application: {
    extensions: 'jpg, png, gif, jpeg, mp4, mov',
    processDirectories: true,
    updateRecords: true,
    resyncDirectories: false,
    verifyFiles: false,
  },
};
