import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { DuplicatesPage } from '../features/duplicates/DuplicatesPage';
import { getDuplicatesData } from '../../server/routes/duplicates';
import { getHiddenFiles } from '../../server/routes/hidden';

export const Route = createFileRoute('/duplicates')({
  loader: async () => {
    const [data, { hidden }] = await Promise.all([getDuplicatesData(), getHiddenFiles()]);
    return { ...data, hidden };
  },
  component: DuplicatesRoute,
});

function DuplicatesRoute() {
  const { groups, keepers, staleKeepers, hidden } = useLoaderData({ from: '/duplicates' });
  return <DuplicatesPage groups={groups} initialKeepers={keepers} initialStaleKeepers={staleKeepers} hidden={hidden} />;
}
