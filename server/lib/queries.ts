import '@tanstack/react-start/server-only';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { applyFilters } from '../../app/lib/filter-pipeline';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import type {
  AnalyticsData,
  DirectoryStat,
  DuplicateGroup,
  Entry,
  FilesInput,
  KeeperMap,
  OverviewData,
  ShellData,
} from '../../app/lib/types';
import { mapPathToDisplay, rootLabelOf } from './labels';
import { sampleDbPath } from './db-path';

type EntryRow = {
  id: number;
  size: number;
  directory: string;
  extension: string;
  filename: string;
  birthtime: string;
  hash: string | null;
  path: string;
};

function dbPath(): string {
  return process.env.IMGSORTER_DB_PATH ?? sampleDbPath();
}

function openReadonly(): DatabaseType | null {
  const path = dbPath();
  if (!existsSync(path)) return null;
  return new Database(path, { readonly: true });
}

function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    size: row.size,
    directory: mapPathToDisplay(row.directory),
    extension: row.extension,
    filename: row.filename,
    birthtime: row.birthtime,
    hash: row.hash,
    path: mapPathToDisplay(row.path),
  };
}

export function getOverviewStats(): OverviewData {
  const db = openReadonly();
  if (!db) {
    return {
      totalFiles: 0,
      totalSize: 0,
      duplicateGroups: 0,
      redundantSpace: 0,
      uniqueFiles: 0,
      storageMap: [],
      largestFiles: [],
    };
  }
  try {
    const totals = db.prepare(`SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS size FROM entries`).get() as {
      files: number;
      size: number;
    };
    const groups = db.prepare(`SELECT COUNT(*) AS n FROM records WHERE count > 1`).get() as { n: number };
    const redundant = db
      .prepare(`SELECT COALESCE(SUM((count - 1) * size), 0) AS space FROM records WHERE count > 1`)
      .get() as {
      space: number;
    };
    const unique = db
      .prepare(
        `SELECT COUNT(*) AS n FROM (SELECT hash FROM entries WHERE hash IS NOT NULL GROUP BY hash HAVING COUNT(*) = 1)`,
      )
      .get() as { n: number };
    const dirAgg = db.prepare(`SELECT directory, SUM(size) AS size FROM entries GROUP BY directory`).all() as {
      directory: string;
      size: number;
    }[];
    const largest = db
      .prepare(
        `SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries ORDER BY size DESC, filename ASC LIMIT 4`,
      )
      .all() as EntryRow[];

    const byRoot = new Map<string, number>();
    for (const row of dirAgg) {
      const label = rootLabelOf(mapPathToDisplay(row.directory));
      byRoot.set(label, (byRoot.get(label) ?? 0) + row.size);
    }
    const storageMap = [...byRoot.entries()]
      .map(([path, size]) => ({
        path,
        size,
        share: totals.size === 0 ? 0 : Math.round((size / totals.size) * 100),
      }))
      .sort((a, b) => b.size - a.size);

    return {
      totalFiles: totals.files,
      totalSize: totals.size,
      duplicateGroups: groups.n,
      redundantSpace: redundant.space,
      uniqueFiles: unique.n,
      storageMap,
      largestFiles: largest.map(toEntry),
    };
  } finally {
    db.close();
  }
}

export function listEntries(input: FilesInput): Entry[] {
  const db = openReadonly();
  if (!db) return [];
  try {
    const rows = db
      .prepare(`SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries`)
      .all() as EntryRow[];
    return applyFilters(rows.map(toEntry), input.query, input.dir, input.ext, input.selectedDirs);
  } finally {
    db.close();
  }
}

export function getDirectoryStats(): DirectoryStat[] {
  const db = openReadonly();
  if (!db) return [];
  try {
    const rows = db
      .prepare(`SELECT directory, COUNT(*) AS fileCount, SUM(size) AS size FROM entries GROUP BY directory`)
      .all() as { directory: string; fileCount: number; size: number }[];
    return rows.map((row) => ({
      path: mapPathToDisplay(row.directory),
      fileCount: row.fileCount,
      size: row.size,
    }));
  } finally {
    db.close();
  }
}

export function getAnalyticsData(): AnalyticsData {
  const db = openReadonly();
  if (!db) return { rankedBySize: [], rankedByCopies: [] };
  try {
    const rankedBySize = db.prepare(`SELECT filename, size FROM entries ORDER BY size DESC`).all() as {
      filename: string;
      size: number;
    }[];
    const rankedByCopies = db
      .prepare(`SELECT filename AS name, count FROM records WHERE count > 1 ORDER BY count DESC, filename ASC`)
      .all() as { name: string; count: number }[];
    return { rankedBySize, rankedByCopies };
  } finally {
    db.close();
  }
}

