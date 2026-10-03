import { createServerFn } from '@tanstack/react-start';

export const revealEntry = createServerFn({ method: 'POST' })
  .validator((input: { id: number }) => input)
  .handler(async ({ data }) => {
    const { nativeActions } = await import('../lib/native-actions');
    return nativeActions.reveal(data.id);
  });

export const openEntry = createServerFn({ method: 'POST' })
  .validator((input: { id: number }) => input)
  .handler(async ({ data }) => {
    const { nativeActions } = await import('../lib/native-actions');
    return nativeActions.open(data.id);
  });

export const pickDirectory = createServerFn({ method: 'GET' }).handler(async () => {
  const { nativeActions } = await import('../lib/native-actions');
  return nativeActions.pickDirectory();
});
