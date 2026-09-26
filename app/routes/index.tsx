import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { OverviewPage } from '../features/overview/OverviewPage';
import { getOverviewData } from '../../server/routes/overview';

export const Route = createFileRoute('/')({
  loader: async () => getOverviewData(),
  component: IndexComponent,
});

function IndexComponent() {
  const data = useLoaderData({ from: '/' });
  return <OverviewPage data={data} />;
}
