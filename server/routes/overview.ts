import { createServerFn } from '@tanstack/react-start';

export const getOverviewData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getOverviewStats } = await import('../lib/queries');
  return getOverviewStats();
});
