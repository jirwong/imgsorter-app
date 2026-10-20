import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { AnalyticsPage, DEFAULT_ANALYTICS_QUERY } from '../features/analytics/AnalyticsPage';
import { getAnalyticsPage } from '../../server/routes/analytics';

export const Route = createFileRoute('/analytics')({
  loader: async () => getAnalyticsPage({ data: DEFAULT_ANALYTICS_QUERY }),
  component: AnalyticsRoute,
});

function AnalyticsRoute() {
  const initial = useLoaderData({ from: '/analytics' });
  return <AnalyticsPage initial={initial} />;
}
