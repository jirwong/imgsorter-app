import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { BrowsePage, DEFAULT_BROWSE_QUERY } from '../features/browse/BrowsePage';
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
  loader: async ({ deps }) => {
    const selectedDirs = deps.selectedDirs ?? [];
    const initial = await getBrowseData({ data: { ...DEFAULT_BROWSE_QUERY, selectedDirs } });
    return { initial, selectedDirs };
  },
  component: BrowseRoute,
});

function BrowseRoute() {
  useSelectedDirsSearchParams();
  const { initial, selectedDirs } = useLoaderData({ from: '/browse' });
  return <BrowsePage initial={initial} selectedDirs={selectedDirs} />;
}
