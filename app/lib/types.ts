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
  hash: string;
  name: string;
  count: number;
  space: string;
  files: Entry[];
};

export type LogStatus = 'Complete' | 'Warning' | 'Running';

export type LogEntry = {
  time: string;
  event: string;
  directory: string;
  status: LogStatus;
};
