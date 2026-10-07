import '@tanstack/react-start/server-only';
import { normalizeDirectoryPath } from '../../app/lib/directory-path';
import { appConfigStore } from './app-config';

export function enabledRoots(): string[] {
  return appConfigStore
    .get()
    .directories.indexed.filter((entry) => entry.enabled)
    .map((entry) => normalizeDirectoryPath(entry.path));
}

export function isWithinRoots(path: string, roots: string[]): boolean {
  const target = normalizeDirectoryPath(path).toLowerCase();
  return roots.some((root) => {
    const scope = normalizeDirectoryPath(root).toLowerCase();
    return target === scope || target.startsWith(`${scope}/`);
  });
}

export function scopeEntries<T extends { directory: string }>(rows: T[], roots: string[]): T[] {
  return rows.filter((row) => isWithinRoots(row.directory, roots));
}
