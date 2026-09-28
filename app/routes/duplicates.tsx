import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { DuplicatesPage } from '../features/duplicates/DuplicatesPage';
import { useFilterSearchParams } from '../lib/filter-sync';
import { getDuplicateGroups } from '../../server/routes/duplicates';

export const Route = createFileRoute('/duplicates')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === 'string' ? search.query : undefined,
    dir: typeof search.dir === 'string' ? search.dir : undefined,
    ext: typeof search.ext === 'string' ? search.ext : undefined,
  }),
  loader: async () => getDuplicateGroups(),
  component: DuplicatesRoute,
});

function DuplicatesRoute() {
  useFilterSearchParams();
  const groups = useLoaderData({ from: '/duplicates' });
  return <DuplicatesPage groups={groups} />;
}