export function getShellData(): ShellData {
  const db = openReadonly();
  if (!db) return { files: 0, size: 0, roots: [], extensions: [], duplicateGroups: 0 };
  try {
    const totals = db.prepare(`SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS size FROM entries`).get() as {
      files: number;
      size: number;
    };
    const dirs = db.prepare(`SELECT DISTINCT directory FROM entries`).all() as { directory: string }[];
    const exts = db.prepare(`SELECT DISTINCT extension FROM entries ORDER BY extension`).all() as {
      extension: string;
    }[];
    const roots = [...new Set(dirs.map((row) => rootLabelOf(mapPathToDisplay(row.directory))))].sort();
    const groups = db.prepare(`SELECT COUNT(*) AS n FROM records WHERE count > 1`).get() as { n: number };
    return {
      files: totals.files,
      size: totals.size,
      roots,
      extensions: exts.map((row) => row.extension),
      duplicateGroups: groups.n,
    };
  } finally {
    db.close();
  }
}

export function getDuplicateGroups(): DuplicateGroup[] {
  const db = openReadonly();
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        `SELECT filename, hash, count, size, extension, directories FROM records WHERE count > 1 ORDER BY filename`,
      )
      .all() as {
      filename: string;
      hash: string;
      count: number;
      size: number;
      extension: string;
      directories: string;
    }[];
    const memberStmt = db.prepare(
      `SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries WHERE hash = ? AND filename = ? ORDER BY path`,
    );
    return rows.map((row) => {
      const files = memberStmt.all(row.hash, row.filename) as EntryRow[];
      return {
        key: `${row.hash}:${row.filename}`,
        hash: row.hash,
        name: row.filename,
        count: row.count,
        size: row.size,
        redundantSpace: (row.count - 1) * row.size,
        extension: row.extension,
        directories: (JSON.parse(row.directories) as string[]).map(mapPathToDisplay),
        files: files.map(toEntry),
      };
    });
  } finally {
    db.close();
  }
}

export function countEntriesByDirectory(root: string): number {
  const db = openReadonly();
  if (!db) return 0;
  try {
    const normalized = normalizeDirectoryPath(root).toLowerCase();
    const escaped = normalized.replace(/[%_]/g, (ch) => `\\${ch}`);
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM entries
         WHERE lower(replace(directory, char(92), '/')) = ?
            OR lower(replace(directory, char(92), '/')) LIKE ? ESCAPE '\\'`,
      )
      .get(normalized, `${escaped}/%`) as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

export function getEntryPathById(id: number): string | null {
  const db = openReadonly();
  if (!db) return null;
  try {
    const row = db.prepare(`SELECT path FROM entries WHERE id = ?`).get(id) as { path: string } | undefined;
    return row?.path ?? null;
  } finally {
    db.close();
  }
}

export function getEntryPathsByIds(ids: number[]): string[] {
  if (ids.length === 0) return [];
  const db = openReadonly();
  if (!db) return [];
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const rows = db.prepare(`SELECT path FROM entries WHERE id IN (${placeholders})`).all(...ids) as {
      path: string;
    }[];
    return rows.map((row) => row.path);
  } finally {
    db.close();
  }
}

export function getKeeperData(paths: string[]): { keepers: KeeperMap; stale: string[] } {
  const keepers: KeeperMap = {};
  if (paths.length === 0) return { keepers, stale: [] };
  const db = openReadonly();
  if (!db) return { keepers, stale: [] };
  try {
    const storedByKey = new Map<string, string>();
    for (const path of paths) {
      storedByKey.set(normalizeDirectoryPath(path).toLowerCase(), path);
    }
    const keys = [...storedByKey.keys()];
    const placeholders = keys.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT e.id AS id, e.path AS path, e.hash AS hash, e.filename AS filename, r.count AS count
         FROM entries e
         LEFT JOIN records r ON r.hash = e.hash AND r.filename = e.filename
         WHERE lower(replace(e.path, char(92), '/')) IN (${placeholders})`,
      )
      .all(...keys) as { id: number; path: string; hash: string; filename: string; count: number | null }[];
    const matched = new Set<string>();
    for (const row of rows) {
      if (row.count !== null && row.count > 1) {
        keepers[`${row.hash}:${row.filename}`] = row.id;
        matched.add(normalizeDirectoryPath(row.path).toLowerCase());
      }
    }
    const stale = paths.filter((path) => !matched.has(normalizeDirectoryPath(path).toLowerCase()));
    return { keepers, stale };
  } finally {
    db.close();
  }
}
