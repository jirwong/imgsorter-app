import { createServerFn } from '@tanstack/react-start';
import type { ApplicationConfig, DirectoriesConfig } from '../../app/lib/types';

export const getPreferencesData = createServerFn({ method: 'GET' }).handler(async () => {
  const { appConfigStore } = await import('../lib/app-config');
  const { getPreferencesCounts } = await import('../lib/queries');
  const config = appConfigStore.get();
  const counts = getPreferencesCounts(config.directories.indexed.map((entry) => entry.path));
  return { config, counts };
});

export const saveApplicationSettings = createServerFn({ method: 'POST' })
  .validator((input: ApplicationConfig) => input)
  .handler(async ({ data }) => {
    const { appConfigStore } = await import('../lib/app-config');
    return appConfigStore.saveApplication(data);
  });

export const saveDirectories = createServerFn({ method: 'POST' })
  .validator((input: DirectoriesConfig) => input)
  .handler(async ({ data }) => {
    const { appConfigStore } = await import('../lib/app-config');
    return appConfigStore.saveDirectories(data);
  });

export const setPreviewsEnabled = createServerFn({ method: 'POST' })
  .validator((input: { enabled: boolean }) => input)
  .handler(async ({ data }) => {
    const { appConfigStore } = await import('../lib/app-config');
    const config = appConfigStore.get();
    const saved = appConfigStore.saveApplication({ ...config.application, generatePreviews: data.enabled });
    return { enabled: saved.application.generatePreviews };
  });
