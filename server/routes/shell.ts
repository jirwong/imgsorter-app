import { createServerFn } from '@tanstack/react-start';

export const getShellData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getShellData: loadShell } = await import('../lib/queries');
  const { appConfigStore } = await import('../lib/app-config');
  return { ...loadShell(), lastScan: appConfigStore.getLastScan() };
});
