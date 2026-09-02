import type { Entry } from './types';

export type GlobalFilters = {
  query: string;
  dir: string;
  ext: string;
  selectedDirs: string[];
};

export function applyFilters(input: Entry[], query: string, dir: string, ext: string, selectedDirs: string[]): Entry[] {
  const q = query.trim().toLowerCase();
  return input.filter((entry) => {
    const matchesQuery = !q || entry.filename.toLowerCase().includes(q) || entry.path.toLowerCase().includes(q);
    const matchesDir = dir === 'All directories' || entry.directory === dir;
    const matchesExt = ext === 'All types' || entry.extension === ext;
    const matchesSelectedDirs =
      selectedDirs.length === 0 ||
      selectedDirs.some((scope) => entry.directory === scope || entry.directory.startsWith(`${scope}/`));
    return matchesQuery && matchesDir && matchesExt && matchesSelectedDirs;
  });
}
