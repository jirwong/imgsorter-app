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

export type ShellData = { files: number; size: number; roots: string[]; extensions: string[]; duplicateGroups: number };

export type FilesInput = { query: string; dir: string; ext: string; selectedDirs: string[] };

export type ScanRunStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';

export type ScanState = {
  status: ScanRunStatus;
  phase: 'scan' | 'resync' | 'records' | null;
  filesProcessed: number;
  totalFiles: number | null;
  currentFile: string | null;
  currentDirectory: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  summary: {
    filesScanned: number;
    entriesWritten: number;
    duplicateGroups: number;
    duplicateFiles: number;
    errors: number;
  } | null;
  error: string | null;
  log: LogEntry[];
};

export type IndexedDirectory = { path: string; enabled: boolean };

export type DirectoriesConfig = {
  indexed: IndexedDirectory[];
  ignored: string[];
};

export type ApplicationConfig = {
  extensions: string;
  processDirectories: boolean;
  updateRecords: boolean;
  resyncDirectories: boolean;
  verifyFiles: boolean;
  generatePreviews: boolean;
};

export type DirectoryMeta = Record<string, { lastScannedAt: string }>;

export type AppConfig = {
  directories: DirectoriesConfig;
  application: ApplicationConfig;
  directoryMeta: DirectoryMeta;
};

export type NativeActionFailure = 'not-found' | 'missing' | 'unsupported' | 'error';

export type NativeActionResult = { ok: true } | { ok: false; reason: NativeActionFailure };

export type FolderPickResult =
  | { status: 'picked'; path: string }
  | { status: 'canceled' }
  | { status: 'busy' }
  | { status: 'timeout' }
  | { status: 'unsupported' }
  | { status: 'error' };

export type KeeperMap = Record<string, number>;

export type DuplicatesData = { groups: DuplicateGroup[]; keepers: KeeperMap; staleKeepers: number };

export type LastScan = {
  finishedAt: string;
  directories: number;
  filesScanned: number;
  entriesWritten: number;
  duplicateGroups: number;
  duplicateFiles: number;
  errors: number;
};

export type ThumbnailMap = Record<number, string>;
