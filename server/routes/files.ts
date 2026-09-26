import { createServerFn } from '@tanstack/react-start';
import type { FilesInput } from '../../app/lib/types';

export const getFilteredEntries = createServerFn({ method: 'POST' })
  .validator((input: FilesInput) => input)
  .handler(async ({ data }) => {
    const { listEntries } = await import('../lib/queries');
    return { files: listEntries(data) };
  });
