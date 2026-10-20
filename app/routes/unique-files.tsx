import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { DEFAULT_FILES_QUERY, FilesPage } from '../features/files/FilesPage';
import { getFilesPage } from '../../server/routes/files';
import { getHiddenFiles } from '../../server/routes/hidden';

export const Route = createFileRoute('/unique-files')({
  loader: async () => {
    const [initial, { hidden }] = await Promise.all([getFilesPage({ data: DEFAULT_FILES_QUERY }), getHiddenFiles()]);
    return { initial, hidden };
  },
  component: UniqueFilesRoute,
});

function UniqueFilesRoute() {
  const { initial, hidden } = useLoaderData({ from: '/unique-files' });
  return <FilesPage initial={initial} hidden={hidden} />;
}
