import { createServerFn } from '@tanstack/react-start';

export const getHiddenFiles = createServerFn({ method: 'GET' }).handler(async () => {
  const { hiddenService } = await import('../lib/hidden');
  return { hidden: hiddenService.get() };
});

export const hideFile = createServerFn({ method: 'POST' })
  .validator((input: { path: string }) => input)
  .handler(async ({ data }) => {
    const { hiddenService } = await import('../lib/hidden');
    return { hidden: hiddenService.hide(data.path) };
  });

export const unhideFile = createServerFn({ method: 'POST' })
  .validator((input: { path: string }) => input)
  .handler(async ({ data }) => {
    const { hiddenService } = await import('../lib/hidden');
    return { hidden: hiddenService.unhide(data.path) };
  });

export const clearHidden = createServerFn({ method: 'POST' }).handler(async () => {
  const { hiddenService } = await import('../lib/hidden');
  return { hidden: hiddenService.clear() };
});
