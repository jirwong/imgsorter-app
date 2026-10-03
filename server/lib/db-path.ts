import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const serverDir = dirname(dirname(fileURLToPath(import.meta.url)));

export function sampleDbPath(): string {
  return join(serverDir, 'data', 'imgsorter.db');
}

export function fixtureDbPath(): string {
  return join(serverDir, 'data', 'fixture.db');
}

export function appConfigDbPath(): string {
  return join(serverDir, 'data', 'app-config.db');
}

export function fixturesDir(): string {
  return join(serverDir, '.fixtures');
}

export function virtualToReal(virtualPath: string): string {
  const prefix = '@fixtures';
  if (!virtualPath.startsWith(prefix)) {
    throw new Error(`Not a fixture virtual path: ${virtualPath}`);
  }
  const relative = virtualPath.slice(prefix.length).replace(/^[\\/]+/, '');
  return resolve(fixturesDir(), relative);
}
