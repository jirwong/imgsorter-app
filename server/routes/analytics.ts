import { createServerFn } from '@tanstack/react-start';

export const getAnalyticsData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getAnalyticsData: loadAnalytics } = await import('../lib/queries');
  return loadAnalytics();
});
