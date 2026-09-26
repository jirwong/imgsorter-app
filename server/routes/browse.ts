import { createServerFn } from '@tanstack/react-start';
import type { FilesInput } from '../../app/lib/types';

export const getBrowseData = createServerFn({ method: 'POST' })
  .validator((input: FilesInput) => input)
  .handler(async ({ data }) => {
    const { listEntries, getDirectoryTree } = await import('../lib/queries');
    return { files: listEntries(data), tree: getDirectoryTree() };
  });
