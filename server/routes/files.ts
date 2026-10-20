import { createServerFn } from '@tanstack/react-start';
import type { FilesInput, FilesQuery } from '../../app/lib/types';

export const getFilteredEntries = createServerFn({ method: 'POST' })
  .validator((input: FilesInput) => input)
  .handler(async ({ data }) => {
    const { listEntries } = await import('../lib/queries');
    const { enabledRoots } = await import('../lib/directory-scope');
    return { files: listEntries(data, enabledRoots()) };
  });

export const getFilesPage = createServerFn({ method: 'POST' })
  .validator((input: FilesQuery) => input)
  .handler(async ({ data }) => {
    const { listFilesPage } = await import('../lib/queries');
    const { enabledRoots } = await import('../lib/directory-scope');
    const { hiddenService } = await import('../lib/hidden');
    return listFilesPage(data, enabledRoots(), hiddenService.get());
  });
