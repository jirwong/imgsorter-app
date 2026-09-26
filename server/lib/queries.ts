import '@tanstack/react-start/server-only';
import Database from 'better-sqlite3';
import { applyFilters } from '../../app/lib/filter-pipeline';
import type { AnalyticsData, DirectoryNode, Entry, FilesInput, OverviewData, ShellData } from '../../app/lib/types';
import { mapPathToDisplay, rootLabelOf } from './labels';
import { buildDirectoryTree } from './tree';
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

function openReadonly() {
  return new Database(sampleDbPath(), { readonly: true });
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
  try {
    const rows = db
      .prepare(`SELECT id, size, directory, extension, filename, birthtime, hash, path FROM entries`)
      .all() as EntryRow[];
    return applyFilters(rows.map(toEntry), input.query, input.dir, input.ext, input.selectedDirs);
  } finally {
    db.close();
  }
}

export function getDirectoryTree(): DirectoryNode[] {
  const db = openReadonly();
  try {
    const rows = db.prepare(`SELECT DISTINCT directory FROM entries`).all() as { directory: string }[];
    return buildDirectoryTree(rows.map((row) => mapPathToDisplay(row.directory)));
  } finally {
    db.close();
  }
}

export function getAnalyticsData(): AnalyticsData {
  const db = openReadonly();
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
    return { files: totals.files, size: totals.size, roots, extensions: exts.map((row) => row.extension) };
  } finally {
    db.close();
  }
}
