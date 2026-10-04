import { createServerFn } from '@tanstack/react-start';
import type { FilesInput } from '../../app/lib/types';

export const getBrowseData = createServerFn({ method: 'POST' })
  .validator((input: FilesInput) => input)
  .handler(async ({ data }) => {
    const { listEntries } = await import('../lib/queries');
    const { getDirectoryIndex } = await import('../lib/directory-index');
    return { files: listEntries(data), tree: getDirectoryIndex() };
  });
