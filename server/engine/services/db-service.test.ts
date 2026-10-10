import { describe, expect, it } from 'vitest';
import { DbService } from './db-service';
import type { FileEntry } from '../types/file-types';

const file = (directory: string, filename: string): FileEntry => ({
  size: 10,
  directory,
  extension: '.jpg',
  filename,
  birthtime: new Date('2025-01-01T00:00:00Z'),
  hash: 'h',
  path: `${directory}\\${filename}`,
});

describe('getFileEntriesByDirectory', () => {
  it('matches stored backslash directories when the query uses forward slashes', () => {
    const db = new DbService(':memory:');
    db.insertFileEntries([file('C:\\Users\\jirwo\\Pictures\\Luminar Neo Catalog', 'a.jpg')]);
    const rows = db.getFileEntriesByDirectory('C:/Users/jirwo/Pictures');
    expect(rows.map((row) => row.filename)).toEqual(['a.jpg']);
    db.close();
  });

  it('matches the directory itself and ignores case', () => {
    const db = new DbService(':memory:');
    db.insertFileEntries([file('C:\\Users\\jirwo\\Pictures', 'a.jpg')]);
    const rows = db.getFileEntriesByDirectory('c:/users/jirwo/pictures');
    expect(rows.map((row) => row.filename)).toEqual(['a.jpg']);
    db.close();
  });

  it('matches nested directories beneath the root', () => {
    const db = new DbService(':memory:');
    db.insertFileEntries([file('C:\\Users\\jirwo\\Pictures\\Sub\\Deep', 'c.jpg')]);
    const rows = db.getFileEntriesByDirectory('C:/Users/jirwo/Pictures');
    expect(rows.map((row) => row.filename)).toEqual(['c.jpg']);
    db.close();
  });

  it('does not match a sibling directory with the same prefix', () => {
    const db = new DbService(':memory:');
    db.insertFileEntries([file('C:\\Users\\jirwo\\Pictures2', 'b.jpg')]);
    const rows = db.getFileEntriesByDirectory('C:/Users/jirwo/Pictures');
    expect(rows).toEqual([]);
    db.close();
  });

  it('treats wildcard characters in the directory as literal text', () => {
    const db = new DbService(':memory:');
    db.insertFileEntries([
      file('C:\\Users\\jirwo\\Pictures\\100%_done', 'a.jpg'),
      file('C:\\Users\\jirwo\\Pictures\\100Xdone', 'b.jpg'),
    ]);
    const rows = db.getFileEntriesByDirectory('C:/Users/jirwo/Pictures/100%_done');
    expect(rows.map((row) => row.filename)).toEqual(['a.jpg']);
    db.close();
  });
});
