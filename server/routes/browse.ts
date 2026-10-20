import { createServerFn } from '@tanstack/react-start';
import type { FilesInput, FilesQuery } from '../../app/lib/types';

function toFilesQuery(input: FilesQuery | FilesInput): FilesQuery {
  if ('hiddenMode' in input) return input;
  return {
    query: input.query,
    selectedDirs: input.dir === 'All directories' ? input.selectedDirs : [...input.selectedDirs, input.dir],
    extensions: input.ext === 'All types' ? [] : [input.ext],
    sizeFilter: 'all',
    hiddenMode: 'active',
    page: 1,
    pageSize: 100,
    sortKey: 'location',
    direction: 'asc',
  };
}

export const getBrowseData = createServerFn({ method: 'POST' })
  .validator((input: FilesQuery | FilesInput) => input)
  .handler(async ({ data }) => {
    const { listFilesPage } = await import('../lib/queries');
    const { enabledRoots } = await import('../lib/directory-scope');
    const { hiddenService } = await import('../lib/hidden');
    const { getDirectoryIndex } = await import('../lib/directory-index');
    return { ...listFilesPage(toFilesQuery(data), enabledRoots(), hiddenService.get()), tree: getDirectoryIndex() };
  });
