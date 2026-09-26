import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { BrowsePage } from '../features/browse/BrowsePage';
import { useFilterSearchParams, useSelectedDirsSearchParams } from '../lib/filter-sync';
import { getBrowseData } from '../../server/routes/browse';

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
  loaderDeps: ({ search }) => ({
    query: search.query,
    dir: search.dir,
    ext: search.ext,
    selectedDirs: search.selectedDirs,
  }),
  loader: async ({ deps }) =>
    getBrowseData({
      data: {
        query: deps.query ?? '',
        dir: deps.dir ?? 'All directories',
        ext: deps.ext ?? 'All types',
        selectedDirs: deps.selectedDirs ?? [],
      },
    }),
  component: BrowseRoute,
});

function BrowseRoute() {
  useFilterSearchParams();
  useSelectedDirsSearchParams();
  const { files, tree } = useLoaderData({ from: '/browse' });
  return <BrowsePage files={files} tree={tree} />;
}
