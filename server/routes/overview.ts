import { createServerFn } from '@tanstack/react-start';

export const getOverviewData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getOverviewStats } = await import('../lib/queries');
  const { enabledRoots } = await import('../lib/directory-scope');
  const { appConfigStore } = await import('../lib/app-config');
  return { data: getOverviewStats(enabledRoots()), previewsEnabled: appConfigStore.get().application.generatePreviews };
});
