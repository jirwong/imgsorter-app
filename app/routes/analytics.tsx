import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { AnalyticsPage } from '../features/analytics/AnalyticsPage';
import { getAnalyticsData } from '../../server/routes/analytics';

export const Route = createFileRoute('/analytics')({
  loader: async () => getAnalyticsData(),
  component: AnalyticsRoute,
});

function AnalyticsRoute() {
  const data = useLoaderData({ from: '/analytics' });
  return <AnalyticsPage data={data} />;
}
