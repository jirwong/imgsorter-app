import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { DuplicatesPage } from '../features/duplicates/DuplicatesPage';
import { getDuplicatesData } from '../../server/routes/duplicates';

export const Route = createFileRoute('/duplicates')({
  loader: async () => getDuplicatesData(),
  component: DuplicatesRoute,
});

function DuplicatesRoute() {
  const { groups, keepers, staleKeepers } = useLoaderData({ from: '/duplicates' });
  return <DuplicatesPage groups={groups} initialKeepers={keepers} initialStaleKeepers={staleKeepers} />;
}
