import { createServerFn } from '@tanstack/react-start';

export const getAnalyticsData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getAnalyticsData: loadAnalytics } = await import('../lib/queries');
  const { enabledRoots } = await import('../lib/directory-scope');
  return loadAnalytics(enabledRoots());
});
