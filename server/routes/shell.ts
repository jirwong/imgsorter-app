import { createServerFn } from '@tanstack/react-start';

export const getShellData = createServerFn({ method: 'GET' }).handler(async () => {
  const { getShellData: loadShell } = await import('../lib/queries');
  return loadShell();
});
