import '@tanstack/react-start/server-only';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { sampleDbPath } from './db-path';
import { ensureReadSchema } from './schema';

const connections = new Map<string, DatabaseType>();

export function readDbPath(): string {
  return resolve(process.env.IMGSORTER_DB_PATH ?? sampleDbPath());
}

export function withRead<T>(fn: (db: DatabaseType) => T): T | null {
  const path = readDbPath();
  if (!existsSync(path)) return null;
  let db = connections.get(path);
  if (!db) {
    db = openReadConnection(path);
    connections.set(path, db);
  }
  return fn(db);
}

export function closeReadConnections(): void {
  for (const db of connections.values()) {
    db.close();
  }
  connections.clear();
}

function openReadConnection(path: string): DatabaseType {
  const setup = new Database(path);
  try {
    ensureReadSchema(setup);
  } finally {
    setup.close();
  }
  const db = new Database(path, { readonly: true });
  db.pragma('query_only = ON');
  db.pragma('mmap_size = 268435456');
  db.pragma('cache_size = -65536');
  return db;
}
