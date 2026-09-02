import type { DirectoryNode, DuplicateGroup, Entry, LogEntry } from './types';

export const thumbs = [
  'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=200&q=70',
  'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=200&q=70',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=200&q=70',
  'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=200&q=70',
  'https://images.unsplash.com/photo-1511497584788-876760111969?w=200&q=70',
  'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=200&q=70',
];

export const entries: Entry[] = Array.from({ length: 18 }, (_, i) => ({
  id: i + 1,
  size: [28400000, 18400000, 9700000, 7600000, 5400000][i % 5],
  directory:
    i === 1
      ? 'C:/Media/2025/Trips/2025-Summer-Family-Vacation-Originals'
      : ['C:/Media/2025', 'C:/Media/2024', 'D:/Camera Imports'][i % 3],
  extension: i % 4 === 0 ? '.png' : '.jpg',
  filename:
    i === 1
      ? 'shoreline-sunset-with-family-at-the-lake-final-edited-copy.jpg'
      : ['mountain-lake', 'shoreline', 'forest-trail', 'sunset', 'family-trip', 'coastline'][i % 6] + `-${i + 1}.jpg`,
  birthtime: `2025-0${(i % 8) + 1}-1${i % 9}T10:24:00Z`,
  hash: i % 5 === 0 ? null : `sha256-${['a1f9', 'b82c', 'c31e', 'd94a'][i % 4]}`,
  path: `C:/Media/2025/${i % 2 ? 'Trips' : 'Library'}/file-${i + 1}.jpg`,
}));

export const groups: DuplicateGroup[] = [
  { hash: 'sha256-a1f9', name: 'mountain-lake.jpg', count: 5, space: '112.8 MB', files: entries.slice(0, 5) },
  { hash: 'sha256-b82c', name: 'shoreline.jpg', count: 3, space: '44.2 MB', files: entries.slice(5, 8) },
  { hash: 'sha256-c31e', name: 'forest-trail.jpg', count: 2, space: '9.7 MB', files: entries.slice(8, 10) },
];

export const directoryTree: DirectoryNode[] = [
  {
    label: 'Media (C:)',
    path: 'C:/Media',
    children: [
      { label: '2025', path: 'C:/Media/2025', children: [{ label: 'Trips', path: 'C:/Media/2025/Trips' }] },
      { label: '2024', path: 'C:/Media/2024' },
    ],
  },
  { label: 'Camera Imports (D:)', path: 'D:/Camera Imports' },
  { label: 'Archive (Z:)', path: 'Z:/Archive' },
];

export const initialLogs: LogEntry[] = [
  { time: '09:42:18', event: 'Scan completed', directory: 'C:/Media/2025', status: 'Complete' },
  { time: '09:42:04', event: 'Permission denied', directory: 'C:/Media/2025/Private', status: 'Warning' },
  { time: '09:40:12', event: 'Files indexed', directory: 'D:/Camera Imports', status: 'Complete' },
];

export const headerDirOptions: string[] = ['C:/Media/2025', 'C:/Media/2024', 'D:/Camera Imports'];
export const headerExtOptions: string[] = ['.jpg', '.png'];

export const metricRows: [string, string, string][] = [
  ['Total files', '18,426', '+12%'],
  ['Total size', '2.4 GB', ''],
  ['Duplicate groups', '3', ''],
  ['Redundant space', '166.7 MB', '-8%'],
  ['Unique files', '11,208', ''],
  ['Not backed up', '2,184', 'attention'],
];

export const storageRows: [string, number, string][] = [
  ['C:/Media/2025', 52, '1.2 GB'],
  ['C:/Media/2024', 31, '740 MB'],
  ['D:/Camera Imports', 17, '460 MB'],
];

export const runSteps: [string, string][] = [
  ['Index files', '1.2s'],
  ['Calculate hashes', '2.2s'],
  ['Rebuild records', '3.2s'],
  ['Check backup coverage', '4.2s'],
];

export const largestFiles: Entry[] = entries.slice(0, 4);

export const preferences = {
  indexed: [
    { path: 'C:/Media/2025', enabled: true, lastScan: 'Today, 09:42', files: '12,842' },
    { path: 'D:/Camera Imports', enabled: true, lastScan: 'Today, 09:40', files: '5,584' },
  ],
  ignored: ['C:/Media/2025/Cache', 'C:/Media/2024/Exports'],
  databaseName: 'local.db',
  extensions: 'jpg, png, gif, jpeg, mp4, mov',
};
