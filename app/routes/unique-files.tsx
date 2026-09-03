import { createFileRoute } from '@tanstack/react-router';
import { FilesPage } from '../features/files/FilesPage';
import { useFilterSearchParams } from '../lib/filter-sync';

export const Route = createFileRoute('/unique-files')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === 'string' ? search.query : undefined,
    dir: typeof search.dir === 'string' ? search.dir : undefined,
    ext: typeof search.ext === 'string' ? search.ext : undefined,
  }),
  component: UniqueFilesRoute,
});

function UniqueFilesRoute() {
  useFilterSearchParams();
  return <FilesPage />;
}
