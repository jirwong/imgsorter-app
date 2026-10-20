import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { DEFAULT_DUPLICATES_QUERY, DuplicatesPage } from '../features/duplicates/DuplicatesPage';
import { getDuplicatesData } from '../../server/routes/duplicates';
import { getHiddenFiles } from '../../server/routes/hidden';

export const Route = createFileRoute('/duplicates')({
  loader: async () => {
    const [initial, { hidden }] = await Promise.all([
      getDuplicatesData({ data: DEFAULT_DUPLICATES_QUERY }),
      getHiddenFiles(),
    ]);
    return { initial, hidden };
  },
  component: DuplicatesRoute,
});

function DuplicatesRoute() {
  const { initial, hidden } = useLoaderData({ from: '/duplicates' });
  return <DuplicatesPage initial={initial} hidden={hidden} />;
}
