import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { isWithinRoots } from './directory-scope';
import { scopeClause, subtreeClause } from './scope-sql';

const GROUP_SQL = '(directory_norm = lower(?) OR (directory_norm >= lower(?) AND directory_norm < lower(?)))';

const DIRECTORIES = [
  'C:\\Media',
  'C:\\Media\\2025',
  'c:/media/2025',
  'C:/Media2',
  'D:\\Photos',
  'G:\\a.jpg',
  'g2:\\a.jpg',
];

function openDb(directories: string[]): DatabaseType {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      directory TEXT NOT NULL,
      path TEXT NOT NULL,
      directory_norm TEXT GENERATED ALWAYS AS (lower(replace(directory, '\\', '/'))) VIRTUAL
    );
  `);
  const insert = db.prepare('INSERT INTO entries (directory, path) VALUES (?, ?)');
  for (const directory of directories) {
    insert.run(directory, `${directory}\\file.jpg`);
  }
  return db;
}

describe('subtreeClause', () => {
  it('emits one three-parameter group for a normalized root', () => {
    expect(subtreeClause('C:\\Media\\')).toEqual({
      sql: GROUP_SQL,
      params: ['C:/Media', 'C:/Media/', 'C:/Media0'],
    });
  });
});

describe('scopeClause', () => {
  it('matches nothing for an empty root list', () => {
    expect(scopeClause([])).toEqual({ sql: '0', params: [] });
  });

  it('emits one group for a single root', () => {
    expect(scopeClause(['c:/media'])).toEqual({
      sql: GROUP_SQL,
      params: ['c:/media', 'c:/media/', 'c:/media0'],
    });
  });

  it('normalizes separators and trailing slashes', () => {
    expect(scopeClause(['C:\\Media\\'])).toEqual(scopeClause(['C:/Media']));
  });

  it('joins multiple groups in parentheses', () => {
    expect(scopeClause(['C:/Media', 'D:\\Photos\\2025'])).toEqual({
      sql: `(${GROUP_SQL} OR ${GROUP_SQL})`,
      params: ['C:/Media', 'C:/Media/', 'C:/Media0', 'D:/Photos/2025', 'D:/Photos/2025/', 'D:/Photos/20250'],
    });
  });
});

describe('scopeClause against SQLite', () => {
  function matched(directories: string[], roots: string[]): string[] {
    const db = openDb(directories);
    try {
      const clause = scopeClause(roots);
      const rows = db
        .prepare(`SELECT directory FROM entries WHERE ${clause.sql} ORDER BY directory`)
        .all(...clause.params) as { directory: string }[];
      return rows.map((row) => row.directory);
    } finally {
      db.close();
    }
  }

  it('selects the same directories as isWithinRoots', () => {
    const roots = ['C:/Media', 'G:'];
    const expected = DIRECTORIES.filter((directory) => isWithinRoots(`${directory}/file.jpg`, roots)).sort();
    expect(matched(DIRECTORIES, roots)).toEqual(expected);
    expect(expected).toEqual(['C:\\Media', 'C:\\Media\\2025', 'G:\\a.jpg', 'c:/media/2025']);
  });

  it('matches a G: file without matching a G2: file', () => {
    expect(matched(DIRECTORIES, ['G:'])).toEqual(['G:\\a.jpg']);
  });

  it('matches a mixed-case backslash path in a subtree', () => {
    expect(matched(DIRECTORIES, ['c:/media/2025'])).toEqual(['C:\\Media\\2025', 'c:/media/2025']);
  });

  it('matches an accented root and its subtree with consistent non-ASCII casing', () => {
    const directories = ['C:\\Photos\\Été', 'C:\\Photos\\Été\\Sub', 'C:\\Photos\\Été2'];
    expect(matched(directories, ['C:/Photos/Été'])).toEqual(['C:\\Photos\\Été', 'C:\\Photos\\Été\\Sub']);
  });

  it('matches nothing when no roots are enabled', () => {
    expect(matched(DIRECTORIES, [])).toEqual([]);
  });
});
