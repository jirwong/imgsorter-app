import { createServerFn } from '@tanstack/react-start';

export const resetLibraryIndex = createServerFn({ method: 'POST' }).handler(async () => {
  const { resetService } = await import('../lib/reset');
  return resetService.reset();
});
