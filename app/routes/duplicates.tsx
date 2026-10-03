import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { DuplicatesPage } from '../features/duplicates/DuplicatesPage';
import { useFilterSearchParams } from '../lib/filter-sync';
import { getDuplicatesData } from '../../server/routes/duplicates';

export const Route = createFileRoute('/duplicates')({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === 'string' ? search.query : undefined,
    dir: typeof search.dir === 'string' ? search.dir : undefined,
    ext: typeof search.ext === 'string' ? search.ext : undefined,
  }),
  loader: async () => getDuplicatesData(),
  component: DuplicatesRoute,
});

function DuplicatesRoute() {
  useFilterSearchParams();
  const { groups, keepers, staleKeepers } = useLoaderData({ from: '/duplicates' });
  return <DuplicatesPage groups={groups} initialKeepers={keepers} initialStaleKeepers={staleKeepers} />;
}
