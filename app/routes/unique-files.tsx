import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { FilesPage } from '../features/files/FilesPage';
import { useFilterSearchParams } from '../lib/filter-sync';
import { getFilteredEntries } from '../../server/routes/files';

export const Route = createFileRoute('/unique-files')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === 'string' ? search.query : undefined,
    dir: typeof search.dir === 'string' ? search.dir : undefined,
    ext: typeof search.ext === 'string' ? search.ext : undefined,
  }),
  loaderDeps: ({ search }) => ({ query: search.query, dir: search.dir, ext: search.ext }),
  loader: async ({ deps }) =>
    getFilteredEntries({
      data: {
        query: deps.query ?? '',
        dir: deps.dir ?? 'All directories',
        ext: deps.ext ?? 'All types',
        selectedDirs: [],
      },
    }),
  component: UniqueFilesRoute,
});

function UniqueFilesRoute() {
  useFilterSearchParams();
  const { files } = useLoaderData({ from: '/unique-files' });
  return <FilesPage files={files} />;
}
