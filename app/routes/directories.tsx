import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { DirectoriesPage } from '../features/directories/DirectoriesPage';
import { getDirectoriesData } from '../../server/routes/directories';

export const Route = createFileRoute('/directories')({
  loader: async () => getDirectoriesData(),
  component: DirectoriesRoute,
});

function DirectoriesRoute() {
  const { tree } = useLoaderData({ from: '/directories' });
  return <DirectoriesPage tree={tree} />;
}
