import { createFileRoute } from '@tanstack/react-router';
import { BrowsePage } from '../features/browse/BrowsePage';
import { useFilterSearchParams, useSelectedDirsSearchParams } from '../lib/filter-sync';

function normalizeDirs(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === 'string');
}

export const Route = createFileRoute('/browse')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === 'string' ? search.query : undefined,
    dir: typeof search.dir === 'string' ? search.dir : undefined,
    ext: typeof search.ext === 'string' ? search.ext : undefined,
    selectedDirs: normalizeDirs(search.selectedDirs),
  }),
  component: BrowseRoute,
});

function BrowseRoute() {
  useFilterSearchParams();
  useSelectedDirsSearchParams();
  return <BrowsePage />;
}
