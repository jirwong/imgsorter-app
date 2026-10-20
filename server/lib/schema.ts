import '@tanstack/react-start/server-only';
import type { Database } from 'better-sqlite3';

const ADD_DIRECTORY_NORM = `ALTER TABLE entries ADD COLUMN directory_norm TEXT
  GENERATED ALWAYS AS (lower(replace(directory, '\\', '/'))) VIRTUAL`;

const CREATE_READ_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_entries_dir_norm ON entries(directory_norm);
  CREATE INDEX IF NOT EXISTS idx_entries_hash_filename ON entries(hash, filename);
  CREATE INDEX IF NOT EXISTS idx_entries_hash_filename_dir_norm ON entries(hash, filename, directory_norm);
  CREATE INDEX IF NOT EXISTS idx_entries_path_norm ON entries(lower(replace(path, '\\', '/')));
`;

type TableInfoRow = { name: string };

export class ReadSchemaMissingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReadSchemaMissingError';
  }
}

export function ensureReadSchema(db: Database): void {
  try {
    const columns = db.prepare('PRAGMA table_xinfo(entries)').all() as TableInfoRow[];
    if (columns.length === 0) return;
    if (!columns.some((column) => column.name === 'directory_norm')) {
      db.exec(ADD_DIRECTORY_NORM);
    }
    db.exec(CREATE_READ_INDEXES);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ReadSchemaMissingError(`Cannot apply the read schema: ${detail}`, { cause });
  }
}
