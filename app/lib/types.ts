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
  fileCount: number;
  size: number;
  lastScannedAt?: string;
  isRoot?: boolean;
  inLibrary?: boolean;
  children: DirectoryNode[];
};

export type DirectoryStat = { path: string; fileCount: number; size: number };

export type ConfiguredRoot = { path: string; lastScannedAt?: string };

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

export type ShellData = { files: number; size: number; duplicateGroups: number };

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

export type ResetResult = {
  entries: number;
  records: number;
  thumbnails: number;
};

export type FilesQuery = {
  query: string;
  selectedDirs: string[];
  lockedDirs: string[];
  extensions: string[];
  sizeFilter: 'all' | 'under10' | '10to25' | 'over25';
  hiddenMode: 'active' | 'hidden' | 'all';
  page: number;
  pageSize: 10 | 25 | 50 | 100;
  sortKey: 'filename' | 'location' | 'type' | 'size';
  direction: 'asc' | 'desc';
};

export type FilesResult = {
  files: Entry[];
  total: number;
  directoryCounts: { path: string; count: number; hidden: number }[];
  extensionCounts: { extension: string; count: number }[];
  hiddenCount: number;
};

export type DuplicatesQuery = {
  query: string;
  selectedDirs: string[];
  extensions: string[];
  sizeFilter: 'all' | 'under10' | '10to25' | 'over25';
  countFilter: 'all' | '2' | '3+';
  keeperFilter: 'all' | 'with' | 'without';
  hiddenMode: 'active' | 'hidden' | 'all';
  page: number;
  pageSize: 10 | 25 | 50 | 100;
  sortKey: 'count' | 'name' | 'redundant';
  direction: 'asc' | 'desc';
};

export type DuplicatesResult = {
  groups: DuplicateGroup[];
  totalGroups: number;
  totalFiles: number;
  keepers: KeeperMap;
  staleKeepers: number;
  directoryCounts: { path: string; count: number; hidden: number; unit: 'group' }[];
  extensionCounts: { extension: string; count: number }[];
  hiddenCount: number;
};

export type AnalyticsQuery = {
  sizePage: number;
  sizePageSize: 5 | 10 | 25 | 50;
  copiesPage: number;
  copiesPageSize: 5 | 10 | 25 | 50;
};

export type AnalyticsResult = {
  rankedBySize: SizeRankRow[];
  totalFiles: number;
  rankedByCopies: CopyRankRow[];
  totalCopies: number;
};
