import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { PreferencesPage } from '../features/preferences/PreferencesPage';
import { getPreferencesData } from '../../server/routes/preferences';

export const Route = createFileRoute('/preferences')({
  loader: async () => getPreferencesData(),
  component: PreferencesRoute,
});

function PreferencesRoute() {
  const { config, counts } = useLoaderData({ from: '/preferences' });
  return <PreferencesPage config={config} counts={counts} />;
}
