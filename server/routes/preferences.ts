import { createServerFn } from '@tanstack/react-start';
import type { ApplicationConfig, DirectoriesConfig } from '../../app/lib/types';

export const getAppConfig = createServerFn({ method: 'GET' }).handler(async () => {
  const { appConfigStore } = await import('../lib/app-config');
  return appConfigStore.get();
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
