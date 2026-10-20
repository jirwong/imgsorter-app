import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureReadSchema, ReadSchemaMissingError } from './schema';

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
  CREATE INDEX idx_entries_filename ON entries (filename);
`;

function columns(db: DatabaseType): { name: string }[] {
  return db.prepare('PRAGMA table_xinfo(entries)').all() as { name: string }[];
}

function indexNames(db: DatabaseType): string[] {
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entries'`).all() as {
    name: string;
  }[];
  return rows.map((row) => row.name);
}

describe('ensureReadSchema', () => {
  const dirs: string[] = [];
  const connections: DatabaseType[] = [];

  function tempDb(): string {
    const dir = mkdtempSync(join(tmpdir(), 'imgsorter-schema-'));
    dirs.push(dir);
    return join(dir, 'read.db');
  }

  function open(path: string, options?: Database.Options): DatabaseType {
    const db = new Database(path, options);
    connections.push(db);
    return db;
  }

  afterEach(() => {
    for (const db of connections.splice(0)) {
      if (db.open) db.close();
    }
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds the normalized directory column and indexes', () => {
    const path = tempDb();
    const db = open(path);
    db.exec(ENTRIES_DDL);
    db.prepare(
      `INSERT INTO entries (size, directory, extension, filename, birthtime, hash, path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(10, 'C:\\Media\\Photos', '.jpg', 'a.jpg', '2025-01-01T00:00:00Z', 'abc', 'C:\\Media\\Photos\\a.jpg');

    ensureReadSchema(db);

    expect(columns(db).map((c) => c.name)).toContain('directory_norm');
    expect(indexNames(db)).toEqual(
      expect.arrayContaining(['idx_entries_dir_norm', 'idx_entries_hash_filename', 'idx_entries_path_norm']),
    );
    expect(() => ensureReadSchema(db)).not.toThrow();
    expect(columns(db).filter((c) => c.name === 'directory_norm')).toHaveLength(1);

    const row = db.prepare('SELECT directory_norm FROM entries').get() as { directory_norm: string };
    expect(row.directory_norm).toBe('c:/media/photos');
  });

  it('throws ReadSchemaMissingError when a read-only database cannot be migrated', () => {
    const path = tempDb();
    const writer = open(path);
    writer.exec(ENTRIES_DDL);
    writer.close();

    const readonly = open(path, { readonly: true });

    expect(() => ensureReadSchema(readonly)).toThrow(ReadSchemaMissingError);
  });

  it('does nothing when the entries table does not exist', () => {
    const path = tempDb();
    const db = open(path);

    expect(() => ensureReadSchema(db)).not.toThrow();
    expect(columns(db)).toHaveLength(0);
  });
});
