import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { closeReadConnections, withRead } from '../server/lib/db';
import { ensureReadSchema } from '../server/lib/schema';
import {
  getAnalyticsData,
  getAnalyticsPage,
  getDuplicateGroups,
  getDuplicateGroupsPage,
  getOverviewStats,
  getPreferencesCounts,
  getShellData,
  listEntries,
  listFilesPage,
} from '../server/lib/queries';
import type { AnalyticsQuery, DuplicatesQuery, FilesInput, FilesQuery } from '../app/lib/types';

const TOTAL_ROWS = 350_000;

type BenchRoot = { storage: string; display: string; count: number; prefix: string; directories: string[] };

const ROOTS: BenchRoot[] = [
  {
    storage: '@fixtures/Media/2025',
    display: 'C:/Media/2025',
    count: 175_000,
    prefix: 'media25',
    directories: ['Trips', 'Library', 'Events', 'Portraits'],
  },
  {
    storage: '@fixtures/Media/2024',
    display: 'C:/Media/2024',
    count: 100_000,
    prefix: 'media24',
    directories: ['Archive', 'Holidays', 'Work'],
  },
  {
    storage: '@fixtures/Camera Imports',
    display: 'D:/Camera Imports',
    count: 75_000,
    prefix: 'camera',
    directories: ['DCIM/100CANON', 'DCIM/101CANON', 'Unsorted'],
  },
];

const DISPLAY_ROOTS = ROOTS.map((root) => root.display);

const NARROW_QUERY: FilesInput = {
  query: 'media25-000123',
  dir: 'All directories',
  ext: 'All types',
  selectedDirs: [],
};

const FILES_PAGE_QUERY: FilesQuery = {
  query: '',
  selectedDirs: [],
  extensions: [],
  sizeFilter: 'all',
  hiddenMode: 'active',
  page: 1,
  pageSize: 25,
  sortKey: 'location',
  direction: 'asc',
};

const DUPLICATES_PAGE_QUERY: DuplicatesQuery = {
  query: '',
  selectedDirs: [],
  extensions: [],
  sizeFilter: 'all',
  countFilter: 'all',
  keeperFilter: 'all',
  hiddenMode: 'active',
  page: 1,
  pageSize: 25,
  sortKey: 'count',
  direction: 'desc',
};

const ANALYTICS_PAGE_QUERY: AnalyticsQuery = {
  sizePage: 1,
  sizePageSize: 10,
  copiesPage: 1,
  copiesPageSize: 10,
};

function buildDatabase(path: string): void {
  const db = new Database(path);
  try {
    db.exec(`
      CREATE TABLE entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        size INTEGER,
        directory TEXT,
        extension TEXT,
        filename TEXT,
        birthtime TEXT,
        hash TEXT,
        path TEXT,
        UNIQUE(path)
      );
    `);
    const insert = db.prepare(
      `INSERT INTO entries (size, directory, extension, filename, birthtime, hash, path) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertRows = db.transaction(() => {
      let global = 0;
      for (const root of ROOTS) {
        for (let index = 0; index < root.count; index += 1) {
          const extension = global % 5 === 0 ? '.png' : global % 17 === 0 ? '.gif' : '.jpg';
          const duplicate = global % 5000 < 2;
          const duplicateIndex = Math.floor(global / 5000);
          const directory = duplicate
            ? `${root.storage}/Duplicates/Set-${String(duplicateIndex).padStart(4, '0')}/Copy${global % 2 === 0 ? 'A' : 'B'}`
            : `${root.storage}/${root.directories[index % root.directories.length]}/Batch-${index % 32}`;
          const filename = duplicate
            ? `duplicate-${String(duplicateIndex).padStart(4, '0')}.jpg`
            : `${root.prefix}-${String(index).padStart(6, '0')}${extension}`;
          const fileExtension = duplicate ? '.jpg' : extension;
          const hash = duplicate ? `dup-${duplicateIndex}` : `hash-${global}`;
          insert.run(
            4096 + (global % 512) * 1000,
            directory,
            fileExtension,
            filename,
            '2025-01-01T00:00:00Z',
            hash,
            `${directory}/${filename}`,
          );
          global += 1;
        }
      }
    });
    insertRows();
    ensureReadSchema(db);
  } finally {
    db.close();
  }
}

function measure<T>(label: string, run: () => T): T {
  const start = performance.now();
  const result = run();
  const elapsed = performance.now() - start;
  console.log(`${label}: ${elapsed.toFixed(1)} ms`);
  return result;
}

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), 'imgsorter-bench-'));
  const dbPath = join(dir, 'bench.db');
  const previous = process.env.IMGSORTER_DB_PATH;
  try {
    const buildStart = performance.now();
    buildDatabase(dbPath);
    console.log(
      `Built ${TOTAL_ROWS.toLocaleString('en-US')} rows in ${(performance.now() - buildStart).toFixed(1)} ms`,
    );

    process.env.IMGSORTER_DB_PATH = dbPath;
    withRead((db) => db.prepare('SELECT 1 AS warm').get());

    measure('getShellData', () => {
      const shell = getShellData(DISPLAY_ROOTS);
      if (shell.files !== TOTAL_ROWS) {
        throw new Error(`Expected ${TOTAL_ROWS} scoped files, got ${shell.files}`);
      }
    });
    measure('getOverviewStats', () => getOverviewStats(DISPLAY_ROOTS));
    for (const root of ROOTS) {
      measure(`getPreferencesCounts ${root.display}`, () => getPreferencesCounts([root.display]));
    }
    measure('listEntries narrow query', () => listEntries(NARROW_QUERY, DISPLAY_ROOTS));
    measure('getDuplicateGroups', () => getDuplicateGroups(DISPLAY_ROOTS));
    measure('getAnalyticsData', () => getAnalyticsData(DISPLAY_ROOTS));
    measure('listFilesPage', () => listFilesPage(FILES_PAGE_QUERY, DISPLAY_ROOTS, []));
    measure('getDuplicateGroupsPage', () => getDuplicateGroupsPage(DUPLICATES_PAGE_QUERY, DISPLAY_ROOTS, [], []));
    measure('getAnalyticsPage', () => getAnalyticsPage(ANALYTICS_PAGE_QUERY, DISPLAY_ROOTS));
  } finally {
    if (previous === undefined) delete process.env.IMGSORTER_DB_PATH;
    else process.env.IMGSORTER_DB_PATH = previous;
    closeReadConnections();
    rmSync(dir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
