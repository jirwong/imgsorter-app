import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { FilesPage } from '../features/files/FilesPage';
import { getFilteredEntries } from '../../server/routes/files';
import { getHiddenFiles } from '../../server/routes/hidden';

export const Route = createFileRoute('/unique-files')({
  loader: async () => {
    const [{ files }, { hidden }] = await Promise.all([
      getFilteredEntries({
        data: {
          query: '',
          dir: 'All directories',
          ext: 'All types',
          selectedDirs: [],
        },
      }),
      getHiddenFiles(),
    ]);
    return { files, hidden };
  },
  component: UniqueFilesRoute,
});

function UniqueFilesRoute() {
  const { files, hidden } = useLoaderData({ from: '/unique-files' });
  return <FilesPage files={files} hidden={hidden} />;
}
