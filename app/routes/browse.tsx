import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { BrowsePage } from '../features/browse/BrowsePage';
import { useSelectedDirsSearchParams } from '../lib/filter-sync';
import { getBrowseData } from '../../server/routes/browse';

function normalizeDirs(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === 'string');
}

export const Route = createFileRoute('/browse')({
  validateSearch: (search: Record<string, unknown>) => ({
    selectedDirs: normalizeDirs(search.selectedDirs),
  }),
  loaderDeps: ({ search }) => ({ selectedDirs: search.selectedDirs }),
  loader: async ({ deps }) =>
    getBrowseData({
      data: {
        query: '',
        dir: 'All directories',
        ext: 'All types',
        selectedDirs: deps.selectedDirs ?? [],
      },
    }),
  component: BrowseRoute,
});

function BrowseRoute() {
  useSelectedDirsSearchParams();
  const { files, tree } = useLoaderData({ from: '/browse' });
  return <BrowsePage files={files} tree={tree} />;
}
