import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { closeReadConnections, readDbPath, withRead } from './db';

const ENTRIES_DDL = `
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
`;

describe('read connection cache', () => {
  const dirs: string[] = [];
  const initialPath = process.env.IMGSORTER_DB_PATH;

  function tempPath(name = 'read.db'): string {
    const dir = mkdtempSync(join(tmpdir(), 'imgsorter-db-'));
    dirs.push(dir);
    return join(dir, name);
  }

  function createDb(path: string): void {
    const db = new Database(path);
    db.exec(ENTRIES_DDL);
    db.close();
  }

  function captureConnection(): DatabaseType {
    const db = withRead((conn) => conn);
    if (!db) throw new Error('expected a cached connection');
    return db;
  }

  afterEach(() => {
    closeReadConnections();
    if (initialPath === undefined) delete process.env.IMGSORTER_DB_PATH;
    else process.env.IMGSORTER_DB_PATH = initialPath;
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns null when the database file is missing', () => {
    process.env.IMGSORTER_DB_PATH = join(tempPath(), 'missing.db');

    const result = withRead((db) => db.prepare('SELECT 1').get());

    expect(result).toBeNull();
  });

  it('reuses the same connection object for the same path', () => {
    const path = tempPath();
    createDb(path);
    process.env.IMGSORTER_DB_PATH = path;

    const first = captureConnection();
    const second = captureConnection();

    expect(second).toBe(first);
  });

  it('opens a new connection after closeReadConnections', () => {
    const path = tempPath();
    createDb(path);
    process.env.IMGSORTER_DB_PATH = path;

    const first = captureConnection();
    closeReadConnections();
    const second = captureConnection();

    expect(second).not.toBe(first);
    expect(first.open).toBe(false);
    expect(second.open).toBe(true);
  });

  it('does not share connections across paths', () => {
    const firstPath = tempPath('first.db');
    const secondPath = tempPath('second.db');
    createDb(firstPath);
    createDb(secondPath);

    process.env.IMGSORTER_DB_PATH = firstPath;
    const first = captureConnection();
    process.env.IMGSORTER_DB_PATH = secondPath;
    const second = captureConnection();

    expect(readDbPath()).toBe(secondPath);
    expect(second).not.toBe(first);
  });

  it('applies query_only and sees committed writes', () => {
    const path = tempPath();
    createDb(path);
    process.env.IMGSORTER_DB_PATH = path;

    const reader = captureConnection();

    expect(reader.pragma('query_only', { simple: true })).toBe(1);
    expect(reader.pragma('mmap_size', { simple: true })).toBe(268435456);
    expect(reader.pragma('cache_size', { simple: true })).toBe(-65536);
    expect(() =>
      reader
        .prepare(
          `INSERT INTO entries (size, directory, extension, filename, birthtime, hash, path)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(10, 'C:\\Media', '.jpg', 'a.jpg', '2025-01-01T00:00:00Z', 'abc', 'C:\\Media\\a.jpg'),
    ).toThrow();

    const writer = new Database(path);
    writer
      .prepare(
        `INSERT INTO entries (size, directory, extension, filename, birthtime, hash, path)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(20, 'C:\\Media', '.png', 'b.png', '2025-01-02T00:00:00Z', 'def', 'C:\\Media\\b.png');
    writer.close();

    const row = reader.prepare('SELECT filename FROM entries').get() as { filename: string };
    expect(row.filename).toBe('b.png');
  });
});
