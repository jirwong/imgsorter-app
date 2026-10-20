import { createServerFn } from '@tanstack/react-start';
import type { AnalyticsQuery, AnalyticsResult } from '../../app/lib/types';

export const getAnalyticsData = createServerFn({ method: 'POST' })
  .validator((input: AnalyticsQuery) => input)
  .handler(async ({ data }): Promise<AnalyticsResult> => {
    const { getAnalyticsPage } = await import('../lib/queries');
    const { enabledRoots } = await import('../lib/directory-scope');
    return getAnalyticsPage(data, enabledRoots());
  });
