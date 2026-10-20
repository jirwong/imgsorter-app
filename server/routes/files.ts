import { createServerFn } from '@tanstack/react-start';
import type { FilesQuery } from '../../app/lib/types';

export const getFilesPage = createServerFn({ method: 'POST' })
  .validator((input: FilesQuery) => input)
  .handler(async ({ data }) => {
    const { listFilesPage } = await import('../lib/queries');
    const { enabledRoots } = await import('../lib/directory-scope');
    const { hiddenService } = await import('../lib/hidden');
    return listFilesPage(data, enabledRoots(), hiddenService.get());
  });
