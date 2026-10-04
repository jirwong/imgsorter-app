import { createServerFn } from '@tanstack/react-start';

export const getThumbnails = createServerFn({ method: 'POST' })
  .validator((input: { ids: number[] }) => input)
  .handler(async ({ data }) => {
    const { thumbnails } = await import('../lib/thumbnails');
    return thumbnails.getThumbnails(data.ids);
  });

export const clearThumbnailCache = createServerFn({ method: 'POST' }).handler(async () => {
  const { thumbnails } = await import('../lib/thumbnails');
  return { removed: thumbnails.clearCache() };
});
