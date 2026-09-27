export type Entry = {
  id: number;
  size: number;
  directory: string;
  extension: string;
  filename: string;
  birthtime: string;
  hash: string | null;
  path: string;
};

export type DirectoryNode = {
  label: string;
  path: string;
  children?: DirectoryNode[];
};

export type DuplicateGroup = {
  key: string;
  hash: string;
  name: string;
  count: number;
  size: number;
  redundantSpace: number;
  extension: string;
  directories: string[];
  files: Entry[];
};

export type LogStatus = 'Complete' | 'Warning' | 'Running';

export type LogEntry = {
  time: string;
  event: string;
  directory: string;
  status: LogStatus;
};

export type OverviewData = {
  totalFiles: number;
  totalSize: number;
  duplicateGroups: number;
  redundantSpace: number;
  uniqueFiles: number;
  storageMap: { path: string; share: number; size: number }[];
  largestFiles: Entry[];
};

export type SizeRankRow = { filename: string; size: number };

export type CopyRankRow = { name: string; count: number };

export type AnalyticsData = { rankedBySize: SizeRankRow[]; rankedByCopies: CopyRankRow[] };

export type ShellData = { files: number; size: number; roots: string[]; extensions: string[] };

export type FilesInput = { query: string; dir: string; ext: string; selectedDirs: string[] };
