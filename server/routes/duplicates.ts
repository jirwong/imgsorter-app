import { createServerFn } from '@tanstack/react-start';

export const getDuplicateGroups = createServerFn({ method: 'GET' }).handler(async () => {
  const { getDuplicateGroups: load } = await import('../lib/queries');
  return load();
});
