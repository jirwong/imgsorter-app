import { createServerFn } from '@tanstack/react-start';
import type { ApplicationConfig, DirectoriesConfig } from '../../app/lib/types';

export const getPreferencesData = createServerFn({ method: 'GET' }).handler(async () => {
  const { appConfigStore } = await import('../lib/app-config');
  const { countEntriesByDirectory } = await import('../lib/queries');
  const { enabledRoots } = await import('../lib/directory-scope');
  const config = appConfigStore.get();
  const roots = enabledRoots();
  const counts: Record<string, number> = {};
  for (const entry of config.directories.indexed) {
    counts[entry.path] = countEntriesByDirectory(entry.path, roots);
  }
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
