import { createFileRoute } from '@tanstack/react-router';
import { DuplicatesPage } from '../features/duplicates/DuplicatesPage';
import { useFilterSearchParams } from '../lib/filter-sync';

export const Route = createFileRoute('/duplicates')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === 'string' ? search.query : undefined,
    dir: typeof search.dir === 'string' ? search.dir : undefined,
    ext: typeof search.ext === 'string' ? search.ext : undefined,
  }),
  component: DuplicatesRoute,
});

function DuplicatesRoute() {
  useFilterSearchParams();
  return <DuplicatesPage />;
}
