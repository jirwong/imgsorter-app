import { createServerFn } from '@tanstack/react-start';

export const getOverviewData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getOverviewStats } = await import('../lib/queries');
  const { appConfigStore } = await import('../lib/app-config');
  return { data: getOverviewStats(), previewsEnabled: appConfigStore.get().application.generatePreviews };
});
